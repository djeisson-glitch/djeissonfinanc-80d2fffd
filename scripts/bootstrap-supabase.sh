#!/usr/bin/env bash
# ============================================================================
# Bootstrap do novo projeto Supabase (Plano B — recomeço limpo)
# ============================================================================
# Aplica todas as 18 migrations em ordem cronológica num projeto Supabase vazio.
# Usa psql direto contra a connection string que você passa via env DB_URL.
#
# Uso:
#   DB_URL='postgresql://postgres:SENHA@db.SEU-REF.supabase.co:5432/postgres' \
#     bash scripts/bootstrap-supabase.sh
#
# Pré-requisitos:
#   - psql instalado (`brew install libpq && brew link --force libpq`)
#   - DB_URL apontando pro NOVO projeto Supabase (vazio)
#
# O que faz:
#   1. Lista as 18 migrations em ordem alfabética (= cronológica pelo timestamp)
#   2. Aplica cada uma via psql -f, parando no primeiro erro
#   3. Imprime contagem final de tabelas
# ============================================================================

set -euo pipefail

if [[ -z "${DB_URL:-}" ]]; then
  echo "❌ DB_URL não configurada. Exemplo:"
  echo "   DB_URL='postgresql://postgres:SENHA@db.SEU-REF.supabase.co:5432/postgres' bash $0"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "❌ psql não encontrado. Instale com: brew install libpq && brew link --force libpq"
  exit 1
fi

MIGRATIONS_DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "❌ Diretório de migrations não encontrado: $MIGRATIONS_DIR"
  exit 1
fi

echo "🔍 Testando conexão com o DB..."
if ! psql "$DB_URL" -c 'SELECT 1' >/dev/null 2>&1; then
  echo "❌ Não consegui conectar. Verifica o DB_URL e a senha."
  exit 1
fi
echo "✅ Conectado."

echo ""
echo "📋 Migrations a aplicar (em ordem):"
ls "$MIGRATIONS_DIR"/*.sql | sort | while read f; do
  echo "  - $(basename "$f")"
done

echo ""
read -p "Confirma aplicar tudo no DB $(echo "$DB_URL" | sed -E 's|://[^@]+@|://***@|')? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Cancelado."
  exit 0
fi

echo ""
for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  name=$(basename "$f")
  echo "⏳ Aplicando $name..."
  if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f" >/dev/null; then
    echo "❌ Falhou em $name. Inspeciona o erro acima."
    exit 1
  fi
  echo "  ✅ $name aplicada"
done

echo ""
echo "✅ Todas as migrations aplicadas com sucesso."
echo ""
echo "📊 Tabelas criadas:"
psql "$DB_URL" -c "\dt public.*" 2>/dev/null | grep -E "table|---|Name" | head -20

echo ""
echo "🎯 Próximos passos:"
echo "  1. supabase link --project-ref <REF-NOVO>"
echo "  2. supabase secrets set GEMINI_API_KEY=AIzaSy..."
echo "  3. supabase functions deploy ai-financial-advisor"
echo "  4. supabase functions deploy categorize"
echo "  5. supabase functions deploy migrate-categorias"
echo "  6. supabase functions deploy seed-user"
echo "  7. Trocar .env e fazer deploy no Vercel"
