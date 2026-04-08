import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Trash2, Settings, AlertTriangle, RefreshCw, CalendarDays, Upload, ArrowRight } from 'lucide-react';
import { useEnterSubmit } from '@/hooks/useEnterSubmit';
import { ImportHistory } from '@/components/configuracoes/ImportHistory';
import { DebugPanel } from '@/components/configuracoes/DebugPanel';
import { autoCategorizarTransacao, REQUIRED_CATEGORIES, CATEGORY_COLORS } from '@/lib/auto-categorize';
import { useCategorias } from '@/hooks/useCategorias';
import { parseSicrediCSV, normalizeDescription } from '@/lib/csv-parser';
import { Progress } from '@/components/ui/progress';
import { formatCurrency } from '@/lib/format';

export default function ConfiguracoesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: config } = useQuery({
    queryKey: ['config', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('configuracoes').select('*').eq('user_id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: regras } = useQuery({
    queryKey: ['regras', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('regras_categorizacao').select('*').eq('user_id', user!.id).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const [receita, setReceita] = useState<number | null>(null);
  const [reserva, setReserva] = useState<number | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);
  const [recategorizing, setRecategorizing] = useState(false);
  const [dateCorrectionFile, setDateCorrectionFile] = useState<File | null>(null);
  const [dateCorrectionProgress, setDateCorrectionProgress] = useState(0);
  const [dateCorrecting, setDateCorrecting] = useState(false);
  const [dateCorrectionPreview, setDateCorrectionPreview] = useState<{
    items: { id: string; descricao: string; valor: number; currentDate: string; correctDate: string; parcela: string | null }[];
    billingPeriod: string;
    contaId: string;
  } | null>(null);
  const { categorias } = useCategorias();
  const resetKeyDown = useEnterSubmit(() => { if (resetConfirm === 'RESETAR') handleReset(); }, resetting || resetConfirm !== 'RESETAR');

  const displayReceita = receita ?? config?.receita_mensal_fixa ?? 13000;
  const displayReserva = reserva ?? config?.reserva_minima ?? 2000;

  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      await supabase.from('configuracoes').upsert({
        user_id: user!.id,
        receita_mensal_fixa: displayReceita,
        reserva_minima: displayReserva,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast({ title: 'Configurações salvas' });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('regras_categorizacao').delete().eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regras'] });
      toast({ title: 'Regra excluída' });
    },
  });

  const handleReset = async () => {
    if (!user || resetConfirm !== 'RESETAR') return;
    setResetting(true);

    try {
      // Delete all transactions
      await supabase.from('transacoes').delete().eq('user_id', user.id);
      // Delete all categorization rules
      await supabase.from('regras_categorizacao').delete().eq('user_id', user.id);
      // Delete config
      await supabase.from('configuracoes').delete().eq('user_id', user.id);
      // Reset saldo_inicial on all accounts
      await supabase.from('contas').update({ saldo_inicial: 0 }).eq('user_id', user.id);

      queryClient.clear();
      toast({ title: 'Sistema resetado com sucesso' });
      setResetDialogOpen(false);
      setResetConfirm('');
      navigate('/onboarding');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao resetar', variant: 'destructive' });
    }

    setResetting(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <Tabs defaultValue="geral" className="space-y-4">
        <TabsList>
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="historico">Histórico de Importações</TabsTrigger>
          <TabsTrigger value="debug">Debug</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Parâmetros Financeiros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Receita Mensal Fixa (R$)</Label>
              <Input type="number" value={displayReceita} onChange={e => setReceita(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Reserva Mínima Desejada (R$)</Label>
              <Input type="number" value={displayReserva} onChange={e => setReserva(Number(e.target.value))} />
            </div>
          </div>
          <Button onClick={() => saveConfigMutation.mutate()}>
            <Save className="mr-2 h-4 w-4" /> Salvar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Regras de Categorização</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Padrão</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Essencial</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="w-16">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regras?.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.padrao}</TableCell>
                  <TableCell><Badge variant="outline">{r.categoria}</Badge></TableCell>
                  <TableCell>{r.essencial ? '✓' : '✗'}</TableCell>
                  <TableCell>
                    <Badge variant={r.aprendido_auto ? 'secondary' : 'default'} className="text-xs">
                      {r.aprendido_auto ? 'Auto' : 'Manual'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteRuleMutation.mutate(r.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!regras || regras.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhuma regra cadastrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Re-categorização */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Re-categorização Automática
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Aplica o dicionário de categorias automáticas em todas as transações que ainda estão como "Outros". 
            Transações categorizadas manualmente não serão alteradas.
          </p>
          <Button
            disabled={recategorizing}
            onClick={async () => {
              if (!user) return;
              setRecategorizing(true);
              try {
                // 1. Ensure required categories exist
                const existingNames = new Set(categorias.map(c => c.nome));
                const missing = REQUIRED_CATEGORIES.filter(name => !existingNames.has(name));
                if (missing.length > 0) {
                  const inserts = missing.map(nome => ({
                    user_id: user.id,
                    nome,
                    cor: CATEGORY_COLORS[nome] || '#9ca3af',
                    parent_id: null,
                  }));
                  await supabase.from('categorias').insert(inserts);
                  queryClient.invalidateQueries({ queryKey: ['categorias'] });
                }

                // 2. Fetch all transactions with categoria = 'Outros'
                let allTx: any[] = [];
                let from = 0;
                const batchSize = 1000;
                while (true) {
                  const { data } = await supabase
                    .from('transacoes')
                    .select('id, descricao, categoria')
                    .eq('user_id', user.id)
                    .eq('categoria', 'Outros')
                    .range(from, from + batchSize - 1);
                  if (!data || data.length === 0) break;
                  allTx = allTx.concat(data);
                  if (data.length < batchSize) break;
                  from += batchSize;
                }

                // 3. Run auto-categorization
                let updated = 0;
                for (const tx of allTx) {
                  const newCat = autoCategorizarTransacao(tx.descricao);
                  if (newCat && newCat !== 'Outros') {
                    await supabase
                      .from('transacoes')
                      .update({ categoria: newCat })
                      .eq('id', tx.id);
                    updated++;
                  }
                }

                queryClient.invalidateQueries({ queryKey: ['transacoes'] });
                toast({ 
                  title: `${updated} transações recategorizadas`,
                  description: `${allTx.length} transações analisadas, ${updated} atualizadas.`
                });
              } catch (err) {
                console.error(err);
                toast({ title: 'Erro ao recategorizar', variant: 'destructive' });
              }
              setRecategorizing(false);
            }}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${recategorizing ? 'animate-spin' : ''}`} />
            {recategorizing ? 'Re-categorizando...' : 'Re-categorizar transações'}
          </Button>
        </CardContent>
      </Card>

      {/* Date Correction Tool */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Corrigir Datas de Faturas Importadas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Se transações de cartão de crédito foram importadas com datas incorretas (ex: todas com dia 01/mês), 
            faça re-upload do CSV original para corrigir as datas de compra.
          </p>

          {!dateCorrectionPreview ? (
            <div className="space-y-3">
              <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-4 cursor-pointer hover:border-foreground/30 transition-colors">
                <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                <span className="text-sm text-muted-foreground">
                  {dateCorrectionFile ? dateCorrectionFile.name : 'Selecione o CSV da fatura'}
                </span>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setDateCorrectionFile(f);
                  }}
                />
              </label>

              {dateCorrecting && <Progress value={dateCorrectionProgress} />}

              <Button
                disabled={!dateCorrectionFile || dateCorrecting}
                onClick={async () => {
                  if (!dateCorrectionFile || !user) return;
                  setDateCorrecting(true);
                  setDateCorrectionProgress(10);

                  try {
                    const text = await dateCorrectionFile.text();
                    const parsed = parseSicrediCSV(text);
                    setDateCorrectionProgress(30);

                    if (parsed.transactions.length === 0) {
                      toast({ title: 'Nenhuma transação encontrada no CSV', variant: 'destructive' });
                      setDateCorrecting(false);
                      return;
                    }

                    // Detect billing period
                    let billingPeriod = '';
                    if (parsed.detectedDueDate) {
                      billingPeriod = `${parsed.detectedDueDate.year}-${String(parsed.detectedDueDate.month + 1).padStart(2, '0')}`;
                    } else {
                      // Guess from transaction dates
                      const dates = parsed.transactions.map(t => new Date(t.data + 'T00:00:00'));
                      const latest = new Date(Math.max(...dates.map(d => d.getTime())));
                      latest.setMonth(latest.getMonth() + 1);
                      billingPeriod = `${latest.getFullYear()}-${String(latest.getMonth() + 1).padStart(2, '0')}`;
                    }

                    // Find credit card accounts
                    const { data: contas } = await supabase
                      .from('contas')
                      .select('id, nome, tipo')
                      .eq('user_id', user.id)
                      .eq('tipo', 'credito');

                    if (!contas || contas.length === 0) {
                      toast({ title: 'Nenhuma conta de cartão encontrada', variant: 'destructive' });
                      setDateCorrecting(false);
                      return;
                    }

                    setDateCorrectionProgress(50);

                    // Try each card account
                    let bestMatch: typeof dateCorrectionPreview = null;

                    for (const conta of contas) {
                      const { data: existing } = await supabase
                        .from('transacoes')
                        .select('id, descricao_normalizada, valor, data, parcela_atual, parcela_total')
                        .eq('user_id', user.id)
                        .eq('conta_id', conta.id);

                      if (!existing) continue;

                      const corrections: typeof dateCorrectionPreview extends null ? never : NonNullable<typeof dateCorrectionPreview>['items'] = [];

                      for (const csvTx of parsed.transactions) {
                        const match = existing.find(e => {
                          if (e.descricao_normalizada !== csvTx.descricao_normalizada) return false;
                          if (Math.abs(Number(e.valor) - csvTx.valor) > 0.01) return false;
                          if (e.parcela_atual !== csvTx.parcela_atual) return false;
                          if (e.parcela_total !== csvTx.parcela_total) return false;
                          return true;
                        });

                        if (match && match.data !== csvTx.data) {
                          corrections.push({
                            id: match.id,
                            descricao: csvTx.descricao,
                            valor: csvTx.valor,
                            currentDate: match.data,
                            correctDate: csvTx.data,
                            parcela: csvTx.parcela_atual ? `${csvTx.parcela_atual}/${csvTx.parcela_total}` : null,
                          });
                        }
                      }

                      if (corrections.length > 0 && (!bestMatch || corrections.length > bestMatch.items.length)) {
                        bestMatch = { items: corrections, billingPeriod, contaId: conta.id };
                      }
                    }

                    setDateCorrectionProgress(100);

                    if (!bestMatch || bestMatch.items.length === 0) {
                      toast({ title: 'Todas as datas já estão corretas', description: 'Nenhuma correção necessária.' });
                    } else {
                      setDateCorrectionPreview(bestMatch);
                    }
                  } catch (err) {
                    console.error(err);
                    toast({ title: 'Erro ao processar CSV', variant: 'destructive' });
                  } finally {
                    setDateCorrecting(false);
                  }
                }}
              >
                <CalendarDays className={`mr-2 h-4 w-4 ${dateCorrecting ? 'animate-spin' : ''}`} />
                {dateCorrecting ? 'Analisando...' : 'Verificar datas'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Datas a corrigir</p>
                  <p className="text-lg font-semibold">{dateCorrectionPreview.items.length}</p>
                </div>
                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Período</p>
                  <p className="text-lg font-semibold">{dateCorrectionPreview.billingPeriod}</p>
                </div>
              </div>

              <ScrollArea className="h-[250px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-24">Data atual</TableHead>
                      <TableHead className="w-4"></TableHead>
                      <TableHead className="w-24">Data correta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dateCorrectionPreview.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs">
                          {item.descricao}
                          {item.parcela && <Badge variant="outline" className="ml-1 text-xs">{item.parcela}</Badge>}
                        </TableCell>
                        <TableCell className="text-xs text-destructive line-through">
                          {item.currentDate.split('-').reverse().join('/')}
                        </TableCell>
                        <TableCell><ArrowRight className="h-3 w-3 text-muted-foreground" /></TableCell>
                        <TableCell className="text-xs text-primary font-medium">
                          {item.correctDate.split('-').reverse().join('/')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {dateCorrecting && <Progress value={dateCorrectionProgress} />}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={dateCorrecting}
                  onClick={() => { setDateCorrectionPreview(null); setDateCorrectionFile(null); }}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  disabled={dateCorrecting}
                  onClick={async () => {
                    if (!dateCorrectionPreview) return;
                    setDateCorrecting(true);
                    setDateCorrectionProgress(10);

                    try {
                      let updated = 0;
                      const bp = dateCorrectionPreview.billingPeriod;

                      for (let i = 0; i < dateCorrectionPreview.items.length; i++) {
                        const item = dateCorrectionPreview.items[i];
                        const { error } = await supabase
                          .from('transacoes')
                          .update({
                            data: item.correctDate,
                            data_original: item.correctDate,
                            mes_competencia: bp,
                          })
                          .eq('id', item.id);

                        if (!error) updated++;
                        setDateCorrectionProgress(10 + (90 * (i + 1)) / dateCorrectionPreview.items.length);
                      }

                      toast({
                        title: `${updated} datas corrigidas`,
                        description: `${dateCorrectionPreview.items.length} transações processadas.`,
                      });
                      setDateCorrectionPreview(null);
                      setDateCorrectionFile(null);
                      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
                      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                    } catch (err) {
                      console.error(err);
                      toast({ title: 'Erro ao corrigir datas', variant: 'destructive' });
                    } finally {
                      setDateCorrecting(false);
                    }
                  }}
                >
                  {dateCorrecting ? 'Corrigindo...' : `Corrigir ${dateCorrectionPreview.items.length} datas`}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Zona de Perigo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Ações irreversíveis. Tenha certeza antes de prosseguir.
          </p>
          <Button
            variant="destructive"
            onClick={() => { setResetConfirm(''); setResetDialogOpen(true); }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Resetar Sistema Completo
          </Button>
        </CardContent>
      </Card>
      </TabsContent>

        <TabsContent value="historico">
          <ImportHistory />
        </TabsContent>

        <TabsContent value="debug">
          <DebugPanel />
        </TabsContent>
      </Tabs>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-md" onKeyDown={resetKeyDown}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Resetar Sistema
            </DialogTitle>
            <DialogDescription className="text-left">
              <strong>⚠️ ATENÇÃO: Esta ação NÃO pode ser desfeita.</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-destructive">Será deletado:</p>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                <li>Todas as transações</li>
                <li>Todas as regras de categorização</li>
                <li>Configurações (receita mensal, reserva mínima)</li>
                <li>Saldos iniciais das contas (volta pra R$ 0)</li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Será mantido:</p>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                <li>As 4 contas criadas (Black, Mercado Pago, Sicredi Principal, Sicredi Secundário)</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Digite "RESETAR" para confirmar:</Label>
              <Input
                value={resetConfirm}
                onChange={e => setResetConfirm(e.target.value)}
                placeholder="RESETAR"
                className="border-destructive/50 focus-visible:ring-destructive"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setResetDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={resetConfirm !== 'RESETAR' || resetting}
                onClick={handleReset}
              >
                {resetting ? 'Resetando...' : 'Confirmar Reset'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}