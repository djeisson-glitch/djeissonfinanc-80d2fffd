import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatCurrency } from '@/lib/format';
import { Bug, Search, BarChart3, Loader2 } from 'lucide-react';

export function DebugPanel() {
  const { user } = useAuth();
  const [diagData, setDiagData] = useState<any[] | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const { data: contas } = useQuery({
    queryKey: ['debug-contas', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('contas').select('*').eq('user_id', user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: stats } = useQuery({
    queryKey: ['debug-stats', user?.id],
    queryFn: async () => {
      const { data: all } = await supabase
        .from('transacoes')
        .select('id, conta_id, data, tipo, valor, parcela_atual, parcela_total')
        .eq('user_id', user!.id);

      const txs = all || [];
      const total = txs.length;

      const byConta: Record<string, number> = {};
      txs.forEach(t => {
        byConta[t.conta_id] = (byConta[t.conta_id] || 0) + 1;
      });

      const byMonth: Record<string, number> = {};
      txs.forEach(t => {
        const key = t.data.substring(0, 7);
        byMonth[key] = (byMonth[key] || 0) + 1;
      });

      const futuras = txs.filter(t => t.parcela_atual && t.parcela_total && t.parcela_atual < t.parcela_total).length;

      return { total, byConta, byMonth, futuras };
    },
    enabled: !!user,
  });

  const getContaNome = (id: string) => contas?.find(c => c.id === id)?.nome || id.slice(0, 8);

  const runDiagnostic = async () => {
    if (!user) return;
    setDiagLoading(true);

    // Find Black account
    const blackConta = contas?.find(c => c.nome.toLowerCase().includes('black'));
    if (!blackConta) {
      setDiagData([]);
      setDiagLoading(false);
      return;
    }

    const { data } = await supabase
      .from('transacoes')
      .select('*')
      .eq('user_id', user.id)
      .eq('conta_id', blackConta.id)
      .gte('data', '2026-01-01')
      .lte('data', '2026-01-31')
      .order('data', { ascending: true });

    setDiagData(data || []);
    setDiagLoading(false);
  };

  const handleSearch = async () => {
    if (!user || !searchTerm.trim()) return;
    setSearchLoading(true);

    const { data } = await supabase
      .from('transacoes')
      .select('*')
      .eq('user_id', user.id)
      .ilike('descricao', `%${searchTerm}%`)
      .order('data', { ascending: false })
      .limit(100);

    setSearchResults(data || []);
    setSearchLoading(false);
  };

  const diagDespesas = diagData?.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0) || 0;
  const diagReceitas = diagData?.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0) || 0;

  return (
    <div className="space-y-4">
      {/* Section 1: Janeiro 2026 - Black */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Diagnóstico: Janeiro 2026 — Black
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={runDiagnostic} disabled={diagLoading} size="sm">
            {diagLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Executar Diagnóstico
          </Button>

          {diagData && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded bg-muted">
                  <span className="text-muted-foreground">Total:</span>{' '}
                  <strong>{diagData.length}</strong>
                </div>
                <div className="p-2 rounded bg-muted">
                  <span className="text-muted-foreground">Despesas:</span>{' '}
                  <strong className="text-destructive">{formatCurrency(diagDespesas)}</strong>
                </div>
                <div className="p-2 rounded bg-muted">
                  <span className="text-muted-foreground">Receitas:</span>{' '}
                  <strong className="text-green-500">{formatCurrency(diagReceitas)}</strong>
                </div>
                <div className="p-2 rounded bg-muted">
                  <span className="text-muted-foreground">Líquido:</span>{' '}
                  <strong>{formatCurrency(diagReceitas - diagDespesas)}</strong>
                </div>
              </div>

              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">ID</TableHead>
                      <TableHead className="text-[10px]">Data</TableHead>
                      <TableHead className="text-[10px]">Descrição</TableHead>
                      <TableHead className="text-[10px] text-right">Valor</TableHead>
                      <TableHead className="text-[10px]">Tipo</TableHead>
                      <TableHead className="text-[10px]">Hash</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diagData.map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="text-[10px] font-mono">{t.id.slice(0, 8)}</TableCell>
                        <TableCell className="text-[10px]">{t.data}</TableCell>
                        <TableCell className="text-[10px] max-w-[180px] truncate" title={t.descricao}>{t.descricao}</TableCell>
                        <TableCell className={`text-[10px] text-right font-medium ${t.tipo === 'receita' ? 'text-green-500' : 'text-destructive'}`}>
                          {t.tipo === 'receita' ? '+' : '-'}{formatCurrency(Number(t.valor))}
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.tipo === 'receita' ? 'secondary' : 'outline'} className="text-[9px]">
                            {t.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[10px] font-mono text-muted-foreground" title={t.hash_transacao}>
                          {t.hash_transacao.slice(0, 12)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Search */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Busca Específica
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder='Ex: "Devolucao" ou "718"'
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={searchLoading} size="sm">
              {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
            </Button>
          </div>

          {searchResults !== null && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {searchResults.length} resultado(s) encontrado(s)
              </p>
              {searchResults.length > 0 && (
                <ScrollArea className="max-h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Data</TableHead>
                        <TableHead className="text-[10px]">Descrição</TableHead>
                        <TableHead className="text-[10px] text-right">Valor</TableHead>
                        <TableHead className="text-[10px]">Tipo</TableHead>
                        <TableHead className="text-[10px]">Conta</TableHead>
                        <TableHead className="text-[10px]">Hash</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {searchResults.map(t => (
                        <TableRow key={t.id}>
                          <TableCell className="text-[10px]">{t.data}</TableCell>
                          <TableCell className="text-[10px] max-w-[160px] truncate" title={t.descricao}>{t.descricao}</TableCell>
                          <TableCell className={`text-[10px] text-right ${t.tipo === 'receita' ? 'text-green-500' : 'text-destructive'}`}>
                            {formatCurrency(Number(t.valor))}
                          </TableCell>
                          <TableCell className="text-[10px]">{t.tipo}</TableCell>
                          <TableCell className="text-[10px]">{getContaNome(t.conta_id)}</TableCell>
                          <TableCell className="text-[10px] font-mono text-muted-foreground">{t.hash_transacao.slice(0, 12)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Estatísticas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {stats ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-muted">
                  <span className="text-muted-foreground">Total transações:</span>{' '}
                  <strong>{stats.total}</strong>
                </div>
                <div className="p-2 rounded bg-muted">
                  <span className="text-muted-foreground">Parcelas futuras:</span>{' '}
                  <strong>{stats.futuras}</strong>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold mb-1">Por conta:</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(stats.byConta).map(([contaId, count]) => (
                    <Badge key={contaId} variant="outline" className="text-[10px]">
                      {getContaNome(contaId)}: {count as number}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold mb-1">Por mês:</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(stats.byMonth)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([month, count]) => (
                      <Badge key={month} variant="secondary" className="text-[10px]">
                        {month}: {count as number}
                      </Badge>
                    ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
