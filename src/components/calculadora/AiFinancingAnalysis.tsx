import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  context: {
    valorImovel: number;
    entrada: number;
    percEntrada: number;
    financiado: number;
    taxaAnual: number;
    prazoAnos: number;
    sistema: string;
    parcelaInicial: number;
    totalJuros: number;
    receitaMensal: number;
    despesasMensais: number;
    saldoLivre: number;
    saldoComFinanciamento: number;
    percRenda: number;
    semaforo: string;
  };
}

export function AiFinancingAnalysis({ context }: Props) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAnalysis = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-financial-advisor', {
        body: { type: 'financing_viability', context },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      setAnalysis(data.analysis);
    } catch (e: any) {
      console.error('AI error:', e);
      toast.error('Erro ao consultar o assistente financeiro');
    } finally {
      setLoading(false);
    }
  };

  if (!analysis && !loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Diagnóstico com IA</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAnalysis}>
            <Sparkles className="h-4 w-4 mr-1" />
            Analisar viabilidade
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Diagnóstico da IA
          <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={fetchAnalysis} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <p className="text-xs text-muted-foreground mt-2">Consultando o assistente financeiro...</p>
          </div>
        ) : (
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{analysis}</div>
        )}
      </CardContent>
    </Card>
  );
}
