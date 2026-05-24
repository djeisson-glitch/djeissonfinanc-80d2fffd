import { describe, it, expect } from 'vitest';
import { parseParcelaField, parseParcelaFromDesc } from '@/lib/csv-parser';

describe('parseParcelaField (coluna dedicada)', () => {
  it('aceita com e sem parênteses e com espaços', () => {
    expect(parseParcelaField('(01/12)')).toEqual({ atual: 1, total: 12 });
    expect(parseParcelaField('01/12')).toEqual({ atual: 1, total: 12 });
    expect(parseParcelaField('1 / 12')).toEqual({ atual: 1, total: 12 });
    expect(parseParcelaField('03/03')).toEqual({ atual: 3, total: 3 });
  });

  it('ignora vazio e parcela inválida', () => {
    expect(parseParcelaField('')).toBeNull();
    expect(parseParcelaField(null)).toBeNull();
    expect(parseParcelaField('1/1')).toBeNull(); // não é parcelamento
    expect(parseParcelaField('5/3')).toBeNull(); // atual > total
  });

  it('não confunde data com parcela (total absurdo)', () => {
    expect(parseParcelaField('12/2025')).toBeNull(); // total 2025 > 99
  });
});

describe('parseParcelaFromDesc (descrição livre)', () => {
  it('detecta (03/10), Parcela 3/10, 3 de 10', () => {
    expect(parseParcelaFromDesc('LOJA X (03/10)')).toEqual({ atual: 3, total: 10 });
    expect(parseParcelaFromDesc('Compra Y - Parcela 3/10')).toEqual({ atual: 3, total: 10 });
    expect(parseParcelaFromDesc('Notebook 2 de 12')).toEqual({ atual: 2, total: 12 });
  });

  it('NÃO detecta N/M solto sem contexto (evita falso positivo de data)', () => {
    expect(parseParcelaFromDesc('PAGAMENTO 03/2025')).toBeNull();
    expect(parseParcelaFromDesc('UBER 12/10')).toBeNull(); // sem palavra/parênteses
  });

  it('descrição sem parcela retorna null', () => {
    expect(parseParcelaFromDesc('SUPERMERCADO XYZ')).toBeNull();
    expect(parseParcelaFromDesc('')).toBeNull();
  });
});
