import { SignedXml } from 'xml-crypto';

const SIGNATURE_ALGORITHM = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const DIGEST_ALGORITHM = 'http://www.w3.org/2001/04/xmlenc#sha256';
const ENVELOPED_SIGNATURE = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

function onlyCertificateBody(certPem: string): string {
  return String(certPem || '')
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\r\n/g, '')
    .replace(/\n/g, '')
    .replace(/\s/g, '');
}

export function signXml(xml: string, tagToSign: string, certPem: string, privateKeyPem: string): string {
  const sig: any = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
  });

  sig.signatureAlgorithm = SIGNATURE_ALGORITHM;
  sig.canonicalizationAlgorithm = C14N;

  const reference = {
    xpath: `//*[local-name(.)='${tagToSign}']/*[local-name(.)='infEvento']`,
    transforms: [ENVELOPED_SIGNATURE, C14N],
    digestAlgorithm: DIGEST_ALGORITHM,
  };

  try {
    sig.addReference(reference);
  } catch (error: any) {
    // Compatibilidade com versões antigas do xml-crypto.
    if (!String(error?.message || '').includes('digestAlgorithm is required')) {
      throw error;
    }
    sig.addReference(reference.xpath, reference.transforms, reference.digestAlgorithm);
  }

  sig.signingKey = privateKeyPem;
  sig.privateKey = privateKeyPem;
  sig.publicCert = certPem;

  sig.getKeyInfoContent = () => `<X509Data><X509Certificate>${onlyCertificateBody(certPem)}</X509Certificate></X509Data>`;
  sig.keyInfoProvider = {
    getKeyInfo: () => `<X509Data><X509Certificate>${onlyCertificateBody(certPem)}</X509Certificate></X509Data>`,
  };

  sig.computeSignature(xml, {
    location: { reference: `//*[local-name(.)='${tagToSign}']/*[local-name(.)='infEvento']`, action: 'after' }
  });

  return sig.getSignedXml();
}
