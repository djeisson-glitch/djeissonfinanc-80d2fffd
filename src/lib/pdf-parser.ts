import { normalizeDescription, generateHash, type ClassifiedTransaction, type SkippedLine, type CsvLineLogEntry } from './csv-parser';

interface PdfParseResult {
  transactions: ClassifiedTransaction[];
  skippedLines: SkippedLine[];
  totalLines: number;
  lineLogs: CsvLineLogEntry[];
  institution: string | null;
  /** Total from PDF header for verification */
  headerTotal?: number;
  /** Due date detected from header */
  detectedDueDate?: { month: number; year: number };
}

// Load PDF.js from CDN
let pdfjs: any = null;

async function loadPdfJs(): Promise<any> {
  if (pdfjs) return pdfjs;

  return new Promise((resolve, reject) => {
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

// ── Mercado Pago garbled font decoder ──────────────────────────
const MP_CHAR_MAP: Record<string, string> = {
  '+': '3', '%': '9', 'M': '4', ')': '7', '9': '8', '3': '5', 'J': '.',
  '$': 'R', '4': '$', 'z': 'M', 'í': 'C', 'ó': 'A', 'F': 'I', '5': 'F',
  'N': 'U', 'Y': 'B', 'G': 'Z', 'Z': 'Y', '8': 'J', 'U': '*', 'ê': 'b',
  'ô': 'x', '*': 'õ', 'Q': '"', 'à': 'G',
};

function decodeMpText(text: string): string {
  return text.split('').map(ch => MP_CHAR_MAP[ch] ?? ch).join('');
}

function detectGarbledFonts(items: any[]): Set<string> {
  const garbledFonts = new Set<string>();
  for (const item of items) {
    if (item.str && item.str.includes('$4') && item.fontName) {
      garbledFonts.add(item.fontName);
    }
  }
  return garbledFonts;
}

// ── Structured extraction ──────────────────────────────────────

interface PdfTextBlock {
  items: Array<{ str: string; fontName: string; x: number; y: number }>;
}

function groupItemsIntoRows(items: any[]): PdfTextBlock[] {
  if (!items.length) return [];

  const sorted = [...items]
    .filter((it: any) => it.str && it.str.trim())
    .map((it: any) => ({
      str: it.str,
      fontName: it.fontName || '',
      x: it.transform?.[4] ?? 0,
      y: it.transform?.[5] ?? 0,
    }));

  sorted.sort((a, b) => {
    const dy = b.y - a.y;
    if (Math.abs(dy) > 3) return dy;
    return a.x - b.x;
  });

  const rows: PdfTextBlock[] = [];
  let currentRow: PdfTextBlock = { items: [] };
  let lastY = sorted[0]?.y ?? 0;

  for (const item of sorted) {
    if (Math.abs(item.y - lastY) > 3) {
      if (currentRow.items.length) rows.push(currentRow);
      currentRow = { items: [] };
      lastY = item.y;
    }
    currentRow.items.push(item);
  }
  if (currentRow.items.length) rows.push(currentRow);

  return rows;
}

function getRowText(row: PdfTextBlock, garbledFonts: Set<string>): string {
  return row.items
    .map(it => garbledFonts.has(it.fontName) ? decodeMpText(it.str) : it.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getRowSegments(row: PdfTextBlock, garbledFonts: Set<string>): string[] {
  return row.items
    .map(it => (garbledFonts.has(it.fontName) ? decodeMpText(it.str) : it.str).trim())
    .filter(s => s.length > 0);
}

// ── Extraction ─────────────────────────────────────────────────

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

export async function extractPdfStructured(file: File): Promise<{
  pages: Array<{ rows: PdfTextBlock[]; garbledFonts: Set<string> }>;
  isMercadoPago: boolean;
}> {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let isMercadoPago = false;
  const pages: Array<{ rows: PdfTextBlock[]; garbledFonts: Set<string> }> = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const garbledFonts = detectGarbledFonts(content.items);
    const rows = groupItemsIntoRows(content.items);

    const fullText = content.items.map((it: any) => it.str).join(' ').toLowerCase();
    if (fullText.includes('mercado pago') || fullText.includes('mercadopago') || garbledFonts.size > 0) {
      isMercadoPago = true;
    }

    pages.push({ rows, garbledFonts });
  }

  return { pages, isMercadoPago };
}

// ── Value/date parsing ─────────────────────────────────────────

const VALUE_REGEX = /R\$\s*-?\d{1,3}(?:\.\d{3})*,\d{2}/;
const MP_PARCELA_REGEX = /^Parcela\s+(\d+)\s+de\s+(\d+)$/;
const DATE_DD_MM = /^(\d{2})\/(\d{2})$/;
const DATE_DD_MM_YYYY = /(\d{2})\/(\d{2})\/(\d{4})/;

function parseDate(dateStr: string, defaultYear?: number): string {
  const full = dateStr.match(DATE_DD_MM_YYYY);
  if (full) {
    return `${full[3]}-${full[2].padStart(2, '0')}-${full[1].padStart(2, '0')}`;
  }
  const short = dateStr.match(DATE_DD_MM);
  if (short && defaultYear) {
    return `${defaultYear}-${short[2].padStart(2, '0')}-${short[1].padStart(2, '0')}`;
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

// ── Mercado Pago parser ────────────────────────────────────────

function parseMercadoPago(
  pages: Array<{ rows: PdfTextBlock[]; garbledFonts: Set<string> }>
): PdfParseResult {
  const transactions: ClassifiedTransaction[] = [];
  const skippedLines: SkippedLine[] = [];
  const lineLogs: CsvLineLogEntry[] = [];
  const hashCounts = new Map<string, number>();

  let section: 'mov' | 'card' | null = null;
  let stopParsing = false;
  let lineNumber = 0;
  let dueYear = new Date().getFullYear();
  let headerTotal: number | undefined;
  let detectedDueDate: { month: number; year: number } | undefined;

  // First pass: find vencimento year and header total from page 1
  if (pages.length > 0) {
    const { rows, garbledFonts } = pages[0];
    for (const row of rows) {
      const text = getRowText(row, garbledFonts);
      const vencMatch = text.match(/Vencimento[:\s]*(\d{2})\/(\d{2})\/(\d{4})/i)
        || text.match(/Vence\s+em\s*(\d{2})\/(\d{2})\/(\d{4})/i);
      if (vencMatch) {
        dueYear = parseInt(vencMatch[3]);
        detectedDueDate = { month: parseInt(vencMatch[2]) - 1, year: dueYear };
      }
      const totalMatch = text.match(/Total\s+a\s+pagar.*?R\$\s*([\d.,]+)/i);
      if (totalMatch) {
        headerTotal = parseValue('R$ ' + totalMatch[1]) ?? undefined;
      }
    }
  }

  // Second pass: parse transactions
  for (const { rows, garbledFonts } of pages) {
    if (stopParsing) break;

    for (const row of rows) {
      if (stopParsing) break;
      lineNumber++;

      const text = getRowText(row, garbledFonts);
      const segments = getRowSegments(row, garbledFonts);

      // Stop at non-transaction sections
      if (/Parcele a fatura|Seus parcelamentos|Limite do cartão|Datas importantes|Opções de pagamento|Lançamentos futuros/i.test(text)) {
        stopParsing = true;
        break;
      }

      // Section detection
      if (/Movimentações na fatura/i.test(text)) {
        section = 'mov';
        lineLogs.push({ lineNumber, content: text, status: 'ignorada', reason: 'Cabeçalho de seção' });
        continue;
      }
      if (/Cartão Visa/i.test(text)) {
        section = 'card';
        lineLogs.push({ lineNumber, content: text, status: 'ignorada', reason: 'Cabeçalho de seção' });
        continue;
      }
      if (!section) continue;

      // Skip header/total rows
      if (/^(Data|Movimentações|Valor em R\$|Total|Detalhes de consumo)$/i.test(text)) continue;
      if (text.startsWith('Total')) {
        lineLogs.push({ lineNumber, content: text, status: 'ignorada', reason: 'Linha de total' });
        continue;
      }

      // Parse row: look for date, description, optional parcela, value
      const dateMatch = segments[0]?.match(DATE_DD_MM);
      if (!dateMatch) {
        lineLogs.push({ lineNumber, content: text, status: 'ignorada', reason: 'Sem data DD/MM' });
        continue;
      }

      const dateStr = segments[0];
      let descricao: string | null = null;
      let parcela_atual: number | null = null;
      let parcela_total: number | null = null;
      let valor: number | null = null;

      for (let si = 1; si < segments.length; si++) {
        const seg = segments[si];

        const valMatch = seg.match(VALUE_REGEX);
        if (valMatch) {
          valor = parseValue(valMatch[0]);
          continue;
        }

        const parcMatch = seg.match(MP_PARCELA_REGEX);
        if (parcMatch) {
          parcela_atual = parseInt(parcMatch[1]);
          parcela_total = parseInt(parcMatch[2]);
          continue;
        }

        if (!descricao && seg.length >= 2 && !/^\d+[.,]\d+$/.test(seg)) {
          descricao = seg;
        }
      }

      if (!descricao || valor === null) {
        lineLogs.push({ lineNumber, content: text, status: 'rejeitada', reason: 'Sem descrição ou valor' });
        continue;
      }

      const isCredit = section === 'mov' && /cr[eé]dito|pagamento da fatura/i.test(descricao);
      const rawValor = isCredit ? -valor : valor;
      const tipo = isCredit ? 'receita' as const : 'despesa' as const;
      const absValor = Math.abs(valor);

      const isoDate = parseDate(dateStr, dueYear);
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
        source_line_content: text,
      });

      lineLogs.push({
        lineNumber,
        content: text,
        status: 'importada',
        reason: `${section === 'mov' ? 'Movimentação' : 'Compra cartão'}: ${tipo}`,
        hash_transacao,
      });
    }
  }

  return {
    transactions,
    skippedLines,
    totalLines: lineNumber,
    lineLogs,
    institution: 'Mercado Pago',
    headerTotal,
    detectedDueDate,
  };
}

// ── Generic PDF parser (existing logic, improved) ──────────────

const GENERIC_DATE_REGEX = /(\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{2}\/\d{2})/;
const GENERIC_VALUE_REGEX = /R?\$?\s*-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d{1,3}(?:\.\d{3})*,\d{2}/;
const GENERIC_PARCELA_REGEX = /\(?(\d{1,2})\/(\d{1,2})\)?/;

function parseGenericPdf(pages: string[]): PdfParseResult {
  const fullText = pages.join('\n');
  const lines = fullText.split(/\n/).flatMap(line => {
    const parts = line.split(/(?=\d{2}\/\d{2}\/\d{4})/);
    return parts.length > 1 ? parts : [line];
  });

  let institution: string | null = null;
  const textLower = fullText.toLowerCase();
  if (textLower.includes('sicredi')) institution = 'Sicredi';
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

    const dateMatch = line.match(GENERIC_DATE_REGEX);
    if (!dateMatch) {
      lineLogs.push({ lineNumber, content: line, status: 'ignorada', reason: 'Sem data reconhecida' });
      continue;
    }

    const valueMatch = line.match(GENERIC_VALUE_REGEX);
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

    const dateEnd = line.indexOf(dateMatch[0]) + dateMatch[0].length;
    const valueStart = line.indexOf(valueMatch[0]);
    let descricao = line.substring(dateEnd, valueStart).trim();
    descricao = descricao.replace(/^\s*[-–]\s*/, '').replace(/\s+/g, ' ').trim();

    if (!descricao || descricao.length < 2) {
      lineLogs.push({ lineNumber, content: line, status: 'rejeitada', reason: 'Descrição vazia' });
      continue;
    }

    const parcelaMatch = descricao.match(GENERIC_PARCELA_REGEX);
    let parcela_atual: number | null = null;
    let parcela_total: number | null = null;
    if (parcelaMatch) {
      parcela_atual = parseInt(parcelaMatch[1]);
      parcela_total = parseInt(parcelaMatch[2]);
      descricao = descricao.replace(GENERIC_PARCELA_REGEX, '').trim();
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

// ── Main entry point ───────────────────────────────────────────

export async function parsePdfFile(file: File): Promise<PdfParseResult> {
  try {
    const structured = await extractPdfStructured(file);

    if (structured.isMercadoPago) {
      return parseMercadoPago(structured.pages);
    }
  } catch {
    // Fall through to generic parser
  }

  // Fallback: generic text-based parser
  const pages = await extractPdfText(file);
  return parseGenericPdf(pages);
}

/** @deprecated Use parsePdfFile instead. Kept for backward compatibility. */
export function parsePdfText(pages: string[]): PdfParseResult {
  return parseGenericPdf(pages);
}
