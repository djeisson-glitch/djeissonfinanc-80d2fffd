import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Plus, Pencil, CreditCard, Banknote } from 'lucide-react';

export default function ContasPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editConta, setEditConta] = useState<any>(null);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'credito' | 'debito'>('debito');
  const [saldoInicial, setSaldoInicial] = useState(0);

  const { data: contas } = useQuery({
    queryKey: ['contas', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('contas').select('*').eq('user_id', user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  // Get saldo atual for each conta
  const { data: saldos } = useQuery({
    queryKey: ['saldos', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('transacoes')
        .select('conta_id, tipo, valor')
        .eq('user_id', user!.id);
      
      const saldoPorConta: Record<string, number> = {};
      data?.forEach(t => {
        if (!saldoPorConta[t.conta_id]) saldoPorConta[t.conta_id] = 0;
        if (t.tipo === 'receita') saldoPorConta[t.conta_id] += Number(t.valor);
        else saldoPorConta[t.conta_id] -= Number(t.valor);
      });
      return saldoPorConta;
    },
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editConta) {
        await supabase.from('contas').update({ nome, tipo, saldo_inicial: saldoInicial }).eq('id', editConta.id);
      } else {
        await supabase.from('contas').insert({ user_id: user!.id, nome, tipo, saldo_inicial: saldoInicial });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contas'] });
      setDialogOpen(false);
      resetForm();
      toast({ title: editConta ? 'Conta atualizada' : 'Conta criada' });
    },
  });

  const resetForm = () => {
    setEditConta(null);
    setNome('');
    setTipo('debito');
    setSaldoInicial(0);
  };

  const openEdit = (conta: any) => {
    setEditConta(conta);
    setNome(conta.nome);
    setTipo(conta.tipo);
    setSaldoInicial(conta.saldo_inicial);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contas</h1>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Nova Conta
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {contas?.map(conta => {
          const saldoAtual = (conta.saldo_inicial || 0) + (saldos?.[conta.id] || 0);
          return (
            <Card key={conta.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openEdit(conta)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {conta.tipo === 'credito' ? (
                      <CreditCard className="h-5 w-5 text-accent" />
                    ) : (
                      <Banknote className="h-5 w-5 text-primary" />
                    )}
                    <span className="font-medium">{conta.nome}</span>
                  </div>
                  <Badge variant="outline" className="capitalize">{conta.tipo}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Saldo atual</p>
                  <p className={`text-xl font-bold ${saldoAtual >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {formatCurrency(saldoAtual)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Saldo inicial: {formatCurrency(conta.saldo_inicial)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editConta ? 'Editar Conta' : 'Nova Conta'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Cartão Sicredi" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={v => setTipo(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="debito">Débito</SelectItem>
                  <SelectItem value="credito">Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Saldo Inicial (R$)</Label>
              <Input type="number" value={saldoInicial} onChange={e => setSaldoInicial(Number(e.target.value))} />
            </div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!nome}>
              {editConta ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
