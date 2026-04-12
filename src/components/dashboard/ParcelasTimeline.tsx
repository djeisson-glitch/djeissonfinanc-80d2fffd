import { useMemo, useState } from 'react';
import { formatCurrency, getMonthName } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Parcela {
  data: string;
  valor: number;
  descricao: string;
  parcela_atual: number | null;
  parcela_total: number | null;
  grupo_parcela: string | null;
}

interface ParcelasTimelineProps {
  parcelas: Parcela[];
}

interface MonthGroup {
  mes: string;
  mesKey: string;
  total: number;
  items: Parcela[];
  terminam: { descricao: string; valor: number; parcelaInfo: string }[];
  isCurrent: boolean;
  isPast: boolean;
}

export function ParcelasTimeline({ parcelas }: ParcelasTimelineProps) {
  const [selectedMonth, setSelectedMonth] = useState<MonthGroup | null>(null);
  const [selectedEnding, setSelectedEnding] = useState<MonthGroup | null>(null);

  const monthGroups = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-based

    // Build map from parcelas data
    const porMes: Record<string, { total: number; items: Parcela[] }> = {};
    let maxYear = currentYear;
    (parcelas || []).forEach(p => {
      const d = new Date(p.data + 'T00:00:00');
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!porMes[key]) porMes[key] = { total: 0, items: [] };
      porMes[key].total += Number(p.valor);
      porMes[key].items.push(p);
      if (d.getFullYear() > maxYear) maxYear = d.getFullYear();
    });

    // Generate months from Jan of current year through Dec of last year with parcelas
    const totalMonths = (maxYear - currentYear + 1) * 12;
    return Array.from({ length: totalMonths }, (_, i) => {
      const monthIdx = i % 12;
      const yearIdx = currentYear + Math.floor(i / 12);
      const key = `${yearIdx}-${String(monthIdx + 1).padStart(2, '0')}`;
      const label = `${getMonthName(monthIdx)}/${yearIdx.toString().slice(2)}`;
      const data = porMes[key] || { total: 0, items: [] };
      const ending = data.items.filter(p => p.parcela_atual != null && p.parcela_total != null && p.parcela_atual === p.parcela_total);
      const terminam = ending.map(p => ({
        descricao: p.descricao,
        valor: Number(p.valor),
        parcelaInfo: `${p.parcela_atual}/${p.parcela_total}`,
      }));
      const isCurrent = yearIdx === currentYear && monthIdx === currentMonth;
      const isPast = yearIdx < currentYear || (yearIdx === currentYear && monthIdx < currentMonth);
      return { mes: label, mesKey: key, total: data.total, items: data.items, terminam, isCurrent, isPast } as MonthGroup;
    });
  }, [parcelas]);

  const endingMonths = monthGroups.filter(m => m.terminam.length > 0);

  const chartData = monthGroups.map(m => ({ mes: m.mes, total: m.total, mesKey: m.mesKey, isCurrent: m.isCurrent, isPast: m.isPast }));

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-popover p-3 shadow-md text-popover-foreground text-sm">
        <p className="font-semibold">{label}</p>
        <p>Total: {formatCurrency(payload[0]?.value || 0)}</p>
      </div>
    );
  };

  const getIntensityClasses = (valor: number) => {
    if (valor > 1500) return 'bg-emerald-700 text-emerald-50';
    if (valor >= 500) return 'bg-emerald-500 text-emerald-50';
    return 'bg-emerald-200 text-emerald-900';
  };

  return (
    <>
      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Parcelas por Mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="total"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(_: any, index: number) => setSelectedMonth(monthGroups[index])}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.isCurrent ? 'hsl(var(--primary))' : entry.isPast ? 'hsl(var(--muted-foreground) / 0.3)' : 'hsl(var(--foreground) / 0.3)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">Parcelas que Terminam</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {monthGroups.map(m => {
              const economia = m.terminam.reduce((s, t) => s + t.valor, 0);
              const count = m.terminam.length;
              const hasEnding = count > 0;
              return (
                <button
                  key={m.mesKey}
                  onClick={() => hasEnding && setSelectedEnding(m)}
                  disabled={!hasEnding}
                  className={`rounded-lg px-3 py-4 text-center transition-transform ${
                    hasEnding
                      ? `cursor-pointer hover:scale-105 ${m.isCurrent ? 'ring-2 ring-primary ' : ''}${getIntensityClasses(economia)}`
                      : `cursor-default ${m.isPast ? 'bg-muted/30 text-muted-foreground/50' : 'bg-muted/50 text-muted-foreground'}`
                  }`}
                >
                  <p className="text-[11px] font-medium opacity-70">{m.mes}</p>
                  <p className={`text-lg font-bold mt-1 ${!hasEnding ? 'opacity-40' : ''}`}>
                    {hasEnding ? formatCurrency(economia) : '—'}
                  </p>
                  {hasEnding && <p className="text-[11px] opacity-60">{count} parcela{count > 1 ? 's' : ''}</p>}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Modal: parcelas do mês */}
      <Dialog open={!!selectedMonth} onOpenChange={() => setSelectedMonth(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Parcelas em {selectedMonth?.mes}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {selectedMonth?.items.map((p, i) => (
              <div key={i} className="flex justify-between items-center p-2 rounded-md bg-muted/50 text-sm">
                <div>
                  <p className="font-medium">{p.descricao}</p>
                  {p.parcela_atual && p.parcela_total && (
                    <p className="text-xs text-muted-foreground">{p.parcela_atual}/{p.parcela_total}</p>
                  )}
                </div>
                <span className="font-medium">{formatCurrency(p.valor)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t font-semibold text-sm">
              <span>Total</span>
              <span>{formatCurrency(selectedMonth?.total || 0)}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: parcelas que terminam */}
      <Dialog open={!!selectedEnding} onOpenChange={() => setSelectedEnding(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Parcelas que terminam em {selectedEnding?.mes}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {selectedEnding?.terminam.map((t, i) => (
              <div key={i} className="flex justify-between items-center p-2 rounded-md bg-muted/50 text-sm">
                <div>
                  <p className="font-medium">{t.descricao}</p>
                  <p className="text-xs text-muted-foreground">{t.parcelaInfo}</p>
                </div>
                <span className="font-medium">{formatCurrency(t.valor)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t font-semibold text-sm">
              <span>Economia no mês seguinte</span>
              <span className="text-emerald-600">{formatCurrency(selectedEnding?.terminam.reduce((s, t) => s + t.valor, 0) || 0)}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
