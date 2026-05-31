/**
 * Bulk-import de PDFs (Nubank cartão + Nubank conta + Mercado Pago cartão).
 *
 * Estratégia:
 *   - Nubank Cartão: parseNubankCard espera `string[]` (texto flat por página).
 *   - Nubank Conta + Mercado Pago: parseNubankConta/parseMercadoPago esperam
 *     pages estruturadas com rows posicionadas. Replico aqui a mesma extração
 *     que o app faz no browser (groupItemsIntoRows / detectGarbledFonts).
 *
 * Rodar:
 *   source .supabase-migration-creds.local && \
 *     SUPABASE_URL=$NEW_SUPABASE_URL SERVICE_ROLE=$NEW_SUPABASE_SERVICE_ROLE \
 *     USER_ID=64479191-36b1-4cd1-a4ca-b538d78d597a \
 *     APPLY_PDFS=1 \
 *     ./node_modules/.bin/vitest run src/test/bulk-import-pdfs.write.test.ts --reporter=verbose
 */
import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { parseNubankCard, parseNubankConta, parseMercadoPago } from '@/lib/pdf-parser';
import { normalizeDescription, FATURA_TOTAL_MARKER, isFaturaPayment, isCreditoParcelamento } from '@/lib/csv-parser';
import { autoCategorizarTransacao } from '@/lib/auto-categorize';

// Silencia warnings de canvas (sem efeito em extração de texto)
process.env.NODE_NO_WARNINGS = '1';
const origWarn = console.warn;
console.warn = (...args: any[]) => {
  if (String(args[0] ?? '').includes('Cannot polyfill')) return;
  origWarn.apply(console, args);
};

const requireCJS = createRequire(import.meta.url);
const pdfjsLib = requireCJS('pdfjs-dist/legacy/build/pdf.js');

const URL = process.env.SUPABASE_URL;
const SR = process.env.SERVICE_ROLE;
const USER_ID = process.env.USER_ID;
const APPLY = process.env.APPLY_PDFS === '1';
const BASE = '/Users/djeissonmauss/Downloads';
const SHOULD_RUN = Boolean(URL && SR && USER_ID && APPLY);

const CONTAS: Record<string, string> = {
  Nubank:         'fa6e1f8c-114c-4d83-8b14-b6cf6162f52c',
  'Nubank Conta': '54289616-2524-4251-947f-cbad2620dc15',
  'Mercado Pago': '5b1ea005-bf04-4aaf-b31d-4309c72338c7',
};

// ─────────────────────────────────────────────────────────────────────────
// Extração de PDF — replica a lógica do extractPdfStructured do app
// ─────────────────────────────────────────────────────────────────────────
function normFontName(n: any): string {
  return typeof n === 'string' ? n : '';
}
function detectGarbledFonts(items: any[]): Set<string> {
  const out = new Set<string>();
  for (const it of items) {
    if (it.str && it.str.includes('$4')) out.add(normFontName(it.fontName));
  }
  return out;
}
interface RowItem { str: string; fontName: string; x: number; y: number }
function groupItemsIntoRows(items: any[]): Array<{ items: RowItem[] }> {
  if (!items.length) return [];
  const sorted = items
    .filter((it: any) => it.str && it.str.trim())
    .map((it: any) => ({
      str: it.str,
      fontName: normFontName(it.fontName),
      x: it.transform?.[4] ?? 0,
      y: it.transform?.[5] ?? 0,
    }));
  sorted.sort((a, b) => {
    const dy = b.y - a.y;
    if (Math.abs(dy) > 3) return dy;
    return a.x - b.x;
  });
  const rows: Array<{ items: RowItem[] }> = [];
  let currentRow: { items: RowItem[] } = { items: [] };
  let lastY = sorted[0]?.y ?? 0;
  for (const it of sorted) {
    if (Math.abs(it.y - lastY) > 3) {
      if (currentRow.items.length) rows.push(currentRow);
      currentRow = { items: [] };
      lastY = it.y;
    }
    currentRow.items.push(it);
  }
  if (currentRow.items.length) rows.push(currentRow);
  return rows;
}

async function extractPdf(file: string): Promise<{
  flatPages: string[];
  structuredPages: Array<{ rows: Array<{ items: RowItem[] }>; garbledFonts: Set<string> }>;
  isMP: boolean;
  isNuConta: boolean;
  isNuCard: boolean;
}> {
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const flatPages: string[] = [];
  const structuredPages: Array<{ rows: Array<{ items: RowItem[] }>; garbledFonts: Set<string> }> = [];
  let isMP = false, isNuConta = false, isNuCard = false;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const garbledFonts = detectGarbledFonts(content.items);
    const rows = groupItemsIntoRows(content.items);
    structuredPages.push({ rows, garbledFonts });
    // FLAT com quebras: parseNubankCard usa split(/\n/) — uma row vira uma linha.
    // Sem isso, todo o texto vira 1 só linha e nada matcha NUCARD_LINE.
    const text = rows
      .map((row) => row.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim())
      .filter((l) => l.length > 0)
      .join('\n');
    flatPages.push(text);
    const lower = text.toLowerCase();
    if (lower.includes('mercado pago') || lower.includes('mercadopago') || garbledFonts.size > 0) isMP = true;
    if ((lower.includes('nu financeira') || lower.includes('nu pagamentos')) &&
        (lower.includes('total de entradas') || lower.includes('total de saídas') || lower.includes('total de saidas') || lower.includes('movimentações'))) {
      isNuConta = true;
    }
    if ((lower.includes('nubank') || lower.includes('nu pagamentos')) &&
        /transa[çc][õo]es\s+de\s+\d{1,2}\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i.test(lower)) {
      isNuCard = true;
    }
  }
  if (isNuConta) isNuCard = false;
  return { flatPages, structuredPages, isMP, isNuConta, isNuCard };
}

// ─────────────────────────────────────────────────────────────────────────
// Supabase REST helpers (idempotente, on_conflict, batches de 50)
// ─────────────────────────────────────────────────────────────────────────
async function insertTransacoes(rows: any[]) {
  for (let i = 0; i < rows.length; i += 50) {
    const r = await fetch(`${URL}/rest/v1/transacoes?on_conflict=user_id,hash_transacao`, {
      method: 'POST',
      headers: {
        apikey: SR!, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(rows.slice(i, i + 50)),
    });
    if (!r.ok) throw new Error(`Insert: ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
}

async function upsertMarker(row: any) {
  const r = await fetch(`${URL}/rest/v1/transacoes?on_conflict=user_id,hash_transacao`, {
    method: 'POST',
    headers: {
      apikey: SR!, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) console.error('marker upsert:', r.status, (await r.text()).slice(0, 200));
}

// ─────────────────────────────────────────────────────────────────────────
// Inventory dos PDFs do Downloads
// ─────────────────────────────────────────────────────────────────────────
interface PdfJob {
  file: string;
  contaId: string;
  contaNome: string;
  parser: 'nubank-card' | 'nubank-conta' | 'mercado-pago';
  pessoa: string;
}

const PDF_FILES: PdfJob[] = [
  // ── Nubank Cartão (5 PDFs Nubank_2026-MM-11) ──────────
  ...['01', '02', '03', '04', '05'].map((mm) => {
    // Janeiro e fevereiro tem " 2" no fim do nome — só checagem dinâmica nos arquivos:
    return null as any;
  }).filter(Boolean),
];

// Sondagem dinâmica dos arquivos no Downloads — mais seguro que hardcode
function buildInventory(): PdfJob[] {
  const inv: PdfJob[] = [];
  const all = fs.readdirSync(BASE);

  // Nubank Cartão: Nubank_YYYY-MM-DD.pdf
  for (const f of all.filter((f) => /^Nubank_2026-\d{2}-\d{2}.*\.pdf$/.test(f)).sort()) {
    inv.push({
      file: path.join(BASE, f),
      contaId: CONTAS.Nubank,
      contaNome: 'Nubank',
      parser: 'nubank-card',
      pessoa: 'Maiara Martins',
    });
  }
  // Nubank Conta: NU_549121644_XXMMM2026_XXMMM2026.pdf
  for (const f of all.filter((f) => /^NU_549121644_\d{2}[A-Z]{3}2026_\d{2}[A-Z]{3}2026.*\.pdf$/.test(f)).sort()) {
    inv.push({
      file: path.join(BASE, f),
      contaId: CONTAS['Nubank Conta'],
      contaNome: 'Nubank Conta',
      parser: 'nubank-conta',
      pessoa: 'Maiara Martins',
    });
  }
  // Mercado Pago: credit-card-mp-statement.pdf (5 variants) + MercadoPago 3.pdf
  for (const f of all.filter((f) => /credit-card-mp-statement.*\.pdf$|^MercadoPago.*\.pdf$/.test(f)).sort()) {
    inv.push({
      file: path.join(BASE, f),
      contaId: CONTAS['Mercado Pago'],
      contaNome: 'Mercado Pago',
      parser: 'mercado-pago',
      pessoa: 'Djeisson Mauss',
    });
  }
  return inv;
}

// ─────────────────────────────────────────────────────────────────────────
// Importa 1 job
// ─────────────────────────────────────────────────────────────────────────
async function importPdfJob(job: PdfJob): Promise<{ inserted: number; markerCreated: boolean; periodo: string | null; warnings: string[] }> {
  const warns: string[] = [];
  const ext = await extractPdf(job.file);

  let result: any;
  if (job.parser === 'nubank-card') {
    result = parseNubankCard(ext.flatPages, job.pessoa);
  } else if (job.parser === 'nubank-conta') {
    result = parseNubankConta(ext.structuredPages, job.pessoa);
  } else if (job.parser === 'mercado-pago') {
    result = parseMercadoPago(ext.structuredPages, job.pessoa);
  } else {
    throw new Error(`parser desconhecido: ${job.parser}`);
  }

  const txs: any[] = result.transactions || [];
  if (txs.length === 0) {
    warns.push('sem transações extraídas');
    return { inserted: 0, markerCreated: false, periodo: null, warnings: warns };
  }

  // Período da fatura — Nubank cartão expõe detectedDueDate, MP idem; pra conta
  // a gente não cria marker (não é fatura).
  const isCard = job.parser !== 'nubank-conta';
  let periodo: string | null = null;
  if (isCard && result.detectedDueDate) {
    const dd = result.detectedDueDate;
    const monthIdx = typeof dd.month === 'number' ? dd.month : 0;
    periodo = `${dd.year}-${String(monthIdx + 1).padStart(2, '0')}`;
  }

  const rows = txs.map((t: any) => ({
    user_id: USER_ID,
    conta_id: job.contaId,
    data: t.data,
    data_original: t.data_original || t.data,
    // Pra cartão, mes_competencia = período da fatura derivado do PDF.
    // Pra conta, mes_competencia fica null (a UI usa data).
    mes_competencia: periodo || t.mes_competencia || null,
    descricao: t.descricao,
    descricao_normalizada: t.descricao_normalizada || normalizeDescription(t.descricao),
    valor: t.valor,
    tipo: t.tipo,
    categoria: t.categoria || autoCategorizarTransacao(t.descricao) || (t.tipo === 'receita' ? 'Outras receitas' : 'Outros'),
    essencial: t.essencial ?? false,
    parcela_atual: t.parcela_atual ?? null,
    parcela_total: t.parcela_total ?? null,
    pessoa: t.pessoa || job.pessoa,
    hash_transacao: t.hash_transacao,
    codigo_cartao: t.codigo_cartao || null,
    valor_dolar: t.valor_dolar || null,
    ignorar_dashboard:
      t.ignorar_dashboard ??
      (isFaturaPayment(t.descricao) && !isCreditoParcelamento(t.descricao)),
  }));

  await insertTransacoes(rows);

  // Marker da fatura — só pra cartão, e só se temos headerTotal
  let markerCreated = false;
  if (isCard && result.headerTotal && result.headerTotal > 0 && periodo) {
    const markerHash = `fatura_total_${job.contaId}_${periodo}`;
    await upsertMarker({
      user_id: USER_ID,
      conta_id: job.contaId,
      data: `${periodo}-01`,
      mes_competencia: periodo,
      descricao: FATURA_TOTAL_MARKER,
      descricao_normalizada: normalizeDescription(FATURA_TOTAL_MARKER),
      valor: result.headerTotal,
      categoria: 'Operação bancária',
      tipo: 'despesa',
      essencial: false,
      ignorar_dashboard: true,
      hash_transacao: markerHash,
      pessoa: 'Sistema',
    });
    markerCreated = true;
  }

  return { inserted: rows.length, markerCreated, periodo, warnings: warns };
}

// ─────────────────────────────────────────────────────────────────────────
describe.skipIf(!SHOULD_RUN)('Bulk import PDFs (Nubank + MP)', () => {
  it('importa todos os PDFs do Downloads', { timeout: 600_000 }, async () => {
    const inv = buildInventory();
    console.log(`\n[PDF-IMPORT] ${inv.length} arquivos detectados:\n`);
    for (const j of inv) {
      console.log(`  ${path.basename(j.file).padEnd(55)} → ${j.contaNome.padEnd(15)} (${j.parser})`);
    }

    let totalRows = 0;
    let totalMarkers = 0;
    const allWarns: string[] = [];

    let idx = 0;
    for (const job of inv) {
      idx++;
      try {
        const r = await importPdfJob(job);
        totalRows += r.inserted;
        if (r.markerCreated) totalMarkers++;
        console.log(`  [${idx}/${inv.length}] ✅ ${path.basename(job.file)} → +${r.inserted} tx${r.markerCreated ? ` + marker ${r.periodo}` : ''}`);
        if (r.warnings.length) allWarns.push(...r.warnings.map((w) => `${path.basename(job.file)}: ${w}`));
      } catch (e: any) {
        console.error(`  [${idx}/${inv.length}] ❌ ${path.basename(job.file)}: ${e.message}`);
        allWarns.push(`${path.basename(job.file)}: ERROR ${e.message}`);
      }
    }

    console.log(`\n[PDF-IMPORT] Total: ${totalRows} transações + ${totalMarkers} markers`);
    if (allWarns.length) {
      console.log(`\n[WARN] ${allWarns.length}:`);
      allWarns.forEach((w) => console.log('  -', w));
    }

    // Contagens finais
    for (const [nome, id] of Object.entries(CONTAS)) {
      const r = await fetch(
        `${URL}/rest/v1/transacoes?conta_id=eq.${id}&select=count`,
        { headers: { apikey: SR!, Authorization: `Bearer ${SR}`, Prefer: 'count=exact' } },
      );
      const c = r.headers.get('content-range')?.split('/')[1];
      console.log(`  ${nome.padEnd(15)}: ${c} transações`);
    }
  });
});
