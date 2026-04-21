import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, getMonthName } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Landmark,
  CreditCard,
  ShoppingBag,
  CalendarClock,
  TrendingDown,
  Receipt,
  ArrowDownRight,
  Building2,
  AlertTriangle,
  Wallet,
  PiggyBank,
} from 'lucide-react';

interface Transacao {
  id: string;
  descricao: string;
  descricao_normalizada: string | null;
  valor: number | string;
  tipo: string;
  parcela_atual: number | null;
  parcela_total: number | null;
  grupo_parcela: string | null;
  mes_competencia: string | null;
  data: string;
  categoria: string | null;
  conta_id: string;
}

interface DebtGroup {
  key: string;
  displayName: string;
  descricao: string;
  parcelaAtual: number;
  parcelaTotal: number;
  valorMensal: number;
  parcelasRestantes: number;
  valorRestante: number;
  mesCompetencia: string;
  mesTermino: string;
  progressPercent: number;
  isFatura: boolean;
  faturaMonth?: string;
  categoria: string | null;
}

interface LoanGroup {
  contrato: string;
  valorMedio: number;
  pagamentos: { data: string; valor: number; tipo: string }[];
  contaId: string;
  ultimoPagamento: string;
  mesesConsecutivos: number;
}

interface RecurringDebt {
  descricao: string;
  valorMedio: number;
  pagamentos: { data: string; valor: number }[];
  contaId: string;
}

function addMonths(yyyyMM: string, months: number): string {
  const [y, m] = yyyyMM.split('-').map(Number);
  const date = new Date(y, m - 1 + months, 1);
  const ny = date.getFullYear();
  const nm = date.getMonth() + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function formatMesCompetencia(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-').map(Number);
  return `${getMonthName(m - 1)}/${y}`;
}

function cleanEstablishmentName(desc: string): string {
  return desc
    .replace(/^(MERCADOLIVRE\*|MERCADOPAGO\*|MP\*|EC\s?\*)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFaturaMonth(desc: string): string | undefined {
  const match = desc.match(/fatura\s+de\s+(\w+)\/?(\d{4})?/i);
  if (match) {
    return match[2] ? `${match[1]}/${match[2]}` : match[1];
  }
  return undefined;
}

function getGroupKey(tx: Transacao): string {
  if (tx.grupo_parcela) return tx.grupo_parcela;
  const isFatura = /parcela da fatura/i.test(tx.descricao);
  if (isFatura) {
    const fatMonth = extractFaturaMonth(tx.descricao);
    return `fatura_parcelada_${fatMonth || tx.descricao}_${tx.conta_id}`;
  }
  const desc = tx.descricao_normalizada || tx.descricao;
  return `${desc}_${tx.parcela_total}_${tx.conta_id}`;
}

/**
 * Extract loan contract number from descriptions like:
 * "LIQUIDACAO DE PARCELA-C5A930481"
 * "AMORTIZACAO CONTRATO-C5A920011"
 * "LIQUIDACAO BOLETO SICREDI-261011855 89468565000101 SICREDI REG DA PROD RS SC MG"
 */
function extractContrato(desc: string): string | null {
  // LIQUIDACAO DE PARCELA-C5Axxxxxx or AMORTIZACAO CONTRATO-C5Axxxxxx
  const loanMatch = desc.match(/(?:LIQUIDACAO DE PARCELA|AMORTIZACAO CONTRATO|LIQUIDACAO DE PARCELA|IOF S\/ OPER\. CREDITO PF)-?(C\w+)/i);
  if (loanMatch) return loanMatch[1];

  // C61020355 pattern
  const cMatch = desc.match(/(C\d{8,})/);
  if (cMatch) return cMatch[1];

  return null;
}

export default function DividasPage() {
  const { user } = useAuth();

  // Parcelamentos (credit card installments)
  const { data: transactions, isLoading } = useQuery({
    queryKey: ['dividas-transacoes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transacoes')
        .select(
          'id, descricao, descricao_normalizada, valor, tipo, parcela_atual, parcela_total, grupo_parcela, mes_competencia, data, categoria, conta_id'
        )
        .eq('user_id', user!.id)
        .eq('tipo', 'despesa')
        .not('parcela_total', 'is', null)
        .gt('parcela_total', 1);
      if (error) throw error;
      return (data || []) as Transacao[];
    },
    enabled: !!user,
  });

  // All transactions for loan/recurring detection
  const { data: allTransactions } = useQuery({
    queryKey: ['dividas-all-transacoes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transacoes')
        .select('id, descricao, valor, tipo, data, conta_id')
        .eq('user_id', user!.id)
        .eq('tipo', 'despesa')
        .order('data', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: contas } = useQuery({
    queryKey: ['contas', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('contas').select('id, nome, tipo').eq('user_id', user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  // Detect bank loans from transaction patterns
  const loanGroups = useMemo(() => {
    if (!allTransactions) return [];

    const loans = new Map<string, LoanGroup>();

    for (const tx of allTransactions) {
      const desc = tx.descricao.toUpperCase();
      const contrato = extractContrato(desc);
      if (!contrato) continue;

      // Skip IOF entries (they're charges, not actual loan payments)
      if (desc.includes('IOF')) continue;

      const valor = Math.abs(Number(tx.valor));
      if (!valor || isNaN(valor)) continue;

      const tipo = desc.includes('AMORTIZACAO') ? 'amortizacao' : 'parcela';

      if (!loans.has(contrato)) {
        loans.set(contrato, {
          contrato,
          valorMedio: 0,
          pagamentos: [],
          contaId: tx.conta_id,
          ultimoPagamento: tx.data,
          mesesConsecutivos: 0,
        });
      }

      const loan = loans.get(contrato)!;
      loan.pagamentos.push({ data: tx.data, valor, tipo });
      if (tx.data > loan.ultimoPagamento) {
        loan.ultimoPagamento = tx.data;
      }
    }

    // Calculate average monthly payment per contract.
    // Use only regular installments ('parcela') for the monthly average; amortizations are
    // one-off events and would inflate the average. If only amortizations exist, fall back
    // to their average so the loan still appears.
    const result: LoanGroup[] = [];
    for (const [, loan] of loans) {
      if (loan.pagamentos.length === 0) continue;

      const parcelas = loan.pagamentos.filter((p) => p.tipo === 'parcela');
      const amortizacoes = loan.pagamentos.filter((p) => p.tipo === 'amortizacao');

      if (parcelas.length > 0) {
        // Group regular installments by month and sum them
        const byMonth = new Map<string, number>();
        for (const p of parcelas) {
          const month = p.data.substring(0, 7);
          byMonth.set(month, (byMonth.get(month) || 0) + p.valor);
        }
        const monthlyValues = Array.from(byMonth.values());
        loan.valorMedio = monthlyValues.reduce((s, v) => s + v, 0) / monthlyValues.length;
        loan.mesesConsecutivos = byMonth.size;
      } else {
        // Fallback: only amortizations exist
        loan.valorMedio = amortizacoes.reduce((s, p) => s + p.valor, 0) / amortizacoes.length;
        const months = new Set(amortizacoes.map((p) => p.data.substring(0, 7)));
        loan.mesesConsecutivos = months.size;
      }

      result.push(loan);
    }

    result.sort((a, b) => b.valorMedio - a.valorMedio);
    return result;
  }, [allTransactions]);

  // Detect recurring debts (Mercado Crédito, etc.)
  const recurringDebts = useMemo(() => {
    if (!allTransactions) return [];

    const mercadoCreditoPayments: { data: string; valor: number }[] = [];
    const contaIds = new Set<string>();

    for (const tx of allTransactions) {
      const desc = tx.descricao.toUpperCase();
      const valor = Math.abs(Number(tx.valor));

      // Detect Mercado Crédito: PIX to Mercado Pago with exact R$ 563.41
      if (
        desc.includes('MERCADO PAGO') &&
        desc.includes('PIX') &&
        valor >= 560 && valor <= 570
      ) {
        mercadoCreditoPayments.push({ data: tx.data, valor });
        contaIds.add(tx.conta_id);
      }
    }

    const result: RecurringDebt[] = [];
    if (mercadoCreditoPayments.length > 0) {
      result.push({
        descricao: 'Mercado Crédito (empréstimo pessoal)',
        valorMedio: mercadoCreditoPayments.reduce((s, p) => s + p.valor, 0) / mercadoCreditoPayments.length,
        pagamentos: mercadoCreditoPayments,
        contaId: Array.from(contaIds)[0],
      });
    }

    return result;
  }, [allTransactions]);

  // Detect cheque especial (negative balance accounts)
  const chequeEspecialAccounts = useMemo(() => {
    if (!allTransactions || !contas) return [];

    const result: { contaId: string; contaNome: string; jurosTotal: number; jurosCount: number }[] = [];
    const jurosMap = new Map<string, { total: number; count: number }>();

    for (const tx of allTransactions) {
      if (tx.descricao.toUpperCase().includes('JUROS UTILIZ.CH.ESPECIAL')) {
        const valor = Math.abs(Number(tx.valor));
        if (!jurosMap.has(tx.conta_id)) {
          jurosMap.set(tx.conta_id, { total: 0, count: 0 });
        }
        const entry = jurosMap.get(tx.conta_id)!;
        entry.total += valor;
        entry.count++;
      }
    }

    for (const [contaId, { total, count }] of jurosMap) {
      const conta = contas.find(c => c.id === contaId);
      result.push({
        contaId,
        contaNome: conta?.nome || 'Conta desconhecida',
        jurosTotal: total,
        jurosCount: count,
      });
    }

    return result;
  }, [allTransactions, contas]);

  // Parcelamentos processing (existing logic)
  const debtGroups = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];

    const grouped = new Map<string, Transacao[]>();

    for (const tx of transactions) {
      const descLower = tx.descricao.toLowerCase();
      if (
        descLower.includes('crédito por parcelamento') ||
        descLower.includes('credito por parcelamento') ||
        /pagamento\s+(d[ae]\s+)?fatura/.test(descLower)
      ) {
        continue;
      }

      const key = getGroupKey(tx);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(tx);
    }

    const result: DebtGroup[] = [];

    for (const [key, txs] of grouped) {
      const latest = txs.reduce((a, b) =>
        (a.parcela_atual || 0) >= (b.parcela_atual || 0) ? a : b
      );

      const parcelaAtual = latest.parcela_atual || 0;
      const parcelaTotal = latest.parcela_total || 0;
      const remaining = Math.max(0, parcelaTotal - parcelaAtual);
      const valorNum = Math.abs(Number(latest.valor));

      if (remaining === 0) continue;
      if (!valorNum || isNaN(valorNum)) continue;

      const mesComp = latest.mes_competencia || latest.data.substring(0, 7);
      const mesTermino = addMonths(mesComp, remaining);
      const isFatura = /parcela da fatura/i.test(latest.descricao);

      result.push({
        key,
        displayName: isFatura
          ? `Fatura de ${extractFaturaMonth(latest.descricao) || 'N/A'}`
          : cleanEstablishmentName(latest.descricao),
        descricao: latest.descricao,
        parcelaAtual,
        parcelaTotal,
        valorMensal: valorNum,
        parcelasRestantes: remaining,
        valorRestante: valorNum * remaining,
        mesCompetencia: mesComp,
        mesTermino,
        progressPercent: Math.round((parcelaAtual / parcelaTotal) * 100),
        isFatura,
        faturaMonth: isFatura ? extractFaturaMonth(latest.descricao) : undefined,
        categoria: latest.categoria,
      });
    }

    result.sort((a, b) => b.valorRestante - a.valorRestante);
    return result;
  }, [transactions]);

  const faturaDebts = useMemo(
    () => debtGroups.filter((d) => d.isFatura),
    [debtGroups]
  );

  const purchaseDebts = useMemo(
    () => debtGroups.filter((d) => !d.isFatura),
    [debtGroups]
  );

  // Summary calculations
  const summary = useMemo(() => {
    const totalRestanteParcelamentos = debtGroups.reduce((s, d) => s + d.valorRestante, 0);
    const totalMensalParcelamentos = debtGroups.reduce((s, d) => s + d.valorMensal, 0);
    const totalMensalEmprestimos = loanGroups.reduce((s, l) => s + l.valorMedio, 0);
    const totalMensalRecorrentes = recurringDebts.reduce((s, r) => s + r.valorMedio, 0);
    const totalMensal = totalMensalParcelamentos + totalMensalEmprestimos + totalMensalRecorrentes;
    const mesesAteQuitar = debtGroups.length > 0
      ? Math.max(...debtGroups.map((d) => d.parcelasRestantes))
      : 0;

    return {
      totalRestanteParcelamentos,
      totalMensalParcelamentos,
      totalMensalEmprestimos,
      totalMensalRecorrentes,
      totalMensal,
      mesesAteQuitar,
    };
  }, [debtGroups, loanGroups, recurringDebts]);

  // Monthly projection (next 12 months)
  const projection = useMemo(() => {
    if (debtGroups.length === 0 && loanGroups.length === 0 && recurringDebts.length === 0) return [];

    const now = new Date();
    const currentYYYYMM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const months: {
      mes: string;
      label: string;
      parcelamentos: number;
      emprestimos: number;
      recorrentes: number;
      total: number;
      parcelasEncerram: number;
    }[] = [];

    const emprestimoMensal = loanGroups.reduce((s, l) => s + l.valorMedio, 0);
    const recorrenteMensal = recurringDebts.reduce((s, r) => s + r.valorMedio, 0);

    for (let i = 0; i <= 12; i++) {
      const mes = addMonths(currentYYYYMM, i);
      let parcelamentos = 0;
      let parcelasEncerram = 0;

      for (const debt of debtGroups) {
        if (mes <= debt.mesTermino) {
          parcelamentos += debt.valorMensal;
        }
        if (debt.mesTermino === mes) {
          parcelasEncerram++;
        }
      }

      const total = parcelamentos + emprestimoMensal + recorrenteMensal;

      const [y, m] = mes.split('-').map(Number);
      months.push({
        mes,
        label: `${getMonthName(m - 1)}/${y}`,
        parcelamentos,
        emprestimos: emprestimoMensal,
        recorrentes: recorrenteMensal,
        total,
        parcelasEncerram,
      });
    }

    return months;
  }, [debtGroups, loanGroups, recurringDebts]);

  const getContaNome = (contaId: string) => contas?.find(c => c.id === contaId)?.nome || '';

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Dívidas</h1>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const hasAnyDebt = debtGroups.length > 0 || loanGroups.length > 0 || recurringDebts.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Dívidas & Obrigações</h1>
        <p className="text-sm text-muted-foreground">
          Visão completa: empréstimos, parcelamentos e comprometimento mensal
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Comprometimento mensal
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {formatCurrency(summary.totalMensal)}
            </p>
            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {summary.totalMensalEmprestimos > 0 && (
                <p>Empréstimos: {formatCurrency(summary.totalMensalEmprestimos)}</p>
              )}
              {summary.totalMensalParcelamentos > 0 && (
                <p>Parcelamentos: {formatCurrency(summary.totalMensalParcelamentos)}</p>
              )}
              {summary.totalMensalRecorrentes > 0 && (
                <p>Recorrentes: {formatCurrency(summary.totalMensalRecorrentes)}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Dívida restante (parcelas)
            </CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {formatCurrency(summary.totalRestanteParcelamentos)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {debtGroups.length} parcelamento{debtGroups.length !== 1 ? 's' : ''} ativo{debtGroups.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Empréstimos bancários
            </CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(summary.totalMensalEmprestimos)}
              <span className="text-sm font-normal text-muted-foreground">/mês</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {loanGroups.length} contrato{loanGroups.length !== 1 ? 's' : ''}
              {recurringDebts.length > 0 && ` + ${recurringDebts.length} recorrente`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Meses até quitar parcelas
            </CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary.mesesAteQuitar}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                {summary.mesesAteQuitar === 1 ? 'mês' : 'meses'}
              </span>
            </p>
            {summary.mesesAteQuitar > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Previsão: {formatMesCompetencia(addMonths(
                  `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
                  summary.mesesAteQuitar
                ))}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cheque Especial Warning */}
      {chequeEspecialAccounts.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-sm text-destructive">Cheque especial ativo</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Juros de cheque especial são os mais caros do mercado (8-15% a.m.). Priorize quitar primeiro.
                </p>
                <div className="mt-2 space-y-1">
                  {chequeEspecialAccounts.map(acc => (
                    <div key={acc.contaId} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{acc.contaNome}</span>
                      <span>
                        <span className="font-medium text-destructive">{formatCurrency(acc.jurosTotal)}</span>
                        <span className="text-xs text-muted-foreground ml-1">
                          em juros ({acc.jurosCount} cobranças)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empréstimos Bancários */}
      {(loanGroups.length > 0 || recurringDebts.length > 0) && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Empréstimos & financiamentos</h2>
            <Badge variant="secondary">{loanGroups.length + recurringDebts.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Detectados automaticamente dos extratos bancários
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {loanGroups.map((loan) => (
              <Card key={loan.contrato}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Contrato {loan.contrato}</p>
                      <p className="text-xs text-muted-foreground">{getContaNome(loan.contaId)}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {loan.mesesConsecutivos} meses
                    </Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Parcela média</span>
                    <span className="font-semibold">{formatCurrency(loan.valorMedio)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Último pagamento</span>
                    <span className="text-xs">
                      {new Date(loan.ultimoPagamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  {loan.pagamentos.length > 1 && (
                    <div className="text-xs text-muted-foreground pt-1 border-t">
                      Histórico: {loan.pagamentos.slice(-3).map(p => {
                        const d = new Date(p.data + 'T12:00:00');
                        return `${d.toLocaleDateString('pt-BR', { month: 'short' })} ${formatCurrency(p.valor)}`;
                      }).join(' → ')}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {recurringDebts.map((rd) => (
              <Card key={rd.descricao} className="border-amber-200 dark:border-amber-800">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{rd.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        Pago via PIX — {rd.pagamentos.length} pagamento{rd.pagamentos.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <PiggyBank className="h-4 w-4 text-amber-600" />
                  </div>
                  <Separator />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor fixo</span>
                    <span className="font-semibold">{formatCurrency(rd.valorMedio)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground pt-1 border-t">
                    Pagamentos: {rd.pagamentos.map(p => {
                      const d = new Date(p.data + 'T12:00:00');
                      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                    }).join(', ')}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Parcelamentos de Fatura */}
      {faturaDebts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-warning" />
            <h2 className="text-lg font-semibold">Parcelamentos de fatura</h2>
            <Badge variant="destructive">{faturaDebts.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Faturas que foram refinanciadas — incluem juros de 8-17% a.m.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {faturaDebts.map((debt) => (
              <Card key={debt.key} className="border-warning/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {debt.displayName}
                    </CardTitle>
                    <Badge variant="outline">
                      {debt.parcelaAtual}/{debt.parcelaTotal}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor mensal</span>
                    <span className="font-medium">
                      {formatCurrency(debt.valorMensal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Restante ({debt.parcelasRestantes}x)</span>
                    <span className="font-medium text-destructive">
                      {formatCurrency(debt.valorRestante)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Termina em</span>
                    <span className="font-medium">
                      {formatMesCompetencia(debt.mesTermino)}
                    </span>
                  </div>
                  <Progress value={debt.progressPercent} className="h-2" />
                  <p className="text-center text-xs text-muted-foreground">
                    {debt.progressPercent}% pago
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Compras Parceladas */}
      {purchaseDebts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Compras parceladas</h2>
            <Badge variant="secondary">{purchaseDebts.length}</Badge>
          </div>

          <div className="space-y-2">
            {purchaseDebts.map((debt) => (
              <Card key={debt.key}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium" title={debt.descricao}>
                        {debt.displayName}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">
                          {debt.parcelaAtual}/{debt.parcelaTotal}
                        </Badge>
                        <span>Termina {formatMesCompetencia(debt.mesTermino)}</span>
                        {debt.categoria && debt.categoria !== 'Outros' && (
                          <span>· {debt.categoria}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-right shrink-0">
                      <div>
                        <p className="text-xs text-muted-foreground">Mensal</p>
                        <p className="font-medium text-sm">
                          {formatCurrency(debt.valorMensal)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Restante ({debt.parcelasRestantes}x)</p>
                        <p className="font-medium text-sm text-destructive">
                          {formatCurrency(debt.valorRestante)}
                        </p>
                      </div>
                      <div className="hidden w-16 sm:block">
                        <p className="mb-1 text-right text-[10px] text-muted-foreground">
                          {debt.progressPercent}%
                        </p>
                        <Progress value={debt.progressPercent} className="h-1.5" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Projeção Mensal */}
      {projection.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Projeção de comprometimento mensal</h2>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Estimativa dos próximos 12 meses (empréstimos assumem continuidade)
          </p>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium">Mês</th>
                      <th className="px-4 py-3 text-right font-medium">Empréstimos</th>
                      <th className="px-4 py-3 text-right font-medium">Parcelas</th>
                      <th className="px-4 py-3 text-right font-medium">Total</th>
                      <th className="px-4 py-3 text-center font-medium">Encerram</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projection.map((month, i) => {
                      const isCurrentMonth = i === 0;
                      const prevTotal = i > 0 ? projection[i - 1].total : month.total;
                      const dropped = prevTotal > 0 && month.total < prevTotal * 0.85;

                      return (
                        <tr
                          key={month.mes}
                          className={`border-b last:border-0 ${
                            isCurrentMonth
                              ? 'bg-primary/5 font-medium'
                              : dropped
                              ? 'bg-green-50 dark:bg-green-950/20'
                              : ''
                          }`}
                        >
                          <td className="px-4 py-2.5">
                            {month.label}
                            {isCurrentMonth && (
                              <span className="ml-2 text-xs text-primary">(atual)</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">
                            {formatCurrency(month.emprestimos + month.recorrentes)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">
                            {formatCurrency(month.parcelamentos)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium">
                            {formatCurrency(month.total)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {month.parcelasEncerram > 0 ? (
                              <Badge
                                variant="secondary"
                                className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs"
                              >
                                -{month.parcelasEncerram}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!hasAnyDebt && !isLoading && (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <Landmark className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">Nenhuma dívida encontrada</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Importe seus extratos bancários (OFX), faturas de cartão (CSV/PDF) para ver seus parcelamentos e empréstimos aqui.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
