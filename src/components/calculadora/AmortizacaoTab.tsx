import { useState, useMemo, useCallback } from 'react';
import { formatCurrency } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { SacParams, buildAmortizationTable, calcTaxaMensal, calcTotaisFinanciamento } from '@/lib/sac-utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  params: SacParams;
}

const PAGE_SIZE = 24;

export function AmortizacaoTab({ params }: Props) {
  const [extras, setExtras] = useState<Record<number, number>>({});
  const [page, setPage] = useState(0);

  const taxaMensal = calcTaxaMensal(params.taxaAnualNominal);
  const trMensal = calcTaxaMensal(params.trAnual);
  const valorFinanciado = Math.max(0, params.valorImovel - params.entrada);

  const rows = useMemo(
    () => buildAmortizationTable(valorFinanciado, params.prazoMeses, taxaMensal, trMensal, extras),
    [valorFinanciado, params.prazoMeses, taxaMensal, trMensal, extras]
  );

  const totais = useMemo(() => calcTotaisFinanciamento(rows), [rows]);

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleExtra = useCallback((mes: number, val: string) => {
    const num = parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0;
    setExtras(prev => ({ ...prev, [mes]: num }));
  }, []);

  const fc = (v: number) => formatCurrency(v);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Tabela SAC — {rows.length} meses ({Math.floor(rows.length / 12)} anos)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px] text-xs">Mês</TableHead>
                  <TableHead className="text-xs text-right">Saldo Dev.</TableHead>
                  <TableHead className="text-xs text-right">Amort.</TableHead>
                  <TableHead className="text-xs text-right">TR</TableHead>
                  <TableHead className="text-xs text-right">Juros</TableHead>
                  <TableHead className="text-xs text-right">Parcela</TableHead>
                  <TableHead className="text-xs text-right w-[100px]">Amort. Extra</TableHead>
                  <TableHead className="text-xs text-right">Saldo c/ Extra</TableHead>
                  <TableHead className="text-xs text-right">Parcela c/ Extra</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map(r => (
                  <TableRow key={r.mes} className="text-xs">
                    <TableCell className="font-medium py-1.5">{r.mes}</TableCell>
                    <TableCell className="text-right py-1.5">{fc(r.saldoDevedor)}</TableCell>
                    <TableCell className="text-right py-1.5">{fc(r.amortFixa)}</TableCell>
                    <TableCell className="text-right py-1.5">{fc(r.correcaoTR)}</TableCell>
                    <TableCell className="text-right py-1.5">{fc(r.juros)}</TableCell>
                    <TableCell className="text-right py-1.5 font-medium">{fc(r.parcelaNormal)}</TableCell>
                    <TableCell className="py-1">
                      <Input
                        className="h-7 text-xs text-right w-[90px] ml-auto"
                        placeholder="0,00"
                        value={extras[r.mes] ? extras[r.mes].toLocaleString('pt-BR') : ''}
                        onChange={e => handleExtra(r.mes, e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="text-right py-1.5">{fc(r.saldoComExtra)}</TableCell>
                    <TableCell className="text-right py-1.5 font-medium">
                      {r.amortExtra > 0 ? fc(r.parcelaComExtra) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {page === totalPages - 1 && (
                <TableFooter>
                  <TableRow className="text-xs font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-right">{fc(totais.totalAmortizado)}</TableCell>
                    <TableCell className="text-right">{fc(totais.totalTR)}</TableCell>
                    <TableCell className="text-right">{fc(totais.totalJuros)}</TableCell>
                    <TableCell className="text-right">{fc(totais.totalGeralPago)}</TableCell>
                    <TableCell className="text-right">{fc(Object.values(extras).reduce((s, v) => s + v, 0))}</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-right">-</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-2 border-t">
            <span className="text-xs text-muted-foreground">
              Meses {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} de {rows.length}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
