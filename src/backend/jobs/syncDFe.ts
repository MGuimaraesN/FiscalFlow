import { prisma } from '../prisma.ts';
import { consultarDistribuicao } from '../sefaz/distribuicao.ts';
import { extractFromPfx } from '../utils/cert.ts';
import { decryptString } from '../utils/crypto.ts';
import { decodeDocZip } from '../utils/parser.ts';
import { processXmlAndSave } from '../services/nfe.service.ts';

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

      if (cStat == 138) { // Documento localizado
        const maxNSU = String(response.maxNSU);
        ultNSU = String(response.ultNSU);
        
        let docZips = response.loteDistMDFe?.docZip;
        if (!docZips) {
           docZips = [];
        } else if (!Array.isArray(docZips)) {
           docZips = [docZips];
        }

        for (const doc of docZips) {
           const schema = doc['@_schema'];
           const nsu = doc['@_NSU'];
           const base64Content = doc['#text'];
           
           const xml = await decodeDocZip(base64Content);
           
           // We must extract chNFe / chMDFe. 
           let chNFe = '';
           if (schema.startsWith('resNFe') || schema.startsWith('resMDFe')) {
               const parsedRes = xml.match(/<chNFe>(.*?)<\/chNFe>/) || xml.match(/<chMDFe>(.*?)<\/chMDFe>/);
               if (parsedRes) chNFe = parsedRes[1];
           } else if (schema.startsWith('procNFe') || schema.startsWith('procMDFe')) {
               const parsedRes = xml.match(/Id="(?:NFe|MDFe)(.*?)"/);
               if (parsedRes) chNFe = parsedRes[1];
           } else if (schema.startsWith('resEvento')) {
               const parsedRes = xml.match(/<chNFe>(.*?)<\/chNFe>/) || xml.match(/<chMDFe>(.*?)<\/chMDFe>/);
               if (parsedRes) chNFe = parsedRes[1];
           }

           if (chNFe) {
             await processXmlAndSave(xml, company.id, chNFe, schema, nsu);
           }
        }
        
        await prisma.syncLog.create({
            data: { companyId: company.id, ultNSU, maxNSU, status: 'SUCCESS' }
        });

        if (ultNSU === maxNSU) {
            continueSync = false;
        }

      } else if (cStat == 137) { // Nenhum documento localizado
         await prisma.syncLog.create({
             data: { companyId: company.id, ultNSU, status: 'SUCCESS' }
         });
         continueSync = false;
      } else if (cStat == 656) { // Consumo indevido
         await prisma.syncLog.create({
             data: { companyId: company.id, ultNSU, status: 'ERROR', errorMessage: 'Rejeição: Consumo indevido. O SEFAZ bloqueou temporariamente as consultas. Aguarde 1 hora.' }
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