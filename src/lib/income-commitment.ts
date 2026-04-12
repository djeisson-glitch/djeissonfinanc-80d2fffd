/**
 * Income Commitment Engine
 *
 * Calculates how the user's income is committed across future months,
 * breaking down fixed expenses, installments, and estimated variable costs.
 */

import type { TransactionRecord } from './projection-engine';
import { detectFixedExpenses, detectActiveInstallments } from './projection-engine';

export interface MonthCommitment {
  mes: string; // YYYY-MM
  receita: number;
  fixos: number;
  parcelas: number;
  estimadoVariavel: number;
  totalComprometido: number;
  livre: number;
  percentualComprometido: number; // 0-100
  parcelasTerminando: string[];
}

export interface CommitmentSummary {
  mediaComprometimento: number;
  melhorMes: { mes: string; livre: number };
  piorMes: { mes: string; livre: number };
  parcelasTerminamEm: { descricao: string; mes: string; alivio: number }[];
  tendencia: 'melhorando' | 'piorando' | 'estavel';
}

export interface IncomeCommitmentReport {
  meses: MonthCommitment[];
  resumo: CommitmentSummary;
}

export interface CalculateIncomeCommitmentParams {
  transactions: TransactionRecord[];
  receitaBase: number;
  monthsAhead?: number;
}

/**
 * Estimate variable expenses as the average of the last 3 months of
 * non-fixed, non-installment expenses.
 */
function estimateVariableExpenses(
  transactions: TransactionRecord[],
  fixedDescriptions: Set<string>,
): number {
  const despesas = transactions.filter(
    (t) =>
      t.tipo === 'despesa' &&
      !t.ignorar_dashboard &&
      !t.parcela_total &&
      !fixedDescriptions.has(
        t.descricao
          .replace(/\s*\(auto-projetada\)/, '')
          .trim()
          .substring(0, 30)
          .toUpperCase(),
      ),
  );

  // Group by month
  const byMonth: Record<string, number> = {};
  for (const t of despesas) {
    const month = t.data.substring(0, 7);
    if (!byMonth[month]) byMonth[month] = 0;
    byMonth[month] += t.valor;
  }

  // Take the last 3 months
  const sortedMonths = Object.keys(byMonth).sort().reverse().slice(0, 3);
  if (sortedMonths.length === 0) return 0;

  const total = sortedMonths.reduce((sum, m) => sum + byMonth[m], 0);
  return total / sortedMonths.length;
}

/**
 * Add N months to a YYYY-MM string and return a new YYYY-MM string.
 */
function addMonths(yearMonth: string, count: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const date = new Date(y, m - 1 + count, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Calculate how the user's income is committed across future months.
 */
export function calculateIncomeCommitment(
  params: CalculateIncomeCommitmentParams,
): IncomeCommitmentReport {
  const { transactions, receitaBase, monthsAhead = 6 } = params;

  // 1. Detect fixed expenses and installments
  const fixedExpenses = detectFixedExpenses(transactions);
  const installments = detectActiveInstallments(transactions);

  // 2. Build the set of fixed descriptions for variable expense filtering
  const fixedDescSet = new Set(
    fixedExpenses.map((f) => f.descricao.substring(0, 30).toUpperCase()),
  );

  // 3. Estimate variable expenses from last 3 months
  const estimadoVariavel = estimateVariableExpenses(transactions, fixedDescSet);

  // 4. Total fixed cost per month
  const totalFixos = fixedExpenses.reduce((sum, f) => sum + f.valor, 0);

  // 5. Determine current month as the starting point
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 6. Build month-by-month commitment data
  const meses: MonthCommitment[] = [];

  for (let i = 0; i < monthsAhead; i++) {
    const mes = addMonths(currentMonth, i + 1);

    // Installments active this month
    let parcelas = 0;
    for (const inst of installments) {
      if (mes >= inst.startMonth && mes <= inst.endMonth) {
        parcelas += inst.valor;
      }
    }

    // Installments ending this month
    const parcelasTerminando = installments
      .filter((inst) => inst.endMonth === mes)
      .map((inst) => inst.descricao);

    const totalComprometido = totalFixos + parcelas + estimadoVariavel;
    const livre = receitaBase - totalComprometido;
    const percentualComprometido = receitaBase > 0
      ? Math.min(100, Math.round((totalComprometido / receitaBase) * 10000) / 100)
      : 0;

    meses.push({
      mes,
      receita: receitaBase,
      fixos: totalFixos,
      parcelas,
      estimadoVariavel,
      totalComprometido,
      livre,
      percentualComprometido,
      parcelasTerminando,
    });
  }

  // 7. Build summary
  const mediaComprometimento =
    meses.length > 0
      ? Math.round(
          (meses.reduce((sum, m) => sum + m.percentualComprometido, 0) / meses.length) * 100,
        ) / 100
      : 0;

  const melhorMes = meses.reduce(
    (best, m) => (m.livre > best.livre ? { mes: m.mes, livre: m.livre } : best),
    { mes: meses[0]?.mes ?? '', livre: -Infinity },
  );

  const piorMes = meses.reduce(
    (worst, m) => (m.livre < worst.livre ? { mes: m.mes, livre: m.livre } : worst),
    { mes: meses[0]?.mes ?? '', livre: Infinity },
  );

  // Installments ending with their cash relief
  const parcelasTerminamEm = installments
    .filter((inst) => {
      // Only include installments that end within the projection window
      return meses.some((m) => m.mes === inst.endMonth);
    })
    .map((inst) => ({
      descricao: inst.descricao,
      mes: inst.endMonth,
      alivio: inst.valor,
    }));

  // Trend: compare average commitment % of first half vs second half
  const half = Math.floor(meses.length / 2);
  const firstHalf = meses.slice(0, half);
  const secondHalf = meses.slice(half);

  const avgFirst =
    firstHalf.length > 0
      ? firstHalf.reduce((s, m) => s + m.percentualComprometido, 0) / firstHalf.length
      : 0;
  const avgSecond =
    secondHalf.length > 0
      ? secondHalf.reduce((s, m) => s + m.percentualComprometido, 0) / secondHalf.length
      : 0;

  const diff = avgSecond - avgFirst;
  let tendencia: 'melhorando' | 'piorando' | 'estavel';
  if (diff < -1) {
    tendencia = 'melhorando'; // commitment % is dropping = improving
  } else if (diff > 1) {
    tendencia = 'piorando';
  } else {
    tendencia = 'estavel';
  }

  return {
    meses,
    resumo: {
      mediaComprometimento,
      melhorMes,
      piorMes,
      parcelasTerminamEm,
      tendencia,
    },
  };
}
