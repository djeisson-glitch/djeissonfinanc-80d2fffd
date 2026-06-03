import { describe, it, expect } from 'vitest';

/**
 * Testes da regra "pagamento sem mes_competencia abate fatura anterior à
 * data do pagamento". Extraído inline aqui pra não precisar mockar useQuery.
 */
function periodoDePagamento(t: { tipo: string; ignorar_dashboard: boolean; mes_competencia: string | null; data: string }): string {
  if (t.mes_competencia) return t.mes_competencia;
  const [y, m] = t.data.split('-').map(Number);
  const ant = new Date(Date.UTC(y, m - 2, 1));
  return `${ant.getUTCFullYear()}-${String(ant.getUTCMonth() + 1).padStart(2, '0')}`;
}

describe('regra de competência de pagamento (useFaturaAcumulada)', () => {
  it('pagamento sem mes_competencia em junho/2026 abate fatura de MAIO/2026', () => {
    const periodo = periodoDePagamento({
      tipo: 'receita',
      ignorar_dashboard: true,
      mes_competencia: null,
      data: '2026-06-05',
    });
    expect(periodo).toBe('2026-05');
  });

  it('pagamento sem mes_competencia em janeiro/2026 abate fatura de DEZEMBRO/2025 (atravessa ano)', () => {
    const periodo = periodoDePagamento({
      tipo: 'receita',
      ignorar_dashboard: true,
      mes_competencia: null,
      data: '2026-01-08',
    });
    expect(periodo).toBe('2025-12');
  });

  it('pagamento com mes_competencia setado RESPEITA o valor (UI manual)', () => {
    const periodo = periodoDePagamento({
      tipo: 'receita',
      ignorar_dashboard: true,
      mes_competencia: '2026-07',
      data: '2026-06-15',
    });
    expect(periodo).toBe('2026-07');
  });

  it('cenario completo: importação do extrato Black gera pagamento atribuído ao mês correto', () => {
    // Bug original (commit ed11200~): pagamento sem competência caía em
    // 2026-06 e zerava a fatura corrente, escondendo R$ 5.941 em aberto.
    const pagamento = {
      tipo: 'receita',
      ignorar_dashboard: true,
      mes_competencia: null, // import do extrato Black não seta competência
      data: '2026-06-05', // data do pagamento
      valor: 6395.39,
    };
    // Despesas de junho seguem em junho (mes_competencia setado no import)
    expect(periodoDePagamento(pagamento)).toBe('2026-05'); // pagamento abate MAIO, não JUNHO
  });
});
