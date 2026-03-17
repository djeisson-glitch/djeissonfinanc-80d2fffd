import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, AlertTriangle, ChevronDown, ChevronRight, Eye } from 'lucide-react';
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

export type ImportResult = {
  imported: number;
  duplicates: number;
  contaNome: string;
  duplicateItems: DuplicateInfo[];
};

interface Props {
  result: ImportResult;
  onClose: () => void;
  onForceImport: (items: DuplicateInfo[]) => void;
  forceImporting: boolean;
}

export function ImportReport({ result, onClose, onForceImport, forceImporting }: Props) {
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [forceChecked, setForceChecked] = useState(false);
  const [detailHash, setDetailHash] = useState<DuplicateInfo | null>(null);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="text-center space-y-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Check className="h-6 w-6 text-green-500" />
        </div>
        <p className="font-semibold text-lg">Resumo da Importação</p>
        <p className="text-sm text-muted-foreground">Conta: {result.contaNome}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <Check className="h-4 w-4 text-green-500 shrink-0" />
          <span className="text-sm font-medium">{result.imported} transações importadas com sucesso</span>
        </div>

        <div className={`flex items-center gap-2 p-3 rounded-lg ${result.duplicates > 0 ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-muted'}`}>
          <AlertTriangle className={`h-4 w-4 shrink-0 ${result.duplicates > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
          <span className="text-sm font-medium">{result.duplicates} duplicatas ignoradas</span>
        </div>
      </div>

      {/* Expandable duplicates section */}
      {result.duplicateItems.length > 0 && (
        <Collapsible open={duplicatesOpen} onOpenChange={setDuplicatesOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between text-sm">
              <span>Duplicatas Ignoradas ({result.duplicateItems.length})</span>
              {duplicatesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ScrollArea className="max-h-[200px]">
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
                      <TableCell className="text-xs py-2">{formatDate(item.data)}</TableCell>
                      <TableCell className="text-xs py-2 max-w-[140px] truncate">{item.descricao}</TableCell>
                      <TableCell className="text-xs py-2 text-right">{formatCurrency(item.valor)}</TableCell>
                      <TableCell className="py-2">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDetailHash(item)}>
                          <Eye className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {/* Force import */}
            <div className="mt-3 space-y-2 border-t pt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={forceChecked} onCheckedChange={(v) => setForceChecked(!!v)} />
                <span className="text-xs text-muted-foreground">Forçar importação de duplicatas</span>
              </label>
              {forceChecked && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs"
                  disabled={forceImporting}
                  onClick={() => onForceImport(result.duplicateItems)}
                >
                  {forceImporting ? 'Importando...' : `Importar ${result.duplicateItems.length} duplicatas`}
                </Button>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      <Button onClick={onClose} className="w-full">Fechar</Button>

      {/* Hash detail dialog */}
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
              <div>
                <span className="text-muted-foreground">Hash gerado:</span>
                <p className="font-mono text-xs bg-muted p-2 rounded break-all">{detailHash.hash_transacao}</p>
              </div>
              <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  Motivo: Já existe transação idêntica em {formatDate(detailHash.existing_data || detailHash.data)}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
