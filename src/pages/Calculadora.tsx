import { useState } from 'react';
import { formatCurrency } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CategoryTable } from '@/components/orcamento/CategoryTable';
import {
  type BudgetData,
  type BudgetItem,
  type CategoryKey,
  CATEGORIES,
  categoryConfig,
  calculateItemTotal,
  calculateSupplierTotal,
  createEmptyBudget,
} from '@/components/orcamento/types';

export default function CalculadoraPage() {
  const { toast } = useToast();
  const [budget, setBudget] = useState<BudgetData>(createEmptyBudget());

  const updateItems = (category: CategoryKey, items: BudgetItem[]) => {
    setBudget(prev => ({
      ...prev,
      items: { ...prev.items, [category]: items },
    }));
  };

  // Calculations
  const subtotal1 = CATEGORIES.reduce((sum, cat) => {
    const config = categoryConfig[cat];
    return sum + budget.items[cat].reduce((s, item) => s + calculateItemTotal(item, config), 0);
  }, 0);

  const supplierCost = CATEGORIES.reduce((sum, cat) => {
    const config = categoryConfig[cat];
    return sum + budget.items[cat]
      .filter(i => i.hasSupplier)
      .reduce((s, item) => s + calculateSupplierTotal(item, config), 0);
  }, 0);

  const markupValue = subtotal1 * (budget.markupPercent / 100);
  const subtotal2 = subtotal1 + markupValue;
  const impostosValue = subtotal2 * (budget.impostoPercent / 100);
  const bvValue = subtotal2 * (budget.bvPercent / 100);
  const comissaoValue = subtotal2 * (budget.comissaoPercent / 100);
  const total = subtotal2 + impostosValue + bvValue + comissaoValue;
  const margem = total - supplierCost;
  const margemPercent = total > 0 ? (margem / total) * 100 : 0;

  const getMargemColor = () => {
    if (margemPercent >= 70) return 'text-emerald-500';
    if (margemPercent >= 40) return 'text-amber-500';
    return 'text-red-500';
  };

  return (
    <div className="space-y-3 animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold">Orçamento #{budget.id}</h1>
          <div className="flex gap-3 mt-1">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Cliente:</Label>
              <Input
                value={budget.cliente}
                onChange={e => setBudget(prev => ({ ...prev, cliente: e.target.value }))}
                className="h-6 text-xs w-[180px] border-none bg-muted/50 px-2"
                placeholder="Nome do cliente"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Projeto:</Label>
              <Input
                value={budget.projeto}
                onChange={e => setBudget(prev => ({ ...prev, projeto: e.target.value }))}
                className="h-6 text-xs w-[200px] border-none bg-muted/50 px-2"
                placeholder="Nome do projeto"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Category Tables */}
      {CATEGORIES.map(cat => (
        <CategoryTable
          key={cat}
          category={cat}
          items={budget.items[cat]}
          onUpdate={items => updateItems(cat, items)}
        />
      ))}

      {/* Profitability Summary */}
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-xs">
            <div className="md:col-span-2 font-bold text-sm mb-1">RENTABILIDADE</div>
            <div className="md:col-span-2" />

            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub-Total 1:</span>
              <span className="font-medium">{formatCurrency(subtotal1)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">+ Markup</span>
              <Input
                type="number"
                value={budget.markupPercent || ''}
                onChange={e => setBudget(prev => ({ ...prev, markupPercent: Number(e.target.value) }))}
                className="h-5 text-xs text-center w-[40px] px-1"
              />
              <span className="text-muted-foreground">%:</span>
              <span className="font-medium ml-auto">{formatCurrency(markupValue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub-Total 2:</span>
              <span className="font-medium">{formatCurrency(subtotal2)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">+ Impostos</span>
              <Input
                type="number"
                value={budget.impostoPercent || ''}
                onChange={e => setBudget(prev => ({ ...prev, impostoPercent: Number(e.target.value) }))}
                className="h-5 text-xs text-center w-[40px] px-1"
              />
              <span className="text-muted-foreground">%:</span>
              <span className="font-medium ml-auto">{formatCurrency(impostosValue)}</span>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">+ BV</span>
              <Input
                type="number"
                value={budget.bvPercent || ''}
                onChange={e => setBudget(prev => ({ ...prev, bvPercent: Number(e.target.value) }))}
                className="h-5 text-xs text-center w-[40px] px-1"
              />
              <span className="text-muted-foreground">%:</span>
              <span className="font-medium ml-auto">{formatCurrency(bvValue)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">+ Comissão</span>
              <Input
                type="number"
                value={budget.comissaoPercent || ''}
                onChange={e => setBudget(prev => ({ ...prev, comissaoPercent: Number(e.target.value) }))}
                className="h-5 text-xs text-center w-[40px] px-1"
              />
              <span className="text-muted-foreground">%:</span>
              <span className="font-medium ml-auto">{formatCurrency(comissaoValue)}</span>
            </div>

            <div className="col-span-2 md:col-span-4 border-t border-border mt-1 pt-2 flex items-center justify-between">
              <span className="font-bold text-sm">TOTAL: {formatCurrency(total)}</span>
              <span className={`font-bold text-sm ${getMargemColor()}`}>
                Margem: {formatCurrency(margem)} ({margemPercent.toFixed(1)}%)
                {margemPercent >= 50 ? ' ✅' : margemPercent >= 20 ? ' ⚠️' : ' ❌'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => toast({ title: 'Rascunho salvo (em breve)' })}
        >
          Salvar Rascunho
        </Button>
        <Button
          size="sm"
          className="text-xs"
          onClick={() => toast({ title: 'Enviado para aprovação (em breve)' })}
        >
          Enviar Aprovação
        </Button>
      </div>
    </div>
  );
}
