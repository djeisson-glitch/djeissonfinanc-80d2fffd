import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/format';
import { AlertTriangle } from 'lucide-react';
import { useEnterSubmit } from '@/hooks/useEnterSubmit';
import type { ConflictMatch } from '@/lib/installment-projection';

interface Props {
  open: boolean;
  conflicts: ConflictMatch[];
  onConfirm: (resolved: ConflictMatch[]) => void;
  onCancel: () => void;
}

export function ConflictModal({ open, conflicts, onConfirm, onCancel }: Props) {
  const [choices, setChoices] = useState<Record<number, 'csv' | 'existing'>>({});

  // Reset choices when conflicts change
  useEffect(() => {
    const init: Record<number, 'csv' | 'existing'> = {};
    conflicts.forEach((_, i) => { init[i] = 'csv'; });
    setChoices(init);
  }, [conflicts]);

  const handleConfirm = () => {
    const resolved = conflicts.map((c, i) => ({
      ...c,
      choice: choices[i] || 'csv',
    }));
    onConfirm(resolved);
  };

  const csvCount = Object.values(choices).filter(v => v === 'csv').length;
  const existingCount = Object.values(choices).filter(v => v === 'existing').length;

  const handleKeyDown = useEnterSubmit(handleConfirm);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-2xl" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {conflicts.length} conflitos encontrados
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Encontramos transações no banco que parecem corresponder a linhas do CSV.
          Para cada conflito, escolha qual versão manter.
        </p>

        <div className="flex gap-2 text-xs">
          <Badge variant="secondary">CSV: {csvCount}</Badge>
          <Badge variant="outline">Existente: {existingCount}</Badge>
        </div>

        <ScrollArea className="max-h-[400px]">
          <div className="space-y-3">
            {conflicts.map((conflict, i) => {
              const csv = conflict.csvTransaction;
              const existing = conflict.existingTransaction;

              return (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Conflito #{i + 1}: {csv.descricao.substring(0, 40)}
                    {csv.parcela_atual && csv.parcela_total ? ` (${csv.parcela_atual}/${csv.parcela_total})` : ''}
                  </p>

                  <RadioGroup
                    value={choices[i] || 'csv'}
                    onValueChange={(v) => setChoices(prev => ({ ...prev, [i]: v as 'csv' | 'existing' }))}
                    className="space-y-1"
                  >
                    <div className="flex items-start gap-2 rounded-md border p-2 hover:bg-muted/50">
                      <RadioGroupItem value="csv" id={`csv-${i}`} className="mt-0.5" />
                      <Label htmlFor={`csv-${i}`} className="flex-1 cursor-pointer text-xs">
                        <span className="font-medium">Importar do CSV</span>
                        <span className="block text-muted-foreground">
                          {formatDate((csv as any).data_original || csv.data)} · {formatCurrency(csv.valor)} · {csv.pessoa}
                        </span>
                      </Label>
                    </div>
                    <div className="flex items-start gap-2 rounded-md border p-2 hover:bg-muted/50">
                      <RadioGroupItem value="existing" id={`existing-${i}`} className="mt-0.5" />
                      <Label htmlFor={`existing-${i}`} className="flex-1 cursor-pointer text-xs">
                        <span className="font-medium">Manter existente</span>
                        <span className="block text-muted-foreground">
                          {formatDate(existing.data_original || existing.data)} · {formatCurrency(existing.valor)} · {existing.pessoa}
                          {existing.descricao.includes('(auto-projetada)') && (
                            <Badge variant="outline" className="ml-1 text-[9px]">auto-projetada</Badge>
                          )}
                        </span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={handleConfirm}>
            Confirmar ({csvCount} do CSV, {existingCount} mantidas)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
