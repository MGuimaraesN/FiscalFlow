import { Response } from 'express';
import { prisma } from '../prisma.ts';
import { AuthRequest } from '../middlewares/auth.ts';

export async function getAdminLogs(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (req.user!.role !== 'SUPERADMIN') {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 15;
    const companyId = req.query.companyId as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const where: any = {};

    if (companyId) {
      where.companyId = companyId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const logs = await prisma.syncLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        company: {
           select: { id: true, name: true, cnpj: true }
        }
      },
      skip: (page - 1) * limit,
      take: limit
    });
    
    const total = await prisma.syncLog.count({ where });

    res.json({
      data: logs,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar logs' });
  }
}

export async function getAdminCompanies(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (req.user!.role !== 'SUPERADMIN') {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    const companies = await prisma.company.findMany({
      select: { id: true, name: true, cnpj: true },
      orderBy: { name: 'asc' }
    });

    res.json(companies);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar empresas' });
  }
}
