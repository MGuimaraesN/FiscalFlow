import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const res = await api.get('/dashboard');
      return res.data;
    }
  });

  if (isLoading) return <div className="text-slate-400">Carregando dashboard...</div>;

  return (
    <div className="flex flex-col h-full">
      <h1 className="text-2xl font-bold tracking-tight text-white mb-6">Dashboard</h1>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        
        {/* Stat: Total Notas */}
        <div className="col-span-1 p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between min-h-[140px]">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-tight mb-2">Total de Notas</span>
          <div>
            <span className="text-3xl font-bold text-white tracking-tighter">{data?.totalCount || 0}</span>
          </div>
        </div>
        
        {/* Stat: Valor Total */}
        <div className="col-span-1 p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between min-h-[140px]">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-tight mb-2">Valor Total (R$)</span>
          <div>
            <span className="text-3xl font-bold text-emerald-500 tracking-tighter">
              R$ {(data?.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Stat: Manifestadas */}
        <div className="col-span-1 p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between min-h-[140px]">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-tight mb-2">Manifestadas</span>
          <div>
            <span className="text-3xl font-bold text-teal-400 tracking-tighter">{data?.manifestsDone || 0}</span>
          </div>
        </div>

        {/* Stat: Pendentes */}
        <div className="col-span-1 p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between min-h-[140px]">
          <span className="text-xs text-amber-500/80 font-medium uppercase tracking-tight mb-2">Manifestos Pendentes</span>
          <div>
            <span className="text-3xl font-bold text-amber-500 tracking-tighter">{data?.pendingManifests || 0}</span>
            <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-wider">Aguardando ação</p>
          </div>
        </div>
      </div>
    </div>
  );
}
