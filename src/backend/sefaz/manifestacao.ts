import { sendSoapRequest, SefazEnv } from './soap-client.ts';
import { signXml } from '../utils/xml-signer.ts';
import { XMLParser } from 'fast-xml-parser';

const RECEPCAO_URL_HOMOLOGACAO = 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx';
const RECEPCAO_URL_PRODUCAO = 'https://www1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx';

type TpEventoNFe = '210200' | '210210' | '210220' | '210240';

function cleanCnpj(cnpj: string): string {
  return String(cnpj || '').replace(/\D/g, '');
}

function formatDhEvento(): string {
  return new Date().toISOString().replace(/\.[0-9]{3}Z$/, '+00:00');
}

function getDescEvento(tpEvento: TpEventoNFe): string {
  switch (tpEvento) {
    case '210200': return 'Confirmacao da Operacao';
    case '210210': return 'Ciencia da Operacao';
    case '210220': return 'Desconhecimento da Operacao';
    case '210240': return 'Operacao nao Realizada';
    default: return 'Evento';
  }
}

export async function enviarManifestacao(
  cnpj: string,
  chNFe: string,
  tpEvento: TpEventoNFe,
  xJust: string | null,
  nSeqEvento: number,
  env: SefazEnv
): Promise<any> {
  const url = env.environment === 'PRODUCAO' ? RECEPCAO_URL_PRODUCAO : RECEPCAO_URL_HOMOLOGACAO;
  const tpAmb = env.environment === 'PRODUCAO' ? '1' : '2';
  const cnpjNumerico = cleanCnpj(cnpj);
  const dhEvento = formatDhEvento();
  const descEvento = getDescEvento(tpEvento);
  const id = `ID${tpEvento}${chNFe}${String(nSeqEvento).padStart(2, '0')}`;

  let detEvento = `<descEvento>${descEvento}</descEvento>`;
  if (tpEvento === '210240' && xJust) {
    detEvento += `<xJust>${xJust}</xJust>`;
  }

  const eventoXml = `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="${id}"><cOrgao>91</cOrgao><tpAmb>${tpAmb}</tpAmb><CNPJ>${cnpjNumerico}</CNPJ><chNFe>${chNFe}</chNFe><dhEvento>${dhEvento}</dhEvento><tpEvento>${tpEvento}</tpEvento><nSeqEvento>${nSeqEvento}</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00">${detEvento}</detEvento></infEvento></evento>`;

  if (!env.certPem || !env.privateKeyPem) throw new Error('Certificado pendente (PEM nulo)');
  const signedEvento = signXml(eventoXml, 'evento', env.certPem, env.privateKeyPem);

  const reqBody = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote>${signedEvento}</envEvento>`;

  const soapAction = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEventoNF';
  const soapXml = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">${reqBody}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;

  const responseXml = await sendSoapRequest(url, soapAction, soapXml, env);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const parsed = parser.parse(responseXml);

  const envelope = parsed['soap:Envelope'] || parsed['env:Envelope'] || parsed['soap12:Envelope'];
  const body = envelope?.['soap:Body'] || envelope?.['env:Body'] || envelope?.['soap12:Body'];
  const result =
    body?.['nfeRecepcaoEventoNFResponse']?.['nfeRecepcaoEventoNFResult'] ||
    body?.['nfeRecepcaoEventoResult'] ||
    body?.['retEnvEvento'] ||
    body;

  const retEnvEvento = result?.['retEnvEvento'] || result;
  if (!retEnvEvento) {
    throw new Error(`Resposta inesperada da NFeRecepcaoEvento4: ${JSON.stringify(body)}`);
  }

  return retEnvEvento;
}
