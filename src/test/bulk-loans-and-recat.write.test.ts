/**
 * Bulk: (1) importa carnês Sicredi pra Dívidas; (2) re-categoriza "Outros"
 * com as novas regras determinísticas em auto-categorize; (3) marca
 * "Parcela da fatura de XXX" como ignorar_dashboard (linha interna de
 * rolagem da fatura Nubank, não é gasto novo).
 *
 * Rodar:
 *   source .supabase-migration-creds.local && \
 *     SUPABASE_URL=$NEW_SUPABASE_URL SERVICE_ROLE=$NEW_SUPABASE_SERVICE_ROLE \
 *     USER_ID=64479191-36b1-4cd1-a4ca-b538d78d597a \
 *     APPLY=1 \
 *     ./node_modules/.bin/vitest run src/test/bulk-loans-and-recat.write.test.ts
 */
import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSicrediLoanCsv, buildEmprestimoRows } from '@/lib/credito-parser';
import { autoCategorizarTransacao } from '@/lib/auto-categorize';
import { isFaturaPayment, isCreditoParcelamento } from '@/lib/csv-parser';

const URL = process.env.SUPABASE_URL;
const SR = process.env.SERVICE_ROLE;
const USER_ID = process.env.USER_ID;
const APPLY = process.env.APPLY === '1';
const BASE = '/Users/djeissonmauss/Downloads';
const SHOULD_RUN = Boolean(URL && SR && USER_ID && APPLY);

const CONTA_SICREDI_CC = '7027f913-9c07-41ee-9637-ebad2a7015de';

// REST helpers
async function get(url: string) {
  const r = await fetch(url, {
    headers: { apikey: SR!, Authorization: `Bearer ${SR}` },
  });
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function patch(url: string, body: any) {
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { apikey: SR!, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${url} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
async function postBatch(rows: any[]) {
  for (let i = 0; i < rows.length; i += 50) {
    const r = await fetch(`${URL}/rest/v1/transacoes?on_conflict=user_id,hash_transacao`, {
      method: 'POST',
      headers: {
        apikey: SR!, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(rows.slice(i, i + 50)),
    });
    if (!r.ok) throw new Error(`POST → ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
}

const LOAN_FILES = [
  'sicredi_1779723205.csv', // C5A9304811 - 30x R$ 414,39
  'sicredi_1779723225.csv', // C5A9304498 - 12x R$ 179,10
  'sicredi_1779723245.csv', // C5A9304161 - 36x R$ 601,71
  'sicredi_1779723264.csv', // C5A9203519 - 12x R$ 910,49
  'sicredi_1779723283.csv', // C5A9200110 - 48x R$ 1.283,71
];

describe.skipIf(!SHOULD_RUN)('Loans + recat', () => {
  it('importa carnês Sicredi como parcelas futuras', { timeout: 120_000 }, async () => {
    const today = new Date().toISOString().substring(0, 10);
    let totalRows = 0;
    let contratosOK = 0;
    for (const name of LOAN_FILES) {
      const filePath = path.join(BASE, name);
      if (!fs.existsSync(filePath)) {
        console.log(`  ⚠️  ${name} não encontrado, pulando`);
        continue;
      }
      const text = fs.readFileSync(filePath, 'utf8');
      const ddc = parseSicrediLoanCsv(text);
      if (!ddc) {
        console.log(`  ⚠️  ${name} não parseável como carnê Sicredi`);
        continue;
      }
      const rows = buildEmprestimoRows(ddc, {
        userId: USER_ID!,
        contaId: CONTA_SICREDI_CC,
        pessoa: 'Djeisson Mauss',
        hojeIso: today,
      });
      if (rows.length === 0) {
        console.log(`  ⚠️  ${name}: contrato ${ddc.contratoKey} sem parcelas futuras`);
        continue;
      }
      await postBatch(rows);
      contratosOK++;
      totalRows += rows.length;
      console.log(
        `  ✅ ${ddc.contratoKey}: ${rows.length} parcelas futuras × R$ ${ddc.parcelaFixa.toFixed(2)} = R$ ${(rows.length * ddc.parcelaFixa).toFixed(2)}`,
      );
    }
    console.log(`\n[LOANS] ${contratosOK}/${LOAN_FILES.length} contratos, ${totalRows} parcelas futuras inseridas.`);
  });

  it('re-categoriza Outros / Outras receitas via novas regras', { timeout: 300_000 }, async () => {
    let totalUpd = 0;
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const rows: any[] = await get(
        `${URL}/rest/v1/transacoes?categoria=in.(Outros,Outras%20receitas)&select=id,descricao,tipo,ignorar_dashboard&limit=${pageSize}&offset=${from}`,
      );
      if (rows.length === 0) break;

      const byCategoria: Record<string, string[]> = {};
      const idsParaIgnorar: string[] = [];

      for (const row of rows) {
        const nova = autoCategorizarTransacao(row.descricao);
        if (nova && nova !== 'Outros' && nova !== 'Outras receitas') {
          (byCategoria[nova] = byCategoria[nova] || []).push(row.id);
        }
        // Auxiliar: se isFaturaPayment matchou (ex: "Parcela da fatura de
        // dezembro/2025"), marca ignorar_dashboard pra não inflar despesa.
        if (!row.ignorar_dashboard && isFaturaPayment(row.descricao) && !isCreditoParcelamento(row.descricao)) {
          idsParaIgnorar.push(row.id);
        }
      }

      for (const [cat, ids] of Object.entries(byCategoria)) {
        for (let i = 0; i < ids.length; i += 50) {
          const slice = ids.slice(i, i + 50);
          await patch(
            `${URL}/rest/v1/transacoes?id=in.(${slice.join(',')})`,
            { categoria: cat },
          );
          totalUpd += slice.length;
        }
      }
      for (let i = 0; i < idsParaIgnorar.length; i += 50) {
        const slice = idsParaIgnorar.slice(i, i + 50);
        await patch(
          `${URL}/rest/v1/transacoes?id=in.(${slice.join(',')})`,
          { ignorar_dashboard: true, categoria: 'Pagamento Fatura' },
        );
      }
      console.log(
        `  [page ${from}] ${rows.length} avaliadas → ${Object.values(byCategoria).flat().length} re-categorizadas, ${idsParaIgnorar.length} marcadas ignorar_dashboard`,
      );

      if (rows.length < pageSize) break;
      from += pageSize;
    }
    console.log(`\n[RECAT] Total: ${totalUpd} transações re-categorizadas.`);
  });

  it('corrige Salário Djêisson/Maiara: tipo deve ser receita (era despesa por seed)', { timeout: 60_000 }, async () => {
    // O seed criou essas como receitas projetadas mas o tipo pode estar errado.
    // Garantimos: descricao começa com 'Salário ' → tipo='receita',
    // categoria='Salário/Pró-labore'.
    const rows: any[] = await get(
      `${URL}/rest/v1/transacoes?descricao=ilike.Sal%25rio%25&select=id,tipo,categoria,descricao`,
    );
    const idsParaCorrigir = rows
      .filter((r) => r.tipo !== 'receita' || r.categoria !== 'Salário/Pró-labore')
      .map((r) => r.id);
    if (idsParaCorrigir.length === 0) {
      console.log('  Salários OK, nada a corrigir.');
      return;
    }
    for (let i = 0; i < idsParaCorrigir.length; i += 50) {
      const slice = idsParaCorrigir.slice(i, i + 50);
      await patch(
        `${URL}/rest/v1/transacoes?id=in.(${slice.join(',')})`,
        { tipo: 'receita', categoria: 'Salário/Pró-labore' },
      );
    }
    console.log(`  ✅ ${idsParaCorrigir.length} salários normalizados.`);
  });
});
