import { useState, useMemo } from 'react';
import { formatCurrency } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Scale, Info } from 'lucide-react';
import { SacParams, buildAmortizationTable, calcTaxaMensal } from '@/lib/sac-utils';

interface Props {
  params: SacParams;
}

function StatRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${className || ''}`}>{value}</span>
    </div>
  );
}

export function SimuladorAmortizacaoTab({ params }: Props) {
  const [valorDisponivel, setValorDisponivel] = useState(25000);
  const [mesAmortizacao, setMesAmortizacao] = useState(12);

  const taxaMensal = calcTaxaMensal(params.taxaAnualNominal);
  const trMensal = calcTaxaMensal(params.trAnual);
  const valorFinanciado = Math.max(0, params.valorImovel - params.entrada);
  const amortFixa = valorFinanciado / params.prazoMeses;

  const result = useMemo(() => {
    const rows = buildAmortizationTable(valorFinanciado, params.prazoMeses, taxaMensal, trMensal);
    const mesIdx = Math.min(mesAmortizacao, rows.length) - 1;
    if (mesIdx < 0) return null;

    const rowAtMes = rows[mesIdx];
    const saldoNoMes = rowAtMes.saldoDevedor;
    const parcelaNormal = rowAtMes.parcelaNormal;

    // OPÇÃO A: pagar parcelas normais
    let parcelasCobertas = 0;
    let totalDesembolsadoA = 0;
    let saldoA = saldoNoMes;
    for (let i = mesIdx; i < rows.length; i++) {
      if (totalDesembolsadoA + rows[i].parcelaNormal > valorDisponivel) break;
      totalDesembolsadoA += rows[i].parcelaNormal;
      saldoA = rows[i].saldoComExtra; // saldo after normal amort
      parcelasCobertas++;
    }
    // Recalculate saldoA properly
    saldoA = saldoNoMes - amortFixa * parcelasCobertas;
    const prazoRestanteA = params.prazoMeses - mesAmortizacao - parcelasCobertas + 1;

    // OPÇÃO B: amortizar antecipado
    const totalDesembolsadoB = valorDisponivel;
    const saldoB = Math.max(0, saldoNoMes - valorDisponivel);
    const prazoRestanteB = amortFixa > 0 ? Math.ceil(saldoB / amortFixa) : 0;
    const mesesEconomizados = Math.max(0, prazoRestanteA - prazoRestanteB);

    // Estimar juros economizados nos meses economizados
    let jurosEconomizados = 0;
    const startMes = params.prazoMeses - mesesEconomizados;
    for (let i = startMes; i < rows.length && i < params.prazoMeses; i++) {
      if (rows[i]) {
        jurosEconomizados += rows[i].juros + rows[i].correcaoTR;
      }
    }

    // Veredicto
    let veredicto: 'amortizar' | 'equivalente' | 'parcelas';
    if (mesesEconomizados > 6) veredicto = 'amortizar';
    else if (mesesEconomizados >= 1) veredicto = 'equivalente';
    else veredicto = 'parcelas';

    return {
      saldoNoMes, parcelaNormal, amortFixa,
      parcelasCobertas, totalDesembolsadoA, saldoA, prazoRestanteA,
      totalDesembolsadoB, saldoB, prazoRestanteB,
      mesesEconomizados, jurosEconomizados,
      veredicto,
    };
  }, [valorFinanciado, params.prazoMeses, taxaMensal, trMensal, mesAmortizacao, valorDisponivel, amortFixa]);

  if (!result) return null;

  const veredictoBg = result.veredicto === 'amortizar'
    ? 'border-green-500/50 bg-green-500/5'
    : result.veredicto === 'equivalente'
      ? 'border-amber-500/50 bg-amber-500/5'
      : 'border-blue-500/50 bg-blue-500/5';

  const veredictoIcon = result.veredicto === 'amortizar' ? '✅' : result.veredicto === 'equivalente' ? '⚖️' : 'ℹ️';
  const veredictoLabel = result.veredicto === 'amortizar'
    ? 'AMORTIZAR VALE MAIS'
    : result.veredicto === 'equivalente'
      ? 'EQUIVALENTE'
      : 'PAGAR PARCELAS PODE SER MELHOR';

  return (
    <div className="space-y-4">
      {/* Inputs */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Simulação de Amortização Antecipada</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor disponível para amortização</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                <Input
                  value={valorDisponivel.toLocaleString('pt-BR')}
                  onChange={e => setValorDisponivel(parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')) || 0)}
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mês da amortização: {mesAmortizacao}</Label>
              <Slider
                value={[mesAmortizacao]}
                onValueChange={([v]) => setMesAmortizacao(v)}
                min={1}
                max={params.prazoMeses}
                step={1}
                className="mt-2"
              />
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <StatRow label="Saldo devedor no mês" value={formatCurrency(result.saldoNoMes)} />
            <StatRow label="Parcela normal" value={formatCurrency(result.parcelaNormal)} />
            <StatRow label="Amortização fixa SAC" value={formatCurrency(result.amortFixa)} />
          </div>
        </CardContent>
      </Card>

      {/* Comparativo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Opção A — Pagar Parcelas</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <StatRow label="Parcelas cobertas" value={`${result.parcelasCobertas} meses`} />
            <StatRow label="Total desembolsado" value={formatCurrency(result.totalDesembolsadoA)} />
            <StatRow label="Saldo devedor após" value={formatCurrency(result.saldoA)} />
            <StatRow label="Prazo restante est." value={`${result.prazoRestanteA} meses`} />
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Opção B — Amortizar Antecipado</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <StatRow label="Total desembolsado" value={formatCurrency(result.totalDesembolsadoB)} />
            <StatRow label="Saldo devedor após" value={formatCurrency(result.saldoB)} />
            <StatRow label="Prazo restante est." value={`${result.prazoRestanteB} meses`} />
            <StatRow label="Meses economizados" value={`${result.mesesEconomizados} meses`} className="text-green-500 font-bold" />
            <StatRow label="Juros/TR economizados" value={formatCurrency(result.jurosEconomizados)} className="text-green-500" />
          </CardContent>
        </Card>
      </div>

      {/* Veredicto */}
      <Card className={veredictoBg}>
        <CardContent className="p-4">
          <div className="text-lg font-bold mb-1">
            {veredictoIcon} {veredictoLabel}
          </div>
          <p className="text-sm text-muted-foreground">
            {result.veredicto === 'amortizar'
              ? `Amortizando antecipado, você economiza ${result.mesesEconomizados} meses de prazo e aproximadamente ${formatCurrency(result.jurosEconomizados)} em juros e TR.`
              : result.veredicto === 'equivalente'
                ? `A diferença é pequena (${result.mesesEconomizados} meses). Considere fatores como liquidez e oportunidades de investimento.`
                : `Pagar as parcelas normais pode ser mais vantajoso. O valor disponível cobre ${result.parcelasCobertas} parcelas, mantendo sua liquidez.`
            }
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
