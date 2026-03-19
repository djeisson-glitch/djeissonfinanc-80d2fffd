import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/format';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MatchingTransaction {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: string;
  pessoa: string;
}

interface RecategorizarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: MatchingTransaction[];
  categoriaNome: string;
  onConfirm: () => void;
  loading?: boolean;
}

export function RecategorizarModal({
  open,
  onOpenChange,
  transactions,
  categoriaNome,
  onConfirm,
  loading,
}: RecategorizarModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Encontramos {transactions.length} transaç{transactions.length === 1 ? 'ão' : 'ões'} com o mesmo padrão
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Essas transações estão em "Outros" e podem ser recategorizadas para <strong>{categoriaNome}</strong>.
        </p>
        <ScrollArea className="max-h-[300px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Pessoa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm">{formatDate(t.data)}</TableCell>
                  <TableCell className="text-sm max-w-[180px] truncate">{t.descricao}</TableCell>
                  <TableCell className={`text-right text-sm font-medium ${t.tipo === 'receita' ? 'text-success' : 'text-destructive'}`}>
                    {t.tipo === 'receita' ? '+' : '-'}{formatCurrency(Number(t.valor))}
                  </TableCell>
                  <TableCell className="text-sm">{t.pessoa}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Ignorar
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? 'Recategorizando...' : 'Recategorizar todas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
