import zlib from 'zlib';
import { XMLParser } from 'fast-xml-parser';

export async function decodeDocZip(base64Zip: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const buffer = Buffer.from(base64Zip, 'base64');
    zlib.unzip(buffer, (err, unzipped) => {
      if (err) return reject(err);
      resolve(unzipped.toString('utf8'));
    });
  });
}

export function parseSefazXml(xmlString: string): any {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });
  return parser.parse(xmlString);
}

export function validateNFeXml(xmlString: string): { valid: boolean; error?: string } {
    try {
        const parsed = parseSefazXml(xmlString);
        
        let nfeData;
        if (parsed.nfeProc) {
           nfeData = parsed.nfeProc.NFe?.infNFe || parsed.nfeProc.NFe?.infNFe_supl; 
        } else if (parsed.NFe) {
           nfeData = parsed.NFe.infNFe;
        }

        if (!nfeData) {
           return { valid: false, error: 'O XML não possui a tag <infNFe> ou não está no schema esperado (nfeProc / NFe).' };
        }

        if (!nfeData.emit || !nfeData.emit.CNPJ) {
           return { valid: false, error: 'O XML está inválido: Falta os dados de emissão (<emit> <CNPJ>).' };
        }
        
        if (!nfeData.ide || !nfeData.ide.nNF) {
           return { valid: false, error: 'O XML está inválido: Faltam os dados da NFe (<ide> <nNF>).' };
        }

        return { valid: true };
    } catch(e: any) {
        return { valid: false, error: 'Erro ao fazer parser do XML: ' + e.message };
    }
}
