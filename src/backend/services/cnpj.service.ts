import axios from 'axios';

export interface CnpjWsMappedResult {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  uf: string | null;
  cidade: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  email: string | null;
  telefone: string | null;
  atividadePrincipal: string | null;
  inscricaoEstadual: string | null;
  inscricoesEstaduais: Array<{ uf: string; inscricaoEstadual: string; ativo: boolean }>;
  raw?: any;
}

export async function consultarCnpjWs(cnpj: string): Promise<CnpjWsMappedResult> {
  const cnpjLimpo = cnpj.replace(/\D/g, '');

  if (cnpjLimpo.length !== 14) {
    throw new Error('CNPJ deve conter 14 dígitos válidos.');
  }

  // Not doing deeper modulo-11 validation here, we just rely on the API to return 404 if invalid
  
  const response = await axios.get(`https://publica.cnpj.ws/cnpj/${cnpjLimpo}`, {
    timeout: 10000
  });

  const raw = response.data;
  const estabelecimento = raw.estabelecimento || {};
  const uf = estabelecimento.estado?.sigla || null;
  
  const inscricoesEstaduais = (estabelecimento.inscricoes_estaduais || []).map((ie: any) => ({
    uf: ie.estado?.sigla,
    inscricaoEstadual: ie.inscricao_estadual,
    ativo: ie.ativo
  }));

  // Match the primary IE in the same UF that is active
  const mainIe = inscricoesEstaduais.find((ie: any) => ie.uf === uf && ie.ativo)?.inscricaoEstadual || null;

  return {
    cnpj: cnpjLimpo,
    razaoSocial: raw.razao_social || '',
    nomeFantasia: estabelecimento.nome_fantasia || null,
    situacaoCadastral: estabelecimento.situacao_cadastral || null,
    uf,
    cidade: estabelecimento.cidade?.nome || null,
    cep: estabelecimento.cep || null,
    logradouro: estabelecimento.logradouro || null,
    numero: estabelecimento.numero || null,
    complemento: estabelecimento.complemento || null,
    bairro: estabelecimento.bairro || null,
    email: estabelecimento.email || null,
    telefone: estabelecimento.telefone1 ? `(${estabelecimento.ddd1 || ''}) ${estabelecimento.telefone1}`.trim() : null,
    atividadePrincipal: estabelecimento.atividade_principal?.descricao || null,
    inscricaoEstadual: mainIe,
    inscricoesEstaduais,
    raw
  };
}
