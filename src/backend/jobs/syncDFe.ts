import { prisma } from '../prisma.ts';
import { consultarDistribuicao, DFeType } from '../sefaz/distribuicao.ts';
import { extractFromPfx } from '../utils/cert.ts';
import { decryptString } from '../utils/crypto.ts';
import { decodeDocZip } from '../utils/parser.ts';
import { processXmlAndSave } from '../services/nfe.service.ts';

const MAX_REQUESTS_PER_SYNC = Math.max(1, Number(process.env.MAX_DFE_SYNC_REQUESTS || 25));
const CONSUMO_INDEVIDO_COOLDOWN_MS = Math.max(60, Number(process.env.DFE_CONSUMO_INDEVIDO_COOLDOWN_MINUTES || 60)) * 60 * 1000;

function normalizeNSU(value: any): string {
  return String(value ?? '0').replace(/\D/g, '').padStart(15, '0');
}

function extractMenorNSUConsulta(xMotivo: any): string | null {
  const match = String(xMotivo || '').match(/MenorNSUConsulta:\s*(\d{1,15})/i);
  return match ? normalizeNSU(match[1]) : null;
}

function isRecentCooldownLog(log: any): boolean {
  if (!log?.createdAt) return false;

  const message = String(log.errorMessage || '').toLowerCase();
  const requiresCooldown =
    message.includes('consumo indevido') ||
    message.includes('cstat 656') ||
    message.includes('656') ||
    message.includes('nenhum documento localizado') ||
    message.includes('cstat 137') ||
    message.includes('137 -');

  if (!requiresCooldown) return false;

  const createdAt = new Date(log.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;

  return Date.now() - createdAt < CONSUMO_INDEVIDO_COOLDOWN_MS;
}

function getCooldownAvailableAt(log: any): Date {
  const createdAt = log?.createdAt ? new Date(log.createdAt).getTime() : Date.now();
  return new Date(createdAt + CONSUMO_INDEVIDO_COOLDOWN_MS);
}

function getEnabledDFeTypes(company: any): DFeType[] {
  const enabled: DFeType[] = [];

  if (company.syncNFe !== false) enabled.push('NFE');
  if (company.syncCTe === true) enabled.push('CTE');
  if (company.syncMDFe === true) enabled.push('MDFE');

  return enabled;
}

function extractAccessKey(xml: string, schema: string): string {
  const schemaName = String(schema || '');
  const tagMatch =
    xml.match(/<chNFe>(.*?)<\/chNFe>/) ||
    xml.match(/<chCTe>(.*?)<\/chCTe>/) ||
    xml.match(/<chMDFe>(.*?)<\/chMDFe>/);

  if (tagMatch) return tagMatch[1];

  if (schemaName.startsWith('procNFe')) {
    const match = xml.match(/Id="NFe(\d{44})"/);
    if (match) return match[1];
  }

  if (schemaName.startsWith('procCTe')) {
    const match = xml.match(/Id="CTe(\d{44})"/);
    if (match) return match[1];
  }

  if (schemaName.startsWith('procMDFe')) {
    const match = xml.match(/Id="MDFe(\d{44})"/);
    if (match) return match[1];
  }

  const genericMatch = xml.match(/Id="(?:NFe|CTe|MDFe)(\d{44})"/);
  return genericMatch ? genericMatch[1] : '';
}

async function createSyncLog(
  companyId: string,
  dfeType: DFeType,
  environment: string,
  ultNSU: string,
  maxNSU: string | undefined,
  status: 'SUCCESS' | 'ERROR',
  errorMessage?: string
) {
  await prisma.syncLog.create({
    data: {
      companyId,
      dfeType,
      environment,
      ultNSU,
      maxNSU,
      status,
      errorMessage
    }
  });
}

async function syncDFeTypeForCompany(company: any, env: any, dfeType: DFeType) {
  const lastSyncLog = await prisma.syncLog.findFirst({
    where: {
      companyId: company.id,
      dfeType,
      OR: [
        { environment: env.environment },
        { environment: null }
      ]
    },
    orderBy: { createdAt: 'desc' }
  });


  if (isRecentCooldownLog(lastSyncLog)) {
    const availableAt = getCooldownAvailableAt(lastSyncLog);
    console.log(`[SEFAZ INFO] ${dfeType}: sincronização em cooldown até ${availableAt.toISOString()} para evitar rejeição 656/consumo indevido.`);
    return;
  }

  let ultNSU = normalizeNSU(lastSyncLog?.ultNSU || '0');
  let continueSync = true;
  let oldNsuAdjusted = false;
  let requestCount = 0;

  while (continueSync) {
    if (requestCount >= MAX_REQUESTS_PER_SYNC) {
      await createSyncLog(
        company.id,
        dfeType,
        env.environment,
        ultNSU,
        undefined,
        'SUCCESS',
        `Sincronização de ${dfeType} pausada após ${MAX_REQUESTS_PER_SYNC} consultas para evitar loop/consumo indevido. Execute novamente para continuar a partir do NSU ${ultNSU}.`
      );
      break;
    }

    requestCount += 1;

    try {
      const response = await consultarDistribuicao(company.cnpj, company.uf, ultNSU, env, dfeType);
      const cStat = String(response.cStat ?? '');

      if (!cStat) {
        throw new Error(`SEFAZ ERROR ${dfeType}: Resposta inesperada - ${JSON.stringify(response)}`);
      }

      if (cStat === '138') {
        const previousUltNSU = normalizeNSU(ultNSU);
        const novoUltNSU = normalizeNSU(response.ultNSU ?? ultNSU);
        const maxNSU = normalizeNSU(response.maxNSU ?? novoUltNSU);

        let docs = response.loteDistDFeInt?.docZip;
        if (!docs) docs = [];
        if (!Array.isArray(docs)) docs = [docs];

        for (const doc of docs) {
          const schema = doc['@_schema'] || '';
          const nsu = doc['@_NSU'] || '';
          const base64Content = doc['#text'];

          if (!base64Content) {
            console.warn(`[SEFAZ INFO] ${dfeType} docZip sem conteúdo base64 NSU ${nsu}`);
            continue;
          }

          let xml = '';
          try {
            xml = await decodeDocZip(base64Content);
          } catch (e: any) {
            console.warn(`[SEFAZ INFO] Falha ao extrair XML do ${dfeType} docZip NSU ${nsu}`);
            continue;
          }

          const accessKey = extractAccessKey(xml, schema);
          if (accessKey) {
            await processXmlAndSave(xml, company.id, accessKey, schema, nsu);
          } else {
            console.warn(`[SEFAZ INFO] Não foi possível extrair chave do ${dfeType} NSU ${nsu} schema ${schema}`);
          }
        }

        await createSyncLog(company.id, dfeType, env.environment, novoUltNSU, maxNSU, 'SUCCESS');

        if (novoUltNSU !== previousUltNSU) {
          ultNSU = novoUltNSU;
        }

        if (novoUltNSU === previousUltNSU || ultNSU === maxNSU) {
          continueSync = false;
        }
      } else if (cStat === '137') {
        const ultNSURetorno = normalizeNSU(response.ultNSU ?? ultNSU);
        const maxNSU = response.maxNSU !== undefined ? normalizeNSU(response.maxNSU) : ultNSURetorno;

        await createSyncLog(
          company.id,
          dfeType,
          env.environment,
          ultNSURetorno,
          maxNSU,
          'SUCCESS',
          `cStat 137 - Nenhum documento localizado em ${dfeType}. A próxima consulta deve aguardar o intervalo de segurança para evitar rejeição 656.`
        );

        ultNSU = ultNSURetorno;
        continueSync = false;
      } else if (cStat === '730') {
        const menorNSUConsulta = extractMenorNSUConsulta(response.xMotivo);

        if (!menorNSUConsulta) {
          throw new Error(`SEFAZ ERROR ${dfeType}: ${cStat} - ${response.xMotivo}`);
        }

        if (oldNsuAdjusted && menorNSUConsulta === normalizeNSU(ultNSU)) {
          throw new Error(`SEFAZ ERROR ${dfeType}: ${cStat} - ${response.xMotivo}. O NSU já foi ajustado automaticamente para ${menorNSUConsulta}, mas a rejeição continuou.`);
        }

        console.log(`[SEFAZ INFO] ${dfeType}: NSU antigo. Ajustando ultNSU de ${normalizeNSU(ultNSU)} para ${menorNSUConsulta} e repetindo a consulta.`);

        ultNSU = menorNSUConsulta;
        oldNsuAdjusted = true;

        await createSyncLog(
          company.id,
          dfeType,
          env.environment,
          ultNSU,
          response.maxNSU !== undefined ? normalizeNSU(response.maxNSU) : undefined,
          'SUCCESS',
          `NSU antigo ajustado automaticamente após rejeição 730: ${response.xMotivo}`
        );
      } else if (cStat === '656' || cStat === '678') {
        const ultNSURetorno = normalizeNSU(response.ultNSU ?? ultNSU);
        const maxNSU = response.maxNSU !== undefined ? normalizeNSU(response.maxNSU) : undefined;

        await createSyncLog(
          company.id,
          dfeType,
          env.environment,
          ultNSURetorno,
          maxNSU,
          'ERROR',
          `cStat ${cStat} - Consumo indevido em ${dfeType}: ${response.xMotivo || 'aguarde 1 hora antes de nova consulta'}`
        );

        ultNSU = ultNSURetorno;
        continueSync = false;
      } else {
        throw new Error(`SEFAZ ERROR ${dfeType}: ${cStat} - ${response.xMotivo}`);
      }
    } catch (error: any) {
      console.error(`DFE Sync Error (${dfeType}):`, error);
      await createSyncLog(company.id, dfeType, env.environment, ultNSU, undefined, 'ERROR', error.message);
      continueSync = false;
    }
  }
}

export async function syncDFeForCompany(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { certificate: true }
  });

  if (!company || !company.certificate) return;

  const enabledTypes = getEnabledDFeTypes(company);
  if (enabledTypes.length === 0) {
    await createSyncLog(company.id, 'NFE', company.environment, '000000000000000', undefined, 'SUCCESS', 'Nenhum tipo de DF-e selecionado para sincronização.');
    return;
  }

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

  for (const dfeType of enabledTypes) {
    await syncDFeTypeForCompany(company, env, dfeType);
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
