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
  const verAplic = 'FiscalFlow';
  const indDFe = '9';
  const indCompRet = '0';
  const formattedNSU = ultNSU.padStart(15, '0');

  // Input Validation before sending!
  if (tpAmb !== '1' && tpAmb !== '2') throw new Error("tpAmb deve ser 1 ou 2");
  if (verAplic.length < 1 || verAplic.length > 20) throw new Error("verAplic deve ter de 1 a 20 caracteres");
  if (!['0', '1', '2', '3', '8', '9'].includes(indDFe)) throw new Error("indDFe deve ser 0, 1, 2, 3, 8 ou 9");
  if (indCompRet !== '0' && indCompRet !== '1') throw new Error("indCompRet deve ser 0 ou 1");
  if (!/^[0-9]{15}$/.test(formattedNSU)) throw new Error("ultNSU deve ter exatamente 15 dígitos");

  // Format the request XML
  const distBody = `<distMDFe versao="3.00" xmlns="http://www.portalfiscal.inf.br/mdfe"><tpAmb>${tpAmb}</tpAmb><verAplic>${verAplic}</verAplic><indDFe>${indDFe}</indDFe><indCompRet>${indCompRet}</indCompRet><ultNSU>${formattedNSU}</ultNSU></distMDFe>`;

  const soapAction = 'http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeDistribuicaoDFe/mdfeDistDFeInteresse';
  const soapXml = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <mdfeCabecMsg xmlns="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeDistribuicaoDFe">
      <cUF>${ufIbge}</cUF>
      <versaoDados>3.00</versaoDados>
    </mdfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <mdfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeDistribuicaoDFe">
      <mdfeDadosMsg>${distBody}</mdfeDadosMsg>
    </mdfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;

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
  
  const envelope = parsed['soap:Envelope'] || parsed['env:Envelope'] || parsed['soap12:Envelope'] || parsed['env:Envelope'];
  if (!envelope) {
    throw new Error(`Invalid SOAP Response: ${responseXml}`);
  }
  const body = envelope['soap:Body'] || envelope['env:Body'] || envelope['soap12:Body'];
  if (body['soap12:Fault'] || body['soap:Fault'] || body['env:Fault']) {
    throw new Error(`SOAP Fault: ${JSON.stringify(body)}`);
  }
  const methodResponse = body['mdfeDistDFeInteresseResponse'];
  const result = methodResponse ? methodResponse['mdfeDistDFeInteresseResult'] : null;
  const retDistMDFe = result ? (result['retDistMDFe'] || result['retDistDFeInt']) : (body['retDistMDFe'] || body['retDistDFeInt']);

  if (!retDistMDFe) {
    throw new Error(`Unexpected structure: ${JSON.stringify(body)}`);
  }

  if (retDistMDFe.cStat === 243) {
    throw new Error(`SEFAZ ERROR: 243 - XML Mal Formado. Verifique os schemas e a estrutura enviada.`);
  } else if (retDistMDFe.cStat && ![137, 138].includes(Number(retDistMDFe.cStat))) {
    console.log(`[SEFAZ INFO] Status Retornado: ${retDistMDFe.cStat} - ${retDistMDFe.xMotivo}`);
  }

  return retDistMDFe;
}
