import { Response } from 'express';
import { prisma } from '../prisma.ts';
import { AuthRequest } from '../middlewares/auth.ts';

export async function getAdminLogs(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (req.user!.role !== 'SUPERADMIN') {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    const logs = await prisma.syncLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        company: {
           select: { id: true, name: true, cnpj: true }
        }
      },
      take: 200
    });

    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar logs' });
  }
}
