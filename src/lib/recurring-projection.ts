/**
 * Detecção de despesas recorrentes e projeção delas para o resto do ano.
 *
 * Reaproveita o conceito "(auto-projetada)" usado nas parcelas: cria lançamentos
 * futuros marcados, que são substituídos pelo lançamento real quando o extrato é
 * importado (ver detectConflicts em installment-projection.ts).
 */
import { generateHash, normalizeDescription } from './csv-parser';

export interface RecurringTxInput {
  data: string; // YYYY-MM-DD
  descricao: string;
  valor: number;
  tipo: string;
  categoria: string;
  categoria_id: string | null;
  parcela_total: number | null;
  ignorar_dashboard: boolean;
  essencial: boolean;
  conta_id: string;
  pessoa: string;
}

export interface RecurringCandidate {
  chave: string;
  descricao: string;
  valorMedio: number;
  categoria: string;
  categoria_id: string | null;
  essencial: boolean;
  conta_id: string;
  pessoa: string;
  diaDoMes: number;
  mesesVistos: number;
  ultimoMes: string; // YYYY-MM
  mesesFaltantes: string[]; // meses futuros do ano sem essa despesa
}

export interface ProjectedRecurringRow {
  user_id: string;
  conta_id: string;
  data: string;
  data_original: string;
  mes_competencia: null;
  descricao: string;
  descricao_normalizada: string;
  valor: number;
  categoria: string;
  categoria_id: string | null;
  tipo: 'despesa';
  essencial: boolean;
  parcela_atual: null;
  parcela_total: null;
  grupo_parcela: null;
  hash_transacao: string;
  pessoa: string;
  ignorar_dashboard: false;
}

const monthOf = (iso: string) => iso.substring(0, 7);
const dayOf = (iso: string) => Number(iso.substring(8, 10));
const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/**
 * Detecta despesas que aparecem em >= 3 meses distintos (sem parcela) e calcula,
 * para cada uma, quais meses futuros do ano ainda não têm o lançamento.
 * `mesAtual` no formato YYYY-MM — só projeta meses estritamente posteriores.
 */
export function detectRecurringForProjection(
  txs: RecurringTxInput[],
  ano: number,
  mesAtual: string,
): RecurringCandidate[] {
  const despesas = txs.filter(
    t =>
      t.tipo === 'despesa' &&
      !t.ignorar_dashboard &&
      t.parcela_total == null &&
      !t.descricao.includes('(auto-projetada)'),
  );

  const groups = new Map<string, RecurringTxInput[]>();
  for (const t of despesas) {
    const key = t.descricao.trim().toUpperCase().substring(0, 25);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const out: RecurringCandidate[] = [];
  for (const [key, items] of groups) {
    // Um lançamento por mês (o mais recente do mês) para não enviesar a média.
    const byMonth = new Map<string, RecurringTxInput>();
    for (const i of items) {
      const m = monthOf(i.data);
      const prev = byMonth.get(m);
      if (!prev || i.data > prev.data) byMonth.set(m, i);
    }
    if (byMonth.size < 3) continue;

    const monthly = [...byMonth.values()];
    const valorMedio = round2(mean(monthly.map(m => m.valor)));
    const last = monthly.reduce((a, b) => (a.data > b.data ? a : b));
    const dias = monthly.map(m => dayOf(m.data)).sort((a, b) => a - b);
    const diaDoMes = dias[Math.floor(dias.length / 2)] || 1; // mediana

    const mesesComExpense = new Set(byMonth.keys());
    const mesesFaltantes: string[] = [];
    for (let m = 1; m <= 12; m++) {
      const ym = `${ano}-${String(m).padStart(2, '0')}`;
      if (ym <= mesAtual) continue; // só futuro
      if (mesesComExpense.has(ym)) continue;
      mesesFaltantes.push(ym);
    }

    out.push({
      chave: key,
      descricao: last.descricao.trim(),
      valorMedio,
      categoria: last.categoria,
      categoria_id: last.categoria_id,
      essencial: last.essencial,
      conta_id: last.conta_id,
      pessoa: last.pessoa,
      diaDoMes,
      mesesVistos: byMonth.size,
      ultimoMes: monthOf(last.data),
      mesesFaltantes,
    });
  }

  return out.filter(c => c.mesesFaltantes.length > 0).sort((a, b) => b.valorMedio - a.valorMedio);
}

/** Constrói as linhas de transação (auto-projetada) para os meses faltantes dos candidatos. */
export function buildRecurringProjections(
  userId: string,
  candidates: RecurringCandidate[],
): ProjectedRecurringRow[] {
  const rows: ProjectedRecurringRow[] = [];
  for (const c of candidates) {
    const baseDesc = c.descricao.replace(/\s*\(auto-projetada\)/, '').trim();
    for (const ym of c.mesesFaltantes) {
      const [y, m] = ym.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const dia = Math.min(Math.max(1, c.diaDoMes), lastDay);
      const data = `${ym}-${String(dia).padStart(2, '0')}`;
      const hash = generateHash(data, baseDesc, c.valorMedio, c.pessoa) + `_rec${ym}`;
      rows.push({
        user_id: userId,
        conta_id: c.conta_id,
        data,
        data_original: data,
        mes_competencia: null,
        descricao: `${baseDesc} (auto-projetada)`,
        descricao_normalizada: normalizeDescription(baseDesc),
        valor: c.valorMedio,
        categoria: c.categoria,
        categoria_id: c.categoria_id,
        tipo: 'despesa',
        essencial: c.essencial,
        parcela_atual: null,
        parcela_total: null,
        grupo_parcela: null,
        hash_transacao: hash,
        pessoa: c.pessoa,
        ignorar_dashboard: false,
      });
    }
  }
  return rows;
}
