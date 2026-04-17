# Zeglam Joias Dashboard

Dashboard de atendimento com IA para Zeglam Joias (compras coletivas de semijoias). Integra WhatsApp via Evolution API + IA (OpenAI/Gemini) para respostas automáticas.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Zustand (state)
- **Backend**: Supabase (Postgres + Edge Functions Deno + Realtime)
- **IA**: OpenAI (gpt-4o-mini) ou Gemini (gemini-2.5-flash)
- **WhatsApp**: Evolution API
- **Deploy**: Lovable (zeglammvp.lovable.app)

## Comandos

```bash
npm run dev    # Dev server em http://localhost:5173
npm run build  # Build produção (tsc -b && vite build)
```

## Estrutura

```
src/
  lib/
    store.ts         # Zustand store — conversas, mensagens, realtime
    supabase.ts      # Cliente Supabase
    mock-data.ts     # Dados mockados para DEMO_MODE
  components/
    conhecimento/    # Base de conhecimento + TestIAPanel
    conversas/       # Lista + chat
    configuracoes/   # Settings (AI, Store, etc)
    layout/          # Shell, Sidebar, Header

supabase/            # Edge Functions (não local — deployed via MCP)
```

## Modo Demo

`VITE_DEMO_MODE=true` no `.env` → carrega conversas/knowledge base mockados (sem backend). Usado para apresentações.

O `.env` está no `.gitignore`. Use `.env.example` como template.

## Supabase

**Projeto Zeglam Joias**: `cmvdcacwdlzudyqpkdea` (acesso via MCP `mcp__supabase__*`)

Tabelas principais:
- `conversations` — conversas WhatsApp (customer_name, customer_phone, status, ai_enabled)
- `messages` — mensagens (author: cliente/ia/humano/sistema)
- `knowledge_entries` — base de conhecimento (question, answer, category)
- `ai_config` — config da IA (enabled, provider, api_key, system_prompt, model)
- `ai_training_examples` — correções para aprendizado

Edge Functions (deployed):
- `evolution-ai-reply` — gera resposta com IA + confidence score
- `evolution-webhook` — recebe mensagens do WhatsApp
- `evolution-sync` — sincroniza conversas
- `evolution-send` — envia mensagens
- `evolution-media-analysis` — analisa imagens (comprovantes)
- `evolution-client-analysis` — classifica cliente (business/personal)

## Sistema de Confiança da IA

A IA **sempre responde** e inclui `[CONFIANCA:XX%]` no final da resposta. A Edge Function extrai esse valor via regex e retorna `confidence: 0-100`.

Níveis:
- **80-100%** (verde): resposta clara da base de conhecimento
- **60-79%** (amarelo): resposta parcial/inferida
- **40-59%** (laranja): tentando ajudar, sem certeza
- **<40%** (vermelho): marca `needsHuman: true`, status vira `aguardando_humano`

System prompt do `ai_config` instrui a IA a nunca silenciar — sempre dar uma resposta útil + avaliação honesta da confiança.

## Convenções

- Arquivos em inglês (camelCase), UI/prompts em português (pt-BR)
- Persona da IA: "Zevaldo" (dono da loja), primeira pessoa, amigável
- Cores do tema via CSS vars (`--accent`, `--surface`, `--fg-*`)
- Framer Motion para animações
- Nunca commitar `.env` ou chaves

## Deploy

- **Git**: `https://github.com/Imperius-Tech/zeglamjoias.git` (branch `main`)
- **Produção**: Lovable puxa do GitHub automaticamente
- **Edge Functions**: deploy via `mcp__supabase__deploy_edge_function` (não há arquivos locais de `supabase/functions/`)

## Outros projetos Supabase acessíveis

- `Imperius Tech Dashboard` (mpkpqobxuepssidehuuw)
- `DashmedPro` (adzaqkduxnpckbcuqpmg)

Não confundir com o projeto Zeglam (`cmvdcacwdlzudyqpkdea`).
