import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Save, Trash2, Settings } from 'lucide-react';

export default function ConfiguracoesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: config } = useQuery({
    queryKey: ['config', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('configuracoes').select('*').eq('user_id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: regras } = useQuery({
    queryKey: ['regras', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('regras_categorizacao').select('*').eq('user_id', user!.id).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const [receita, setReceita] = useState<number | null>(null);
  const [reserva, setReserva] = useState<number | null>(null);

  const displayReceita = receita ?? config?.receita_mensal_fixa ?? 13000;
  const displayReserva = reserva ?? config?.reserva_minima ?? 2000;

  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      await supabase.from('configuracoes').upsert({
        user_id: user!.id,
        receita_mensal_fixa: displayReceita,
        reserva_minima: displayReserva,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast({ title: 'Configurações salvas' });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('regras_categorizacao').delete().eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regras'] });
      toast({ title: 'Regra excluída' });
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Parâmetros Financeiros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Receita Mensal Fixa (R$)</Label>
              <Input type="number" value={displayReceita} onChange={e => setReceita(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Reserva Mínima Desejada (R$)</Label>
              <Input type="number" value={displayReserva} onChange={e => setReserva(Number(e.target.value))} />
            </div>
          </div>
          <Button onClick={() => saveConfigMutation.mutate()}>
            <Save className="mr-2 h-4 w-4" /> Salvar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Regras de Categorização</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Padrão</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Essencial</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="w-16">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regras?.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.padrao}</TableCell>
                  <TableCell><Badge variant="outline">{r.categoria}</Badge></TableCell>
                  <TableCell>{r.essencial ? '✓' : '✗'}</TableCell>
                  <TableCell>
                    <Badge variant={r.aprendido_auto ? 'secondary' : 'default'} className="text-xs">
                      {r.aprendido_auto ? 'Auto' : 'Manual'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteRuleMutation.mutate(r.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!regras || regras.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhuma regra cadastrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
