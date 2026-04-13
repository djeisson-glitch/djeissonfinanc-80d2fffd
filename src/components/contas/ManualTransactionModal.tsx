import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { generateHash } from '@/lib/csv-parser';
import { autoCategorizarTransacao } from '@/lib/auto-categorize';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contaId: string;
  contaNome: string;
  contaTipo: 'credito' | 'debito';
  defaultMesCompetencia?: string; // YYYY-MM for credit cards
}

export function ManualTransactionModal({
  open, onOpenChange, contaId, contaNome, contaTipo, defaultMesCompetencia,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [tipo, setTipo] = useState<'despesa' | 'receita'>('despesa');
  const [data, setData] = useState(new Date().toISOString().substring(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const pessoaNome = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Titular';

  const handleSubmit = async () => {
    if (!user || !descricao || !valor || !data) return;
    setSubmitting(true);

    try {
      const valorNum = Number(valor);
      const hash = generateHash(data, descricao, valorNum, pessoaNome) + '_manual';
      const autoCat = autoCategorizarTransacao(descricao);

      await supabase.from('transacoes').insert({
        user_id: user.id,
        conta_id: contaId,
        data,
        descricao,
        descricao_normalizada: descricao.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim(),
        valor: valorNum,
        tipo,
        categoria: autoCat || 'Outros',
        essencial: false,
        hash_transacao: hash,
        pessoa: pessoaNome,
        mes_competencia: defaultMesCompetencia || null,
      });

      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['faturas'] });
      queryClient.invalidateQueries({ queryKey: ['fatura-detail'] });
      queryClient.invalidateQueries({ queryKey: ['saldos'] });

      toast({ title: 'Lançamento adicionado' });
      setDescricao('');
      setValor('');
      setTipo('despesa');
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao adicionar lançamento', variant: 'destructive' });
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Novo Lançamento — {contaNome}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Ex: Supermercado, Aluguel..."
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={valor}
                onChange={e => setValor(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v: 'despesa' | 'receita') => setTipo(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="receita">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Data</Label>
            <Input
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
            />
          </div>
          {defaultMesCompetencia && (
            <p className="text-xs text-muted-foreground">
              Competência: {defaultMesCompetencia}
            </p>
          )}
          <Button
            className="w-full"
            type="submit"
            disabled={submitting || !descricao || !valor}
          >
            {submitting ? 'Adicionando...' : 'Adicionar Lançamento'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
