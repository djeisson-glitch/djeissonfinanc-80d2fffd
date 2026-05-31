/**
 * Bulk-import harness — importa OFX/CSV reais direto no Supabase via service_role.
 *
 * Modo TEST (default): só processa o arquivo `cc 228/jan.ofx` e valida no DB.
 * Modo FULL (APPLY_FULL=1): processa os 36 arquivos.
 *
 * Env vars necessárias:
 *   SUPABASE_URL, SERVICE_ROLE, USER_ID
 *   (opcional) APPLY_FULL=1
 *
 * Rodar:
 *   source .supabase-migration-creds.local && \
 *     SUPABASE_URL=$NEW_SUPABASE_URL SERVICE_ROLE=$NEW_SUPABASE_SERVICE_ROLE \
 *     USER_ID=64479191-36b1-4cd1-a4ca-b538d78d597a \
 *     ./node_modules/.bin/vitest run src/test/bulk-import-real.write.test.ts
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSicrediCSV, FATURA_TOTAL_MARKER, normalizeDescription, generateHash, isFaturaPayment, isCreditoParcelamento } from '@/lib/csv-parser';
import { parseOFX } from '@/lib/ofx-parser';
import { autoCategorizarTransacao } from '@/lib/auto-categorize';

const URL = process.env.SUPABASE_URL;
const SR = process.env.SERVICE_ROLE;
const USER_ID = process.env.USER_ID;
const APPLY_FULL = process.env.APPLY_FULL === '1';
const BASE = '/Users/djeissonmauss/Downloads';

// Inventário fixo dos arquivos REAIS de 2026 do usuário (vindos do Downloads).
// OFX: o ORG dentro do arquivo distingue conta 228 ("CCPI INTEGRACAO") vs conta
// 258 ("CCPI DA REGIAO DA PRODUCAO"). Mapeio explicitamente aqui pra evitar lógica
// frágil.
const OFX_FILES_2026: Array<{ name: string; contaNome: keyof typeof CONTAS }> = [
  // Sicredi Conta Corrente (ORG=CCPI INTEGRACAO, ACCTID=228...)
  { name: 'sicredi_1779722610.ofx', contaNome: 'Sicredi Conta Corrente' }, // jan
  { name: 'sicredi_1779722628.ofx', contaNome: 'Sicredi Conta Corrente' }, // fev
  { name: 'sicredi_1779722641.ofx', contaNome: 'Sicredi Conta Corrente' }, // mar
  { name: 'sicredi_1779722656.ofx', contaNome: 'Sicredi Conta Corrente' }, // abr
  { name: 'sicredi_1779722671.ofx', contaNome: 'Sicredi Conta Corrente' }, // mai
  // Sicredi Conta 2 (ORG=CCPI DA REGIAO DA PRODUCAO, ACCTID=258...)
  { name: 'sicredi_1779722719.ofx', contaNome: 'Sicredi Conta 2' }, // jan
  { name: 'sicredi_1779722734.ofx', contaNome: 'Sicredi Conta 2' }, // fev
  { name: 'sicredi_1779722747.ofx', contaNome: 'Sicredi Conta 2' }, // mar
  { name: 'sicredi_1779722758.ofx', contaNome: 'Sicredi Conta 2' }, // abr
  { name: 'sicredi_1779722768.ofx', contaNome: 'Sicredi Conta 2' }, // mai
];

// CSVs Sicredi Black 2026 (fatura). mes_competencia sai da "Data de Vencimento"
// dentro do arquivo, não do nome — bem mais robusto.
const CSV_BLACK_FILES_2026: string[] = [
  'sicredi_1779722469.csv', // venc 15/01/2026
  'sicredi_1779722493.csv', // venc 15/02/2026
  'sicredi_1779722513.csv', // venc 15/03/2026
  'sicredi_1779722531.csv', // venc 15/04/2026
  'sicredi_1779722557.csv', // venc 15/05/2026
  'sicredi_1779722579.csv', // venc 15/06/2026 (atual em aberto)
];

const CONTAS = {
  'Sicredi Conta Corrente': '7027f913-9c07-41ee-9637-ebad2a7015de',
  'Sicredi Conta 2':        '09b3d14f-9493-445c-932b-50895e8cbb85',
  'Black':                  'f72d3c4d-58b4-4fc0-beef-82f871a0817c',
  'Mercado Pago':           '5b1ea005-bf04-4aaf-b31d-4309c72338c7',
};

const SHOULD_RUN = Boolean(URL && SR && USER_ID);

async function rest(method: string, p: string, body?: any) {
  const r = await fetch(`${URL}${p}`, {
    method,
    headers: {
      apikey: SR!,
      Authorization: `Bearer ${SR}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${method} ${p} → ${r.status}: ${t.slice(0, 500)}`);
  }
  if (r.status === 204) return null;
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

async function insertTransacoes(rows: any[]) {
  // chunks de 50 + on_conflict pra duplicates virarem skip silencioso (idempotente
  // entre reruns; Sicredi CSVs também têm linhas-fantasma que repetem entre meses)
  for (let i = 0; i < rows.length; i += 50) {
    await rest('POST', '/rest/v1/transacoes?on_conflict=user_id,hash_transacao', rows.slice(i, i + 50));
  }
}

async function upsertTransacao(row: any) {
  // upsert via PATCH com on_conflict — pra marker idempotente
  await fetch(`${URL}/rest/v1/transacoes?on_conflict=user_id,hash_transacao`, {
    method: 'POST',
    headers: {
      apikey: SR!,
      Authorization: `Bearer ${SR}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  }).then(r => {
    if (!r.ok) return r.text().then(t => { throw new Error(`upsert: ${r.status} ${t.slice(0, 300)}`) });
  });
}

async function updateConta(id: string, patch: any) {
  const r = await fetch(`${URL}/rest/v1/contas?id=eq.${id}`, {
    method: 'PATCH',
    headers: { apikey: SR!, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`updateConta: ${r.status} ${(await r.text()).slice(0, 300)}`);
}

interface ImportJob {
  file: string;
  contaId: string;
  contaNome: string;
  contaTipo: 'debito' | 'credito';
  parser: 'ofx' | 'sicredi-csv';
}

function buildInventory(): ImportJob[] {
  const inv: ImportJob[] = [];
  for (const o of OFX_FILES_2026) {
    inv.push({
      file: path.join(BASE, o.name),
      contaId: CONTAS[o.contaNome],
      contaNome: o.contaNome,
      contaTipo: 'debito',
      parser: 'ofx',
    });
  }
  for (const name of CSV_BLACK_FILES_2026) {
    inv.push({
      file: path.join(BASE, name),
      contaId: CONTAS['Black'],
      contaNome: 'Black',
      contaTipo: 'credito',
      parser: 'sicredi-csv',
    });
  }
  return inv.filter(j => fs.existsSync(j.file));
}

// Extrai o "Data de Vencimento" do header do CSV Sicredi Black → YYYY-MM.
// Bem mais robusto que inferir do nome do arquivo (que pode estar errado/incompleto).
function inferPeriodFromCSVHeader(csvContent: string): string | null {
  const m = csvContent.match(/Data de Vencimento\s*;(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!m) return null;
  return `${m[3]}-${m[2]}`; // YYYY-MM
}

async function importJob(job: ImportJob): Promise<{ inserted: number; warnings: string[] }> {
  const content = fs.readFileSync(job.file, 'utf8');
  const warnings: string[] = [];
  const fileName = path.basename(job.file);

  let txs: any[] = [];
  let headerTotal: number | null = null;
  let openingBalance: number | null = null;
  let openingDate: string | null = null;
  let dueDay: number | null = null;
  // Pra Sicredi CSV (cartão de crédito), o período da fatura sai do NOME do arquivo,
  // não do conteúdo — o parser não infere e o React UI normalmente pede confirmação.
  let cardPeriodo: string | null = null;

  if (job.parser === 'ofx') {
    const r = parseOFX(content);
    txs = r.transactions;
    openingBalance = r.openingBalance;
    openingDate = r.openingDate;
  } else if (job.parser === 'sicredi-csv') {
    const r = parseSicrediCSV(content);
    txs = r.transactions;
    headerTotal = r.headerTotal ?? null;
    cardPeriodo = inferPeriodFromCSVHeader(content);
    if (!cardPeriodo) warnings.push(`Não consegui extrair Data de Vencimento de ${fileName}`);
  }

  if (txs.length === 0) {
    warnings.push(`Sem transações em ${fileName}`);
    return { inserted: 0, warnings };
  }

  // Map pra schema do DB
  const rows = txs.map((t: any) => ({
    user_id: USER_ID,
    conta_id: job.contaId,
    data: t.data,
    data_original: t.data_original || t.data,
    // Pra cartão (Sicredi CSV), força o mes_competencia derivado do nome do arquivo
    // — o parser não infere e sem isso a fatura "A pagar" agrupa tudo no mês atual.
    mes_competencia: cardPeriodo || t.mes_competencia || null,
    descricao: t.descricao,
    descricao_normalizada: t.descricao_normalizada || normalizeDescription(t.descricao),
    valor: t.valor,
    tipo: t.tipo,
    // Auto-categorização rule-based (mesma lib que o React import roda no preview).
    // Sem isso, todas as transações caem em "Outros" / "Outras receitas".
    categoria: t.categoria || autoCategorizarTransacao(t.descricao) || (t.tipo === 'receita' ? 'Outras receitas' : 'Outros'),
    essencial: t.essencial ?? false,
    parcela_atual: t.parcela_atual ?? null,
    parcela_total: t.parcela_total ?? null,
    pessoa: t.pessoa || (job.contaNome.includes('Black') ? 'Djeisson Mauss' : 'Djeisson Mauss'),
    hash_transacao: t.hash_transacao,
    codigo_cartao: t.codigo_cartao || null,
    valor_dolar: t.valor_dolar || null,
    // Pagamentos de fatura ("Pag Fat Deb Cc" no Black CSV, "PAGTO FATURA" no OFX
    // da CC) são transferências internas — entram nas duas contas mas NÃO podem
    // contar como receita/despesa real no dashboard (dobraria o gasto do mês).
    ignorar_dashboard:
      t.ignorar_dashboard ??
      (isFaturaPayment(t.descricao) && !isCreditoParcelamento(t.descricao)),
  }));

  await insertTransacoes(rows);

  // Marker da fatura (só Sicredi Black, quando o header trouxe o total)
  if (job.parser === 'sicredi-csv' && headerTotal && headerTotal > 0 && cardPeriodo) {
    const markerHash = `fatura_total_${job.contaId}_${cardPeriodo}`;
    await upsertTransacao({
      user_id: USER_ID,
      conta_id: job.contaId,
      data: `${cardPeriodo}-01`,
      mes_competencia: cardPeriodo,
      descricao: FATURA_TOTAL_MARKER,
      descricao_normalizada: normalizeDescription(FATURA_TOTAL_MARKER),
      valor: headerTotal,
      categoria: 'Operação bancária',
      tipo: 'despesa',
      essencial: false,
      ignorar_dashboard: true,
      hash_transacao: markerHash,
      pessoa: 'Sistema',
    });
  } else if (job.parser === 'sicredi-csv' && headerTotal && !cardPeriodo) {
    warnings.push(`headerTotal R$${headerTotal} mas sem período → marker não criado`);
  }

  // Saldo inicial (só OFX de débito, só se a conta ainda não tem saldo gravado pelo seed)
  // Aqui: rodamos pra TODAS, mas só o PRIMEIRO arquivo (cronologicamente) deveria setar.
  // Estratégia simples: aplica só se openingDate é o mais antigo já visto pra essa conta.
  // Pra evitar conflito com outras runs, deixamos o saldo_inicial do seed por enquanto.
  // (Após validar, podemos rodar update pra conta_id baseado no menor openingDate.)

  return { inserted: rows.length, warnings };
}

describe.skipIf(!SHOULD_RUN)('Bulk import real source files', () => {
  it('TEST mode: importa só cc 228/jan.ofx e valida', { timeout: 60_000 }, async () => {
    if (APPLY_FULL) return; // pula no full mode
    const inv = buildInventory();
    const jan228 = inv.find(j => j.file.endsWith('cc 228/jan.ofx'));
    expect(jan228, 'cc 228/jan.ofx não encontrado no inventory').toBeDefined();

    const r = await importJob(jan228!);
    console.log(`[TEST] cc 228/jan.ofx → inseridas ${r.inserted} transações`);
    if (r.warnings.length) console.log('[WARN]', r.warnings);

    // Valida no DB
    const check = await fetch(
      `${URL}/rest/v1/transacoes?conta_id=eq.${jan228!.contaId}&select=count`,
      { headers: { apikey: SR!, Authorization: `Bearer ${SR}`, Prefer: 'count=exact' } }
    );
    const count = check.headers.get('content-range')?.split('/')[1];
    console.log(`[DB] Sicredi Conta Corrente agora tem ${count} transações`);
    expect(Number(count)).toBeGreaterThan(0);
  });

  it.skipIf(!APPLY_FULL)('FULL mode: importa os 36 arquivos', { timeout: 600_000 }, async () => {
    const inv = buildInventory();
    console.log(`\n[FULL] ${inv.length} arquivos no inventory:\n`);
    for (const j of inv) {
      console.log(`  ${path.basename(j.file).padEnd(15)} → ${j.contaNome.padEnd(25)} (${j.parser})`);
    }

    let totalInserted = 0;
    const allWarnings: string[] = [];
    let idx = 0;
    for (const job of inv) {
      idx++;
      try {
        const r = await importJob(job);
        totalInserted += r.inserted;
        console.log(`  [${idx}/${inv.length}] ✅ ${path.basename(job.file)} → +${r.inserted}`);
        if (r.warnings.length) allWarnings.push(...r.warnings.map(w => `${path.basename(job.file)}: ${w}`));
      } catch (e: any) {
        console.error(`  [${idx}/${inv.length}] ❌ ${path.basename(job.file)}: ${e.message}`);
        allWarnings.push(`${path.basename(job.file)}: ERROR ${e.message}`);
      }
    }
    console.log(`\n[FULL] Total inserido: ${totalInserted} transações`);
    if (allWarnings.length) {
      console.log(`\n[WARN] ${allWarnings.length} warnings:`);
      allWarnings.forEach(w => console.log('  -', w));
    }

    // Contagens finais por conta
    for (const [nome, id] of Object.entries(CONTAS)) {
      const r = await fetch(
        `${URL}/rest/v1/transacoes?conta_id=eq.${id}&select=count`,
        { headers: { apikey: SR!, Authorization: `Bearer ${SR}`, Prefer: 'count=exact' } }
      );
      const c = r.headers.get('content-range')?.split('/')[1];
      console.log(`  ${nome.padEnd(25)}: ${c} transações`);
    }
  });

  it.skipIf(!APPLY_FULL)('Recategoriza transações com categoria "Outros"/"Outras receitas"', { timeout: 300_000 }, async () => {
    // O insert idempotente (on_conflict) NÃO atualiza categoria de linhas que já
    // existiam — por isso essa segunda passada aplica autoCategorizarTransacao em
    // TODAS as Outros/Outras receitas e re-grava no DB via PATCH.
    let totalUpdated = 0;
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const r = await fetch(
        `${URL}/rest/v1/transacoes?categoria=in.(Outros,Outras%20receitas)&select=id,descricao,tipo&limit=${pageSize}&offset=${from}`,
        { headers: { apikey: SR!, Authorization: `Bearer ${SR}` } }
      );
      const rows: any[] = await r.json();
      if (rows.length === 0) break;

      // Bucket por categoria pra batchar PATCHes (in.id=...) pra cada categoria-alvo
      const byNew: Record<string, string[]> = {};
      for (const row of rows) {
        const novaCat = autoCategorizarTransacao(row.descricao);
        if (novaCat && novaCat !== 'Outros' && novaCat !== 'Outras receitas') {
          (byNew[novaCat] = byNew[novaCat] || []).push(row.id);
        }
      }
      for (const [novaCat, ids] of Object.entries(byNew)) {
        for (let i = 0; i < ids.length; i += 50) {
          const slice = ids.slice(i, i + 50);
          const u = await fetch(
            `${URL}/rest/v1/transacoes?id=in.(${slice.join(',')})`,
            {
              method: 'PATCH',
              headers: { apikey: SR!, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ categoria: novaCat }),
            }
          );
          if (u.ok) totalUpdated += slice.length;
          else console.error(`PATCH falhou: ${u.status} ${(await u.text()).slice(0, 200)}`);
        }
      }
      from += pageSize;
      if (rows.length < pageSize) break;
    }
    console.log(`\n[RECAT] ${totalUpdated} transações recategorizadas.`);
  });
});
