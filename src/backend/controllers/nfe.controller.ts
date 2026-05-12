import { Response } from 'express';
import { prisma } from '../prisma.ts';
import { AuthRequest } from '../middlewares/auth.ts';
import { enviarManifestacao } from '../sefaz/manifestacao.ts';
import { extractFromPfx } from '../utils/cert.ts';
import { decryptString } from '../utils/crypto.ts';

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
  if (nNF) where.nNF = String(nNF);
  if (serie) where.serie = String(serie);

  if (search) {
    const cleanSearch = String(search).trim();
    const digitsOnly = cleanSearch.replace(/\\D/g, '');

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
    const totalValue = docs.reduce((acc, curr) => acc + (curr.valueTotal || 0), 0);
    const manifestsDone = docs.filter(d => ['MANIFESTED', 'DOWNLOADED'].includes(d.status)).length;
    const pendingManifests = docs.filter(d => d.status === 'PENDING').length;

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

    const eventosPermitidos = ['210200', '210210', '210220', '210240'];
    if (!eventosPermitidos.includes(String(tpEvento))) {
      res.status(400).json({ error: `Evento NF-e inválido para manifestação: ${tpEvento}` });
      return;
    }

    const certificate = await prisma.certificate.findFirst({
      where: { companyId: doc.companyId }
    });

    if (!certificate) {
      res.status(404).json({ error: 'Certificado nao encontrado para a empresa' });
      return;
    }

    const eventsCount = await prisma.nFeEvent.count({ where: { documentId } });
    const nSeqEvento = eventsCount + 1;

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
    const cStat = retEvento.infEvento.cStat;
    
    if (cStat == 135 || cStat == 136 || cStat == 573) { // 135=Evento vinculado, 136=Evento registrado c status, 573=Duplicado
      
      let manifestStatus = 'SCIENCE';
      switch(tpEvento) {
         case '210200': manifestStatus = 'CONFIRM'; break;
         case '210240': manifestStatus = 'DENY'; break;
         case '210220': manifestStatus = 'DENY'; break;
      }

      await prisma.nFeEvent.create({
        data: {
          documentId: doc.id,
          tpEvento,
          descEvento: retEvento.infEvento.xEvento,
          nSeqEvento: String(nSeqEvento),
          dhEvento: new Date(retEvento.infEvento.dhRegEvento),
          xml: null // To keep it simple we aren't saving the response XML here
        }
      });

      await prisma.nFeDocument.update({
        where: { id: doc.id },
        data: { status: 'MANIFESTED', manifestStatus }
      });
      res.json({ message: 'Manifestacao enviada com sucesso' });
    } else {
      res.status(400).json({ error: `SEFAZ: ${retEvento.infEvento.xMotivo}` });
    }

  } catch (error: any) {
    console.error('Manifestation Error', error);
    res.status(500).json({ error: error.message || 'Erro ao manifestar' });
  }
}
