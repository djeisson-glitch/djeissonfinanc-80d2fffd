import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, getMonthRange } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Plus, CreditCard, Banknote, DollarSign, CalendarDays } from 'lucide-react';
import { PaymentModal } from '@/components/contas/PaymentModal';
import { MonthSelector } from '@/components/MonthSelector';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function getInvoiceStatus(fatura: number, pagamento: number): { label: string; color: string; variant: 'default' | 'destructive' | 'outline' | 'secondary' } {
  if (fatura <= 0) return { label: 'Sem fatura', color: '#9ca3af', variant: 'secondary' };
  if (pagamento >= fatura) return { label: 'Paga', color: '#10b981', variant: 'default' };
  if (pagamento > 0) return { label: 'Parcialmente paga', color: '#f59e0b', variant: 'outline' };
  return { label: 'Em aberto', color: '#ef4444', variant: 'destructive' };
}

export default function ContasPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editConta, setEditConta] = useState<any>(null);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'credito' | 'debito'>('debito');
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [dataAbertura, setDataAbertura] = useState<Date>(new Date(2026, 0, 1));
  const [banco, setBanco] = useState('');
  const [codigoBanco, setCodigoBanco] = useState('');
  const [agencia, setAgencia] = useState('');
  const [numeroConta, setNumeroConta] = useState('');
  const [paymentConta, setPaymentConta] = useState<{ id: string; nome: string; fatura: number } | null>(null);

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const { start, end } = getMonthRange(month, year);

  const { data: contas } = useQuery({
    queryKey: ['contas', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('contas').select('*').eq('user_id', user!.id);
      return data || [];
    },
    enabled: !!user,
  });

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

  // Monthly invoice data for credit cards
  const { data: faturaData } = useQuery({
    queryKey: ['faturas', user?.id, start, end],
    queryFn: async () => {
      const { data } = await supabase
        .from('transacoes')
        .select('conta_id, tipo, valor, descricao')
        .eq('user_id', user!.id)
        .gte('data', start)
        .lte('data', end);

      const faturas: Record<string, { despesas: number; pagamentos: number }> = {};
      data?.forEach(t => {
        if (!faturas[t.conta_id]) faturas[t.conta_id] = { despesas: 0, pagamentos: 0 };
        if (t.tipo === 'despesa') {
          faturas[t.conta_id].despesas += Number(t.valor);
        }
        // Only count actual invoice payments, NOT devoluções
        const desc = t.descricao.toLowerCase();
        const isDevolution = desc.includes('devoluc') || desc.includes('devolução') || desc.includes('estorno');
        if (!isDevolution && (desc.includes('pag fat') || desc.includes('pagamento fatura') || desc.includes('pag fat deb cc'))) {
          faturas[t.conta_id].pagamentos += Math.abs(Number(t.valor));
        }
        // Devoluções reduce the invoice total instead
        if (isDevolution && t.tipo === 'receita') {
          faturas[t.conta_id].despesas -= Number(t.valor);
        }
      });
      return faturas;
    },
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const dataAberturaStr = format(dataAbertura, 'yyyy-MM-dd');
      const finalSaldo = tipo === 'credito' ? 0 : saldoInicial;

      if (editConta) {
        await supabase.from('contas').update({ nome, tipo, saldo_inicial: finalSaldo, data_abertura: dataAberturaStr, banco: banco || null, codigo_banco: codigoBanco || null, agencia: agencia || null, numero_conta: numeroConta || null }).eq('id', editConta.id);
      } else {
        const { data: newConta, error } = await supabase.from('contas').insert({ user_id: user!.id, nome, tipo, saldo_inicial: finalSaldo, data_abertura: dataAberturaStr, banco: banco || null, codigo_banco: codigoBanco || null, agencia: agencia || null, numero_conta: numeroConta || null }).select('id').single();
        if (error) throw error;

        // Create opening balance transaction for debit accounts
        if (tipo !== 'credito' && finalSaldo !== 0) {
          const txTipo = finalSaldo > 0 ? 'receita' : 'despesa';
          const hash = `saldo_abertura_${newConta.id}_${Date.now()}`;
          await supabase.from('transacoes').insert({
            user_id: user!.id,
            conta_id: newConta.id,
            data: dataAberturaStr,
            descricao: 'Saldo de Abertura',
            descricao_normalizada: 'SALDO DE ABERTURA',
            valor: Math.abs(finalSaldo),
            categoria: 'Saldo Inicial',
            tipo: txTipo,
            essencial: false,
            hash_transacao: hash,
            pessoa: 'Sistema',
            ignorar_dashboard: true,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contas'] });
      queryClient.invalidateQueries({ queryKey: ['saldos'] });
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
    setDataAbertura(new Date(2026, 0, 1));
    setBanco('');
    setCodigoBanco('');
    setAgencia('');
    setNumeroConta('');
  };

  const openEdit = (conta: any) => {
    setEditConta(conta);
    setNome(conta.nome);
    setTipo(conta.tipo);
    setSaldoInicial(conta.saldo_inicial);
    setDataAbertura(conta.data_abertura ? new Date(conta.data_abertura + 'T00:00:00') : new Date(2026, 0, 1));
    setBanco(conta.banco || '');
    setCodigoBanco(conta.codigo_banco || '');
    setAgencia(conta.agencia || '');
    setNumeroConta(conta.numero_conta || '');
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contas</h1>
        <div className="flex items-center gap-2">
          <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Nova Conta
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {contas?.map(conta => {
          const saldoAtual = (conta.saldo_inicial || 0) + (saldos?.[conta.id] || 0);
          const isCredito = conta.tipo === 'credito';
          const fatura = faturaData?.[conta.id];
          const faturaTotal = fatura?.despesas || 0;
          const pagamentoTotal = fatura?.pagamentos || 0;
          const status = isCredito ? getInvoiceStatus(faturaTotal, pagamentoTotal) : null;

          return (
            <Card key={conta.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openEdit(conta)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {isCredito ? (
                      <CreditCard className="h-5 w-5 text-accent" />
                    ) : (
                      <Banknote className="h-5 w-5 text-primary" />
                    )}
                    <span className="font-medium">{conta.nome}</span>
                  </div>
                  <Badge variant="outline" className="capitalize">{conta.tipo}</Badge>
                </div>

                {isCredito ? (
                  <>
                    <div className="mb-2">
                      <p className="text-sm text-muted-foreground">Fatura atual</p>
                      <p className="text-xl font-bold text-destructive">{formatCurrency(faturaTotal)}</p>
                    </div>
                    {status && (
                      <Badge
                        variant={status.variant}
                        className="text-xs"
                        style={status.variant === 'outline' ? { borderColor: status.color, color: status.color } : status.variant === 'default' ? { backgroundColor: status.color } : undefined}
                      >
                        {status.label === 'Paga' && '🟢 '}
                        {status.label === 'Em aberto' && '🔴 '}
                        {status.label === 'Parcialmente paga' && '🟡 '}
                        {status.label}
                      </Badge>
                    )}
                    {pagamentoTotal > 0 && pagamentoTotal < faturaTotal && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Pago: {formatCurrency(pagamentoTotal)} de {formatCurrency(faturaTotal)}
                      </p>
                    )}
                    {faturaTotal > 0 && pagamentoTotal < faturaTotal && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 w-full text-xs"
                        onClick={(e) => { e.stopPropagation(); setPaymentConta({ id: conta.id, nome: conta.nome, fatura: faturaTotal - pagamentoTotal }); }}
                      >
                        <DollarSign className="h-3 w-3 mr-1" /> Registrar Pagamento
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground">Saldo atual</p>
                      <p className={`text-xl font-bold ${saldoAtual >= 0 ? 'text-primary' : 'text-destructive'}`}>
                        {formatCurrency(saldoAtual)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Saldo inicial: {formatCurrency(conta.saldo_inicial)}
                    </p>
                  </>
                )}
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
          <form onSubmit={(e) => { e.preventDefault(); if (nome) saveMutation.mutate(); }} className="space-y-4">
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
              <Label>Banco</Label>
              <Select value={banco} onValueChange={(v) => {
                const banks: Record<string, string> = { 'Sicredi': '748', 'Itaú': '341', 'Bradesco': '237', 'Santander': '033', 'Caixa': '104', 'Banco do Brasil': '001', 'Nubank': '260', 'Inter': '077', 'Mercado Pago': '323' };
                setBanco(v);
                setCodigoBanco(banks[v] || '');
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sicredi">Sicredi (748)</SelectItem>
                  <SelectItem value="Itaú">Itaú (341)</SelectItem>
                  <SelectItem value="Bradesco">Bradesco (237)</SelectItem>
                  <SelectItem value="Santander">Santander (033)</SelectItem>
                  <SelectItem value="Caixa">Caixa (104)</SelectItem>
                  <SelectItem value="Banco do Brasil">Banco do Brasil (001)</SelectItem>
                  <SelectItem value="Nubank">Nubank (260)</SelectItem>
                  <SelectItem value="Inter">Inter (077)</SelectItem>
                  <SelectItem value="Mercado Pago">Mercado Pago (323)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Agência</Label>
                <Input value={agencia} onChange={e => setAgencia(e.target.value)} placeholder="0001" />
              </div>
              <div className="space-y-2">
                <Label>Nº Conta</Label>
                <Input value={numeroConta} onChange={e => setNumeroConta(e.target.value)} placeholder="885890" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Data de Abertura</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataAbertura && "text-muted-foreground")}>
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {format(dataAbertura, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dataAbertura} onSelect={(d) => d && setDataAbertura(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            {tipo !== 'credito' && (
              <div className="space-y-2">
                <Label>Saldo Inicial (R$)</Label>
                <Input type="number" value={saldoInicial} onChange={e => setSaldoInicial(Number(e.target.value))} />
                <p className="text-xs text-muted-foreground">Saldo na data de abertura. Para cartões de crédito, sempre R$ 0,00.</p>
              </div>
            )}
            {tipo === 'credito' && (
              <p className="text-xs text-muted-foreground">Cartões de crédito não possuem saldo próprio.</p>
            )}
            <Button className="w-full" type="submit" disabled={!nome}>
              {editConta ? 'Salvar' : 'Criar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {paymentConta && (
        <PaymentModal
          open={!!paymentConta}
          onOpenChange={(open) => { if (!open) setPaymentConta(null); }}
          contaId={paymentConta.id}
          contaNome={paymentConta.nome}
          faturaTotal={paymentConta.fatura}
          month={month}
          year={year}
        />
      )}
    </div>
  );
}
