import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/format';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { generateHash } from '@/lib/csv-parser';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contaId: string;
  contaNome: string;
  faturaTotal: number;
  month: number;
  year: number;
}

export function PaymentModal({ open, onOpenChange, contaId, contaNome, faturaTotal, month, year }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'total' | 'parcial'>('total');
  const [valorPago, setValorPago] = useState(0);
  const [parcelas, setParcelas] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [contaOrigem, setContaOrigem] = useState<string>('');

  const pessoaNome = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Titular';
  const restante = useMemo(() => Math.max(0, faturaTotal - valorPago), [faturaTotal, valorPago]);
  const valorParcela = useMemo(() => parcelas > 0 ? restante / parcelas : 0, [restante, parcelas]);

  // Fetch debit accounts for payment origin selection
  const { data: contasDebito } = useQuery({
    queryKey: ['contas-debito', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('contas')
        .select('id, nome')
        .eq('user_id', user!.id)
        .eq('tipo', 'debito');
      return data || [];
    },
    enabled: !!user && open,
  });

  // Auto-select first debit account if only one exists
  const effectiveContaOrigem = contaOrigem || (contasDebito?.length === 1 ? contasDebito[0].id : '');

  const handleConfirm = async () => {
    if (!user) return;
    setSubmitting(true);

    try {
      const baseDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const valorPagamento = mode === 'total' ? faturaTotal : valorPago;
      const billingPeriod = `${year}-${String(month + 1).padStart(2, '0')}`;

      // Create the installment group up front so the payment row links to the same group
      // as its future parcelas (when partial). This keeps the payment and the parcelamento
      // visibly tied together in the UI.
      const grupo_parcela =
        mode === 'parcial' && restante > 0 && parcelas > 0 ? crypto.randomUUID() : null;

      // Create payment transaction on credit card account (receita = reduces card debt)
      const paymentHash = generateHash(baseDate, `Pagamento fatura ${contaNome}`, valorPagamento, pessoaNome);
      const { data: paymentData, error: paymentError } = await supabase.from('transacoes').insert({
        user_id: user.id,
        conta_id: contaId,
        data: baseDate,
        descricao: `Pag Fat Deb Cc - ${contaNome}`,
        valor: valorPagamento,
        categoria: 'Pagamento Fatura',
        tipo: 'receita',
        essencial: true,
        hash_transacao: paymentHash,
        pessoa: pessoaNome,
        mes_competencia: billingPeriod,
        ignorar_dashboard: true,
        grupo_parcela,
      }).select('id').single();

      if (paymentError) throw paymentError;

      // Create corresponding debit transaction on the origin debit account (despesa = money leaving)
      if (effectiveContaOrigem) {
        const debitHash = generateHash(baseDate, `Pag Fat Deb Cc - ${contaNome}`, valorPagamento, pessoaNome) + '_deb';
        await supabase.from('transacoes').insert({
          user_id: user.id,
          conta_id: effectiveContaOrigem,
          data: baseDate,
          descricao: `Pag Fat Deb Cc - ${contaNome}`,
          valor: valorPagamento,
          categoria: 'Pagamento Fatura',
          tipo: 'despesa',
          essencial: true,
          hash_transacao: debitHash,
          pessoa: pessoaNome,
          mes_competencia: billingPeriod,
          ignorar_dashboard: true,
        });
      }

      // If partial, create future installments for remaining (linked to the same grupo_parcela)
      if (mode === 'parcial' && restante > 0 && parcelas > 0 && grupo_parcela) {
        const installments = [];
        for (let i = 1; i <= parcelas; i++) {
          const d = new Date(year, month + i, 1);
          const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
          const hash = generateHash(isoDate, `Parcelamento fatura ${contaNome}`, valorParcela, pessoaNome) + `_p${i}`;
          installments.push({
            user_id: user.id,
            conta_id: contaId,
            data: isoDate,
            descricao: `Parcelamento fatura ${contaNome} (${i}/${parcelas})`,
            valor: valorParcela,
            categoria: 'Parcelamento',
            tipo: 'despesa',
            essencial: true,
            parcela_atual: i,
            parcela_total: parcelas,
            grupo_parcela,
            hash_transacao: hash,
            pessoa: pessoaNome,
          });
        }
        const { error: installError } = await supabase.from('transacoes').insert(installments);
        if (installError) {
          // Rollback: delete the payment if installments fail
          await supabase.from('transacoes').delete().eq('id', paymentData.id);
          throw installError;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['faturas'] });
      queryClient.invalidateQueries({ queryKey: ['saldos'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast({ title: mode === 'total' ? 'Pagamento total registrado' : 'Pagamento parcial + parcelamento registrado' });
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao registrar pagamento', variant: 'destructive' });
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Registrar Pagamento — {contaNome}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); handleConfirm(); }} className="space-y-4">
          <div className="p-3 rounded-lg bg-muted text-center">
            <p className="text-sm text-muted-foreground">Fatura atual</p>
            <p className="text-xl font-bold text-destructive">{formatCurrency(faturaTotal)}</p>
          </div>

          {/* Conta de origem */}
          {contasDebito && contasDebito.length > 1 && (
            <div className="space-y-2">
              <Label>Pagar com qual conta?</Label>
              <Select value={effectiveContaOrigem} onValueChange={setContaOrigem}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>
                  {contasDebito.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {contasDebito && contasDebito.length === 1 && (
            <p className="text-xs text-muted-foreground">
              Conta de origem: <span className="font-medium">{contasDebito[0].nome}</span>
            </p>
          )}

          <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'total' | 'parcial')}>
            <div className="flex items-center space-x-2 p-3 rounded-lg border cursor-pointer hover:bg-muted/50" onClick={() => setMode('total')}>
              <RadioGroupItem value="total" id="total" />
              <Label htmlFor="total" className="cursor-pointer flex-1">
                Pagar total ({formatCurrency(faturaTotal)})
              </Label>
            </div>
            <div className="flex items-center space-x-2 p-3 rounded-lg border cursor-pointer hover:bg-muted/50" onClick={() => setMode('parcial')}>
              <RadioGroupItem value="parcial" id="parcial" />
              <Label htmlFor="parcial" className="cursor-pointer flex-1">
                Pagar parcial + parcelar restante
              </Label>
            </div>
          </RadioGroup>

          {mode === 'parcial' && (
            <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
              <div className="space-y-2">
                <Label>Valor pago agora (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  max={faturaTotal}
                  value={valorPago || ''}
                  onChange={(e) => setValorPago(Number(e.target.value))}
                />
              </div>
              <div className="p-2 rounded bg-muted text-sm">
                Restante: <strong className="text-destructive">{formatCurrency(restante)}</strong>
              </div>
              <div className="space-y-2">
                <Label>Parcelar em quantas vezes?</Label>
                <Select value={String(parcelas)} onValueChange={(v) => setParcelas(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 11 }, (_, i) => i + 2).map(n => (
                      <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {restante > 0 && (
                <div className="p-2 rounded bg-accent/10 border border-accent/20 text-sm text-center">
                  {parcelas}x de <strong>{formatCurrency(valorParcela)}</strong>
                </div>
              )}
            </div>
          )}

          <Button
            className="w-full"
            type="submit"
            disabled={submitting || (mode === 'parcial' && (valorPago <= 0 || valorPago >= faturaTotal)) || (!effectiveContaOrigem && (contasDebito?.length || 0) > 0)}
          >
            {submitting ? 'Registrando...' : 'Confirmar Pagamento'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
