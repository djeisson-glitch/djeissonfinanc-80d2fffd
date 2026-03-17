import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatDate, getMonthRange } from '@/lib/format';
import { CATEGORIAS, CATEGORIAS_CONFIG, getCategoriaColor, getSubcategorias } from '@/types/database.types';
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
import { Pencil, Trash2, Search, Download, Copy } from 'lucide-react';
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
    mutationFn: async (tx: { id: string; categoria: string; subcategoria: string | null; essencial: boolean }) => {
      await supabase.from('transacoes').update({ 
        categoria: tx.categoria, 
        essencial: tx.essencial,
      }).eq('id', tx.id);
      if (learnPattern && editingTx) {
        await supabase.from('regras_categorizacao').insert({
          user_id: user!.id,
          padrao: editingTx.descricao,
          categoria: tx.categoria,
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

  const filtered = transacoes?.filter(t => {
    if (filterCategoria !== 'all' && t.categoria !== filterCategoria) return false;
    if (filterTipo !== 'all' && t.tipo !== filterTipo) return false;
    if (filterEssencial === 'true' && !t.essencial) return false;
    if (filterEssencial === 'false' && t.essencial) return false;
    if (filterConta !== 'all' && t.conta_id !== filterConta) return false;
    if (filterPessoa !== 'all' && t.pessoa !== filterPessoa) return false;
    if (search && !t.descricao.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }) || [];

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
                {CATEGORIAS.map(c => (
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
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Parcela</TableHead>
                <TableHead>Pessoa</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm">{formatDate(t.data)}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{t.descricao}</TableCell>
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
                    {CATEGORIAS.map(c => (
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
