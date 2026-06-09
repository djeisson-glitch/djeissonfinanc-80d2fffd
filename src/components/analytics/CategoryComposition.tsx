import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatCurrency } from '@/lib/format';
import { getCategoriaColor } from '@/types/database.types';
import type { CategorySlice } from '@/lib/analytics-engine';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CategoryCompositionProps {
  slices: CategorySlice[];
  title?: string;
  description?: string;
  maxItems?: number;
  /** YYYY-MM — quando informado, clicar numa categoria navega pra /transacoes
   *  com filtro de categoria + mês aplicado. */
  drillDownMes?: string;
}

/**
 * Lista categorias do mês ordenadas, com barra de % e valor. Mais legível
 * que pie chart pra orçamento doméstico — vê numa olhada onde está o dreno.
 * Categorias com subcategoria têm um ▸ pra expandir o breakdown por sub.
 */
export function CategoryComposition({
  slices,
  title = 'Onde está o dinheiro',
  description = 'Composição das despesas do período',
  maxItems = 10,
  drillDownMes,
}: CategoryCompositionProps) {
  const navigate = useNavigate();
  const top = slices.slice(0, maxItems);
  const [expandida, setExpandida] = useState<string | null>(null);

  const handleClick = (categoria: string, subcategoria?: string) => {
    if (!drillDownMes) return;
    const params = new URLSearchParams({ categoria, mes: drillDownMes, tipo: 'despesa' });
    if (subcategoria && subcategoria !== 'Sem subcategoria') params.set('subcategoria', subcategoria);
    navigate(`/transacoes?${params.toString()}`);
  };

  if (top.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Sem despesas no período.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        {top.map((s) => {
          const temSubs = s.subs && s.subs.length > 0;
          const aberta = expandida === s.categoria;
          const cor = getCategoriaColor(s.categoria);
          return (
            <div key={s.categoria} className="space-y-1.5">
              <div className="flex items-center gap-1">
                {/* Toggle de subcategoria (só se houver) */}
                {temSubs ? (
                  <button
                    type="button"
                    onClick={() => setExpandida(aberta ? null : s.categoria)}
                    className="shrink-0 text-muted-foreground hover:text-foreground p-0.5"
                    aria-label={aberta ? 'Recolher subcategorias' : 'Expandir subcategorias'}
                  >
                    {aberta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                ) : (
                  <span className="w-[18px] shrink-0" />
                )}
                {/* Linha da categoria — clica pra drill em transações */}
                <button
                  type="button"
                  onClick={drillDownMes ? () => handleClick(s.categoria) : undefined}
                  disabled={!drillDownMes}
                  className={`flex-1 min-w-0 text-left space-y-1.5 ${drillDownMes ? 'cursor-pointer hover:bg-muted/40 rounded-md px-2 py-1 -my-1 transition-colors' : ''}`}
                  aria-label={drillDownMes ? `Ver transações de ${s.categoria}` : undefined}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cor }} />
                      <span className="font-medium truncate">{s.categoria}</span>
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      <span className="font-mono font-semibold text-foreground">{formatCurrency(s.valor)}</span>
                      <span className="ml-2 text-xs">{s.pct.toFixed(1)}%</span>
                    </span>
                  </div>
                  <Progress
                    value={s.pct}
                    className="h-1.5"
                    style={{ ['--progress-foreground' as any]: cor }}
                  />
                </button>
              </div>

              {/* Breakdown por subcategoria */}
              {temSubs && aberta && (
                <div className="ml-[26px] space-y-1.5 border-l-2 pl-3" style={{ borderColor: cor + '40' }}>
                  {s.subs.map(sub => (
                    <button
                      key={sub.subcategoria}
                      type="button"
                      onClick={drillDownMes ? () => handleClick(s.categoria, sub.subcategoria) : undefined}
                      disabled={!drillDownMes}
                      className={`block w-full text-left ${drillDownMes ? 'cursor-pointer hover:bg-muted/30 rounded px-1.5 py-0.5 -mx-1.5 transition-colors' : ''}`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className={sub.subcategoria === 'Sem subcategoria' ? 'text-muted-foreground italic' : ''}>
                          {sub.subcategoria}
                        </span>
                        <span className="text-muted-foreground">
                          <span className="font-mono text-foreground">{formatCurrency(sub.valor)}</span>
                          <span className="ml-1.5">{sub.pct.toFixed(0)}%</span>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
