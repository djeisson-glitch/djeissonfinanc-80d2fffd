import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Lightbulb, Info, TrendingUp } from 'lucide-react';
import { generateSmartInsights, type SmartInsight } from '@/lib/spending-patterns';
import type { TransactionRecord } from '@/lib/projection-engine';

interface SmartInsightsCardProps {
  transactions: TransactionRecord[];
  receitaBase: number;
}

const INITIAL_LIMIT = 6;

const iconMap: Record<SmartInsight['tipo'], { icon: typeof Info; color: string }> = {
  alerta: { icon: AlertTriangle, color: 'text-yellow-500' },
  oportunidade: { icon: Lightbulb, color: 'text-blue-500' },
  info: { icon: Info, color: 'text-gray-500' },
  positivo: { icon: TrendingUp, color: 'text-green-500' },
};

export function SmartInsightsCard({ transactions, receitaBase }: SmartInsightsCardProps) {
  const [expanded, setExpanded] = useState(false);

  const insights = useMemo(() => {
    if (!transactions.length) return [];
    return generateSmartInsights(transactions, receitaBase).sort(
      (a, b) => b.prioridade - a.prioridade,
    );
  }, [transactions, receitaBase]);

  const visibleInsights = expanded ? insights : insights.slice(0, INITIAL_LIMIT);

  if (!transactions.length || !insights.length) {
    return (
      <Card className="md:col-span-2">
        <CardContent className="p-4 flex items-center gap-2">
          <Info className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Nenhum insight disponível. Adicione transações para gerar análises automáticas.
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          Insights Inteligentes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleInsights.map((insight, idx) => {
          const { icon: Icon, color } = iconMap[insight.tipo];
          return (
            <div key={idx} className="flex items-start gap-3">
              <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${color}`} />
              <div>
                <p className="text-sm font-semibold">{insight.titulo}</p>
                <p className="text-sm text-muted-foreground">{insight.descricao}</p>
              </div>
            </div>
          );
        })}

        {insights.length > INITIAL_LIMIT && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Mostrar menos' : `Mostrar mais (${insights.length - INITIAL_LIMIT})`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
