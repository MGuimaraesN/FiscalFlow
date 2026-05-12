import crypto from 'crypto';
import { SignedXml } from 'xml-crypto';

export function signXml(xml: string, tagToSign: string, certPem: string, privateKeyPem: string): string {
  const sig: any = new SignedXml();
  
  // Confguring the algorithms mapping for ICP-Brasil signature profiles
  sig.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
  
  sig.addReference(
    `//*[@Id]`, // It usually references the ID attribute, e.g., infEvento
    ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
    'http://www.w3.org/2001/04/xmlenc#sha256'
  );

  sig.signingKey = privateKeyPem;
  
  class KeyInfoProvider {
    getKeyInfo(_key: any, _prefix: any) {
      // Return the X509 certificate string without headers
      const pureCert = certPem
        .replace(/-----BEGIN CERTIFICATE-----/, '')
        .replace(/-----END CERTIFICATE-----/, '')
        .replace(/\r\n/g, '')
        .replace(/\n/g, '');

      return `<X509Data><X509Certificate>${pureCert}</X509Certificate></X509Data>`;
    }
  }

  sig.keyInfoProvider = new KeyInfoProvider();

  sig.computeSignature(xml, {
    location: { reference: `//${tagToSign}`, action: 'append' } // appending Signature to the end of the tag
  });

  return sig.getSignedXml();
}
