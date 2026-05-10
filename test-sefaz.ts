import { prisma } from './src/backend/prisma.ts';
import { decryptString } from './src/backend/utils/crypto.ts';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

async function testSefaz() {
  const company = await prisma.company.findFirst({ include: { certificate: true }});
  if (!company || !company.certificate) return;
  
  const cert = company.certificate;
  const pass = decryptString(cert.password);
  const httpsAgent = new https.Agent({
    pfx: Buffer.from(cert.certBase64, 'base64'),
    passphrase: pass,
    rejectUnauthorized: false,
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
  });

  const urls = [
    'https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx'
  ];

  const cnpj = company.cnpj.replace(/\D/g, '');
  const distBody = `<distMDFe versao="3.00" xmlns="http://www.portalfiscal.inf.br/mdfe"><tpAmb>2</tpAmb><verAplic>FiscalFlow</verAplic><CNPJ>${cnpj}</CNPJ><indDFe>9</indDFe><indCompRet>0</indCompRet><ultNSU>000000000000000</ultNSU></distMDFe>`;
  
  const soapXml = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <mdfeCabecMsg xmlns="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeDistribuicaoDFe"><cUF>43</cUF><versaoDados>3.00</versaoDados></mdfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <mdfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeDistribuicaoDFe">
      <mdfeDadosMsg>${distBody}</mdfeDadosMsg>
    </mdfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;

  try {
    const res = await axios.post(urls[0], soapXml, {
      httpsAgent,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeDistribuicaoDFe/mdfeDistDFeInteresse"',
      }
    });
    console.log("SUCCESS");
    console.log(res.data);
  } catch (e: any) {
    console.log("FAIL", e.response?.data || e.message);
  }
}
testSefaz();
