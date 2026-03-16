import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { parseSicrediCSV, generateFutureInstallments } from '@/lib/csv-parser';
import { parseOFX } from '@/lib/ofx-parser';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, Check, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ParsedTransaction = {
  data: string;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  parcela_atual: number | null;
  parcela_total: number | null;
  pessoa: string;
  hash_transacao: string;
};

export function CsvImportDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'csv' | 'ofx' | null>(null);
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);
  const [selectedConta, setSelectedConta] = useState<string>('');
  const [detectedConta, setDetectedConta] = useState<string | null>(null);
  const [needsManualSelect, setNeedsManualSelect] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; duplicates: number; contaNome: string } | null>(null);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);

  const loadContas = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('contas').select('id, nome').eq('user_id', user.id);
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
    const contasList = await loadContas();

    const text = await f.text();
    let contaDetectada: string | null = null;
    let transactions: ParsedTransaction[] = [];

    if (ext === 'ofx') {
      const parsed = parseOFX(text);
      contaDetectada = parsed.contaDetectada;
      transactions = parsed.transactions;
    } else {
      const parsed = parseSicrediCSV(text);
      contaDetectada = parsed.contaDetectada;
      transactions = parsed.transactions;
    }

    setDetectedConta(contaDetectada);
    setParsedTransactions(transactions);

    // Try to auto-match conta
    if (contaDetectada && contasList) {
      const match = contasList.find(c => c.nome.toLowerCase().includes(contaDetectada!.toLowerCase()));
      if (match) {
        setSelectedConta(match.id);
      } else {
        setNeedsManualSelect(true);
      }
    } else {
      setNeedsManualSelect(true);
    }
  };

  const handleImport = async () => {
    if (!file || !user || parsedTransactions.length === 0) return;
    
    const contaId = selectedConta;
    if (!contaId) {
      toast({ title: 'Selecione uma conta', variant: 'destructive' });
      setNeedsManualSelect(true);
      return;
    }

    setImporting(true);
    setProgress(10);

    try {
      // Load categorization rules
      const { data: rules } = await supabase
        .from('regras_categorizacao')
        .select('*')
        .eq('user_id', user.id);

      setProgress(30);

      let imported = 0;
      let duplicates = 0;
      const allTransactions: any[] = [];

      for (const t of parsedTransactions) {
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

        const mainTx = {
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
        };

        allTransactions.push(mainTx);

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
            });
          }
        }
      }

      setProgress(60);

      // Insert in batches
      const batchSize = 50;
      for (let i = 0; i < allTransactions.length; i += batchSize) {
        const batch = allTransactions.slice(i, i + batchSize);
        const { error, data } = await supabase
          .from('transacoes')
          .upsert(batch, { onConflict: 'user_id,hash_transacao', ignoreDuplicates: true })
          .select('id');

        if (error) console.error('Insert error:', error);
        const insertedCount = data?.length || 0;
        imported += insertedCount;
        duplicates += batch.length - insertedCount;
        setProgress(60 + (40 * (i + batch.length)) / allTransactions.length);
      }

      setResult({
        imported,
        duplicates,
        contaNome: contas.find(c => c.id === contaId)?.nome || '',
      });

      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao importar', variant: 'destructive' });
    }

    setImporting(false);
    setProgress(100);
  };

  const handleClose = () => {
    setFile(null);
    setFileType(null);
    setResult(null);
    setProgress(0);
    setNeedsManualSelect(false);
    setSelectedConta('');
    setDetectedConta(null);
    setParsedTransactions([]);
    onOpenChange(false);
  };

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
                  <p className="text-sm text-success">
                    <Check className="inline h-4 w-4 mr-1" />
                    Conta detectada: <strong>{detectedConta}</strong>
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

                {importing && <Progress value={progress} />}

                <Button onClick={handleImport} disabled={importing} className="w-full">
                  {importing ? 'Importando...' : `Importar ${parsedTransactions.length} Transações`}
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Check className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="font-medium">{result.imported} transações importadas</p>
              {result.duplicates > 0 && (
                <p className="text-sm text-muted-foreground">{result.duplicates} duplicatas ignoradas</p>
              )}
              <p className="text-sm text-muted-foreground">Conta: {result.contaNome}</p>
            </div>
            <Button onClick={handleClose} className="w-full">Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
