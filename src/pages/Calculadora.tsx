import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, CheckCircle, AlertTriangle } from 'lucide-react';

const PARCELAS_OPTIONS = [
  { value: '1', label: 'À vista' },
  { value: '2', label: '2x' },
  { value: '3', label: '3x' },
  { value: '4', label: '4x' },
  { value: '5', label: '5x' },
  { value: '6', label: '6x' },
  { value: '7', label: '7x' },
  { value: '8', label: '8x' },
  { value: '9', label: '9x' },
  { value: '10', label: '10x' },
  { value: '11', label: '11x' },
  { value: '12', label: '12x' },
];

export default function CalculadoraPage() {
  const { user } = useAuth();
  const [valor, setValor] = useState('');
  const [parcelas, setParcelas] = useState('1');
  const [contaId, setContaId] = useState('');

  const { data: contas } = useQuery({
    queryKey: ['calc-contas', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('contas').select('*').eq('user_id', user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: config } = useQuery({
    queryKey: ['calc-config', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('configuracoes').select('*').eq('user_id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  // Get upcoming months' committed spending
  const { data: despesasFuturas } = useQuery({
    queryKey: ['calc-despesas', user?.id, contaId],
    queryFn: async () => {
      const now = new Date();
      const months: Record<string, number> = {};
      for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months[key] = 0;
      }

      let query = supabase
        .from('transacoes')
        .select('data, valor, tipo, conta_id')
        .eq('user_id', user!.id)
        .eq('tipo', 'despesa')
        .gte('data', Object.keys(months).sort()[0] + '-01');

      if (contaId) {
        query = query.eq('conta_id', contaId);
      }

      const { data } = await query;
      (data || []).forEach(t => {
        const key = t.data.substring(0, 7);
        if (months[key] !== undefined) {
          months[key] += Number(t.valor);
        }
      });
      return months;
    },
    enabled: !!user,
  });

  const valorNum = parseFloat(valor.replace(',', '.')) || 0;
  const numParcelas = parseInt(parcelas);
  const valorParcela = numParcelas > 0 ? valorNum / numParcelas : valorNum;
  const receitaMensal = config?.receita_mensal_fixa || 0;
  const limitePercent = 30; // alert threshold

  const analysis = useMemo(() => {
    if (!valorNum || !receitaMensal || !despesasFuturas) return null;

    const meses = Object.keys(despesasFuturas).sort().slice(0, numParcelas);
    const detalhes = meses.map(mes => {
      const gastoExistente = despesasFuturas[mes] || 0;
      const gastoComCompra = gastoExistente + valorParcela;
      const percentRenda = (gastoComCompra / receitaMensal) * 100;
      const livre = receitaMensal - gastoComCompra;
      return { mes, gastoExistente, gastoComCompra, percentRenda, livre };
    });

    const mesesApertados = detalhes.filter(d => d.percentRenda > limitePercent);
    const mesesEstourados = detalhes.filter(d => d.livre < 0);
    const cabe = mesesEstourados.length === 0 && mesesApertados.length <= numParcelas * 0.3;

    return { detalhes, mesesApertados, mesesEstourados, cabe };
  }, [valorNum, numParcelas, valorParcela, receitaMensal, despesasFuturas]);

  const contaNome = contas?.find(c => c.id === contaId)?.nome || 'Todas';

  const formatMonth = (ym: string) => {
    const [y, m] = ym.split('-');
    const labels: Record<string, string> = {
      '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
      '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
      '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
    };
    return `${labels[m] || m}/${y}`;
  };

  return (
    <div className="space-y-4 animate-fade-in max-w-2xl mx-auto">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <ShoppingCart className="h-5 w-5" />
        Posso comprar?
      </h1>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor da compra</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                <Input
                  value={valor}
                  onChange={e => setValor(e.target.value)}
                  placeholder="0,00"
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Parcelas</Label>
              <Select value={parcelas} onValueChange={setParcelas}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARCELAS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Conta</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todas as contas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as contas</SelectItem>
                  {contas?.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {valorNum > 0 && numParcelas > 1 && (
            <div className="text-sm text-muted-foreground">
              Valor por parcela: <strong className="text-foreground">{formatCurrency(valorParcela)}</strong> × {numParcelas}x
            </div>
          )}
        </CardContent>
      </Card>

      {analysis && (
        <>
          {/* Result */}
          <Card className={analysis.cabe ? 'border-primary/40' : 'border-destructive/40'}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-lg font-bold">
                {analysis.cabe ? (
                  <>
                    <CheckCircle className="h-6 w-6 text-primary" />
                    <span className="text-primary">Cabe no orçamento!</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                    <span className="text-destructive">
                      Vai apertar em {analysis.mesesApertados.length} mês(es)
                    </span>
                  </>
                )}
              </div>
              {!analysis.cabe && analysis.mesesEstourados.length > 0 && (
                <p className="text-xs text-destructive mt-1">
                  ⚠️ {analysis.mesesEstourados.length} mês(es) ficariam no negativo
                </p>
              )}
            </CardContent>
          </Card>

          {/* Monthly breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Impacto mês a mês</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              {analysis.detalhes.map(d => {
                const percent = Math.min(d.percentRenda, 100);
                const isOver = d.livre < 0;
                const isTight = d.percentRenda > limitePercent;
                return (
                  <div key={d.mes} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium w-[70px]">{formatMonth(d.mes)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {formatCurrency(d.gastoExistente)} + {formatCurrency(valorParcela)}
                        </span>
                        <span className={`font-medium ${isOver ? 'text-destructive' : isTight ? 'text-amber-500' : 'text-foreground'}`}>
                          = {formatCurrency(d.gastoComCompra)}
                        </span>
                        {isOver && <Badge variant="destructive" className="text-[9px]">Estoura</Badge>}
                        {!isOver && isTight && <Badge variant="secondary" className="text-[9px]">Aperta</Badge>}
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isOver ? 'bg-destructive' : isTight ? 'bg-amber-500' : 'bg-primary'}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{d.percentRenda.toFixed(0)}% da renda</span>
                      <span>Sobra: {formatCurrency(d.livre)}</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
