export interface ParsedTransaction {
  data: string;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  parcela_atual: number | null;
  parcela_total: number | null;
  pessoa: string;
  hash_transacao: string;
  source_line_number?: number;
  source_line_content?: string;
}

export interface SkippedLine {
  lineNumber: number;
  content: string;
  reason: string;
}

export interface CsvLineLogEntry {
  lineNumber: number;
  content: string;
  status: 'importada' | 'rejeitada' | 'duplicata' | 'ignorada';
  reason?: string;
  hash_transacao?: string;
}

interface ParseResult {
  contaDetectada: string | null;
  transactions: ParsedTransaction[];
  skippedLines: SkippedLine[];
  totalLines: number;
  lineLogs: CsvLineLogEntry[];
}

export function generateHash(data: string, descricao: string, valor: number, pessoa: string): string {
  const str = `${data}|${descricao}|${valor}|${pessoa}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function parseDate(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return dateStr;
}

export function parseSicrediCSV(csvText: string): ParseResult {
  const normalizedText = csvText.replace(/^\uFEFF/, '');
  const lines = normalizedText.split(/\r?\n/);

  let contaDetectada: string | null = null;
  const headerLines = lines.slice(0, 10).join(' ');

  if (headerLines.includes('Mastercard Black') || headerLines.includes('Black')) {
    contaDetectada = 'Black';
  } else if (headerLines.includes('Mercado Pago')) {
    contaDetectada = 'Mercado Pago';
  } else if (headerLines.includes('Conta Corrente')) {
    contaDetectada = 'Sicredi Principal';
  }

  const headerIndex = lines.findIndex((l) =>
    l.toLowerCase().includes('data') && l.toLowerCase().includes('descri')
  );

  const skippedLines: SkippedLine[] = [];
  const transactions: ParsedTransaction[] = [];
  const lineLogs: CsvLineLogEntry[] = [];
  const hashCounts = new Map<string, number>();

  if (headerIndex === -1) {
    return {
      contaDetectada,
      transactions: [],
      skippedLines: [{ lineNumber: 0, content: '', reason: 'Cabeçalho não encontrado no arquivo' }],
      totalLines: lines.length,
      lineLogs: [{ lineNumber: 0, content: '', status: 'rejeitada', reason: 'Cabeçalho não encontrado no arquivo' }],
    };
  }

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    const content = line.replace(/\r$/, '');
    const trimmed = content.trim();

    if (!trimmed) {
      lineLogs.push({ lineNumber, content, status: 'ignorada', reason: 'Linha vazia' });
      return;
    }

    if (idx < headerIndex) {
      lineLogs.push({ lineNumber, content, status: 'ignorada', reason: 'Metadados do arquivo' });
      return;
    }

    if (idx === headerIndex) {
      lineLogs.push({ lineNumber, content, status: 'ignorada', reason: 'Cabeçalho do CSV' });
      return;
    }

    if (trimmed.toLowerCase().includes('total')) {
      lineLogs.push({ lineNumber, content, status: 'ignorada', reason: 'Linha de total (ignorada)' });
      return;
    }

    const parts = trimmed.split(';').map((p) => p.trim());
    if (parts.length < 3) {
      const reason = `Poucos campos (${parts.length} encontrados, mínimo 3)`;
      skippedLines.push({ lineNumber, content: trimmed, reason });
      lineLogs.push({ lineNumber, content, status: 'rejeitada', reason });
      return;
    }

    const [data, descricao] = parts;
    let valorStr = '';
    let parcela = '';

    if (parts.length >= 4) {
      parcela = parts[2];
      valorStr = parts[3];
    } else {
      valorStr = parts[2];
    }

    const pessoa = parts.length >= 7 ? (parts[6] || 'Djeisson Mauss') : 'Djeisson Mauss';

    if (!data || !descricao) {
      const reason = 'Data ou descrição vazia';
      skippedLines.push({ lineNumber, content: trimmed, reason });
      lineLogs.push({ lineNumber, content, status: 'rejeitada', reason });
      return;
    }

    // No date filter — credit card CSVs may have 2025 dates for installments due in 2026

    let cleanVal = valorStr.replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim();
    let valor = parseFloat(cleanVal);

    if (isNaN(valor) || !valorStr) {
      for (let pi = 2; pi < parts.length; pi++) {
        const candidate = parts[pi].replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim();
        const parsed = parseFloat(candidate);
        if (!isNaN(parsed) && parsed !== 0) {
          valor = parsed;
          break;
        }
      }
    }

    if (isNaN(valor)) {
      const reason = 'Valor não encontrado ou inválido';
      skippedLines.push({ lineNumber, content: trimmed, reason });
      lineLogs.push({ lineNumber, content, status: 'rejeitada', reason });
      return;
    }

    const parcelaMatch = parcela?.match(/\((\d+)\/(\d+)\)/);
    const parcela_atual = parcelaMatch ? parseInt(parcelaMatch[1]) : null;
    const parcela_total = parcelaMatch ? parseInt(parcelaMatch[2]) : null;
    const tipo = valor < 0 ? 'receita' as const : 'despesa' as const;
    const isoDate = parseDate(data);
    const finalPessoa = pessoa || 'Djeisson Mauss';

    const baseHash = generateHash(isoDate, descricao, Math.abs(valor), finalPessoa);
    const count = hashCounts.get(baseHash) || 0;
    hashCounts.set(baseHash, count + 1);
    const hash_transacao = count > 0 ? `${baseHash}_seq${count}` : baseHash;

    transactions.push({
      data: isoDate,
      descricao,
      valor: Math.abs(valor),
      tipo,
      parcela_atual,
      parcela_total,
      pessoa: finalPessoa,
      hash_transacao,
      source_line_number: lineNumber,
      source_line_content: content,
    });

    lineLogs.push({
      lineNumber,
      content,
      status: 'importada',
      reason: 'Linha convertida em transação',
      hash_transacao,
    });
  });

  return {
    contaDetectada,
    transactions,
    skippedLines,
    totalLines: lines.length,
    lineLogs,
  };
}

export function generateFutureInstallments(
  transaction: ParsedTransaction,
  grupo_parcela: string,
  dataCompetenciaBase?: string
): (ParsedTransaction & { _data_original?: string })[] {
  if (!transaction.parcela_atual || !transaction.parcela_total) return [];

  const remaining = transaction.parcela_total - transaction.parcela_atual;
  const future: (ParsedTransaction & { _data_original?: string })[] = [];

  for (let i = 1; i <= remaining; i++) {
    const date = new Date(transaction.data);
    date.setMonth(date.getMonth() + i);
    const isoDate = date.toISOString().split('T')[0];
    const nextParcela = transaction.parcela_atual + i;

    // Project data_competencia (data_original) forward by same offset
    let projectedCompetencia: string | undefined;
    if (dataCompetenciaBase) {
      const compDate = new Date(dataCompetenciaBase + 'T00:00:00');
      compDate.setMonth(compDate.getMonth() + i);
      projectedCompetencia = compDate.toISOString().split('T')[0];
    }

    future.push({
      data: isoDate,
      descricao: `${transaction.descricao} (auto-projetada)`,
      valor: transaction.valor,
      tipo: transaction.tipo,
      parcela_atual: nextParcela,
      parcela_total: transaction.parcela_total,
      pessoa: transaction.pessoa,
      hash_transacao: generateHash(isoDate, transaction.descricao, transaction.valor, transaction.pessoa) + `_p${nextParcela}`,
      source_line_number: transaction.source_line_number,
      source_line_content: transaction.source_line_content,
      _data_original: projectedCompetencia,
    });
  }

  return future;
}
