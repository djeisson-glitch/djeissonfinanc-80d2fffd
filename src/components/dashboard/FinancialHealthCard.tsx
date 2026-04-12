import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Heart } from 'lucide-react';
import {
  calculateFinancialHealth,
  getScoreColor,
  type FinancialHealthReport,
} from '@/lib/financial-health';
import type { TransactionRecord } from '@/lib/projection-engine';

interface FinancialHealthCardProps {
  transactions: TransactionRecord[];
  receitaBase: number;
  reservaMinima: number;
  saldoAtual: number;
}

const NIVEL_LABELS: Record<FinancialHealthReport['nivel'], string> = {
  critico: 'Cr\u00edtico',
  atencao: 'Aten\u00e7\u00e3o',
  bom: 'Bom',
  excelente: 'Excelente',
};

function ScoreGauge({ score }: { score: number }) {
  const radius = 54;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  // Arc covers 270 degrees (75% of circle)
  const arcLength = circumference * 0.75;
  const filledLength = (score / 100) * arcLength;

  // Rotate so the arc starts from bottom-left
  const rotation = 135;

  let strokeColor: string;
  if (score < 30) strokeColor = '#ef4444';
  else if (score < 55) strokeColor = '#ca8a04';
  else if (score < 80) strokeColor = '#16a34a';
  else strokeColor = '#059669';

  return (
    <div className="relative flex items-center justify-center w-36 h-36">
      <svg className="w-full h-full" viewBox="0 0 128 128">
        {/* Background arc */}
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          className="text-muted-foreground/20"
          transform={`rotate(${rotation} 64 64)`}
        />
        {/* Filled arc */}
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeDasharray={`${filledLength} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(${rotation} 64 64)`}
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute text-3xl font-bold">{score}</span>
    </div>
  );
}

export function FinancialHealthCard({
  transactions,
  receitaBase,
  reservaMinima,
  saldoAtual,
}: FinancialHealthCardProps) {
  const report = useMemo(
    () =>
      transactions.length > 0
        ? calculateFinancialHealth({
            transactions,
            receitaBase,
            reservaMinima,
            saldoAtual,
          })
        : null,
    [transactions, receitaBase, reservaMinima, saldoAtual],
  );

  if (!report) {
    return (
      <Card className="md:col-span-2">
        <CardContent className="p-4 flex items-center gap-2">
          <Heart className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Adicione transa\u00e7\u00f5es para visualizar sua sa\u00fade financeira.
          </span>
        </CardContent>
      </Card>
    );
  }

  const nivelColor = getScoreColor(report.score);

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Heart className="h-5 w-5 text-primary" />
          Sa\u00fade Financeira
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Score gauge + nivel */}
        <div className="flex items-center gap-6">
          <ScoreGauge score={report.score} />
          <div className="space-y-1">
            <span
              className={`inline-block rounded-md border px-3 py-1 text-sm font-semibold ${nivelColor}`}
            >
              {NIVEL_LABELS[report.nivel]}
            </span>
            <p className="text-xs text-muted-foreground">Pontua\u00e7\u00e3o geral de 0 a 100</p>
          </div>
        </div>

        {/* Component bars */}
        <div className="space-y-3">
          {report.componentes.map((comp) => (
            <div key={comp.nome} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate">{comp.nome}</span>
                <span className="font-medium tabular-nums">{comp.score}</span>
              </div>
              <Progress value={comp.score} className="h-2" />
              <p className="text-xs text-muted-foreground">{comp.descricao}</p>
            </div>
          ))}
        </div>

        {/* Recommendations */}
        {report.recomendacoes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Recomenda\u00e7\u00f5es</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              {report.recomendacoes.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
