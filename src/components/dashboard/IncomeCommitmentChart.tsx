import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Wallet } from 'lucide-react';
import { calculateIncomeCommitment, type IncomeCommitmentReport } from '@/lib/income-commitment';
import type { TransactionRecord } from '@/lib/projection-engine';
import { formatCurrency } from '@/lib/format';

interface IncomeCommitmentChartProps {
  transactions: TransactionRecord[];
  receitaBase: number;
}

const SHORT_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  const monthIdx = parseInt(month, 10) - 1;
  return `${SHORT_MONTHS[monthIdx]}/${year.slice(2)}`;
}

function getCommitmentColor(pct: number): string {
  if (pct > 80) return 'text-red-600';
  if (pct > 60) return 'text-yellow-600';
  return 'text-green-600';
}

function getCommitmentBg(pct: number): string {
  if (pct > 80) return 'bg-red-100 text-red-700';
  if (pct > 60) return 'bg-yellow-100 text-yellow-700';
  return 'bg-green-100 text-green-700';
}

function getTrendLabel(tendencia: 'melhorando' | 'piorando' | 'estavel'): { label: string; color: string } {
  switch (tendencia) {
    case 'melhorando':
      return { label: 'Melhorando', color: 'text-green-600' };
    case 'piorando':
      return { label: 'Piorando', color: 'text-red-600' };
    case 'estavel':
      return { label: 'Estavel', color: 'text-yellow-600' };
  }
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-popover-foreground text-sm space-y-1">
      <p className="font-semibold">{label}</p>
      <p className="text-blue-800">Fixos: {formatCurrency(data.fixos)}</p>
      <p className="text-orange-600">Parcelas: {formatCurrency(data.parcelas)}</p>
      <p className="text-gray-500">Variavel est.: {formatCurrency(data.estimadoVariavel)}</p>
      <div className="border-t pt-1 mt-1">
        <p className="font-medium">Receita: {formatCurrency(data.receita)}</p>
        <p className={`font-medium ${data.livre >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          Livre: {formatCurrency(data.livre)}
        </p>
        <p className={getCommitmentColor(data.percentualComprometido)}>
          Comprometido: {data.percentualComprometido.toFixed(1)}%
        </p>
      </div>
    </div>
  );
};

export function IncomeCommitmentChart({ transactions, receitaBase }: IncomeCommitmentChartProps) {
  const report: IncomeCommitmentReport = useMemo(
    () => calculateIncomeCommitment({ transactions, receitaBase }),
    [transactions, receitaBase],
  );

  const chartData = report.meses.map((m) => ({
    mes: formatMonth(m.mes),
    fixos: m.fixos,
    parcelas: m.parcelas,
    estimadoVariavel: m.estimadoVariavel,
    receita: m.receita,
    livre: m.livre,
    percentualComprometido: m.percentualComprometido,
  }));

  const { resumo } = report;
  const trend = getTrendLabel(resumo.tendencia);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Comprometimento da Receita
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Chart */}
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              formatter={(value: string) => {
                const labels: Record<string, string> = {
                  fixos: 'Fixos',
                  parcelas: 'Parcelas',
                  estimadoVariavel: 'Variavel Est.',
                  receita: 'Receita',
                };
                return labels[value] ?? value;
              }}
            />
            <Bar dataKey="fixos" stackId="compromissos" fill="#1e3a5f" name="fixos" radius={[0, 0, 0, 0]} />
            <Bar dataKey="parcelas" stackId="compromissos" fill="#f59e0b" name="parcelas" />
            <Bar
              dataKey="estimadoVariavel"
              stackId="compromissos"
              fill="#9ca3af"
              name="estimadoVariavel"
              radius={[4, 4, 0, 0]}
            />
            <Line type="monotone" dataKey="receita" stroke="#16a34a" strokeWidth={2} dot={false} name="receita" />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Average commitment */}
          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-sm text-muted-foreground">Comprometimento medio</p>
            <p className={`text-2xl font-bold ${getCommitmentColor(resumo.mediaComprometimento)}`}>
              {resumo.mediaComprometimento.toFixed(1)}%
            </p>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  resumo.mediaComprometimento > 80
                    ? 'bg-red-500'
                    : resumo.mediaComprometimento > 60
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, resumo.mediaComprometimento)}%` }}
              />
            </div>
          </div>

          {/* Best month */}
          <div className="rounded-lg border p-4 space-y-1">
            <p className="text-sm text-muted-foreground">Melhor mes</p>
            <p className="text-lg font-semibold">{formatMonth(resumo.melhorMes.mes)}</p>
            <p className="text-green-600 font-medium">{formatCurrency(resumo.melhorMes.livre)} livre</p>
          </div>

          {/* Worst month */}
          <div className="rounded-lg border p-4 space-y-1">
            <p className="text-sm text-muted-foreground">Pior mes</p>
            <p className="text-lg font-semibold">{formatMonth(resumo.piorMes.mes)}</p>
            <p className="text-red-600 font-medium">{formatCurrency(resumo.piorMes.livre)} livre</p>
          </div>

          {/* Trend */}
          <div className="rounded-lg border p-4 space-y-1">
            <p className="text-sm text-muted-foreground">Tendencia</p>
            <p className={`text-lg font-semibold ${trend.color}`}>{trend.label}</p>
            <p className="text-xs text-muted-foreground">
              {resumo.tendencia === 'melhorando'
                ? 'O comprometimento esta diminuindo'
                : resumo.tendencia === 'piorando'
                  ? 'O comprometimento esta aumentando'
                  : 'O comprometimento esta estavel'}
            </p>
          </div>
        </div>

        {/* Installments ending soon */}
        {resumo.parcelasTerminamEm.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">Parcelas que terminam em breve</h3>
            <div className="space-y-2">
              {resumo.parcelasTerminamEm.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.descricao}</span>
                    <Badge variant="outline" className={getCommitmentBg(0)}>
                      {formatMonth(p.mes)}
                    </Badge>
                  </div>
                  <span className="text-green-600 font-medium">
                    +{formatCurrency(p.alivio)}/mes de alivio
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
