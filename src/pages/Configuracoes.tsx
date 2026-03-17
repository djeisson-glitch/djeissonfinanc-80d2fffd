import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Trash2, Settings, AlertTriangle } from 'lucide-react';
import { ImportHistory } from '@/components/configuracoes/ImportHistory';

export default function ConfiguracoesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
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
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);

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

  const handleReset = async () => {
    if (!user || resetConfirm !== 'RESETAR') return;
    setResetting(true);

    try {
      // Delete all transactions
      await supabase.from('transacoes').delete().eq('user_id', user.id);
      // Delete all categorization rules
      await supabase.from('regras_categorizacao').delete().eq('user_id', user.id);
      // Delete config
      await supabase.from('configuracoes').delete().eq('user_id', user.id);
      // Reset saldo_inicial on all accounts
      await supabase.from('contas').update({ saldo_inicial: 0 }).eq('user_id', user.id);

      queryClient.clear();
      toast({ title: 'Sistema resetado com sucesso' });
      setResetDialogOpen(false);
      setResetConfirm('');
      navigate('/onboarding');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao resetar', variant: 'destructive' });
    }

    setResetting(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <Tabs defaultValue="geral" className="space-y-4">
        <TabsList>
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="historico">Histórico de Importações</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-6">
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

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Zona de Perigo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Ações irreversíveis. Tenha certeza antes de prosseguir.
          </p>
          <Button
            variant="destructive"
            onClick={() => { setResetConfirm(''); setResetDialogOpen(true); }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Resetar Sistema Completo
          </Button>
        </CardContent>
      </TabsContent>

        <TabsContent value="historico">
          <ImportHistory />
        </TabsContent>
      </Tabs>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Resetar Sistema
            </DialogTitle>
            <DialogDescription className="text-left">
              <strong>⚠️ ATENÇÃO: Esta ação NÃO pode ser desfeita.</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-destructive">Será deletado:</p>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                <li>Todas as transações</li>
                <li>Todas as regras de categorização</li>
                <li>Configurações (receita mensal, reserva mínima)</li>
                <li>Saldos iniciais das contas (volta pra R$ 0)</li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Será mantido:</p>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                <li>As 4 contas criadas (Black, Mercado Pago, Sicredi Principal, Sicredi Secundário)</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Digite "RESETAR" para confirmar:</Label>
              <Input
                value={resetConfirm}
                onChange={e => setResetConfirm(e.target.value)}
                placeholder="RESETAR"
                className="border-destructive/50 focus-visible:ring-destructive"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setResetDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={resetConfirm !== 'RESETAR' || resetting}
                onClick={handleReset}
              >
                {resetting ? 'Resetando...' : 'Confirmar Reset'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}