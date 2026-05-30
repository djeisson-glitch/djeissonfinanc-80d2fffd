/**
 * Helper de criação/atualização de reembolso.
 *
 * Caso de uso: uma despesa do user (parcela, compra no cartão, conta paga) tem
 * uma parte ou totalidade que outra pessoa vai reembolsar. Criamos DUAS
 * transações vinculadas:
 *   - despesa principal: `reembolso_pessoa`, `reembolso_valor` e
 *     `reembolso_transacao_id` apontando pra receita.
 *   - receita de reembolso: categoria='Reembolsos', tipo='receita',
 *     valor=reembolso_valor, descrição "Reembolso de {pessoa} - {desc original}".
 *
 * Os dois ficam na mesma data. A receita usa a Sicredi Conta Corrente como
 * destino padrão (parametrizável). Se a despesa principal for deletada, a
 * receita fica órfã (FK ON DELETE SET NULL na coluna reembolso_transacao_id)
 * — o usuário pode deletar manualmente depois se quiser.
 */
import { supabase } from '@/integrations/supabase/client';
import { generateHash, normalizeDescription } from './csv-parser';

export interface CriarReembolsoArgs {
  userId: string;
  /** ID da transação despesa (já existe ou recém-criada) que terá reembolso */
  despesaId: string;
  despesaDescricao: string;
  despesaData: string;
  despesaConta: string; // pra dedup
  /** Conta de débito onde a receita do reembolso será creditada */
  contaReceitaId: string;
  pessoa: string;
  valor: number;
  pessoaTitular: string;
}

/**
 * Cria a receita de reembolso e atualiza a despesa principal com o vínculo.
 * Retorna o id da receita criada.
 */
export async function criarReembolsoVinculado(args: CriarReembolsoArgs): Promise<string> {
  const descReceita = `Reembolso de ${args.pessoa} - ${args.despesaDescricao}`.substring(0, 200);
  // Hash do reembolso vincula determinísticamente à despesa pra evitar duplicar
  // em re-tentativas (idempotente).
  const hashReceita = generateHash(args.despesaData, descReceita, args.valor, args.pessoa)
    + '_reemb_' + args.despesaId.substring(0, 8);

  // 1) Insert da receita primeiro
  const { data: receita, error: errReceita } = await supabase
    .from('transacoes')
    .insert({
      user_id: args.userId,
      conta_id: args.contaReceitaId,
      data: args.despesaData,
      descricao: descReceita,
      descricao_normalizada: normalizeDescription(descReceita),
      valor: args.valor,
      tipo: 'receita',
      categoria: 'Reembolsos',
      essencial: false,
      hash_transacao: hashReceita,
      pessoa: args.pessoaTitular,
      // Receita de reembolso entra no dashboard como receita REAL (você vai
      // realmente receber esse dinheiro). Não ignora.
      ignorar_dashboard: false,
      observacoes: `Reembolso vinculado à despesa ${args.despesaId}`,
    })
    .select('id')
    .single();

  if (errReceita) throw new Error(`Erro criando receita de reembolso: ${errReceita.message}`);

  // 2) Update da despesa principal apontando pra receita
  const { error: errDespesa } = await supabase
    .from('transacoes')
    .update({
      reembolso_pessoa: args.pessoa,
      reembolso_valor: args.valor,
      reembolso_transacao_id: receita.id,
    })
    .eq('id', args.despesaId)
    .eq('user_id', args.userId);

  if (errDespesa) {
    // Rollback parcial: deleta receita pra não ficar órfã
    await supabase.from('transacoes').delete().eq('id', receita.id).eq('user_id', args.userId);
    throw new Error(`Erro vinculando reembolso à despesa: ${errDespesa.message}`);
  }

  return receita.id;
}

/**
 * Remove o vínculo de reembolso de uma despesa e deleta a receita correspondente.
 * Usado quando o user desfaz a marcação.
 */
export async function removerReembolso(userId: string, despesaId: string, receitaId: string | null): Promise<void> {
  // Limpa os campos na despesa primeiro
  const { error: errDespesa } = await supabase
    .from('transacoes')
    .update({
      reembolso_pessoa: null,
      reembolso_valor: null,
      reembolso_transacao_id: null,
    })
    .eq('id', despesaId)
    .eq('user_id', userId);
  if (errDespesa) throw new Error(`Erro removendo vínculo: ${errDespesa.message}`);

  if (receitaId) {
    const { error: errReceita } = await supabase
      .from('transacoes')
      .delete()
      .eq('id', receitaId)
      .eq('user_id', userId);
    if (errReceita) {
      // Não-fatal: o vínculo já foi removido, só a receita órfã ficou
      console.warn('Receita órfã, mas vínculo removido:', errReceita.message);
    }
  }
}
