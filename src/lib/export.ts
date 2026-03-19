const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

interface ExportTransaction {
  data: string;
  data_original: string | null;
  descricao: string;
  categoria: string;
  valor: number;
  tipo: string;
  essencial: boolean;
  parcela_atual: number | null;
  parcela_total: number | null;
  pessoa: string;
  conta_id: string;
  observacoes: string | null;
}

interface ExportOptions {
  transactions: ExportTransaction[];
  contas: { id: string; nome: string }[];
  month: number;
  year: number;
}

function formatDateBR(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR');
}

function formatValorBR(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getContaNome(contaId: string, contas: { id: string; nome: string }[]): string {
  return contas.find(c => c.id === contaId)?.nome || '';
}

function buildRows(opts: ExportOptions): string[][] {
  const header = ['Data', 'Data Competência', 'Descrição', 'Categoria', 'Valor', 'Tipo', 'Essencial', 'Parcela', 'Pessoa', 'Conta', 'Observações'];
  const rows = opts.transactions.map(t => [
    formatDateBR(t.data),
    t.data_original ? formatDateBR(t.data_original) : formatDateBR(t.data),
    t.descricao,
    t.categoria,
    formatValorBR(t.valor),
    t.tipo === 'receita' ? 'Receita' : 'Despesa',
    t.essencial ? 'Sim' : 'Não',
    t.parcela_atual && t.parcela_total ? `${t.parcela_atual}/${t.parcela_total}` : '',
    t.pessoa,
    getContaNome(t.conta_id, opts.contas),
    t.observacoes || '',
  ]);
  return [header, ...rows];
}

function getFileName(month: number, year: number): string {
  const now = new Date();
  const dia = String(now.getDate()).padStart(2, '0');
  const mes = String(now.getMonth() + 1).padStart(2, '0');
  const ano = now.getFullYear();
  return `transacoes_${MONTH_NAMES[month]}-${year}_${dia}-${mes}-${ano}.csv`;
}

export function exportCSV(opts: ExportOptions) {
  const rows = buildRows(opts);
  const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getFileName(opts.month, opts.year);
  a.click();
  URL.revokeObjectURL(url);
}

export function copyToClipboard(opts: ExportOptions): Promise<void> {
  const rows = buildRows(opts);
  const text = rows.map(r => r.join('\t')).join('\n');
  return navigator.clipboard.writeText(text);
}
