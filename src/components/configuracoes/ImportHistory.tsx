import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';

export function ImportHistory() {
  const { user } = useAuth();

  const { data: historico } = useQuery({
    queryKey: ['historico_importacoes', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('historico_importacoes')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Histórico de Importações
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Arquivo</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead className="text-center">Importadas</TableHead>
              <TableHead className="text-center">Duplicatas</TableHead>
              <TableHead className="text-center">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historico?.map(h => (
              <TableRow key={h.id}>
                <TableCell className="text-sm">{formatDateTime(h.created_at)}</TableCell>
                <TableCell className="text-sm max-w-[180px] truncate">
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] px-1">
                      {h.tipo_arquivo.toUpperCase()}
                    </Badge>
                    {h.nome_arquivo}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{h.conta_nome}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-500">
                    {h.qtd_importada}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary" className={`text-xs ${h.qtd_duplicadas > 0 ? 'bg-yellow-500/10 text-yellow-500' : ''}`}>
                    {h.qtd_duplicadas}
                  </Badge>
                </TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">{h.qtd_total}</TableCell>
              </TableRow>
            ))}
            {(!historico || historico.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhuma importação registrada
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
