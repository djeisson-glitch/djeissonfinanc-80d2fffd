import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, getMonthName } from '@/lib/format';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PenLine, AlertTriangle } from 'lucide-react';
import { ManualTransactionModal } from '@/components/contas/ManualTransactionModal';
import { useFaturaAcumulada } from '@/hooks/useFaturaAcumulada';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardId: string;
  cardName: string;
  start: string;
  end: string;
  month: number;
  year: number;
}

export function FaturaDrawer({ open, onOpenChange, cardId, cardName, start, end, month, year }: Props) {
  const { user } = useAuth();
  const billingPeriod = `${year}-${String(month + 1).padStart(2, '0')}`;
  const [manualTxOpen, setManualTxOpen] = useState(false);

  const { data: faturaAcumulada } = useFaturaAcumulada(
    open ? [cardId] : [],
    billingPeriod
  );
  const acumulado = faturaAcumulada?.[cardId];

  const { data: transacoes } = useQuery({
    queryKey: ['fatura-detail', cardId, billingPeriod],
    queryFn: async () => {
      // Get by billing period first
      const { data: byPeriod } = await supabase
        .from('transacoes')
        .select('*')
        .eq('user_id', user!.id)
        .eq('conta_id', cardId)
        .eq('ignorar_dashboard', false)
        .eq('mes_competencia', billingPeriod)
        .order('data', { ascending: false });
      
      // Fallback for old imports without mes_competencia
      const { data: byDate } = await supabase
        .from('transacoes')
        .select('*')
        .eq('user_id', user!.id)
        .eq('conta_id', cardId)
        .eq('ignorar_dashboard', false)
        .is('mes_competencia', null)
        .gte('data', start)
        .lte('data', end)
        .order('data', { ascending: false });
      
      return [...(byPeriod || []), ...(byDate || [])];
    },
    enabled: open && !!user,
  });

  const despesas = transacoes?.filter(t => t.tipo === 'despesa') || [];
  const total = despesas.reduce((s, t) => s + Number(t.valor), 0);

  const porCategoria = despesas.reduce((acc, t) => {
    const cat = t.categoria || 'Outros';
    acc[cat] = (acc[cat] || 0) + Number(t.valor);
    return acc;
  }, {} as Record<string, number>);

  const catRanking = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Fatura {cardName} — {getMonthName(month)}/{year}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs"
            onClick={() => setManualTxOpen(true)}
          >
            <PenLine className="h-3 w-3 mr-1" /> Adicionar Lançamento Manual
          </Button>

          {/* Resumo acumulado */}
          {acumulado && (
            <Card className="border-border/50">
              <CardContent className="p-3 space-y-1.5">
                {acumulado.saldoAnterior > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-warning">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Saldo anterior (acumulado)
                    </span>
                    <span className="font-semibold text-warning">{formatCurrency(acumulado.saldoAnterior)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Despesas do mês</span>
                  <span className="font-medium">{formatCurrency(acumulado.despesasMes)}</span>
                </div>
                {acumulado.pagamentosMes > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pagamentos</span>
                    <span className="font-medium text-success">-{formatCurrency(acumulado.pagamentosMes)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-sm font-bold">
                  <span>Total a pagar</span>
                  <span className={acumulado.totalAPagar > 0 ? 'text-destructive' : 'text-success'}>
                    {formatCurrency(Math.max(0, acumulado.totalAPagar))}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Histórico de meses anteriores com saldo */}
          {acumulado && acumulado.saldoAnterior > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Meses anteriores com saldo pendente</p>
                {acumulado.historico
                  .filter(h => h.periodo < billingPeriod && h.saldo > 0)
                  .map(h => {
                    const [y, m] = h.periodo.split('-').map(Number);
                    return (
                      <div key={h.periodo} className="flex justify-between text-xs py-1 border-b border-border/30">
                        <span className="text-muted-foreground">{getMonthName(m - 1)}/{y}</span>
                        <span>
                          <span className="text-muted-foreground mr-2">
                            {formatCurrency(h.despesas)} - {formatCurrency(h.pagamentos)}
                          </span>
                          <span className="font-medium text-warning">= {formatCurrency(h.saldo)}</span>
                        </span>
                      </div>
                    );
                  })}
              </div>
            </>
          )}

          <Separator />

          <p className="text-xs font-medium text-muted-foreground">Transações do mês</p>
          <div className="space-y-1">
            {despesas.map(t => (
              <div key={t.id} className="flex items-center justify-between py-1.5 text-sm border-b border-border/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs shrink-0">
                      {new Date(t.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </span>
                    <span className="truncate">{t.descricao}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{t.categoria}</span>
                </div>
                <span className="font-medium text-destructive shrink-0 ml-2">{formatCurrency(Number(t.valor))}</span>
              </div>
            ))}
            {despesas.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma transação nesta fatura</p>
            )}
          </div>

          {catRanking.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Por categoria</p>
                {catRanking.map(([cat, val]) => (
                  <div key={cat} className="flex justify-between text-sm py-0.5">
                    <span>{cat}</span>
                    <span className="font-medium">{formatCurrency(val)}</span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-sm">
                <span>Total da fatura</span>
                <span className="text-destructive">{formatCurrency(total)}</span>
              </div>
            </>
          )}
        </div>

        <ManualTransactionModal
          open={manualTxOpen}
          onOpenChange={setManualTxOpen}
          contaId={cardId}
          contaNome={cardName}
          contaTipo="credito"
          defaultMesCompetencia={billingPeriod}
        />
      </SheetContent>
    </Sheet>
  );
}
