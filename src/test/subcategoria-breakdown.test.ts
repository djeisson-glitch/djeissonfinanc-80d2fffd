import { describe, it, expect } from 'vitest';
import { buildCategoryComposition } from '@/lib/analytics-engine';

function tx(over: Partial<any> = {}): any {
  return {
    data: '2026-06-10',
    mes_competencia: null,
    descricao: 'x',
    valor: 100,
    tipo: 'despesa',
    categoria: 'Alimentação',
    categoria_id: null,
    subcategoria: null,
    parcela_atual: null,
    parcela_total: null,
    grupo_parcela: null,
    ignorar_dashboard: false,
    essencial: true,
    conta_id: 'c1',
    ...over,
  };
}

describe('buildCategoryComposition — breakdown por subcategoria', () => {
  it('agrega valor por subcategoria dentro da categoria', () => {
    const comp = buildCategoryComposition([
      tx({ categoria: 'Alimentação', subcategoria: 'Supermercado', valor: 300 }),
      tx({ categoria: 'Alimentação', subcategoria: 'Restaurante', valor: 100 }),
      tx({ categoria: 'Alimentação', subcategoria: 'Supermercado', valor: 200 }),
    ], '2026-06');
    const ali = comp.find(c => c.categoria === 'Alimentação')!;
    expect(ali.valor).toBe(600);
    // Supermercado 500 (83%), Restaurante 100 (17%)
    expect(ali.subs[0]).toMatchObject({ subcategoria: 'Supermercado', valor: 500 });
    expect(ali.subs[0].pct).toBeCloseTo(83.33, 1);
    expect(ali.subs[1]).toMatchObject({ subcategoria: 'Restaurante', valor: 100 });
  });

  it('categoria sem subcategoria não expõe breakdown (subs vazio)', () => {
    const comp = buildCategoryComposition([
      tx({ categoria: 'Compras', subcategoria: null, valor: 150 }),
    ], '2026-06');
    const compras = comp.find(c => c.categoria === 'Compras')!;
    expect(compras.subs).toEqual([]);
  });

  it('mistura: parte com sub, parte sem → "Sem subcategoria" entra no breakdown', () => {
    const comp = buildCategoryComposition([
      tx({ categoria: 'Transporte', subcategoria: 'Combustível', valor: 200 }),
      tx({ categoria: 'Transporte', subcategoria: null, valor: 50 }),
    ], '2026-06');
    const tr = comp.find(c => c.categoria === 'Transporte')!;
    expect(tr.valor).toBe(250);
    expect(tr.subs.map(s => s.subcategoria).sort()).toEqual(['Combustível', 'Sem subcategoria']);
  });
});
