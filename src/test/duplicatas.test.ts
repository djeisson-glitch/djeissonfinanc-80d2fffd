import { describe, it, expect } from 'vitest';
import { detectarDuplicatas } from '@/lib/duplicatas';

describe('detectarDuplicatas', () => {
  it('detecta duplicata por hash igual', () => {
    const txs = [
      { id: '1', descricao: 'X', valor: 100, data: '2026-06-01', hash_transacao: 'h1' },
      { id: '2', descricao: 'X', valor: 100, data: '2026-06-02', hash_transacao: 'h1' },
    ];
    const grupos = detectarDuplicatas(txs);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].txIds).toEqual(['1', '2']);
  });

  it('detecta duplicata por descrição + valor + MESMA DATA', () => {
    const txs = [
      { id: '1', descricao: 'Mercado X', descricao_normalizada: 'MERCADO X', valor: 50, data: '2026-06-05', hash_transacao: null },
      { id: '2', descricao: 'Mercado X', descricao_normalizada: 'MERCADO X', valor: 50, data: '2026-06-05', hash_transacao: null },
    ];
    const grupos = detectarDuplicatas(txs);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].txIds.length).toBe(2);
  });

  it('NÃO marca 2 compras iguais no mesmo MÊS mas dias diferentes (2 cafés)', () => {
    const txs = [
      { id: '1', descricao: 'CAFE X', descricao_normalizada: 'CAFE X', valor: 50, data: '2026-06-03', hash_transacao: null },
      { id: '2', descricao: 'CAFE X', descricao_normalizada: 'CAFE X', valor: 50, data: '2026-06-20', hash_transacao: null },
    ];
    const grupos = detectarDuplicatas(txs);
    expect(grupos).toHaveLength(0); // datas diferentes — compras legítimas
  });

  it('NÃO marca parcelas legítimas (parcela_total > 1) mesmo na mesma data', () => {
    const txs = [
      { id: '1', descricao: 'PARC', descricao_normalizada: 'PARC', valor: 100, data: '2026-06-15', parcela_total: 12 },
      { id: '2', descricao: 'PARC', descricao_normalizada: 'PARC', valor: 100, data: '2026-06-15', parcela_total: 12 },
    ];
    const grupos = detectarDuplicatas(txs);
    expect(grupos).toHaveLength(0); // parcelamentos compartilham desc+valor por definição
  });

  it('NÃO marca lançamento único', () => {
    const txs = [
      { id: '1', descricao: 'Único', valor: 100, data: '2026-06-01', hash_transacao: 'h1' },
    ];
    expect(detectarDuplicatas(txs)).toHaveLength(0);
  });

  it('agrupa 3 txs iguais (mesma data) num grupo só, não 3 grupos', () => {
    const txs = [
      { id: '1', descricao: 'X', descricao_normalizada: 'X', valor: 50, data: '2026-06-05' },
      { id: '2', descricao: 'X', descricao_normalizada: 'X', valor: 50, data: '2026-06-05' },
      { id: '3', descricao: 'X', descricao_normalizada: 'X', valor: 50, data: '2026-06-05' },
    ];
    const grupos = detectarDuplicatas(txs);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].txIds.length).toBe(3);
  });
});
