import { generateHash, normalizeDescription, type ClassifiedTransaction, type TransactionClassification } from './csv-parser';
import { autoCategorizarTransacao } from './auto-categorize';

export interface OFXParseResult {
  contaDetectada: string | null;
  accountType: 'corrente' | 'credito' | null;
  accountNumber: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  ledgerBalance: number | null;
  balanceDate: string | null;
  transactions: ClassifiedTransaction[];
}

function parseOFXDate(dateStr: string): string {
  const clean = dateStr.replace(/\[.*\]/, '').trim();
  const year = clean.substring(0, 4);
  const month = clean.substring(4, 6);
  const day = clean.substring(6, 8);
  return `${year}-${month}-${day}`;
}

function extractTag(text: string, tag: string): string | null {
  const patterns = [
    new RegExp(`<${tag}>([^<\\n]+)`, 'i'),
    new RegExp(`<${tag}>\\s*([^<\\n]+?)\\s*</${tag}>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function extractAllBlocks(text: string, tag: string): string[] {
  const blocks: string[] = [];
  const openTag = `<${tag}>`;
  const closeTag = `</${tag}>`;
  let pos = 0;

  while (pos < text.length) {
    const start = text.indexOf(openTag, pos);
    if (start === -1) break;
    const end = text.indexOf(closeTag, start);
    if (end === -1) {
      const nextOpen = text.indexOf(openTag, start + openTag.length);
      blocks.push(text.substring(start + openTag.length, nextOpen === -1 ? text.length : nextOpen));
      pos = nextOpen === -1 ? text.length : nextOpen;
    } else {
      blocks.push(text.substring(start + openTag.length, end));
      pos = end + closeTag.length;
    }
  }
  return blocks;
}

function autoCategorizeMemo(memo: string): { categoria: string; essencial: boolean; classification: TransactionClassification } | null {
  const upper = memo.toUpperCase();

  // Payment detection (affects classification)
  if (upper.includes('PAGTO FATURA') || upper.includes('PAGAMENTO FATURA') || upper.includes('PAG FAT')) {
    return { categoria: 'Operação bancária', essencial: false, classification: 'payment' };
  }

  // Use the centralized dictionary for categorization
  const autoCat = autoCategorizarTransacao(memo);
  if (autoCat) {
    return { categoria: autoCat, essencial: false, classification: 'simple' };
  }

  return null;
}

export function parseOFX(ofxText: string): OFXParseResult {
  let contaDetectada: string | null = null;
  let accountType: 'corrente' | 'credito' | null = null;

  if (ofxText.includes('<CCSTMTTRNRS>') || ofxText.includes('<CCSTMTRS>')) {
    accountType = 'credito';
  } else if (ofxText.includes('<BANKMSGSRSV1>') || ofxText.includes('<STMTTRNRS>')) {
    accountType = 'corrente';
  }

  const org = extractTag(ofxText, 'ORG');
  const accountNumber = extractTag(ofxText, 'ACCTID');

  if (org) {
    if (org.toLowerCase().includes('sicredi')) {
      contaDetectada = accountType === 'credito' ? 'Black' : 'Sicredi';
    } else if (org.toLowerCase().includes('mercado')) {
      contaDetectada = 'Mercado Pago';
    } else {
      contaDetectada = org;
    }
  }

  // Extract period
  const dtStart = extractTag(ofxText, 'DTSTART');
  const dtEnd = extractTag(ofxText, 'DTEND');
  const periodStart = dtStart ? parseOFXDate(dtStart) : null;
  const periodEnd = dtEnd ? parseOFXDate(dtEnd) : null;

  // Extract balance
  const balAmtStr = extractTag(ofxText, 'BALAMT');
  const ledgerBalance = balAmtStr ? parseFloat(balAmtStr.replace(',', '.')) : null;
  const dtAsOf = extractTag(ofxText, 'DTASOF');
  const balanceDate = dtAsOf ? parseOFXDate(dtAsOf) : null;

  // Extract transactions
  const txBlocks = extractAllBlocks(ofxText, 'STMTTRN');
  const hashCounts = new Map<string, number>();

  const transactions: ClassifiedTransaction[] = txBlocks
    .map(block => {
      const dateStr = extractTag(block, 'DTPOSTED');
      const amount = extractTag(block, 'TRNAMT');
      const memo = extractTag(block, 'MEMO') || extractTag(block, 'NAME') || '';
      const fitId = extractTag(block, 'FITID');

      if (!dateStr || !amount) return null;

      const valor = parseFloat(amount.replace(',', '.'));
      if (isNaN(valor)) return null;

      const data = parseOFXDate(dateStr);
      const tipo: 'receita' | 'despesa' = valor > 0 ? 'receita' : 'despesa';
      const absValor = Math.abs(valor);
      const pessoa = 'Djeisson Mauss';
      const descricao = memo.trim();

      // Use FITID as hash for deduplication if available
      const baseHash = fitId || generateHash(data, descricao, absValor, pessoa);
      const count = hashCounts.get(baseHash) || 0;
      hashCounts.set(baseHash, count + 1);
      const hash_transacao = count > 0 ? `${baseHash}_seq${count}` : baseHash;

      // Auto-categorize
      const autoCat = autoCategorizeMemo(descricao);
      const classification: TransactionClassification = autoCat?.classification || (valor < 0 ? 'simple' : 'simple');

      return {
        data,
        descricao,
        descricao_normalizada: normalizeDescription(descricao),
        valor: absValor,
        tipo,
        parcela_atual: null,
        parcela_total: null,
        pessoa,
        hash_transacao,
        codigo_cartao: null,
        valor_dolar: null,
        classification,
        _autoCategoria: autoCat?.categoria || null,
        _autoEssencial: autoCat?.essencial || false,
      };
    })
    .filter(Boolean) as ClassifiedTransaction[];

  return {
    contaDetectada,
    accountType,
    accountNumber,
    periodStart,
    periodEnd,
    ledgerBalance,
    balanceDate,
    transactions,
  };
}
