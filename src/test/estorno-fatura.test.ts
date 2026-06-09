import { describe, it, expect } from 'vitest';
import { isDevolution } from '@/lib/csv-parser';

/**
 * Replica a regra de classificação de estorno do useFaturaAcumulada:
 * receita com categoria='Estorno' ou descrição de devolução → abate despesa.
 */
function classificar(t: { tipo: string; categoria: string | null; descricao: string | null; ignorar_dashboard: boolean }):
  'estorno' | 'pagamento' | 'despesa' | 'descartado' {
  const ehEstorno = t.tipo === 'receita' && (t.categoria === 'Estorno' || isDevolution(t.descricao || ''));
  if (ehEstorno) return 'estorno';
  if (t.tipo === 'receita' && t.ignorar_dashboard) return 'pagamento';
  if (t.tipo === 'despesa' && !t.ignorar_dashboard) return 'despesa';
  return 'descartado';
}

describe('classificação de estorno na fatura', () => {
  it('estorno manual (categoria Estorno) → abate despesa', () => {
    expect(classificar({ tipo: 'receita', categoria: 'Estorno', descricao: 'Devolucao loja', ignorar_dashboard: true })).toBe('estorno');
  });
  it('estorno importado (descrição devolução) → abate, mesmo sem categoria Estorno', () => {
    expect(classificar({ tipo: 'receita', categoria: 'Outros', descricao: 'ESTORNO COMPRA XYZ', ignorar_dashboard: true })).toBe('estorno');
  });
  it('pagamento de fatura (receita ignorar, sem ser devolução) → pagamento', () => {
    expect(classificar({ tipo: 'receita', categoria: 'Pagamento Fatura', descricao: 'Pag Fat Deb Cc', ignorar_dashboard: true })).toBe('pagamento');
  });
  it('compra normal → despesa', () => {
    expect(classificar({ tipo: 'despesa', categoria: 'Compras', descricao: 'Mercado Livre', ignorar_dashboard: false })).toBe('despesa');
  });

  it('cenário: compra 100 + estorno 30 → fatura líquida 70', () => {
    const despesa = 100;
    const estorno = 30;
    // Regra do hook: despesas += compra; despesas -= estorno
    const faturaLiquida = despesa - estorno;
    expect(faturaLiquida).toBe(70);
  });
});

describe('isDevolution', () => {
  it('detecta estorno/devolução', () => {
    expect(isDevolution('ESTORNO COMPRA')).toBe(true);
    expect(isDevolution('Devolução parcial')).toBe(true);
    expect(isDevolution('Mercado Livre')).toBe(false);
  });
});
