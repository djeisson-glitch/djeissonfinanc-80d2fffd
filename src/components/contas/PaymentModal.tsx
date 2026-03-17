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
import { useQueryClient } from '@tanstack/react-query';
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

  const restante = useMemo(() => Math.max(0, faturaTotal - valorPago), [faturaTotal, valorPago]);
  const valorParcela = useMemo(() => parcelas > 0 ? restante / parcelas : 0, [restante, parcelas]);

  const handleConfirm = async () => {
    if (!user) return;
    setSubmitting(true);

    try {
      const baseDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const valorPagamento = mode === 'total' ? faturaTotal : valorPago;

      // Create payment transaction
      const paymentHash = generateHash(baseDate, `Pagamento fatura ${contaNome}`, valorPagamento, 'Djeisson Mauss');
      await supabase.from('transacoes').insert({
        user_id: user.id,
        conta_id: contaId,
        data: baseDate,
        descricao: `Pag Fat Deb Cc - ${contaNome}`,
        valor: valorPagamento,
        categoria: 'Pagamento Fatura',
        tipo: 'receita',
        essencial: true,
        hash_transacao: paymentHash,
        pessoa: 'Djeisson Mauss',
      });

      // If partial, create future installments for remaining
      if (mode === 'parcial' && restante > 0 && parcelas > 0) {
        const grupo_parcela = crypto.randomUUID();
        const installments = [];
        for (let i = 1; i <= parcelas; i++) {
          const d = new Date(year, month + i, 1);
          const isoDate = d.toISOString().split('T')[0];
          const hash = generateHash(isoDate, `Parcelamento fatura ${contaNome}`, valorParcela, 'Djeisson Mauss') + `_p${i}`;
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
            pessoa: 'Djeisson Mauss',
          });
        }
        await supabase.from('transacoes').insert(installments);
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
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-muted text-center">
            <p className="text-sm text-muted-foreground">Fatura atual</p>
            <p className="text-xl font-bold text-destructive">{formatCurrency(faturaTotal)}</p>
          </div>

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
            onClick={handleConfirm}
            disabled={submitting || (mode === 'parcial' && (valorPago <= 0 || valorPago >= faturaTotal))}
          >
            {submitting ? 'Registrando...' : 'Confirmar Pagamento'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
