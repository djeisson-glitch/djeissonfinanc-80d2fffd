export interface ParsedTransaction {
  data: string;
  descricao: string;
  descricao_normalizada: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  parcela_atual: number | null;
  parcela_total: number | null;
  pessoa: string;
  hash_transacao: string;
  codigo_cartao: string | null;
  valor_dolar: number | null;
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

export type TransactionClassification =
  | 'simple'           // Tipo 3: sem parcela
  | 'new_installment'  // Tipo 1: parcela 01/X
  | 'ongoing_installment' // Tipo 2: parcela N/X (N>1)
  | 'payment'          // Tipo 4: pagamento de fatura (pag fat)
  | 'refund';          // Tipo 5: devolução/estorno (valor negativo que não é pagamento)

export interface ClassifiedTransaction extends ParsedTransaction {
  classification: TransactionClassification;
}

interface ParseResult {
  contaDetectada: string | null;
  transactions: ClassifiedTransaction[];
  skippedLines: SkippedLine[];
  totalLines: number;
  lineLogs: CsvLineLogEntry[];
  /** Auto-detected due date from CSV header (e.g. "Data de Vencimento ;15/03/2026") */
  detectedDueDate: { month: number; year: number } | null;
}

/**
 * Normalizes a description for deduplication:
 * - Remove multiple spaces
 * - Uppercase
 * - Remove city/state suffixes (e.g. "PASSO FUNDO   BRA")
 * - Remove special characters except letters and numbers
 * - Truncate at 40 characters
 */
export function normalizeDescription(desc: string): string {
  let normalized = desc
    .toUpperCase()
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Remove trailing city/state patterns like "PASSO FUNDO BR", "SAO PAULO BRA"
  normalized = normalized.replace(/\s+[A-Z]{2,3}\s*$/, '');
  // Remove trailing location patterns like "PASSO FUNDO" after main description
  normalized = normalized.replace(/\s{2,}[A-Z\s]+$/, '');

  // Keep only letters, numbers, spaces
  normalized = normalized.replace(/[^A-Z0-9 ]/g, '');

  // Collapse spaces again after removal
  normalized = normalized.replace(/\s{2,}/g, ' ').trim();

  // Truncate at 40 chars
  return normalized.substring(0, 40);
}

export function generateHash(
  data: string,
  descricao: string,
  valor: number,
  pessoa: string,
  parcela_atual?: number | null,
  parcela_total?: number | null
): string {
  let str = `${data}|${descricao}|${valor}|${pessoa}`;
  // Include parcela info when available to avoid collisions between different
  // installment months of the same purchase (e.g., parcela 1/6 vs 2/6)
  if (parcela_atual != null && parcela_total != null) {
    str += `|${parcela_atual}/${parcela_total}`;
  }
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

function parseValue(valorStr: string): number | null {
  // Handle quoted values like "R$ 22,90" or "R$ -7.038,96"
  let clean = valorStr
    .replace(/"/g, '')
    .replace('R$', '')
    .replace(/\s/g, '')
    .trim();

  // Brazilian number format: 7.038,96 → 7038.96
  // If has both . and , → dots are thousands, comma is decimal
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }

  const val = parseFloat(clean);
  return isNaN(val) ? null : val;
}

function classifyTransaction(parcela_atual: number | null, parcela_total: number | null, valor: number, descricao: string): TransactionClassification {
  if (valor < 0) {
    const desc = descricao.toLowerCase();
    // "Pag Fat" = pagamento de fatura anterior → excluir
    if (desc.includes('pag fat') || desc.includes('pagamento fatura')) {
      return 'payment';
    }
    // Devoluções, estornos e outros créditos → importar como receita
    return 'refund';
  }

  // Tipo 1: New installment (01/X where X > 1)
  if (parcela_atual === 1 && parcela_total !== null && parcela_total > 1) return 'new_installment';

  // Tipo 2: Ongoing installment (N/X where N > 1)
  if (parcela_atual !== null && parcela_atual > 1 && parcela_total !== null) return 'ongoing_installment';

  // Tipo 3: Simple transaction
  return 'simple';
}

export function parseSicrediCSV(csvText: string, defaultPessoa: string = 'Titular'): ParseResult {
  const normalizedText = csvText.replace(/^\uFEFF/, '');
  const lines = normalizedText.split(/\r?\n/);

  let contaDetectada: string | null = null;
  let detectedDueDate: { month: number; year: number } | null = null;
  const headerLines = lines.slice(0, 10).join(' ');

  if (headerLines.includes('Mastercard Black') || headerLines.includes('Black')) {
    contaDetectada = 'Black';
  } else if (headerLines.includes('Mercado Pago')) {
    contaDetectada = 'Mercado Pago';
  } else if (headerLines.includes('Conta Corrente')) {
    contaDetectada = 'Sicredi Principal';
  }

  // Try to detect due date and fatura total from header
  let headerFaturaTotal: number | null = null;
  for (const line of lines.slice(0, 20)) {
    const dueDateMatch = line.match(/[Vv]encimento\s*;?\s*(\d{2})\/(\d{2})\/(\d{4})/);
    if (dueDateMatch) {
      detectedDueDate = {
        month: parseInt(dueDateMatch[2]) - 1, // 0-indexed
        year: parseInt(dueDateMatch[3]),
      };
    }
    // Detect total fatura from header: " (=) Total desta fatura (R$) ;"R$ 6.442,76""
    const totalMatch = line.match(/[Tt]otal\s+desta\s+fatura.*?"?R\$\s*([\d.,\-]+)"?/);
    if (totalMatch) {
      const val = parseValue(totalMatch[1]);
      if (val !== null && val > 0) {
        headerFaturaTotal = val;
      }
    }
  }

  const headerIndex = lines.findIndex((l) =>
    l.toLowerCase().includes('data') && l.toLowerCase().includes('descri')
  );

  const skippedLines: SkippedLine[] = [];
  const transactions: ClassifiedTransaction[] = [];
  const lineLogs: CsvLineLogEntry[] = [];
  const hashCounts = new Map<string, number>();

  if (headerIndex === -1) {
    return {
      contaDetectada,
      detectedDueDate,
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

    // CSV columns: Data ; Descrição ; Parcela ; Valor ; Valor em Dólar ; Adicional ; Nome
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

    // Extract additional fields
    const valorDolarStr = parts.length >= 5 ? parts[4] : '';
    const codigoCartao = parts.length >= 6 ? (parts[5] || null) : null;
    const pessoa = parts.length >= 7 ? (parts[6] || defaultPessoa) : defaultPessoa;

    if (!data || !descricao) {
      const reason = 'Data ou descrição vazia';
      skippedLines.push({ lineNumber, content: trimmed, reason });
      lineLogs.push({ lineNumber, content, status: 'rejeitada', reason });
      return;
    }

    // Parse value
    let valor = parseValue(valorStr);
    if (valor === null) {
      // Try other columns
      for (let pi = 2; pi < parts.length; pi++) {
        const parsed = parseValue(parts[pi]);
        if (parsed !== null && parsed !== 0) {
          valor = parsed;
          break;
        }
      }
    }

    if (valor === null) {
      const reason = 'Valor não encontrado ou inválido';
      skippedLines.push({ lineNumber, content: trimmed, reason });
      lineLogs.push({ lineNumber, content, status: 'rejeitada', reason });
      return;
    }

    // Parse parcela field: (01/12), (02/03), etc
    const parcelaMatch = parcela?.match(/\((\d+)\/(\d+)\)/);
    const parcela_atual = parcelaMatch ? parseInt(parcelaMatch[1]) : null;
    const parcela_total = parcelaMatch ? parseInt(parcelaMatch[2]) : null;

    const rawValor = valor;
    const tipo = valor < 0 ? 'receita' as const : 'despesa' as const;
    const absValor = Math.abs(valor);
    const isoDate = parseDate(data);
    const finalPessoa = pessoa || defaultPessoa;

    // Parse valor em dólar
    let valorDolar: number | null = null;
    if (valorDolarStr) {
      valorDolar = parseValue(valorDolarStr);
    }

    const baseHash = generateHash(isoDate, descricao, absValor, finalPessoa, parcela_atual, parcela_total);
    const count = hashCounts.get(baseHash) || 0;
    hashCounts.set(baseHash, count + 1);
    const hash_transacao = count > 0 ? `${baseHash}_seq${count}` : baseHash;

    const classification = classifyTransaction(parcela_atual, parcela_total, rawValor, descricao);

    transactions.push({
      data: isoDate,
      descricao,
      descricao_normalizada: normalizeDescription(descricao),
      valor: absValor,
      tipo,
      parcela_atual,
      parcela_total,
      pessoa: finalPessoa,
      hash_transacao,
      codigo_cartao: codigoCartao || null,
      valor_dolar: valorDolar,
      classification,
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

  // If the CSV header declares a fatura total, compare against sum of parsed lines.
  // If there's a positive difference (e.g., encargos/fees not listed as individual lines),
  // inject a synthetic "Encargos da Fatura" transaction to reconcile.
  if (headerFaturaTotal !== null && headerFaturaTotal > 0 && detectedDueDate) {
    const sumDespesas = transactions.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
    const sumReceitas = transactions
      .filter(t => t.tipo === 'receita' && !t.descricao.toLowerCase().includes('pag fat'))
      .reduce((s, t) => s + t.valor, 0);
    const linesFatura = sumDespesas - sumReceitas;
    const missing = headerFaturaTotal - linesFatura;

    if (missing > 0.01) {
      const dueDate = `${detectedDueDate.year}-${String(detectedDueDate.month + 1).padStart(2, '0')}-01`;
      const desc = 'Encargos da Fatura';
      const hash = generateHash(dueDate, desc, parseFloat(missing.toFixed(2)), defaultPessoa);

      transactions.push({
        data: dueDate,
        descricao: desc,
        descricao_normalizada: normalizeDescription(desc),
        valor: parseFloat(missing.toFixed(2)),
        tipo: 'despesa',
        parcela_atual: null,
        parcela_total: null,
        pessoa: defaultPessoa,
        hash_transacao: hash,
        codigo_cartao: null,
        valor_dolar: null,
        classification: 'simple',
      });

      lineLogs.push({
        lineNumber: 0,
        content: `Diferença cabeçalho vs linhas: R$ ${missing.toFixed(2)} (fatura header: R$ ${headerFaturaTotal.toFixed(2)}, soma linhas: R$ ${linesFatura.toFixed(2)})`,
        status: 'importada',
        reason: 'Encargos/taxas não listados como transações individuais no CSV',
        hash_transacao: hash,
      });
    }
  }

  return {
    contaDetectada,
    detectedDueDate,
    transactions,
    skippedLines,
    totalLines: lines.length,
    lineLogs,
  };
}
