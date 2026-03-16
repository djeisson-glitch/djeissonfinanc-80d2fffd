import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, getMonthName } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

export default function CalculadoraPage() {
  const { user } = useAuth();
  const [valor, setValor] = useState(0);
  const [parcelas, setParcelas] = useState(1);
  const [resultado, setResultado] = useState<null | { status: 'ok' | 'aperta' | 'nao'; mensagem: string; detalhes: string }>(null);

  const { data: config } = useQuery({
    queryKey: ['config', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('configuracoes').select('*').eq('user_id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: parcelasFuturas } = useQuery({
    queryKey: ['parcelas-futuras-calc', user?.id],
    queryFn: async () => {
      const today = new Date();
      const future = new Date(today);
      future.setMonth(future.getMonth() + 12);
      const { data } = await supabase
        .from('transacoes')
        .select('data, valor')
        .eq('user_id', user!.id)
        .eq('tipo', 'despesa')
        .gte('data', today.toISOString().split('T')[0])
        .lte('data', future.toISOString().split('T')[0]);
      return data || [];
    },
    enabled: !!user,
  });

  const calcular = () => {
    if (!config || valor <= 0) return;

    const receita = config.receita_mensal_fixa;
    const reserva = config.reserva_minima;
    const valorParcela = valor / parcelas;

    // Calculate projected balance for each of the next N months
    const hoje = new Date();
    let pioresaldo = Infinity;
    let piorMes = '';

    for (let i = 0; i < parcelas; i++) {
      const mes = new Date(hoje);
      mes.setMonth(mes.getMonth() + i + 1);
      const mesKey = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}`;

      // Sum existing commitments for this month
      const compromissosMes = parcelasFuturas
        ?.filter(p => p.data.startsWith(mesKey))
        .reduce((s, p) => s + Number(p.valor), 0) || 0;

      const saldoMes = receita - compromissosMes - valorParcela;
      if (saldoMes < pioresaldo) {
        pioresaldo = saldoMes;
        piorMes = `${getMonthName(mes.getMonth())}/${mes.getFullYear()}`;
      }
    }

    if (pioresaldo >= reserva * 1.5) {
      setResultado({
        status: 'ok',
        mensagem: 'Pode comprar!',
        detalhes: `Sobrará ${formatCurrency(pioresaldo)} mesmo com essa compra.`,
      });
    } else if (pioresaldo >= reserva) {
      setResultado({
        status: 'aperta',
        mensagem: 'Aperta, mas dá.',
        detalhes: `Saldo mínimo será ${formatCurrency(pioresaldo)} em ${piorMes}.`,
      });
    } else {
      const falta = reserva - pioresaldo;
      setResultado({
        status: 'nao',
        mensagem: 'Não cabe no orçamento.',
        detalhes: `Faltarão ${formatCurrency(falta)} em ${piorMes}.`,
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-lg mx-auto">
      <h1 className="text-2xl font-bold">Calculadora de Compra</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Posso comprar?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Valor da compra (R$)</Label>
            <Input type="number" value={valor || ''} onChange={e => setValor(Number(e.target.value))} placeholder="0,00" />
          </div>
          <div className="space-y-2">
            <Label>Parcelas</Label>
            <Select value={String(parcelas)} onValueChange={v => setParcelas(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                  <SelectItem key={n} value={String(n)}>{n}x de {valor > 0 ? formatCurrency(valor / n) : 'R$ 0'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={calcular} className="w-full" disabled={valor <= 0}>
            Calcular
          </Button>
        </CardContent>
      </Card>

      {resultado && (
        <Card className={`border-2 ${
          resultado.status === 'ok' ? 'border-primary' :
          resultado.status === 'aperta' ? 'border-accent' : 'border-destructive'
        }`}>
          <CardContent className="p-6 text-center space-y-3">
            {resultado.status === 'ok' && <CheckCircle className="h-12 w-12 text-primary mx-auto" />}
            {resultado.status === 'aperta' && <AlertTriangle className="h-12 w-12 text-accent mx-auto" />}
            {resultado.status === 'nao' && <XCircle className="h-12 w-12 text-destructive mx-auto" />}
            <p className="text-xl font-bold">{resultado.mensagem}</p>
            <p className="text-sm text-muted-foreground">{resultado.detalhes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
