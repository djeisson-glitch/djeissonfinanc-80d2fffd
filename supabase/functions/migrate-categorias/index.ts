import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = user.id;

    // Get all categories for user
    const { data: categorias } = await supabaseAdmin.from("categorias").select("*").eq("user_id", userId);
    if (!categorias || categorias.length === 0) {
      return new Response(JSON.stringify({ message: "No categories found. Seed them first." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build lookup: nome -> id (parent first, then children)
    const catByName: Record<string, string> = {};
    for (const c of categorias) {
      catByName[c.nome] = c.id;
    }

    // Migrate transacoes
    const { data: transacoes } = await supabaseAdmin
      .from("transacoes")
      .select("id, categoria, categoria_id")
      .eq("user_id", userId)
      .is("categoria_id", null);

    let migratedTx = 0;
    if (transacoes && transacoes.length > 0) {
      for (const tx of transacoes) {
        const catId = catByName[tx.categoria];
        if (catId) {
          await supabaseAdmin.from("transacoes").update({ categoria_id: catId }).eq("id", tx.id);
          migratedTx++;
        }
      }
    }

    // Migrate regras_categorizacao
    const { data: regras } = await supabaseAdmin
      .from("regras_categorizacao")
      .select("id, categoria, categoria_id")
      .eq("user_id", userId)
      .is("categoria_id", null);

    let migratedRegras = 0;
    if (regras && regras.length > 0) {
      for (const r of regras) {
        const catId = catByName[r.categoria];
        if (catId) {
          await supabaseAdmin.from("regras_categorizacao").update({ categoria_id: catId }).eq("id", r.id);
          migratedRegras++;
        }
      }
    }

    return new Response(JSON.stringify({
      message: "Migration complete",
      migratedTransactions: migratedTx,
      totalTransactions: transacoes?.length || 0,
      migratedRules: migratedRegras,
      totalRules: regras?.length || 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
