import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { FileUp, AlertTriangle } from 'lucide-react';
import { differenceInDays, isPast } from 'date-fns';

export default function Companies() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ cnpj: '', name: '', uf: '', ie: '', environment: 'HOMOLOGACAO', syncNFe: true, syncCTe: false, syncMDFe: false });
  const [certData, setCertData] = useState<{ companyId: string, password: string, file: File | null } | null>(null);
  const [certError, setCertError] = useState('');
  const [syncingCompany, setSyncingCompany] = useState<string | null>(null);

  const { data: companies, isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await api.get('/companies');
      return res.data;
    }
  });

  const createCompany = useMutation({
    mutationFn: (data: any) => api.post('/companies', data),
    onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['companies'] });
       setShowModal(false);
       setFormData({ cnpj: '', name: '', uf: '', ie: '', environment: 'HOMOLOGACAO', syncNFe: true, syncCTe: false, syncMDFe: false });
    }
  });

  const uploadCert = useMutation({
    mutationFn: (data: any) => {
        const d = new FormData();
        d.append('password', data.password);
        d.append('certificate', data.file);
        return api.post(`/companies/${data.companyId}/certificate`, d);
    },
    onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['companies'] });
       setCertData(null);
       setCertError('');
    },
    onError: (err: any) => {
       setCertError(err.response?.data?.error || err.message || 'Erro desconhecido ao enviar certificado. Verifique sua senha ou o formato do arquivo.');
    }
  });

  const syncMutation = useMutation({
      mutationFn: async (companyId: string) => {
          setSyncingCompany(companyId);
          await api.post(`/companies/${companyId}/sync`);
      },
      onSuccess: () => {
          alert('Sincronização concluída com sucesso!');
      },
      onError: (err: any) => {
          alert('Erro ao sincronizar: ' + (err.response?.data?.error || err.message));
      },
      onSettled: () => {
          setSyncingCompany(null);
      }
  });

  const updateCompany = useMutation({
    mutationFn: async (data: { companyId: string, syncIntervalHours?: number, syncNFe?: boolean, syncCTe?: boolean, syncMDFe?: boolean }) => {
      const { companyId, ...payload } = data;
      await api.put(`/companies/${companyId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    }
  });

  if (isLoading) return <div>Carregando empresas...</div>;

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white tracking-tight">Minhas Empresas</h1>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-emerald-700 transition w-full sm:w-auto"
        >
          Nova Empresa
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {companies?.map((comp: any) => (
          <div key={comp.id} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm flex flex-col justify-between hover:border-slate-700 transition">
            <div>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-0">
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">{comp.name}</h2>
                    <p className="text-sm font-mono text-slate-400 mt-1">{comp.cnpj}</p>
                  </div>
                  {comp.certificate && (
                     <button 
                        disabled={syncingCompany === comp.id}
                        onClick={() => syncMutation.mutate(comp.id)}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 sm:py-1.5 rounded-lg border border-slate-700 uppercase font-bold tracking-wider transition disabled:opacity-50 flex items-center justify-center gap-2 w-full sm:w-auto"
                     >
                        {syncingCompany === comp.id ? (
                          <>
                            <span className="w-2 h-2 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
                            Sincronizando...
                          </>
                        ) : 'Sincronizar Lote'}
                     </button>
                  )}
                </div>
                
                <div className="space-y-1 mt-4 text-xs font-medium text-slate-500">
                  <p>UF: <span className="text-slate-300">{comp.uf}</span></p>
                  <p>Ambiente: <span className={comp.environment === 'PRODUCAO' ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>{comp.environment}</span></p>
                  <p>Total DF-e: <span className="text-slate-300 font-bold">{comp._count?.documents || 0}</span></p>
                  
                  <div className="flex items-center gap-2 pt-1 pb-1">
                    <p>Auto Sync:</p>
                    <select 
                      value={comp.syncIntervalHours}
                      onChange={(e) => updateCompany.mutate({ companyId: comp.id, syncIntervalHours: Number(e.target.value) })}
                      disabled={updateCompany.isPending}
                      className="bg-slate-800 text-xs text-white border border-slate-700 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                       <option value={0}>Nenhum</option>
                       <option value={1}>1h</option>
                       <option value={2}>2h</option>
                       <option value={4}>4h</option>
                       <option value={8}>8h</option>
                       <option value={12}>12h</option>
                       <option value={24}>24h</option>
                    </select>
                  </div>
                  <div className="pt-2">
                    <p className="mb-1">Tipos para puxar:</p>
                    <div className="flex flex-wrap gap-2">
                      <label className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 uppercase font-bold tracking-wider">
                        <input
                          type="checkbox"
                          checked={comp.syncNFe !== false}
                          disabled={updateCompany.isPending}
                          onChange={(e) => updateCompany.mutate({ companyId: comp.id, syncNFe: e.target.checked })}
                          className="accent-emerald-500"
                        />
                        NF-e
                      </label>
                      <label className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 uppercase font-bold tracking-wider">
                        <input
                          type="checkbox"
                          checked={Boolean(comp.syncCTe)}
                          disabled={updateCompany.isPending}
                          onChange={(e) => updateCompany.mutate({ companyId: comp.id, syncCTe: e.target.checked })}
                          className="accent-emerald-500"
                        />
                        CT-e
                      </label>
                      <label className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 uppercase font-bold tracking-wider">
                        <input
                          type="checkbox"
                          checked={Boolean(comp.syncMDFe)}
                          disabled={updateCompany.isPending}
                          onChange={(e) => updateCompany.mutate({ companyId: comp.id, syncMDFe: e.target.checked })}
                          className="accent-emerald-500"
                        />
                        MDF-e
                      </label>
                    </div>
                  </div>
                  {comp.syncLogs && comp.syncLogs.length > 0 && (
                      <div className="mt-3 p-2 bg-[#020617] rounded border border-slate-800">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Última Sincronização</p>
                        <p className={`font-bold flex items-center gap-1.5 ${comp.syncLogs[0].status === 'SUCCESS' ? 'text-emerald-400' : 'text-rose-400'}`}>
                           <span className={`w-1.5 h-1.5 rounded-full ${comp.syncLogs[0].status === 'SUCCESS' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                           {comp.syncLogs[0].status === 'SUCCESS' ? 'Sucesso' : 'Erro'}
                           {comp.syncLogs[0].dfeType && <span className="text-slate-500 font-normal ml-1">({comp.syncLogs[0].dfeType})</span>}
                           <span className="text-slate-500 font-normal ml-1">
                             em {new Date(comp.syncLogs[0].createdAt).toLocaleString()}
                           </span>
                        </p>
                        {comp.syncLogs[0].status === 'ERROR' && comp.syncLogs[0].errorMessage && (
                            <div className="mt-2 p-2 bg-rose-500/5 border border-rose-500/10 rounded-md">
                                <p className="text-[10px] text-rose-500/80 font-mono whitespace-pre-wrap break-words">
                                    {comp.syncLogs[0].errorMessage}
                                </p>
                            </div>
                        )}
                      </div>
                  )}
                </div>
            </div>
            
            <div className="mt-6 pt-4 border-t border-slate-800">
              {comp.certificate ? (() => {
                  const expires = new Date(comp.certificate.expiresAt);
                  const daysLeft = differenceInDays(expires, new Date());
                  const expired = isPast(expires);

                  let statusText = '';
                  let colorClass = '';
                  let dotColor = '';

                  if (expired) {
                      statusText = `Expirado em ${expires.toLocaleDateString()}`;
                      colorClass = 'text-rose-400';
                      dotColor = 'bg-rose-500';
                  } else if (daysLeft <= 30) {
                      statusText = `Expira em ${daysLeft} dias (${expires.toLocaleDateString()})`;
                      colorClass = 'text-amber-400';
                      dotColor = 'bg-amber-500';
                  } else {
                      statusText = `Ativo até ${expires.toLocaleDateString()}`;
                      colorClass = 'text-emerald-400';
                      dotColor = 'bg-emerald-500';
                  }

                  return (
                      <div className="flex flex-col">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Certificado A1</p>
                        <div className="flex items-center gap-2">
                           <p className={`${colorClass} text-xs font-bold flex items-center gap-1.5`}>
                             <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
                             {statusText}
                             {(expired || daysLeft <= 30) && (
                                <AlertTriangle className={`w-4 h-4 ml-1 ${expired ? 'text-rose-500' : 'text-amber-500'}`} />
                             )}
                           </p>
                           <button 
                              onClick={() => { setCertData({ companyId: comp.id, password: '', file: null }); setCertError(''); }}
                              className="ml-auto text-[10px] uppercase tracking-wider font-bold text-slate-500 hover:text-white transition"
                           >
                             Substituir
                           </button>
                        </div>
                      </div>
                  );
              })() : (
                <div className="flex flex-col">
                  <p className="text-[10px] uppercase tracking-wider text-amber-500/80 font-bold mb-1">Atenção</p>
                  <p className="text-amber-500 text-xs mb-3 font-medium flex items-center gap-1.5">
                     <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Sem certificado
                  </p>
                  <button 
                    onClick={() => { setCertData({ companyId: comp.id, password: '', file: null }); setCertError(''); }}
                    className="flex items-center justify-center gap-2 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition border border-slate-700 disabled:opacity-50"
                  >
                    <FileUp size={14} /> Enviar .pfx
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold tracking-tight text-white mb-6">Nova Empresa</h2>
            <form onSubmit={e => { e.preventDefault(); createCompany.mutate(formData); }} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">CNPJ</label>
                <input required className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.cnpj} onChange={e => setFormData({...formData, cnpj: e.target.value})} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Razão Social</label>
                <input required className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Inscrição Estadual (Opcional)</label>
                <input className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.ie} onChange={e => setFormData({...formData, ie: e.target.value})} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">UF</label>
                <input required maxLength={2} className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white uppercase focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.uf} onChange={e => setFormData({...formData, uf: e.target.value.toUpperCase()})} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Ambiente SEFAZ</label>
                <select className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.environment} onChange={e => setFormData({...formData, environment: e.target.value})}>
                  <option value="HOMOLOGACAO">Homologação</option>
                  <option value="PRODUCAO">Produção</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Tipos de DF-e para puxar</label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex items-center justify-center gap-2 bg-[#020617] border border-slate-800 rounded-md p-2 text-xs text-slate-300 font-bold">
                    <input type="checkbox" className="accent-emerald-500" checked={formData.syncNFe} onChange={e => setFormData({...formData, syncNFe: e.target.checked})} /> NF-e
                  </label>
                  <label className="flex items-center justify-center gap-2 bg-[#020617] border border-slate-800 rounded-md p-2 text-xs text-slate-300 font-bold">
                    <input type="checkbox" className="accent-emerald-500" checked={formData.syncCTe} onChange={e => setFormData({...formData, syncCTe: e.target.checked})} /> CT-e
                  </label>
                  <label className="flex items-center justify-center gap-2 bg-[#020617] border border-slate-800 rounded-md p-2 text-xs text-slate-300 font-bold">
                    <input type="checkbox" className="accent-emerald-500" checked={formData.syncMDFe} onChange={e => setFormData({...formData, syncMDFe: e.target.checked})} /> MDF-e
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded transition">Cancelar</button>
                <button type="submit" disabled={createCompany.isPending} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-emerald-700 transition disabled:opacity-50">Salvar Empresa</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {certData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold tracking-tight text-white mb-6">Upload Certificado A1</h2>
            {certError && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-3 rounded-lg text-xs mb-6 font-medium">
                {certError}
              </div>
            )}
            <form onSubmit={e => { e.preventDefault(); uploadCert.mutate(certData); }} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Arquivo (.pfx)</label>
                <input type="file" accept=".pfx,.p12" required className="w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-emerald-500/10 file:text-emerald-500 hover:file:bg-emerald-500/20 file:transition-colors" onChange={e => setCertData({...certData, file: e.target.files?.[0] || null})} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Senha do Certificado</label>
                <input type="password" required className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={certData.password} onChange={e => setCertData({...certData, password: e.target.value})} />
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button type="button" onClick={() => { setCertData(null); setCertError(''); }} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded transition">Cancelar</button>
                <button type="submit" disabled={uploadCert.isPending || !certData.file} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-emerald-700 transition disabled:opacity-50">Enviar Certificado</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
