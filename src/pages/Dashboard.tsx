import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getMonthRange, formatCurrency, getMonthName } from '@/lib/format';
import { CATEGORIAS_CONFIG, getCategoriaColor } from '@/types/database.types';
import { useCategorias } from '@/hooks/useCategorias';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, BarChart3, CreditCard } from 'lucide-react';
import { MonthSelector } from '@/components/MonthSelector';
import { ParcelasTimeline } from '@/components/dashboard/ParcelasTimeline';
import { AiInsightsCard } from '@/components/dashboard/AiInsightsCard';
import { FaturaDrawer } from '@/components/dashboard/FaturaDrawer';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { getParentForCategoria, getCategoriaById, getColor: getCatColor } = useCategorias();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const { start, end } = getMonthRange(month, year);

  const { data: config } = useQuery({
    queryKey: ['config', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('configuracoes')
        .select('*')
        .eq('user_id', user!.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const { data: transacoesMes, isLoading } = useQuery({
    queryKey: ['dashboard', 'transacoes-mes', user?.id, start, end],
    queryFn: async () => {
      const { data } = await supabase
        .from('transacoes')
        .select('*')
        .eq('user_id', user!.id)
        .eq('ignorar_dashboard', false)
        .gte('data', start < '2026-01-01' ? '2026-01-01' : start)
        .lte('data', end);
      return data || [];
    },
    enabled: !!user,
  });

  // Credit card invoice data
  const { data: contas } = useQuery({
    queryKey: ['contas', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('contas').select('*').eq('user_id', user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const creditCards = contas?.filter(c => c.tipo === 'credito') || [];

  const { data: faturaData } = useQuery({
    queryKey: ['dashboard', 'faturas', user?.id, month, year],
    queryFn: async () => {
      if (creditCards.length === 0) return {};
      const cardIds = creditCards.map(c => c.id);
      const billingPeriod = `${year}-${String(month + 1).padStart(2, '0')}`;
      
      // First try to find transactions by mes_competencia (billing period)
      const { data: byPeriod } = await supabase
        .from('transacoes')
        .select('conta_id, tipo, valor, descricao, mes_competencia')
        .eq('user_id', user!.id)
        .eq('ignorar_dashboard', false)
        .in('conta_id', cardIds)
        .eq('mes_competencia', billingPeriod);
      
      // Fallback: also get by date range for older imports without mes_competencia
      const { data: byDate } = await supabase
        .from('transacoes')
        .select('conta_id, tipo, valor, descricao, mes_competencia')
        .eq('user_id', user!.id)
        .eq('ignorar_dashboard', false)
        .in('conta_id', cardIds)
        .is('mes_competencia', null)
        .gte('data', start)
        .lte('data', end);

      const allTxs = [...(byPeriod || []), ...(byDate || [])];
      
      const faturas: Record<string, { despesas: number; pagamentos: number }> = {};
      allTxs.forEach(t => {
        if (!faturas[t.conta_id]) faturas[t.conta_id] = { despesas: 0, pagamentos: 0 };
        if (t.tipo === 'despesa') {
          faturas[t.conta_id].despesas += Number(t.valor);
        }
        const desc = t.descricao.toLowerCase();
        const isDevolution = desc.includes('devoluc') || desc.includes('devolução') || desc.includes('estorno');
        if (!isDevolution && (desc.includes('pag fat') || desc.includes('pagamento fatura') || desc.includes('pag fat deb cc'))) {
          faturas[t.conta_id].pagamentos += Math.abs(Number(t.valor));
        }
        if (isDevolution && t.tipo === 'receita') {
          faturas[t.conta_id].despesas -= Number(t.valor);
        }
      });
      return faturas;
    },
    enabled: !!user && creditCards.length > 0,
  });

  const { data: parcelasAno } = useQuery({
    queryKey: ['dashboard', 'parcelas-ano', user?.id],
    queryFn: async () => {
      const year = new Date().getFullYear();
      const { data } = await supabase
        .from('transacoes')
        .select('*')
        .eq('user_id', user!.id)
        .eq('ignorar_dashboard', false)
        .not('parcela_total', 'is', null)
        .gte('data', `${year}-01-01`)
        .lte('data', `${year}-12-31`);
      return data || [];
    },
    enabled: !!user,
  });

  const receita = config?.receita_mensal_fixa || 13000;
  const reserva = config?.reserva_minima || 2000;

  const totalDespesas = transacoesMes?.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0) || 0;
  const totalReceitas = transacoesMes?.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0) || 0;
  const saldoProjetado = receita + totalReceitas - totalDespesas;
  const percentGasto = receita > 0 ? (totalDespesas / receita) * 100 : 0;

  const categorias = transacoesMes
    ?.filter(t => t.tipo === 'despesa')
    .reduce((acc, t) => {
      // Group by parent category when categoria_id is available
      let catName = t.categoria;
      let catColor = getCategoriaColor(catName);
      if (t.categoria_id) {
        const parent = getParentForCategoria(t.categoria_id);
        if (parent) {
          catName = parent.nome;
          catColor = parent.cor || getCategoriaColor(catName);
        }
      }
      if (!acc[catName]) acc[catName] = { total: 0, essencial: t.essencial, color: catColor };
      acc[catName].total += Number(t.valor);
      return acc;
    }, {} as Record<string, { total: number; essencial: boolean; color: string }>) || {};

  const categoryRanking = Object.entries(categorias)
    .map(([cat, { total, essencial, color }]) => ({ cat, total, essencial, color, pct: totalDespesas > 0 ? (total / totalDespesas) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);

  const totalEssencial = transacoesMes?.filter(t => t.tipo === 'despesa' && t.essencial).reduce((s, t) => s + Number(t.valor), 0) || 0;
  const totalNaoEssencial = totalDespesas - totalEssencial;
  const pctEssencial = totalDespesas > 0 ? (totalEssencial / totalDespesas) * 100 : 0;

  const [faturaDrawer, setFaturaDrawer] = useState<{ open: boolean; cardId: string; cardName: string }>({ open: false, cardId: '', cardName: '' });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-32" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Receita Base</p>
            <p className="text-2xl font-bold text-success">{formatCurrency(receita)}</p>
            <p className="text-xs text-muted-foreground">Configurada</p>
          </CardContent>
        </Card>
        {totalReceitas > 0 ? (
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/transacoes?tipo=receita')}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Receitas do Mês</p>
              <p className="text-2xl font-bold text-success">{formatCurrency(totalReceitas)}</p>
              <p className="text-xs text-muted-foreground">{transacoesMes?.filter(t => t.tipo === 'receita').length} transações</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/transacoes?tipo=despesa')}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Despesas</p>
              <p className="text-2xl font-bold text-destructive">{formatCurrency(totalDespesas)}</p>
            </CardContent>
          </Card>
        )}
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/transacoes?tipo=despesa')}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Despesas</p>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(totalDespesas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Saldo Projetado</p>
            <p className={`text-2xl font-bold ${saldoProjetado >= reserva ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(saldoProjetado)}
            </p>
            <p className="text-xs text-muted-foreground">{percentGasto.toFixed(1)}% da receita</p>
            <Progress value={Math.min(percentGasto, 100)} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Credit Card Invoices */}
      {creditCards.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {creditCards.map(card => {
            const fatura = faturaData?.[card.id];
            const faturaTotal = fatura?.despesas || 0;
            const pagTotal = fatura?.pagamentos || 0;
            const status = faturaTotal <= 0
              ? { label: 'Sem fatura', emoji: '', color: '#9ca3af' }
              : pagTotal >= faturaTotal
                ? { label: 'Paga', emoji: '🟢', color: '#10b981' }
                : pagTotal > 0
                  ? { label: 'Parcialmente paga', emoji: '🟡', color: '#f59e0b' }
                  : { label: 'Em aberto', emoji: '🔴', color: '#ef4444' };

            return (
              <Card key={card.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setFaturaDrawer({ open: true, cardId: card.id, cardName: card.nome })}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{card.nome}</span>
                    <Badge
                      variant="outline"
                      className="ml-auto text-xs"
                      style={{ borderColor: status.color, color: status.color }}
                    >
                      {status.emoji} {status.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Fatura atual</p>
                  <p className="text-lg font-bold text-destructive">{formatCurrency(faturaTotal)}</p>
                  {pagTotal > 0 && pagTotal < faturaTotal && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Pago: {formatCurrency(pagTotal)} de {formatCurrency(faturaTotal)}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Ranking de Categorias
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categoryRanking.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma despesa este mês</p>
            ) : (
              <div className="space-y-3">
                {categoryRanking.map(({ cat, total, pct, color }) => (
                  <button
                    key={cat}
                    className="flex items-center justify-between w-full hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors cursor-pointer text-left"
                    onClick={() => navigate(`/transacoes?categoria=${encodeURIComponent(cat)}`)}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm font-medium">{cat}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">{formatCurrency(total)}</span>
                      <span className="text-xs text-muted-foreground ml-2">{pct.toFixed(0)}%</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <ParcelasTimeline parcelas={parcelasAno || []} />


        <AiInsightsCard context={{
          receita,
          totalDespesas,
          totalReceitas,
          saldoProjetado,
          percentGasto,
          reserva,
          totalEssencial,
          totalNaoEssencial,
          pctEssencial,
          topCategorias: categoryRanking.slice(0, 5),
          parcelasAtivas: parcelasAno?.length,
          faturasPendentes: creditCards.filter(c => {
            const f = faturaData?.[c.id];
            return f && f.despesas > 0 && f.pagamentos < f.despesas;
          }).length,
        }} />

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Essenciais vs Não-Essenciais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div
                className="cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
                onClick={() => navigate('/transacoes?essencial=true')}
              >
                <p className="text-sm text-muted-foreground">Essenciais</p>
                <p className="text-xl font-bold text-success">{formatCurrency(totalEssencial)}</p>
                <p className="text-xs text-muted-foreground">{pctEssencial.toFixed(0)}% (meta: 70%)</p>
              </div>
              <div
                className="cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
                onClick={() => navigate('/transacoes?essencial=false')}
              >
                <p className="text-sm text-muted-foreground">Não-essenciais</p>
                <p className="text-xl font-bold text-warning">{formatCurrency(totalNaoEssencial)}</p>
                <p className="text-xs text-muted-foreground">{(100 - pctEssencial).toFixed(0)}% (meta: 30%)</p>
              </div>
            </div>
            <div className="relative h-4 rounded-full bg-muted overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-foreground/20 rounded-full transition-all"
                style={{ width: `${pctEssencial}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-muted-foreground">Essenciais</span>
              <span className="text-xs text-muted-foreground">Não-essenciais</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <FaturaDrawer
        open={faturaDrawer.open}
        onOpenChange={(open) => setFaturaDrawer(prev => ({ ...prev, open }))}
        cardId={faturaDrawer.cardId}
        cardName={faturaDrawer.cardName}
        start={start}
        end={end}
        month={month}
        year={year}
      />
    </div>
  );
}
