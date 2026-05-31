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

export interface CriarReembolsoArgs {
  userId: string;
  /** ID da transação despesa (já existe ou recém-criada) que terá reembolso */
  despesaId: string;
  /** Conta de débito onde a receita do reembolso será creditada */
  contaReceitaId: string;
  pessoa: string;
  valor: number;
  pessoaTitular: string;
  // Mantidos por compat, mas a RPC pega os dados da própria despesa:
  despesaDescricao?: string;
  despesaData?: string;
  despesaConta?: string;
}

/**
 * Cria a receita de reembolso e vincula à despesa numa única transação
 * Postgres (RPC `criar_reembolso`). Atômica — se falhar, nada é persistido.
 * Retorna o id da receita criada.
 *
 * Validações no servidor:
 *   - despesa existe e é do user (RLS implícito)
 *   - despesa NÃO tem reembolso prévio (idempotência — quem quer trocar deve
 *     chamar `removerReembolso` antes)
 *   - valor do reembolso ≤ valor da despesa
 */
export async function criarReembolsoVinculado(args: CriarReembolsoArgs): Promise<string> {
  const { data, error } = await supabase.rpc('criar_reembolso', {
    p_despesa_id: args.despesaId,
    p_conta_receita: args.contaReceitaId,
    p_pessoa: args.pessoa,
    p_valor: args.valor,
    p_pessoa_titular: args.pessoaTitular,
  });

  if (error) {
    // Mensagens do RAISE EXCEPTION da RPC vêm dentro do error.message —
    // expomos como-está pra UI mostrar feedback útil ("Reembolso > despesa", etc.)
    throw new Error(error.message || 'Erro criando reembolso');
  }
  return data as string;
}

/**
 * Remove o vínculo de reembolso: deleta a receita (o trigger
 * tg_reembolso_cascade limpa os campos da despesa automaticamente). Atômico.
 */
export async function removerReembolso(userId: string, despesaId: string, receitaId: string | null): Promise<void> {
  if (!receitaId) {
    // Edge case: vínculo já estava nulo, só limpa os campos restantes
    const { error } = await supabase
      .from('transacoes')
      .update({ reembolso_pessoa: null, reembolso_valor: null, reembolso_transacao_id: null })
      .eq('id', despesaId)
      .eq('user_id', userId);
    if (error) throw new Error(`Erro limpando reembolso: ${error.message}`);
    return;
  }
  // Deleta a receita — trigger BEFORE DELETE limpa os 3 campos da despesa.
  const { error } = await supabase
    .from('transacoes')
    .delete()
    .eq('id', receitaId)
    .eq('user_id', userId);
  if (error) throw new Error(`Erro deletando receita do reembolso: ${error.message}`);
}
