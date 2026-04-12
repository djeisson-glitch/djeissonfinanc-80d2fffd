import { useState, useMemo } from 'react';
import { formatCurrency } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Home, TrendingDown, TrendingUp } from 'lucide-react';
import { AiFinancingAnalysis } from './AiFinancingAnalysis';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface Props {
  receitaMensal: number;
  totalDespesasMensal: number;
}

function calcPRICE(pv: number, rateMonthly: number, n: number) {
  if (rateMonthly === 0) return pv / n;
  return pv * (rateMonthly * Math.pow(1 + rateMonthly, n)) / (Math.pow(1 + rateMonthly, n) - 1);
}

function calcSACFirstLast(pv: number, rateMonthly: number, n: number) {
  const amort = pv / n;
  const first = amort + pv * rateMonthly;
  const last = amort + amort * rateMonthly;
  return { first, last, amort };
}

export function FinanciamentoCalculadora({ receitaMensal, totalDespesasMensal }: Props) {
  const [valorImovel, setValorImovel] = useState('500000');
  const [entrada, setEntrada] = useState('100000');
  const [taxaAnual, setTaxaAnual] = useState('10.5');
  const [prazoAnos, setPrazoAnos] = useState(30);
  const [sistema, setSistema] = useState<'price' | 'sac'>('sac');

  const valorImovelNum = parseFloat(valorImovel.replace(/\./g, '').replace(',', '.')) || 0;
  const entradaNum = parseFloat(entrada.replace(/\./g, '').replace(',', '.')) || 0;
  const taxaAnualNum = parseFloat(taxaAnual.replace(',', '.')) || 0;
  const prazoMeses = prazoAnos * 12;

  const financiado = Math.max(0, valorImovelNum - entradaNum);
  const percEntrada = valorImovelNum > 0 ? (entradaNum / valorImovelNum) * 100 : 0;
  const taxaMensal = Math.pow(1 + taxaAnualNum / 100, 1 / 12) - 1;

  const calc = useMemo(() => {
    if (!financiado || !prazoMeses) return null;

    let parcelaInicial: number;
    let parcelaFinal: number;
    let totalPago: number;

    if (sistema === 'price') {
      const parcela = calcPRICE(financiado, taxaMensal, prazoMeses);
      parcelaInicial = parcela;
      parcelaFinal = parcela;
      totalPago = parcela * prazoMeses + entradaNum;
    } else {
      const { first, last } = calcSACFirstLast(financiado, taxaMensal, prazoMeses);
      parcelaInicial = first;
      parcelaFinal = last;
      // SAC total: sum of all installments
      const amort = financiado / prazoMeses;
      let total = 0;
      for (let i = 0; i < prazoMeses; i++) {
        const saldoDevedor = financiado - amort * i;
        total += amort + saldoDevedor * taxaMensal;
      }
      totalPago = total + entradaNum;
    }

    const totalJuros = totalPago - valorImovelNum;
    const percRenda = receitaMensal > 0 ? (parcelaInicial / receitaMensal) * 100 : 0;
    const saldoComFinanciamento = receitaMensal - totalDespesasMensal - parcelaInicial;

    // Viability
    let semaforo: 'verde' | 'amarelo' | 'vermelho';
    if (percRenda > 30 || saldoComFinanciamento < 0) {
      semaforo = 'vermelho';
    } else if (percRenda > 25) {
      semaforo = 'amarelo';
    } else {
      semaforo = 'verde';
    }

    // Chart data: first 60 months or full term, whichever is less
    const chartMonths = Math.min(prazoMeses, 360);
    const chartStep = Math.max(1, Math.floor(chartMonths / 30));
    const chartData: { mes: number; parcela: number; juros: number; amortizacao: number; saldoDevedor: number }[] = [];

    if (sistema === 'price') {
      const parcela = parcelaInicial;
      let saldo = financiado;
      for (let i = 1; i <= chartMonths; i++) {
        const jurosMes = saldo * taxaMensal;
        const amortMes = parcela - jurosMes;
        saldo -= amortMes;
        if ((i - 1) % chartStep === 0) {
          chartData.push({ mes: i, parcela, juros: jurosMes, amortizacao: amortMes, saldoDevedor: Math.max(0, saldo) });
        }
      }
    } else {
      const amort = financiado / prazoMeses;
      let saldo = financiado;
      for (let i = 1; i <= chartMonths; i += chartStep) {
        const idx = i - 1;
        const saldoAtual = financiado - amort * idx;
        const jurosMes = saldoAtual * taxaMensal;
        const parcela = amort + jurosMes;
        saldo = saldoAtual - amort;
        chartData.push({ mes: i, parcela, juros: jurosMes, amortizacao: amort, saldoDevedor: Math.max(0, saldo) });
      }
    }

    return { parcelaInicial, parcelaFinal, totalPago, totalJuros, percRenda, saldoComFinanciamento, semaforo, chartData };
  }, [financiado, prazoMeses, taxaMensal, sistema, receitaMensal, totalDespesasMensal, entradaNum, valorImovelNum]);

  const semaforoConfig = {
    verde: { bg: 'border-green-500/40', color: 'text-green-600', label: '🟢 Viável', desc: 'Parcela < 25% da renda e saldo mensal positivo' },
    amarelo: { bg: 'border-amber-500/40', color: 'text-amber-600', label: '🟡 Possível com ajustes', desc: 'Parcela entre 25-30% da renda' },
    vermelho: { bg: 'border-destructive/40', color: 'text-destructive', label: '🔴 Inviável agora', desc: 'Parcela > 30% da renda ou saldo negativo' },
  };

  return (
    <div className="space-y-4">
      {/* Inputs */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor do imóvel</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                <Input value={valorImovel} onChange={e => setValorImovel(e.target.value)} className="pl-8 h-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Entrada ({percEntrada.toFixed(1)}%)</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                <Input value={entrada} onChange={e => setEntrada(e.target.value)} className="pl-8 h-9" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Taxa de juros anual (%)</Label>
              <Input value={taxaAnual} onChange={e => setTaxaAnual(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prazo: {prazoAnos} anos ({prazoMeses} meses)</Label>
              <Slider
                value={[prazoAnos]}
                onValueChange={([v]) => setPrazoAnos(v)}
                min={10}
                max={35}
                step={1}
                className="mt-3"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sistema</Label>
              <Select value={sistema} onValueChange={v => setSistema(v as 'price' | 'sac')}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="price">PRICE (parcela fixa)</SelectItem>
                  <SelectItem value="sac">SAC (parcela decrescente)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            Valor financiado: <strong className="text-foreground">{formatCurrency(financiado)}</strong>
          </div>
        </CardContent>
      </Card>

      {calc && (
        <>
          {/* Semáforo */}
          <Card className={semaforoConfig[calc.semaforo].bg}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-lg font-bold">
                <Home className="h-6 w-6" />
                <span className={semaforoConfig[calc.semaforo].color}>
                  {semaforoConfig[calc.semaforo].label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {semaforoConfig[calc.semaforo].desc}
              </p>
            </CardContent>
          </Card>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">Parcela Inicial</p>
                <p className="text-base font-bold">{formatCurrency(calc.parcelaInicial)}</p>
              </CardContent>
            </Card>
            {sistema === 'sac' && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-[10px] text-muted-foreground">Parcela Final</p>
                  <p className="text-base font-bold text-success">{formatCurrency(calc.parcelaFinal)}</p>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">Total Pago</p>
                <p className="text-base font-bold">{formatCurrency(calc.totalPago)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">Total Juros</p>
                <p className="text-base font-bold text-destructive">{formatCurrency(calc.totalJuros)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">% da Renda</p>
                <p className={`text-base font-bold ${calc.percRenda > 30 ? 'text-destructive' : calc.percRenda > 25 ? 'text-amber-500' : 'text-success'}`}>
                  {calc.percRenda.toFixed(1)}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">Saldo c/ Financ.</p>
                <p className={`text-base font-bold ${calc.saldoComFinanciamento >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(calc.saldoComFinanciamento)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Evolução das Parcelas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={calc.chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} label={{ value: 'Mês', position: 'insideBottom', offset: -5, fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <ReTooltip formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = { parcela: 'Parcela', juros: 'Juros', amortizacao: 'Amortização', saldoDevedor: 'Saldo Devedor' };
                      return [formatCurrency(value), labels[name] || name];
                    }} />
                    <Legend formatter={(value: string) => {
                      const labels: Record<string, string> = { parcela: 'Parcela', juros: 'Juros', amortizacao: 'Amortização', saldoDevedor: 'Saldo Devedor' };
                      return labels[value] || value;
                    }} />
                    <Line type="monotone" dataKey="parcela" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="juros" stroke="hsl(var(--destructive))" strokeWidth={1} dot={false} />
                    <Line type="monotone" dataKey="saldoDevedor" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* AI Analysis */}
          <AiFinancingAnalysis context={{
            valorImovel: valorImovelNum,
            entrada: entradaNum,
            percEntrada,
            financiado,
            taxaAnual: taxaAnualNum,
            prazoAnos,
            sistema,
            parcelaInicial: calc.parcelaInicial,
            totalJuros: calc.totalJuros,
            receitaMensal,
            despesasMensais: totalDespesasMensal,
            saldoLivre: receitaMensal - totalDespesasMensal,
            saldoComFinanciamento: calc.saldoComFinanciamento,
            percRenda: calc.percRenda,
            semaforo: calc.semaforo,
          }} />

          {/* Context from user data */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Seu Contexto Financeiro</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Renda mensal</span>
                <span className="font-medium">{formatCurrency(receitaMensal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Despesas atuais</span>
                <span className="font-medium text-destructive">{formatCurrency(totalDespesasMensal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo livre (sem financ.)</span>
                <span className="font-medium">{formatCurrency(receitaMensal - totalDespesasMensal)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Parcela do financiamento</span>
                <span className="font-medium">- {formatCurrency(calc.parcelaInicial)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Saldo com financiamento</span>
                <span className={calc.saldoComFinanciamento >= 0 ? 'text-success' : 'text-destructive'}>
                  {formatCurrency(calc.saldoComFinanciamento)}
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
