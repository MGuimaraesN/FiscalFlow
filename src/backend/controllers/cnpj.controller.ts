import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.ts';
import { consultarCnpjWs } from '../services/cnpj.service.ts';

export async function consultarCnpj(req: AuthRequest, res: Response): Promise<void> {
  const cnpj = String(req.params.cnpj);

  try {
    const data = await consultarCnpjWs(cnpj);
    res.json(data);
  } catch (error: any) {
    if (error.response?.status === 404) {
      res.status(404).json({ error: 'CNPJ não encontrado' });
    } else if (error.response?.status === 429) {
      res.status(429).json({ error: 'Limite da API pública atingido, tente novamente mais tarde' });
    } else {
      res.status(500).json({ error: error.message || 'Erro ao consultar CNPJ' });
    }
  }
}
