import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { Terminal } from 'lucide-react';

export default function AdminLogs() {
  const { data: logs, isLoading, error } = useQuery({
    queryKey: ['admin-logs'],
    queryFn: async () => {
      const res = await api.get('/admin/logs');
      return res.data;
    }
  });

  return (
    <div className="flex flex-col h-full space-y-6">
      <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
         <Terminal size={24} className="text-emerald-500" />
         Logs do Sistema (Administrador)
      </h1>

      <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
        {isLoading ? (
            <div className="p-8 text-center text-slate-500">Carregando logs...</div>
        ) : error ? (
            <div className="p-8 text-center text-rose-500 bg-rose-500/10 m-4 rounded border border-rose-500/20">Erro ao carregar logs. Você precisa ter a permissão de SUPERADMIN.</div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto flex-1 p-0">
            <table className="w-full text-left text-sm text-slate-300 min-w-[700px]">
              <thead>
                <tr className="text-[10px] uppercase text-slate-500 tracking-wider border-b border-slate-800">
                  <th className="px-6 py-4 font-bold whitespace-nowrap">Data/Hora</th>
                  <th className="px-6 py-4 font-bold whitespace-nowrap">Empresa (CNPJ)</th>
                  <th className="px-6 py-4 font-bold whitespace-nowrap">Status</th>
                  <th className="px-6 py-4 font-bold whitespace-nowrap">Erro</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {logs.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">Nenhum log encontrado.</td></tr>
                ) : (
                  logs.map((log: any) => (
                    <tr key={log.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition">
                      <td className="px-6 py-4 font-mono whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                         <p className="font-bold text-white max-w-[200px] truncate">{log.company.name}</p>
                         <p className="font-mono text-slate-500">{log.company.cnpj}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                         <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold ${log.status === 'ERROR' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                            {log.status}
                         </span>
                      </td>
                      <td className="px-6 py-4">
                         <p className={`line-clamp-2 ${log.status === 'ERROR' ? 'text-rose-400' : 'text-slate-500'}`} title={log.errorMessage}>
                             {log.errorMessage || '-'}
                         </p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
