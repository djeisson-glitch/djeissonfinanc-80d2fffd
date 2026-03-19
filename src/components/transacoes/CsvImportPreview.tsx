import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useEnterSubmit } from '@/hooks/useEnterSubmit';

export type CsvPreviewEntry = {
  lineNumber: number;
  content: string;
  status: 'will_import' | 'duplicate' | 'rejected';
  reason: string;
  hash_transacao?: string;
};

interface Props {
  fileName: string;
  totalLines: number;
  entries: CsvPreviewEntry[];
  onBack: () => void;
  onConfirm: () => void;
  confirming: boolean;
}

const statusConfig = {
  will_import: {
    label: '✅ será importada',
    icon: CheckCircle2,
    badgeVariant: 'secondary' as const,
    iconClassName: 'text-primary',
  },
  duplicate: {
    label: '⚠️ duplicata',
    icon: AlertTriangle,
    badgeVariant: 'outline' as const,
    iconClassName: 'text-muted-foreground',
  },
  rejected: {
    label: '❌ rejeitada',
    icon: XCircle,
    badgeVariant: 'destructive' as const,
    iconClassName: 'text-destructive',
  },
};

export function CsvImportPreview({ fileName, totalLines, entries, onBack, onConfirm, confirming }: Props) {
  const willImportCount = entries.filter((entry) => entry.status === 'will_import').length;
  const duplicateCount = entries.filter((entry) => entry.status === 'duplicate').length;
  const rejectedCount = entries.filter((entry) => entry.status === 'rejected').length;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-lg font-semibold">Prévia completa do CSV</p>
        <p className="text-sm text-muted-foreground">Nada será salvo no banco até você confirmar a importação.</p>
      </div>

      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <p className="font-medium break-all">{fileName}</p>
        <p className="text-muted-foreground">{totalLines} linhas lidas do arquivo</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">✅ Será importada</p>
          <p className="text-lg font-semibold">{willImportCount}</p>
        </div>
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">⚠️ Duplicata</p>
          <p className="text-lg font-semibold">{duplicateCount}</p>
        </div>
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">❌ Rejeitada</p>
          <p className="text-lg font-semibold">{rejectedCount}</p>
        </div>
      </div>

      <ScrollArea className="h-[380px] rounded-md border">
        <Table className="min-w-[920px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Linha</TableHead>
              <TableHead className="w-40">Status</TableHead>
              <TableHead>Conteúdo bruto</TableHead>
              <TableHead>Motivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const config = statusConfig[entry.status];
              const Icon = config.icon;

              return (
                <TableRow key={`${entry.lineNumber}-${entry.content}-${entry.status}`}>
                  <TableCell className="font-mono text-xs">{entry.lineNumber}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-3.5 w-3.5 ${config.iconClassName}`} />
                      <Badge variant={config.badgeVariant} className="text-[10px]">
                        {config.label}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-pre-wrap break-all">{entry.content || '—'}</TableCell>
                  <TableCell className="text-xs">{entry.reason}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="outline" className="flex-1" onClick={onBack} disabled={confirming}>
          Voltar
        </Button>
        <Button className="flex-1" onClick={onConfirm} disabled={confirming}>
          {confirming ? 'Salvando...' : 'Confirmar e salvar no banco'}
        </Button>
      </div>
    </div>
  );
}
