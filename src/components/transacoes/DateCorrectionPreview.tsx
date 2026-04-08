import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, ArrowRight } from 'lucide-react';

export interface DateCorrectionItem {
  transactionId: string;
  descricao: string;
  valor: number;
  currentDate: string; // date stored in DB
  correctDate: string; // date from CSV
  parcela: string | null;
  billingPeriod: string;
}

interface Props {
  items: DateCorrectionItem[];
  onBack: () => void;
  onConfirm: () => void;
  confirming: boolean;
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function DateCorrectionPreview({ items, onBack, onConfirm, confirming }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <p className="text-lg font-semibold">Correção de datas</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Encontramos {items.length} transações com datas que podem ser corrigidas para as datas originais do CSV.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Transações a corrigir</p>
          <p className="text-lg font-semibold">{items.length}</p>
        </div>
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Período da fatura</p>
          <p className="text-lg font-semibold">{items[0]?.billingPeriod || '—'}</p>
        </div>
      </div>

      <ScrollArea className="h-[380px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-20">Parcela</TableHead>
              <TableHead className="w-28 text-right">Valor</TableHead>
              <TableHead className="w-24">Data atual</TableHead>
              <TableHead className="w-4"></TableHead>
              <TableHead className="w-24">Data correta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.transactionId}>
                <TableCell className="text-xs">{item.descricao}</TableCell>
                <TableCell className="text-xs">{item.parcela || '—'}</TableCell>
                <TableCell className="text-xs text-right font-mono">{formatCurrency(item.valor)}</TableCell>
                <TableCell className="text-xs text-destructive line-through">{formatDate(item.currentDate)}</TableCell>
                <TableCell><ArrowRight className="h-3 w-3 text-muted-foreground" /></TableCell>
                <TableCell className="text-xs text-primary font-medium">{formatDate(item.correctDate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="outline" className="flex-1" onClick={onBack} disabled={confirming}>
          Voltar
        </Button>
        <Button className="flex-1" onClick={onConfirm} disabled={confirming}>
          {confirming ? 'Atualizando...' : `Corrigir ${items.length} datas`}
        </Button>
      </div>
    </div>
  );
}
