import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, MessageCircle, UserPlus, FileCheck, Bot, Brain, Shield, Users,
  Clock, ArrowRight, Check, Info, ChevronDown, ChevronRight,
} from 'lucide-react';

type AutomationStatus = 'ativo' | 'ativo_limitado' | 'em_breve';

interface Automation {
  id: string;
  title: string;
  category: 'atendimento' | 'grupo' | 'comprovante' | 'analise' | 'seguranca';
  status: AutomationStatus;
  summary: string;
  triggers: string[];
  criteria: string[];
  actions: string[];
  edgeFunctions: string[];
  tables?: string[];
  notes?: string[];
}

const automations: Automation[] = [
  // ===== ATENDIMENTO IA =====
  {
    id: 'ia-resposta-auto',
    title: 'Resposta automática da IA',
    category: 'atendimento',
    status: 'ativo',
    summary: 'A IA responde o cliente automaticamente quando a conversa está com IA ligada. Sempre retorna uma confiança de 0-100% no final.',
    triggers: [
      'Cliente envia mensagem (não é do admin/fromMe)',
      'Conversa tem ai_enabled = true',
      'Não é grupo (@g.us nunca recebe resposta da IA)',
      'IA global está ativa (ai_config.enabled = true) → modo "auto"',
      'IA global pausada mas conv ativa → modo "suggestions" (gera 2 sugestões no painel)',
    ],
    criteria: [
      'System prompt instrui primeira pessoa como Zevaldo',
      'Usa OpenAI gpt-4o-mini (temp 0.4 direto + 0.85 acolhedor no modo sugestões)',
      'Extrai [CONFIANCA:XX%] da resposta via regex',
      'Confiança <40% → marca como aguardando_humano (não envia sozinha)',
    ],
    actions: [
      'Busca as 10 últimas mensagens da conversa como contexto',
      'Busca entradas relevantes da base de conhecimento',
      'Gera 1 resposta (auto) ou 2 sugestões (direct + warm) com temperatures diferentes',
      'Auto: envia direto pelo WhatsApp via evolution-send',
      'Sugestões: grava como draft com suggestion_group_id para aparecer no painel',
    ],
    edgeFunctions: ['evolution-ai-reply', 'evolution-send'],
    tables: ['ai_config', 'knowledge_entries', 'messages', 'conversations'],
  },
  {
    id: 'template-entrada-grupo',
    title: 'Template de entrada no grupo (4 bolhas)',
    category: 'grupo',
    status: 'ativo',
    summary: 'Quando detecta que o cliente quer entrar no grupo de compras coletivas, manda a sequência padrão em 4 mensagens fragmentadas.',
    triggers: [
      'Cliente envia mensagem com intenção clara de entrar',
      'Regex: "quero entrar", "fui indicada", "amiga indicou", "grupo de compras coletivas", "participar do grupo" etc',
      'Conversa NUNCA passou pelo fluxo (group_candidate_status é null)',
    ],
    criteria: [
      'Só dispara na PRIMEIRA detecção (idempotente via group_candidate_status)',
      'Nunca em grupos',
      'Bloqueia a IA normal nessa mensagem (não gera resposta duplicada)',
    ],
    actions: [
      'Marca status como "aguardando_dados" antes de começar (evita race)',
      'Envia "Olá." → espera 1.5s → "Tudo bem?" → 1.8s → "Alguém indicou você?" → 2.2s → template estruturado com os 5 campos',
      'Grava cada mensagem em messages com sent_by="ai" pra distinguir do atendente',
    ],
    edgeFunctions: ['send-group-intake-template', 'evolution-webhook'],
    tables: ['conversations (group_candidate_status)', 'messages'],
    notes: [
      'As 4 mensagens chegam como 4 bolhas separadas no WhatsApp do cliente, com delays naturais entre elas',
      'Se o cliente mandar outra mensagem no meio, a sequência continua normalmente',
    ],
  },
  {
    id: 'extracao-dados-candidato',
    title: 'Extração automática dos dados do candidato',
    category: 'grupo',
    status: 'ativo',
    summary: 'Depois que o template é enviado, a cada mensagem do cliente a IA extrai nome, marca, cidade, galvânica e se participa de outro grupo.',
    triggers: [
      'Conversa está com group_candidate_status = "aguardando_dados" ou "dados_coletados"',
      'OU mensagem contém palavras-chave (nome completo, nome da marca, galvânica, cidade, compras coletivas)',
    ],
    criteria: [
      'Usa OpenAI gpt-4o-mini com temperatura 0 e JSON mode (resposta determinística)',
      'Prompt tem regras rígidas: "outro_grupo" só preenche se o cliente mencionou explicitamente',
      'Nunca inventa valor — campo não informado fica null',
      'Fallback regex se a IA falhar',
    ],
    actions: [
      'Faz merge com dados já coletados (não sobrescreve valor bom com null)',
      'Quando todos 5 campos preenchidos → muda status para "dados_coletados"',
      'Força conversation.status = "aguardando_humano" pra chamar atenção',
      'Card do ChatView e perfil do cliente atualizam via realtime',
    ],
    edgeFunctions: ['group-candidate-extract'],
    tables: ['conversations (group_candidate_data, group_candidate_status)'],
    notes: [
      'Testado em 10 cenários: template formatado, texto corrido, respostas em várias mensagens, números sem intenção (descartado) — 100% correto',
      'Não roda em grupos (@g.us) nem em conversas com status "adicionada" ou "recusada"',
    ],
  },
  {
    id: 'check-participacao-grupo',
    title: 'Verificação automática de participação em grupo',
    category: 'grupo',
    status: 'ativo',
    summary: 'Antes de adicionar um candidato ao grupo, verifica se já é membro. Cache em 3 camadas pra aguentar grupos de até 1024 pessoas.',
    triggers: [
      'Atendente clica em "Verificar grupo" no card',
      'Atendente clica em "Adicionar ao grupo" (verificação automática antes)',
      'Chamada manual via edge function',
    ],
    criteria: [
      '1ª camada: cache em memória do worker (TTL 2min)',
      '2ª camada: snapshot persistente em group_members_snapshot (TTL 5min)',
      '3ª camada: fetch direto na Evolution API (fallback)',
      'Matching tolera @lid (LID do WhatsApp moderno) vs @s.whatsapp.net',
      'Compara sufixo de 10 dígitos para tolerar variação do 9 adicional',
    ],
    actions: [
      'Se já é membro → marca "adicionada" direto sem tentar adicionar de novo',
      'Se não é membro e grupo não está cheio → tenta add direto',
      'Se add falhar (privacidade/não-admin) → busca link de convite e envia no chat',
      'Se grupo com 1024 membros → retorna erro "group_full" sem tentar',
      'Quando Evolution manda webhook GROUP_PARTICIPANTS_UPDATE → atualiza snapshot incrementalmente (delta) sem refetch',
    ],
    edgeFunctions: ['group-membership', 'evolution-webhook'],
    tables: ['group_members_snapshot', 'evolution_config (default_group_jid)'],
    notes: [
      'Benchmark: grupo de 1001 membros → 0.8s (cache DB). Evolution direta → 2-3s',
      'Índice GIN em member_numbers permite matching em O(1) independente do tamanho',
    ],
  },
  {
    id: 'adicionar-ao-grupo',
    title: 'Adicionar automaticamente ao grupo',
    category: 'grupo',
    status: 'ativo',
    summary: 'Atendente clica em "Adicionar ao grupo" e o sistema tenta adicionar direto, com fallback para link de convite.',
    triggers: [
      'Atendente clica em "Adicionar ao grupo" no card de candidato',
      'Candidato tem group_candidate_status = "dados_coletados" (botão só habilita quando dados estão completos)',
    ],
    criteria: [
      'WhatsApp só permite add direto se a conta conectada for admin E o cliente permitir adição por admins (config de privacidade)',
      'Se não rolar, cai automaticamente no plano B: link de convite',
    ],
    actions: [
      'Primeiro verifica se já é membro (via snapshot) — se sim, só marca adicionada',
      'Tenta /group/updateParticipant action=add',
      'Fallback: busca /group/inviteCode e envia mensagem com o link para o cliente',
      'Atualiza snapshot local incrementalmente após add bem-sucedido',
      'Marca conversation.group_candidate_status = "adicionada"',
    ],
    edgeFunctions: ['group-membership'],
    notes: [
      'Grupo padrão configurado em evolution_config.default_group_jid',
      'Dá pra passar explicit groupJid na chamada pra adicionar em grupo diferente',
    ],
  },
  {
    id: 'encaminhar-adriely',
    title: 'Encaminhar revendedoras para Adriely',
    category: 'atendimento',
    status: 'ativo',
    summary: 'Candidatas a revendedoras são direcionadas automaticamente para o contato da Adriely (+55 92 9329-8036).',
    triggers: [
      'Cliente fala "quero ser revendedora", "trabalho com semijoias e quero revender da Zeglam", "sou revendedora" etc',
      'A IA detecta a intenção ao consultar a base de conhecimento',
    ],
    criteria: [
      'Entrada "Quero ser revendedora" na base de conhecimento (categoria atendimento)',
      'IA responde usando a answer cadastrada, com o número da Adriely',
    ],
    actions: [
      'A IA manda: "Que ótimo saber do seu interesse em revender com a Zeglam Joias! Para dar continuidade ao seu cadastro, por favor, entre em contato com a Adriely pelo número +55 92 9329-8036. Ela vai te orientar em todas as etapas."',
    ],
    edgeFunctions: ['evolution-ai-reply'],
    tables: ['knowledge_entries'],
    notes: [
      'O número da Adriely está cadastrado na base de conhecimento — alterar lá basta',
      'Esse fluxo não exige automação de dados, é só roteamento via IA + KB',
    ],
  },
  // ===== COMPROVANTES =====
  {
    id: 'analise-comprovante',
    title: 'Análise automática de comprovantes (imagens)',
    category: 'comprovante',
    status: 'ativo',
    summary: 'Quando o cliente manda uma foto, a IA analisa e detecta se é comprovante de pagamento, extraindo valor, banco e tipo.',
    triggers: [
      'Cliente envia imagem no WhatsApp',
      'Imagem é baixada automaticamente pelo webhook e salva no storage',
      'Após download, evolution-media-analysis é chamada',
    ],
    criteria: [
      'Usa OpenAI gpt-4o-mini com visão (image_url)',
      'Detecta se é: comprovante de pix, boleto, transferência, ou outro',
      'Extrai valor, banco emissor, data quando possível',
      'Não roda em stickers',
    ],
    actions: [
      'Grava em messages.media_analysis o JSON: { is_payment_proof, type, description, payment_value, confidence }',
      'Aparece na aba "Comprovantes" e no bubble da mensagem no chat',
      'Dispara análise de cliente (evolution-client-analysis) como gatilho importante',
    ],
    edgeFunctions: ['evolution-media-analysis', 'evolution-webhook'],
    tables: ['messages (media_analysis)'],
  },
  // ===== ANÁLISE =====
  {
    id: 'analise-cliente',
    title: 'Análise automática do cliente (perfil IA)',
    category: 'analise',
    status: 'ativo',
    summary: 'Enriquece o perfil do cliente com resumo, intenção, estágio do atendimento, sentimento, prioridade, interesse em produtos e próxima ação.',
    triggers: [
      'A cada 5 mensagens do cliente (contador msgs_since_analysis)',
      'Mensagem contém palavra-chave importante: comprovante, pagamento, pix, reclamação, defeito, troca, devolução, grupo, entrar, indicou, indicação',
      'Cliente envia mídia (exceto sticker)',
      'Atendente clica em "Analisar" no header do chat (forceRefresh: true)',
      'Cliente abre aba Clientes e seleciona o cliente pela primeira vez (análise preguiçosa se aiAnalysis estiver vazio)',
    ],
    criteria: [
      'Cache smart: não re-analisa se < 20min da última E cliente não mandou nada novo',
      'Cache smart: não re-analisa se total de texto novo < 15 chars',
      'forceRefresh ignora o cache',
    ],
    actions: [
      'Chama gpt-4o-mini com histórico + KB como contexto',
      'Retorna JSON com 10 campos: resumo, intencao, status_atendimento, sentimento, prioridade (alta/media/baixa), interesse_produtos, tags, proxima_acao, valor_potencial, conversation_type (personal/business)',
      'Grava em conversations.ai_analysis',
      'Aparece em: card verde no ChatView, perfil na aba Clientes, sort por prioridade na lista',
    ],
    edgeFunctions: ['evolution-client-analysis', 'evolution-webhook'],
    tables: ['conversations (ai_analysis, msgs_since_analysis, conversation_type)'],
  },
  // ===== SEGURANÇA =====
  {
    id: 'bloqueio-grupos',
    title: 'Bloqueio total da IA em grupos',
    category: 'seguranca',
    status: 'ativo',
    summary: 'A IA JAMAIS responde em grupos WhatsApp (@g.us), em nenhuma hipótese. 4 camadas de proteção.',
    triggers: [
      'Qualquer mensagem vinda de JID terminado em @g.us',
    ],
    criteria: [
      '1. Trigger no banco força ai_enabled=false ao inserir conversa com whatsapp_jid @g.us',
      '2. Webhook checa jidIsGroup antes de chamar evolution-ai-reply',
      '3. Edge function evolution-ai-reply tem 3 verificações adicionais (entrada, antes de typing, antes de send)',
      '4. UI: botões "IA Ativa" e "Gerar IA" ficam desabilitados com tooltip em grupos',
    ],
    actions: [
      'Resposta automática: nunca dispara',
      'Sugestões: nunca aparecem',
      'Webhook apenas grava a mensagem no histórico para visualização, sem processar IA',
    ],
    edgeFunctions: ['evolution-webhook', 'evolution-ai-reply'],
    tables: ['conversations'],
    notes: [
      'Política de segurança: mesmo que alguém tente forçar ai_enabled=true via SQL, o trigger reverte',
      'Política atende solicitação direta: "de jeito nenhum é para responder grupos, mesmo com a IA ligada"',
    ],
  },
  {
    id: 'idempotencia-msg',
    title: 'Idempotência de mensagens (evita duplicata)',
    category: 'seguranca',
    status: 'ativo',
    summary: 'Garante que webhooks duplicados do WhatsApp não criem mensagens repetidas nem disparem a IA duas vezes.',
    triggers: [
      'Evolution API envia o mesmo evento messages.upsert mais de uma vez (retry)',
    ],
    criteria: [
      'Constraint UNIQUE em messages.whatsapp_message_id',
      'Upsert com ignoreDuplicates: true',
    ],
    actions: [
      'Segunda chamada: INSERT é ignorado silenciosamente',
      'Não duplica mensagem no banco',
      'IA não é chamada duas vezes para o mesmo evento',
    ],
    edgeFunctions: ['evolution-webhook'],
    tables: ['messages'],
  },
  // ===== EM BREVE =====
  {
    id: 'disparos-segmentados',
    title: 'Disparos segmentados',
    category: 'atendimento',
    status: 'em_breve',
    summary: 'Enviar mensagens em massa para grupos de clientes segmentados por interesse, prioridade, último contato etc.',
    triggers: ['Atendente cria uma campanha e define critério de segmentação'],
    criteria: ['Planejado — não implementado'],
    actions: ['Planejado — não implementado'],
    edgeFunctions: [],
  },
  {
    id: 'agendamento-follow-up',
    title: 'Agendamento de follow-up',
    category: 'atendimento',
    status: 'em_breve',
    summary: 'IA detecta que o cliente precisa ser lembrado em X dias e agenda automaticamente um follow-up.',
    triggers: ['Cliente demonstra interesse mas não fecha compra'],
    criteria: ['Planejado — não implementado'],
    actions: ['Planejado — não implementado'],
    edgeFunctions: [],
  },
];

const categoryConfig: Record<Automation['category'], { label: string; color: string; icon: typeof Zap }> = {
  atendimento: { label: 'Atendimento', color: '#60a5fa', icon: MessageCircle },
  grupo: { label: 'Entrada no grupo', color: 'var(--emerald-light)', icon: UserPlus },
  comprovante: { label: 'Comprovantes', color: '#a78bfa', icon: FileCheck },
  analise: { label: 'Análise IA', color: '#fbbf24', icon: Brain },
  seguranca: { label: 'Segurança', color: '#f87171', icon: Shield },
};

const statusConfig: Record<AutomationStatus, { label: string; color: string; bg: string }> = {
  ativo: { label: 'Ativo', color: 'var(--emerald-light)', bg: 'rgba(16,185,129,0.15)' },
  ativo_limitado: { label: 'Ativo (limitado)', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
  em_breve: { label: 'Em breve', color: 'var(--fg-subtle)', bg: 'rgba(148,163,184,0.1)' },
};

function AutomationCard({ auto }: { auto: Automation }) {
  const [open, setOpen] = useState(false);
  const cat = categoryConfig[auto.category];
  const st = statusConfig[auto.status];
  const CatIcon = cat.icon;

  return (
    <div
      style={{
        borderRadius: 14,
        background: 'var(--glass)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        opacity: auto.status === 'em_breve' ? 0.7 : 1,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${cat.color}18`, border: `1px solid ${cat.color}35`,
        }}>
          <CatIcon size={18} style={{ color: cat.color }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--strong-text)' }}>{auto.title}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
              padding: '2px 7px', borderRadius: 5,
              background: st.bg, color: st.color,
            }}>{st.label}</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            {auto.summary}
          </p>
        </div>
        {open
          ? <ChevronDown size={16} style={{ color: 'var(--fg-subtle)', flexShrink: 0 }} />
          : <ChevronRight size={16} style={{ color: 'var(--fg-subtle)', flexShrink: 0 }} />}
      </button>

      <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          style={{ overflow: 'hidden' }}
        >
        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16, borderTop: '1px solid var(--border)' }}>
          {/* Quando ativa */}
          <Section
            icon={<Zap size={13} style={{ color: '#fbbf24' }} />}
            title="Quando é ativada"
            items={auto.triggers}
          />

          {/* Critérios */}
          <Section
            icon={<Info size={13} style={{ color: '#60a5fa' }} />}
            title="Critérios usados"
            items={auto.criteria}
          />

          {/* Ações */}
          <Section
            icon={<ArrowRight size={13} style={{ color: 'var(--emerald-light)' }} />}
            title="O que acontece"
            items={auto.actions}
          />

          {/* Notas */}
          {auto.notes && auto.notes.length > 0 && (
            <Section
              icon={<Check size={13} style={{ color: 'var(--accent)' }} />}
              title="Observações importantes"
              items={auto.notes}
              highlight
            />
          )}

          {/* Rodapé técnico */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 6, borderTop: '1px dashed var(--border)', marginTop: 4 }}>
            {auto.edgeFunctions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Edge:</span>
                {auto.edgeFunctions.map((fn) => (
                  <span key={fn} style={{
                    fontSize: 10, fontFamily: 'monospace',
                    padding: '2px 8px', borderRadius: 5,
                    background: 'rgba(168,85,247,0.1)', color: '#c084fc',
                    border: '1px solid rgba(168,85,247,0.2)',
                  }}>{fn}</span>
                ))}
              </div>
            )}
            {auto.tables && auto.tables.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>DB:</span>
                {auto.tables.map((t) => (
                  <span key={t} style={{
                    fontSize: 10, fontFamily: 'monospace',
                    padding: '2px 8px', borderRadius: 5,
                    background: 'rgba(59,130,246,0.1)', color: '#60a5fa',
                    border: '1px solid rgba(59,130,246,0.2)',
                  }}>{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

function Section({ icon, title, items, highlight }: { icon: React.ReactNode; title: string; items: string[]; highlight?: boolean }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fg-dim)' }}>
          {title}
        </span>
      </div>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 5, listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((it, i) => (
          <li key={i} style={{
            fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.55,
            padding: '6px 10px', borderRadius: 8,
            background: highlight ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.02)',
            borderLeft: highlight ? '2px solid var(--accent)' : '2px solid var(--border)',
          }}>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AutomacoesPage() {
  const [filter, setFilter] = useState<Automation['category'] | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AutomationStatus | 'all'>('all');

  const filtered = automations.filter((a) => {
    if (filter !== 'all' && a.category !== filter) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    return true;
  });

  const activeCount = automations.filter((a) => a.status === 'ativo').length;
  const upcomingCount = automations.filter((a) => a.status === 'em_breve').length;

  return (
    <div style={{ padding: '32px 36px', height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.3em' }}>
            Zeglam
          </span>
          <span style={{ color: 'var(--fg-subtle)' }}>/</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-dim)' }}>Automações</span>
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.025em', color: 'var(--strong-text)', marginBottom: 6 }}>
          AUTOMAÇÕES
        </h1>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', maxWidth: 700, lineHeight: 1.5 }}>
          Lista de todas as automações ativas no sistema, quando são disparadas, critérios usados e o que acontece. Clique em cada uma para ver os detalhes.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="Automações ativas" value={activeCount} icon={Bot} color="var(--emerald-light)" />
        <StatCard label="Em desenvolvimento" value={upcomingCount} icon={Clock} color="var(--fg-subtle)" />
        <StatCard label="Categorias" value={Object.keys(categoryConfig).length} icon={Users} color="var(--accent)" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <FilterButton label="Todas" active={filter === 'all'} onClick={() => setFilter('all')} />
        {Object.entries(categoryConfig).map(([key, cfg]) => (
          <FilterButton
            key={key}
            label={cfg.label}
            active={filter === key}
            color={cfg.color}
            onClick={() => setFilter(key as Automation['category'])}
          />
        ))}
        <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        <FilterButton label="Todos status" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
        <FilterButton label="Ativas" active={statusFilter === 'ativo'} color="var(--emerald-light)" onClick={() => setStatusFilter('ativo')} />
        <FilterButton label="Em breve" active={statusFilter === 'em_breve'} color="var(--fg-subtle)" onClick={() => setStatusFilter('em_breve')} />
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((auto) => (
          <AutomationCard key={auto.id} auto={auto} />
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--fg-subtle)' }}>
            Nenhuma automação encontrada com esses filtros.
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Bot; color: string }) {
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: 'var(--glass)', border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}20`, border: `1px solid ${color}40`,
      }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--strong-text)', lineHeight: 1 }}>{value}</p>
        <p style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{label}</p>
      </div>
    </div>
  );
}

function FilterButton({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
        fontSize: 12, fontWeight: 500, transition: 'all 0.2s',
        color: active ? (color || 'var(--accent)') : 'var(--fg-muted)',
        background: active ? 'var(--glass-strong)' : 'var(--glass)',
        border: `1px solid ${active ? (color || 'var(--accent-border)') : 'var(--border)'}`,
      }}
    >
      {label}
    </button>
  );
}
