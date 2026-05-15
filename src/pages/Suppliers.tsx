import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { RefreshCw, Search } from 'lucide-react';

export default function Suppliers() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ cnpj: '', name: '', tradeName: '', ie: '', email: '', phone: '', uf: '', city: '', cep: '', address: '', number: '', complement: '', neighborhood: '', mainActivity: '', registrationStatus: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', page, search],
    queryFn: async () => {
      const res = await api.get('/suppliers', { params: { page, search } });
      return res.data;
    }
  });

  const saveSupplier = useMutation({
    mutationFn: (data: any) => api.post('/suppliers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setShowModal(false);
      setFormData({ cnpj: '', name: '', tradeName: '', ie: '', email: '', phone: '', uf: '', city: '', cep: '', address: '', number: '', complement: '', neighborhood: '', mainActivity: '', registrationStatus: '' });
    }
  });

  const deleteSupplier = useMutation({
    mutationFn: (id: string) => api.delete(`/suppliers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (err: any) => {
      alert('Erro ao excluir: ' + (err.response?.data?.error || err.message));
    }
  });

  const lookupCnpj = async () => {
    if (!formData.cnpj) return;
    try {
      const res = await api.post('/suppliers/lookup-cnpj', { cnpj: formData.cnpj });
      if (res.data) {
        setFormData(prev => ({
          ...prev,
          name: res.data.razaoSocial || prev.name,
          tradeName: res.data.nomeFantasia || prev.tradeName,
          uf: res.data.uf || prev.uf,
          ie: res.data.inscricaoEstadual || prev.ie,
          city: res.data.cidade || prev.city,
          cep: res.data.cep || prev.cep,
          address: res.data.logradouro || prev.address,
          number: res.data.numero || prev.number,
          complement: res.data.complemento || prev.complement,
          neighborhood: res.data.bairro || prev.neighborhood,
          email: res.data.email || prev.email,
          phone: res.data.telefone || prev.phone,
          mainActivity: res.data.atividadePrincipal || prev.mainActivity,
          registrationStatus: res.data.situacaoCadastral || prev.registrationStatus
        }));
      }
    } catch (err: any) {
      alert('Erro ao buscar CNPJ: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white tracking-tight">Fornecedores</h1>
        <div className="flex items-center gap-3 w-full sm:w-auto">
           <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Buscar por nome ou CNPJ..." 
                className="w-full bg-[#020617] border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none transition"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
           </div>
           <button 
             onClick={() => { setFormData({ cnpj: '', name: '', tradeName: '', ie: '', email: '', phone: '', uf: '', city: '', cep: '', address: '', number: '', complement: '', neighborhood: '', mainActivity: '', registrationStatus: '' }); setShowModal(true); }}
             className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-emerald-700 transition"
           >
             Novo Fornecedor
           </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex-1 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500 bg-[#020617]/50 border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 font-bold">CNPJ/Nome</th>
                <th className="px-6 py-4 font-bold">Contato</th>
                <th className="px-6 py-4 font-bold">Localidade</th>
                <th className="px-6 py-4 font-bold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">Carregando...</td></tr>
              ) : data?.data?.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">Nenhum fornecedor encontrado</td></tr>
              ) : (
                data?.data?.map((sup: any) => (
                  <tr key={sup.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4">
                       <div className="font-bold text-white">{sup.name}</div>
                       <div className="text-xs text-slate-500 font-mono mt-0.5">{sup.cnpj} {sup.ie && `• IE: ${sup.ie}`}</div>
                       {sup.tradeName && <div className="text-[10px] text-slate-400 mt-0.5 uppercase">{sup.tradeName}</div>}
                    </td>
                    <td className="px-6 py-4">
                       <div className="text-slate-300">{sup.email || '-'}</div>
                       <div className="text-xs text-slate-500 mt-0.5">{sup.phone || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                       <div className="text-slate-300">{sup.city ? `${sup.city} - ${sup.uf}` : sup.uf || '-'}</div>
                       {sup.registrationStatus && (
                          <div className={`mt-1 text-[10px] uppercase font-bold tracking-wider inline-block px-2 py-0.5 rounded-full ${sup.registrationStatus === 'ATIVA' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                             {sup.registrationStatus}
                          </div>
                       )}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button onClick={() => { setFormData(sup as any); setShowModal(true); }} className="text-emerald-500 hover:text-emerald-400 uppercase text-[10px] font-bold tracking-wider mr-4">Editar</button>
                       <button onClick={() => { if(confirm('Excluir fornecedor?')) deleteSupplier.mutate(sup.id); }} className="text-rose-500 hover:text-rose-400 uppercase text-[10px] font-bold tracking-wider">Excluir</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

       <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-900 p-4 border border-slate-800 rounded-xl">
        <p>Total: <strong className="text-white">{data?.total || 0}</strong> fornecedores</p>
        <div className="flex gap-2">
          <button 
            disabled={page === 1} 
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded transition disabled:opacity-50"
          >
            Anterior
          </button>
          <button 
            disabled={!data || data.data.length < data.limit} 
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded transition disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold tracking-tight text-white mb-6">{formData.cnpj && formData.name ? 'Editar' : 'Novo'} Fornecedor</h2>
            <form onSubmit={e => { e.preventDefault(); saveSupplier.mutate(formData); }} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div className="col-span-1 sm:col-span-2 flex items-end gap-2">
                   <div className="flex-1">
                     <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">CNPJ</label>
                     <input required className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.cnpj} onChange={e => setFormData({...formData, cnpj: e.target.value})} />
                   </div>
                   <button type="button" onClick={lookupCnpj} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-md text-xs font-bold transition h-[38px] flex items-center justify-center gap-2">
                     <Search size={14} /> Buscar
                   </button>
                 </div>
                 
                 <div className="col-span-1 sm:col-span-2">
                   <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Razão Social</label>
                   <input required className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 </div>

                 <div className="col-span-1 sm:col-span-2">
                   <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Nome Fantasia</label>
                   <input className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.tradeName} onChange={e => setFormData({...formData, tradeName: e.target.value})} />
                 </div>

                 <div>
                   <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Inscrição Estadual</label>
                   <input className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.ie} onChange={e => setFormData({...formData, ie: e.target.value})} />
                 </div>
                 <div>
                   <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Status Receita</label>
                   <input className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none uppercase" value={formData.registrationStatus} onChange={e => setFormData({...formData, registrationStatus: e.target.value.toUpperCase()})} />
                 </div>

                 <div>
                   <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">E-mail</label>
                   <input className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                 </div>
                 <div>
                   <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Telefone</label>
                   <input className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                 </div>

                 <div className="col-span-1 sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">CEP</label>
                    <input className="w-[150px] bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.cep} onChange={e => setFormData({...formData, cep: e.target.value})} />
                 </div>

                 <div className="col-span-1 sm:col-span-2 flex gap-4">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Logradouro</label>
                      <input className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                    </div>
                    <div className="w-24">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Número</label>
                      <input className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})} />
                    </div>
                 </div>

                 <div>
                   <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Complemento</label>
                   <input className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.complement} onChange={e => setFormData({...formData, complement: e.target.value})} />
                 </div>
                 <div>
                   <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Bairro</label>
                   <input className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.neighborhood} onChange={e => setFormData({...formData, neighborhood: e.target.value})} />
                 </div>

                 <div>
                   <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Cidade</label>
                   <input className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                 </div>
                 <div>
                   <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">UF</label>
                   <input maxLength={2} className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white uppercase focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.uf} onChange={e => setFormData({...formData, uf: e.target.value.toUpperCase()})} />
                 </div>

                 <div className="col-span-1 sm:col-span-2">
                   <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Atividade Principal</label>
                   <input className="w-full bg-[#020617] border border-slate-800 rounded-md p-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none text-xs" value={formData.mainActivity} onChange={e => setFormData({...formData, mainActivity: e.target.value})} />
                 </div>

              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded transition">Cancelar</button>
                <button type="submit" disabled={saveSupplier.isPending} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-emerald-700 transition disabled:opacity-50">Salvar Fornecedor</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
