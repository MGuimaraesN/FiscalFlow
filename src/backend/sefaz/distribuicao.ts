import { sendSoapRequest, SefazEnv } from './soap-client.ts';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

// The URL for AN (Ambiente Nacional)
const DIST_URL_HOMOLOGACAO = 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';
const DIST_URL_PRODUCAO = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';

export async function consultarDistribuicao(
  cnpj: string,
  ufIbge: string,
  ultNSU: string,
  env: SefazEnv
): Promise<any> {
  const url = env.environment === 'PRODUCAO' ? DIST_URL_PRODUCAO : DIST_URL_HOMOLOGACAO;
  
  // Format the request XML
  const distBody = `<?xml version="1.0" encoding="utf-8"?>
<distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
  <tpAmb>\${env.environment === 'PRODUCAO' ? '1' : '2'}</tpAmb>
  <cUFAutor>\${ufIbge}</cUFAutor>
  <CNPJ>\${cnpj}</CNPJ>
  <distNSU>
    <ultNSU>\${ultNSU.padStart(15, '0')}</ultNSU>
  </distNSU>
</distDFeInt>`;

  const soapAction = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse';
  const soapXml = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header/>
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        \${distBody}
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;

  const responseXml = await sendSoapRequest(url, soapAction, soapXml, env);
  
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
  const methodResponse = body['nfeDistDFeInteresseResponse'];
  const result = methodResponse ? methodResponse['nfeDistDFeInteresseResult'] : null;
  const retDistDFeInt = result ? result['retDistDFeInt'] : body['retDistDFeInt'];

  if (!retDistDFeInt) {
    throw new Error(`Unexpected structure: ${JSON.stringify(body)}`);
  }

  return retDistDFeInt;
}
