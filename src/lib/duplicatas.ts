/**
 * Detecção de duplicatas em transações.
 *
 * Antes vivia na página Conciliação (que foi removida porque misturava 3
 * coisas distintas). Agora é só essa função pura — usada por um widget
 * que aparece SÓ se tiver duplicata.
 *
 * Critério: duas transações com mesma `descricao_normalizada`, mesmo `valor`
 * (±1 centavo pra tolerar rounding) e mesma `data` (ou ±1 dia). Hash igual
 * também conta — esse é o caso óbvio.
 */

export interface DuplicataGrupo {
  /** id estável pro grupo (hash do primeiro item) */
  groupId: string;
  /** chave: descrição_normalizada + valor */
  chave: string;
  descricao: string;
  valor: number;
  /** ids das transações duplicadas (>= 2) */
  txIds: string[];
}

interface TxLike {
  id: string;
  descricao: string;
  descricao_normalizada?: string | null;
  valor: number | string;
  data: string;
  hash_transacao?: string | null;
  conta_id?: string | null;
  parcela_total?: number | null;
}

/**
 * Identifica grupos de transações que parecem duplicatas.
 *
 * Regras:
 *  1. Hash igual = duplicata segura (ignora data, mesma operação).
 *  2. (descricao_normalizada, valor, MESMA DATA) = duplicata por similaridade,
 *     EXCETO parcelamentos (parcela_total > 1, que compartilham desc+valor).
 *
 * Não tenta resolver — só sinaliza. UI mostra grupo e deixa o user escolher
 * qual apagar (ou ignorar se for legítimo).
 */
import { isFaturaPayment } from '@/lib/csv-parser';

export function detectarDuplicatas(txs: TxLike[]): DuplicataGrupo[] {
  // 1) Agrupa por hash (quando existe)
  const byHash = new Map<string, TxLike[]>();
  for (const t of txs) {
    if (!t.hash_transacao) continue;
    const arr = byHash.get(t.hash_transacao) || [];
    arr.push(t);
    byHash.set(t.hash_transacao, arr);
  }

  // 2) Agrupa por chave de similaridade: descNorm + valor centavos + DATA EXATA.
  //
  // Mudanças contra falso-positivo (que levaria o user a apagar tx legítima):
  //  - Usa data exata (YYYY-MM-DD), não o mês inteiro. Duas compras iguais no
  //    mesmo mês mas dias diferentes (2 cafés no mesmo lugar) NÃO são duplicata.
  //  - PULA parcelamentos (parcela_total > 1): parcelas legítimas compartilham
  //    descrição + valor por definição; não são duplicatas.
  const bySim = new Map<string, TxLike[]>();
  for (const t of txs) {
    if (t.parcela_total && Number(t.parcela_total) > 1) continue; // parcela legítima
    const descNorm = (t.descricao_normalizada || t.descricao || '').trim().toUpperCase().slice(0, 40);
    if (!descNorm) continue;
    const valorCents = Math.round(Math.abs(Number(t.valor)) * 100);
    if (!valorCents) continue;
    const dia = (t.data || '').substring(0, 10); // data exata
    // conta_id na chave: duas transações em CONTAS DIFERENTES nunca são
    // duplicata (são lançamentos legítimos em livros distintos). Sem isso, o
    // par da baixa manual — débito na conta + crédito-abatimento no cartão,
    // mesma descrição/valor/dia — era marcado como duplicata por engano.
    const conta = t.conta_id || '';
    const key = `${conta}|${descNorm}|${valorCents}|${dia}`;
    const arr = bySim.get(key) || [];
    arr.push(t);
    bySim.set(key, arr);
  }

  // 2b) PAGAMENTO DE FATURA por conta+valor+dia, IGNORANDO a descrição.
  //
  // A baixa manual ("Pag Fat Deb Cc - Black") e o débito real do extrato
  // ("PAGTO FATURA MASTER-008323084") são o MESMO pagamento, mas com textos
  // diferentes — bySim (que casa por descrição) não pega. Aqui casamos só pelo
  // par conta + valor + dia.
  //
  // conta_id na chave é OBRIGATÓRIO: a baixa manual cria DOIS lançamentos de
  // mesmo valor/dia (o débito na conta + o crédito que abate a fatura NO CARTÃO).
  // Sem separar por conta, o crédito-abatimento (legítimo, em outra conta) seria
  // agrupado junto e marcado como duplicata por engano.
  const byFatura = new Map<string, TxLike[]>();
  for (const t of txs) {
    if (!isFaturaPayment(t.descricao || '')) continue;
    const valorCents = Math.round(Math.abs(Number(t.valor)) * 100);
    if (!valorCents) continue;
    const dia = (t.data || '').substring(0, 10);
    const conta = t.conta_id || '';
    const key = `${conta}|${valorCents}|${dia}`;
    const arr = byFatura.get(key) || [];
    arr.push(t);
    byFatura.set(key, arr);
  }

  // 3) Constrói grupos finais — só quando count >= 2 num dos critérios.
  // Dedupe entre hash e sim usando set de ids já vistos.
  const grupos: DuplicataGrupo[] = [];
  const txIdsJaAgrupados = new Set<string>();

  for (const [hash, lista] of byHash.entries()) {
    if (lista.length < 2) continue;
    const ids = lista.map(t => t.id);
    ids.forEach(id => txIdsJaAgrupados.add(id));
    grupos.push({
      groupId: 'h:' + hash,
      chave: hash,
      descricao: lista[0].descricao,
      valor: Number(lista[0].valor),
      txIds: ids,
    });
  }

  for (const [key, lista] of bySim.entries()) {
    if (lista.length < 2) continue;
    // pula se TODAS já entraram via hash
    const idsNovos = lista.filter(t => !txIdsJaAgrupados.has(t.id));
    if (idsNovos.length < 2) continue;
    idsNovos.forEach(t => txIdsJaAgrupados.add(t.id));
    grupos.push({
      groupId: 's:' + key,
      chave: key,
      descricao: lista[0].descricao,
      valor: Number(lista[0].valor),
      txIds: idsNovos.map(t => t.id),
    });
  }

  for (const [key, lista] of byFatura.entries()) {
    if (lista.length < 2) continue;
    const idsNovos = lista.filter(t => !txIdsJaAgrupados.has(t.id));
    if (idsNovos.length < 2) continue;
    idsNovos.forEach(t => txIdsJaAgrupados.add(t.id));
    grupos.push({
      groupId: 'f:' + key,
      chave: key,
      descricao: lista[0].descricao,
      valor: Number(lista[0].valor),
      txIds: idsNovos.map(t => t.id),
    });
  }

  return grupos;
}
