import { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { parseSicrediCSV, type SkippedLine, type ParsedTransaction, type CsvLineLogEntry } from '@/lib/csv-parser';
import { parseOFX } from '@/lib/ofx-parser';
import { projectFutureInstallments, detectConflicts, type ConflictMatch, type ProjectableTransaction, type ProjectedInstallment } from '@/lib/installment-projection';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, Check, AlertCircle, CreditCard, CalendarDays } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ImportReport, ImportResult, DuplicateInfo, ImportedItem } from './ImportReport';
import { CsvImportPreview, type CsvPreviewEntry } from './CsvImportPreview';
import { ConflictModal } from './ConflictModal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PlannedTransaction = {
  user_id: string;
  conta_id: string;
  data: string;
  data_original: string | null;
  mes_competencia: string | null;
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
  _isOriginal: boolean;
};

interface PreparedImportPlan {
  contaNome: string;
  allTransactionsCount: number;
  newTransactions: PlannedTransaction[];
  duplicateTransactions: PlannedTransaction[];
  duplicateItems: DuplicateInfo[];
  importedOriginals: ImportedItem[];
  importedFutures: ImportedItem[];
  totalDespesas: number;
  totalReceitas: number;
  logEntries: ImportResult['logEntries'];
  previewEntries: CsvPreviewEntry[];
  autoProjectedIdsToDelete: string[];
  replacedTransactions: PlannedTransaction[];
}

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function getDefaultDueDate(transactions: ParsedTransaction[]): { month: number; year: number } {
  if (transactions.length === 0) {
    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear() };
  }

  let latest = new Date(transactions[0].data + 'T00:00:00');
  for (const t of transactions) {
    const d = new Date(t.data + 'T00:00:00');
    if (d > latest) latest = d;
  }

  const nextMonth = new Date(latest);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  return { month: nextMonth.getMonth(), year: nextMonth.getFullYear() };
}

export function CsvImportDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'csv' | 'ofx' | null>(null);
  const [contas, setContas] = useState<{ id: string; nome: string; tipo: string }[]>([]);
  const [selectedConta, setSelectedConta] = useState<string>('');
  const [detectedConta, setDetectedConta] = useState<string | null>(null);
  const [detectedAccountType, setDetectedAccountType] = useState<'corrente' | 'credito' | null>(null);
  const [needsManualSelect, setNeedsManualSelect] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [parsedSkippedLines, setParsedSkippedLines] = useState<SkippedLine[]>([]);
  const [parsedTotalLines, setParsedTotalLines] = useState(0);
  const [parsedLineLogs, setParsedLineLogs] = useState<CsvLineLogEntry[]>([]);
  const [forceImporting, setForceImporting] = useState(false);
  const [preparedPlan, setPreparedPlan] = useState<PreparedImportPlan | null>(null);
  const [pendingConflicts, setPendingConflicts] = useState<ConflictMatch[] | null>(null);
  const [conflictContext, setConflictContext] = useState<{ contaId: string; userId: string } | null>(null);

  // Credit card due date
  const [dueMonth, setDueMonth] = useState<number>(0);
  const [dueYear, setDueYear] = useState<number>(2026);
  const [dueConfirmed, setDueConfirmed] = useState(false);

  const isCredito = useMemo(() => {
    if (detectedAccountType === 'credito') return true;
    const conta = contas.find(c => c.id === selectedConta);
    return conta?.tipo === 'credito';
  }, [detectedAccountType, contas, selectedConta]);

  const dueWarning = useMemo(() => {
    if (!isCredito || parsedTransactions.length === 0) return null;
    const latestTx = parsedTransactions.reduce((latest, t) => {
      const d = new Date(t.data + 'T00:00:00');
      return d > latest ? d : latest;
    }, new Date(parsedTransactions[0].data + 'T00:00:00'));

    const dueDate = new Date(dueYear, dueMonth, 1);
    if (dueDate < latestTx) {
      return `Mês de vencimento (${MONTH_NAMES[dueMonth]}/${dueYear}) é anterior a transações no extrato`;
    }
    return null;
  }, [isCredito, parsedTransactions, dueMonth, dueYear]);

  const loadContas = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('contas').select('id, nome, tipo').eq('user_id', user.id);
    setContas(data || []);
    return data || [];
  }, [user]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'ofx') {
      toast({ title: 'Apenas arquivos .csv ou .ofx', variant: 'destructive' });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande (máx 5MB)', variant: 'destructive' });
      return;
    }

    setFile(f);
    setFileType(ext as 'csv' | 'ofx');
    setResult(null);
    setPreparedPlan(null);
    setDueConfirmed(false);
    const contasList = await loadContas();

    const text = await f.text();
    let contaDetectada: string | null = null;
    let transactions: ParsedTransaction[] = [];
    let accountType: 'corrente' | 'credito' | null = null;
    let skippedLines: SkippedLine[] = [];
    let totalLines = 0;
    let lineLogs: CsvLineLogEntry[] = [];

    if (ext === 'ofx') {
      const parsed = parseOFX(text);
      contaDetectada = parsed.contaDetectada;
      transactions = parsed.transactions;
      accountType = parsed.accountType;
    } else {
      const parsed = parseSicrediCSV(text);
      contaDetectada = parsed.contaDetectada;
      transactions = parsed.transactions;
      skippedLines = parsed.skippedLines;
      totalLines = parsed.totalLines;
      lineLogs = parsed.lineLogs;
      if (contaDetectada && ['black', 'mercado pago'].some(n => contaDetectada!.toLowerCase().includes(n))) {
        accountType = 'credito';
      }
    }

    setDetectedConta(contaDetectada);
    setDetectedAccountType(accountType);
    setParsedTransactions(transactions);
    setParsedSkippedLines(skippedLines);
    setParsedTotalLines(totalLines);
    setParsedLineLogs(lineLogs);

    const defaultDue = getDefaultDueDate(transactions);
    setDueMonth(defaultDue.month);
    setDueYear(defaultDue.year);

    if (contaDetectada && contasList) {
      const match = contasList.find(c => c.nome.toLowerCase().includes(contaDetectada!.toLowerCase()));
      if (match) {
        setSelectedConta(match.id);
        setNeedsManualSelect(false);
        if (match.tipo === 'credito') setDetectedAccountType('credito');
      } else {
        setNeedsManualSelect(true);
      }
    } else {
      setNeedsManualSelect(true);
    }
  };

  const applyDueDate = (transactions: ParsedTransaction[]): (ParsedTransaction & { _data_original: string; _mes_competencia: string })[] => {
    if (!isCredito || !dueConfirmed) {
      return transactions.map(t => ({ ...t, _data_original: t.data, _mes_competencia: '' }));
    }
    const dueDateStr = `${dueYear}-${String(dueMonth + 1).padStart(2, '0')}-01`;
    // mes_competencia = month before vencimento
    const compDate = new Date(dueYear, dueMonth - 1, 1);
    const mesCompetencia = `${compDate.getFullYear()}-${String(compDate.getMonth() + 1).padStart(2, '0')}`;
    return transactions.map(t => ({
      ...t,
      _data_original: t.data,
      _mes_competencia: mesCompetencia,
      data: dueDateStr,
    }));
  };

  const validateBeforeImport = () => {
    if (!file || !user) return null;

    if (fileType === 'csv') {
      if (parsedLineLogs.length === 0) {
        toast({ title: 'Nenhuma linha do CSV foi lida', variant: 'destructive' });
        return null;
      }
    } else if (parsedTransactions.length === 0) {
      toast({ title: 'Nenhuma transação encontrada no arquivo', variant: 'destructive' });
      return null;
    }

    if (isCredito && !dueConfirmed) {
      toast({ title: 'Confirme o mês de vencimento da fatura', variant: 'destructive' });
      return null;
    }

    if (!selectedConta) {
      toast({ title: 'Selecione uma conta', variant: 'destructive' });
      setNeedsManualSelect(true);
      return null;
    }

    return { contaId: selectedConta, currentUserId: user.id };
  };

  const buildImportPlan = async (contaId: string, currentUserId: string): Promise<PreparedImportPlan> => {
    const { data: rules } = await supabase
      .from('regras_categorizacao')
      .select('*')
      .eq('user_id', currentUserId);

    setProgress(25);

    const finalTransactions = applyDueDate(parsedTransactions);
    const allTransactions: PlannedTransaction[] = [];

    for (const t of finalTransactions) {
      let categoria = 'Outros';
      let essencial = false;
      const matchedRule = rules?.find(r =>
        t.descricao.toLowerCase().includes(r.padrao.toLowerCase())
      );
      if (matchedRule) {
        categoria = matchedRule.categoria;
        essencial = matchedRule.essencial;
      }

      const grupo_parcela = t.parcela_atual ? crypto.randomUUID() : null;

      allTransactions.push({
        user_id: currentUserId,
        conta_id: contaId,
        data: t.data,
        data_original: isCredito ? t._data_original : null,
        mes_competencia: isCredito ? t._mes_competencia : null,
        descricao: t.descricao,
        valor: t.valor,
        categoria,
        tipo: t.tipo,
        essencial,
        parcela_atual: t.parcela_atual,
        parcela_total: t.parcela_total,
        grupo_parcela,
        hash_transacao: t.hash_transacao,
        pessoa: t.pessoa,
        _isOriginal: true,
      });
    }

    setProgress(75);

    // All transactions are imported directly — no duplicate detection
    const newTransactions = allTransactions;
    const duplicateTransactions: PlannedTransaction[] = [];
    const duplicateItems: DuplicateInfo[] = [];

    const importedOriginals: ImportedItem[] = newTransactions.map(t => ({
      data: t.data,
      descricao: t.descricao,
      valor: t.valor,
      tipo: t.tipo,
      parcela_atual: t.parcela_atual,
      parcela_total: t.parcela_total,
      pessoa: t.pessoa,
    }));

    const importedFutures: ImportedItem[] = [];

    const totalDespesas = newTransactions
      .filter(t => t.tipo === 'despesa')
      .reduce((sum, transaction) => sum + Number(transaction.valor), 0);

    const totalReceitas = newTransactions
      .filter(t => t.tipo === 'receita')
      .reduce((sum, transaction) => sum + Number(transaction.valor), 0);

    const logEntries = parsedLineLogs.map((entry) => {
      if (entry.status === 'importada') {
        return { ...entry, status: 'importada' as const, reason: 'Importada com sucesso' };
      }
      return entry;
    });

    const previewEntries: CsvPreviewEntry[] = parsedLineLogs.map((entry) => {
      if (entry.status === 'importada') {
        return {
          lineNumber: entry.lineNumber,
          content: entry.content,
          status: 'will_import' as const,
          reason: 'Linha válida, será importada',
          hash_transacao: entry.hash_transacao,
        };
      }
      return {
        lineNumber: entry.lineNumber,
        content: entry.content,
        status: 'rejected' as const,
        reason: entry.reason || 'Linha não será importada',
        hash_transacao: entry.hash_transacao,
      };
    });

    const contaNome = contas.find(c => c.id === contaId)?.nome || '';

    return {
      contaNome,
      allTransactionsCount: allTransactions.length,
      newTransactions,
      duplicateTransactions,
      duplicateItems,
      importedOriginals,
      importedFutures,
      totalDespesas,
      totalReceitas,
      logEntries,
      previewEntries,
      autoProjectedIdsToDelete: [],
      replacedTransactions: [],
    };
  };

  const handleOpenPreview = async () => {
    const context = validateBeforeImport();
    if (!context) return;

    if (fileType !== 'csv') {
      await handleImport();
      return;
    }

    setImporting(true);
    setProgress(10);

    try {
      const plan = await buildImportPlan(context.contaId, context.currentUserId);
      setPreparedPlan(plan);
      setProgress(100);
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao analisar o CSV', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const handleImport = async () => {
    const context = validateBeforeImport();
    if (!context) return;

    setImporting(true);
    setProgress(10);

    try {
      const plan = preparedPlan ?? await buildImportPlan(context.contaId, context.currentUserId);

      // Step 1: Delete auto-projected duplicates from database
      let deletedCount = 0;
      if (plan.autoProjectedIdsToDelete.length > 0) {
        for (let i = 0; i < plan.autoProjectedIdsToDelete.length; i += 100) {
          const chunk = plan.autoProjectedIdsToDelete.slice(i, i + 100);
          const { error } = await supabase
            .from('transacoes')
            .delete()
            .in('id', chunk);
          if (error) {
            console.error('Error deleting auto-projected:', error);
          } else {
            deletedCount += chunk.length;
          }
        }
        console.log(`Deleted ${deletedCount} auto-projected duplicates`);
      }

      // Step 2: Insert new transactions
      let imported = 0;
      const batchSize = 50;

      for (let i = 0; i < plan.newTransactions.length; i += batchSize) {
        const batch = plan.newTransactions.slice(i, i + batchSize).map(({ _isOriginal, ...rest }) => rest as any);
        const { error, data } = await supabase
          .from('transacoes')
          .upsert(batch, { onConflict: 'user_id,hash_transacao' })
          .select('id');

        if (error) throw error;

        imported += data?.length || 0;
        setProgress(80 + (20 * (i + batch.length)) / Math.max(plan.newTransactions.length, 1));
      }

      setResult({
        imported,
        duplicates: plan.duplicateTransactions.length,
        deletedAutoProjected: deletedCount,
        contaNome: plan.contaNome,
        duplicateItems: plan.duplicateItems,
        originalItems: plan.importedOriginals,
        futureItems: plan.importedFutures,
        totalDespesas: plan.totalDespesas,
        totalReceitas: plan.totalReceitas,
        skippedLines: parsedSkippedLines,
        totalCsvLines: parsedTotalLines,
        logEntries: plan.logEntries,
      });

      await supabase.from('historico_importacoes').insert({
        user_id: context.currentUserId,
        nome_arquivo: file!.name,
        tipo_arquivo: fileType || 'csv',
        conta_nome: plan.contaNome,
        conta_id: context.contaId,
        qtd_importada: imported,
        qtd_duplicadas: plan.duplicateTransactions.length,
        qtd_total: plan.allTransactionsCount,
      });

      await supabase.from('import_logs').insert([{
        user_id: context.currentUserId,
        arquivo: file!.name,
        total_linhas_csv: parsedTotalLines,
        linhas_importadas: plan.importedOriginals.length,
        linhas_rejeitadas: parsedLineLogs.filter((entry) => entry.status !== 'importada').length,
        detalhes_json: plan.logEntries as any,
      }]);

      setPreparedPlan(null);
      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['historico_importacoes'] });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao importar', variant: 'destructive' });
    } finally {
      setImporting(false);
      setProgress(100);
    }
  };

  const handleForceImport = async (items: DuplicateInfo[]) => {
    if (!user || !selectedConta) return;
    setForceImporting(true);

    try {
      const { data: rules } = await supabase
        .from('regras_categorizacao')
        .select('*')
        .eq('user_id', user.id);

      const txs = items.map(item => {
        let categoria = 'Outros';
        let essencial = false;
        const matchedRule = rules?.find(r =>
          item.descricao.toLowerCase().includes(r.padrao.toLowerCase())
        );
        if (matchedRule) {
          categoria = matchedRule.categoria;
          essencial = matchedRule.essencial;
        }

        return {
          user_id: user.id,
          conta_id: selectedConta,
          data: item.data,
          descricao: item.descricao,
          valor: item.valor,
          categoria,
          tipo: item.valor > 0 ? 'despesa' : 'receita',
          essencial,
          parcela_atual: null,
          parcela_total: null,
          grupo_parcela: null,
          hash_transacao: item.hash_transacao + '_force_' + Date.now(),
          pessoa: item.pessoa,
        };
      });

      const { data, error } = await supabase.from('transacoes').insert(txs).select('id');
      if (error) throw error;

      const forceImported = data?.length || 0;
      toast({ title: `${forceImported} duplicatas importadas com sucesso` });

      if (result) {
        setResult({
          ...result,
          imported: result.imported + forceImported,
          duplicates: 0,
          duplicateItems: [],
        });
      }

      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao importar duplicatas', variant: 'destructive' });
    }

    setForceImporting(false);
  };

  const handleClose = () => {
    setFile(null);
    setFileType(null);
    setResult(null);
    setProgress(0);
    setNeedsManualSelect(false);
    setSelectedConta('');
    setDetectedConta(null);
    setDetectedAccountType(null);
    setParsedTransactions([]);
    setParsedSkippedLines([]);
    setParsedTotalLines(0);
    setParsedLineLogs([]);
    setForceImporting(false);
    setPreparedPlan(null);
    setDueConfirmed(false);
    onOpenChange(false);
  };

  const yearOptions = useMemo(() => {
    const now = new Date();
    return [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Importar Extrato</DialogTitle>
          <DialogDescription>Faça upload do arquivo CSV ou OFX do seu banco</DialogDescription>
        </DialogHeader>

        {!result ? (
          preparedPlan ? (
            <CsvImportPreview
              fileName={file?.name || 'arquivo.csv'}
              totalLines={parsedTotalLines || preparedPlan.previewEntries.length}
              entries={preparedPlan.previewEntries}
              confirming={importing}
              onBack={() => setPreparedPlan(null)}
              onConfirm={handleImport}
            />
          ) : (
            <div className="space-y-4">
              {!file ? (
                <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer hover:border-foreground/30 transition-colors">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Clique para selecionar um arquivo</span>
                  <span className="text-xs text-muted-foreground mt-1">.csv ou .ofx — Máximo 5MB</span>
                  <input type="file" accept=".csv,.ofx" className="hidden" onChange={handleFileSelect} />
                </label>
              ) : (
                <>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {fileType === 'ofx' ? 'OFX' : 'CSV'} — {fileType === 'csv' ? `${parsedTotalLines} linhas lidas / ${parsedTransactions.length} transações válidas` : `${parsedTransactions.length} transações encontradas`}
                      </span>
                    </div>
                  </div>

                  {detectedConta && (
                    <p className="text-sm text-primary">
                      <Check className="inline h-4 w-4 mr-1" />
                      Conta detectada: <strong>{detectedConta}</strong>
                      {isCredito && (
                        <span className="ml-2 text-muted-foreground">
                          <CreditCard className="inline h-3 w-3 mr-1" />
                          Cartão de crédito
                        </span>
                      )}
                    </p>
                  )}

                  {needsManualSelect && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        {detectedConta ? 'Conta não encontrada. Selecione:' : 'Selecione a conta:'}
                      </p>
                      <Select value={selectedConta} onValueChange={setSelectedConta}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a conta" />
                        </SelectTrigger>
                        <SelectContent>
                          {contas.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {isCredito && (
                    <div className="space-y-3 p-3 rounded-lg border border-accent/30 bg-accent/5">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-accent" />
                        <Label className="text-sm font-medium">Mês de vencimento da fatura</Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Todas as transações serão registradas no dia 01 do mês de vencimento selecionado.
                      </p>
                      <div className="flex gap-2">
                        <Select value={String(dueMonth)} onValueChange={v => { setDueMonth(Number(v)); setDueConfirmed(false); setPreparedPlan(null); }}>
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MONTH_NAMES.map((name, i) => (
                              <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={String(dueYear)} onValueChange={v => { setDueYear(Number(v)); setDueConfirmed(false); setPreparedPlan(null); }}>
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {yearOptions.map(y => (
                              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {dueWarning && (
                        <p className="text-xs flex items-center gap-1 text-destructive">
                          <AlertCircle className="h-3 w-3" />
                          {dueWarning}
                        </p>
                      )}

                      <Button
                        variant={dueConfirmed ? 'secondary' : 'outline'}
                        size="sm"
                        className="w-full"
                        onClick={() => setDueConfirmed(true)}
                      >
                        {dueConfirmed ? (
                          <><Check className="h-4 w-4 mr-1" /> Vencimento: {MONTH_NAMES[dueMonth]} {dueYear}</>
                        ) : (
                          'Confirmar vencimento'
                        )}
                      </Button>
                    </div>
                  )}

                  {importing && <Progress value={progress} />}

                  <Button
                    onClick={fileType === 'csv' ? handleOpenPreview : handleImport}
                    disabled={importing || (isCredito && !dueConfirmed)}
                    className="w-full"
                  >
                    {importing
                      ? (fileType === 'csv' ? 'Analisando linhas do CSV...' : 'Importando...')
                      : fileType === 'csv'
                        ? `Revisar ${parsedTotalLines || parsedLineLogs.length} linhas antes de importar`
                        : `Importar ${parsedTransactions.length} Transações`}
                  </Button>
                </>
              )}
            </div>
          )
        ) : (
          <ImportReport
            result={result}
            onClose={handleClose}
            onForceImport={handleForceImport}
            forceImporting={forceImporting}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
