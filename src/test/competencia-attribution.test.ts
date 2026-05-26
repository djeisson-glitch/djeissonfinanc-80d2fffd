import { describe, expect, it } from 'vitest';
import { detectRecurringCharges } from '@/lib/spending-patterns';
import type { TransactionRecord } from '@/lib/projection-engine';

function tx(over: Partial<TransactionRecord>): TransactionRecord {
  return {
    data: '2026-01-10',
    mes_competencia: null,
    descricao: 'NETFLIX',
    valor: 59.9,
    tipo: 'despesa',
    categoria: 'Assinatura',
    categoria_id: null,
    parcela_atual: null,
    parcela_total: null,
    grupo_parcela: null,
    ignorar_dashboard: false,
    essencial: false,
    conta_id: 'c1',
    ...over,
  };
}

describe('atribuição por mês de competência (cartão), não pela data da compra', () => {
  it('três cobranças com a mesma data mas competências distintas contam como 3 meses', () => {
    // Se o engine agrupasse por `data` (todas 2026-01-10), seria 1 mês só e
    // NÃO seria detectada como recorrente (exige >= 3 meses). Usando
    // mes_competencia, caem em jan/fev/mar → recorrente com frequência 3.
    const txs: TransactionRecord[] = [
      tx({ data: '2026-01-10', mes_competencia: '2026-01' }),
      tx({ data: '2026-01-10', mes_competencia: '2026-02' }),
      tx({ data: '2026-01-10', mes_competencia: '2026-03' }),
    ];
    const recorrentes = detectRecurringCharges(txs);
    expect(recorrentes).toHaveLength(1);
    expect(recorrentes[0].frequencia).toBe(3);
    expect(recorrentes[0].ultimoMes).toBe('2026-03');
  });

  it('sem competência, cai no YYYY-MM da data (fallback)', () => {
    const txs: TransactionRecord[] = [
      tx({ data: '2026-01-10' }),
      tx({ data: '2026-02-10' }),
      tx({ data: '2026-03-10' }),
    ];
    const recorrentes = detectRecurringCharges(txs);
    expect(recorrentes).toHaveLength(1);
    expect(recorrentes[0].ultimoMes).toBe('2026-03');
  });
});
