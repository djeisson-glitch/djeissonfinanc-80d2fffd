import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";

    switch (type) {
      case "dashboard_insights": {
        systemPrompt = `Você é um consultor financeiro pessoal brasileiro. Analise os dados financeiros e forneça 3-5 insights práticos e acionáveis em português do Brasil. Seja direto, use emojis para destacar pontos importantes. Não repita dados que o usuário já vê no dashboard. Foque em padrões, alertas e oportunidades que não são óbvios.`;
        userPrompt = `Analise este resumo financeiro do mês:
- Receita base: R$ ${context.receita}
- Total despesas: R$ ${context.totalDespesas}
- Total receitas extras: R$ ${context.totalReceitas}
- Saldo projetado: R$ ${context.saldoProjetado}
- % da renda gasta: ${context.percentGasto?.toFixed(1)}%
- Reserva mínima configurada: R$ ${context.reserva}
- Essenciais: R$ ${context.totalEssencial} (${context.pctEssencial?.toFixed(0)}%)
- Não-essenciais: R$ ${context.totalNaoEssencial}

Top categorias de gasto:
${context.topCategorias?.map((c: any) => `- ${c.cat}: R$ ${c.total.toFixed(2)} (${c.pct.toFixed(0)}%)`).join('\n') || 'Nenhuma despesa'}

${context.parcelasAtivas ? `Parcelas ativas: ${context.parcelasAtivas} compromissos futuros` : ''}
${context.faturasPendentes ? `Faturas de cartão pendentes: ${context.faturasPendentes}` : ''}`;
        break;
      }

      case "category_analysis": {
        systemPrompt = `Você é um consultor financeiro pessoal brasileiro. Analise os gastos de uma categoria específica e dê 2-3 insights práticos. Seja conciso e direto.`;
        userPrompt = `Categoria: ${context.categoria}
Total gasto este mês: R$ ${context.totalCategoria}
Percentual do total: ${context.pctTotal?.toFixed(1)}%
Receita mensal: R$ ${context.receita}
Quantidade de transações: ${context.qtdTransacoes}
${context.mediaHistorica ? `Média histórica (3 meses): R$ ${context.mediaHistorica.toFixed(2)}` : ''}
É categoria essencial: ${context.essencial ? 'Sim' : 'Não'}`;
        break;
      }

      case "financing_viability": {
        systemPrompt = `Você é um consultor financeiro e imobiliário brasileiro. Analise a viabilidade de um financiamento imobiliário e dê um parecer claro e honesto com recomendações. Seja objetivo e use dados reais do contexto financeiro do usuário.`;
        userPrompt = `Simulação de financiamento:
- Valor do imóvel: R$ ${context.valorImovel}
- Entrada: R$ ${context.entrada} (${context.percEntrada?.toFixed(1)}%)
- Valor financiado: R$ ${context.financiado}
- Taxa de juros: ${context.taxaAnual}% a.a.
- Prazo: ${context.prazoAnos} anos
- Sistema: ${context.sistema}
- Parcela inicial: R$ ${context.parcelaInicial}
- Total de juros: R$ ${context.totalJuros}

Contexto financeiro:
- Renda mensal: R$ ${context.receitaMensal}
- Despesas mensais atuais: R$ ${context.despesasMensais}
- Saldo livre atual: R$ ${context.saldoLivre}
- Saldo com financiamento: R$ ${context.saldoComFinanciamento}
- % da renda comprometida: ${context.percRenda?.toFixed(1)}%
- Semáforo atual: ${context.semaforo}`;
        break;
      }

      case "scenario_analysis": {
        systemPrompt = `Você é um consultor financeiro e imobiliário brasileiro. Analise os 4 cenários de compra de imóvel apresentados, todos baseados em dados financeiros reais do usuário. Sua resposta deve conter exatamente estas 5 seções em Markdown:
1. **Qual cenário recomenda e por quê** — com base nos números reais
2. **Timing** — o melhor momento para comprar e por quê
3. **Riscos** — alertas sobre a situação financeira
4. **Alavancas** — sugestões de redução de gastos para melhorar o saldo
5. **Meta de reserva** — quanto manter de reserva antes de comprar

Seja objetivo, use os números fornecidos e dê um parecer claro.`;
        const c = context;
        userPrompt = `Análise de cenários para compra de imóvel:

Dados do usuário (baseados em ${c.mesesAnalisados} meses de dados reais):
- Receita média mensal: R$ ${c.receita}
- Imóvel: R$ ${c.parametros.valorImovel} | Entrada: R$ ${c.parametros.entrada}
- Saldo devedor carro: R$ ${c.parametros.saldoDevedorCarro}
- Parcela carro: R$ ${c.parametros.parcelaCarro}/mês
- Meses restantes carro: ${c.parametros.mesesRestantesCarro}
- Empréstimos ativos: R$ ${c.parametros.emprestimosAtivos}/mês

Cenário 0 (Atual): Saldo livre R$ ${c.cenario0.saldo}/mês | 12 meses: R$ ${c.cenario0.saldo12}
Cenário 1 (Compra+Carro): Saldo R$ ${c.cenario1.saldo}/mês | Δ ${c.cenario1.delta}/mês
Cenário 2 (Quita Carro): Saldo R$ ${c.cenario2.saldo}/mês | Δ ${c.cenario2.delta}/mês | Custo quitar: R$ ${c.cenario2.custoQuitar}
Cenário 3 (Carro Quita Sozinho): Saldo com carro R$ ${c.cenario3.saldoComCarro}, sem carro R$ ${c.cenario3.saldoSemCarro}, melhora no mês ${c.cenario3.mesMelhora}`;
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Tipo de análise inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns minutos." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos nas configurações." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao consultar IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "Sem resposta da IA";

    return new Response(JSON.stringify({ analysis: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-advisor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
