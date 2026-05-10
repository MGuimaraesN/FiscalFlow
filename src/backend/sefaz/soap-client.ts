import axios from 'axios';
import * as https from 'https';
import * as crypto from 'crypto';

export interface SefazEnv {
  uf: string;
  environment: 'HOMOLOGACAO' | 'PRODUCAO';
  pfxBase64?: string;
  password?: string;
  certPem?: string;
  privateKeyPem?: string;
}

export async function sendSoapRequest(
  url: string,
  soapAction: string,
  xmlBody: string,
  env: SefazEnv
): Promise<string> {
  let agentOptions: https.AgentOptions = {
    rejectUnauthorized: false,
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
  };

  if (env.pfxBase64 && env.password) {
    agentOptions.pfx = Buffer.from(env.pfxBase64, 'base64');
    agentOptions.passphrase = env.password;
  } else if (env.certPem && env.privateKeyPem) {
    agentOptions.cert = env.certPem;
    agentOptions.key = env.privateKeyPem;
  }

  const httpsAgent = new https.Agent(agentOptions);

  const headers = {
    'Content-Type': 'application/soap+xml; charset=utf-8; action="' + soapAction + '"',
    'Accept': 'text/xml',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    const response = await axios.post(url, xmlBody, {
      headers,
      httpsAgent,
      timeout: 30000,
    });
    return response.data;
  } catch (error: any) {
    if (error.response) {
      let errorData = error.response.data;
      if (typeof errorData === 'string' && errorData.toLowerCase().includes('<!doctype html')) {
          if (error.response.status === 403) {
             throw new Error("SEFAZ HTTP 403 - Acesso Negado. O certificado digital fornecido pode ser inválido, revogado, ou não é um e-CNPJ ICP-Brasil aceito pelo servidor.");
          }
          errorData = '[HTML Response Omitted]';
      }
      console.error(`[SOAP] HTTP Error ${error.response.status}:`, errorData);
      throw new Error(`SEFAZ HTTP ${error.response.status}: ${errorData}`);
    }
    throw error;
  }
}
