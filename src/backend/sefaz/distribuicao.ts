import { sendSoapRequest, SefazEnv } from './soap-client.ts';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';

const DIST_URL_HOMOLOGACAO = 'https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx';
const DIST_URL_PRODUCAO = 'https://mdfe.svrs.rs.gov.br/ws/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx';

export async function consultarDistribuicao(
  cnpj: string,
  ufIbge: string, // Kept for compatibility but not needed in the body
  ultNSU: string,
  env: SefazEnv
): Promise<any> {
  const url = env.environment === 'PRODUCAO' ? DIST_URL_PRODUCAO : DIST_URL_HOMOLOGACAO;
  const tpAmb = env.environment === 'PRODUCAO' ? '1' : '2';
  const cleanCnpj = String(cnpj || '').replace(/\D/g, '');
  if (cleanCnpj.length !== 14) {
    throw new Error(`CNPJ inválido para MDFeDistribuicaoDFe: ${cleanCnpj}`);
  }
  const nsu = String(ultNSU || '0').replace(/\D/g, '').padStart(15, '0');

  const distBody = `<distDFeInt versao="1.00" xmlns="http://www.portalfiscal.inf.br/mdfe">
  <tpAmb>${tpAmb}</tpAmb>
  <CNPJ>${cleanCnpj}</CNPJ>
  <distNSU>
    <ultNSU>${nsu}</ultNSU>
  </distNSU>
</distDFeInt>`;

  const soapAction = 'http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeDistribuicaoDFe/mdfeDistDFeInteresse';
  const soapXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <mdfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeDistribuicaoDFe">
      <mdfeDadosMsg>${distBody}</mdfeDadosMsg>
    </mdfeDistDFeInteresse>
  </soap:Body>
</soap:Envelope>`;

  if (process.env.DEBUG_SEFAZ_XML === 'true') {
     console.log(`[SEFAZ DEBUG] Ambiente: ${env.environment}, URL: ${url}, Service: MDFeDistribuicaoDFe`);
     // Save debug files
     const logDir = path.resolve(process.cwd(), 'logs');
     if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
     fs.writeFileSync(path.join(logDir, 'sefaz-mdfe-distribuicao-request.xml'), soapXml, 'utf-8');
  }

  const responseXml = await sendSoapRequest(url, soapAction, soapXml, env);

  if (process.env.DEBUG_SEFAZ_XML === 'true') {
     const logDir = path.resolve(process.cwd(), 'logs');
     fs.writeFileSync(path.join(logDir, 'sefaz-mdfe-distribuicao-response.xml'), responseXml, 'utf-8');
  }
  
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const parsed = parser.parse(responseXml);
  
  const envelope = parsed['soap:Envelope'] || parsed['env:Envelope'] || parsed['soap12:Envelope'];
  if (!envelope) {
    throw new Error(`Invalid SOAP Response: ${responseXml}`);
  }
  const body = envelope['soap:Body'] || envelope['env:Body'] || envelope['soap12:Body'];
  if (body['soap12:Fault'] || body['soap:Fault'] || body['env:Fault']) {
    throw new Error(`SOAP Fault: ${JSON.stringify(body)}`);
  }
  const methodResponse = body['mdfeDistDFeInteresseResponse'];
  const result = methodResponse ? methodResponse['mdfeDistDFeInteresseResult'] : body['mdfeDistDFeInteresseResult'] || body['retDistDFeInt'];
  const retDistDFeInt = result ? (result['retDistDFeInt'] || result) : body['retDistDFeInt'];

  if (!retDistDFeInt || !retDistDFeInt.cStat) {
    throw new Error(`Unexpected structure: ${JSON.stringify(body)}`);
  }

  if (String(retDistDFeInt.cStat) === '243') {
    throw new Error(`SEFAZ rejeitou XML: 243 - ${retDistDFeInt.xMotivo}`);
  } else if (retDistDFeInt.cStat && !['137', '138'].includes(String(retDistDFeInt.cStat))) {
    console.log(`[SEFAZ INFO] Status Retornado: ${retDistDFeInt.cStat} - ${retDistDFeInt.xMotivo}`);
  }

  return retDistDFeInt;
}
