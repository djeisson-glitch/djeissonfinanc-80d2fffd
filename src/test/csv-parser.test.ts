import { describe, expect, it } from 'vitest';
import { parseSicrediCSV } from '@/lib/csv-parser';

describe('parseSicrediCSV', () => {
  it('importa devolução como receita com valor 718.80', () => {
    const csv = [
      'Relatório Sicredi',
      'Data;Descrição;Parcela;Valor;Extra;Codigo;Pessoa;Obs',
      '05/01/2026;Devolucao de Compras Nacionais;;-R$ 718,80;;912;Djeisson Mauss;',
    ].join('\n');

    const result = parseSicrediCSV(csv);

    expect(result.totalLines).toBe(3);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      data: '2026-01-05',
      descricao: 'Devolucao de Compras Nacionais',
      valor: 718.8,
      tipo: 'receita',
      pessoa: 'Djeisson Mauss',
      source_line_number: 3,
    });
    expect(result.skippedLines).toHaveLength(0);
  });

  it('gera hashes únicos para linhas idênticas no mesmo CSV', () => {
    const line = '05/01/2026;Devolucao de Compras Nacionais;;-R$ 718,80;;912;Djeisson Mauss;';
    const csv = [
      'Relatório Sicredi',
      'Data;Descrição;Parcela;Valor;Extra;Codigo;Pessoa;Obs',
      line,
      line,
    ].join('\n');

    const result = parseSicrediCSV(csv);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].hash_transacao).not.toBe(result.transactions[1].hash_transacao);
    expect(result.transactions[1].hash_transacao).toContain('_seq1');
  });
});
