import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { Terminal, Calendar, Filter } from 'lucide-react';

export default function AdminLogs() {
  const [page, setPage] = useState(1);
  const [filterCompany, setFilterCompany] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: companiesData } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: async () => {
      const res = await api.get('/admin/companies');
      return res.data;
    }
  });

  const { data: logsData, isLoading, error } = useQuery({
    queryKey: ['admin-logs', page, filterCompany, startDate, endDate],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page), limit: '15' });
      if (filterCompany) qs.append('companyId', filterCompany);
      if (startDate) qs.append('startDate', startDate);
      if (endDate) qs.append('endDate', endDate);
      const res = await api.get(`/admin/logs?${qs.toString()}`);
      return res.data;
    }
  });

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
           <Terminal size={28} className="text-emerald-500" />
           Logs de Sincronização (Administrador)
        </h1>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
             <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
               <Filter size={12} />
               Filtrar por Empresa
             </label>
             <select 
               className="w-full bg-[#020617] border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
               value={filterCompany}
               onChange={e => { setFilterCompany(e.target.value); setPage(1); }}
             >
               <option value="">Todas as Empresas</option>
               {companiesData?.map((comp: any) => (
                 <option key={comp.id} value={comp.id}>{comp.name} ({comp.cnpj})</option>
               ))}
             </select>
          </div>
          
          <div className="sm:w-64">
             <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
               <Calendar size={12} />
               Data Inicial
             </label>
             <input 
               type="date"
               className="w-full bg-[#020617] border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
               value={startDate}
               onChange={e => { setStartDate(e.target.value); setPage(1); }}
             />
          </div>

          <div className="sm:w-64">
             <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
               <Calendar size={12} />
               Data Final
             </label>
             <input 
               type="date"
               className="w-full bg-[#020617] border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
               value={endDate}
               onChange={e => { setEndDate(e.target.value); setPage(1); }}
             />
          </div>
      </div>

      <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
        {isLoading ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-4">
              <div className="w-8 h-8 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
              <p className="font-mono text-sm">Carregando logs...</p>
            </div>
        ) : error ? (
            <div className="p-8 text-center text-rose-500 bg-rose-500/5 m-4 rounded-xl border border-rose-500/10">
              <p className="font-bold mb-1">Acesso Negado</p>
              <p className="text-sm opacity-80">Você precisa ter a permissão de SUPERADMIN para visualizar esta página.</p>
            </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto flex-1 p-0">
            <table className="w-full text-left text-sm text-slate-300 min-w-[700px]">
              <thead>
                <tr className="text-[10px] uppercase text-slate-500 tracking-wider border-b border-slate-800 bg-slate-900/50">
                  <th className="px-6 py-4 font-bold whitespace-nowrap">Data/Hora</th>
                  <th className="px-6 py-4 font-bold whitespace-nowrap">Empresa (CNPJ)</th>
                  <th className="px-6 py-4 font-bold whitespace-nowrap">Status</th>
                  <th className="px-6 py-4 font-bold whitespace-nowrap">Detalhes do Evento</th>
                </tr>
              </thead>
              <tbody className="text-xs font-mono">
                {logsData?.data?.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500 font-sans">Nenhum log encontrado para os filtros selecionados.</td></tr>
                ) : (
                  logsData?.data?.map((log: any) => (
                    <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800 transition">
                      <td className="px-6 py-4 whitespace-nowrap text-slate-400">{new Date(log.createdAt).toLocaleString('pt-BR')}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-sans">
                         <p className="font-bold text-white max-w-[200px] truncate">{log.company.name}</p>
                         <p className="font-mono text-xs text-slate-500 mt-0.5">{log.company.cnpj}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                         <span className={`px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider font-bold ${log.status === 'ERROR' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                            {log.status}
                         </span>
                      </td>
                      <td className="px-6 py-4">
                         <div className={`p-2 rounded-lg text-[11px] ${log.status === 'ERROR' ? 'bg-rose-500/5 text-rose-400 border border-rose-500/10 whitespace-pre-wrap' : 'text-slate-500'}`}>
                             {log.errorMessage || 'Sincronização concluída com sucesso'}
                         </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {logsData && logsData.total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-slate-800 bg-slate-900/50">
            <span className="text-xs text-slate-500">
              Mostrando <span className="text-white font-medium">{logsData.data.length}</span> de <span className="text-white font-medium">{logsData.total}</span> logs
            </span>
            <div className="flex gap-2">
              <button 
                disabled={page === 1} 
                onClick={() => setPage(page - 1)}
                className="px-3 py-1.5 bg-[#020617] border border-slate-800 text-slate-300 rounded-lg text-xs font-bold uppercase tracking-wider disabled:opacity-50 hover:bg-slate-800 transition"
              >
                Anterior
              </button>
              <button 
                disabled={page >= logsData.totalPages} 
                onClick={() => setPage(page + 1)}
                className="px-3 py-1.5 bg-[#020617] border border-slate-800 text-slate-300 rounded-lg text-xs font-bold uppercase tracking-wider disabled:opacity-50 hover:bg-slate-800 transition"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
