import { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { parseSicrediCSV, generateFutureInstallments, type SkippedLine, type ParsedTransaction, type CsvLineLogEntry } from '@/lib/csv-parser';
import { parseOFX } from '@/lib/ofx-parser';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, Check, AlertCircle, CreditCard, CalendarDays } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ImportReport, ImportResult, DuplicateInfo, ImportedItem } from './ImportReport';
function getDefaultDueDate(transactions: ParsedTransaction[]): { month: number; year: number } {
  if (transactions.length === 0) {
    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear() };
  }
  // Find latest transaction date, default due = next month
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
    setDueConfirmed(false);
    const contasList = await loadContas();

    const text = await f.text();
    let contaDetectada: string | null = null;
    let transactions: ParsedTransaction[] = [];
    let accountType: 'corrente' | 'credito' | null = null;
    let skippedLines: SkippedLine[] = [];

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
      if (contaDetectada && ['black', 'mercado pago'].some(n => contaDetectada!.toLowerCase().includes(n))) {
        accountType = 'credito';
      }
    }

    setDetectedConta(contaDetectada);
    setDetectedAccountType(accountType);
    setParsedTransactions(transactions);
    setParsedSkippedLines(skippedLines);

    // Set default due date
    const defaultDue = getDefaultDueDate(transactions);
    setDueMonth(defaultDue.month);
    setDueYear(defaultDue.year);

    if (contaDetectada && contasList) {
      const match = contasList.find(c => c.nome.toLowerCase().includes(contaDetectada!.toLowerCase()));
      if (match) {
        setSelectedConta(match.id);
        if (match.tipo === 'credito') setDetectedAccountType('credito');
      } else {
        setNeedsManualSelect(true);
      }
    } else {
      setNeedsManualSelect(true);
    }
  };

  const applyDueDate = (transactions: ParsedTransaction[]): ParsedTransaction[] => {
    if (!isCredito || !dueConfirmed) return transactions;
    const dueDateStr = `${dueYear}-${String(dueMonth + 1).padStart(2, '0')}-01`;
    return transactions.map(t => ({ ...t, data: dueDateStr }));
  };

  const handleImport = async () => {
    if (!file || !user || parsedTransactions.length === 0) return;
    
    // For credit cards, require due date confirmation
    if (isCredito && !dueConfirmed) {
      toast({ title: 'Confirme o mês de vencimento da fatura', variant: 'destructive' });
      return;
    }

    const contaId = selectedConta;
    if (!contaId) {
      toast({ title: 'Selecione uma conta', variant: 'destructive' });
      setNeedsManualSelect(true);
      return;
    }

    setImporting(true);
    setProgress(10);

    try {
      const { data: rules } = await supabase
        .from('regras_categorizacao')
        .select('*')
        .eq('user_id', user.id);

      setProgress(20);

      const finalTransactions = applyDueDate(parsedTransactions);
      const allTransactions: any[] = [];
      const originalItems: ImportedItem[] = [];
      const futureItems: ImportedItem[] = [];

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
          user_id: user.id,
          conta_id: contaId,
          data: t.data,
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

        if (t.parcela_atual && t.parcela_total && grupo_parcela) {
          const futures = generateFutureInstallments(t, grupo_parcela);
          for (const ft of futures) {
            allTransactions.push({
              user_id: user.id,
              conta_id: contaId,
              data: ft.data,
              descricao: ft.descricao,
              valor: ft.valor,
              categoria,
              tipo: ft.tipo,
              essencial,
              parcela_atual: ft.parcela_atual,
              parcela_total: ft.parcela_total,
              grupo_parcela,
              hash_transacao: ft.hash_transacao,
              pessoa: ft.pessoa,
              _isOriginal: false,
            });
          }
        }
      }

      setProgress(40);

      const allHashes = allTransactions.map(t => t.hash_transacao);
      const existingHashes = new Map<string, string>();
      
      for (let i = 0; i < allHashes.length; i += 100) {
        const chunk = allHashes.slice(i, i + 100);
        const { data: existing } = await supabase
          .from('transacoes')
          .select('hash_transacao, data')
          .eq('user_id', user.id)
          .in('hash_transacao', chunk);
        
        existing?.forEach(e => existingHashes.set(e.hash_transacao, e.data));
      }

      setProgress(55);

      const newTransactions = allTransactions.filter(t => !existingHashes.has(t.hash_transacao));
      const duplicateTransactions = allTransactions.filter(t => existingHashes.has(t.hash_transacao));

      // Strip internal _isOriginal before inserting
      let imported = 0;
      const batchSize = 50;
      for (let i = 0; i < newTransactions.length; i += batchSize) {
        const batch = newTransactions.slice(i, i + batchSize).map(({ _isOriginal, ...rest }: any) => rest);
        const { error, data } = await supabase
          .from('transacoes')
          .insert(batch)
          .select('id');

        if (error) console.error('Insert error:', error);
        imported += data?.length || 0;
        setProgress(55 + (45 * (i + batch.length)) / Math.max(newTransactions.length, 1));
      }

      const duplicateItems: DuplicateInfo[] = duplicateTransactions.map(t => ({
        data: t.data,
        descricao: t.descricao,
        valor: t.valor,
        pessoa: t.pessoa,
        hash_transacao: t.hash_transacao,
        existing_data: existingHashes.get(t.hash_transacao) || t.data,
      }));

      // Build report items from successfully imported
      const importedOriginals: ImportedItem[] = newTransactions
        .filter((t: any) => t._isOriginal)
        .map((t: any) => ({ data: t.data, descricao: t.descricao, valor: t.valor, tipo: t.tipo, parcela_atual: t.parcela_atual, parcela_total: t.parcela_total, pessoa: t.pessoa }));
      const importedFutures: ImportedItem[] = newTransactions
        .filter((t: any) => !t._isOriginal)
        .map((t: any) => ({ data: t.data, descricao: t.descricao, valor: t.valor, tipo: t.tipo, parcela_atual: t.parcela_atual, parcela_total: t.parcela_total, pessoa: t.pessoa, isFuture: true }));

      const totalDespesas = newTransactions.filter((t: any) => t.tipo === 'despesa').reduce((s: number, t: any) => s + Number(t.valor), 0);
      const totalReceitas = newTransactions.filter((t: any) => t.tipo === 'receita').reduce((s: number, t: any) => s + Number(t.valor), 0);

      const contaNome = contas.find(c => c.id === contaId)?.nome || '';

      setResult({
        imported,
        duplicates: duplicateTransactions.length,
        contaNome,
        duplicateItems,
        originalItems: importedOriginals,
        futureItems: importedFutures,
        totalDespesas,
        totalReceitas,
        skippedLines: parsedSkippedLines,
      });

      // Save import log
      await supabase.from('historico_importacoes').insert({
        user_id: user.id,
        nome_arquivo: file.name,
        tipo_arquivo: fileType || 'csv',
        conta_nome: contaNome,
        conta_id: contaId,
        qtd_importada: imported,
        qtd_duplicadas: duplicateTransactions.length,
        qtd_total: allTransactions.length,
      });

      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['historico_importacoes'] });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao importar', variant: 'destructive' });
    }

    setImporting(false);
    setProgress(100);
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
    setForceImporting(false);
    setDueConfirmed(false);
    onOpenChange(false);
  };

  // Year options for due date selector
  const yearOptions = useMemo(() => {
    const now = new Date();
    return [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar Extrato</DialogTitle>
          <DialogDescription>Faça upload do arquivo CSV ou OFX do seu banco</DialogDescription>
        </DialogHeader>

        {!result ? (
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
                      {fileType === 'ofx' ? 'OFX' : 'CSV'} — {parsedTransactions.length} transações encontradas
                    </span>
                  </div>
                </div>

                {detectedConta && (
                  <p className="text-sm text-green-500">
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

                {/* Credit card due date selector */}
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
                      <Select value={String(dueMonth)} onValueChange={v => { setDueMonth(Number(v)); setDueConfirmed(false); }}>
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTH_NAMES.map((name, i) => (
                            <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={String(dueYear)} onValueChange={v => { setDueYear(Number(v)); setDueConfirmed(false); }}>
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
                      <p className="text-xs flex items-center gap-1" style={{ color: '#f59e0b' }}>
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
                  onClick={handleImport}
                  disabled={importing || (isCredito && !dueConfirmed)}
                  className="w-full"
                >
                  {importing ? 'Importando...' : `Importar ${parsedTransactions.length} Transações`}
                </Button>
              </>
            )}
          </div>
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
