import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { MonthSelector } from '@/components/MonthSelector';
import { formatCurrency, getMonthName } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import {
  Target, TrendingUp, TrendingDown, Minus, Save, Lightbulb,
  DollarSign, Plus, Trash2, CheckCircle2, AlertCircle, Wallet,
} from 'lucide-react';

export default function PlanejamentoPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const billingMonth = `${year}-${String(month + 1).padStart(2, '0')}`;

  // ── Fontes de receita ──
  const [newFontDesc, setNewFontDesc] = useState('');
  const [newFontValor, setNewFontValor] = useState('');

  const { data: fontesReceita } = useQuery({
    queryKey: ['fontes-receita', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('fontes_receita')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at');
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  const addFonteMutation = useMutation({
    mutationFn: async ({ descricao, valor }: { descricao: string; valor: number }) => {
      const { error } = await supabase.from('fontes_receita').insert({
        user_id: user!.id,
        descricao,
        valor,
        ativo: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fontes-receita'] });
      setNewFontDesc('');
      setNewFontValor('');
      toast({ title: 'Fonte de receita adicionada' });
    },
  });

  const deleteFonteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('fontes_receita').delete().eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fontes-receita'] });
      toast({ title: 'Fonte removida' });
    },
  });

  const toggleFonteMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      await supabase.from('fontes_receita').update({ ativo }).eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fontes-receita'] });
    },
  });

  const receitaTotal = useMemo(() => {
    return (fontesReceita || []).filter((f: any) => f.ativo).reduce((s: number, f: any) => s + Number(f.valor), 0);
  }, [fontesReceita]);

  // ── Transações do ano para médias ──
  const { data: transacoesAno } = useQuery({
    queryKey: ['planejamento', 'transacoes-ano', user?.id, year],
    queryFn: async () => {
      // Buscar por mes_competencia e por data
      const { data: byComp } = await supabase
        .from('transacoes')
        .select('categoria, valor, tipo, mes_competencia, data, descricao')
        .eq('user_id', user!.id)
        .eq('ignorar_dashboard', false)
        .eq('tipo', 'despesa')
        .gte('mes_competencia', `${year}-01`)
        .lte('mes_competencia', `${year}-12`);

      const { data: byDate } = await supabase
        .from('transacoes')
        .select('categoria, valor, tipo, mes_competencia, data, descricao')
        .eq('user_id', user!.id)
        .eq('ignorar_dashboard', false)
        .eq('tipo', 'despesa')
        .is('mes_competencia', null)
        .gte('data', `${year}-01-01`)
        .lte('data', `${year}-12-31`);

      return [...(byComp || []), ...(byDate || [])];
    },
    enabled: !!user,
  });

  // ── Planejamento salvo ──
  const { data: planejamento } = useQuery({
    queryKey: ['planejamento', user?.id, billingMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from('planejamento_categorias')
        .select('*')
        .eq('user_id', user!.id)
        .eq('mes', billingMonth);
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  // ── Cálculo de médias e categorias ──
  const categoryData = useMemo(() => {
    if (!transacoesAno) return [];

    // Meses com dados até o mês selecionado
    const monthsSet = new Set<string>();
    const catTotals: Record<string, Record<string, number>> = {};

    for (const t of transacoesAno) {
      const txMonth = t.mes_competencia || t.data.substring(0, 7);
      if (txMonth > billingMonth) continue; // Não incluir meses futuros
      monthsSet.add(txMonth);
      const cat = t.categoria || 'Outros';
      if (!catTotals[cat]) catTotals[cat] = {};
      if (!catTotals[cat][txMonth]) catTotals[cat][txMonth] = 0;
      catTotals[cat][txMonth] += Number(t.valor);
    }

    const numMonths = Math.max(monthsSet.size, 1);
    const currentMonthKey = billingMonth;

    // Build category list
    const cats = Object.entries(catTotals).map(([cat, months]) => {
      const totalAllMonths = Object.values(months).reduce((s, v) => s + v, 0);
      const media = totalAllMonths / numMonths;
      const gastoMes = months[currentMonthKey] || 0;
      const planejado = planejamento?.find((p: any) => p.categoria === cat);
      const meta = planejado ? Number(planejado.valor_planejado) : null;

      return {
        categoria: cat,
        media: Math.round(media * 100) / 100,
        gastoMes: Math.round(gastoMes * 100) / 100,
        meta,
        id: planejado?.id || null,
        mesesComDados: Object.keys(months).length,
      };
    });

    // Adicionar categorias planejadas que não têm gastos
    if (planejamento) {
      for (const p of planejamento) {
        if (!cats.find(c => c.categoria === p.categoria)) {
          cats.push({
            categoria: p.categoria,
            media: 0,
            gastoMes: 0,
            meta: Number(p.valor_planejado),
            id: p.id,
            mesesComDados: 0,
          });
        }
      }
    }

    return cats.sort((a, b) => b.media - a.media);
  }, [transacoesAno, billingMonth, planejamento]);

  // ── Estado local para edição de metas ──
  const [editingMetas, setEditingMetas] = useState<Record<string, string>>({});

  const saveMeta = async (categoria: string, valor: number) => {
    if (!user) return;
    const { error } = await supabase
      .from('planejamento_categorias')
      .upsert(
        { user_id: user.id, categoria, valor_planejado: valor, mes: billingMonth },
        { onConflict: 'user_id,categoria,mes' }
      );
    if (error) {
      toast({ title: 'Erro ao salvar meta', variant: 'destructive' });
    } else {
      queryClient.invalidateQueries({ queryKey: ['planejamento'] });
      setEditingMetas(prev => { const n = { ...prev }; delete n[categoria]; return n; });
    }
  };

  const deleteMeta = async (id: string, categoria: string) => {
    await supabase.from('planejamento_categorias').delete().eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['planejamento'] });
    setEditingMetas(prev => { const n = { ...prev }; delete n[categoria]; return n; });
  };

  // ── Resumo ──
  const totalPlanejado = categoryData.filter(c => c.meta !== null).reduce((s, c) => s + (c.meta || 0), 0);
  const totalGasto = categoryData.reduce((s, c) => s + c.gastoMes, 0);
  const totalMedia = categoryData.reduce((s, c) => s + c.media, 0);

  const getTrendIcon = (gasto: number, media: number) => {
    if (media === 0) return <Minus className="h-3 w-3 text-muted-foreground" />;
    const diff = ((gasto - media) / media) * 100;
    if (diff > 15) return <TrendingUp className="h-3 w-3 text-destructive" />;
    if (diff < -15) return <TrendingDown className="h-3 w-3 text-emerald-600" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  const getProgressColor = (gasto: number, meta: number) => {
    const pct = (gasto / meta) * 100;
    if (pct > 100) return 'bg-destructive';
    if (pct > 80) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Planejamento</h1>
        <MonthSelector month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
      </div>

      {/* ── Fontes de Receita ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Receitas do Mês
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure suas entradas mensais certas (salário, freelance, aluguel, etc.)
          </p>

          {/* Lista de fontes */}
          <div className="space-y-2">
            {(fontesReceita || []).map((f: any) => (
              <div key={f.id} className={`flex items-center justify-between p-3 rounded-lg border ${f.ativo ? 'bg-background' : 'bg-muted/50 opacity-60'}`}>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleFonteMutation.mutate({ id: f.id, ativo: !f.ativo })}
                    className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${f.ativo ? 'border-emerald-500 bg-emerald-500' : 'border-muted-foreground'}`}
                  >
                    {f.ativo && <CheckCircle2 className="h-3 w-3 text-white" />}
                  </button>
                  <span className={`font-medium ${!f.ativo ? 'line-through' : ''}`}>{f.descricao}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatCurrency(f.valor)}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteFonteMutation.mutate(f.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Adicionar nova fonte */}
          <div className="flex gap-2">
            <Input
              placeholder="Descrição (ex: Salário)"
              value={newFontDesc}
              onChange={e => setNewFontDesc(e.target.value)}
              className="flex-1"
            />
            <Input
              type="number"
              placeholder="Valor"
              value={newFontValor}
              onChange={e => setNewFontValor(e.target.value)}
              className="w-32"
            />
            <Button
              size="sm"
              disabled={!newFontDesc || !newFontValor}
              onClick={() => addFonteMutation.mutate({ descricao: newFontDesc, valor: Number(newFontValor) })}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Total */}
          <div className="flex justify-between items-center pt-3 border-t">
            <span className="font-semibold text-sm">Receita total do mês</span>
            <span className="text-lg font-bold text-emerald-600">{formatCurrency(receitaTotal)}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Resumo do Mês ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Receita</p>
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(receitaTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Gasto {getMonthName(month)}</p>
            <p className="text-lg font-bold text-destructive">{formatCurrency(totalGasto)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Planejado</p>
            <p className="text-lg font-bold">{totalPlanejado > 0 ? formatCurrency(totalPlanejado) : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Sobra estimada</p>
            <p className={`text-lg font-bold ${receitaTotal - totalGasto >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
              {formatCurrency(receitaTotal - totalGasto)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Planejamento por Categoria ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5" />
            Planejamento por Categoria — {getMonthName(month)}/{year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {categoryData.map(cat => {
              const editing = editingMetas[cat.categoria];
              const pctMedia = cat.media > 0 ? Math.round(((cat.gastoMes - cat.media) / cat.media) * 100) : 0;
              const pctMeta = cat.meta ? Math.round((cat.gastoMes / cat.meta) * 100) : null;

              return (
                <div key={cat.categoria} className="p-4 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{cat.categoria}</span>
                      {getTrendIcon(cat.gastoMes, cat.media)}
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">
                        Média: <span className="font-medium text-foreground">{formatCurrency(cat.media)}</span>
                        <span className="text-xs text-muted-foreground ml-1">({cat.mesesComDados}m)</span>
                      </span>
                      <span>
                        Gasto: <span className={`font-semibold ${cat.meta && cat.gastoMes > cat.meta ? 'text-destructive' : ''}`}>
                          {formatCurrency(cat.gastoMes)}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Progress bar se tem meta */}
                  {cat.meta !== null && pctMeta !== null && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Meta: {formatCurrency(cat.meta)}</span>
                        <span className={pctMeta > 100 ? 'text-destructive font-medium' : ''}>
                          {pctMeta}%
                          {pctMeta > 100 && <AlertCircle className="h-3 w-3 inline ml-1" />}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getProgressColor(cat.gastoMes, cat.meta)}`}
                          style={{ width: `${Math.min(pctMeta, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Insight */}
                  {cat.media > 0 && Math.abs(pctMedia) > 15 && (
                    <div className={`flex items-center gap-1 text-xs ${pctMedia > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                      <Lightbulb className="h-3 w-3" />
                      {pctMedia > 0
                        ? `${pctMedia}% acima da média de ${formatCurrency(cat.media)}/mês`
                        : `${Math.abs(pctMedia)}% abaixo da média de ${formatCurrency(cat.media)}/mês`
                      }
                    </div>
                  )}

                  {/* Edição de meta */}
                  <div className="flex items-center gap-2 pt-1">
                    {editing !== undefined ? (
                      <>
                        <Input
                          type="number"
                          value={editing}
                          onChange={e => setEditingMetas(prev => ({ ...prev, [cat.categoria]: e.target.value }))}
                          className="h-8 w-32 text-sm"
                          placeholder="Valor meta"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter' && editing) saveMeta(cat.categoria, Number(editing)); }}
                        />
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => {
                          if (editing) saveMeta(cat.categoria, Number(editing));
                        }}>
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => {
                          setEditingMetas(prev => { const n = { ...prev }; delete n[cat.categoria]; return n; });
                        }}>
                          <span className="text-xs">Cancelar</span>
                        </Button>
                      </>
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setEditingMetas(prev => ({
                            ...prev,
                            [cat.categoria]: cat.meta?.toString() || Math.round(cat.media).toString(),
                          }))}
                        >
                          <Target className="h-3 w-3 mr-1" />
                          {cat.meta !== null ? 'Editar meta' : 'Definir meta'}
                        </Button>
                        {cat.meta !== null && cat.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive"
                            onClick={() => deleteMeta(cat.id, cat.categoria)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {categoryData.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma despesa encontrada para {getMonthName(month)}/{year}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
