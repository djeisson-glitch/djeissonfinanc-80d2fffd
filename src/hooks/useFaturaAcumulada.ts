import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { fetchAllRows } from '@/lib/supabase-fetch';

interface CardTxRow {
  conta_id: string;
  tipo: string;
  valor: number;
  data: string;
  mes_competencia: string | null;
  ignorar_dashboard: boolean;
}

interface FaturaMes {
  periodo: string;        // YYYY-MM
  despesas: number;       // soma das despesas do mês
  pagamentos: number;     // soma dos pagamentos do mês
  saldo: number;          // despesas - pagamentos (clamp em 0+)
}

interface FaturaAcumulada {
  saldoAnterior: number;  // soma dos saldos não pagos dos meses anteriores
  despesasMes: number;    // despesas do mês corrente (sem ignorar_dashboard)
  pagamentosMes: number;  // pagamentos do mês corrente
  totalAPagar: number;    // saldoAnterior + despesasMes − pagamentosMes
  historico: FaturaMes[];
  valorFatura: number;    // alias de despesasMes, mantido pra compat
}

/**
 * REGRA ÚNICA — SIMPLES E PREVISÍVEL
 *
 *   despesas_mes  = soma de despesas com ignorar_dashboard=false
 *   pagamentos    = soma de receitas com ignorar_dashboard=true
 *                   (toda receita "interna" do cartão é pagamento de fatura)
 *   saldoAnterior = soma de max(0, despesas_mes - pagamentos) dos meses anteriores
 *   totalAPagar   = saldoAnterior + despesas_mes_corrente - pagamentos_mes_corrente
 *
 * Sem marker, sem "encerrada pelo emissor", sem 4 modos. O extrato importa
 * as compras (categorizadas) com ignorar_dashboard=false e as linhas
 * internas (marker, pagamento da fatura, crédito por parcelamento) com
 * ignorar_dashboard=true. Aqui só lemos a flag e somamos.
 *
 * Cobertura:
 *  - Categorização preservada (despesas são as compras importadas)
 *  - Pagamento via botão "Pagar fatura" cria receita ignorar_dashboard=true
 *    no cartão = entra como pagamento aqui
 *  - Parcelas projetadas manualmente entram como despesa do mês destino
 *  - Sem ambiguidade entre rotativo, parcelamento e à vista
 */
export function useFaturaAcumulada(cardIds: string[], billingMonth: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['fatura-acumulada', user?.id, cardIds.join(','), billingMonth],
    queryFn: async () => {
      if (cardIds.length === 0) return {} as Record<string, FaturaAcumulada>;

      const allTxs = await fetchAllRows<CardTxRow>(() => supabase
        .from('transacoes')
        .select('conta_id, tipo, valor, data, mes_competencia, ignorar_dashboard')
        .eq('user_id', user!.id)
        .in('conta_id', cardIds));

      const result: Record<string, FaturaAcumulada> = {};

      for (const cardId of cardIds) {
        const cardTxs = allTxs.filter(t => t.conta_id === cardId);

        // Agrupa por período.
        //
        // REGRA DE COMPETÊNCIA DO PAGAMENTO:
        //   Pagamento (receita ignorar_dashboard=true) ABATE a fatura do
        //   MÊS ANTERIOR à data do pagamento — porque o ciclo do cartão é
        //   "fatura fechada em N → vencimento em N+1 → pagamento em N+1".
        //
        //   Antes a gente usava `t.mes_competencia || t.data.substring(0,7)`,
        //   que pra pagamentos importados do extrato (mes_competencia=null)
        //   creditava o pagamento no mês CIVIL do pagamento, não no mês da
        //   fatura. Resultado: fatura paga aparecia em aberto E fatura atual
        //   aparecia "Paga" (porque pagamentos > despesas).
        //
        //   Despesas continuam usando mes_competencia se houver, senão data.
        const byPeriod: Record<string, { despesas: number; pagamentos: number }> = {};
        for (const t of cardTxs) {
          const valor = Math.abs(Number(t.valor));
          let periodo: string;

          if (t.tipo === 'receita' && t.ignorar_dashboard) {
            // Pagamento: respeita mes_competencia se setado (UI manual seta
            // pra mês corrente). Senão, abate fatura ANTERIOR à data.
            if (t.mes_competencia) {
              periodo = t.mes_competencia;
            } else {
              const [y, m] = t.data.split('-').map(Number);
              const ant = new Date(Date.UTC(y, m - 2, 1)); // m=6 (jun) → m-2=4 (mai)
              periodo = `${ant.getUTCFullYear()}-${String(ant.getUTCMonth() + 1).padStart(2, '0')}`;
            }
            if (!byPeriod[periodo]) byPeriod[periodo] = { despesas: 0, pagamentos: 0 };
            byPeriod[periodo].pagamentos += valor;
          } else if (t.tipo === 'despesa' && !t.ignorar_dashboard) {
            periodo = t.mes_competencia || t.data.substring(0, 7);
            if (!byPeriod[periodo]) byPeriod[periodo] = { despesas: 0, pagamentos: 0 };
            byPeriod[periodo].despesas += valor;
          }
          // (despesa com ignorar=true e receita com ignorar=false são descartadas)
        }

        // Soma saldo dos meses anteriores ao billingMonth (clamp por mês:
        // sobrepagamento de um mês não vira crédito pra outro)
        let saldoAnterior = 0;
        const periodos = Object.keys(byPeriod).sort();
        const historico: FaturaMes[] = [];
        for (const p of periodos) {
          const { despesas, pagamentos } = byPeriod[p];
          const saldo = Math.max(0, despesas - pagamentos);
          historico.push({ periodo: p, despesas, pagamentos, saldo });
          if (p < billingMonth) saldoAnterior += saldo;
        }

        const cur = byPeriod[billingMonth] || { despesas: 0, pagamentos: 0 };
        const totalAPagar = saldoAnterior + cur.despesas - cur.pagamentos;

        result[cardId] = {
          saldoAnterior,
          despesasMes: cur.despesas,
          pagamentosMes: cur.pagamentos,
          totalAPagar,
          historico: historico.filter(h => h.periodo <= billingMonth),
          valorFatura: cur.despesas, // alias pra compat com Dashboard/Contas
        };
      }

      return result;
    },
    enabled: !!user && cardIds.length > 0,
  });
}
