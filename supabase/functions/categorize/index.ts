import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIAS_DESPESA = [
  "Alimentação", "Assinatura", "Beleza", "Casa", "Compras", "Educação",
  "Empréstimos", "Lazer", "Operação bancária", "Outros", "Pais Maiara",
  "Presente", "Produtora", "Saúde", "Serviços", "Transporte", "Vestuário", "Viagem"
];

const CATEGORIAS_RECEITA = [
  "Salário/Pró-labore", "Freelance/PJ", "Receita Produtora", "Investimentos",
  "Vendas", "Reembolsos", "Devoluções", "Transferência entre contas", "Outras receitas"
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { transacoes } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const results = [];

    for (const tx of transacoes) {
      const isReceita = tx.tipo === 'receita';
      const categorias = isReceita ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;

      const prompt = `Você é um assistente de categorização financeira. Analise a seguinte transação e retorne APENAS um objeto JSON (sem markdown, sem explicações):

Descrição: "${tx.descricao}"
Valor: R$ ${tx.valor}
Tipo: ${isReceita ? 'RECEITA' : 'DESPESA'}

Retorne:
{
  "categoria": "uma das categorias listadas abaixo",
  "essencial": true ou false,
  "confianca": 0-100
}

Categorias disponíveis: ${categorias.join(", ")}

Critérios para DESPESAS:
- Alimentação: supermercados, restaurantes, delivery, fruteira
- Casa: aluguel, condomínio, água, luz, internet, gás, móveis
- Saúde: farmácia, consultas, plano de saúde, seguro de vida
- Transporte: combustível, financiamento carro, seguro carro, manutenção, imposto veicular
- Serviços: celular, serviços gerais
- Assinatura: serviços recorrentes (Netflix, Spotify, etc)
- Lazer: hobbys, entretenimento
- Essencial: necessário para sobrevivência/trabalho

Critérios para RECEITAS:
- Salário/Pró-labore: salário fixo, pró-labore
- Freelance/PJ: trabalhos avulsos, nota fiscal PJ
- Receita Produtora: receitas de produtora de vídeo/conteúdo
- Investimentos: dividendos, juros, rendimentos
- Vendas: venda de produtos ou itens usados
- Reembolsos: reembolso de despesas
- Devoluções: estornos, devoluções de compras
- Transferência entre contas: PIX/TED entre contas próprias`;

      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
            tools: [{
              type: "function",
              function: {
                name: "categorize_transaction",
                description: "Categorize a financial transaction",
                parameters: {
                  type: "object",
                  properties: {
                    categoria: { type: "string", enum: categorias },
                    essencial: { type: "boolean" },
                    confianca: { type: "number" }
                  },
                  required: ["categoria", "essencial", "confianca"],
                  additionalProperties: false
                }
              }
            }],
            tool_choice: { type: "function", function: { name: "categorize_transaction" } },
          }),
        });

        if (response.status === 429) {
          results.push({ descricao: tx.descricao, categoria: isReceita ? "Outras receitas" : "Outros", essencial: false, confianca: 0, error: "rate_limited" });
          continue;
        }

        if (response.status === 402) {
          results.push({ descricao: tx.descricao, categoria: isReceita ? "Outras receitas" : "Outros", essencial: false, confianca: 0, error: "payment_required" });
          continue;
        }

        if (!response.ok) {
          results.push({ descricao: tx.descricao, categoria: isReceita ? "Outras receitas" : "Outros", essencial: false, confianca: 0 });
          continue;
        }

        const data = await response.json();
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall) {
          const args = JSON.parse(toolCall.function.arguments);
          results.push({ descricao: tx.descricao, ...args });
        } else {
          results.push({ descricao: tx.descricao, categoria: isReceita ? "Outras receitas" : "Outros", essencial: false, confianca: 0 });
        }
      } catch {
        results.push({ descricao: tx.descricao, categoria: isReceita ? "Outras receitas" : "Outros", essencial: false, confianca: 0 });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("categorize error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
