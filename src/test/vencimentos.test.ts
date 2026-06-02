import { describe, it, expect } from 'vitest';
import { diasAte, construirVencimentos, calcularImpactoVencimentos, labelVencimento } from '@/lib/vencimentos';

describe('diasAte', () => {
  it('hoje = 0', () => {
    expect(diasAte('2026-06-02', '2026-06-02')).toBe(0);
  });
  it('amanhã = 1', () => {
    expect(diasAte('2026-06-03', '2026-06-02')).toBe(1);
  });
  it('ontem = -1', () => {
    expect(diasAte('2026-06-01', '2026-06-02')).toBe(-1);
  });
  it('atravessa mês', () => {
    expect(diasAte('2026-07-01', '2026-06-29')).toBe(2);
  });
  it('30 dias no futuro', () => {
    expect(diasAte('2026-07-02', '2026-06-02')).toBe(30);
  });
});

describe('labelVencimento', () => {
  it('atrasado', () => {
    expect(labelVencimento(-3)).toEqual({ texto: 'vencido há 3d', nivel: 'atrasado' });
  });
  it('hoje', () => {
    expect(labelVencimento(0)).toEqual({ texto: 'vence hoje', nivel: 'urgente' });
  });
  it('amanhã', () => {
    expect(labelVencimento(1)).toEqual({ texto: 'amanhã', nivel: 'urgente' });
  });
  it('1 semana = normal/proximo', () => {
    expect(labelVencimento(7).nivel).toBe('proximo');
  });
  it('2 semanas = normal', () => {
    expect(labelVencimento(14).nivel).toBe('normal');
  });
});

describe('construirVencimentos', () => {
  const hoje = '2026-06-02';

  it('inclui transação pendente futura', () => {
    const txs = [{ id: 't1', descricao: 'Aluguel', valor: 1200, tipo: 'despesa', data: '2026-06-10', pago: false }];
    const v = construirVencimentos(txs, [], hoje);
    expect(v).toHaveLength(1);
    expect(v[0].descricao).toBe('Aluguel');
    expect(v[0].diasAteVencer).toBe(8);
    expect(v[0].tipo).toBe('pagar');
  });

  it('NÃO inclui transação já paga', () => {
    const txs = [{ id: 't1', descricao: 'Aluguel', valor: 1200, tipo: 'despesa', data: '2026-06-10', pago: true }];
    const v = construirVencimentos(txs, [], hoje);
    expect(v).toHaveLength(0);
  });

  it('inclui contas a pagar abertas', () => {
    const cprs = [{ id: 'c1', descricao: 'Luz', valor: 250, tipo: 'pagar' as const, data_vencimento: '2026-06-15', pago: false }];
    const v = construirVencimentos([], cprs, hoje);
    expect(v).toHaveLength(1);
    expect(v[0].fonte).toBe('conta_pr');
  });

  it('exclui pendente muito distante (> 30 dias default)', () => {
    const txs = [{ id: 't1', descricao: 'Futuro', valor: 100, tipo: 'despesa', data: '2026-08-15', pago: false }];
    const v = construirVencimentos(txs, [], hoje);
    expect(v).toHaveLength(0);
  });

  it('inclui atrasados sempre (mesmo passado do limite)', () => {
    const txs = [{ id: 't1', descricao: 'Esquecida', valor: 100, tipo: 'despesa', data: '2026-04-01', pago: false }];
    const v = construirVencimentos(txs, [], hoje);
    expect(v).toHaveLength(1);
    expect(v[0].diasAteVencer).toBeLessThan(0);
  });

  it('ordena: atrasado primeiro, depois mais próximo', () => {
    const txs = [
      { id: 't1', descricao: 'Daqui 10d', valor: 100, tipo: 'despesa', data: '2026-06-12', pago: false },
      { id: 't2', descricao: 'Atrasada', valor: 100, tipo: 'despesa', data: '2026-05-25', pago: false },
      { id: 't3', descricao: 'Amanhã', valor: 100, tipo: 'despesa', data: '2026-06-03', pago: false },
    ];
    const v = construirVencimentos(txs, [], hoje);
    expect(v[0].descricao).toBe('Atrasada');
    expect(v[1].descricao).toBe('Amanhã');
    expect(v[2].descricao).toBe('Daqui 10d');
  });

  it('soma impacto líquido corretamente', () => {
    const v = construirVencimentos(
      [
        { id: 't1', descricao: 'A pagar', valor: 800, tipo: 'despesa', data: '2026-06-10', pago: false },
        { id: 't2', descricao: 'A receber', valor: 200, tipo: 'receita', data: '2026-06-15', pago: false },
      ],
      [
        { id: 'c1', descricao: 'Luz', valor: 100, tipo: 'pagar' as const, data_vencimento: '2026-06-08', pago: false },
      ],
      hoje
    );
    const impacto = calcularImpactoVencimentos(v);
    expect(impacto.totalAPagar).toBe(900);
    expect(impacto.totalAReceber).toBe(200);
    expect(impacto.impactoLiquido).toBe(-700);
  });
});
