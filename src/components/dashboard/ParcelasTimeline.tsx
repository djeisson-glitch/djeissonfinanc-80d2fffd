import { useMemo } from 'react';
import { formatCurrency, getMonthName } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

interface MonthData {
  mes: string;
  mesKey: string;
  continua: number;
  economia: number;
  terminam: { descricao: string; valor: number; parcelaInfo: string }[];
}

export function ParcelasTimeline({ parcelas }: ParcelasTimelineProps) {
  const chartData = useMemo(() => {
    if (!parcelas || parcelas.length === 0) return [];

    // Group parcelas by month key
    const porMes: Record<string, { total: number; items: Parcela[] }> = {};
    parcelas.forEach(p => {
      const d = new Date(p.data + 'T00:00:00');
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!porMes[key]) porMes[key] = { total: 0, items: [] };
      porMes[key].total += Number(p.valor);
      porMes[key].items.push(p);
    });

    const sortedKeys = Object.keys(porMes).sort();

    // For each month, find parcelas that are the LAST installment (parcela_atual === parcela_total)
    const result: MonthData[] = sortedKeys.map((key, idx) => {
      const d = new Date(key + '-01T00:00:00');
      const label = `${getMonthName(d.getMonth())}/${d.getFullYear().toString().slice(2)}`;
      const { total, items } = porMes[key];

      // Find parcelas ending THIS month (last installment)
      const ending = items.filter(p => p.parcela_atual != null && p.parcela_total != null && p.parcela_atual === p.parcela_total);

      const economiaValor = ending.reduce((s, p) => s + Number(p.valor), 0);

      const terminam = ending.map(p => ({
        descricao: p.descricao,
        valor: Number(p.valor),
        parcelaInfo: `${p.parcela_atual}/${p.parcela_total}`,
      }));

      return {
        mes: label,
        mesKey: key,
        continua: total - economiaValor,
        economia: economiaValor,
        terminam,
      };
    });

    return result;
  }, [parcelas]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Timeline de Parcelas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhuma parcela futura</p>
        </CardContent>
      </Card>
    );
  }

  const CustomTooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const data = chartData.find(d => d.mes === label);
    const total = (payload[0]?.value || 0) + (payload[1]?.value || 0);

    return (
      <div className="rounded-lg border bg-popover p-3 shadow-md text-popover-foreground text-sm space-y-1">
        <p className="font-semibold">{label}</p>
        <p>Total: {formatCurrency(total)}</p>
        {data && data.economia > 0 && (
          <>
            <p className="text-success">
              ✅ No mês seguinte você terá {formatCurrency(data.economia)} a menos em parcelas
            </p>
            {data.terminam.map((t, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                • {t.descricao} ({t.parcelaInfo})
              </p>
            ))}
          </>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingDown className="h-5 w-5" />
          Timeline de Parcelas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltipContent />} />
            <Bar dataKey="continua" stackId="a" radius={[0, 0, 0, 0]} fill="hsl(var(--foreground) / 0.25)" name="Continua" />
            <Bar dataKey="economia" stackId="a" radius={[4, 4, 0, 0]} fill="hsl(142, 71%, 45%)" name="Termina" />
          </BarChart>
        </ResponsiveContainer>

        {/* Details of ending parcelas below chart */}
        <TooltipProvider>
          <div className="space-y-2">
            {chartData.filter(d => d.economia > 0).map(d => {
              // Next month label
              const parts = d.mesKey.split('-');
              const nextDate = new Date(Number(parts[0]), Number(parts[1]) - 1 + 1, 1);
              const nextLabel = `${getMonthName(nextDate.getMonth())}/${nextDate.getFullYear().toString().slice(2)}`;

              return (
                <UITooltip key={d.mesKey}>
                  <TooltipTrigger asChild>
                    <div className="flex items-start gap-2 text-xs p-2 rounded-md bg-muted/50 cursor-default">
                      <span className="shrink-0">❌</span>
                      <div>
                        <span className="font-medium">
                          Termina em {nextLabel}: {formatCurrency(d.economia)} ({d.terminam.length} parcela{d.terminam.length > 1 ? 's' : ''})
                        </span>
                        <p className="text-muted-foreground mt-0.5">
                          {d.terminam.map(t => `${t.descricao} ${t.parcelaInfo}`).join(', ')}
                        </p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Em {nextLabel} você terá {formatCurrency(d.economia)} a menos em parcelas</p>
                  </TooltipContent>
                </UITooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
