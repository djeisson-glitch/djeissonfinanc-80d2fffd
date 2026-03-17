import { supabase } from "@/integrations/supabase/client";

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

interface ParseResult {
  contaDetectada: string | null;
  transactions: ParsedTransaction[];
}

function parseDate(dateStr: string): string {
  // Format: DD/MM/YYYY -> YYYY-MM-DD
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return dateStr;
}

export function parseSicrediCSV(csvText: string): ParseResult {
  const lines = csvText.split('\n');
  
  let contaDetectada: string | null = null;
  const headerLines = lines.slice(0, 10).join(' ');
  
  if (headerLines.includes('Mastercard Black') || headerLines.includes('Black')) {
    contaDetectada = 'Black';
  } else if (headerLines.includes('Mercado Pago')) {
    contaDetectada = 'Mercado Pago';
  } else if (headerLines.includes('Conta Corrente')) {
    contaDetectada = 'Sicredi Principal';
  }
  
  // Find header line
  const headerIndex = lines.findIndex(l => 
    l.toLowerCase().includes('data') && l.toLowerCase().includes('descri')
  );
  
  if (headerIndex === -1) {
    // Try alternative: just skip non-data lines
    return { contaDetectada, transactions: [] };
  }
  
  const dataLines = lines.slice(headerIndex + 1);
  
  const transactions: ParsedTransaction[] = dataLines
    .filter(line => line.trim() && !line.toLowerCase().includes('total'))
    .map(line => {
      const parts = line.split(';').map(p => p.trim());
      // Allow lines with 3+ parts (some lines like devoluções may have empty fields)
      if (parts.length < 3) return null;
      
      const [data, descricao] = parts;
      // Value can be in position 2 (no parcela) or position 3
      let valorStr = '';
      let parcela = '';
      if (parts.length >= 4) {
        parcela = parts[2];
        valorStr = parts[3];
      } else {
        valorStr = parts[2];
      }
      const pessoa = parts.length >= 7 ? (parts[6] || 'Djeisson Mauss') : 'Djeisson Mauss';
      
      if (!data || !descricao) return null;
      
      // Parse value - try current position, fall back to finding any value-like field
      let cleanVal = valorStr.replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim();
      let valor = parseFloat(cleanVal);
      
      // If valor is empty/NaN, try finding value in other positions
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
      
      if (isNaN(valor)) return null;
      
      // Parse parcela
      const parcelaMatch = parcela?.match(/\((\d+)\/(\d+)\)/);
      const parcela_atual = parcelaMatch ? parseInt(parcelaMatch[1]) : null;
      const parcela_total = parcelaMatch ? parseInt(parcelaMatch[2]) : null;
      
      const tipo = valor < 0 ? 'receita' as const : 'despesa' as const;
      const isoDate = parseDate(data);
      
      return {
        data: isoDate,
        descricao,
        valor: Math.abs(valor),
        tipo,
        parcela_atual,
        parcela_total,
        pessoa: pessoa || 'Djeisson Mauss',
        hash_transacao: generateHash(isoDate, descricao, Math.abs(valor), pessoa || 'Djeisson Mauss'),
      };
    })
    .filter(Boolean) as ParsedTransaction[];
  
  return { contaDetectada, transactions };
}

export function generateFutureInstallments(
  transaction: ParsedTransaction,
  grupo_parcela: string
): ParsedTransaction[] {
  if (!transaction.parcela_atual || !transaction.parcela_total) return [];
  
  const remaining = transaction.parcela_total - transaction.parcela_atual;
  const future: ParsedTransaction[] = [];
  
  for (let i = 1; i <= remaining; i++) {
    const date = new Date(transaction.data);
    date.setMonth(date.getMonth() + i);
    const isoDate = date.toISOString().split('T')[0];
    const nextParcela = transaction.parcela_atual + i;
    
    future.push({
      data: isoDate,
      descricao: `${transaction.descricao} (auto-projetada)`,
      valor: transaction.valor,
      tipo: transaction.tipo,
      parcela_atual: nextParcela,
      parcela_total: transaction.parcela_total,
      pessoa: transaction.pessoa,
      hash_transacao: generateHash(isoDate, transaction.descricao, transaction.valor, transaction.pessoa) + `_p${nextParcela}`,
    });
  }
  
  return future;
}
