import { sendSoapRequest, SefazEnv } from './soap-client.ts';
import { signXml } from '../utils/xml-signer.ts';
import { XMLParser } from 'fast-xml-parser';

// The URL for AN (Ambiente Nacional) for RecepcaoEvento
const RECEPCAO_URL_HOMOLOGACAO = 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx';
const RECEPCAO_URL_PRODUCAO = 'https://www1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx';

export async function enviarManifestacao(
  cnpj: string,
  chNFe: string,
  tpEvento: '210210' | '210200' | '210240' | '210220', // Ciencia, Confirmacao, Operacao nao realizada, Desconhecimento
  xJust: string | null,
  nSeqEvento: number,
  env: SefazEnv
): Promise<any> {
  const url = env.environment === 'PRODUCAO' ? RECEPCAO_URL_PRODUCAO : RECEPCAO_URL_HOMOLOGACAO;
  const tpAmb = env.environment === 'PRODUCAO' ? '1' : '2';
  const dhEvento = new Date().toISOString().replace(/\.[0-9]{3}/, ''); // YYYY-MM-DDThh:mm:ssTZD

  let descEvento = '';
  switch(tpEvento) {
    case '210210': descEvento = 'Ciencia da Operacao'; break;
    case '210200': descEvento = 'Confirmacao da Operacao'; break;
    case '210220': descEvento = 'Desconhecimento da Operacao'; break;
    case '210240': descEvento = 'Operacao nao Realizada'; break;
  }

  const id = `ID\${tpEvento}\${chNFe}\${nSeqEvento.toString().padStart(2, '0')}`;

  let detEvento = `<descEvento>\${descEvento}</descEvento>`;
  if (xJust) {
    detEvento += `<xJust>\${xJust}</xJust>`;
  }

  let eventoXml = `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <infEvento Id="\${id}">
    <cOrgao>91</cOrgao>
    <tpAmb>\${tpAmb}</tpAmb>
    <CNPJ>\${cnpj}</CNPJ>
    <chNFe>\${chNFe}</chNFe>
    <dhEvento>\${dhEvento}</dhEvento>
    <tpEvento>\${tpEvento}</tpEvento>
    <nSeqEvento>\${nSeqEvento}</nSeqEvento>
    <versaoEvento>1.00</versaoEvento>
    <detEvento versaoEvento="1.00">
      \${detEvento}
    </detEvento>
  </infEvento>
</evento>`;

  // Sign the event
  const signedEvento = signXml(eventoXml, 'evento', env.certPem, env.privateKeyPem);

  const reqBody = `<?xml version="1.0" encoding="utf-8"?>
<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <idLote>1</idLote>
  \${signedEvento}
</envEvento>`;

  const soapAction = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento';
  const soapXml = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header/>
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
      \${reqBody}
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;

  const responseXml = await sendSoapRequest(url, soapAction, soapXml, env);
  
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const parsed = parser.parse(responseXml);
  
  const envelope = parsed['soap:Envelope'] || parsed['env:Envelope'] || parsed['soap12:Envelope'];
  const body = envelope['soap:Body'] || envelope['env:Body'] || envelope['soap12:Body'];
  const retEnvEvento = body['nfeDadosMsgResponse'] ? body['nfeDadosMsgResponse']['retEnvEvento'] : body['retEnvEvento'];
  return retEnvEvento;
}
