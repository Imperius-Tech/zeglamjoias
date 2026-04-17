# Zeglam Joias — Progresso do MVP

**Cliente**: Zevaldo (Zeglam Joias)
**Empresa**: Imperius Tech
**Início**: Março 2026
**Entrega do MVP**: 20 de abril de 2026
**Status geral**: Em fase final — integração e testes

---

## Sobre o Projeto

Dashboard de atendimento com IA para a Zeglam Joias (compras coletivas de semijoias). O sistema automatiza o atendimento via WhatsApp usando IA (OpenAI/Gemini), enquanto permite ao Zevaldo supervisionar, aprovar respostas e intervir quando necessário.

### Objetivos do MVP
- Atender clientes no WhatsApp 24/7 com IA treinada
- Separar conversas de negócio vs pessoal automaticamente
- Detectar e processar comprovantes de pagamento
- Permitir ao Zevaldo gerenciar tudo de um painel único
- Base de conhecimento editável para treinar a IA

---

## Fases do Projeto

### Fase 1 — Planejamento (CONCLUÍDO ✅ — 100%)
### Fase 2 — Desenvolvimento (EM ANDAMENTO 🟡 — 70%)
### Fase 3 — Qualidade e Testes (EM ANDAMENTO 🟡 — 40%)
### Fase 4 — Entrega (PENDENTE ⏳ — 0%)

---

## ✅ Fase 1 — Planejamento (100% Concluído)

- [x] Levantamento de requisitos com o Zevaldo
- [x] Definição do escopo do MVP
- [x] Escolha da stack técnica (React + Supabase + Evolution API)
- [x] Definição de persona da IA ("Zevaldo" em primeira pessoa)
- [x] Mapeamento de fluxos de atendimento
- [x] Definição da base de conhecimento inicial
- [x] Cronograma de entrega (20/04/2026)

---

## 🟡 Fase 2 — Desenvolvimento (70% Concluído)

### Infraestrutura e Backend

- [x] **Criar estrutura base do projeto** — React 19 + TypeScript + Vite + Zustand
- [x] **Criar banco de dados no Supabase** — Postgres com RLS
- [x] **Modelar tabelas principais**:
  - `conversations` (conversas WhatsApp)
  - `messages` (mensagens)
  - `knowledge_entries` (base de conhecimento)
  - `ai_config` (configuração da IA)
  - `ai_training_examples` (correções para aprendizado)
- [x] **Configurar Realtime** — atualização ao vivo das conversas
- [x] **Criar Edge Functions no Supabase (Deno)**:
  - `evolution-webhook` — recebe mensagens do WhatsApp
  - `evolution-send` — envia mensagens
  - `evolution-sync` — sincroniza conversas
  - `evolution-ai-reply` — gera resposta com IA
  - `evolution-media-analysis` — analisa imagens (comprovantes)
  - `evolution-client-analysis` — classifica cliente
  - `evolution-media-download` — baixa mídia do WhatsApp
  - `evolution-qrcode` — QR code para conectar WhatsApp
  - `debug-messages` — depuração

### Integração WhatsApp

- [x] **Integrar Evolution API** — conexão via QR Code
- [x] **Receber mensagens do WhatsApp** via webhook
- [x] **Enviar mensagens pelo painel** (sent_by: panel)
- [x] **Processar mídia** (imagens, documentos, stickers)
- [x] **Detectar comprovantes de pagamento** automaticamente
- [x] **Classificar conversa** (business/personal/unknown)

### Inteligência Artificial

- [x] **Suporte dual-provider** — OpenAI (gpt-4o-mini) + Google Gemini (gemini-2.5-flash)
- [x] **Fallback automático** (Gemini → gemma-3-4b-it se 503)
- [x] **System prompt customizado** do Zevaldo em primeira pessoa
- [x] **Base de conhecimento integrada** (~70 Q&A em 6 categorias)
- [x] **Sistema de aprendizado** via `ai_training_examples`
- [x] **Sistema de confiança** — IA avalia a si mesma de 0-100%
  - 80-100%: resposta clara
  - 60-79%: parcial/inferida
  - 40-59%: tentando ajudar
  - <40%: encaminha para humano
- [x] **Detecção de conversas pessoais** → silencia automaticamente
- [x] **Modo draft** — aprovação antes de enviar

### Frontend — Dashboard

- [x] **Layout principal** (Sidebar + Shell + Header)
- [x] **Lista de conversas** com filtros (todas, IA, aguardando, silenciadas)
- [x] **Chat view** com histórico completo
- [x] **Indicadores visuais** (status, tipo, contador de não lidas)
- [x] **Busca de conversas**
- [x] **Painel de conhecimento editável** (CRUD de Q&A)
- [x] **Categorização** (produtos, entrega, pagamento, trocas, promoções, atendimento)
- [x] **Painel de teste da IA** com % de confiança animada
- [x] **Configurações**:
  - Dados da loja
  - Provider da IA + API Key + Modelo
  - Tom de voz, saudação, despedida
  - Regras de encaminhamento
  - Notificações
  - Conta
- [x] **Takeover de conversa** — humano assume
- [x] **Modo demo** para apresentações (sem backend)
- [x] **Animações** (Framer Motion)
- [x] **Temas e ícones** (Lucide Icons)

### Segurança

- [x] **Variáveis de ambiente protegidas** (.env no gitignore)
- [x] **.env.example** para setup
- [x] **RLS** no Supabase
- [x] **Deploy seguro** via Lovable

### Pendente (prioritário para MVP)

#### 🎯 Melhorias na IA (CRÍTICO)
- [ ] **Refinar qualidade dos prompts** — system prompt mais robusto e específico
- [ ] **Melhorar qualidade das respostas**:
  - Corrigir erros de digitação recorrentes (ex: "negoceio")
  - Tornar respostas mais naturais e menos robotizadas
  - Ajustar tom para cada tipo de cliente (revendedor vs varejo)
  - Reduzir respostas genéricas de baixa confiança
- [ ] **Expandir base de conhecimento** — cobrir mais cenários reais
- [ ] **Few-shot examples** no prompt — exemplos de boas respostas
- [ ] **Validação automática** — filtrar respostas com typos antes de enviar
- [ ] **Testar com histórico real** — treinar com conversas passadas do Zevaldo

#### 🎨 Melhorias no Frontend (IMPORTANTE)
- [ ] **Refinar UI geral** — polish visual, espaçamentos, tipografia
- [ ] **Melhorar painel de clientes**:
  - Visualização completa do perfil do cliente
  - Histórico de compras e pagamentos
  - Tags e categorização (revendedor/varejo/VIP)
  - Notas internas sobre o cliente
  - Métricas por cliente (ticket médio, frequência)
- [ ] **Adicionar aba de "Disparos"** (NOVA FUNCIONALIDADE):
  - Envio de mensagens em massa (campanhas)
  - Segmentação de clientes (por tag, status, último pedido)
  - Templates de mensagens reutilizáveis
  - Agendamento de disparos
  - Relatório de entrega e leitura
  - Links de compra coletiva com tracking
- [ ] **Melhorar chat view** — busca dentro da conversa, pinagem de mensagens
- [ ] **Responsividade mobile** — dashboard funcional no celular

#### 📊 Outros pendentes
- [ ] **Dashboard de métricas** (conversas/dia, taxa de resolução, etc)
- [ ] **Relatórios financeiros** (comprovantes consolidados)
- [ ] **Exportar conversas**
- [ ] **Integração com sistema de romaneio** (atualmente manual)

---

## 🟡 Fase 3 — Qualidade e Testes (40% Concluído)

- [x] **Teste de integração WhatsApp** — recebendo e enviando
- [x] **Teste de IA com dados reais** — respostas validadas
- [x] **Teste de sistema de confiança** — validado com múltiplos cenários
- [x] **Teste de processamento de comprovantes** — imagens analisadas
- [x] **Teste em modo demo** — funcional para apresentação
- [ ] **Teste de carga** — múltiplas conversas simultâneas
- [ ] **Teste de segurança** (RLS, permissions)
- [ ] **Teste de recuperação** (desconexão WhatsApp, falha de IA)
- [ ] **Validação final com Zevaldo** (UAT — User Acceptance Test)
- [ ] **Correções pós-feedback**

---

## ⏳ Fase 4 — Entrega (0% Concluído)

- [ ] **Treinamento do Zevaldo** — como usar o painel
- [ ] **Documentação de uso** (manual em PDF)
- [ ] **Deploy em produção** (Lovable + domínio customizado)
- [ ] **Configuração de WhatsApp Business** oficial
- [ ] **Handoff do código** para manutenção
- [ ] **Plano de suporte pós-entrega** (30 dias)

---

## Entregas já realizadas

### Commits no GitHub (`Imperius-Tech/zeglamjoias`)
1. `8539f11` — MVP inicial: IA, WhatsApp, Supabase, Comprovantes, Clientes
2. `b6bc257` — Sistema de percentual de precisão nas respostas da IA
3. `1ef701b` — Modo demo e proteção do .env

### Marcos importantes
- ✅ **Março 2026**: Arquitetura definida e backend iniciado
- ✅ **Março 2026**: Integração Evolution API funcionando
- ✅ **Abril 2026**: IA integrada com OpenAI + Gemini
- ✅ **12/04/2026**: Sistema de confiança (%) implementado
- ✅ **13/04/2026**: Modo demo + deploy no GitHub
- 🎯 **20/04/2026**: Entrega do MVP

---

## Números do Projeto

| Métrica | Valor |
|---------|-------|
| Tarefas totais do MVP | ~60 |
| Tarefas concluídas | ~42 |
| Progresso geral | **~70%** |
| Linhas de código (TS) | ~3.500 |
| Edge Functions | 9 |
| Tabelas no banco | 5 |
| Q&A na base de conhecimento | ~70 |
| Dias até a entrega | 6 (ref. 14/04) |

---

## Estrutura para o Site de Progresso (baseado no Buyate)

Com base no projeto da Buyate Contabilidade, o site de progresso do Zeglam deve ter:

### Cabeçalho
- Logo Zeglam Joias
- Nome: **Zeglam Joias — Dashboard IA**
- Cliente: **Zevaldo**
- Subtítulo: "Acompanhe em tempo real o progresso do seu projeto"
- Datas: Início **Mar/2026** → Previsão **20/04/2026**

### Cards de Resumo
1. **Tarefas concluídas**: 42 de 60 total
2. **Fase atual**: Desenvolvimento / Qualidade
3. **Próximo prazo**: 20 de abril
4. **Dias restantes**: 6

### Barra de Progresso Geral: 70%

### Barras por Fase
- Planejamento: **100%** ✅
- Desenvolvimento: **70%** 🟡
- Qualidade: **40%** 🟡
- Entrega: **0%** ⏳

### Tabela de Tarefas
Colunas: Tarefa | Fase | Status | Prazo

Prioridades visuais:
- 🔴 Crítico (bloqueia entrega)
- 🟡 Importante
- 🟢 Melhoria

### Seções detalhadas
Dividir em 4 colunas (uma por fase):
- ✅ Planejamento (concluído)
- 🟡 Desenvolvimento (em andamento)
- 🟡 Qualidade (em andamento)
- ⏳ Entrega (pendente)

### Cores sugeridas (tema Zeglam)
- Dourado/âmbar (marca das joias): `#d4a843`
- Azul profissional: `#3b82f6`
- Verde (concluído): `#10b981`
- Cinza (pendente): `#6b7280`

---

## Stack Recomendada para o Site

**Opção rápida (mesma do Buyate)**:
- Next.js ou Vite + React
- Tailwind CSS
- Dados em JSON estático (sem backend)
- Deploy no Vercel/Lovable

**Se quiser dinâmico**:
- Supabase como fonte dos dados (já temos conta)
- Tabela `project_tasks` com status em tempo real
- Realtime para atualizar sem refresh

---

## Links Importantes

- **Repo GitHub**: https://github.com/Imperius-Tech/zeglamjoias
- **Deploy atual**: https://zeglammvp.lovable.app
- **Supabase do projeto**: `cmvdcacwdlzudyqpkdea`
- **Data da entrega**: 20/04/2026

---

*Documento gerado em 14/04/2026 — para servir de base na criação do site de progresso do cliente.*
