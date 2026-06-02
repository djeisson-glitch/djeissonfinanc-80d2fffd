import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTH_NAMES_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];
const MONTH_NAMES_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface Props {
  /** YYYY-MM */
  value: string;
  onChange: (yyyymm: string) => void;
}

function parseYM(s: string): { year: number; month: number } {
  const [y, m] = s.split('-').map(Number);
  return { year: y || new Date().getFullYear(), month: (m || 1) - 1 };
}
function formatYM(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * Seletor de competência (YYYY-MM) com 3 modos:
 *   - Setas ← → pra avançar/voltar mês a mês
 *   - Botão central com "Mês Ano" que abre popover
 *   - Popover com grid 4x3 de meses + setas de ano
 *
 * Mantém o valor como string YYYY-MM pra simplificar persistência.
 */
export function CompetenciaPicker({ value, onChange }: Props) {
  const { year, month } = parseYM(value);
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);

  const prev = () => {
    if (month === 0) onChange(formatYM(year - 1, 11));
    else onChange(formatYM(year, month - 1));
  };
  const next = () => {
    if (month === 11) onChange(formatYM(year + 1, 0));
    else onChange(formatYM(year, month + 1));
  };

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={prev}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setPickerYear(year); }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="flex-1 h-9 font-medium">
            {MONTH_NAMES_FULL[month]} {year}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="flex items-center justify-between mb-3">
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setPickerYear(y => y - 1)}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-sm font-semibold">{pickerYear}</span>
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setPickerYear(y => y + 1)}>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTH_NAMES_SHORT.map((label, idx) => {
              const isSelected = pickerYear === year && idx === month;
              return (
                <Button
                  key={idx}
                  type="button"
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    onChange(formatYM(pickerYear, idx));
                    setOpen(false);
                  }}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={next}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
