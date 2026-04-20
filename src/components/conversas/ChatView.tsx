import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Send, Phone, AlertTriangle, Loader, X, Reply, CheckCircle, Trash2, Bot, User, Power, Pencil, Brain, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDashboardStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { MessageBubble } from './MessageBubble';
import { GroupCandidateCard } from './GroupCandidateCard';
import type { ConversationStatus, Message } from '@/lib/mock-data';

const statusLabels: Record<ConversationStatus, { label: string; color: string }> = {
  ia_respondendo: { label: 'IA respondendo', color: 'var(--emerald-light)' },
  aguardando_humano: { label: 'Aguardando humano', color: 'var(--amber-light)' },
  silenciada: { label: 'Silenciada', color: 'var(--red-light)' },
  encerrada: { label: 'Encerrada', color: 'var(--fg-subtle)' },
};

const avatarGradients = [
  'linear-gradient(135deg,#f43f5e,#db2777)', 'linear-gradient(135deg,#8b5cf6,#7c3aed)',
  'linear-gradient(135deg,#3b82f6,#4f46e5)', 'linear-gradient(135deg,#06b6d4,#0d9488)',
  'linear-gradient(135deg,#f59e0b,#ea580c)', 'linear-gradient(135deg,#10b981,#16a34a)',
  'linear-gradient(135deg,#d946ef,#db2777)', 'linear-gradient(135deg,#0ea5e9,#3b82f6)',
];

function pickGradient(n: string) { let h = 0; for (let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h); return avatarGradients[Math.abs(h) % avatarGradients.length]; }

export function ChatView() {
  const navigate = useNavigate();
  const conversations = useDashboardStore((s) => s.conversations);
  const selectedId = useDashboardStore((s) => s.selectedConversationId);
  const instanceId = useDashboardStore((s) => s.activeInstanceId);
  const conv = conversations.find((c) => c.id === selectedId);
  const endRef = useRef<HTMLDivElement>(null);
  const [msgText, setMsgText] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [togglingAI, setTogglingAI] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingDraft, setEditingDraft] = useState<Message | null>(null);
  const [templateExpanded, setTemplateExpanded] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // Tick de 500ms pra atualizar contador (buffer pendente OU draft com autoSendAt)
  useEffect(() => {
    const hasDraftWithAutoSend = conv?.messages.some((m) => m.isDraft && m.autoSendAt);
    const hasPendingBuffer = conv?.pendingReplyAt != null;
    if (!hasDraftWithAutoSend && !hasPendingBuffer) return;
    const id = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(id);
  }, [conv?.messages, conv?.pendingReplyAt]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conv?.messages.length, selectedId]);

  // Nota: geração automática de sugestões e client-analysis acontecem no webhook v33
  // quando a mensagem do cliente chega (evolution-webhook -> evolution-ai-reply + evolution-client-analysis).
  // O realtime do Supabase atualiza a UI com drafts/análise gerados. Não disparamos aqui pra evitar re-processamento ao abrir conversa.

  if (!conv) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: 80, height: 80, borderRadius: 24, background: 'var(--glass)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <MessageSquare size={32} style={{ color: 'var(--fg-faint)' }} />
      </motion.div>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }}
        style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-muted)' }}>Selecione uma conversa para começar</motion.p>
    </div>
  );

  // Se a IA foi desligada pelo Zevaldo, o chip de status reflete isso em vez do status do banco
  const st = conv.aiEnabled === false
    ? { label: 'IA pausada', color: 'var(--fg-subtle)' }
    : statusLabels[conv.status];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header - Aligned 72px */}
      <div className="chat-header" style={{ height: 72, display: 'flex', alignItems: 'center', padding: '0 20px', flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'var(--header-bg)', backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {conv.profilePicUrl ? (
              <img src={conv.profilePicUrl} alt={conv.customerName} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: pickGradient(conv.customerName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{conv.customerName[0]?.toUpperCase()}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--strong-text)', letterSpacing: '-0.01em' }}>{conv.customerName}</span>
                {conv.conversationType === 'personal' && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontWeight: 900 }}>P</span>}
                {conv.conversationType === 'business' && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(16,185,129,0.15)', color: 'var(--emerald-light)', fontWeight: 900 }}>N</span>}
                <span style={{ fontSize: 10, fontWeight: 600, color: st.color, padding: '2px 8px', borderRadius: 6, background: 'var(--glass-strong)' }}>{st.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-subtle)' }}>
                <Phone size={11} /><span>{conv.customerPhone}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!conv.isGroup && (
              <>
                <button
                  onClick={async () => {
                    if (togglingAI) return;
                    setTogglingAI(true);
                    const newVal = !conv.aiEnabled;
                    useDashboardStore.setState((state) => ({ conversations: state.conversations.map((c) => c.id === conv.id ? { ...c, aiEnabled: newVal } : c) }));
                    await supabase.from('conversations').update({ ai_enabled: newVal }).eq('id', conv.id);
                    setTogglingAI(false);
                  }}
                  title={conv.aiEnabled ? 'IA Ativa — clique para desativar' : 'IA Desativada — clique para ativar'}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: conv.aiEnabled ? 'rgba(16,185,129,0.1)' : 'var(--glass)', border: `1px solid ${conv.aiEnabled ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`, color: conv.aiEnabled ? 'var(--emerald-light)' : 'var(--fg-subtle)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  <Power size={12} /> <span className="chat-header-btn-label">{conv.aiEnabled ? 'IA Ativa' : 'IA Off'}</span>
                </button>
                <button
                  onClick={async () => {
                    if (aiGenerating) return;
                    setAiGenerating(true);
                    try {
                      await supabase.functions.invoke('evolution-ai-reply', { body: { conversationId: conv.id, mode: 'suggestions', force: true } });
                    } finally {
                      setAiGenerating(false);
                    }
                  }}
                  disabled={aiGenerating}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8,
                    background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))',
                    border: '1px solid rgba(212,175,55,0.3)',
                    color: 'var(--accent)', fontSize: 11, fontWeight: 600,
                    cursor: aiGenerating ? 'wait' : 'pointer',
                    opacity: aiGenerating ? 0.7 : 1,
                  }}
                  title="Gerar sugestões de resposta com IA"
                >
                  {aiGenerating ? <Loader size={12} className="spin" /> : <Bot size={12} />}
                  <span className="chat-header-btn-label">{aiGenerating ? 'Gerando…' : 'Gerar IA'}</span>
                </button>
                <button
                  onClick={async () => {
                    if (analyzing) return;
                    setAnalyzing(true);
                    await supabase.functions.invoke('evolution-client-analysis', { body: { conversationId: conv.id, forceRefresh: true } });
                    setAnalyzing(false);
                  }}
                  title="Analisar conversa com IA"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-muted)', fontSize: 11, fontWeight: 500, cursor: analyzing ? 'wait' : 'pointer' }}
                >
                  {analyzing ? <Loader size={12} className="spin" /> : <Sparkles size={12} />} <span className="chat-header-btn-label">Analisar</span>
                </button>
                <button
                  onClick={async () => {
                    if (syncing) return;
                    setSyncing(true);
                    await supabase.functions.invoke('evolution-media-download', { body: { conversationId: conv.id, limit: 100 } });
                    // Refresh local data
                    useDashboardStore.getState().loadConversations();
                    setSyncing(false);
                  }}
                  title="Sincronizar mídias da conversa"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-muted)', fontSize: 11, fontWeight: 500, cursor: syncing ? 'wait' : 'pointer' }}
                >
                  {syncing ? <Loader size={12} className="spin" /> : <Loader size={12} />} <span className="chat-header-btn-label">Sincronizar</span>
                </button>
                <button onClick={() => navigate(`/clientes?id=${conv.id}`)} title="Ver perfil do cliente" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-muted)', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>
                  <User size={12} /> <span className="chat-header-btn-label">Cliente</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* AI Summary (Fixed below header) */}
      {conv.aiAnalysis?.resumo && (
        <div style={{ padding: '8px 20px', background: 'var(--header-bg)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: 'linear-gradient(to right, rgba(212, 175, 55, 0.08), rgba(212, 175, 55, 0.02))', borderLeft: '3px solid var(--accent)', borderRadius: '0 8px 8px 0' }}>
            <Brain size={14} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.4, margin: 0 }}>
              <strong style={{ fontWeight: 600, color: 'var(--accent)', marginRight: 6 }}>Contexto IA:</strong> {conv.aiAnalysis.resumo}
            </p>
          </div>
        </div>
      )}

      {/* Group Candidate Card */}
      <GroupCandidateCard conv={conv} />

      {/* Silence Banner */}
      {conv.status === 'silenciada' && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          style={{ margin: '16px 16px 0', padding: 12, borderRadius: 12, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertTriangle size={18} style={{ color: 'var(--red-light)', flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: '#fca5a5', lineHeight: 1.5 }}>A IA não soube responder essa pergunta e silenciou. Responda manualmente.</p>
        </motion.div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {conv.messagesLoaded === false && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '24px 0', color: 'var(--fg-subtle)', fontSize: 12 }}>
              <Loader size={14} className="spin" />
              <span>Carregando histórico…</span>
            </div>
          )}
          {conv.messages
            .filter((msg) => !msg.suggestionGroupId)
            .map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                quotedMessage={msg.quotedMessageId ? conv.messages.find((m) => m.id === msg.quotedMessageId) : null}
                onReply={(m) => { setReplyTo(m); inputRef.current?.focus(); }}
              />
            ))}
          <div ref={endRef} />
        </div>
      </div>

      {/* Template: entrada no grupo (mensagens separadas) */}
      {(() => {
        // Mostra em 2 estados: intent_detectado (antes do Zevaldo enviar) e aguardando_dados (se ainda faltar algo)
        const showInStatuses = ['intent_detectado', 'aguardando_dados'];
        if (!showInStatuses.includes(conv.groupCandidateStatus || '')) return null;

        const realMessages = conv.messages.filter((m) => !m.isDraft);
        const last = realMessages[realMessages.length - 1];
        if (!last || last.author !== 'cliente') return null;

        // Nao mostra se o template ja foi enviado antes (detecta pela msg 3)
        const templateSignature = 'Solicito, por gentileza, o envio das seguintes informações';
        const alreadySent = realMessages.some(
          (m) => (m.author === 'humano' || m.author === 'ia') &&
                 typeof m.content === 'string' &&
                 m.content.includes(templateSignature)
        );
        if (alreadySent) return null;

        const templates = [
          'Olá 😊',
          'Tudo bem?',
          'Solicito, por gentileza, o envio das seguintes informações:\n\n• Nome completo:\n• Nome da marca:\n• Cidade:\n• Galvânica utilizada:\n\nVocê já participa de algum Grupo de Compras Coletivas?\nSe sim, poderia informar o nome?\n\nApós o registro dos dados, realizarei sua inclusão no grupo.',
          'Alguém indicou você?',
        ];

        const sendTemplate = async () => {
          for (const text of templates) {
            await supabase.functions.invoke('evolution-send', { body: { conversationId: conv.id, text } });
            await new Promise((r) => setTimeout(r, 700));
          }
          await supabase.from('conversations').update({ status: 'aguardando_humano' }).eq('id', conv.id);
        };

        const dismissTemplate = () => {
          sessionStorage.setItem(`dismiss-template-${conv.id}`, '1');
          useDashboardStore.setState((state) => ({ conversations: [...state.conversations] }));
        };

        if (sessionStorage.getItem(`dismiss-template-${conv.id}`)) return null;

        const expanded = templateExpanded;

        return (
          <div style={{ borderTop: '1px solid rgba(251,191,36,0.3)', background: 'linear-gradient(to bottom, rgba(251,191,36,0.06), rgba(251,191,36,0.02))', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
              <Sparkles size={13} style={{ color: '#fbbf24', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                Template ({templates.length} msgs)
              </span>
              <button
                onClick={() => setTemplateExpanded((v) => !v)}
                style={{ marginLeft: 'auto', padding: '4px 8px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 6, color: '#fbbf24', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
              >
                {expanded ? 'Ocultar prévia' : 'Ver prévia'}
              </button>
              <button
                onClick={sendTemplate}
                style={{ padding: '6px 14px', borderRadius: 8, background: '#fbbf24', color: '#000', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}
              >
                Enviar {templates.length} msgs
              </button>
              <button onClick={dismissTemplate} title="Ocultar" style={{ padding: 4, background: 'none', border: 'none', color: 'var(--fg-subtle)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Trash2 size={12} />
              </button>
            </div>
            {expanded && (
              <div style={{ padding: '0 16px 10px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {templates.map((t, i) => (
                  <div key={i} style={{ padding: 8, borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--fg-subtle)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Msg {i + 1}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--fg-dim)', lineHeight: 1.4, margin: 0, whiteSpace: 'pre-wrap' }}>{t}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Pending buffer placeholder: IA vai responder em Xs (antes de gerar o draft) */}
      {(() => {
        if (!conv.pendingReplyAt) return null;
        // Se ja tem drafts de sugestao, usa o painel deles em vez deste placeholder
        const hasDrafts = conv.messages.some((m) => m.isDraft && m.suggestionGroupId);
        if (hasDrafts) return null;
        const msUntil = conv.pendingReplyAt.getTime() - nowTick;
        const secondsLeft = Math.max(0, Math.ceil(msUntil / 1000));
        const isWaiting = msUntil > 0;
        const msgCount = conv.pendingReplyMsgCount || 1;

        const cancelBuffer = async () => {
          if (!conv.pendingReplyAt) return;
          // Remove entry do pending_ai_replies pra impedir geração
          useDashboardStore.setState((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === conv.id ? { ...c, pendingReplyAt: null, pendingReplyMsgCount: null } : c
            ),
          }));
          await supabase.from('pending_ai_replies').delete().eq('conversation_id', conv.id);
        };

        return (
          <div style={{
            borderTop: '1px solid rgba(212, 175, 55, 0.2)',
            background: 'linear-gradient(to bottom, rgba(212, 175, 55, 0.04), transparent)',
            padding: '10px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Bot size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                IA preparando resposta
              </span>
              {isWaiting ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                  background: 'rgba(234,179,8,0.12)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)',
                }}>
                  <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#eab308' }} />
                  Aguardando mais msgs · {secondsLeft}s
                </span>
              ) : (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                  background: 'rgba(212,175,55,0.15)', color: 'var(--accent)', border: '1px solid var(--accent-border)',
                }}>
                  <Loader size={10} className="spin" />
                  Gerando resposta…
                </span>
              )}
              {msgCount > 1 && (
                <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>
                  {msgCount} msgs agrupadas
                </span>
              )}
              <button
                onClick={cancelBuffer}
                title="Cancela o envio automático (IA não vai gerar resposta)"
                style={{
                  marginLeft: 'auto',
                  padding: '3px 10px', borderRadius: 6,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
                  color: '#ef4444', cursor: 'pointer', fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <X size={10} /> Cancelar
              </button>
            </div>
            {isWaiting && (
              <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: 'var(--surface-2)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.max(0, Math.min(100, (msUntil / 12000) * 100))}%`,
                  background: 'linear-gradient(90deg, #eab308, var(--accent))',
                  transition: 'width 0.5s linear',
                }} />
              </div>
            )}
          </div>
        );
      })()}

      {/* AI Suggestions Panel */}
      {(() => {
        const suggestions = conv.messages.filter((m) => m.isDraft && m.suggestionGroupId);
        if (suggestions.length === 0) return null;
        // Se template de entrada no grupo esta ativo, oculta sugestoes (template prevalece)
        if (conv.groupCandidateStatus === 'aguardando_dados' && !sessionStorage.getItem(`dismiss-template-${conv.id}`)) {
          const last = conv.messages.filter((m) => !m.isDraft).slice(-1)[0];
          if (last && last.author === 'cliente') return null;
        }

        const approveAndSend = async (chosen: Message) => {
          const allIds = suggestions.map((s) => s.id);
          useDashboardStore.setState((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === conv.id ? { ...c, messages: c.messages.filter((m) => !allIds.includes(m.id)), status: 'aguardando_humano' } : c
            ),
          }));
          supabase.functions.invoke('evolution-send', { body: { conversationId: conv.id, text: chosen.content } });
          await supabase.from('messages').delete().in('id', allIds);
          await supabase.from('conversations').update({ status: 'aguardando_humano' }).eq('id', conv.id);
        };

        const discardAll = async () => {
          const allIds = suggestions.map((s) => s.id);
          useDashboardStore.setState((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === conv.id ? { ...c, messages: c.messages.filter((m) => !allIds.includes(m.id)), status: 'aguardando_humano' } : c
            ),
          }));
          await supabase.from('messages').delete().in('id', allIds);
          await supabase.from('conversations').update({ status: 'aguardando_humano' }).eq('id', conv.id);
        };

        // auto_send_at: todas sugestoes do grupo tem o mesmo valor (definido no ai-reply)
        const autoSendAt = suggestions.find((s) => s.autoSendAt)?.autoSendAt || null;
        const msUntilSend = autoSendAt ? autoSendAt.getTime() - nowTick : 0;
        const secondsLeft = autoSendAt && msUntilSend > 0 ? Math.ceil(msUntilSend / 1000) : 0;
        const willAutoSend = autoSendAt && msUntilSend > 0;
        // Timer venceu mas drafts ainda estao na UI = cron processando (escolhendo+enviando)
        const isProcessing = !!(autoSendAt && msUntilSend <= 0);
        // Sub-estado visual: ate ~1.5s mostra "escolhendo", depois "enviando"
        const msSinceTimerEnd = autoSendAt ? nowTick - autoSendAt.getTime() : 0;
        const processingPhase: 'choosing' | 'sending' = msSinceTimerEnd < 1500 ? 'choosing' : 'sending';
        // Melhor variante (maior confidence) \u2014 destacada quando processing
        const bestSuggestionId = [...suggestions].sort((a, b) => (b.suggestionConfidence || 0) - (a.suggestionConfidence || 0))[0]?.id;

        const cancelAutoSend = async () => {
          const allIds = suggestions.map((s) => s.id);
          useDashboardStore.setState((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === conv.id ? { ...c, messages: c.messages.map((m) => allIds.includes(m.id) ? { ...m, autoSendAt: null } : m) } : c
            ),
          }));
          await supabase.from('messages').update({ auto_send_at: null }).in('id', allIds);
        };

        const disableGlobalAI = async () => {
          const targetInstance = instanceId;
          if (!targetInstance) return;
          const ok = window.confirm('Desativar IA GLOBAL para toda a instância? Nenhum cliente receberá msg automática até reativar em Configurações > IA.');
          if (!ok) return;
          // Tambem cancela auto_send desta conversa pra interromper imediatamente
          const allIds = suggestions.map((s) => s.id);
          useDashboardStore.setState((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === conv.id ? { ...c, messages: c.messages.map((m) => allIds.includes(m.id) ? { ...m, autoSendAt: null } : m) } : c
            ),
          }));
          await Promise.all([
            supabase.from('messages').update({ auto_send_at: null }).in('id', allIds),
            supabase.from('ai_config').update({ enabled: false, updated_at: new Date().toISOString() }).eq('instance_id', targetInstance),
          ]);
        };

        return (
          <div style={{ borderTop: '1px solid var(--accent-border)', background: 'linear-gradient(to bottom, rgba(212, 175, 55, 0.06), rgba(212, 175, 55, 0.02))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px 8px', flexWrap: 'wrap' }}>
              <Bot size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sugestões da IA</span>
              {willAutoSend && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                  background: 'rgba(16,185,129,0.12)', color: 'var(--emerald-light)', border: '1px solid rgba(16,185,129,0.3)',
                }}>
                  <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--emerald-light)' }} />
                  Auto-envio em {secondsLeft}s
                </span>
              )}
              {isProcessing && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                  background: processingPhase === 'choosing' ? 'rgba(234,179,8,0.15)' : 'rgba(212,175,55,0.15)',
                  color: processingPhase === 'choosing' ? '#eab308' : 'var(--accent)',
                  border: `1px solid ${processingPhase === 'choosing' ? 'rgba(234,179,8,0.4)' : 'var(--accent-border)'}`,
                }}>
                  <Loader size={10} className="spin" />
                  {processingPhase === 'choosing' ? 'Escolhendo melhor sugestão...' : 'Enviando mensagem...'}
                </span>
              )}
              {willAutoSend && (
                <button onClick={cancelAutoSend} title="Cancelar auto-envio (sugestões ficam disponíveis)" style={{ padding: '3px 10px', borderRadius: 6, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-muted)', cursor: 'pointer', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  Segurar
                </button>
              )}
              {(willAutoSend || isProcessing) && (
                <button
                  onClick={cancelAutoSend}
                  title="Cancela só esta sugestão (não envia automaticamente)"
                  style={{
                    padding: '3px 10px', borderRadius: 6,
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
                    color: '#ef4444', cursor: 'pointer', fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <X size={10} /> Cancelar envio
                </button>
              )}
              {(willAutoSend || isProcessing) && (
                <button
                  onClick={disableGlobalAI}
                  title="DESATIVA a IA em toda a instância (pare TUDO)"
                  style={{
                    padding: '3px 10px', borderRadius: 6,
                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.45)',
                    color: '#ef4444', cursor: 'pointer', fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <Power size={10} /> Desligar IA global
                </button>
              )}
              <button onClick={discardAll} style={{ marginLeft: 'auto', padding: 4, background: 'none', border: 'none', color: 'var(--fg-subtle)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <Trash2 size={12} /> Descartar
              </button>
            </div>
            {willAutoSend && (
              <div style={{ padding: '0 20px', marginBottom: 6 }}>
                <div style={{ height: 3, borderRadius: 2, background: 'var(--surface-2)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.max(0, Math.min(100, (msUntilSend / 12000) * 100))}%`,
                    background: 'linear-gradient(90deg, var(--emerald-light), var(--accent))',
                    transition: 'width 0.5s linear',
                  }} />
                </div>
              </div>
            )}
            {isProcessing && (
              <div style={{ padding: '0 20px', marginBottom: 6 }}>
                <div style={{ height: 3, borderRadius: 2, background: 'var(--surface-2)', overflow: 'hidden', position: 'relative' }}>
                  <div className="indeterminate-bar" style={{
                    position: 'absolute', top: 0, height: '100%', width: '40%',
                    background: 'linear-gradient(90deg, var(--emerald-light), var(--accent))',
                  }} />
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: suggestions.length > 1 ? '1fr 1fr' : '1fr', gap: 10, padding: '0 20px 12px' }}>
              {suggestions.map((s) => {
                const conf = typeof s.suggestionConfidence === 'number' ? s.suggestionConfidence : null;
                const confColor = conf === null ? null
                  : conf >= 80 ? '#10b981'
                  : conf >= 60 ? '#eab308'
                  : conf >= 40 ? '#f59e0b'
                  : '#ef4444';
                const confBg = conf === null ? null
                  : conf >= 80 ? 'rgba(16,185,129,0.15)'
                  : conf >= 60 ? 'rgba(234,179,8,0.15)'
                  : conf >= 40 ? 'rgba(245,158,11,0.15)'
                  : 'rgba(239,68,68,0.15)';
                const isChosen = isProcessing && s.id === bestSuggestionId;
                const isDiscarded = isProcessing && s.id !== bestSuggestionId;
                return (
                <div key={s.id}
                  className={isChosen ? 'suggestion-chosen' : ''}
                  style={{
                    padding: 12, borderRadius: 12,
                    background: 'var(--glass)',
                    border: '1px solid var(--border)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                    opacity: isDiscarded ? 0.3 : 1,
                    transition: 'opacity 0.3s, border 0.3s',
                  }}>
                  {conf !== null && confColor && (
                    <div style={{
                      alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                      background: confBg ?? undefined, color: confColor, border: `1px solid ${confColor}33`,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: confColor }} />
                      {conf}% confiança {isChosen && '· ESCOLHIDA'}
                    </div>
                  )}
                  <p style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>{s.content}</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => approveAndSend(s)}
                      disabled={isProcessing}
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8,
                        background: isProcessing ? 'var(--surface-3)' : 'var(--emerald)',
                        color: isProcessing ? 'var(--fg-subtle)' : '#fff',
                        fontSize: 12, fontWeight: 600, border: 'none',
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {willAutoSend ? 'Enviar agora' : isProcessing ? 'Enviando…' : 'Enviar'}
                    </button>
                    <button
                      onClick={() => { setEditingDraft(s); setMsgText(s.content); }}
                      disabled={isProcessing}
                      style={{
                        padding: '8px 12px', borderRadius: 8,
                        background: 'var(--surface-3)', color: 'var(--fg-dim)',
                        border: '1px solid var(--border)',
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                        opacity: isProcessing ? 0.5 : 1,
                      }}>
                      <Pencil size={12} />
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Input */}
      <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!msgText.trim() || !conv) return;
            const text = msgText.trim();
            setMsgText('');
            setReplyTo(null);
            const tempId = `temp-${Date.now()}`;
            useDashboardStore.setState((state) => ({
              conversations: state.conversations.map((c) =>
                c.id === conv.id ? { ...c, messages: [...c.messages, { id: tempId, author: 'humano', content: text, timestamp: new Date(), status: 'sent' }], lastMessageAt: new Date() } : c
              ),
            }));
            supabase.functions.invoke('evolution-send', { body: { conversationId: conv.id, text } });
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Digite uma mensagem..."
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            style={{ flex: 1, height: 40, padding: '0 16px', borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)', fontSize: 14, color: 'var(--fg-dim)', outline: 'none' }}
          />
          <button type="submit" disabled={!msgText.trim()} style={{ width: 40, height: 40, borderRadius: 12, background: !msgText.trim() ? 'var(--surface-3)' : 'var(--accent)', border: 'none', color: 'var(--strong-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
