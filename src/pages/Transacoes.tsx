import { useState, useEffect } from 'react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Trash2, Search, Download, Copy, ArrowUpDown, ArrowUp, ArrowDown, EyeOff } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { exportCSV, copyToClipboard } from '@/lib/export';
import { MonthSelector } from '@/components/MonthSelector';

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
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (column: string) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

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
        .gte('data', start < '2026-01-01' ? '2026-01-01' : start)
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
      if (learnPattern && editingTx) {
        await supabase.from('regras_categorizacao').insert({
          user_id: user!.id,
          padrao: editingTx.descricao,
          categoria: tx.categoria,
          categoria_id: tx.categoria_id,
          essencial: tx.essencial,
          aprendido_auto: false,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setEditingTx(null);
      toast({ title: 'Transação atualizada' });
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
  }) || []).sort((a, b) => {
    if (!sortColumn) return 0;
    const dir = sortDirection === 'asc' ? 1 : -1;
    switch (sortColumn) {
      case 'data': return dir * a.data.localeCompare(b.data);
      case 'descricao': return dir * a.descricao.localeCompare(b.descricao, 'pt-BR');
      case 'categoria': return dir * a.categoria.localeCompare(b.categoria, 'pt-BR');
      case 'valor': {
        const va = a.tipo === 'receita' ? Number(a.valor) : -Number(a.valor);
        const vb = b.tipo === 'receita' ? Number(b.valor) : -Number(b.valor);
        return dir * (va - vb);
      }
      case 'essencial': return dir * (Number(a.essencial) - Number(b.essencial));
      case 'parcela': return dir * ((a.parcela_atual || 0) - (b.parcela_atual || 0));
      case 'pessoa': return dir * a.pessoa.localeCompare(b.pessoa, 'pt-BR');
      default: return 0;
    }
  });

  const pessoas = [...new Set(transacoes?.map(t => t.pessoa) || [])];

  const editSubcategorias = editingTx ? getSubcategorias(editingTx.categoria) : [];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Transações</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { copyToClipboard({ transactions: filtered, contas: contas || [], month, year }).then(() => toast({ title: 'Copiado para área de transferência' })); }}>
            <Copy className="h-4 w-4 mr-1" />Copiar
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCSV({ transactions: filtered, contas: contas || [], month, year })}>
            <Download className="h-4 w-4 mr-1" />Exportar CSV
          </Button>
          <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
        </div>
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="relative col-span-2 md:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterCategoria} onValueChange={handleFilterCategoria}>
              <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {filterTipo === 'receita'
                  ? CATEGORIAS_RECEITA.map(c => (
                    <SelectItem key={c} value={c}>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getCategoriaColor(c) }} />
                        {c}
                      </div>
                    </SelectItem>
                  ))
                  : filterTipo === 'despesa'
                    ? CATEGORIAS_DESPESA.map(c => (
                      <SelectItem key={c} value={c}>
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getCategoriaColor(c) }} />
                          {c}
                        </div>
                      </SelectItem>
                    ))
                    : CATEGORIAS.map(c => (
                      <SelectItem key={c} value={c}>
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getCategoriaColor(c) }} />
                          {c}
                        </div>
                      </SelectItem>
                    ))
                }
              </SelectContent>
            </Select>
            <Select value={filterTipo} onValueChange={v => { setFilterTipo(v); if (v === 'all') { searchParams.delete('tipo'); } else { searchParams.set('tipo', v); } setSearchParams(searchParams, { replace: true }); }}>
              <SelectTrigger><SelectValue placeholder="Receita/Despesa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Receita/Despesa</SelectItem>
                <SelectItem value="receita">Receitas</SelectItem>
                <SelectItem value="despesa">Despesas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterEssencial} onValueChange={v => { setFilterEssencial(v); if (v === 'all') { searchParams.delete('essencial'); } else { searchParams.set('essencial', v); } setSearchParams(searchParams, { replace: true }); }}>
              <SelectTrigger><SelectValue placeholder="Essencial" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="true">Essenciais</SelectItem>
                <SelectItem value="false">Dispensáveis</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterConta} onValueChange={setFilterConta}>
              <SelectTrigger><SelectValue placeholder="Conta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas contas</SelectItem>
                {contas?.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPessoa} onValueChange={setFilterPessoa}>
              <SelectTrigger><SelectValue placeholder="Pessoa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas pessoas</SelectItem>
                {pessoas.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 col-span-2 md:col-span-1">
              <Checkbox
                id="show-ignoradas"
                checked={showIgnoradas}
                onCheckedChange={(v) => setShowIgnoradas(!!v)}
              />
              <Label htmlFor="show-ignoradas" className="text-sm cursor-pointer whitespace-nowrap">Mostrar ignoradas</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {(filterCategoria !== 'all' || filterTipo !== 'all' || filterEssencial !== 'all') && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Filtros ativos:</span>
          {filterTipo !== 'all' && (
            <Badge variant="secondary" className="cursor-pointer" onClick={() => { setFilterTipo('all'); searchParams.delete('tipo'); setSearchParams(searchParams, { replace: true }); }}>
              {filterTipo === 'receita' ? 'Receitas' : 'Despesas'} ✕
            </Badge>
          )}
          {filterCategoria !== 'all' && (
            <Badge variant="secondary" className="cursor-pointer" onClick={() => handleFilterCategoria('all')}>
              {filterCategoria} ✕
            </Badge>
          )}
          {filterEssencial !== 'all' && (
            <Badge variant="secondary" className="cursor-pointer" onClick={() => { setFilterEssencial('all'); searchParams.delete('essencial'); setSearchParams(searchParams, { replace: true }); }}>
              {filterEssencial === 'true' ? 'Essenciais' : 'Dispensáveis'} ✕
            </Badge>
          )}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('data')}>
                  <span className="flex items-center">Data<SortIcon column="data" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('descricao')}>
                  <span className="flex items-center">Descrição<SortIcon column="descricao" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('categoria')}>
                  <span className="flex items-center">Categoria<SortIcon column="categoria" /></span>
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('valor')}>
                  <span className="flex items-center justify-end">Valor<SortIcon column="valor" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('essencial')}>
                  <span className="flex items-center">Tipo<SortIcon column="essencial" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('parcela')}>
                  <span className="flex items-center">Parcela<SortIcon column="parcela" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('pessoa')}>
                  <span className="flex items-center">Pessoa<SortIcon column="pessoa" /></span>
                </TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id} className={t.ignorar_dashboard ? 'opacity-50' : ''}>
                  <TableCell className="text-sm" title={t.data_original ? `Original: ${formatDate(t.data_original)}` : undefined}>
                    {formatDate(t.data)}
                    {t.data_original && t.data_original !== t.data && (
                      <span className="block text-[10px] text-muted-foreground">orig: {formatDate(t.data_original)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">
                    <span className="flex items-center gap-1">
                      {t.ignorar_dashboard && <EyeOff className="h-3 w-3 text-muted-foreground shrink-0" />}
                      {t.descricao}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="text-xs"
                      style={{ borderLeft: `3px solid ${getCategoriaColor(t.categoria)}` }}
                    >
                      {t.categoria}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right text-sm font-medium ${t.tipo === 'receita' ? 'text-success' : 'text-destructive'}`}>
                    {t.tipo === 'receita' ? '+' : '-'}{formatCurrency(Number(t.valor))}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {t.essencial ? 'Essencial' : 'Dispensável'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.parcela_atual && t.parcela_total ? `${t.parcela_atual}/${t.parcela_total}` : '-'}
                  </TableCell>
                  <TableCell className="text-sm">{t.pessoa}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingTx({ ...t, subcategoria: null }); setLearnPattern(false); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(t.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhuma transação encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editingTx} onOpenChange={() => setEditingTx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Transação</DialogTitle>
          </DialogHeader>
          {editingTx && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{editingTx.descricao}</p>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={editingTx.categoria}
                  onValueChange={v => {
                    const config = CATEGORIAS_CONFIG[v];
                    setEditingTx({
                      ...editingTx,
                      categoria: v,
                      essencial: config?.essencial ?? false,
                      subcategoria: null,
                    });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(editingTx.tipo === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA).map(c => (
                      <SelectItem key={c} value={c}>
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getCategoriaColor(c) }} />
                          {c}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editSubcategorias.length > 0 && (
                <div className="space-y-2">
                  <Label>Subcategoria (opcional)</Label>
                  <Select
                    value={editingTx.subcategoria || '_none'}
                    onValueChange={v => setEditingTx({ ...editingTx, subcategoria: v === '_none' ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nenhuma</SelectItem>
                      {editSubcategorias.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
                  <p className="text-xs text-muted-foreground">Transação não será contabilizada nos totais e gráficos</p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Aprender padrão?</p>
                  <p className="text-xs text-muted-foreground">"{editingTx.descricao}" sempre será "{editingTx.categoria}"</p>
                </div>
                <Switch checked={learnPattern} onCheckedChange={setLearnPattern} />
              </div>
              <Button
                className="w-full"
                onClick={() => updateMutation.mutate({
                  id: editingTx.id,
                  categoria: editingTx.categoria,
                  subcategoria: editingTx.subcategoria,
                  essencial: editingTx.essencial,
                  ignorar_dashboard: editingTx.ignorar_dashboard || false,
                })}
              >
                Salvar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
