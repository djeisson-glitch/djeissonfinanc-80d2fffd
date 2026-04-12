import { generateHash } from '@/lib/csv-parser';

/**
 * Adds months to a date without overflow (e.g. Jan 31 + 1 month = Feb 28, not Mar 3).
 */
function addMonthsSafe(baseIso: string, months: number): string {
  const base = new Date(baseIso + 'T00:00:00');
  const targetMonth = base.getMonth() + months;
  const targetDate = new Date(base.getFullYear(), targetMonth, 1);
  // Clamp day to last day of target month
  const lastDay = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
  const day = Math.min(base.getDate(), lastDay);
  targetDate.setDate(day);
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface ProjectableTransaction {
  data: string;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  parcela_atual: number | null;
  parcela_total: number | null;
  pessoa: string;
  hash_transacao: string;
  categoria: string;
  essencial: boolean;
  conta_id: string;
  user_id: string;
  data_original: string | null;
  mes_competencia: string | null;
  grupo_parcela: string | null;
}

export interface ProjectedInstallment extends ProjectableTransaction {
  _isProjected: true;
}

/**
 * For each installment transaction X/Y where X < Y,
 * project parcelas (X+1) through Y with sequential months.
 * Only creates projections with dates >= 2026-01-01.
 */
export function projectFutureInstallments(
  transactions: ProjectableTransaction[]
): ProjectedInstallment[] {
  const projected: ProjectedInstallment[] = [];

  // Collect existing parcela numbers per installment group to avoid projecting parcelas already in the batch
  const existingParcelas = new Map<string, Set<number>>();
  for (const t of transactions) {
    if (!t.parcela_atual || !t.parcela_total) continue;
    const key = t.descricao.replace(/\s*\(auto-projetada\)/, '').trim().substring(0, 25).toUpperCase() + '|' + t.parcela_total + '|' + t.pessoa;
    if (!existingParcelas.has(key)) existingParcelas.set(key, new Set());
    existingParcelas.get(key)!.add(t.parcela_atual);
  }

  // For each installment group, only project from the one with the LOWEST parcela_atual
  const projected_from = new Set<string>();

  for (const t of transactions) {
    if (!t.parcela_atual || !t.parcela_total) continue;
    if (t.parcela_atual >= t.parcela_total) continue;

    const baseDesc = t.descricao.replace(/\s*\(auto-projetada\)/, '').trim();
    const groupKey = baseDesc.substring(0, 25).toUpperCase() + '|' + t.parcela_total + '|' + t.pessoa;

    // Only project from the lowest parcela_atual in each group
    if (projected_from.has(groupKey)) continue;
    projected_from.add(groupKey);

    const existingSet = existingParcelas.get(groupKey) || new Set();

    // Use data_original (real purchase date) as base for incrementing, fallback to data
    const baseDate = t.data_original || t.data;

    for (let p = t.parcela_atual + 1; p <= t.parcela_total; p++) {
      // Skip if this parcela already exists in the import batch (e.g. CSV has parcelas 01-12)
      if (existingSet.has(p)) continue;

      const offset = p - t.parcela_atual;

      // Calculate future date from original purchase date (safe from month overflow)
      const isoDate = addMonthsSafe(baseDate, offset);

      // Only project dates >= current year
      const currentYearStart = `${new Date().getFullYear()}-01-01`;
      if (isoDate < currentYearStart) continue;

      // Project mes_competencia forward from billing period
      let projectedCompetencia: string | null = null;
      if (t.mes_competencia) {
        const compIso = addMonthsSafe(`${t.mes_competencia}-01`, offset);
        projectedCompetencia = compIso.substring(0, 7);
      }

      const hash = generateHash(isoDate, baseDesc, t.valor, t.pessoa) + `_p${p}`;

      projected.push({
        user_id: t.user_id,
        conta_id: t.conta_id,
        data: isoDate,
        data_original: baseDate,
        mes_competencia: projectedCompetencia,
        descricao: `${baseDesc} (auto-projetada)`,
        valor: t.valor,
        categoria: t.categoria,
        tipo: t.tipo,
        essencial: t.essencial,
        parcela_atual: p,
        parcela_total: t.parcela_total,
        grupo_parcela: t.grupo_parcela,
        hash_transacao: hash,
        pessoa: t.pessoa,
        _isProjected: true,
      });
    }
  }

  return projected;
}

export interface ConflictMatch {
  csvTransaction: ProjectableTransaction | ProjectedInstallment;
  existingTransaction: {
    id: string;
    descricao: string;
    valor: number;
    data: string;
    data_original: string | null;
    parcela_atual: number | null;
    parcela_total: number | null;
    pessoa: string;
    hash_transacao: string;
  };
  matchType: 'exact' | 'partial';
  matchReason: string;
  /** User choice: 'csv' to use CSV version, 'existing' to keep DB version */
  choice: 'csv' | 'existing';
}

/**
 * Check a list of planned transactions against existing DB transactions.
 * Returns: { clean (no conflict), exact (auto-skip), partial (needs user decision) }
 */
export function detectConflicts(
  planned: (ProjectableTransaction | ProjectedInstallment)[],
  existing: {
    id: string;
    descricao: string;
    valor: number;
    data: string;
    data_original: string | null;
    mes_competencia: string | null;
    parcela_atual: number | null;
    parcela_total: number | null;
    pessoa: string;
    hash_transacao: string;
  }[]
): {
  clean: (ProjectableTransaction | ProjectedInstallment)[];
  exactMatches: { planned: ProjectableTransaction | ProjectedInstallment; existingId: string }[];
  autoReplacements: { planned: ProjectableTransaction | ProjectedInstallment; existingId: string }[];
  conflicts: ConflictMatch[];
} {
  const clean: (ProjectableTransaction | ProjectedInstallment)[] = [];
  const exactMatches: { planned: ProjectableTransaction | ProjectedInstallment; existingId: string }[] = [];
  const autoReplacements: { planned: ProjectableTransaction | ProjectedInstallment; existingId: string }[] = [];
  const conflicts: ConflictMatch[] = [];

  const normalize = (s: string) => s.replace(/\s*\(auto-projetada\)/, '').trim().substring(0, 25).toLowerCase();

  const daysDiff = (a: string, b: string): number => {
    const da = new Date(a + 'T00:00:00');
    const db = new Date(b + 'T00:00:00');
    return Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24);
  };

  for (const tx of planned) {
    const prefix = normalize(tx.descricao);
    const isFromCsv = !('_isProjected' in tx);

    // Find exact hash match first
    const hashMatch = existing.find(e => e.hash_transacao === tx.hash_transacao);
    if (hashMatch) {
      exactMatches.push({ planned: tx, existingId: hashMatch.id });
      continue;
    }

    // For CSV (real) installment transactions, try relaxed match against auto-projected
    // Tolerance: value ±R$5.00, data_original ±30 days
    if (isFromCsv && tx.parcela_atual && tx.parcela_total) {
      const autoProjectedMatch = existing.find(e => {
        if (!e.descricao.includes('(auto-projetada)')) return false;
        const ePrefix = normalize(e.descricao);
        if (ePrefix !== prefix) return false;
        if (Math.abs(Number(e.valor) - tx.valor) > 0.30) return false;
        if (e.parcela_atual !== tx.parcela_atual) return false;
        if (e.parcela_total !== tx.parcela_total) return false;
        if (e.pessoa.toLowerCase() !== tx.pessoa.toLowerCase()) return false;
        // Flexible data_original comparison: ±30 days
        const txOriginal = (tx as any).data_original || tx.data;
        const eOriginal = e.data_original || e.data;
        if (daysDiff(txOriginal, eOriginal) > 30) return false;
        return true;
      });

      if (autoProjectedMatch) {
        // Auto-replace: delete projected, import real
        autoReplacements.push({ planned: tx, existingId: autoProjectedMatch.id });
        continue;
      }
    }

    // Find partial match: same description prefix + value ± 0.10 + same parcela + same pessoa + same data_original (competência)
    const partialMatch = existing.find(e => {
      const ePrefix = normalize(e.descricao);
      if (ePrefix !== prefix) return false;
      if (Math.abs(Number(e.valor) - tx.valor) > 0.10) return false;
      if (e.parcela_atual !== tx.parcela_atual) return false;
      if (e.parcela_total !== tx.parcela_total) return false;
      if (e.pessoa.toLowerCase() !== tx.pessoa.toLowerCase()) return false;
      const txOriginal = (tx as any).data_original || tx.data;
      const eOriginal = e.data_original || e.data;
      if (txOriginal !== eOriginal) return false;
      return true;
    });

    if (partialMatch) {
      // Check if the existing one is auto-projected — auto-replace those
      if (partialMatch.descricao.includes('(auto-projetada)') && isFromCsv) {
        autoReplacements.push({ planned: tx, existingId: partialMatch.id });
        continue;
      }

      conflicts.push({
        csvTransaction: tx,
        existingTransaction: partialMatch,
        matchType: 'partial',
        matchReason: `Mesma descrição, valor, parcela e pessoa. Datas podem diferir.`,
        choice: 'csv',
      });
    } else {
      clean.push(tx);
    }
  }

  return { clean, exactMatches, autoReplacements, conflicts };
}
