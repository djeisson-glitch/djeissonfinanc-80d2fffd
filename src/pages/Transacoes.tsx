import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatDate, getMonthRange } from '@/lib/format';
import { CATEGORIAS } from '@/types/database.types';
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
import { Pencil, Trash2, Search } from 'lucide-react';
import { MonthSelector } from '@/components/MonthSelector';

export default function TransacoesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [filterCategoria, setFilterCategoria] = useState('all');
  const [filterEssencial, setFilterEssencial] = useState('all');
  const [filterConta, setFilterConta] = useState('all');
  const [filterPessoa, setFilterPessoa] = useState('all');
  const [search, setSearch] = useState('');
  const [editingTx, setEditingTx] = useState<any>(null);
  const [learnPattern, setLearnPattern] = useState(false);

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
    mutationFn: async (tx: { id: string; categoria: string; essencial: boolean }) => {
      await supabase.from('transacoes').update({ categoria: tx.categoria, essencial: tx.essencial }).eq('id', tx.id);
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

  const filtered = transacoes?.filter(t => {
    if (filterCategoria !== 'all' && t.categoria !== filterCategoria) return false;
    if (filterEssencial === 'true' && !t.essencial) return false;
    if (filterEssencial === 'false' && t.essencial) return false;
    if (filterConta !== 'all' && t.conta_id !== filterConta) return false;
    if (filterPessoa !== 'all' && t.pessoa !== filterPessoa) return false;
    if (search && !t.descricao.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }) || [];

  const pessoas = [...new Set(transacoes?.map(t => t.pessoa) || [])];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transações</h1>
        <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="relative col-span-2 md:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterEssencial} onValueChange={setFilterEssencial}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
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
              {filtered.map((t, i) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm">{formatDate(t.data)}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{t.descricao}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">{t.categoria}</Badge>
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
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingTx(t); setLearnPattern(false); }}>
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
                <Select value={editingTx.categoria} onValueChange={v => setEditingTx({ ...editingTx, categoria: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
                onClick={() => updateMutation.mutate({ id: editingTx.id, categoria: editingTx.categoria, essencial: editingTx.essencial })}
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
