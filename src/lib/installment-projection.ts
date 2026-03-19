import { generateHash } from '@/lib/csv-parser';

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

  for (const t of transactions) {
    if (!t.parcela_atual || !t.parcela_total) continue;
    if (t.parcela_atual >= t.parcela_total) continue;

    const baseDesc = t.descricao.replace(/\s*\(auto-projetada\)/, '').trim();

    for (let p = t.parcela_atual + 1; p <= t.parcela_total; p++) {
      const offset = p - t.parcela_atual;

      // Calculate future date
      const futureDate = new Date(t.data + 'T00:00:00');
      futureDate.setMonth(futureDate.getMonth() + offset);
      const isoDate = futureDate.toISOString().split('T')[0];

      // Only project dates >= 2026-01-01
      if (isoDate < '2026-01-01') continue;

      // Keep data_original (competência) identical to the original installment
      const projectedOriginal: string | null = t.data_original;

      // Project mes_competencia forward
      let projectedCompetencia: string | null = null;
      if (t.mes_competencia) {
        const [cy, cm] = t.mes_competencia.split('-').map(Number);
        const compDate = new Date(cy, cm - 1 + offset, 1);
        projectedCompetencia = `${compDate.getFullYear()}-${String(compDate.getMonth() + 1).padStart(2, '0')}`;
      }

      const hash = generateHash(isoDate, baseDesc, t.valor, t.pessoa) + `_p${p}`;

      projected.push({
        user_id: t.user_id,
        conta_id: t.conta_id,
        data: isoDate,
        data_original: projectedOriginal,
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
  conflicts: ConflictMatch[];
} {
  const clean: (ProjectableTransaction | ProjectedInstallment)[] = [];
  const exactMatches: { planned: ProjectableTransaction | ProjectedInstallment; existingId: string }[] = [];
  const conflicts: ConflictMatch[] = [];

  const normalize = (s: string) => s.replace(/\s*\(auto-projetada\)/, '').trim().substring(0, 15).toLowerCase();

  for (const tx of planned) {
    const prefix = normalize(tx.descricao);

    // Find exact hash match first
    const hashMatch = existing.find(e => e.hash_transacao === tx.hash_transacao);
    if (hashMatch) {
      exactMatches.push({ planned: tx, existingId: hashMatch.id });
      continue;
    }

    // Find partial match: same description prefix + value ± 0.10 + same parcela + same pessoa + same data_original (competência)
    const partialMatch = existing.find(e => {
      const ePrefix = normalize(e.descricao);
      if (ePrefix !== prefix) return false;
      if (Math.abs(Number(e.valor) - tx.valor) > 0.10) return false;
      if (e.parcela_atual !== tx.parcela_atual) return false;
      if (e.parcela_total !== tx.parcela_total) return false;
      if (e.pessoa.toLowerCase() !== tx.pessoa.toLowerCase()) return false;
      // Compare data_original (competência date) — different months = NOT duplicates
      const txOriginal = (tx as any).data_original || tx.data;
      const eOriginal = e.data_original || e.data;
      if (txOriginal !== eOriginal) return false;
      return true;
    });

    if (partialMatch) {
      // Check if the existing one is auto-projected — auto-replace those
      if (partialMatch.descricao.includes('(auto-projetada)') && !('_isProjected' in tx)) {
        // CSV real data replaces auto-projected — treat as clean (will upsert)
        // But we need to delete the old auto-projected one since hash differs
        exactMatches.push({ planned: tx, existingId: partialMatch.id });
        continue;
      }

      conflicts.push({
        csvTransaction: tx,
        existingTransaction: partialMatch,
        matchType: 'partial',
        matchReason: `Mesma descrição, valor, parcela e pessoa. Datas podem diferir.`,
        choice: 'csv', // default: import CSV
      });
    } else {
      clean.push(tx);
    }
  }

  return { clean, exactMatches, conflicts };
}
