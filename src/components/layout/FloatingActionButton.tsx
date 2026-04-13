import { useState } from 'react';
import { Plus, X, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight } from 'lucide-react';
import { ManualTransactionModal } from '@/components/contas/ManualTransactionModal';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { generateHash } from '@/lib/csv-parser';

export function FloatingActionButton() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [manualTx, setManualTx] = useState<{
    contaId: string;
    contaNome: string;
    contaTipo: 'credito' | 'debito';
    defaultTipo: 'despesa' | 'receita';
  } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [contaSelect, setContaSelect] = useState(false);
  const [pendingAction, setPendingAction] = useState<'despesa' | 'receita' | null>(null);

  // Transfer state
  const [transferOrigem, setTransferOrigem] = useState('');
  const [transferDestino, setTransferDestino] = useState('');
  const [transferValor, setTransferValor] = useState('');
  const [transferring, setTransferring] = useState(false);

  const { data: contas } = useQuery({
    queryKey: ['contas', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('contas').select('*').eq('user_id', user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const debitContas = contas?.filter(c => c.tipo === 'debito') || [];
  const allContas = contas || [];

  const handleAction = (tipo: 'despesa' | 'receita') => {
    setOpen(false);
    if (debitContas.length === 1) {
      setManualTx({
        contaId: debitContas[0].id,
        contaNome: debitContas[0].nome,
        contaTipo: 'debito',
        defaultTipo: tipo,
      });
    } else {
      setPendingAction(tipo);
      setContaSelect(true);
    }
  };

  const handleContaSelected = (contaId: string) => {
    const conta = allContas.find(c => c.id === contaId);
    if (!conta || !pendingAction) return;
    setContaSelect(false);
    setManualTx({
      contaId: conta.id,
      contaNome: conta.nome,
      contaTipo: conta.tipo as 'credito' | 'debito',
      defaultTipo: pendingAction,
    });
    setPendingAction(null);
  };

  const handleTransfer = async () => {
    if (!user || !transferOrigem || !transferDestino || !transferValor) return;
    setTransferring(true);
    try {
      const valor = Number(transferValor);
      const data = new Date().toISOString().substring(0, 10);
      const pessoa = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Titular';
      const origemNome = allContas.find(c => c.id === transferOrigem)?.nome || '';
      const destinoNome = allContas.find(c => c.id === transferDestino)?.nome || '';

      // Saída da origem
      await supabase.from('transacoes').insert({
        user_id: user.id,
        conta_id: transferOrigem,
        data,
        descricao: `Transferência para ${destinoNome}`,
        descricao_normalizada: `TRANSFERENCIA PARA ${destinoNome.toUpperCase()}`,
        valor,
        tipo: 'despesa',
        categoria: 'Transferência entre contas',
        essencial: false,
        hash_transacao: generateHash(data, `Transferência ${origemNome} -> ${destinoNome}`, valor, pessoa) + '_out',
        pessoa,
      });

      // Entrada no destino
      await supabase.from('transacoes').insert({
        user_id: user.id,
        conta_id: transferDestino,
        data,
        descricao: `Transferência de ${origemNome}`,
        descricao_normalizada: `TRANSFERENCIA DE ${origemNome.toUpperCase()}`,
        valor,
        tipo: 'receita',
        categoria: 'Transferência entre contas',
        essencial: false,
        hash_transacao: generateHash(data, `Transferência ${origemNome} -> ${destinoNome}`, valor, pessoa) + '_in',
        pessoa,
      });

      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['saldos'] });
      toast({ title: 'Transferência registrada' });
      setTransferOpen(false);
      setTransferOrigem('');
      setTransferDestino('');
      setTransferValor('');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao transferir', variant: 'destructive' });
    }
    setTransferring(false);
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 animate-in fade-in duration-200"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Action options */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex flex-col items-end gap-3 animate-in slide-in-from-bottom-4 duration-200">
          <button
            onClick={() => handleAction('despesa')}
            className="flex items-center gap-3 bg-destructive text-destructive-foreground rounded-full pl-4 pr-5 py-3 shadow-lg hover:opacity-90 transition-opacity"
          >
            <ArrowDownCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Nova Despesa</span>
          </button>
          <button
            onClick={() => handleAction('receita')}
            className="flex items-center gap-3 bg-emerald-600 text-white rounded-full pl-4 pr-5 py-3 shadow-lg hover:opacity-90 transition-opacity"
          >
            <ArrowUpCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Nova Receita</span>
          </button>
          <button
            onClick={() => { setOpen(false); setTransferOpen(true); }}
            className="flex items-center gap-3 bg-primary text-primary-foreground rounded-full pl-4 pr-5 py-3 shadow-lg hover:opacity-90 transition-opacity"
          >
            <ArrowLeftRight className="h-5 w-5" />
            <span className="text-sm font-medium">Transferência</span>
          </button>
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200 ${
          open
            ? 'bg-muted-foreground rotate-45'
            : 'bg-primary hover:bg-primary/90'
        }`}
      >
        {open ? (
          <X className="h-6 w-6 text-background" />
        ) : (
          <Plus className="h-6 w-6 text-primary-foreground" />
        )}
      </button>

      {/* Account selector dialog */}
      <Dialog open={contaSelect} onOpenChange={setContaSelect}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Selecione a conta</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {allContas.map(c => (
              <button
                key={c.id}
                className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                onClick={() => handleContaSelected(c.id)}
              >
                <span className="font-medium">{c.nome}</span>
                <span className="text-xs text-muted-foreground ml-2 capitalize">{c.tipo}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transferência entre Contas</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleTransfer(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>De</Label>
              <Select value={transferOrigem} onValueChange={setTransferOrigem}>
                <SelectTrigger><SelectValue placeholder="Conta de origem" /></SelectTrigger>
                <SelectContent>
                  {debitContas.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Para</Label>
              <Select value={transferDestino} onValueChange={setTransferDestino}>
                <SelectTrigger><SelectValue placeholder="Conta de destino" /></SelectTrigger>
                <SelectContent>
                  {debitContas.filter(c => c.id !== transferOrigem).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={transferValor}
                onChange={e => setTransferValor(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <Button
              className="w-full"
              type="submit"
              disabled={transferring || !transferOrigem || !transferDestino || !transferValor}
            >
              {transferring ? 'Transferindo...' : 'Confirmar Transferência'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manual transaction modal */}
      {manualTx && (
        <ManualTransactionModal
          open={!!manualTx}
          onOpenChange={(open) => { if (!open) setManualTx(null); }}
          contaId={manualTx.contaId}
          contaNome={manualTx.contaNome}
          contaTipo={manualTx.contaTipo}
          defaultTipo={manualTx.defaultTipo}
        />
      )}
    </>
  );
}
