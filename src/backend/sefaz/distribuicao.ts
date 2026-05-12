import { sendSoapRequest, SefazEnv } from './soap-client.ts';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';

export type DFeType = 'NFE' | 'CTE' | 'MDFE';

type DistribuicaoConfig = {
  serviceName: string;
  urlHomologacao: string;
  urlProducao: string;
  documentNamespace: string;
  wsdlNamespace: string;
  operationTag: string;
  resultTag: string;
  dataTag: string;
  headerTag: string;
  version: string;
  useCUFAutor: boolean;
  wrapBodyWithOperation: boolean;
  fixedHeaderCUF?: string;
  logPrefix: string;
};

const CONFIGS: Record<DFeType, DistribuicaoConfig> = {
  NFE: {
    serviceName: 'NFeDistribuicaoDFe',
    urlHomologacao: 'https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
    urlProducao: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
    documentNamespace: 'http://www.portalfiscal.inf.br/nfe',
    wsdlNamespace: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe',
    operationTag: 'nfeDistDFeInteresse',
    resultTag: 'nfeDistDFeInteresseResult',
    dataTag: 'nfeDadosMsg',
    headerTag: 'nfeCabecMsg',
    version: '1.01',
    useCUFAutor: true,
    wrapBodyWithOperation: true,
    logPrefix: 'nfe'
  },
  CTE: {
    serviceName: 'CTeDistribuicaoDFe',
    urlHomologacao: 'https://hom1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx',
    urlProducao: 'https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx',
    documentNamespace: 'http://www.portalfiscal.inf.br/cte',
    wsdlNamespace: 'http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe',
    operationTag: 'cteDistDFeInteresse',
    resultTag: 'cteDistDFeInteresseResult',
    dataTag: 'cteDadosMsg',
    headerTag: 'cteCabecMsg',
    version: '1.00',
    useCUFAutor: true,
    wrapBodyWithOperation: true,
    logPrefix: 'cte'
  },
  MDFE: {
    serviceName: 'MDFeDistribuicaoDFe',
    urlHomologacao: 'https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx',
    urlProducao: 'https://mdfe.svrs.rs.gov.br/ws/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx',
    documentNamespace: 'http://www.portalfiscal.inf.br/mdfe',
    wsdlNamespace: 'http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeDistribuicaoDFe',
    operationTag: 'mdfeDistDFeInteresse',
    resultTag: 'mdfeDistDFeInteresseResult',
    dataTag: 'mdfeDadosMsg',
    headerTag: 'mdfeCabecMsg',
    version: '1.00',
    useCUFAutor: false,
    wrapBodyWithOperation: false,
    fixedHeaderCUF: '43',
    logPrefix: 'mdfe'
  }
};

function onlyDigits(value: any): string {
  return String(value || '').replace(/\D/g, '');
}

function normalizeNSU(value: any): string {
  return onlyDigits(value || '0').padStart(15, '0');
}

function resolveCUF(value: any): string {
  const raw = String(value || '').trim().toUpperCase();
  const digits = onlyDigits(raw);
  if (/^\d{2}$/.test(digits)) return digits;

  const ufMap: Record<string, string> = {
    RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
    MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29',
    MG: '31', ES: '32', RJ: '33', SP: '35',
    PR: '41', SC: '42', RS: '43',
    MS: '50', MT: '51', GO: '52', DF: '53'
  };

  return ufMap[raw] || digits;
}

function getBodyPayload(config: DistribuicaoConfig, distBody: string): string {
  if (config.wrapBodyWithOperation) {
    return `<${config.operationTag} xmlns="${config.wsdlNamespace}"><${config.dataTag}>${distBody}</${config.dataTag}></${config.operationTag}>`;
  }

  return `<${config.dataTag} xmlns="${config.wsdlNamespace}">${distBody}</${config.dataTag}>`;
}

export async function consultarDistribuicao(
  cnpj: string,
  uf: string,
  ultNSU: string,
  env: SefazEnv,
  dfeType: DFeType = 'NFE'
): Promise<any> {
  const config = CONFIGS[dfeType];
  const url = env.environment === 'PRODUCAO' ? config.urlProducao : config.urlHomologacao;
  const tpAmb = env.environment === 'PRODUCAO' ? '1' : '2';
  const cUFAutor = resolveCUF(uf || env.uf);
  const headerCUF = config.fixedHeaderCUF || cUFAutor;
  const cleanCnpj = onlyDigits(cnpj);

  if (cleanCnpj.length !== 14) {
    throw new Error(`CNPJ inválido para ${config.serviceName}: ${cleanCnpj}`);
  }

  if (!/^\d{2}$/.test(cUFAutor)) {
    throw new Error(`UF/cUFAutor inválido para ${config.serviceName}: ${cUFAutor}`);
  }

  const nsu = normalizeNSU(ultNSU);
  const cUFAutorXml = config.useCUFAutor ? `<cUFAutor>${cUFAutor}</cUFAutor>` : '';
  const distBody = `<distDFeInt versao="${config.version}" xmlns="${config.documentNamespace}"><tpAmb>${tpAmb}</tpAmb>${cUFAutorXml}<CNPJ>${cleanCnpj}</CNPJ><distNSU><ultNSU>${nsu}</ultNSU></distNSU></distDFeInt>`;
  const bodyPayload = getBodyPayload(config, distBody);

  const soapAction = `${config.wsdlNamespace}/${config.operationTag}`;
  const soapXml = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Header><${config.headerTag} xmlns="${config.wsdlNamespace}"><cUF>${headerCUF}</cUF><versaoDados>${config.version}</versaoDados></${config.headerTag}></soap12:Header><soap12:Body>${bodyPayload}</soap12:Body></soap12:Envelope>`;

  if (process.env.DEBUG_SEFAZ_XML === 'true') {
     console.log(`[SEFAZ DEBUG] Ambiente: ${env.environment}, URL: ${url}, Service: ${config.serviceName}`);
     const logDir = path.resolve(process.cwd(), 'logs');
     if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
     fs.writeFileSync(path.join(logDir, `sefaz-${config.logPrefix}-distribuicao-request.xml`), soapXml, 'utf-8');
  }

  const responseXml = await sendSoapRequest(url, soapAction, soapXml, env);

  if (process.env.DEBUG_SEFAZ_XML === 'true') {
     const logDir = path.resolve(process.cwd(), 'logs');
     fs.writeFileSync(path.join(logDir, `sefaz-${config.logPrefix}-distribuicao-response.xml`), responseXml, 'utf-8');
  }

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const parsed = parser.parse(responseXml);

  const envelope = parsed['soap:Envelope'] || parsed['env:Envelope'] || parsed['soap12:Envelope'];
  if (!envelope) {
    throw new Error(`Invalid SOAP Response: ${responseXml}`);
  }

  const body = envelope['soap:Body'] || envelope['env:Body'] || envelope['soap12:Body'];
  if (!body) {
    throw new Error(`Invalid SOAP Body: ${responseXml}`);
  }

  if (body['soap12:Fault'] || body['soap:Fault'] || body['env:Fault']) {
    throw new Error(`SOAP Fault: ${JSON.stringify(body)}`);
  }

  const responseTag = `${config.operationTag}Response`;
  const result =
    body[responseTag]?.[config.resultTag] ||
    body[config.resultTag] ||
    body[`${config.serviceName}Result`] ||
    body[config.dataTag] ||
    body['retDistDFeInt'] ||
    body;

  const retDistDFeInt = result?.['retDistDFeInt'] || result;

  if (
    !retDistDFeInt ||
    retDistDFeInt.cStat === undefined ||
    retDistDFeInt.cStat === null
  ) {
    throw new Error(`Unexpected ${config.serviceName} response structure: ${JSON.stringify(body)}`);
  }

  if (String(retDistDFeInt.cStat) === '243') {
    throw new Error(`SEFAZ rejeitou XML: 243 - ${retDistDFeInt.xMotivo}. Verifique logs/sefaz-${config.logPrefix}-distribuicao-request.xml`);
  } else if (retDistDFeInt.cStat && !['137', '138'].includes(String(retDistDFeInt.cStat))) {
    console.log(`[SEFAZ INFO] ${config.serviceName} Status Retornado: ${retDistDFeInt.cStat} - ${retDistDFeInt.xMotivo}`);
  }

  return retDistDFeInt;
}
