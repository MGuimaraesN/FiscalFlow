import { parseSefazXml, validateNFeXml } from '../utils/parser.ts';
import { prisma } from '../prisma.ts';

export async function processXmlAndSave(
  xml: string, 
  companyId: string, 
  chNFe: string, 
  schema: string, 
  nNSU?: string,
  protNFeStr?: string
) {
  // If it's a full XML, validate it
  if (schema.startsWith('procNFe') || schema === 'nfe') {
     const validation = validateNFeXml(xml);
     if (!validation.valid) {
        console.warn(`[VALIDATION ERROR] chNFe ${chNFe}: ${validation.error}`);
        await prisma.nFeDocument.upsert({
            where: { chNFe },
            update: { xml, status: 'ERROR', nNSU: nNSU || undefined },
            create: {
                companyId,
                chNFe,
                nNSU: nNSU || null,
                schema,
                xml,
                status: 'ERROR',
                manifestStatus: 'NOT_DONE',
            }
        });
        return;
     }
  }

  const parsed = parseSefazXml(xml);
  
  // Example for a procNFe document or plain NFe
  const nfeRoot = parsed.nfeProc ? parsed.nfeProc.NFe : (parsed.NFe || parsed);
  const infNFe = nfeRoot.infNFe;
  
  if (!infNFe) {
    // Possibly just a resNFe (resumo) from SEFAZ Distribuicao
    if (parsed.resNFe) {
        const res = parsed.resNFe;
        const value = parseFloat(res.vNF || '0');
        const issueDate = new Date(res.dhEmi || Date.now());
        const emitCnpj = res.CNPJ || res.CPF;
        const emitName = res.xNome;

        let supplier = null;
        if (emitCnpj) {
            supplier = await prisma.supplier.upsert({
                where: { cnpj: emitCnpj },
                update: { name: emitName || 'Desconhecido' },
                create: { cnpj: emitCnpj, name: emitName || 'Desconhecido' }
            });
        }

        await prisma.nFeDocument.upsert({
            where: { chNFe },
            update: {
                nNSU: nNSU || undefined,
                valueTotal: value,
                issueDate,
                supplierId: supplier?.id,
            },
            create: {
                companyId,
                chNFe,
                nNSU: nNSU || null,
                schema,
                valueTotal: value,
                issueDate,
                xml: xml,
                status: 'PENDING',
                manifestStatus: 'NOT_DONE',
                supplierId: supplier?.id,
            }
        });
        return;
    }
    return; // Cannot process, unexpected format
  }

  // Full XML Processing
  const emit = infNFe.emit;
  const emitCnpj = emit?.CNPJ || emit?.CPF;
  const emitName = emit?.xNome;
  
  const vNF = parseFloat(infNFe.total?.ICMSTot?.vNF || '0');
  const dhEmi = new Date(infNFe.ide?.dhEmi || Date.now());
  const nNF = String(infNFe.ide?.nNF || '');
  const serie = String(infNFe.ide?.serie || '');

  let supplier = null;
  if (emitCnpj) {
    supplier = await prisma.supplier.upsert({
      where: { cnpj: emitCnpj },
      update: { name: emitName || 'Desconhecido' },
      create: { cnpj: emitCnpj, name: emitName || 'Desconhecido' }
    });
  }

  await prisma.nFeDocument.upsert({
    where: { chNFe },
    update: {
      nNSU: nNSU || undefined,
      xml,
      valueTotal: vNF,
      issueDate: dhEmi,
      nNF,
      serie,
      schema,
      protNFe: protNFeStr || undefined,
      supplierId: supplier?.id,
      status: 'DOWNLOADED' // We got the full XML
    },
    create: {
      companyId,
      chNFe,
      nNSU: nNSU || null,
      xml,
      valueTotal: vNF,
      issueDate: dhEmi,
      nNF,
      serie,
      schema,
      protNFe: protNFeStr || null,
      supplierId: supplier?.id,
      status: 'DOWNLOADED',
      manifestStatus: 'NOT_DONE',
    }
  });
}
