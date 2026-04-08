/**
 * Dictionary-based auto-categorization for financial transactions.
 * Returns category name or null if no match found.
 */

interface CategoriaRule {
  patterns: string[];
  categoria: string;
}

const RULES: CategoriaRule[] = [
  // PAGAMENTO DE FATURA (max priority — skip on import)
  { patterns: ['PAGTO FATURA', 'PAGAMENTO FATURA', 'PAGTO FAT', 'PAG FATURA'], categoria: 'Pagamento de Fatura' },

  // EMPRÉSTIMO
  { patterns: ['LIQUIDACAO DE PARCELA', 'LIQUIDAÇÃO DE PARCELA', 'PARCELA-C5A'], categoria: 'Empréstimo' },

  // TARIFAS BANCÁRIAS
  { patterns: ['IOF BASICO', 'IOF ADICIONAL', 'IOF COMPRA', 'CESTA DE RELACIONAMENTO', 'INTEGR.CAPITAL SUBSCRITO', 'INTEGRCAPITAL SUBSCRITO', 'JUROS UTILIZ', 'MENSALID TAG'], categoria: 'Tarifas Bancárias' },

  // IMPOSTOS
  { patterns: ['RECEITA FEDERAL', 'ARRECADACAO ESTADUAL', 'IPVA', 'DETRAN', 'DPVAT'], categoria: 'Impostos' },

  // INVESTIMENTOS
  { patterns: ['TORO INVESTIMEN', 'TORO INVEST', 'XP INVEST', 'CLEAR CORRET'], categoria: 'Investimentos' },

  // SEGURO DE VIDA
  { patterns: ['PRUDENTIAL'], categoria: 'Seguro de Vida' },

  // SEGURO DO CARRO
  { patterns: ['SUICA SEGURAD', 'ASAASIP*SUICA', 'ASAAS*SUICA', 'ASAASIPSUICA', 'ASAASSUICA'], categoria: 'Seguro do Carro' },

  // ASSINATURAS
  { patterns: ['NETFLIX', 'SPOTIFY', 'AMAZON PRIME', 'YOUTUBE PREMIUM', 'YOUTUBE PREMI', 'APPLECOMBILL', 'APPLE.COM', 'APPLECOM', 'BUDGI', 'PIXIESET', 'GODADDY', 'BRASIL PARAL', 'BRASILPAR', 'KIWIFY', 'HOTMART'], categoria: 'Assinaturas' },

  // EDUCAÇÃO
  { patterns: ['HTM*SIMONE', 'HTMSIMONE', 'SIMONE DE OLIVE', 'CURSO', 'ESCOLA', 'FACULDADE', 'MENTORIA'], categoria: 'Educação' },

  // TELECOM
  { patterns: ['CONTA VIVO', 'COPREL TELECOM', 'VIVO', 'CLARO TELECOM', 'TIM'], categoria: 'Telecom' },

  // SAÚDE
  { patterns: ['FARMACIA', 'FARMACIAS', 'SAO JOAO FARMACIAS', 'DROGARIA', 'CONSULTORIO', 'DR FBS', 'ROSELI MAGALHAES'], categoria: 'Saúde' },

  // BELEZA
  { patterns: ['OBOTICARIO', 'HNA*OBOTICARIO', 'HNAOBOTICARIO', 'LETICIA MUNIZ', 'NH COMERCIO COSM', 'BEAUTY', 'ESTETICA'], categoria: 'Beleza' },

  // MORADIA
  { patterns: ['CEOLIN ADMINISTRACAO', 'RESIDENCIAL PORTO SEGURO', 'ZOOP BRASIL', 'CONDOMINIO', 'ALUGUEL'], categoria: 'Moradia' },

  // COMBUSTÍVEL
  { patterns: ['PF CIDADE NOVA'], categoria: 'Combustível' },

  // TRANSPORTE
  { patterns: ['PASSAGEM PEDAGIO', 'PEDAGIO', 'MENSALID TAG DE PASSAGEM', 'LAPAZA EMPREEND'], categoria: 'Transporte' },

  // COMPRAS ONLINE
  { patterns: ['MERCADOLIVRE', 'MERCADO*MERCAD', 'MERCADOMERCAD', 'MERCADO*RICO', 'MERCADORICO', 'MERCADO*15PROD', 'MERCADO15PROD', 'SHOPEE', 'HAVAN', 'SHEIN', 'SITE HAVAN', 'COMAXCASA', 'MERLIN MAT', 'NOVACOR', 'NOVA COR'], categoria: 'Compras Online' },

  // CASA
  { patterns: ['TOP MAIS', 'STOK CENTER'], categoria: 'Casa' },

  // ALIMENTAÇÃO
  { patterns: ['MIX CENTER', 'FRUTEIRA TERRIBILE', 'COTRISAL SUPERMERCADO', '212 BISTRO', 'QUIERO CAFE', 'SUPERMERCADO'], categoria: 'Alimentação' },

  // RECEITA (only for credit/income type)
  { patterns: ['RECEBIMENTO PIX', 'PIX SICREDI', 'ADVERSE PRODUTORA', 'VERTATTO NEGOCIOS'], categoria: 'Receita' },

  // COMPRAS GENÉRICAS (Mercado Pago catch-all)
  { patterns: ['MP *', 'MP*'], categoria: 'Compras Online' },
];

/**
 * Normalize description for matching (same logic as dedup but without truncation).
 */
function normalizeForMatch(desc: string): string {
  return desc
    .toUpperCase()
    .replace(/\s{2,}/g, ' ')
    .trim()
    // Remove trailing city/state patterns
    .replace(/\s+[A-Z]{2,3}\s*$/, '')
    .replace(/\s{2,}[A-Z\s]+$/, '')
    .trim();
}

/**
 * Auto-categorize a transaction based on its description.
 * Returns category name or null if no match.
 */
export function autoCategorizarTransacao(descricao: string): string | null {
  const normalized = normalizeForMatch(descricao);
  // Also create a version without special chars for matching patterns that had * or .
  const normalizedClean = normalized.replace(/[^A-Z0-9 ]/g, '').replace(/\s{2,}/g, ' ').trim();

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const patternUpper = pattern.toUpperCase();
      // Also create clean version of pattern
      const patternClean = patternUpper.replace(/[^A-Z0-9 ]/g, '').replace(/\s{2,}/g, ' ').trim();

      if (normalized.includes(patternUpper) || normalizedClean.includes(patternClean)) {
        return rule.categoria;
      }
    }
  }

  return null;
}

/**
 * List of all categories that should exist in the system.
 */
export const REQUIRED_CATEGORIES = [
  'Alimentação', 'Combustível', 'Saúde', 'Beleza', 'Seguro de Vida',
  'Seguro do Carro', 'Assinatura', 'Educação', 'Transporte', 'Telecom',
  'Moradia', 'Casa', 'Compras Online', 'Empréstimo', 'Tarifas Bancárias',
  'Impostos', 'Investimentos', 'Pagamento de Fatura', 'Receita', 'Outros',
];

/**
 * Default colors for new categories.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  'Alimentação': '#ef4444',
  'Combustível': '#f59e0b',
  'Saúde': '#22c55e',
  'Beleza': '#f97316',
  'Seguro de Vida': '#8b5cf6',
  'Seguro do Carro': '#6366f1',
  'Assinatura': '#a855f7',
  'Educação': '#3b82f6',
  'Transporte': '#0ea5e9',
  'Telecom': '#14b8a6',
  'Moradia': '#0891b2',
  'Casa': '#0ea5e9',
  'Compras Online': '#d946ef',
  'Empréstimo': '#ef4444',
  'Tarifas Bancárias': '#78716c',
  'Impostos': '#dc2626',
  'Investimentos': '#3b82f6',
  'Pagamento de Fatura': '#6b7280',
  'Receita': '#10b981',
  'Outros': '#9ca3af',
};
