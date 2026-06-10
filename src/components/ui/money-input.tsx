import * as React from 'react';
import { Input } from '@/components/ui/input';

/**
 * Input de dinheiro com máscara automática (pt-BR) enquanto digita.
 *
 * Você digita só os números — o ponto de milhar e a vírgula de centavos
 * entram sozinhos. Modelo "calculadora": os 2 últimos dígitos são centavos.
 *   digita "9"     → 0,09
 *   digita "97"    → 0,97
 *   digita "9718"  → 97,18
 *   digita "100000"→ 1.000,00
 *
 * Trabalha com VALOR NUMÉRICO (reais): `value: number`, `onChange(n: number)`.
 * O display é sempre derivado do número — nada de string solta no pai.
 */
interface MoneyInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> {
  value: number;
  onChange: (value: number) => void;
}

function formatBRL(value: number): string {
  if (!value) return '';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, inputMode = 'numeric', ...props }, ref) => {
    return (
      <Input
        ref={ref}
        inputMode={inputMode}
        value={formatBRL(value)}
        onChange={(e) => {
          // Acumulador de centavos: pega TODOS os dígitos, ignora o resto.
          // parseInt cuida de zeros à esquerda ("0097" → 97).
          // Cap em 15 dígitos: acima disso parseInt estoura o limite seguro
          // de inteiro do JS e corrompe os últimos dígitos em silêncio.
          const digits = e.target.value.replace(/\D/g, '').slice(0, 15);
          onChange(digits ? parseInt(digits, 10) / 100 : 0);
        }}
        {...props}
      />
    );
  }
);
MoneyInput.displayName = 'MoneyInput';
