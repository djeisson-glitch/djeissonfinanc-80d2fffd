export interface Configuracao {
  id: string;
  user_id: string;
  receita_mensal_fixa: number;
  reserva_minima: number;
  created_at: string;
  updated_at: string;
}

export interface Conta {
  id: string;
  user_id: string;
  nome: string;
  tipo: 'credito' | 'debito';
  saldo_inicial: number;
  created_at: string;
}

export interface Transacao {
  id: string;
  user_id: string;
  conta_id: string;
  data: string;
  descricao: string;
  valor: number;
  categoria: string;
  tipo: 'receita' | 'despesa';
  essencial: boolean;
  parcela_atual: number | null;
  parcela_total: number | null;
  grupo_parcela: string | null;
  hash_transacao: string;
  pessoa: string;
  observacoes: string | null;
  created_at: string;
}

export interface RegraCategorizada {
  id: string;
  user_id: string;
  padrao: string;
  categoria: string;
  essencial: boolean;
  aprendido_auto: boolean;
  created_at: string;
}

export type TransacaoComConta = Transacao & { conta: Pick<Conta, 'nome' | 'tipo'> };

export const CATEGORIAS = [
  'Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Educação',
  'Entretenimento', 'Vestuário', 'Beleza', 'Assinaturas',
  'Serviços', 'Investimentos', 'Outros'
] as const;

export const CONTAS_PADRAO: Omit<Conta, 'id' | 'user_id' | 'created_at'>[] = [
  { nome: 'Sicredi Secundário', tipo: 'debito', saldo_inicial: 0 },
  { nome: 'Sicredi Principal', tipo: 'debito', saldo_inicial: 0 },
  { nome: 'Black', tipo: 'credito', saldo_inicial: 0 },
  { nome: 'Mercado Pago', tipo: 'credito', saldo_inicial: 0 },
];
