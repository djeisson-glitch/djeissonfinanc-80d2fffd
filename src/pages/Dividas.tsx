import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, getMonthName } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Landmark,
  CreditCard,
  ShoppingBag,
  CalendarClock,
  TrendingDown,
  Receipt,
  ArrowDownRight,
} from 'lucide-react';

interface Transacao {
  id: string;
  descricao: string;
  descricao_normalizada: string | null;
  valor: number | string;
  tipo: string;
  parcela_atual: number | null;
  parcela_total: number | null;
  grupo_parcela: string | null;
  mes_competencia: string | null;
  data: string;
  categoria: string | null;
  conta_id: string;
}

interface DebtGroup {
  key: string;
  displayName: string;
  descricao: string;
  parcelaAtual: number;
  parcelaTotal: number;
  valorMensal: number;
  parcelasRestantes: number;
  valorRestante: number;
  mesCompetencia: string;
  mesTermino: string;
  progressPercent: number;
  isFatura: boolean;
  faturaMonth?: string;
  categoria: string | null;
}

function addMonths(yyyyMM: string, months: number): string {
  const [y, m] = yyyyMM.split('-').map(Number);
  const date = new Date(y, m - 1 + months, 1);
  const ny = date.getFullYear();
  const nm = date.getMonth() + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function formatMesCompetencia(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-').map(Number);
  return `${getMonthName(m - 1)}/${y}`;
}

function cleanEstablishmentName(desc: string): string {
  return desc
    .replace(/^(MERCADOLIVRE\*|MERCADOPAGO\*|MP\*|EC\s?\*)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFaturaMonth(desc: string): string | undefined {
  const match = desc.match(/fatura\s+de\s+(\w+)\/?(\d{4})?/i);
  if (match) {
    return match[2] ? `${match[1]}/${match[2]}` : match[1];
  }
  return undefined;
}

/**
 * Build a grouping key that distinguishes different purchases even with similar descriptions.
 * Priority: grupo_parcela > (descricao_normalizada + parcela_total + conta_id)
 * This prevents merging two different "MERCADOPAGO*4PRODUTOS" purchases (e.g., 7/12 vs 7/13).
 */
function getGroupKey(tx: Transacao): string {
  if (tx.grupo_parcela) return tx.grupo_parcela;

  // For "Parcela da fatura", group by the fatura origin month extracted from description
  const isFatura = /parcela da fatura/i.test(tx.descricao);
  if (isFatura) {
    const fatMonth = extractFaturaMonth(tx.descricao);
    return `fatura_parcelada_${fatMonth || tx.descricao}_${tx.conta_id}`;
  }

  // For regular purchases, use description + parcela_total + conta_id to disambiguate
  const desc = tx.descricao_normalizada || tx.descricao;
  return `${desc}_${tx.parcela_total}_${tx.conta_id}`;
}

export default function DividasPage() {
  const { user } = useAuth();

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['dividas-transacoes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transacoes')
        .select(
          'id, descricao, descricao_normalizada, valor, tipo, parcela_atual, parcela_total, grupo_parcela, mes_competencia, data, categoria, conta_id'
        )
        .eq('user_id', user!.id)
        .eq('tipo', 'despesa') // Only expenses — exclude credits/devolutions
        .not('parcela_total', 'is', null)
        .gt('parcela_total', 1);
      if (error) throw error;
      return (data || []) as Transacao[];
    },
    enabled: !!user,
  });

  const { data: contas } = useQuery({
    queryKey: ['contas', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('contas').select('id, nome, tipo').eq('user_id', user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const debtGroups = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];

    // Group using smart key that distinguishes different purchases
    const grouped = new Map<string, Transacao[]>();

    for (const tx of transactions) {
      // Skip payment/credit transactions that shouldn't count as debt
      const descLower = tx.descricao.toLowerCase();
      if (
        descLower.includes('crédito por parcelamento') ||
        descLower.includes('credito por parcelamento') ||
        descLower.includes('pagamento da fatura')
      ) {
        continue;
      }

      const key = getGroupKey(tx);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(tx);
    }

    const result: DebtGroup[] = [];

    for (const [key, txs] of grouped) {
      // Take the transaction with the highest parcela_atual (latest state)
      const latest = txs.reduce((a, b) =>
        (a.parcela_atual || 0) >= (b.parcela_atual || 0) ? a : b
      );

      const parcelaAtual = latest.parcela_atual || 0;
      const parcelaTotal = latest.parcela_total || 0;
      const remaining = Math.max(0, parcelaTotal - parcelaAtual);
      const valorNum = Math.abs(Number(latest.valor));

      // If remaining is 0, the debt is paid off - skip it
      if (remaining === 0) continue;
      // Skip if valor is invalid
      if (!valorNum || isNaN(valorNum)) continue;

      const mesComp = latest.mes_competencia || latest.data.substring(0, 7);
      const mesTermino = addMonths(mesComp, remaining);
      const isFatura = /parcela da fatura/i.test(latest.descricao);

      result.push({
        key,
        displayName: isFatura
          ? `Fatura de ${extractFaturaMonth(latest.descricao) || 'N/A'}`
          : cleanEstablishmentName(latest.descricao),
        descricao: latest.descricao,
        parcelaAtual,
        parcelaTotal,
        valorMensal: valorNum,
        parcelasRestantes: remaining,
        valorRestante: valorNum * remaining,
        mesCompetencia: mesComp,
        mesTermino,
        progressPercent: Math.round((parcelaAtual / parcelaTotal) * 100),
        isFatura,
        faturaMonth: isFatura ? extractFaturaMonth(latest.descricao) : undefined,
        categoria: latest.categoria,
      });
    }

    // Sort by remaining value descending
    result.sort((a, b) => b.valorRestante - a.valorRestante);
    return result;
  }, [transactions]);

  const faturaDebts = useMemo(
    () => debtGroups.filter((d) => d.isFatura),
    [debtGroups]
  );

  const purchaseDebts = useMemo(
    () => debtGroups.filter((d) => !d.isFatura),
    [debtGroups]
  );

  // Summary calculations
  const summary = useMemo(() => {
    if (debtGroups.length === 0) {
      return {
        totalRestante: 0,
        totalMensal: 0,
        mesesAteQuitar: 0,
      };
    }

    const totalRestante = debtGroups.reduce((s, d) => s + d.valorRestante, 0);
    const totalMensal = debtGroups.reduce((s, d) => s + d.valorMensal, 0);
    const mesesAteQuitar = Math.max(...debtGroups.map((d) => d.parcelasRestantes));

    return { totalRestante, totalMensal, mesesAteQuitar };
  }, [debtGroups]);

  // Monthly projection (next 12 months)
  const projection = useMemo(() => {
    if (debtGroups.length === 0) return [];

    const now = new Date();
    const currentYYYYMM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const months: {
      mes: string;
      label: string;
      valorMensal: number;
      parcelasEncerram: number;
      saldoRestante: number;
    }[] = [];

    let runningTotal = summary.totalRestante;

    for (let i = 1; i <= 12; i++) {
      const mes = addMonths(currentYYYYMM, i);
      let valorMensal = 0;
      let parcelasEncerram = 0;

      for (const debt of debtGroups) {
        if (mes <= debt.mesTermino) {
          valorMensal += debt.valorMensal;
        }
        if (debt.mesTermino === mes) {
          parcelasEncerram++;
        }
      }

      runningTotal -= valorMensal;
      if (runningTotal < 0) runningTotal = 0;

      const [y, m] = mes.split('-').map(Number);
      months.push({
        mes,
        label: `${getMonthName(m - 1)}/${y}`,
        valorMensal,
        parcelasEncerram,
        saldoRestante: runningTotal,
      });
    }

    return months;
  }, [debtGroups, summary.totalRestante]);

  // Conta name lookup
  const getContaNome = (contaId: string) => contas?.find(c => c.id === contaId)?.nome || '';

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Dívidas</h1>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Dívidas</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe seus parcelamentos e projeção de quitação
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Dívida restante
            </CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {formatCurrency(summary.totalRestante)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {debtGroups.length} parcelamento{debtGroups.length !== 1 ? 's' : ''} ativo{debtGroups.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Parcela mensal total
            </CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(summary.totalMensal)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Soma de todas as parcelas ativas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Meses até quitar
            </CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary.mesesAteQuitar}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                {summary.mesesAteQuitar === 1 ? 'mês' : 'meses'}
              </span>
            </p>
            {summary.mesesAteQuitar > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Previsão: {formatMesCompetencia(addMonths(
                  `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
                  summary.mesesAteQuitar
                ))}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Parcelamentos de Fatura */}
      {faturaDebts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-warning" />
            <h2 className="text-lg font-semibold">Parcelamentos de fatura</h2>
            <Badge variant="destructive">{faturaDebts.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Faturas que foram refinanciadas — incluem juros de 8-17% a.m.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {faturaDebts.map((debt) => (
              <Card key={debt.key} className="border-warning/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {debt.displayName}
                    </CardTitle>
                    <Badge variant="outline">
                      {debt.parcelaAtual}/{debt.parcelaTotal}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor mensal</span>
                    <span className="font-medium">
                      {formatCurrency(debt.valorMensal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Restante ({debt.parcelasRestantes}x)</span>
                    <span className="font-medium text-destructive">
                      {formatCurrency(debt.valorRestante)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Termina em</span>
                    <span className="font-medium">
                      {formatMesCompetencia(debt.mesTermino)}
                    </span>
                  </div>
                  <Progress value={debt.progressPercent} className="h-2" />
                  <p className="text-center text-xs text-muted-foreground">
                    {debt.progressPercent}% pago
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Compras Parceladas */}
      {purchaseDebts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Compras parceladas</h2>
            <Badge variant="secondary">{purchaseDebts.length}</Badge>
          </div>

          <div className="space-y-2">
            {purchaseDebts.map((debt) => (
              <Card key={debt.key}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium" title={debt.descricao}>
                        {debt.displayName}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">
                          {debt.parcelaAtual}/{debt.parcelaTotal}
                        </Badge>
                        <span>Termina {formatMesCompetencia(debt.mesTermino)}</span>
                        {debt.categoria && debt.categoria !== 'Outros' && (
                          <span>· {debt.categoria}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-right shrink-0">
                      <div>
                        <p className="text-xs text-muted-foreground">Mensal</p>
                        <p className="font-medium text-sm">
                          {formatCurrency(debt.valorMensal)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Restante ({debt.parcelasRestantes}x)</p>
                        <p className="font-medium text-sm text-destructive">
                          {formatCurrency(debt.valorRestante)}
                        </p>
                      </div>
                      <div className="hidden w-16 sm:block">
                        <p className="mb-1 text-right text-[10px] text-muted-foreground">
                          {debt.progressPercent}%
                        </p>
                        <Progress value={debt.progressPercent} className="h-1.5" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Projecao Mensal */}
      {projection.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Projeção mensal</h2>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Estimativa sem considerar juros e encargos adicionais
          </p>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium">Mês</th>
                      <th className="px-4 py-3 text-right font-medium">Valor mensal</th>
                      <th className="px-4 py-3 text-center font-medium">Encerram</th>
                      <th className="px-4 py-3 text-right font-medium">Saldo restante</th>
                      <th className="px-4 py-3 text-center font-medium w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {projection.map((month, i) => {
                      const prevSaldo =
                        i === 0
                          ? summary.totalRestante
                          : projection[i - 1].saldoRestante;
                      const dropPercent =
                        prevSaldo > 0
                          ? ((prevSaldo - month.saldoRestante) / prevSaldo) * 100
                          : 0;
                      const significantDrop = dropPercent > 15;

                      return (
                        <tr
                          key={month.mes}
                          className={`border-b last:border-0 ${
                            significantDrop
                              ? 'bg-green-50 dark:bg-green-950/20'
                              : ''
                          }`}
                        >
                          <td className="px-4 py-2.5 font-medium">{month.label}</td>
                          <td className="px-4 py-2.5 text-right">
                            {formatCurrency(month.valorMensal)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {month.parcelasEncerram > 0 ? (
                              <Badge
                                variant="secondary"
                                className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs"
                              >
                                {month.parcelasEncerram}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium">
                            {formatCurrency(month.saldoRestante)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {significantDrop && (
                              <ArrowDownRight className="inline h-4 w-4 text-green-600" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {debtGroups.length === 0 && !isLoading && (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <Landmark className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">Nenhuma dívida encontrada</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Importe faturas do Mercado Pago (PDF) ou extratos com parcelas para ver seus parcelamentos aqui.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
