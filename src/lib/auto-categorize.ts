/**
 * Dictionary-based auto-categorization for financial transactions.
 * Returns category name or null if no match found.
 *
 * IMPORTANTE: todas as categorias usadas aqui devem existir em
 * CATEGORIAS_CONFIG (src/types/database.types.ts). Não crie nomes novos
 * sem atualizar CATEGORIAS_CONFIG primeiro — caso contrário você vai
 * reintroduzir duplicatas como "Assinatura" vs "Assinaturas".
 */

import { CATEGORIAS_CONFIG } from '@/types/database.types';

interface CategoriaRule {
  patterns: string[];
  categoria: string;
}

const RULES: CategoriaRule[] = [
  // PAGAMENTO DE FATURA
  { patterns: ['PAGTO FATURA', 'PAGAMENTO FATURA', 'PAGTO FAT', 'PAG FATURA'], categoria: 'Operação bancária' },

  // EMPRÉSTIMOS
  { patterns: ['LIQUIDACAO DE PARCELA', 'LIQUIDAÇÃO DE PARCELA', 'PARCELA-C5A'], categoria: 'Empréstimos' },

  // TARIFAS / OPERAÇÕES BANCÁRIAS
  { patterns: ['IOF BASICO', 'IOF ADICIONAL', 'IOF COMPRA', 'CESTA DE RELACIONAMENTO', 'INTEGR.CAPITAL SUBSCRITO', 'INTEGRCAPITAL SUBSCRITO', 'JUROS UTILIZ', 'MENSALID TAG'], categoria: 'Operação bancária' },

  // IMPOSTOS → Transporte (categoria canônica que abarca impostos de veículo/IPVA)
  { patterns: ['RECEITA FEDERAL', 'ARRECADACAO ESTADUAL', 'IPVA', 'DETRAN', 'DPVAT'], categoria: 'Transporte' },

  // INVESTIMENTOS (receita)
  { patterns: ['TORO INVESTIMEN', 'TORO INVEST', 'XP INVEST', 'CLEAR CORRET'], categoria: 'Investimentos' },

  // SEGURO DE VIDA → Saúde
  { patterns: ['PRUDENTIAL'], categoria: 'Saúde' },

  // SEGURO DO CARRO → Transporte
  { patterns: ['SUICA SEGURAD', 'ASAASIP*SUICA', 'ASAAS*SUICA', 'ASAASIPSUICA', 'ASAASSUICA'], categoria: 'Transporte' },

  // ASSINATURA
  { patterns: ['NETFLIX', 'SPOTIFY', 'AMAZON PRIME', 'YOUTUBE PREMIUM', 'YOUTUBE PREMI', 'APPLECOMBILL', 'APPLE.COM', 'APPLECOM', 'BUDGI', 'PIXIESET', 'GODADDY', 'BRASIL PARAL', 'BRASILPAR', 'KIWIFY', 'HOTMART'], categoria: 'Assinatura' },

  // EDUCAÇÃO
  { patterns: ['HTM*SIMONE', 'HTMSIMONE', 'SIMONE DE OLIVE', 'CURSO', 'ESCOLA', 'FACULDADE', 'MENTORIA'], categoria: 'Educação' },

  // TELECOM → Serviços
  { patterns: ['CONTA VIVO', 'COPREL TELECOM', 'VIVO', 'CLARO TELECOM', 'TIM'], categoria: 'Serviços' },

  // SAÚDE
  { patterns: ['FARMACIA', 'FARMACIAS', 'SAO JOAO FARMACIAS', 'DROGARIA', 'CONSULTORIO', 'DR FBS', 'ROSELI MAGALHAES'], categoria: 'Saúde' },

  // BELEZA
  { patterns: ['OBOTICARIO', 'HNA*OBOTICARIO', 'HNAOBOTICARIO', 'LETICIA MUNIZ', 'NH COMERCIO COSM', 'BEAUTY', 'ESTETICA'], categoria: 'Beleza' },

  // MORADIA → Casa
  { patterns: ['CEOLIN ADMINISTRACAO', 'RESIDENCIAL PORTO SEGURO', 'ZOOP BRASIL', 'CONDOMINIO', 'ALUGUEL'], categoria: 'Casa' },

  // COMBUSTÍVEL → Transporte
  { patterns: ['PF CIDADE NOVA'], categoria: 'Transporte' },

  // TRANSPORTE
  { patterns: ['PASSAGEM PEDAGIO', 'PEDAGIO', 'MENSALID TAG DE PASSAGEM', 'LAPAZA EMPREEND'], categoria: 'Transporte' },

  // COMPRAS (online)
  { patterns: ['MERCADOLIVRE', 'MERCADO*MERCAD', 'MERCADOMERCAD', 'MERCADO*RICO', 'MERCADORICO', 'MERCADO*15PROD', 'MERCADO15PROD', 'SHOPEE', 'HAVAN', 'SHEIN', 'SITE HAVAN', 'COMAXCASA', 'MERLIN MAT', 'NOVACOR', 'NOVA COR'], categoria: 'Compras' },

  // CASA
  { patterns: ['TOP MAIS', 'STOK CENTER'], categoria: 'Casa' },

  // ALIMENTAÇÃO
  { patterns: ['MIX CENTER', 'FRUTEIRA TERRIBILE', 'COTRISAL SUPERMERCADO', '212 BISTRO', 'QUIERO CAFE', 'SUPERMERCADO'], categoria: 'Alimentação' },

  // RECEITA → Outras receitas (catch-all)
  { patterns: ['RECEBIMENTO PIX', 'PIX SICREDI', 'ADVERSE PRODUTORA', 'VERTATTO NEGOCIOS'], categoria: 'Outras receitas' },

  // COMPRAS GENÉRICAS (Mercado Pago catch-all)
  { patterns: ['MP *', 'MP*'], categoria: 'Compras' },
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
 * Canonical list of categories — derived de CATEGORIAS_CONFIG para garantir
 * fonte única da verdade (nenhum nome novo deve ser introduzido aqui).
 */
export const REQUIRED_CATEGORIES: string[] = Object.keys(CATEGORIAS_CONFIG);

/**
 * Default colors — também derivado de CATEGORIAS_CONFIG.
 */
export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORIAS_CONFIG).map(([nome, cfg]) => [nome, cfg.cor])
);
