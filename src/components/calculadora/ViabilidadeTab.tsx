import { useMemo } from 'react';
import { formatCurrency } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle, XCircle, Info, TrendingDown, ArrowRight, Car } from 'lucide-react';
import { SacParams, calcViabilidade, ViabilidadeResult } from '@/lib/sac-utils';
import { AiFinancingAnalysis } from './AiFinancingAnalysis';

interface Props {
  params: SacParams;
  onChange: (p: Partial<SacParams>) => void;
}

function CurrencyInput({ value, onChange, label, tooltip }: { value: number; onChange: (v: number) => void; label: string; tooltip?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Label className="text-xs">{label}</Label>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
              <TooltipContent><p className="text-xs max-w-[200px]">{tooltip}</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
        <Input
          value={value.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
          onChange={e => onChange(parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')) || 0)}
          className="pl-8 h-9"
        />
      </div>
    </div>
  );
}

function PercentInput({ value, onChange, label, tooltip }: { value: number; onChange: (v: number) => void; label: string; tooltip?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Label className="text-xs">{label}</Label>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
              <TooltipContent><p className="text-xs max-w-[200px]">{tooltip}</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="relative">
        <Input
          value={value.toFixed(2).replace('.', ',')}
          onChange={e => onChange(parseFloat(e.target.value.replace(',', '.')) || 0)}
          className="h-9 pr-8"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
      </div>
    </div>
  );
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" /> : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
      <span className={ok ? 'text-foreground' : 'text-destructive'}>{label}</span>
    </div>
  );
}

function StatRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${className || ''}`}>{value}</span>
    </div>
  );
}

export function ViabilidadeTab({ params, onChange }: Props) {
  const v = useMemo(() => calcViabilidade(params), [params]);

  const diagColor = v.diagnostico === 'viavel'
    ? 'border-green-500/50 bg-green-500/5'
    : v.diagnostico === 'parcial'
      ? 'border-amber-500/50 bg-amber-500/5'
      : 'border-destructive/50 bg-destructive/5';

  const diagEmoji = v.diagnostico === 'viavel' ? '🟢' : v.diagnostico === 'parcial' ? '🟡' : '🔴';
  const diagLabel = v.diagnostico === 'viavel' ? 'VIÁVEL' : v.diagnostico === 'parcial' ? 'PARCIALMENTE VIÁVEL' : 'INVIÁVEL';

  return (
    <div className="space-y-4">
      {/* Bloco A - Dados do Imóvel */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Dados do Imóvel e Financiamento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CurrencyInput label="Valor do imóvel" value={params.valorImovel} onChange={v => onChange({ valorImovel: v })} />
            <CurrencyInput label={`Entrada (${v.entradaPercent.toFixed(1)}%)`} value={params.entrada} onChange={v => onChange({ entrada: v })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Prazo: {Math.floor(params.prazoMeses / 12)} anos ({params.prazoMeses} meses)</Label>
            <Slider value={[params.prazoMeses]} onValueChange={([val]) => onChange({ prazoMeses: val })} min={120} max={420} step={12} className="mt-2" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PercentInput label="Taxa de juros anual" value={params.taxaAnualNominal} onChange={v => onChange({ taxaAnualNominal: v })} />
            <PercentInput label="TR estimada anual" value={params.trAnual} onChange={v => onChange({ trAnual: v })} tooltip="Use ~0% para cenário conservador" />
          </div>
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <StatRow label="Valor financiado" value={formatCurrency(v.valorFinanciado)} />
            <StatRow label="Taxa mensal efetiva" value={`${(v.taxaMensal * 100).toFixed(4)}%`} />
            <StatRow label="Amortização fixa/mês" value={formatCurrency(v.amortFixa)} />
          </div>
        </CardContent>
      </Card>

      {/* Bloco E - Resumo Rápido */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Resumo de Parcelas SAC</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: 'Mês 1', val: v.parcelaMes1 },
              { label: 'Mês 12', val: v.parcelaMes12 },
              { label: 'Mês 60', val: v.parcelaMes60 },
              { label: 'Mês 120', val: v.parcelaMes120 },
              ...(params.prazoMeses >= 240 ? [{ label: 'Mês 240', val: v.parcelaMes240 }] : []),
              { label: 'Última', val: v.parcelaUltima },
            ].map(item => (
              <div key={item.label} className="bg-muted/50 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
                <p className="text-xs font-bold">{formatCurrency(item.val)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bloco B - Custos de Aquisição */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Custos de Aquisição</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PercentInput label="ITBI" value={params.itbiPercent} onChange={v => onChange({ itbiPercent: v })} tooltip="Imposto sobre Transmissão de Bens Imóveis" />
            <PercentInput label="Escritura + Registro" value={params.escrituraPercent} onChange={v => onChange({ escrituraPercent: v })} />
          </div>
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <StatRow label="ITBI" value={formatCurrency(v.itbiRS)} />
            <StatRow label="Escritura + Registro" value={formatCurrency(v.escrituraRS)} />
            <StatRow label="Total desembolso inicial" value={formatCurrency(v.totalDesembolso)} className="font-bold" />
          </div>
        </CardContent>
      </Card>

      {/* Bloco C - Renda */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Renda e Capacidade</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <CurrencyInput label="Renda bruta familiar" value={params.rendaBruta} onChange={v => onChange({ rendaBruta: v })} />
            <CurrencyInput label="Dívidas mensais (carro, etc.)" value={params.dividasMensais} onChange={v => onChange({ dividasMensais: v })} />
            <PercentInput label="Limite comprometimento" value={params.limiteComprometimento} onChange={v => onChange({ limiteComprometimento: v })} />
          </div>
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <StatRow label="Máx. disponível p/ parcela" value={formatCurrency(v.maxDisponivel)} />
            <StatRow
              label="% comprometida da renda"
              value={`${v.percentComprometida.toFixed(1)}%`}
              className={v.percentComprometida > params.limiteComprometimento ? 'text-destructive' : 'text-green-500'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Bloco D - Capital */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Capital Disponível</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CurrencyInput label="Capital disponível" value={params.capitalDisponivel} onChange={v => onChange({ capitalDisponivel: v })} />
            <div className="space-y-1.5">
              <Label className="text-xs">Reserva de emergência ({params.reservaMeses} meses)</Label>
              <Slider value={[params.reservaMeses]} onValueChange={([val]) => onChange({ reservaMeses: val })} min={3} max={12} step={1} className="mt-2" />
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <StatRow label="Reserva necessária" value={formatCurrency(v.reservaNecessaria)} />
            <StatRow
              label="Capital restante após tudo"
              value={formatCurrency(v.capitalRestante)}
              className={v.capitalRestante >= 0 ? 'text-green-500' : 'text-destructive'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Bloco F - Totais */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Totais do Financiamento</CardTitle></CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <StatRow label="Total amortizado" value={formatCurrency(v.totalAmortizado)} />
            <StatRow label="Total pago em TR" value={formatCurrency(v.totalTR)} />
            <StatRow label="Total pago em juros" value={formatCurrency(v.totalJuros)} className="text-destructive" />
            <div className="border-t pt-1 mt-1">
              <StatRow label="TOTAL GERAL PAGO" value={formatCurrency(v.totalGeralPago)} className="font-bold text-base" />
            </div>
            <StatRow label="Custo efetivo total (CET)" value={formatCurrency(v.custoEfetivoTotal)} className="text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      {/* Bloco G - Checklist */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Checklist de Viabilidade</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <CheckItem ok={v.checkEntrada} label={`Entrada ≥ 20% do imóvel (${v.entradaPercent.toFixed(1)}%)`} />
          <CheckItem ok={v.checkParcela} label={`Parcela + dívidas ≤ ${params.limiteComprometimento}% da renda (${v.percentComprometida.toFixed(1)}%)`} />
          <CheckItem ok={v.checkCapital} label={`Capital cobre desembolso + reserva (sobra ${formatCurrency(v.capitalRestante)})`} />
          <CheckItem ok={v.checkPrazo} label={`Prazo ≤ 420 meses (${params.prazoMeses} meses)`} />
        </CardContent>
      </Card>

      {/* Bloco H - Sugestões */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">O que Ajustar se Não Viável</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-2"><ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-primary" /> Aumentar a entrada → reduz saldo financiado e parcela</li>
            <li className="flex items-start gap-2"><ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-primary" /> Ampliar o prazo → parcela menor (mais juros no total)</li>
            <li className="flex items-start gap-2"><ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-primary" /> Buscar imóvel de menor valor</li>
            <li className="flex items-start gap-2"><ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-primary" /> Aumentar renda familiar (cônjuge, freelance, etc.)</li>
            <li className="flex items-start gap-2"><ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-primary" /> Quitar outras dívidas antes → libera margem de renda</li>
            <li className="flex items-start gap-2"><ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-primary" /> Acumular mais capital antes de comprar</li>
          </ul>
        </CardContent>
      </Card>

      {/* Bloco I - Custo de Transição */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Custo de Transição</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CurrencyInput label="Aluguel atual" value={params.aluguelAtual} onChange={v => onChange({ aluguelAtual: v })} />
            <CurrencyInput label="Condomínio atual" value={params.condominioAtual} onChange={v => onChange({ condominioAtual: v })} />
          </div>
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <StatRow label="Total habitação hoje" value={formatCurrency(v.totalHabitacaoHoje)} />
            <StatRow label="Parcela mês 1" value={formatCurrency(v.parcelaMes1)} />
            <StatRow
              label="Delta mensal"
              value={`${v.deltaMensal >= 0 ? '+' : ''}${formatCurrency(v.deltaMensal)}`}
              className={v.deltaMensal > 0 ? 'text-destructive' : 'text-green-500'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Bloco J - Cenário Carro */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Car className="h-4 w-4" />
            Cenário: Quitação do Carro
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CurrencyInput label="Saldo devedor do carro hoje" value={params.saldoDevedorCarro} onChange={v => onChange({ saldoDevedorCarro: v })} />
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <StatRow label="Capital líquido após quitar carro" value={formatCurrency(v.capitalLiquidoSemCarro)} />
            <StatRow label="Nova entrada estimada" value={formatCurrency(v.novaEntradaEst)} />
            <StatRow label="Novo valor financiado" value={formatCurrency(v.novoValorFinanciado)} />
            <div className="border-t pt-1 mt-1">
              <StatRow label="% renda SEM quitação" value={`${v.percentSemQuitacao.toFixed(1)}%`} className="text-destructive" />
              <StatRow label="% renda COM quitação" value={`${v.percentComQuitacao.toFixed(1)}%`} className="text-green-500" />
              <StatRow label="Melhora" value={`${v.melhoraComprometimento.toFixed(1)} p.p.`} className="font-bold text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Analysis */}
      <AiFinancingAnalysis context={{
        valorImovel: params.valorImovel,
        entrada: params.entrada,
        percEntrada: v.entradaPercent,
        financiado: v.valorFinanciado,
        taxaAnual: params.taxaAnualNominal,
        prazoAnos: Math.floor(params.prazoMeses / 12),
        sistema: 'sac',
        parcelaInicial: v.parcelaMes1,
        totalJuros: v.totalJuros,
        receitaMensal: params.rendaBruta,
        despesasMensais: params.dividasMensais,
        saldoLivre: params.rendaBruta - params.dividasMensais,
        saldoComFinanciamento: params.rendaBruta - params.dividasMensais - v.parcelaMes1,
        percRenda: v.percentComprometida,
        semaforo: v.diagnostico === 'viavel' ? 'verde' : v.diagnostico === 'parcial' ? 'amarelo' : 'vermelho',
      }} />

      {/* Diagnóstico Final */}
      <Card className={diagColor}>
        <CardContent className="p-4">
          <div className="text-lg font-bold mb-1">
            {diagEmoji} {diagLabel}
          </div>
          <p className="text-sm text-muted-foreground">{v.diagnosticoTexto}</p>
        </CardContent>
      </Card>
    </div>
  );
}
