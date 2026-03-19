import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { useCategorias } from '@/hooks/useCategorias';

interface Props {
  value: string | null;
  onValueChange: (categoriaId: string) => void;
  tipoFilter?: 'receita' | 'despesa' | null;
  placeholder?: string;
}

// Categories that are "receita" type
const RECEITA_NAMES = [
  'Salário/Pró-labore', 'Freelance/PJ', 'Receita Produtora', 'Investimentos',
  'Vendas', 'Reembolsos', 'Devoluções', 'Transferência entre contas', 'Outras receitas',
];

export function CategoriaSelector({ value, onValueChange, tipoFilter, placeholder = 'Selecione categoria' }: Props) {
  const { parents, children, getCategoriaById, getColor } = useCategorias();

  const filteredParents = tipoFilter
    ? parents.filter(p => {
        const isReceita = RECEITA_NAMES.includes(p.nome);
        return tipoFilter === 'receita' ? isReceita : !isReceita;
      })
    : parents;

  const selectedCat = value ? getCategoriaById(value) : null;
  const displayValue = selectedCat ? selectedCat.nome : undefined;

  return (
    <Select value={value || undefined} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder}>
          {selectedCat && (
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getColor(value) }} />
              {selectedCat.parent_id
                ? `↳ ${selectedCat.nome}`
                : selectedCat.nome}
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {filteredParents.map(parent => {
          const subs = children(parent.id);
          return (
            <div key={parent.id}>
              <SelectItem value={parent.id}>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: parent.cor || '#9ca3af' }} />
                  <span className="font-medium">{parent.nome}</span>
                </div>
              </SelectItem>
              {subs.map(sub => (
                <SelectItem key={sub.id} value={sub.id}>
                  <div className="flex items-center gap-2 pl-4">
                    <span className="text-muted-foreground text-xs">↳</span>
                    <span>{sub.nome}</span>
                  </div>
                </SelectItem>
              ))}
            </div>
          );
        })}
      </SelectContent>
    </Select>
  );
}
