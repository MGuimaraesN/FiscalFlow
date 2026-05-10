import forge from 'node-forge';

export interface ExtractedCert {
  privateKeyPem: string;
  certPem: string;
}

export function extractFromPfx(pfxBase64: string, password: string): ExtractedCert {
  const pfxDer = forge.util.decode64(pfxBase64);
  const asn1 = forge.asn1.fromDer(pfxDer);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);

  let privateKeyPem = '';
  let certPem = '';

  for (const safeContents of p12.safeContents) {
    for (const safeBags of safeContents.safeBags) {
      if (safeBags.type === forge.pki.oids.pkcs8ShroudedKeyBag) {
        const key = safeBags.key;
        if (key) {
           privateKeyPem = forge.pki.privateKeyToPem(key);
        }
      } else if (safeBags.type === forge.pki.oids.certBag) {
        const cert = safeBags.cert;
        if (cert) {
           certPem += forge.pki.certificateToPem(cert) + '\n';
        }
      }
    }
  }

  if (!privateKeyPem || !certPem) {
    throw new Error('Falha ao extrair certificado ou chave privada do PFX');
  }

  return { privateKeyPem, certPem };
}
