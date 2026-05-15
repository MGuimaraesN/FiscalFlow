import { Response } from 'express';
import { prisma } from '../prisma.ts';
import { AuthRequest } from '../middlewares/auth.ts';
import { enviarManifestacao } from '../sefaz/manifestacao.ts';
import { consultarNFePorChave } from '../sefaz/distribuicao.ts';
import { extractFromPfx } from '../utils/cert.ts';
import { decryptString } from '../utils/crypto.ts';
import { decodeDocZip } from '../utils/parser.ts';
import { processXmlAndSave } from '../services/nfe.service.ts';

export async function getDocuments(req: AuthRequest, res: Response): Promise<void> {
  const { companyId, status, search, page = 1, limit = 50, startDate, endDate, sortBy, sortOrder, nNF, serie } = req.query;

  const where: any = { company: { userId: req.user!.userId } };
  if (companyId) where.companyId = String(companyId);
  if (status) where.status = String(status);
  
  if (startDate || endDate) {
    where.issueDate = {};
    if (startDate) where.issueDate.gte = new Date(String(startDate) + 'T00:00:00.000Z');
    if (endDate) where.issueDate.lte = new Date(String(endDate) + 'T23:59:59.999Z');
  }

  // Adding nNF and serie filters
  if (nNF) where.nNF = { contains: String(nNF) };
  if (serie) where.serie = { contains: String(serie) };

  if (search) {
    const cleanSearch = String(search).trim();
    const digitsOnly = cleanSearch.replace(/\D/g, '');

    if (digitsOnly.length === 44) {
      where.chNFe = digitsOnly;
    } else if (digitsOnly.length === 14) {
      where.supplier = { cnpj: digitsOnly };
    } else if (digitsOnly.length > 0 && cleanSearch === digitsOnly) {
       where.OR = [
         { chNFe: { contains: digitsOnly } },
         { supplier: { cnpj: { contains: digitsOnly } } }
       ];
    } else {
      where.supplier = { name: { contains: cleanSearch } };
    }
  }

  let orderBy: any = { issueDate: 'desc' };
  if (sortBy) {
    const order = sortOrder === 'asc' ? 'asc' : 'desc';
    if (sortBy === 'issueDate') orderBy = { issueDate: order };
    else if (sortBy === 'valueTotal') orderBy = { valueTotal: order };
    else if (sortBy === 'supplier') orderBy = { supplier: { name: order } };
  }

  const offset = (Number(page) - 1) * Number(limit);

  try {
    const docs = await prisma.nFeDocument.findMany({
      where,
      include: { supplier: true, company: { select: { name: true, cnpj: true } } },
      orderBy,
      skip: offset,
      take: Number(limit)
    });

    const total = await prisma.nFeDocument.count({ where });

    res.json({ data: docs, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar notas fiscais' });
  }
}

export async function getEvents(req: AuthRequest, res: Response): Promise<void> {
  const documentId = req.params.documentId as string;
  try {
    const doc = await prisma.nFeDocument.findFirst({
      where: { id: documentId, company: { userId: req.user!.userId } },
    });
    if (!doc) {
      res.status(404).json({ error: 'Documento não encontrado' });
      return;
    }
    const events = await prisma.nFeEvent.findMany({
      where: { documentId },
      orderBy: { dhEvento: 'desc' },
    });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar eventos' });
  }
}

export async function dashboardStats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const docs = await prisma.nFeDocument.findMany({
      where: { company: { userId: req.user!.userId } },
      select: { valueTotal: true, status: true, supplierId: true }
    });

    const totalCount = docs.length;
    const totalValue = docs.reduce((acc: number, curr: any) => acc + (curr.valueTotal || 0), 0);
    const manifestsDone = docs.filter((d: any) => ['MANIFESTED', 'DOWNLOADED'].includes(d.status)).length;
    const pendingManifests = docs.filter((d: any) => d.status === 'PENDING').length;

    res.json({
      totalCount,
      totalValue,
      manifestsDone,
      pendingManifests
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
}

export async function manifestDocument(req: AuthRequest, res: Response): Promise<void> {
  const documentId = req.params.documentId as string;
  const { tpEvento, xJust } = req.body;

  if (!['210210', '210200', '210240', '210220'].includes(tpEvento)) {
    res.status(400).json({ error: 'Tipo de evento invalido' });
    return;
  }

  try {
    const doc = await prisma.nFeDocument.findFirst({
      where: { id: documentId, company: { userId: req.user!.userId } },
      include: { company: true }
    });

    if (!doc) {
      res.status(404).json({ error: 'Documento nao encontrado' });
      return;
    }

    const chaveNumerica = String(doc.chNFe || '').replace(/\D/g, '');
    const modeloDocumento = chaveNumerica.substring(20, 22);
    if (modeloDocumento !== '55') {
      res.status(400).json({
        error: `Manifestação do destinatário é permitida somente para NF-e modelo 55. Este documento é modelo ${modeloDocumento || 'desconhecido'}${modeloDocumento === '58' ? ' (MDF-e)' : ''}.`
      });
      return;
    }

    const certificate = await prisma.certificate.findFirst({
      where: { companyId: doc.companyId }
    });

    if (!certificate) {
      res.status(404).json({ error: 'Certificado nao encontrado para a empresa' });
      return;
    }

    const nSeqEvento = 1;

    const certData = extractFromPfx(
      certificate.certBase64,
      decryptString(certificate.password)
    );

    const env = {
      uf: doc.company.uf,
      environment: doc.company.environment as 'PRODUCAO' | 'HOMOLOGACAO',
      certPem: certData.certPem,
      privateKeyPem: certData.privateKeyPem
    };

    const response = await enviarManifestacao(doc.company.cnpj, doc.chNFe, tpEvento as any, xJust || null, nSeqEvento, env);

    const retEvento = response.retEvento;
    const cStat = String(retEvento.infEvento.cStat);
    
    if (['135', '136', '573'].includes(cStat)) {
      let manifestStatus = 'SCIENCE';
      switch(tpEvento) {
         case '210200': manifestStatus = 'CONFIRM'; break;
         case '210240': manifestStatus = 'DENY'; break;
         case '210220': manifestStatus = 'DENY'; break;
      }

      if (cStat !== '573') {
        const existingEvent = await prisma.nFeEvent.findFirst({
          where: { documentId: doc.id, tpEvento, nSeqEvento: String(nSeqEvento) }
        });

        if (!existingEvent) {
          await prisma.nFeEvent.create({
            data: {
              documentId: doc.id,
              tpEvento,
              descEvento: retEvento.infEvento.xEvento,
              nSeqEvento: String(nSeqEvento),
              dhEvento: new Date(retEvento.infEvento.dhRegEvento),
              xml: null
            }
          });
        }
      }

      await prisma.nFeDocument.update({
        where: { id: doc.id },
        data: { status: 'MANIFESTED', manifestStatus }
      });

      // After successful manifestation, try to download the full XML if it is 210210 or 210200
      let fullXmlDownloaded = false;
      if (tpEvento === '210210' || tpEvento === '210200') {
        try {
          const chResponse = await consultarNFePorChave(doc.company.cnpj, doc.chNFe, env);
          const chStat = String(chResponse.cStat ?? '');
          
          if (chStat === '138') {
             let docs = chResponse.loteDistDFeInt?.docZip;
             if (!docs) docs = [];
             if (!Array.isArray(docs)) docs = [docs];

             for (const d of docs) {
                const schema = d['@_schema'] || '';
                const base64Content = d['#text'];
                if (base64Content && schema.startsWith('procNFe')) {
                   const xml = await decodeDocZip(base64Content);
                   await processXmlAndSave(xml, doc.companyId, doc.chNFe, schema, d['@_NSU'] || doc.nNSU || '');
                   fullXmlDownloaded = true;
                }
             }
          }
        } catch (e: any) {
          console.warn(`[SEFAZ INFO] Falha ao tentar obter XML completo após manifestação para a chave ${doc.chNFe}:`, e.message);
        }
      }

      res.json({ message: fullXmlDownloaded ? 'Manifestacao enviada e XML baixado com sucesso!' : 'Manifestacao enviada com sucesso. O XML pode demorar para ser liberado.' });
    } else {
      res.status(400).json({ error: `SEFAZ: ${retEvento.infEvento.xMotivo}` });
    }

  } catch (error: any) {
    console.error('Manifestation Error', error);
    res.status(500).json({ error: error.message || 'Erro ao manifestar' });
  }
}

export async function resetSync(req: AuthRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId as string;
  const { dfeType = 'NFE', environment = 'PRODUCAO' } = req.body;

  try {
    const company = await prisma.company.findFirst({
      where: { id: companyId, userId: req.user!.userId }
    });

    if (!company) {
      res.status(404).json({ error: 'Empresa não encontrada' });
      return;
    }

    await prisma.syncLog.deleteMany({
      where: {
        companyId,
        dfeType,
        environment
      }
    });

    await prisma.syncLog.create({
      data: {
        companyId,
        dfeType,
        environment,
        ultNSU: '000000000000000',
        status: 'SUCCESS',
        errorMessage: 'NSU reiniciado manualmente pelo usuário.'
      }
    });

    res.json({ message: 'NSU reiniciado. A próxima sincronização buscará documentos disponíveis dos últimos 90 dias.' });
  } catch (error: any) {
    console.error('Reset Sync Error', error);
    res.status(500).json({ error: 'Erro ao reiniciar sincronização' });
  }
}