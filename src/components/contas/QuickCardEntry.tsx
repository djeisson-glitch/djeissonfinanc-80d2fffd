import { useState, useRef, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { generateHash } from '@/lib/csv-parser';
import { autoCategorizarTransacao } from '@/lib/auto-categorize';
import { toLocalIso, getMonthName, formatCurrency } from '@/lib/format';
import { CATEGORIAS_DESPESA } from '@/types/database.types';
import { ChevronLeft, ChevronRight, Zap, Trash2, CreditCard } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Lancado {
  id: string;          // id da 1ª transação (pra desfazer)
  grupoParcela: string | null; // pra desfazer a série inteira
  descricao: string;
  valor: number;       // valor por parcela
  categoria: string;
  nParcelas: number;   // 1 = à vista
}

const LS_CARD = 'quickcard:lastCardId';

/**
 * Lançamento rápido de cartão — estilo caixa de supermercado.
 *
 * Escolhe cartão + competência UMA vez; depois é só descrição + valor + Enter,
 * repetindo. Cada item: auto-categoriza, insere, limpa os campos, devolve o
 * foco pra descrição e mostra na lista da sessão (com total e botão de desfazer).
 *
 * Pra parcelamento/recorrência/reembolso, use o "Novo Lançamento" completo.
 */
export function QuickCardEntry({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const descRef = useRef<HTMLInputElement>(null);

  const [cardId, setCardId] = useState<string>(() => localStorage.getItem(LS_CARD) || '');
  const now = new Date();
  const [compMonth, setCompMonth] = useState(now.getMonth());
  const [compYear, setCompYear] = useState(now.getFullYear());

  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [parcelas, setParcelas] = useState('');  // vazio/1 = à vista; N = parcela 1/N
  const [categoria, setCategoria] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sessao, setSessao] = useState<Lancado[]>([]);

  const pessoaNome = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Titular';
  const mesCompetencia = `${compYear}-${String(compMonth + 1).padStart(2, '0')}`;

  // Cartões de crédito
  const { data: cards } = useQuery({
    queryKey: ['cards-quick', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('contas')
        .select('id, nome')
        .eq('user_id', user!.id)
        .eq('tipo', 'credito')
        .order('nome');
      return data || [];
    },
    enabled: open && !!user,
  });

  // Se não tem cartão selecionado e só há 1, escolhe ele. Se o salvo não existe
  // mais, limpa.
  useEffect(() => {
    if (!cards?.length) return;
    if (cardId && cards.some(c => c.id === cardId)) return;
    setCardId(cards.length === 1 ? cards[0].id : (cards[0]?.id || ''));
  }, [cards]); // eslint-disable-line react-hooks/exhaustive-deps

  // Foca a descrição quando abre / quando muda cartão
  useEffect(() => {
    if (open) setTimeout(() => descRef.current?.focus(), 100);
  }, [open]);

  // Auto-categoriza enquanto digita (preview; user pode trocar no select)
  const catPreview = useMemo(() => autoCategorizarTransacao(descricao) || 'Outros', [descricao]);
  const catFinal = categoria || catPreview;
  const nParcVal = Math.max(1, Math.min(parseInt(parcelas) || 1, 99));

  const prevMonth = () => {
    if (compMonth === 0) { setCompMonth(11); setCompYear(y => y - 1); }
    else setCompMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (compMonth === 11) { setCompMonth(0); setCompYear(y => y + 1); }
    else setCompMonth(m => m + 1);
  };

  const totalSessao = sessao.reduce((s, l) => s + l.valor, 0);

  const cardNome = cards?.find(c => c.id === cardId)?.nome || '';

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['transacoes'] });
    qc.invalidateQueries({ queryKey: ['fatura-acumulada'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['saldos'] });
  };

  const lancar = async () => {
    if (!user || !cardId) return;
    const valorNum = Number(valor.replace(',', '.'));
    if (!valorNum || valorNum <= 0 || !descricao.trim()) return;
    const nParc = Math.max(1, Math.min(parseInt(parcelas) || 1, 99)); // 1 = à vista

    setSubmitting(true);
    try {
      // Compra de cartão = hoje; competência define a fatura. Compra é fato
      // consumado → 1ª parcela pago=true. Parcelas futuras nascem pendentes
      // (pago=false), projetadas nas faturas seguintes (mesmo grupo_parcela).
      const hoje = toLocalIso(new Date());
      const desc = descricao.trim();
      const grupoParcela = nParc > 1 ? crypto.randomUUID() : null;
      const [cy, cm] = mesCompetencia.split('-').map(Number);

      const rows = [];
      for (let i = 0; i < nParc; i++) {
        // Competência da parcela i: mês escolhido + i meses
        const dt = new Date(cy, cm - 1 + i, 1);
        const compI = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        const descFinal = nParc > 1 ? `${desc} (${i + 1}/${nParc})` : desc;
        const seed = grupoParcela ? `${grupoParcela}_${i + 1}` : crypto.randomUUID().slice(0, 8);
        const hash = generateHash(hoje, descFinal, valorNum, pessoaNome) + '_quick_' + seed.slice(0, 12);
        rows.push({
          user_id: user.id,
          conta_id: cardId,
          data: hoje,
          descricao: descFinal,
          descricao_normalizada: descFinal.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim(),
          valor: valorNum,
          tipo: 'despesa',
          categoria: catFinal,
          essencial: false,
          parcela_atual: nParc > 1 ? i + 1 : null,
          parcela_total: nParc > 1 ? nParc : null,
          grupo_parcela: grupoParcela,
          hash_transacao: hash,
          pessoa: pessoaNome,
          mes_competencia: compI,
          ignorar_dashboard: false,
          pago: i === 0, // só a 1ª parcela é "paga"; resto pendente
        });
      }

      const { data: inseridas, error } = await supabase.from('transacoes').insert(rows).select('id');
      if (error) throw error;

      setSessao(prev => [{
        id: inseridas[0].id,
        grupoParcela,
        descricao: desc,
        valor: valorNum,
        categoria: catFinal,
        nParcelas: nParc,
      }, ...prev]);
      localStorage.setItem(LS_CARD, cardId);
      invalidate();

      // Limpa e volta o foco pra próxima compra
      setDescricao('');
      setValor('');
      setParcelas('');
      setCategoria('');
      descRef.current?.focus();
    } catch (err: any) {
      toast({ title: 'Erro ao lançar', description: String(err?.message || err).slice(0, 160), variant: 'destructive' });
    }
    setSubmitting(false);
  };

  const desfazer = async (l: Lancado) => {
    try {
      // Parcelado: apaga a série inteira pelo grupo. À vista: só a transação.
      if (l.grupoParcela) {
        await supabase.from('transacoes').delete().eq('grupo_parcela', l.grupoParcela).eq('user_id', user!.id);
      } else {
        await supabase.from('transacoes').delete().eq('id', l.id);
      }
      setSessao(prev => prev.filter(x => x.id !== l.id));
      invalidate();
    } catch (err: any) {
      toast({ title: 'Erro ao desfazer', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Lançamento rápido de cartão
          </DialogTitle>
          <DialogDescription>
            Escolha o cartão e a fatura uma vez. Depois é só descrição + valor + Enter.
          </DialogDescription>
        </DialogHeader>

        {/* Cartão + competência — escolhidos 1x, ficam fixos */}
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><CreditCard className="h-3 w-3" /> Cartão</Label>
            <Select value={cardId} onValueChange={setCardId}>
              <SelectTrigger><SelectValue placeholder="Selecione o cartão" /></SelectTrigger>
              <SelectContent>
                {(cards || []).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fatura</Label>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-9 w-8" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium tabular w-20 text-center">{getMonthName(compMonth).slice(0, 3)}/{String(compYear).slice(2)}</span>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-8" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Linha de entrada rápida */}
        <form
          onSubmit={(e) => { e.preventDefault(); lancar(); }}
          className="rounded-xl border bg-secondary/20 p-3 space-y-2"
        >
          <div className="grid grid-cols-[1fr_110px_70px] gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Input
                ref={descRef}
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                placeholder="Ex: Mercado São João"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {nParcVal > 1 ? 'Valor/parc.' : 'Valor (R$)'}
              </Label>
              <Input
                value={valor}
                onChange={e => setValor(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Parcelas</Label>
              <Input
                value={parcelas}
                onChange={e => setParcelas(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="1x"
                inputMode="numeric"
                title="Deixe vazio pra à vista. Ex: 12 = parcela 1/12 + projeta as futuras."
              />
            </div>
          </div>
          {nParcVal > 1 && (
            <p className="text-[11px] text-primary">
              {nParcVal}× de {formatCurrency(Number(valor.replace(',', '.')) || 0)} = {formatCurrency((Number(valor.replace(',', '.')) || 0) * nParcVal)} total · cria a 1ª na fatura escolhida e projeta {nParcVal - 1} nas seguintes
            </p>
          )}
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Categoria (auto)</Label>
              <Select value={catFinal} onValueChange={setCategoria}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_DESPESA.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={submitting || !cardId || !descricao.trim() || !Number(valor.replace(',', '.'))}
              className="h-9 gap-1.5"
            >
              <Zap className="h-4 w-4" />
              Lançar
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Dica: digita descrição → Tab → valor → <kbd className="px-1 rounded bg-muted">Enter</kbd>. Repete.
          </p>
        </form>

        {/* Lista da sessão */}
        {sessao.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {sessao.length} {sessao.length === 1 ? 'lançamento' : 'lançamentos'} em {cardNome} · {getMonthName(compMonth).slice(0, 3)}/{String(compYear).slice(2)}
              </span>
              <span className="font-semibold tabular text-destructive">{formatCurrency(totalSessao)}</span>
            </div>
            <div className="max-h-44 overflow-y-auto space-y-1">
              {sessao.map(l => (
                <div key={l.id} className="flex items-center gap-2 rounded-lg bg-secondary/30 px-2.5 py-1.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {l.descricao}
                      {l.nParcelas > 1 && <span className="ml-1.5 text-[10px] text-primary font-medium">{l.nParcelas}×</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{l.categoria}</p>
                  </div>
                  <span className="tabular text-destructive shrink-0">
                    {formatCurrency(l.valor)}{l.nParcelas > 1 && <span className="text-[10px] text-muted-foreground">/parc</span>}
                  </span>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => desfazer(l)} title={l.nParcelas > 1 ? 'Desfazer série inteira' : 'Desfazer'}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
