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
  valor: number;
  tipo: string;
  parcela_atual: number | null;
  parcela_total: number | null;
  grupo_parcela: string | null;
  mes_competencia: string | null;
  data: string;
  categoria: string | null;
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
    .replace(/^(MERCADOLIVRE\*|MERCADOPAGO\*|MP\*|EC\s\*)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFaturaMonth(desc: string): string | undefined {
  const match = desc.match(/fatura\s+de\s+(\w+)\/(\d{4})/i);
  if (match) {
    return `${match[1]}/${match[2]}`;
  }
  return undefined;
}

export default function DividasPage() {
  const { user } = useAuth();

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['dividas-transacoes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transacoes')
        .select(
          'id, descricao, descricao_normalizada, valor, tipo, parcela_atual, parcela_total, grupo_parcela, mes_competencia, data, categoria'
        )
        .eq('user_id', user!.id)
        .not('parcela_total', 'is', null)
        .gt('parcela_total', 1);
      if (error) throw error;
      return (data || []) as Transacao[];
    },
    enabled: !!user,
  });

  const debtGroups = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];

    // Group by grupo_parcela if available, otherwise by descricao_normalizada or descricao
    const grouped = new Map<string, Transacao[]>();

    for (const tx of transactions) {
      const key =
        tx.grupo_parcela ||
        tx.descricao_normalizada ||
        tx.descricao;
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

      // If remaining is 0, the debt is paid off - skip it
      if (remaining === 0) continue;

      const mesComp = latest.mes_competencia || latest.data.substring(0, 7);
      const mesTermino = addMonths(mesComp, remaining);
      const isFatura = /parcela da fatura/i.test(latest.descricao);

      result.push({
        key,
        displayName: cleanEstablishmentName(latest.descricao),
        descricao: latest.descricao,
        parcelaAtual,
        parcelaTotal,
        valorMensal: Math.abs(latest.valor),
        parcelasRestantes: remaining,
        valorRestante: Math.abs(latest.valor) * remaining,
        mesCompetencia: mesComp,
        mesTermino,
        progressPercent: Math.round((parcelaAtual / parcelaTotal) * 100),
        isFatura,
        faturaMonth: isFatura ? extractFaturaMonth(latest.descricao) : undefined,
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
        parcelaMensalMedia: 0,
        proximaFatura: 0,
        mesesAteQuitar: 0,
      };
    }

    const totalRestante = debtGroups.reduce((s, d) => s + d.valorRestante, 0);
    const totalMensal = debtGroups.reduce((s, d) => s + d.valorMensal, 0);

    // Next month's estimated bill = sum of all active monthly values
    const proximaFatura = totalMensal;

    // Months until all debts are cleared = max remaining parcelas
    const mesesAteQuitar = Math.max(...debtGroups.map((d) => d.parcelasRestantes));

    return {
      totalRestante,
      parcelaMensalMedia: totalMensal,
      proximaFatura,
      mesesAteQuitar,
    };
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
        // Check if this debt is still active in this month
        const debtEndMonth = debt.mesTermino;
        if (mes <= debtEndMonth) {
          valorMensal += debt.valorMensal;
        }
        // Check if this debt ends this month
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

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold">Dividas</h1>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dividas</h1>
        <p className="text-muted-foreground">
          Acompanhe seus parcelamentos e projecao de quitacao
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Divida restante
            </CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {formatCurrency(summary.totalRestante)}
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
              {formatCurrency(summary.parcelaMensalMedia)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Proxima fatura estimada
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(summary.proximaFatura)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Meses ate quitar
            </CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary.mesesAteQuitar}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                {summary.mesesAteQuitar === 1 ? 'mes' : 'meses'}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Parcelamentos de Fatura */}
      {faturaDebts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Parcelamentos de fatura</h2>
            <Badge variant="secondary">{faturaDebts.length}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {faturaDebts.map((debt) => (
              <Card key={debt.key} className="relative overflow-hidden">
                <div
                  className="absolute inset-x-0 top-0 h-1 bg-primary"
                  style={{ width: `${debt.progressPercent}%` }}
                />
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      Fatura de {debt.faturaMonth || 'N/A'}
                    </CardTitle>
                    <Badge variant="outline">
                      {debt.parcelaAtual}/{debt.parcelaTotal}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor mensal</span>
                    <span className="font-medium">
                      {formatCurrency(debt.valorMensal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Restante</span>
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

          <div className="space-y-3">
            {purchaseDebts.map((debt) => (
              <Card key={debt.key}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium" title={debt.descricao}>
                        {debt.displayName}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="outline" className="text-xs">
                          {debt.parcelaAtual}/{debt.parcelaTotal}
                        </Badge>
                        {debt.categoria && (
                          <span className="text-xs">{debt.categoria}</span>
                        )}
                        <span className="text-xs">
                          Termina {formatMesCompetencia(debt.mesTermino)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <p className="text-sm text-muted-foreground">Mensal</p>
                        <p className="font-medium">
                          {formatCurrency(debt.valorMensal)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Restante</p>
                        <p className="font-medium text-destructive">
                          {formatCurrency(debt.valorRestante)}
                        </p>
                      </div>
                      <div className="hidden w-20 sm:block">
                        <p className="mb-1 text-right text-xs text-muted-foreground">
                          {debt.progressPercent}%
                        </p>
                        <Progress value={debt.progressPercent} className="h-2" />
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
            <h2 className="text-lg font-semibold">Projecao mensal</h2>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium">Mes</th>
                      <th className="px-4 py-3 text-right font-medium">
                        Valor mensal
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        Parcelas encerram
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Saldo restante
                      </th>
                      <th className="px-4 py-3 text-center font-medium w-12"></th>
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
                          className={`border-b last:border-0 transition-colors ${
                            significantDrop
                              ? 'bg-green-50 dark:bg-green-950/20'
                              : ''
                          }`}
                        >
                          <td className="px-4 py-3 font-medium">{month.label}</td>
                          <td className="px-4 py-3 text-right">
                            {formatCurrency(month.valorMensal)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {month.parcelasEncerram > 0 ? (
                              <Badge
                                variant="secondary"
                                className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                              >
                                {month.parcelasEncerram}{' '}
                                {month.parcelasEncerram === 1
                                  ? 'encerra'
                                  : 'encerram'}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatCurrency(month.saldoRestante)}
                          </td>
                          <td className="px-4 py-3 text-center">
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
            <h3 className="text-lg font-medium">Nenhuma divida encontrada</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Transacoes parceladas aparecerão aqui automaticamente.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
