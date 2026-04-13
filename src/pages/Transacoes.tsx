import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatDate, getMonthRange } from '@/lib/format';
import { CATEGORIAS, CATEGORIAS_DESPESA, CATEGORIAS_RECEITA, CATEGORIAS_CONFIG, getCategoriaColor, getSubcategorias } from '@/types/database.types';
import { useCategorias } from '@/hooks/useCategorias';
import { CategoriaSelector } from '@/components/CategoriaSelector';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Trash2, Search, Download, Copy, EyeOff, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { exportCSV, copyToClipboard } from '@/lib/export';
import { MonthSelector } from '@/components/MonthSelector';
import { RecategorizarModal } from '@/components/transacoes/RecategorizarModal';

export default function TransacoesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [filterCategoria, setFilterCategoria] = useState('all');
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterEssencial, setFilterEssencial] = useState('all');
  const [filterConta, setFilterConta] = useState('all');
  const [filterPessoa, setFilterPessoa] = useState('all');
  const [search, setSearch] = useState('');
  const [editingTx, setEditingTx] = useState<any>(null);
  const [learnPattern, setLearnPattern] = useState(false);
  const [showIgnoradas, setShowIgnoradas] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [recatTransactions, setRecatTransactions] = useState<any[]>([]);
  const [recatCategoria, setRecatCategoria] = useState<{ nome: string; id: string | null; essencial: boolean }>({ nome: '', id: null, essencial: false });
  const [recatOpen, setRecatOpen] = useState(false);

  // Read URL params on mount
  useEffect(() => {
    const cat = searchParams.get('categoria');
    const tipo = searchParams.get('tipo');
    const essencial = searchParams.get('essencial');
    if (cat) setFilterCategoria(cat);
    if (tipo) setFilterTipo(tipo);
    if (essencial) setFilterEssencial(essencial);
  }, [searchParams]);

  const { start, end } = getMonthRange(month, year);

  const { data: contas } = useQuery({
    queryKey: ['contas', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('contas').select('*').eq('user_id', user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: transacoes } = useQuery({
    queryKey: ['transacoes', user?.id, start, end],
    queryFn: async () => {
      const { data } = await supabase
        .from('transacoes')
        .select('*')
        .eq('user_id', user!.id)
        .gte('data', start)
        .lte('data', end)
        .order('data', { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const updateMutation = useMutation({
    mutationFn: async (tx: { id: string; categoria: string; categoria_id: string | null; essencial: boolean; ignorar_dashboard: boolean }) => {
      await supabase.from('transacoes').update({
        categoria: tx.categoria,
        categoria_id: tx.categoria_id,
        essencial: tx.essencial,
        ignorar_dashboard: tx.ignorar_dashboard,
      }).eq('id', tx.id);

      let savedPattern: string | null = null;
      if (learnPattern && editingTx) {
        savedPattern = editingTx.descricao;
        await supabase.from('regras_categorizacao').insert({
          user_id: user!.id,
          padrao: editingTx.descricao,
          categoria: tx.categoria,
          categoria_id: tx.categoria_id,
          essencial: tx.essencial,
          aprendido_auto: false,
        });
      }
      return { savedPattern, categoria: tx.categoria, categoria_id: tx.categoria_id, essencial: tx.essencial };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      const closedTxId = editingTx?.id;
      setEditingTx(null);
      toast({ title: 'Transação atualizada' });

      if (result?.savedPattern && user) {
        const pattern = result.savedPattern.toLowerCase();
        const { data: outrosCat } = await supabase
          .from('categorias')
          .select('id')
          .eq('user_id', user.id)
          .eq('nome', 'Outros')
          .is('parent_id', null)
          .maybeSingle();

        let query = supabase
          .from('transacoes')
          .select('id, data, descricao, valor, tipo, pessoa, categoria, categoria_id')
          .eq('user_id', user.id)
          .neq('id', closedTxId)
          .ilike('descricao', `%${pattern}%`);

        if (outrosCat?.id) {
          query = query.or(`categoria.eq.Outros,categoria_id.eq.${outrosCat.id}`);
        } else {
          query = query.eq('categoria', 'Outros');
        }

        const { data: matching } = await query;
        if (matching && matching.length > 0) {
          setRecatTransactions(matching);
          setRecatCategoria({ nome: result.categoria, id: result.categoria_id, essencial: result.essencial });
          setRecatOpen(true);
        }
      }
    },
  });

  const bulkRecategorizeMutation = useMutation({
    mutationFn: async () => {
      const ids = recatTransactions.map(t => t.id);
      const updateData: any = {
        categoria: recatCategoria.nome,
        essencial: recatCategoria.essencial,
      };
      if (recatCategoria.id) {
        updateData.categoria_id = recatCategoria.id;
      }
      await supabase.from('transacoes').update(updateData).in('id', ids);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast({ title: `${recatTransactions.length} transações recategorizadas para "${recatCategoria.nome}"` });
      setRecatOpen(false);
      setRecatTransactions([]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('transacoes').delete().eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast({ title: 'Transação excluída' });
    },
  });

  const handleFilterCategoria = (value: string) => {
    setFilterCategoria(value);
    if (value === 'all') {
      searchParams.delete('categoria');
    } else {
      searchParams.set('categoria', value);
    }
    setSearchParams(searchParams, { replace: true });
  };

  const filtered = (transacoes?.filter(t => {
    if (!showIgnoradas && t.ignorar_dashboard) return false;
    if (filterCategoria !== 'all' && t.categoria !== filterCategoria) return false;
    if (filterTipo !== 'all' && t.tipo !== filterTipo) return false;
    if (filterEssencial === 'true' && !t.essencial) return false;
    if (filterEssencial === 'false' && t.essencial) return false;
    if (filterConta !== 'all' && t.conta_id !== filterConta) return false;
    if (filterPessoa !== 'all' && t.pessoa !== filterPessoa) return false;
    if (search && !t.descricao.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }) || []);

  // Group filtered transactions by day
  const groupedByDay = useMemo(() => {
    const groups: Record<string, typeof filtered> = {};
    for (const t of filtered) {
      if (!groups[t.data]) groups[t.data] = [];
      groups[t.data].push(t);
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // Summary totals
  const totalReceitas = filtered.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
  const totalDespesas = filtered.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);

  const pessoas = [...new Set(transacoes?.map(t => t.pessoa) || [])];
  const { getCategoriaById, getDisplayName, getColor } = useCategorias();

  const hasActiveFilters = filterCategoria !== 'all' || filterTipo !== 'all' || filterEssencial !== 'all' || filterConta !== 'all' || filterPessoa !== 'all';

  const formatDayHeader = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = dateStr === today.toISOString().substring(0, 10);
    const isYesterday = dateStr === yesterday.toISOString().substring(0, 10);

    const dayName = isToday ? 'Hoje' : isYesterday ? 'Ontem' : date.toLocaleDateString('pt-BR', { weekday: 'long' });
    const dayDate = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });

    return { dayName: dayName.charAt(0).toUpperCase() + dayName.slice(1), dayDate };
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Transações</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { copyToClipboard({ transactions: filtered, contas: contas || [], month, year }).then(() => toast({ title: 'Copiado para área de transferência' })); }}>
            <Copy className="h-4 w-4 mr-1" />Copiar
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCSV({ transactions: filtered, contas: contas || [], month, year })}>
            <Download className="h-4 w-4 mr-1" />CSV
          </Button>
          <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Receitas</p>
            <p className="text-lg font-bold text-success">{formatCurrency(totalReceitas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Despesas</p>
            <p className="text-lg font-bold text-destructive">{formatCurrency(totalDespesas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Saldo</p>
            <p className={`text-lg font-bold ${totalReceitas - totalDespesas >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(totalReceitas - totalDespesas)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search + filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar transação..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button
          variant={hasActiveFilters ? 'default' : 'outline'}
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {/* Collapsible filters */}
      {showFilters && (
        <Card>
          <CardContent className="p-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Select value={filterCategoria} onValueChange={handleFilterCategoria}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {(filterTipo === 'receita' ? CATEGORIAS_RECEITA : filterTipo === 'despesa' ? CATEGORIAS_DESPESA : CATEGORIAS).map(c => (
                    <SelectItem key={c} value={c}>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getCategoriaColor(c) }} />
                        {c}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterTipo} onValueChange={v => { setFilterTipo(v); if (v === 'all') { searchParams.delete('tipo'); } else { searchParams.set('tipo', v); } setSearchParams(searchParams, { replace: true }); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Receita/Despesa</SelectItem>
                  <SelectItem value="receita">Receitas</SelectItem>
                  <SelectItem value="despesa">Despesas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterEssencial} onValueChange={v => { setFilterEssencial(v); if (v === 'all') { searchParams.delete('essencial'); } else { searchParams.set('essencial', v); } setSearchParams(searchParams, { replace: true }); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Essencial" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="true">Essenciais</SelectItem>
                  <SelectItem value="false">Dispensáveis</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterConta} onValueChange={setFilterConta}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Conta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas contas</SelectItem>
                  {contas?.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterPessoa} onValueChange={setFilterPessoa}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pessoa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas pessoas</SelectItem>
                  {pessoas.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-ignoradas"
                  checked={showIgnoradas}
                  onCheckedChange={(v) => setShowIgnoradas(!!v)}
                />
                <Label htmlFor="show-ignoradas" className="text-xs cursor-pointer">Ignoradas</Label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Filtros:</span>
          {filterTipo !== 'all' && (
            <Badge variant="secondary" className="cursor-pointer text-xs" onClick={() => { setFilterTipo('all'); searchParams.delete('tipo'); setSearchParams(searchParams, { replace: true }); }}>
              {filterTipo === 'receita' ? 'Receitas' : 'Despesas'} ✕
            </Badge>
          )}
          {filterCategoria !== 'all' && (
            <Badge variant="secondary" className="cursor-pointer text-xs" onClick={() => handleFilterCategoria('all')}>
              {filterCategoria} ✕
            </Badge>
          )}
          {filterEssencial !== 'all' && (
            <Badge variant="secondary" className="cursor-pointer text-xs" onClick={() => { setFilterEssencial('all'); searchParams.delete('essencial'); setSearchParams(searchParams, { replace: true }); }}>
              {filterEssencial === 'true' ? 'Essenciais' : 'Dispensáveis'} ✕
            </Badge>
          )}
          {filterConta !== 'all' && (
            <Badge variant="secondary" className="cursor-pointer text-xs" onClick={() => setFilterConta('all')}>
              {contas?.find(c => c.id === filterConta)?.nome || 'Conta'} ✕
            </Badge>
          )}
          {filterPessoa !== 'all' && (
            <Badge variant="secondary" className="cursor-pointer text-xs" onClick={() => setFilterPessoa('all')}>
              {filterPessoa} ✕
            </Badge>
          )}
        </div>
      )}

      {/* Transaction list grouped by day */}
      <div className="space-y-4">
        {groupedByDay.map(([dateStr, txs]) => {
          const { dayName, dayDate } = formatDayHeader(dateStr);
          const dayTotal = txs.reduce((s, t) => s + (t.tipo === 'receita' ? Number(t.valor) : -Number(t.valor)), 0);

          return (
            <div key={dateStr}>
              {/* Day header */}
              <div className="flex items-center justify-between px-1 mb-2">
                <div>
                  <span className="text-sm font-semibold">{dayName}</span>
                  <span className="text-xs text-muted-foreground ml-2">{dayDate}</span>
                </div>
                <span className={`text-sm font-medium ${dayTotal >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {dayTotal >= 0 ? '+' : ''}{formatCurrency(dayTotal)}
                </span>
              </div>

              {/* Transaction cards */}
              <Card>
                <CardContent className="p-0 divide-y divide-border">
                  {txs.map((t) => {
                    const catColor = t.categoria_id ? getColor(t.categoria_id) : getCategoriaColor(t.categoria);
                    const catName = t.categoria_id ? getDisplayName(t.categoria_id) : t.categoria;
                    const contaNome = contas?.find(c => c.id === t.conta_id)?.nome;

                    return (
                      <div
                        key={t.id}
                        className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer ${t.ignorar_dashboard ? 'opacity-50' : ''}`}
                        onClick={() => { setEditingTx({ ...t, subcategoria: null }); setLearnPattern(false); }}
                      >
                        {/* Category color indicator */}
                        <div
                          className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center"
                          style={{ backgroundColor: catColor + '20' }}
                        >
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: catColor }}
                          />
                        </div>

                        {/* Description and details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {t.ignorar_dashboard && <EyeOff className="h-3 w-3 text-muted-foreground shrink-0" />}
                            <span className="text-sm font-medium truncate">{t.descricao}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{catName}</span>
                            {t.parcela_atual && t.parcela_total && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                {t.parcela_atual}/{t.parcela_total}
                              </Badge>
                            )}
                            {contaNome && (
                              <span className="text-[10px] text-muted-foreground">{contaNome}</span>
                            )}
                            {t.pessoa && (
                              <span className="text-[10px] text-muted-foreground">{t.pessoa}</span>
                            )}
                          </div>
                        </div>

                        {/* Value */}
                        <div className="text-right shrink-0">
                          <span className={`text-sm font-semibold ${t.tipo === 'receita' ? 'text-success' : 'text-destructive'}`}>
                            {t.tipo === 'receita' ? '+' : '-'}{formatCurrency(Number(t.valor))}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Nenhuma transação encontrada</p>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingTx} onOpenChange={() => setEditingTx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Transação</DialogTitle>
          </DialogHeader>
          {editingTx && (
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate({
              id: editingTx.id,
              categoria: editingTx.categoria,
              categoria_id: editingTx.categoria_id || null,
              essencial: editingTx.essencial,
              ignorar_dashboard: editingTx.ignorar_dashboard || false,
            }); }} className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: (editingTx.categoria_id ? getColor(editingTx.categoria_id) : getCategoriaColor(editingTx.categoria)) + '20' }}
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: editingTx.categoria_id ? getColor(editingTx.categoria_id) : getCategoriaColor(editingTx.categoria) }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{editingTx.descricao}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(editingTx.data)} · {formatCurrency(Number(editingTx.valor))}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Categoria</Label>
                <CategoriaSelector
                  value={editingTx.categoria_id}
                  tipoFilter={editingTx.tipo}
                  onValueChange={(catId) => {
                    const cat = getCategoriaById(catId);
                    setEditingTx({
                      ...editingTx,
                      categoria_id: catId,
                      categoria: cat?.nome || editingTx.categoria,
                      essencial: CATEGORIAS_CONFIG[cat?.nome || '']?.essencial ?? editingTx.essencial,
                    });
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Essencial</Label>
                <Switch checked={editingTx.essencial} onCheckedChange={v => setEditingTx({ ...editingTx, essencial: v })} />
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Checkbox
                  id="ignorar-dashboard"
                  checked={editingTx.ignorar_dashboard || false}
                  onCheckedChange={(v) => setEditingTx({ ...editingTx, ignorar_dashboard: !!v })}
                />
                <div>
                  <Label htmlFor="ignorar-dashboard" className="text-sm font-medium cursor-pointer">Ignorar no dashboard</Label>
                  <p className="text-xs text-muted-foreground">Não contabilizar nos totais</p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Aprender padrão?</p>
                  <p className="text-xs text-muted-foreground">"{editingTx.descricao}" = "{editingTx.categoria}"</p>
                </div>
                <Switch checked={learnPattern} onCheckedChange={setLearnPattern} />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" type="submit">
                  Salvar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={() => {
                    if (window.confirm(`Excluir "${editingTx.descricao}"?`)) {
                      deleteMutation.mutate(editingTx.id);
                      setEditingTx(null);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <RecategorizarModal
        open={recatOpen}
        onOpenChange={setRecatOpen}
        transactions={recatTransactions}
        categoriaNome={recatCategoria.nome}
        onConfirm={() => bulkRecategorizeMutation.mutate()}
        loading={bulkRecategorizeMutation.isPending}
      />
    </div>
  );
}
