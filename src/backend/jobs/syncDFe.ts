import { prisma } from '../prisma.ts';
import { consultarDistribuicao } from '../sefaz/distribuicao.ts';
import { extractFromPfx } from '../utils/cert.ts';
import { decryptString } from '../utils/crypto.ts';
import { decodeDocZip } from '../utils/parser.ts';
import { processXmlAndSave } from '../services/nfe.service.ts';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

function extractXmlFromProc(proc: any): string | null {
  const clone = { ...proc };

  delete clone['@_schema'];
  delete clone['@_NSU'];

  const keys = Object.keys(clone).filter((key) => key !== '#text');

  if (keys.length === 0) {
    return null;
  }

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: false,
  });

  return builder.build(clone);
}

export async function syncDFeForCompany(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { certificate: true, syncLogs: { orderBy: { createdAt: 'desc' }, take: 1 } }
  });

  if (!company || !company.certificate) return;

  const certData = extractFromPfx(
    company.certificate.certBase64,
    decryptString(company.certificate.password)
  );

  const env = {
    uf: company.uf,
    environment: company.environment as 'HOMOLOGACAO' | 'PRODUCAO',
    certPem: certData.certPem,
    privateKeyPem: certData.privateKeyPem
  };

  let ultNSU = company.syncLogs.length > 0 ? company.syncLogs[0].ultNSU : '0';
  let continueSync = true;
  
  while (continueSync) {
    try {
      const response = await consultarDistribuicao(company.cnpj, '91', ultNSU, env); // 91 for Ambiente Nacional
      
      const cStat = response.cStat;
      
      if (!cStat) {
          throw new Error(`SEFAZ ERROR: Resposta inesperada - ${JSON.stringify(response)}`);
      }

      if (String(cStat) === '138') { // Documento localizado
        const previousUltNSU = String(ultNSU).padStart(15, '0');
        const novoUltNSU = String(response.ultNSU ?? ultNSU).padStart(15, '0');
        const maxNSU = String(response.maxNSU ?? novoUltNSU).padStart(15, '0');
        
        let docs = response.loteDistDFeInt?.docZip;
        if (!docs) docs = [];
        if (!Array.isArray(docs)) docs = [docs];

        for (const doc of docs) {
           const schema = doc['@_schema'] || '';
           const nsu = doc['@_NSU'] || '';
           const base64Content = doc['#text'];

           if (!base64Content) {
             console.warn(`[SEFAZ INFO] docZip sem conteúdo base64 NSU ${nsu}`);
             continue;
           }

           let xml = '';
           try {
             xml = await decodeDocZip(base64Content);
           } catch (e: any) {
             console.warn(`[SEFAZ INFO] Falha ao extrair XML do docZip NSU ${nsu}`);
             continue;
           }
           
           // We must extract chNFe / chMDFe. 
           let chNFe = '';
           if (schema.startsWith('resMDFe') || schema.startsWith('resNFe')) {
               const parsedRes = xml.match(/<chMDFe>(.*?)<\/chMDFe>/) || xml.match(/<chNFe>(.*?)<\/chNFe>/);
               if (parsedRes) chNFe = parsedRes[1];
           } else if (schema.startsWith('procMDFe') || schema.startsWith('procNFe')) {
               const parsedRes = xml.match(/Id="(?:MDFe|NFe)(.*?)"/);
               if (parsedRes) chNFe = parsedRes[1];
           } else if (schema.startsWith('resEvento')) {
               const parsedRes = xml.match(/<chMDFe>(.*?)<\/chMDFe>/) || xml.match(/<chNFe>(.*?)<\/chNFe>/);
               if (parsedRes) chNFe = parsedRes[1];
           } else if (schema.startsWith('procEventoMDFe')) {
               const parsedRes = xml.match(/<chMDFe>(.*?)<\/chMDFe>/);
               if (parsedRes) chNFe = parsedRes[1];
           }

           if (chNFe) {
             await processXmlAndSave(xml, company.id, chNFe, schema, nsu);
           }
        }
        
        await prisma.syncLog.create({
            data: { companyId: company.id, ultNSU: novoUltNSU, maxNSU: maxNSU, status: 'SUCCESS' }
        });

        if (novoUltNSU !== previousUltNSU) {
          ultNSU = novoUltNSU;
        }

        if (novoUltNSU === previousUltNSU || ultNSU === maxNSU) {
          continueSync = false;
        }

      } else if (String(cStat) === '137') { // Nenhum documento localizado
         await prisma.syncLog.create({
             data: { companyId: company.id, ultNSU, status: 'SUCCESS' }
         });
         continueSync = false;
      } else if (String(cStat) === '656' || String(cStat) === '678') { // Consumo indevido
         await prisma.syncLog.create({
             data: { companyId: company.id, ultNSU, status: 'ERROR', errorMessage: 'Rejeição: Consumo indevido. O SEFAZ bloqueou temporariamente as consultas. Aguarde.' }
         });
         continueSync = false;
      } else {
         throw new Error(`SEFAZ ERROR: ${cStat} - ${response.xMotivo}`);
      }

    } catch (error: any) {
        console.error('DFE Sync Error:', error);
        await prisma.syncLog.create({
            data: { companyId: company.id, ultNSU, status: 'ERROR', errorMessage: error.message }
        });
        continueSync = false;
    }
  }
}

export async function runAllSyncs() {
    const companies = await prisma.company.findMany();
    const now = new Date();
    for (const company of companies) {
        if (company.lastAutoSync && company.syncIntervalHours > 0) {
            const hoursSinceLastSync = (now.getTime() - company.lastAutoSync.getTime()) / (1000 * 60 * 60);
            if (hoursSinceLastSync < company.syncIntervalHours) {
                continue;
            }
        }
        await syncDFeForCompany(company.id);
        await prisma.company.update({
            where: { id: company.id },
            data: { lastAutoSync: new Date() }
        });
    }
}