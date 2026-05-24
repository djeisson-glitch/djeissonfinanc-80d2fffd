import { describe, it, expect } from 'vitest';
import { detectRecurringForProjection, buildRecurringProjections, type RecurringTxInput } from '@/lib/recurring-projection';

function tx(over: Partial<RecurringTxInput> = {}): RecurringTxInput {
  return {
    data: '2026-01-10',
    descricao: 'NETFLIX',
    valor: 55,
    tipo: 'despesa',
    categoria: 'Assinatura',
    categoria_id: null,
    parcela_total: null,
    ignorar_dashboard: false,
    essencial: false,
    conta_id: 'conta-1',
    pessoa: 'Djeisson',
    ...over,
  };
}

describe('detectRecurringForProjection', () => {
  it('detecta despesa em 3+ meses e lista os meses futuros faltantes', () => {
    const txs = [
      tx({ data: '2026-01-10' }),
      tx({ data: '2026-02-10' }),
      tx({ data: '2026-03-10' }),
    ];
    const r = detectRecurringForProjection(txs, 2026, '2026-03');
    expect(r).toHaveLength(1);
    expect(r[0].descricao).toBe('NETFLIX');
    expect(r[0].mesesVistos).toBe(3);
    expect(r[0].diaDoMes).toBe(10);
    // abril..dezembro = 9 meses futuros
    expect(r[0].mesesFaltantes).toHaveLength(9);
    expect(r[0].mesesFaltantes[0]).toBe('2026-04');
    expect(r[0].mesesFaltantes[r[0].mesesFaltantes.length - 1]).toBe('2026-12');
  });

  it('ignora despesa que aparece em menos de 3 meses', () => {
    const txs = [tx({ data: '2026-01-10' }), tx({ data: '2026-02-10' })];
    expect(detectRecurringForProjection(txs, 2026, '2026-03')).toHaveLength(0);
  });

  it('não projeta meses que já têm o lançamento', () => {
    const txs = [
      tx({ data: '2026-01-10' }),
      tx({ data: '2026-02-10' }),
      tx({ data: '2026-03-10' }),
      tx({ data: '2026-05-10' }), // maio já existe
    ];
    const r = detectRecurringForProjection(txs, 2026, '2026-03');
    expect(r[0].mesesFaltantes).not.toContain('2026-05');
    expect(r[0].mesesFaltantes).toContain('2026-04');
  });

  it('ignora parcelas e auto-projetadas', () => {
    const txs = [
      tx({ data: '2026-01-10', parcela_total: 6 }),
      tx({ data: '2026-02-10', descricao: 'NETFLIX (auto-projetada)' }),
      tx({ data: '2026-03-10' }),
    ];
    expect(detectRecurringForProjection(txs, 2026, '2026-03')).toHaveLength(0);
  });
});

describe('buildRecurringProjections', () => {
  it('gera uma linha por mês faltante, marcada e com hash único', () => {
    const txs = [tx({ data: '2026-01-10' }), tx({ data: '2026-02-10' }), tx({ data: '2026-03-10' })];
    const candidates = detectRecurringForProjection(txs, 2026, '2026-10'); // faltam nov e dez
    expect(candidates[0].mesesFaltantes).toEqual(['2026-11', '2026-12']);
    const rows = buildRecurringProjections('user-1', candidates);
    expect(rows).toHaveLength(2);
    expect(rows[0].descricao).toBe('NETFLIX (auto-projetada)');
    expect(rows[0].tipo).toBe('despesa');
    expect(rows[0].conta_id).toBe('conta-1');
    expect(rows[0].data).toBe('2026-11-10');
    expect(rows[1].data).toBe('2026-12-10');
    expect(rows[0].hash_transacao).not.toBe(rows[1].hash_transacao);
  });

  it('clampa o dia para o último dia do mês quando necessário', () => {
    const txs = [
      tx({ data: '2026-01-31' }),
      tx({ data: '2026-03-31' }),
      tx({ data: '2026-05-31' }),
    ];
    const candidates = detectRecurringForProjection(txs, 2026, '2026-10'); // nov(30) e dez(31)
    const rows = buildRecurringProjections('user-1', candidates);
    const nov = rows.find(r => r.data.startsWith('2026-11'));
    expect(nov?.data).toBe('2026-11-30'); // novembro tem 30 dias
  });
});
