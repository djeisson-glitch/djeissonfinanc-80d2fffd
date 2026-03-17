import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Check, AlertTriangle, ChevronDown, ChevronRight, Eye, ArrowRight, TrendingDown, TrendingUp, FileSearch } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/format';
import { ScrollArea } from '@/components/ui/scroll-area';

export type DuplicateInfo = {
  data: string;
  descricao: string;
  valor: number;
  pessoa: string;
  hash_transacao: string;
  existing_data?: string;
};

export type ImportedItem = {
  data: string;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  parcela_atual: number | null;
  parcela_total: number | null;
  pessoa: string;
  isFuture?: boolean;
};

export type SkippedLineInfo = {
  lineNumber: number;
  content: string;
  reason: string;
};

export type ImportLogEntryInfo = {
  lineNumber: number;
  content: string;
  status: 'importada' | 'rejeitada' | 'duplicata' | 'ignorada';
  reason?: string;
  hash_transacao?: string;
};

export type ImportResult = {
  imported: number;
  duplicates: number;
  deletedAutoProjected?: number;
  contaNome: string;
  duplicateItems: DuplicateInfo[];
  originalItems: ImportedItem[];
  futureItems: ImportedItem[];
  totalDespesas: number;
  totalReceitas: number;
  skippedLines: SkippedLineInfo[];
  totalCsvLines: number;
  logEntries: ImportLogEntryInfo[];
};

interface Props {
  result: ImportResult;
  onClose: () => void;
  onForceImport: (items: DuplicateInfo[]) => void;
  forceImporting: boolean;
}

export function ImportReport({ result, onClose, onForceImport, forceImporting }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [forceChecked, setForceChecked] = useState(false);
  const [detailHash, setDetailHash] = useState<DuplicateInfo | null>(null);

  const saldoLiquido = result.totalReceitas - result.totalDespesas;

  const getStatusVariant = (status: ImportLogEntryInfo['status']) => {
    if (status === 'importada') return 'secondary';
    if (status === 'duplicata') return 'outline';
    if (status === 'rejeitada') return 'destructive';
    return 'outline';
  };

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Check className="h-6 w-6 text-primary" />
        </div>
        <p className="font-semibold text-lg">Resumo da Importação</p>
        <p className="text-sm text-muted-foreground">Conta: {result.contaNome}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border">
          <FileSearch className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">📄 {result.totalCsvLines} linhas lidas do CSV</span>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border">
          <Check className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium">✅ {result.originalItems.length} transações originais do CSV importadas</span>
        </div>

        {result.futureItems.length > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border">
            <ArrowRight className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-medium">🔄 {result.futureItems.length} parcelas futuras criadas automaticamente</span>
          </div>
        )}

        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border">
          <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">⚠️ {result.duplicates} duplicatas ignoradas</span>
        </div>

        <div className="p-3 rounded-lg bg-muted text-sm font-medium text-center">
          Total no sistema: {result.originalItems.length + result.futureItems.length} transações
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded-lg bg-muted text-center">
          <TrendingDown className="h-3 w-3 text-muted-foreground mx-auto mb-1" />
          <p className="text-[10px] text-muted-foreground">Despesas</p>
          <p className="text-xs font-bold">{formatCurrency(result.totalDespesas)}</p>
        </div>
        <div className="p-2 rounded-lg bg-muted text-center">
          <TrendingUp className="h-3 w-3 text-muted-foreground mx-auto mb-1" />
          <p className="text-[10px] text-muted-foreground">Receitas</p>
          <p className="text-xs font-bold">{formatCurrency(result.totalReceitas)}</p>
        </div>
        <div className="p-2 rounded-lg bg-muted text-center">
          <p className="text-[10px] text-muted-foreground">Saldo Líquido</p>
          <p className="text-xs font-bold">{formatCurrency(Math.abs(saldoLiquido))}</p>
        </div>
      </div>

      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between text-sm">
            <span>Ver Detalhes</span>
            {detailsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Tabs defaultValue="originals" className="mt-2">
            <TabsList className="w-full grid grid-cols-4 h-8">
              <TabsTrigger value="originals" className="text-[10px] px-1">Originais ({result.originalItems.length})</TabsTrigger>
              <TabsTrigger value="futures" className="text-[10px] px-1">Parcelas ({result.futureItems.length})</TabsTrigger>
              <TabsTrigger value="duplicates" className="text-[10px] px-1">Duplicatas ({result.duplicateItems.length})</TabsTrigger>
              <TabsTrigger value="skipped" className="text-[10px] px-1">Rejeitadas ({result.skippedLines.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="originals">
              <ScrollArea className="max-h-[200px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs">Descrição</TableHead>
                      <TableHead className="text-xs text-right">Valor</TableHead>
                      <TableHead className="text-xs">Parcela</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.originalItems.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs py-1.5">{formatDate(item.data)}</TableCell>
                        <TableCell className="text-xs py-1.5 max-w-[120px] truncate">{item.descricao}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right">{item.tipo === 'receita' ? '+' : '-'}{formatCurrency(item.valor)}</TableCell>
                        <TableCell className="text-xs py-1.5 text-muted-foreground">{item.parcela_atual && item.parcela_total ? `${item.parcela_atual}/${item.parcela_total}` : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="futures">
              <ScrollArea className="max-h-[200px]">
                {result.futureItems.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-6">Nenhuma parcela futura criada</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Descrição</TableHead>
                        <TableHead className="text-xs">Parcelas</TableHead>
                        <TableHead className="text-xs text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.futureItems.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs py-1.5 max-w-[140px] truncate">{item.descricao}</TableCell>
                          <TableCell className="text-xs py-1.5 text-muted-foreground">{item.parcela_atual}/{item.parcela_total}</TableCell>
                          <TableCell className="text-xs py-1.5 text-right">{formatCurrency(item.valor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="duplicates">
              <ScrollArea className="max-h-[200px]">
                {result.duplicateItems.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-6">Nenhuma duplicata</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Data</TableHead>
                          <TableHead className="text-xs">Descrição</TableHead>
                          <TableHead className="text-xs text-right">Valor</TableHead>
                          <TableHead className="text-xs w-8"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.duplicateItems.map((item, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs py-1.5">{formatDate(item.data)}</TableCell>
                            <TableCell className="text-xs py-1.5 max-w-[120px] truncate">{item.descricao}</TableCell>
                            <TableCell className="text-xs py-1.5 text-right">{formatCurrency(item.valor)}</TableCell>
                            <TableCell className="py-1.5">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDetailHash(item)}>
                                <Eye className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    <div className="mt-3 space-y-2 border-t pt-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={forceChecked} onCheckedChange={(v) => setForceChecked(!!v)} />
                        <span className="text-xs text-muted-foreground">Forçar importação de duplicatas</span>
                      </label>
                      {forceChecked && (
                        <Button size="sm" variant="outline" className="w-full text-xs" disabled={forceImporting} onClick={() => onForceImport(result.duplicateItems)}>
                          {forceImporting ? 'Importando...' : `Importar ${result.duplicateItems.length} duplicatas`}
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="skipped">
              <ScrollArea className="max-h-[200px]">
                {result.skippedLines.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-6">Todas as linhas válidas foram processadas</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-12">Linha</TableHead>
                        <TableHead className="text-xs">Conteúdo</TableHead>
                        <TableHead className="text-xs">Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.skippedLines.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs py-1.5 text-muted-foreground">{item.lineNumber}</TableCell>
                          <TableCell className="text-xs py-1.5 max-w-[140px] truncate" title={item.content}>{item.content}</TableCell>
                          <TableCell className="text-xs py-1.5">{item.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={logOpen} onOpenChange={setLogOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between text-sm">
            <span>Ver log completo ({result.logEntries.length} linhas)</span>
            {logOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ScrollArea className="max-h-[320px] mt-2 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-14">Linha</TableHead>
                  <TableHead className="text-xs">Conteúdo</TableHead>
                  <TableHead className="text-xs w-28">Status</TableHead>
                  <TableHead className="text-xs">Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.logEntries.map((entry, index) => (
                  <TableRow key={`${entry.lineNumber}-${index}`}>
                    <TableCell className="text-xs py-1.5 font-mono">{entry.lineNumber}</TableCell>
                    <TableCell className="text-xs py-1.5 max-w-[220px] truncate font-mono" title={entry.content}>{entry.content || '—'}</TableCell>
                    <TableCell className="text-xs py-1.5">
                      <Badge variant={getStatusVariant(entry.status)} className="text-[10px]">
                        {entry.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs py-1.5">{entry.reason || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>

      <Button onClick={onClose} className="w-full">Fechar</Button>

      <Dialog open={!!detailHash} onOpenChange={() => setDetailHash(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Detalhes da Duplicata</DialogTitle>
          </DialogHeader>
          {detailHash && (
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Descrição:</span>
                <p className="font-medium">{detailHash.descricao}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Data:</span>
                  <p className="font-medium">{formatDate(detailHash.data)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Valor:</span>
                  <p className="font-medium">{formatCurrency(detailHash.valor)}</p>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Pessoa:</span>
                <p className="font-medium">{detailHash.pessoa}</p>
              </div>
              <div className="p-2 rounded bg-muted border">
                <p className="text-xs">Motivo: Transação idêntica já existe em {formatDate(detailHash.existing_data || detailHash.data)}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
