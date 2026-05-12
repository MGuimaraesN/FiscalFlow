import { parseSefazXml, validateNFeXml } from '../utils/parser.ts';
import { prisma } from '../prisma.ts';

function toOptionalString(value: any): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function toNullableString(value: any): string | null {
  const str = toOptionalString(value);
  return str ?? null;
}

function parseIssueDate(value: any): Date {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

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
  const isMDFeSchema =
    schema.startsWith('resMDFe') ||
    schema.startsWith('procMDFe') ||
    schema.startsWith('procEventoMDFe') ||
    schema.startsWith('resEventoMDFe') ||
    Boolean(parsed.resMDFe || parsed.mdfeProc || parsed.MDFe || parsed.procEventoMDFe);

  if (isMDFeSchema) {
    if (parsed.resMDFe) {
      const res = parsed.resMDFe;
      const emitCnpj = res.CNPJ || res.CPF || '';
      const emitName = res.xNome || 'Desconhecido';
      const value = parseFloat(String(res.vCarga || res.vNF || '0').replace(',', '.')) || 0;
      const issueDate = parseIssueDate(res.dhEmi);

      let supplier = null;
      if (emitCnpj) {
        supplier = await prisma.supplier.upsert({
          where: { cnpj: String(emitCnpj) },
          update: { name: emitName },
          create: { cnpj: String(emitCnpj), name: emitName }
        });
      }

      await prisma.nFeDocument.upsert({
        where: { chNFe },
        update: {
          nNSU: nNSU || undefined,
          valueTotal: value,
          issueDate,
          supplierId: supplier?.id,
          schema,
        },
        create: {
          companyId,
          chNFe,
          nNSU: nNSU || null,
          schema,
          valueTotal: value,
          issueDate,
          xml,
          status: 'PENDING',
          manifestStatus: 'NOT_DONE',
          supplierId: supplier?.id,
        }
      });
      return;
    }

    const mdfeRoot = parsed.mdfeProc?.MDFe || parsed.MDFe;
    const infMDFe = mdfeRoot?.infMDFe;

    if (infMDFe) {
      const emit = infMDFe.emit || {};
      const emitCnpj = emit.CNPJ || emit.CPF || '';
      const emitName = emit.xNome || 'Desconhecido';
      const value = parseFloat(String(infMDFe.tot?.vCarga || '0').replace(',', '.')) || 0;
      const issueDate = parseIssueDate(infMDFe.ide?.dhEmi);
      const nMDF = String(infMDFe.ide?.nMDF || '');
      const serie = String(infMDFe.ide?.serie || '');
      const protMDFe = toOptionalString(parsed.mdfeProc?.protMDFe?.infProt?.nProt);

      let supplier = null;
      if (emitCnpj) {
        supplier = await prisma.supplier.upsert({
          where: { cnpj: String(emitCnpj) },
          update: { name: emitName },
          create: { cnpj: String(emitCnpj), name: emitName }
        });
      }

      await prisma.nFeDocument.upsert({
        where: { chNFe },
        update: {
          nNSU: nNSU || undefined,
          xml,
          valueTotal: value,
          issueDate,
          nNF: nMDF,
          serie,
          schema,
          protNFe: protMDFe,
          supplierId: supplier?.id,
          status: 'DOWNLOADED'
        },
        create: {
          companyId,
          chNFe,
          nNSU: nNSU || null,
          xml,
          valueTotal: value,
          issueDate,
          nNF: nMDF,
          serie,
          schema,
          protNFe: toNullableString(protMDFe),
          supplierId: supplier?.id,
          status: 'DOWNLOADED',
          manifestStatus: 'NOT_DONE',
        }
      });
      return;
    }

    if (parsed.procEventoMDFe || parsed.resEvento) {
      await prisma.nFeDocument.upsert({
        where: { chNFe },
        update: {
          nNSU: nNSU || undefined,
          schema,
        },
        create: {
          companyId,
          chNFe,
          nNSU: nNSU || null,
          schema,
          xml,
          status: 'PENDING',
          manifestStatus: 'NOT_DONE',
        }
      });
      return;
    }
  }

  const isCTeSchema =
    schema.startsWith('resCTe') ||
    schema.startsWith('procCTe') ||
    schema.startsWith('procEventoCTe') ||
    Boolean(parsed.resCTe || parsed.cteProc || parsed.CTe || parsed.procEventoCTe);

  if (isCTeSchema) {
    if (parsed.resCTe) {
      const res = parsed.resCTe;
      const emitCnpj = res.CNPJ || res.CPF || '';
      const emitName = res.xNome || 'Desconhecido';
      const value = parseFloat(String(res.vPrest || res.vTPrest || '0').replace(',', '.')) || 0;
      const issueDate = parseIssueDate(res.dhEmi);

      let supplier = null;
      if (emitCnpj) {
        supplier = await prisma.supplier.upsert({
          where: { cnpj: String(emitCnpj) },
          update: { name: emitName },
          create: { cnpj: String(emitCnpj), name: emitName }
        });
      }

      await prisma.nFeDocument.upsert({
        where: { chNFe },
        update: {
          nNSU: nNSU || undefined,
          valueTotal: value,
          issueDate,
          supplierId: supplier?.id,
          schema,
        },
        create: {
          companyId,
          chNFe,
          nNSU: nNSU || null,
          schema,
          valueTotal: value,
          issueDate,
          xml,
          status: 'PENDING',
          manifestStatus: 'NOT_DONE',
          supplierId: supplier?.id,
        }
      });
      return;
    }

    const cteRoot = parsed.cteProc?.CTe || parsed.CTe;
    const infCte = cteRoot?.infCte;

    if (infCte) {
      const emit = infCte.emit || {};
      const emitCnpj = emit.CNPJ || emit.CPF || '';
      const emitName = emit.xNome || 'Desconhecido';
      const value = parseFloat(String(infCte.vPrest?.vTPrest || infCte.vPrest?.vRec || '0').replace(',', '.')) || 0;
      const issueDate = parseIssueDate(infCte.ide?.dhEmi);
      const nCT = String(infCte.ide?.nCT || '');
      const serie = String(infCte.ide?.serie || '');
      const protCTe = toOptionalString(parsed.cteProc?.protCTe?.infProt?.nProt);

      let supplier = null;
      if (emitCnpj) {
        supplier = await prisma.supplier.upsert({
          where: { cnpj: String(emitCnpj) },
          update: { name: emitName },
          create: { cnpj: String(emitCnpj), name: emitName }
        });
      }

      await prisma.nFeDocument.upsert({
        where: { chNFe },
        update: {
          nNSU: nNSU || undefined,
          xml,
          valueTotal: value,
          issueDate,
          nNF: nCT,
          serie,
          schema,
          protNFe: protCTe,
          supplierId: supplier?.id,
          status: 'DOWNLOADED'
        },
        create: {
          companyId,
          chNFe,
          nNSU: nNSU || null,
          xml,
          valueTotal: value,
          issueDate,
          nNF: nCT,
          serie,
          schema,
          protNFe: toNullableString(protCTe),
          supplierId: supplier?.id,
          status: 'DOWNLOADED',
          manifestStatus: 'NOT_DONE',
        }
      });
      return;
    }

    if (parsed.procEventoCTe || parsed.resEvento) {
      await prisma.nFeDocument.upsert({
        where: { chNFe },
        update: {
          nNSU: nNSU || undefined,
          schema,
        },
        create: {
          companyId,
          chNFe,
          nNSU: nNSU || null,
          schema,
          xml,
          status: 'PENDING',
          manifestStatus: 'NOT_DONE',
        }
      });
      return;
    }
  }

  // Example for a procNFe document or plain NFe
  const nfeRoot = parsed.nfeProc ? parsed.nfeProc.NFe : (parsed.NFe || parsed);
  const infNFe = nfeRoot.infNFe;
  
  if (!infNFe) {
    // Possibly just a resNFe (resumo) from SEFAZ Distribuicao
    if (parsed.resNFe) {
        const res = parsed.resNFe;
        const value = parseFloat(res.vNF || '0');
        const issueDate = parseIssueDate(res.dhEmi);
        const emitCnpj = res.CNPJ || res.CPF;
        const emitName = res.xNome;

        let supplier = null;
        if (emitCnpj) {
            supplier = await prisma.supplier.upsert({
                where: { cnpj: String(emitCnpj) },
                update: { name: emitName || 'Desconhecido' },
                create: { cnpj: String(emitCnpj), name: emitName || 'Desconhecido' }
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
  const nfeProtNFe = toOptionalString(parsed.nfeProc?.protNFe?.infProt?.nProt || protNFeStr);
  const emit = infNFe.emit;
  const emitCnpj = emit?.CNPJ || emit?.CPF;
  const emitName = emit?.xNome;
  
  const vNF = parseFloat(infNFe.total?.ICMSTot?.vNF || '0');
  const dhEmi = parseIssueDate(infNFe.ide?.dhEmi || infNFe.ide?.dEmi);
  const nNF = String(infNFe.ide?.nNF || '');
  const serie = String(infNFe.ide?.serie || '');

  let supplier = null;
  if (emitCnpj) {
    supplier = await prisma.supplier.upsert({
      where: { cnpj: String(emitCnpj) },
      update: { name: emitName || 'Desconhecido' },
      create: { cnpj: String(emitCnpj), name: emitName || 'Desconhecido' }
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
      protNFe: nfeProtNFe,
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
      protNFe: toNullableString(nfeProtNFe),
      supplierId: supplier?.id,
      status: 'DOWNLOADED',
      manifestStatus: 'NOT_DONE',
    }
  });
}
