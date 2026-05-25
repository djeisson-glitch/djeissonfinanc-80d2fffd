import { describe, it, expect } from 'vitest';
import { monthPace, projetarFimMes, buildBudgetAlerts, compute503020, suggestMeta } from '@/lib/budget-insights';

describe('monthPace + projeção', () => {
  it('mês corrente projeta pelo ritmo (dia 10 de 30 → fator 3)', () => {
    const pace = monthPace(2026, 5, new Date(2026, 5, 10)); // junho/2026, dia 10
    expect(pace.diasMes).toBe(30);
    expect(pace.diaAtual).toBe(10);
    expect(pace.isMesCorrente).toBe(true);
    expect(projetarFimMes(300, pace)).toBe(900);
  });
  it('mês passado/fechado usa o valor real (fator 1)', () => {
    const pace = monthPace(2026, 3, new Date(2026, 5, 10)); // abril visto em junho
    expect(pace.fator).toBe(1);
    expect(projetarFimMes(300, pace)).toBe(300);
  });
});

describe('buildBudgetAlerts', () => {
  const pace = monthPace(2026, 5, new Date(2026, 5, 10)); // fator 3

  it('marca estourou quando já passou a meta', () => {
    const a = buildBudgetAlerts([{ categoria: 'Lazer', gastoMes: 600, media: 400, meta: 500 }], pace);
    expect(a[0].tipo).toBe('estourou');
    expect(a[0].severidade).toBe('alto');
  });
  it('marca vai_estourar pela projeção no mês corrente', () => {
    // gasto 200, projeção 600 > meta 500 → vai_estourar
    const a = buildBudgetAlerts([{ categoria: 'Mercado', gastoMes: 200, media: 0, meta: 500 }], pace);
    expect(a[0].tipo).toBe('vai_estourar');
    expect(a[0].projecao).toBe(600);
  });
  it('marca acima_media sem meta', () => {
    const a = buildBudgetAlerts([{ categoria: 'Uber', gastoMes: 200, media: 100, meta: null }], pace);
    expect(a[0].tipo).toBe('acima_media');
  });
  it('não alerta categoria dentro da meta e no ritmo', () => {
    const a = buildBudgetAlerts([{ categoria: 'Casa', gastoMes: 100, media: 300, meta: 1000 }], pace);
    expect(a).toHaveLength(0);
  });
});

describe('compute503020', () => {
  it('calcula percentuais e alvos sobre a receita', () => {
    const r = compute503020(10000, 5500, 2000);
    expect(r.poupanca).toBe(2500);
    expect(r.pctEssenciais).toBe(55);
    expect(r.pctPoupanca).toBe(25);
    expect(r.alvoEssenciais).toBe(5000);
    expect(r.alvoPoupanca).toBe(2000);
  });
  it('receita zero não quebra', () => {
    const r = compute503020(0, 100, 50);
    expect(r.pctEssenciais).toBe(0);
    expect(r.poupanca).toBe(-150);
  });
});

describe('suggestMeta', () => {
  it('arredonda pra dezena', () => {
    expect(suggestMeta(523)).toBe(520);
    expect(suggestMeta(0)).toBe(0);
    expect(suggestMeta(7)).toBe(10);
  });
});
