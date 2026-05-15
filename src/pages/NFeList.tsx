import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { Search, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import formatXml from 'xml-formatter';

export default function NFeList() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterSerie, setFilterSerie] = useState('');
  const [debouncedSerie, setDebouncedSerie] = useState('');
  const [filterNNF, setFilterNNF] = useState('');
  const [debouncedNNF, setDebouncedNNF] = useState('');
  const [sortBy, setSortBy] = useState('issueDate');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [eventsModalDoc, setEventsModalDoc] = useState<any>(null);
  const [eventsList, setEventsList] = useState<any[]>([]);

  useEffect(() => {
    const tSearch = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(tSearch);
  }, [search]);

  useEffect(() => {
    const tNNF = setTimeout(() => setDebouncedNNF(filterNNF), 500);
    return () => clearTimeout(tNNF);
  }, [filterNNF]);

  useEffect(() => {
    const tSerie = setTimeout(() => setDebouncedSerie(filterSerie), 500);
    return () => clearTimeout(tSerie);
  }, [filterSerie]);

  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await api.get('/companies');
      return res.data;
    }
  });

  const handleSearch = (e: any) => {
      setSearch(e.target.value);
      setPage(1);
  };

  const handleFilterNNF = (e: any) => {
      setFilterNNF(e.target.value);
      setPage(1);
  };

  const handleFilterSerie = (e: any) => {
      setFilterSerie(e.target.value);
      setPage(1);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['nfe', debouncedSearch, page, startDate, endDate, filterStatus, sortBy, sortOrder, debouncedNNF, debouncedSerie, filterCompany],
    queryFn: async () => {
      const qs = new URLSearchParams({ 
          search: debouncedSearch, 
          page: String(page), 
          limit: '10',
          sortBy,
          sortOrder
      });
      if (startDate) qs.append('startDate', startDate);
      if (endDate) qs.append('endDate', endDate);
      if (filterStatus) qs.append('status', filterStatus);
      if (debouncedNNF) qs.append('nNF', debouncedNNF);
      if (debouncedSerie) qs.append('serie', debouncedSerie);
      if (filterCompany) qs.append('companyId', filterCompany);

      const res = await api.get(`/nfe?${qs.toString()}`);
      return res.data;
    }
  });

  const manifestMutation = useMutation({
      mutationFn: ({ docId, tpEvento }: { docId: string, tpEvento: string }) => 
          api.post(`/nfe/${docId}/manifest`, { tpEvento, xJust: tpEvento === '210240' || tpEvento === '210220' ? 'Desconheço esta operacao' : '' }),
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['nfe'] });
          alert('Manifestação registrada com sucesso!');
      },
      onError: (err: any) => {
          alert('Erro ao manifestar: ' + (err.response?.data?.error || err.message));
      }
  });

  useEffect(() => {
    // Only fetch science manifests for pending notes - fire and forget
    if (data?.data && Array.isArray(data.data)) {
      data.data.forEach((doc: any) => {
        if (doc.status === 'PENDING') {
          api.post(`/nfe/${doc.id}/manifest`, { tpEvento: '210210', xJust: '' }).then(() => {
            queryClient.invalidateQueries({ queryKey: ['nfe'] });
          }).catch(console.error);
        }
      });
    }
  }, [data?.data, queryClient]);

  const handleExportCSV = () => {
    if (!data?.data || data.data.length === 0) {
      alert('Nenhum dado para exportar.');
      return;
    }
    const headers = ['Empresa Destinatária', 'CNPJ Destinatária', 'Emissão', 'Fornecedor', 'CNPJ Fornecedor', 'Chave de Acesso', 'Valor (R$)', 'Status'];
    const rows = data.data.map((doc: any) => [
      doc.company?.name || '',
      doc.company?.cnpj || '',
      new Date(doc.issueDate).toLocaleDateString(),
      doc.supplier?.name || '',
      doc.supplier?.cnpj || '',
      doc.chNFe,
      `"${doc.valueTotal?.toFixed(2) || '0.00'}"`,
      doc.status
    ]);
    const csvContent = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notas_fiscais.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const getStatusInfo = (status: string, manifestStatus?: string) => {
      if (status === 'DOWNLOADED') return { label: 'XML Baixado', bg: 'bg-emerald-500/10 text-emerald-400', tp: 'O XML completo da nota já foi baixado no sistema.' };
      if (status === 'ERROR') return { label: 'Erro', bg: 'bg-rose-500/10 text-rose-400', tp: 'Ocorreu um erro ao processar ou manifestar esta nota fisal.' };
      if (status === 'MANIFESTED') {
          const label = manifestStatus === 'CONFIRM' ? 'Confirmada' : manifestStatus === 'SCIENCE' ? 'Ciência' : manifestStatus === 'DENY' ? 'Desconhecida' : 'Manifestada';
          return { label, bg: 'bg-sky-500/10 text-sky-400', tp: `A NFe foi manifestada na SEFAZ (${label}). Aguardando liberação do XML.` };
      }
      return { label: 'Pendente', bg: 'bg-amber-500/10 text-amber-400', tp: 'A nota foi identificada, mas requer manifestação para download do XML completo.' };
  };

  const handleSort = (column: string) => {
      if (sortBy === column) {
          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
          setSortBy(column);
          setSortOrder('desc');
      }
      setPage(1);
  };

  const handleDownloadXml = (doc: any) => {
      if (!doc.xml) {
          alert('XML não disponível para esta nota.');
          return;
      }
      const blob = new Blob([doc.xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.chNFe}-nfe.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const totalPages = data?.total ? Math.ceil(data.total / 10) : 1;

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
           <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
           Notas Fiscais de Entrada
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:flex xl:flex-wrap items-center gap-3">
          <button 
             onClick={handleExportCSV}
             className="px-4 py-2 bg-[#020617] text-emerald-500 font-bold text-sm justify-center rounded-md border border-slate-800 hover:bg-slate-800 transition flex items-center gap-2 w-full xl:w-auto"
          >
             <Download size={16} /> Exportar CSV
          </button>
          
          <div className="flex items-center gap-2">
            <input 
                type="text" 
                placeholder="Série" 
                className="w-full xl:w-20 px-3 py-1.5 bg-[#020617] border border-slate-800 rounded-md outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-slate-200"
                value={filterSerie}
                onChange={handleFilterSerie}
            />

            <input 
                type="text" 
                placeholder="Número NF" 
                className="w-full xl:w-28 px-3 py-1.5 bg-[#020617] border border-slate-800 rounded-md outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-slate-200"
                value={filterNNF}
                onChange={handleFilterNNF}
            />
          </div>

          <div className="flex items-center gap-2">
            <select 
              value={filterCompany}
              onChange={e => {setFilterCompany(e.target.value); setPage(1);}}
              className="w-full bg-[#020617] text-slate-300 text-sm outline-none px-3 py-1.5 border border-slate-800 rounded-md focus:ring-2 focus:ring-emerald-500 xl:max-w-[200px]"
            >
              <option disabled value="">Selecione uma Empresa</option>
              {companies?.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <select 
              value={filterStatus}
              onChange={e => {setFilterStatus(e.target.value); setPage(1);}}
              className="w-full bg-[#020617] text-slate-300 text-sm outline-none px-3 py-1.5 border border-slate-800 rounded-md focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Todos os Status</option>
              <option value="PENDING">Pendente</option>
              <option value="MANIFESTED">Manifestada</option>
              <option value="DOWNLOADED">XML Baixado</option>
              <option value="ERROR">Erro</option>
            </select>
          </div>

          <div className="flex flex-1 xl:flex-none items-center justify-between gap-2 bg-[#020617] border border-slate-800 rounded-md p-1">
             <input type="date" className="w-full bg-transparent text-slate-300 text-sm outline-none px-1 py-1 [color-scheme:dark]" value={startDate} onChange={e => {setStartDate(e.target.value); setPage(1);}} />
             <span className="text-slate-500 text-xs">até</span>
             <input type="date" className="w-full bg-transparent text-slate-300 text-sm outline-none px-1 py-1 [color-scheme:dark]" value={endDate} onChange={e => {setEndDate(e.target.value); setPage(1);}} />
          </div>

          <div className="relative w-full xl:w-72 md:col-span-2 lg:col-span-4 xl:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
                type="text" 
                placeholder="Buscar por Fornecedor ou Chave NFe..." 
                className="w-full pl-10 pr-4 py-2 bg-[#020617] border border-slate-800 rounded-md xl:rounded-full outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-slate-200 placeholder-slate-500"
                value={search}
                onChange={handleSearch}
            />
          </div>
        </div>
      </div>

      <div className="bg-sky-500/10 border border-sky-500/20 p-4 rounded-xl flex items-start gap-3">
         <span className="text-xl">💡</span>
         <p className="text-xs text-sky-400 leading-relaxed font-medium">
            <strong>Como fazer aparecer os XMLs completos?</strong> A SEFAZ retorna inicialmente apenas um resumo da nota fiscal (sem os itens). Para liberar o download do XML completo, você deve realizar a manifestação de <strong>Confirmação</strong> ou <strong>Ciência</strong> na nota pendente. Após manifestar, aguarde alguns minutos e realize a sincronização do lote na página de Empresas. O XML completo será disponibilizado e o status passará para "XML Baixado".
         </p>
      </div>

      <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 flex flex-col min-h-0 overflow-hidden">
        {isLoading ? (
            <div className="px-6 py-8 text-center text-slate-500">Carregando...</div>
        ) : data?.data?.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-500">Nenhuma nota encontrada.</div>
        ) : (
            <div className="overflow-x-auto overflow-y-auto flex-1 p-0 sm:p-6 space-y-8">
              {Object.entries(
                data?.data?.reduce((acc: any, doc: any) => {
                  const compId = doc.companyId;
                  if (!acc[compId]) acc[compId] = { company: doc.company, docs: [] };
                  acc[compId].docs.push(doc);
                  return acc;
                }, {}) || {}
              ).map(([compId, group]: any) => (
                <div key={compId} className="bg-[#020617] rounded-xl border border-slate-800 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/20 flex items-center justify-between">
                     <h3 className="text-sm font-bold text-white flex items-center gap-2">
                       <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                       {group.company?.name || 'Desconhecida'}
                     </h3>
                     <span className="text-xs text-slate-500 font-mono">{group.company?.cnpj}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300 min-w-[800px]">
                      <thead>
                        <tr className="text-[10px] uppercase text-slate-500 tracking-wider border-b border-slate-800">
                          <th className="px-6 py-3 font-bold cursor-pointer hover:bg-slate-800 transition whitespace-nowrap" onClick={() => handleSort('supplier')}>Fornecedor {sortBy === 'supplier' && (sortOrder === 'asc' ? '↑' : '↓')}</th>
                          <th className="px-6 py-3 font-bold whitespace-nowrap">Chave de Acesso</th>
                          <th className="px-6 py-3 font-bold cursor-pointer hover:bg-slate-800 transition whitespace-nowrap" onClick={() => handleSort('issueDate')}>Emissão {sortBy === 'issueDate' && (sortOrder === 'asc' ? '↑' : '↓')}</th>
                          <th className="px-6 py-3 font-bold cursor-pointer hover:bg-slate-800 transition whitespace-nowrap" onClick={() => handleSort('valueTotal')}>Valor (R$) {sortBy === 'valueTotal' && (sortOrder === 'asc' ? '↑' : '↓')}</th>
                          <th className="px-6 py-3 font-bold text-center whitespace-nowrap">Status</th>
                          <th className="px-6 py-3 font-bold text-right whitespace-nowrap">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs font-mono">
                        {group.docs.map((doc: any) => {
                          const statusInfo = getStatusInfo(doc.status, doc.manifestStatus);
                          return (
                          <tr key={doc.id} className="border-b border-slate-800/50 hover:bg-slate-800 transition group">
                            <td className="px-6 py-4 text-white font-medium font-sans">
                                <p className="truncate max-w-[200px]">{doc.supplier?.name || 'Desconhecido'}</p>
                                <p className="text-[10px] text-slate-500 mt-1 font-mono">{doc.supplier?.cnpj}</p>
                            </td>
                            <td className="px-6 py-4 text-slate-500">{doc.chNFe}</td>
                            <td className="px-6 py-4 text-slate-300">{new Date(doc.issueDate).toLocaleDateString()}</td>
                            <td className="px-6 py-4 text-white font-medium">
                                {(doc.valueTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 text-center">
                                <span 
                                  title={statusInfo.tp}
                                  className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider cursor-help ${statusInfo.bg}`}
                                >
                                    {statusInfo.label}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-right flex items-center justify-end gap-3 h-[72px]">
                                {doc.status === 'DOWNLOADED' && (
                                    <button 
                                        onClick={() => handleDownloadXml(doc)}
                                        className="text-sky-500 font-sans hover:underline text-[11px] font-bold uppercase"
                                    >
                                        Baixar XML
                                    </button>
                                )}
                                <button 
                                    onClick={() => {
                                        api.get(`/nfe/${doc.id}/events`).then((res: any) => setEventsList(res.data)).catch(console.error);
                                        setEventsModalDoc(doc);
                                    }}
                                    className="text-amber-500 font-sans hover:underline text-[11px] font-bold uppercase"
                                >
                                    Eventos
                                </button>
                                <button 
                                    onClick={() => setSelectedDoc(doc)}
                                    className="text-emerald-500 font-sans hover:underline text-[11px] font-bold uppercase"
                                >
                                    Ver Detalhes
                                </button>
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
        )}
        {data && data.total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-0 px-6 py-4 border-t border-slate-800 bg-slate-900/50">
            <span className="text-xs text-slate-500 text-center sm:text-left">
              Mostrando <span className="font-bold text-slate-300">{((page - 1) * 10) + 1}</span> a <span className="font-bold text-slate-300">{Math.min(page * 10, data.total)}</span> de <span className="font-bold text-slate-300">{data.total}</span> registros
            </span>
            <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
              <button 
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50 transition"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-medium text-slate-400">Pág {page} de {totalPages}</span>
              <button 
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50 transition"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedDoc && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white tracking-tight">Detalhes da NF-e</h2>
                <button onClick={() => setSelectedDoc(null)} className="text-slate-500 hover:text-white transition">✕</button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div className="bg-[#020617] p-3 rounded-lg border border-slate-800">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Chave de Acesso</p>
                      <p className="font-mono text-xs text-white break-all mt-1">{selectedDoc.chNFe}</p>
                  </div>
                  <div className="bg-[#020617] p-3 rounded-lg border border-slate-800">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Valor Total</p>
                      <p className="text-lg font-bold text-emerald-400 mt-1">R$ {(selectedDoc.valueTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-[#020617] p-3 rounded-lg border border-slate-800">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Fornecedor</p>
                      <p className="font-medium text-sm text-white mt-1">{selectedDoc.supplier?.name}</p>
                      <p className="text-xs font-mono text-slate-400">{selectedDoc.supplier?.cnpj}</p>
                  </div>
                  <div className="bg-[#020617] p-3 rounded-lg border border-slate-800">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Emissão</p>
                      <p className="text-sm font-mono text-white mt-1">{new Date(selectedDoc.issueDate).toLocaleString()}</p>
                  </div>
              </div>

              {!['CONFIRM', 'DENY'].includes(selectedDoc.manifestStatus) && (
                  <div className="bg-[#020617] p-5 rounded-xl border border-slate-800 mb-6">
                      <h3 className="font-bold text-white mb-4 text-sm flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                        Ação Requerida: Manifestação
                      </h3>
                      <div className="flex flex-wrap gap-2">
                          <button 
                              disabled={manifestMutation.isPending}
                              onClick={() => {
                                  if (window.confirm("Deseja realmente registrar a Ciência desta Nota Fiscal?")) {
                                      manifestMutation.mutate({ docId: selectedDoc.id, tpEvento: '210210' });
                                  }
                              }}
                              className="px-4 py-2 bg-slate-800 text-white hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold transition uppercase tracking-wider"
                          >
                              Ciência
                          </button>
                          <button 
                              disabled={manifestMutation.isPending}
                              onClick={() => {
                                  if (window.confirm("Deseja realmente Confirmar esta Operação? Esta ação não pode ser desfeita.")) {
                                      manifestMutation.mutate({ docId: selectedDoc.id, tpEvento: '210200' });
                                  }
                              }}
                              className="px-4 py-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-xs font-bold transition uppercase tracking-wider"
                          >
                              Confirmar Operação
                          </button>
                          <button 
                              disabled={manifestMutation.isPending}
                              onClick={() => {
                                  if (window.confirm("Deseja realmente Desconhecer esta Operação?")) {
                                      manifestMutation.mutate({ docId: selectedDoc.id, tpEvento: '210220' });
                                  }
                              }}
                              className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs font-bold transition uppercase tracking-wider"
                          >
                              Desconhecimento
                          </button>
                      </div>
                      <p className="text-[10px] mt-4 text-slate-500 tracking-wide">
                          *A Confirmação comandará a SEFAZ a liberar o XML completo.
                      </p>
                  </div>
              )}

              {selectedDoc.xml && (
                  <div>
                      <h3 className="font-bold text-white text-sm mb-3 text-emerald-400 flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                        Conteúdo XML Completo
                      </h3>
                      <pre className="bg-[#020617] p-4 rounded-xl border border-slate-800 text-[11px] font-mono whitespace-pre-wrap break-all text-slate-400 max-h-96 overflow-auto text-left">
                          <code>
                          {(() => {
                              try {
                                  return formatXml(selectedDoc.xml, { collapseContent: true, lineSeparator: '\n' });
                              } catch(e) {
                                  return selectedDoc.xml;
                              }
                          })()}
                          </code>
                      </pre>
                  </div>
              )}
            </div>
          </div>
      )}

      {eventsModalDoc && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
              <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Eventos da NF-e</h2>
                  <p className="text-xs text-slate-500 font-mono mt-1">{eventsModalDoc.chNFe}</p>
                </div>
                <button onClick={() => setEventsModalDoc(null)} className="text-slate-500 hover:text-white transition">✕</button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                 {eventsList.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">Nenhum evento registrado para esta nota.</div>
                 ) : (
                    <div className="space-y-4">
                      {eventsList.map(ev => (
                        <div key={ev.id} className="bg-[#020617] p-4 rounded-xl border border-slate-800 relative">
                           <div className="absolute top-4 right-4 text-[10px] text-slate-500 font-mono">
                             {new Date(ev.dhEvento).toLocaleString()}
                           </div>
                           <h4 className="font-bold text-white text-sm">
                              {ev.descEvento || 'Sem descrição'}
                           </h4>
                           <div className="mt-2 text-xs text-slate-400 grid grid-cols-2 gap-2">
                              <p><strong>Tipo Evento (tpEvento):</strong> <span className="font-mono text-emerald-400">{ev.tpEvento}</span></p>
                              <p><strong>Sequencial:</strong> <span className="font-mono">{ev.nSeqEvento}</span></p>
                           </div>
                           {ev.xml && (
                               <details className="mt-3 text-xs">
                                  <summary className="text-sky-500 cursor-pointer hover:underline mb-2 font-medium">Ver XML do Evento</summary>
                                  <pre className="p-3 bg-slate-900 rounded-lg text-[10px] overflow-auto max-h-48 whitespace-pre-wrap break-all text-slate-500">
                                      {(() => {
                                          try {
                                              return formatXml(ev.xml, { collapseContent: true });
                                          } catch(e) {
                                              return ev.xml;
                                          }
                                      })()}
                                  </pre>
                               </details>
                           )}
                        </div>
                      ))}
                    </div>
                 )}
              </div>
            </div>
          </div>
      )}
    </div>
  );
}
