export type CategoryKey = 'PRODUÇÃO' | 'PÓS-PRODUÇÃO' | 'LOGÍSTICA';

export interface CategoryConfig {
  field1: string;
  field2: string | null;
  field3: string;
  formula: string;
}

export const categoryConfig: Record<CategoryKey, CategoryConfig> = {
  'PRODUÇÃO': {
    field1: 'Dias',
    field2: 'Pessoas',
    field3: 'Valor/diária',
    formula: 'dias × pessoas × valor',
  },
  'PÓS-PRODUÇÃO': {
    field1: 'Horas',
    field2: null,
    field3: 'Valor/hora',
    formula: 'horas × valor',
  },
  'LOGÍSTICA': {
    field1: 'Dias',
    field2: null,
    field3: 'Valor/dia',
    formula: 'dias × valor',
  },
};

export const CATEGORIES: CategoryKey[] = ['PRODUÇÃO', 'PÓS-PRODUÇÃO', 'LOGÍSTICA'];

export interface BudgetItem {
  id: string;
  name: string;
  field1: number;
  field2: number;
  field3: number;
  hasSupplier: boolean;
  supplierField1: number;
  supplierField2: number;
  supplierField3: number;
}

export interface BudgetData {
  id: string;
  cliente: string;
  projeto: string;
  items: Record<CategoryKey, BudgetItem[]>;
  markupPercent: number;
  impostoPercent: number;
  bvPercent: number;
  comissaoPercent: number;
}

export function calculateItemTotal(item: BudgetItem, config: CategoryConfig): number {
  if (config.field2) {
    return item.field1 * item.field2 * item.field3;
  }
  return item.field1 * item.field3;
}

export function calculateSupplierTotal(item: BudgetItem, config: CategoryConfig): number {
  if (config.field2) {
    return item.supplierField1 * item.supplierField2 * item.supplierField3;
  }
  return item.supplierField1 * item.supplierField3;
}

export function createEmptyItem(): BudgetItem {
  return {
    id: crypto.randomUUID(),
    name: '',
    field1: 1,
    field2: 1,
    field3: 0,
    hasSupplier: false,
    supplierField1: 1,
    supplierField2: 1,
    supplierField3: 0,
  };
}

export function createEmptyBudget(): BudgetData {
  return {
    id: String(Math.floor(Math.random() * 900) + 100),
    cliente: '',
    projeto: '',
    items: {
      'PRODUÇÃO': [],
      'PÓS-PRODUÇÃO': [],
      'LOGÍSTICA': [],
    },
    markupPercent: 35,
    impostoPercent: 11.1,
    bvPercent: 0,
    comissaoPercent: 6,
  };
}
