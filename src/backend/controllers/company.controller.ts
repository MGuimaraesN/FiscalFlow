import { Response } from 'express';
import { prisma } from '../prisma.ts';
import { AuthRequest } from '../middlewares/auth.ts';
import { encryptString } from '../utils/crypto.ts';
import { extractFromPfx } from '../utils/cert.ts';
import forge from 'node-forge';
import { syncDFeForCompany } from '../jobs/syncDFe.ts';

export async function createCompany(req: AuthRequest, res: Response): Promise<void> {
  const { cnpj, name, ie, uf, environment } = req.body;
  if (!cnpj || !name || !uf) {
    res.status(400).json({ error: 'Campos requeridos ausentes' });
    return;
  }

  try {
    const company = await prisma.company.create({
      data: {
        cnpj: cnpj.replace(/\\D/g, ''),
        name,
        ie,
        uf,
        environment: environment || 'HOMOLOGACAO',
        userId: req.user!.userId,
      }
    });
    res.status(201).json(company);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar empresa' });
  }
}

export async function uploadCertificate(req: AuthRequest, res: Response): Promise<void> {
  const { companyId } = req.params;
  const { password } = req.body;

  if (!req.file || !password) {
    res.status(400).json({ error: 'Arquivo do certificado e senha sao obrigatorios' });
    return;
  }

  try {
    const company = await prisma.company.findFirst({
      where: { id: companyId, userId: req.user!.userId }
    });

    if (!company) {
      res.status(404).json({ error: 'Empresa nao encontrada' });
      return;
    }

    const certBase64 = req.file.buffer.toString('base64');
    let certData;
    let expiresAt = new Date(new Date().setFullYear(new Date().getFullYear() + 1));

    try {
      certData = extractFromPfx(certBase64, password);
      // Extrair data real de vencimento usando node-forge
      try {
        const pki = forge.pki;
        const certObj = pki.certificateFromPem(certData.certPem);
        expiresAt = certObj.validity.notAfter;
      } catch (e) {
        console.error('Info: Failed to precisely parse expiration date, using default +1yr', e);
      }
    } catch (error: any) {
      res.status(400).json({ error: 'Certificado inválido ou senha incorreta detectada durante a extração (.pfx)' });
      return;
    }

    const encryptedPassword = encryptString(password);

    await prisma.certificate.upsert({
      where: { companyId },
      update: { certBase64, password: encryptedPassword, expiresAt },
      create: {
        companyId,
        certBase64,
        password: encryptedPassword,
        expiresAt
      }
    });

    res.json({ message: 'Certificado salvo com sucesso' });
  } catch (error) {
    console.error('Cert Upload Error', error);
    res.status(500).json({ error: 'Erro ao salvar certificado' });
  }
}

export async function listCompanies(req: AuthRequest, res: Response): Promise<void> {
  try {
    const companies = await prisma.company.findMany({
      where: { userId: req.user!.userId },
      include: {
        certificate: {
          select: { id: true, expiresAt: true, updatedAt: true }
        },
        syncLogs: {
          select: { status: true, createdAt: true, errorMessage: true },
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        _count: {
          select: { documents: true }
        }
      }
    });
    res.json(companies);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno' });
  }
}

export async function syncCompany(req: AuthRequest, res: Response): Promise<void> {
  try {
    const company = await prisma.company.findFirst({
        where: { id: req.params.companyId, userId: req.user!.userId }
    });
    if (!company) {
       res.status(404).json({ error: 'Empresa não encontrada' });
       return;
    }
    await syncDFeForCompany(company.id);
    res.json({ message: 'Sincronização executada com sucesso' });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Erro ao sincronizar Notas Fiscais' });
  }
}
