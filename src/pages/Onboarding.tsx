import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CONTAS_PADRAO } from '@/types/database.types';
import { formatCurrency } from '@/lib/format';
import { DollarSign, ArrowRight, Check } from 'lucide-react';

export default function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [receitaMensal, setReceitaMensal] = useState(13000);
  const [reservaMinima, setReservaMinima] = useState(2000);
  const [contas, setContas] = useState(CONTAS_PADRAO.map(c => ({ ...c })));
  const [loading, setLoading] = useState(false);

  const updateContaSaldo = (index: number, saldo: number) => {
    setContas(prev => prev.map((c, i) => i === index ? { ...c, saldo_inicial: saldo } : c));
  };

  const handleFinish = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Save config
      await supabase.from('configuracoes').upsert({
        user_id: user.id,
        receita_mensal_fixa: receitaMensal,
        reserva_minima: reservaMinima,
      });

      // Check if accounts already exist (prevent duplicates from re-running onboarding)
      const { data: existingContas } = await supabase
        .from('contas')
        .select('nome')
        .eq('user_id', user.id);

      const existingNames = new Set(existingContas?.map(c => c.nome) || []);
      const contasToInsert = contas
        .filter(c => !existingNames.has(c.nome))
        .map(c => ({
          user_id: user.id,
          nome: c.nome,
          tipo: c.tipo,
          saldo_inicial: c.saldo_inicial,
        }));

      if (contasToInsert.length > 0) {
        await supabase.from('contas').insert(contasToInsert);
      }

      toast({ title: 'Configuração concluída!' });
      navigate('/');
    } catch (err) {
      toast({ title: 'Erro', description: 'Falha ao salvar configurações', variant: 'destructive' });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <DollarSign className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Bem-vindo ao FinançasPro</CardTitle>
          <CardDescription>
            {step === 0 && 'Vamos configurar sua receita mensal'}
            {step === 1 && 'Defina o saldo inicial de cada conta'}
          </CardDescription>
          <div className="flex justify-center gap-2 pt-2">
            {[0, 1].map(s => (
              <div key={s} className={`h-2 w-8 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {step === 0 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Receita Mensal Fixa</Label>
                <Input
                  type="number"
                  value={receitaMensal}
                  onChange={e => setReceitaMensal(Number(e.target.value))}
                />
                <p className="text-sm text-muted-foreground">Sua renda mensal total</p>
              </div>
              <div className="space-y-2">
                <Label>Reserva Mínima Desejada</Label>
                <Input
                  type="number"
                  value={reservaMinima}
                  onChange={e => setReservaMinima(Number(e.target.value))}
                />
                <p className="text-sm text-muted-foreground">Valor mínimo que deseja manter de saldo</p>
              </div>
              <Button className="w-full" onClick={() => setStep(1)}>
                Próximo <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              {contas.map((conta, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex-1">
                    <p className="font-medium">{conta.nome}</p>
                    <p className="text-sm text-muted-foreground capitalize">{conta.tipo}</p>
                  </div>
                  <div className="w-32">
                    <Input
                      type="number"
                      value={conta.saldo_inicial}
                      onChange={e => updateContaSaldo(i, Number(e.target.value))}
                      placeholder="R$ 0"
                    />
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(0)} className="flex-1">
                  Voltar
                </Button>
                <Button onClick={handleFinish} disabled={loading} className="flex-1">
                  {loading ? 'Salvando...' : 'Concluir'} <Check className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
