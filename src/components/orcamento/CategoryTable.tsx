import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatCurrency } from '@/lib/format';
import {
  type BudgetItem,
  type CategoryKey,
  categoryConfig,
  calculateItemTotal,
  calculateSupplierTotal,
  createEmptyItem,
} from './types';

interface CategoryTableProps {
  category: CategoryKey;
  items: BudgetItem[];
  onUpdate: (items: BudgetItem[]) => void;
}

export function CategoryTable({ category, items, onUpdate }: CategoryTableProps) {
  const config = categoryConfig[category];
  const [addOpen, setAddOpen] = useState(false);
  const [newItem, setNewItem] = useState<BudgetItem>(createEmptyItem());

  const updateItem = (id: string, patch: Partial<BudgetItem>) => {
    onUpdate(items.map(i => (i.id === id ? { ...i, ...patch } : i)));
  };

  const removeItem = (id: string) => {
    onUpdate(items.filter(i => i.id !== id));
  };

  const handleAdd = () => {
    if (!newItem.name.trim()) return;
    onUpdate([...items, { ...newItem, id: crypto.randomUUID() }]);
    setNewItem(createEmptyItem());
    setAddOpen(false);
  };

  const newTotal = calculateItemTotal(newItem, config);

  const getMarginColor = (margin: number) => {
    if (margin >= 50) return 'text-emerald-500';
    if (margin >= 20) return 'text-amber-500';
    return 'text-red-500';
  };

  return (
    <div className="border border-border rounded-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
        <span className="text-xs font-bold tracking-wider text-muted-foreground">{category}</span>
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2" onClick={() => setAddOpen(true)}>
          <Plus className="h-3 w-3" /> Adicionar
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhum item</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-3 py-1.5 font-medium w-[200px]">Nome</th>
                <th className="text-center px-2 py-1.5 font-medium w-[60px]">{config.field1}</th>
                {config.field2 && (
                  <th className="text-center px-2 py-1.5 font-medium w-[60px]">{config.field2}</th>
                )}
                <th className="text-center px-2 py-1.5 font-medium w-[80px]">{config.field3}</th>
                <th className="text-right px-2 py-1.5 font-medium w-[80px]">Total</th>
                <th className="text-center px-2 py-1.5 font-medium w-[50px]">Forn?</th>
                <th className="text-center px-2 py-1.5 font-medium w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const total = calculateItemTotal(item, config);
                const supplierTotal = item.hasSupplier ? calculateSupplierTotal(item, config) : 0;
                const margin = total > 0 ? ((total - supplierTotal) / total) * 100 : 0;

                return (
                  <tr key={item.id} className="border-b border-border/50 group">
                    <td className="px-3 py-1">
                      <Input
                        value={item.name}
                        onChange={e => updateItem(item.id, { name: e.target.value })}
                        className="h-7 text-xs border-none bg-transparent px-0 focus-visible:ring-0"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        type="number"
                        value={item.field1 || ''}
                        onChange={e => updateItem(item.id, { field1: Number(e.target.value) })}
                        className="h-7 text-xs text-center w-[55px] mx-auto"
                      />
                    </td>
                    {config.field2 && (
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          value={item.field2 || ''}
                          onChange={e => updateItem(item.id, { field2: Number(e.target.value) })}
                          className="h-7 text-xs text-center w-[55px] mx-auto"
                        />
                      </td>
                    )}
                    <td className="px-1 py-1">
                      <Input
                        type="number"
                        value={item.field3 || ''}
                        onChange={e => updateItem(item.id, { field3: Number(e.target.value) })}
                        className="h-7 text-xs text-center w-[70px] mx-auto"
                      />
                    </td>
                    <td className="text-right px-2 py-1 font-medium text-xs">
                      {formatCurrency(total)}
                    </td>
                    <td className="text-center px-1 py-1">
                      <button
                        onClick={() => updateItem(item.id, { hasSupplier: !item.hasSupplier })}
                        className={`w-5 h-5 rounded-full border-2 mx-auto flex items-center justify-center transition-colors ${
                          item.hasSupplier
                            ? 'bg-primary border-primary'
                            : 'border-muted-foreground/40'
                        }`}
                      >
                        {item.hasSupplier && <span className="text-primary-foreground text-[8px]">●</span>}
                      </button>
                    </td>
                    <td className="text-center px-1 py-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                  // Can't have two rows from map easily, so we handle supplier below
                );
              })}
              {/* Supplier rows rendered separately */}
              {items.filter(i => i.hasSupplier).length > 0 && null}
            </tbody>
          </table>

          {/* Supplier detail rows */}
          {items.filter(i => i.hasSupplier).map(item => {
            const total = calculateItemTotal(item, config);
            const supplierTotal = calculateSupplierTotal(item, config);
            const sobra = total - supplierTotal;
            const margin = total > 0 ? (sobra / total) * 100 : 0;

            return (
              <div key={`supplier-${item.id}`} className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b border-border/30 text-xs">
                <span className="text-muted-foreground ml-4">└─ Paga:</span>
                <Input
                  type="number"
                  value={item.supplierField1 || ''}
                  onChange={e => updateItem(item.id, { supplierField1: Number(e.target.value) })}
                  className="h-6 text-xs text-center w-[45px]"
                />
                <span className="text-muted-foreground">×</span>
                {config.field2 && (
                  <>
                    <Input
                      type="number"
                      value={item.supplierField2 || ''}
                      onChange={e => updateItem(item.id, { supplierField2: Number(e.target.value) })}
                      className="h-6 text-xs text-center w-[45px]"
                    />
                    <span className="text-muted-foreground">×</span>
                  </>
                )}
                <Input
                  type="number"
                  value={item.supplierField3 || ''}
                  onChange={e => updateItem(item.id, { supplierField3: Number(e.target.value) })}
                  className="h-6 text-xs text-center w-[60px]"
                />
                <span className="text-muted-foreground">=</span>
                <span className="font-medium">{formatCurrency(supplierTotal)}</span>
                <span className="text-muted-foreground">|</span>
                <span className="text-muted-foreground">Sobra:</span>
                <span className={`font-medium ${getMarginColor(margin)}`}>
                  {formatCurrency(sobra)} ({margin.toFixed(1)}%)
                  {margin >= 50 ? ' ✅' : margin >= 20 ? ' ⚠️' : ' ❌'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Item Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Novo item – {category}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input
                value={newItem.name}
                onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                className="h-8 text-sm"
                placeholder="Ex: Operador de câmera"
              />
            </div>
            <div className={`grid gap-2 ${config.field2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <div className="space-y-1">
                <Label className="text-xs">{config.field1}</Label>
                <Input
                  type="number"
                  value={newItem.field1 || ''}
                  onChange={e => setNewItem({ ...newItem, field1: Number(e.target.value) })}
                  className="h-8 text-sm"
                />
              </div>
              {config.field2 && (
                <div className="space-y-1">
                  <Label className="text-xs">{config.field2}</Label>
                  <Input
                    type="number"
                    value={newItem.field2 || ''}
                    onChange={e => setNewItem({ ...newItem, field2: Number(e.target.value) })}
                    className="h-8 text-sm"
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">{config.field3}</Label>
                <Input
                  type="number"
                  value={newItem.field3 || ''}
                  onChange={e => setNewItem({ ...newItem, field3: Number(e.target.value) })}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="text-sm font-medium">Total: {formatCurrency(newTotal)}</div>
            <div className="flex items-center gap-2">
              <Switch
                checked={newItem.hasSupplier}
                onCheckedChange={v => setNewItem({ ...newItem, hasSupplier: v })}
              />
              <Label className="text-xs">Tem custo de fornecedor?</Label>
            </div>
            {newItem.hasSupplier && (
              <div className={`grid gap-2 ${config.field2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div className="space-y-1">
                  <Label className="text-xs">{config.field1} (forn.)</Label>
                  <Input
                    type="number"
                    value={newItem.supplierField1 || ''}
                    onChange={e => setNewItem({ ...newItem, supplierField1: Number(e.target.value) })}
                    className="h-8 text-sm"
                  />
                </div>
                {config.field2 && (
                  <div className="space-y-1">
                    <Label className="text-xs">{config.field2} (forn.)</Label>
                    <Input
                      type="number"
                      value={newItem.supplierField2 || ''}
                      onChange={e => setNewItem({ ...newItem, supplierField2: Number(e.target.value) })}
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">{config.field3} (forn.)</Label>
                  <Input
                    type="number"
                    value={newItem.supplierField3 || ''}
                    onChange={e => setNewItem({ ...newItem, supplierField3: Number(e.target.value) })}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 h-8 text-xs" onClick={() => setAddOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1 h-8 text-xs" onClick={handleAdd} disabled={!newItem.name.trim()}>
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
