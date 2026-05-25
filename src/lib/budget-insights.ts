/**
 * Inteligência do planejamento: ritmo do mês, projeção de fechamento, alertas de
 * estouro de meta e a regra 50/30/20 (essenciais / não-essenciais / poupança).
 * Funções puras — orçamento único do casal (sem separar por pessoa).
 */

export function diasNoMes(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

export interface MonthPace {
  diaAtual: number;
  diasMes: number;
  isMesCorrente: boolean;
  fator: number; // diasMes / diaAtual (1 quando o mês já fechou ou é passado)
}

/** Calcula o ritmo do mês selecionado em relação a hoje. */
export function monthPace(year: number, month0: number, hoje: Date): MonthPace {
  const diasMes = diasNoMes(year, month0);
  const isMesCorrente = hoje.getFullYear() === year && hoje.getMonth() === month0;
  const diaAtual = isMesCorrente ? hoje.getDate() : diasMes;
  const fator = isMesCorrente && diaAtual > 0 ? diasMes / diaAtual : 1;
  return { diaAtual, diasMes, isMesCorrente, fator };
}

/** Projeta o gasto até o fim do mês de forma linear pelo ritmo atual. */
export function projetarFimMes(gastoAteHoje: number, pace: MonthPace): number {
  return Math.round(gastoAteHoje * pace.fator * 100) / 100;
}

export interface CategoriaBudget {
  categoria: string;
  gastoMes: number;
  media: number;
  meta: number | null;
}

export interface BudgetAlert {
  categoria: string;
  tipo: 'estourou' | 'vai_estourar' | 'acima_media';
  gastoMes: number;
  projecao: number;
  meta: number | null;
  media: number;
  severidade: 'alto' | 'medio';
}

/**
 * Gera alertas por categoria:
 * - estourou: já passou a meta;
 * - vai_estourar: no ritmo atual deve fechar acima da meta (só mês corrente);
 * - acima_media: sem meta, mas gastando bem acima da média histórica.
 */
export function buildBudgetAlerts(cats: CategoriaBudget[], pace: MonthPace): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  for (const c of cats) {
    const projecao = projetarFimMes(c.gastoMes, pace);
    if (c.meta != null && c.meta > 0) {
      if (c.gastoMes > c.meta) {
        alerts.push({ categoria: c.categoria, tipo: 'estourou', gastoMes: c.gastoMes, projecao, meta: c.meta, media: c.media, severidade: 'alto' });
      } else if (pace.isMesCorrente && projecao > c.meta * 1.05) {
        alerts.push({ categoria: c.categoria, tipo: 'vai_estourar', gastoMes: c.gastoMes, projecao, meta: c.meta, media: c.media, severidade: 'medio' });
      }
    } else if (c.media > 0 && c.gastoMes > c.media * 1.3) {
      alerts.push({ categoria: c.categoria, tipo: 'acima_media', gastoMes: c.gastoMes, projecao, meta: null, media: c.media, severidade: 'medio' });
    }
  }
  // Alto primeiro; dentro do mesmo nível, maior gasto primeiro.
  const peso = { alto: 0, medio: 1 } as const;
  return alerts.sort((a, b) => peso[a.severidade] - peso[b.severidade] || b.gastoMes - a.gastoMes);
}

export interface Resultado503020 {
  receita: number;
  essenciais: number;
  naoEssenciais: number;
  poupanca: number; // o que sobra (receita - despesas)
  pctEssenciais: number;
  pctNaoEssenciais: number;
  pctPoupanca: number;
  // alvos da regra
  alvoEssenciais: number; // 50%
  alvoNaoEssenciais: number; // 30%
  alvoPoupanca: number; // 20%
}

/** Regra 50/30/20 sobre a receita. poupança = receita - despesas (pode ser negativa). */
export function compute503020(receita: number, essenciais: number, naoEssenciais: number): Resultado503020 {
  const poupanca = receita - essenciais - naoEssenciais;
  const pct = (v: number) => (receita > 0 ? Math.round((v / receita) * 1000) / 10 : 0);
  return {
    receita,
    essenciais,
    naoEssenciais,
    poupanca,
    pctEssenciais: pct(essenciais),
    pctNaoEssenciais: pct(naoEssenciais),
    pctPoupanca: pct(poupanca),
    alvoEssenciais: Math.round(receita * 0.5 * 100) / 100,
    alvoNaoEssenciais: Math.round(receita * 0.3 * 100) / 100,
    alvoPoupanca: Math.round(receita * 0.2 * 100) / 100,
  };
}

/** Meta sugerida pela média histórica, arredondada para a dezena. */
export function suggestMeta(media: number): number {
  if (media <= 0) return 0;
  return Math.max(10, Math.round(media / 10) * 10);
}
