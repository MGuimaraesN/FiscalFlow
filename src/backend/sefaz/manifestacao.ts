import { sendSoapRequest, SefazEnv } from './soap-client.ts';
import { signXml } from '../utils/xml-signer.ts';
import { XMLParser } from 'fast-xml-parser';

const RECEPCAO_URL_HOMOLOGACAO = 'https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx';
const RECEPCAO_URL_PRODUCAO = 'https://mdfe.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx';

export async function enviarManifestacao(
  cnpj: string,
  chMDFe: string,
  tpEvento: '110111' | '110112' | '110114',
  xJust: string | null,
  nSeqEvento: number,
  env: SefazEnv
): Promise<any> {
  const url = env.environment === 'PRODUCAO' ? RECEPCAO_URL_PRODUCAO : RECEPCAO_URL_HOMOLOGACAO;
  const tpAmb = env.environment === 'PRODUCAO' ? '1' : '2';
  const dhEvento = new Date().toISOString().replace(/\.[0-9]{3}Z$/, '+00:00');

  let descEvento = '';
  switch(tpEvento) {
    case '110111': descEvento = 'Cancelamento'; break;
    case '110112': descEvento = 'Encerramento'; break;
    case '110114': descEvento = 'Inclusao de Condutor'; break;
  }

  const id = `ID${tpEvento}${chMDFe}${String(nSeqEvento).padStart(2, '0')}`;

  let detEvento = `<descEvento>${descEvento}</descEvento>`;
  if (xJust) {
    detEvento += `<xJust>${xJust}</xJust>`;
  }

  let eventoXml = `<eventoMDFe xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00">
  <infEvento Id="${id}">
    <cOrgao>91</cOrgao>
    <tpAmb>${tpAmb}</tpAmb>
    <CNPJ>${cnpj}</CNPJ>
    <chMDFe>${chMDFe}</chMDFe>
    <dhEvento>${dhEvento}</dhEvento>
    <tpEvento>${tpEvento}</tpEvento>
    <nSeqEvento>${nSeqEvento}</nSeqEvento>
    <detEvento versaoEvento="3.00">
      ${detEvento}
    </detEvento>
  </infEvento>
</eventoMDFe>`;

  // Sign the event
  if (!env.certPem || !env.privateKeyPem) throw new Error("Certificado pendente (PEM nulo)");
  const signedEvento = signXml(eventoXml, 'eventoMDFe', env.certPem, env.privateKeyPem);

  const reqBody = `<?xml version="1.0" encoding="utf-8"?>
<envEvento xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00">
  <idLote>1</idLote>
  ${signedEvento}
</envEvento>`;

  const soapAction = 'http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoEvento/mdfeRecepcaoEvento';
  const soapXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <mdfeRecepcaoEvento xmlns="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoEvento">
      <mdfeDadosMsg>
        ${reqBody}
      </mdfeDadosMsg>
    </mdfeRecepcaoEvento>
  </soap:Body>
</soap:Envelope>`;

  const responseXml = await sendSoapRequest(url, soapAction, soapXml, env);
  
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const parsed = parser.parse(responseXml);
  
  const envelope = parsed['soap:Envelope'] || parsed['env:Envelope'] || parsed['soap12:Envelope'];
  const body = envelope['soap:Body'] || envelope['env:Body'] || envelope['soap12:Body'];
  const retEnvEvento = body['mdfeRecepcaoEventoResult'] ? body['mdfeRecepcaoEventoResult']['retEnvEvento'] : body['retEnvEvento'];
  return retEnvEvento;
}
