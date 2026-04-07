import { normalizeDescription, generateHash, type ClassifiedTransaction, type SkippedLine, type CsvLineLogEntry } from './csv-parser';

interface PdfParseResult {
  transactions: ClassifiedTransaction[];
  skippedLines: SkippedLine[];
  totalLines: number;
  lineLogs: CsvLineLogEntry[];
  institution: string | null;
}

// Load PDF.js from CDN
let pdfjs: any = null;

async function loadPdfJs(): Promise<any> {
  if (pdfjs) return pdfjs;
  
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if ((window as any).pdfjsLib) {
      pdfjs = (window as any).pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(pdfjs);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      pdfjs = (window as any).pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(pdfjs);
    };
    script.onerror = () => reject(new Error('Falha ao carregar PDF.js'));
    document.head.appendChild(script);
  });
}

export async function extractPdfText(file: File): Promise<string[]> {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  
  try {
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];
    
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item: any) => item.str).join(' ');
      pages.push(text);
    }
    
    return pages;
  } catch (err: any) {
    if (err?.message?.includes('password')) {
      throw new Error('PDF_PASSWORD');
    }
    throw err;
  }
}

// Date patterns
const DATE_REGEX = /(\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{2}\/\d{2})/;
// Value patterns - matches Brazilian currency
const VALUE_REGEX = /R?\$?\s*-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d{1,3}(?:\.\d{3})*,\d{2}/;
// Parcela pattern
const PARCELA_REGEX = /\(?(\d{1,2})\/(\d{1,2})\)?/;

function parseDate(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    let year = parts[2];
    if (year.length === 2) {
      year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return dateStr;
}

function parseValue(valorStr: string): number | null {
  let clean = valorStr
    .replace(/R\$?/g, '')
    .replace(/\s/g, '')
    .trim();

  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }

  const val = parseFloat(clean);
  return isNaN(val) ? null : val;
}

function classifyTransaction(parcela_atual: number | null, parcela_total: number | null, valor: number) {
  if (valor < 0) return 'payment' as const;
  if (parcela_atual === 1 && parcela_total !== null && parcela_total > 1) return 'new_installment' as const;
  if (parcela_atual !== null && parcela_atual > 1 && parcela_total !== null) return 'ongoing_installment' as const;
  return 'simple' as const;
}

export function parsePdfText(pages: string[]): PdfParseResult {
  const fullText = pages.join('\n');
  const lines = fullText.split(/\n/).flatMap(line => {
    // Try to split by date patterns to handle concatenated lines
    const parts = line.split(/(?=\d{2}\/\d{2}\/\d{4})/);
    return parts.length > 1 ? parts : [line];
  });

  // Detect institution
  let institution: string | null = null;
  const textLower = fullText.toLowerCase();
  if (textLower.includes('sicredi')) institution = 'Sicredi';
  else if (textLower.includes('mercado pago') || textLower.includes('mercadopago')) institution = 'Mercado Pago';
  else if (textLower.includes('nubank')) institution = 'Nubank';
  else if (textLower.includes('inter') || textLower.includes('banco inter')) institution = 'Inter';

  const transactions: ClassifiedTransaction[] = [];
  const skippedLines: SkippedLine[] = [];
  const lineLogs: CsvLineLogEntry[] = [];
  const hashCounts = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNumber = i + 1;

    if (!line || line.length < 10) {
      lineLogs.push({ lineNumber, content: line, status: 'ignorada', reason: 'Linha muito curta' });
      continue;
    }

    // Try to find a date
    const dateMatch = line.match(DATE_REGEX);
    if (!dateMatch) {
      lineLogs.push({ lineNumber, content: line, status: 'ignorada', reason: 'Sem data reconhecida' });
      continue;
    }

    // Try to find a value
    const valueMatch = line.match(VALUE_REGEX);
    if (!valueMatch) {
      lineLogs.push({ lineNumber, content: line, status: 'ignorada', reason: 'Sem valor monetário' });
      continue;
    }

    const isoDate = parseDate(dateMatch[1]);
    const valor = parseValue(valueMatch[0]);

    if (valor === null || valor === 0) {
      lineLogs.push({ lineNumber, content: line, status: 'rejeitada', reason: 'Valor inválido' });
      continue;
    }

    // Extract description: text between date and value
    const dateEnd = line.indexOf(dateMatch[0]) + dateMatch[0].length;
    const valueStart = line.indexOf(valueMatch[0]);
    let descricao = line.substring(dateEnd, valueStart).trim();

    // Clean up description
    descricao = descricao.replace(/^\s*[-–]\s*/, '').replace(/\s+/g, ' ').trim();

    if (!descricao || descricao.length < 2) {
      lineLogs.push({ lineNumber, content: line, status: 'rejeitada', reason: 'Descrição vazia' });
      continue;
    }

    // Check for parcela
    const parcelaMatch = descricao.match(PARCELA_REGEX);
    let parcela_atual: number | null = null;
    let parcela_total: number | null = null;
    if (parcelaMatch) {
      parcela_atual = parseInt(parcelaMatch[1]);
      parcela_total = parseInt(parcelaMatch[2]);
      // Remove parcela from description
      descricao = descricao.replace(PARCELA_REGEX, '').trim();
    }

    const rawValor = valor;
    const tipo = valor < 0 ? 'receita' as const : 'despesa' as const;
    const absValor = Math.abs(valor);
    const pessoa = 'Djeisson Mauss';

    const baseHash = generateHash(isoDate, descricao, absValor, pessoa);
    const count = hashCounts.get(baseHash) || 0;
    hashCounts.set(baseHash, count + 1);
    const hash_transacao = count > 0 ? `${baseHash}_seq${count}` : baseHash;

    const classification = classifyTransaction(parcela_atual, parcela_total, rawValor);

    transactions.push({
      data: isoDate,
      descricao,
      descricao_normalizada: normalizeDescription(descricao),
      valor: absValor,
      tipo,
      parcela_atual,
      parcela_total,
      pessoa,
      hash_transacao,
      codigo_cartao: null,
      valor_dolar: null,
      classification,
      source_line_number: lineNumber,
      source_line_content: line,
    });

    lineLogs.push({
      lineNumber,
      content: line,
      status: 'importada',
      reason: 'Transação extraída do PDF',
      hash_transacao,
    });
  }

  return {
    transactions,
    skippedLines,
    totalLines: lines.length,
    lineLogs,
    institution,
  };
}
