import { Response } from 'express';
import { prisma } from '../prisma.ts';
import { AuthRequest } from '../middlewares/auth.ts';
import { consultarCnpjWs } from '../services/cnpj.service.ts';

export async function listSuppliers(req: AuthRequest, res: Response): Promise<void> {
  const { search, page = 1, limit = 50 } = req.query;
  const where: any = {};

  if (search) {
    const cleanSearch = String(search).trim();
    const digitsOnly = cleanSearch.replace(/\D/g, '');

    if (digitsOnly.length > 0 && cleanSearch === digitsOnly) {
       where.cnpj = { contains: digitsOnly };
    } else {
       where.OR = [
         { name: { contains: cleanSearch } },
         { tradeName: { contains: cleanSearch } },
       ];
    }
  }

  const offset = (Number(page) - 1) * Number(limit);

  try {
    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: offset,
      take: Number(limit)
    });

    const total = await prisma.supplier.count({ where });

    res.json({ data: suppliers, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar fornecedores' });
  }
}

export async function getSupplier(req: AuthRequest, res: Response): Promise<void> {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: String(req.params.id) }
    });
    if (!supplier) {
      res.status(404).json({ error: 'Fornecedor não encontrado' });
      return;
    }
    res.json(supplier);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar fornecedor' });
  }
}

export async function saveSupplier(req: AuthRequest, res: Response): Promise<void> {
  const { 
    cnpj, name, tradeName, ie, email, phone, uf, city, cep, 
    address, number, complement, neighborhood, mainActivity, registrationStatus 
  } = req.body;

  if (!cnpj || !name) {
    res.status(400).json({ error: 'CNPJ e Nome são obrigatórios' });
    return;
  }

  const cleanCnpj = cnpj.replace(/\D/g, '');

  try {
    const data = {
      name,
      tradeName: tradeName || null,
      ie: ie || null,
      email: email || null,
      phone: phone || null,
      uf: uf || null,
      city: city || null,
      cep: cep || null,
      address: address || null,
      number: number || null,
      complement: complement || null,
      neighborhood: neighborhood || null,
      mainActivity: mainActivity || null,
      registrationStatus: registrationStatus || null,
    };

    const supplier = await prisma.supplier.upsert({
      where: { cnpj: cleanCnpj },
      update: data,
      create: {
        cnpj: cleanCnpj,
        ...data
      }
    });

    res.json(supplier);
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao salvar fornecedor' });
  }
}

export async function deleteSupplier(req: AuthRequest, res: Response): Promise<void> {
  const id = String(req.params.id);
  try {
    const docCount = await prisma.nFeDocument.count({ where: { supplierId: id } });
    if (docCount > 0) {
      res.status(400).json({ error: 'Não é possível excluir este fornecedor pois existem notas fiscais vinculadas a ele.' });
      return;
    }

    await prisma.supplier.delete({ where: { id } });
    res.json({ message: 'Fornecedor excluído' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir fornecedor' });
  }
}

export async function lookupCnpj(req: AuthRequest, res: Response): Promise<void> {
  const { cnpj } = req.body;
  
  if (!cnpj) {
    res.status(400).json({ error: 'CNPJ é obrigatório' });
    return;
  }

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
