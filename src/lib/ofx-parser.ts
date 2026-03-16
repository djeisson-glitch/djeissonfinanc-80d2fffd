import { generateHash } from './csv-parser';

interface ParsedTransaction {
  data: string;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  parcela_atual: number | null;
  parcela_total: number | null;
  pessoa: string;
  hash_transacao: string;
}

interface OFXParseResult {
  contaDetectada: string | null;
  accountType: 'corrente' | 'credito' | null;
  transactions: ParsedTransaction[];
}

function parseOFXDate(dateStr: string): string {
  // OFX dates: YYYYMMDDHHMMSS or YYYYMMDD
  const clean = dateStr.replace(/\[.*\]/, '').trim();
  const year = clean.substring(0, 4);
  const month = clean.substring(4, 6);
  const day = clean.substring(6, 8);
  return `${year}-${month}-${day}`;
}

function extractTag(text: string, tag: string): string | null {
  // OFX uses SGML-like tags: <TAG>value or <TAG>value</TAG>
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
      // No closing tag, take until next opening tag or end
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

export function parseOFX(ofxText: string): OFXParseResult {
  let contaDetectada: string | null = null;
  let accountType: 'corrente' | 'credito' | null = null;

  // Detect account type
  if (ofxText.includes('<CCSTMTTRNRS>') || ofxText.includes('<CCSTMTRS>')) {
    accountType = 'credito';
  } else if (ofxText.includes('<BANKMSGSRSV1>') || ofxText.includes('<STMTTRNRS>')) {
    accountType = 'corrente';
  }

  // Try to detect bank/account name
  const org = extractTag(ofxText, 'ORG');
  if (org) {
    if (org.toLowerCase().includes('sicredi')) {
      contaDetectada = accountType === 'credito' ? 'Black' : 'Sicredi Principal';
    } else if (org.toLowerCase().includes('mercado')) {
      contaDetectada = 'Mercado Pago';
    } else {
      contaDetectada = org;
    }
  }

  // Extract transactions from STMTTRN blocks
  const txBlocks = extractAllBlocks(ofxText, 'STMTTRN');
  
  const transactions: ParsedTransaction[] = txBlocks
    .map(block => {
      const dateStr = extractTag(block, 'DTPOSTED');
      const amount = extractTag(block, 'TRNAMT');
      const memo = extractTag(block, 'MEMO') || extractTag(block, 'NAME') || '';
      
      if (!dateStr || !amount) return null;
      
      const valor = parseFloat(amount.replace(',', '.'));
      if (isNaN(valor)) return null;
      
      const data = parseOFXDate(dateStr);
      const tipo: 'receita' | 'despesa' = valor > 0 ? 'receita' : 'despesa';
      const absValor = Math.abs(valor);
      const pessoa = 'Djeisson Mauss';
      
      return {
        data,
        descricao: memo.trim(),
        valor: absValor,
        tipo,
        parcela_atual: null,
        parcela_total: null,
        pessoa,
        hash_transacao: generateHash(data, memo.trim(), absValor, pessoa),
      };
    })
    .filter(Boolean) as ParsedTransaction[];

  return { contaDetectada, accountType, transactions };
}
