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
  const conv = conversations.find((c) => c.id === selectedId);
  const endRef = useRef<HTMLDivElement>(null);
  const [msgText, setMsgText] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [togglingAI, setTogglingAI] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingDraft, setEditingDraft] = useState<Message | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conv?.messages.length, selectedId]);

  // Trigger automatic analysis if missing
  useEffect(() => {
    if (conv && !conv.aiAnalysis && conv.messages.length >= 2) {
      supabase.functions.invoke('evolution-client-analysis', { body: { conversationId: conv.id } });
    }
  }, [selectedId]);

  // Auto-geração de sugestões quando o atendente abre um lead não respondido.
  // Dispara apenas uma vez por mensagem do cliente (cache por ID da última msg).
  // Critérios: unread > 0, última msg do cliente sem resposta, não é grupo,
  // não está em fluxo de entrada no grupo, não tem sugestões ativas.
  useEffect(() => {
    if (!conv) return;
    if (conv.isGroup) return;
    if (conv.unreadCount <= 0) return;
    if (conv.groupCandidateStatus === 'aguardando_dados') return;

    const realMessages = conv.messages.filter((m) => !m.isDraft);
    const last = realMessages[realMessages.length - 1];
    if (!last || last.author !== 'cliente') return;

    const hasActiveSuggestions = conv.messages.some((m) => m.isDraft && m.suggestionGroupId);
    if (hasActiveSuggestions) return;

    const cacheKey = `auto-suggest-${last.id}`;
    if (sessionStorage.getItem(cacheKey)) return;
    sessionStorage.setItem(cacheKey, '1');

    supabase.functions.invoke('evolution-ai-reply', {
      body: { conversationId: conv.id, mode: 'suggestions' },
    }).catch((err) => console.error('[auto-suggest] failed:', err));
  }, [selectedId, conv?.messages.length]);

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

  const st = statusLabels[conv.status];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div style={{ minHeight: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 20px', flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'var(--header-bg)', backdropFilter: 'blur(12px)', gap: 12 }}>
        
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {conv.profilePicUrl ? (
              <img src={conv.profilePicUrl} alt={conv.customerName} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: pickGradient(conv.customerName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{conv.customerName[0]?.toUpperCase()}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--strong-text)', flexShrink: 0, letterSpacing: '-0.01em' }}>{conv.customerName}</span>
                
                {/* Type Status: P (Pessoal) or N (Negócio) */}
                {conv.conversationType === 'personal' && (
                  <span style={{ 
                    fontSize: 9, padding: '1px 5px', borderRadius: 4, 
                    background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontWeight: 900,
                    flexShrink: 0
                  }}>P</span>
                )}
                {conv.conversationType === 'business' && (
                  <span style={{ 
                    fontSize: 9, padding: '1px 5px', borderRadius: 4, 
                    background: 'rgba(16,185,129,0.15)', color: 'var(--emerald-light)', fontWeight: 900,
                    flexShrink: 0
                  }}>N</span>
                )}

                <span style={{ fontSize: 10, fontWeight: 600, color: st.color, padding: '2px 8px', borderRadius: 6, background: 'var(--glass-strong)', flexShrink: 0 }}>{st.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-subtle)' }}>
                <Phone size={12} /><span>{conv.customerPhone}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Grupo: IA bloqueada por design — nunca responder em grupos */}
            {conv.isGroup ? (
              <div
                title="A IA não responde em grupos por política de segurança"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
                  background: 'rgba(148,163,184,0.08)',
                  border: '1px dashed var(--border)',
                  color: 'var(--fg-subtle)', fontSize: 11, fontWeight: 600,
                  cursor: 'not-allowed', opacity: 0.7,
                }}
              >
                <Power size={12} />
                IA bloqueada em grupos
              </div>
            ) : (
              <>
                {/* AI toggle for this conversation */}
                <button
                  onClick={async () => {
                    if (togglingAI) return;
                    if (conv.isGroup) { alert('A IA não pode ser ativada em grupos por política de segurança.'); return; }
                    setTogglingAI(true);
                    const newVal = !conv.aiEnabled;
                    useDashboardStore.setState((state) => ({
                      conversations: state.conversations.map((c) => c.id === conv.id ? { ...c, aiEnabled: newVal } : c),
                    }));
                    await supabase.from('conversations').update({ ai_enabled: newVal }).eq('id', conv.id);
                    setTogglingAI(false);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
                    background: conv.aiEnabled ? 'rgba(16,185,129,0.1)' : 'var(--glass)',
                    border: `1px solid ${conv.aiEnabled ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                    color: conv.aiEnabled ? 'var(--emerald-light)' : 'var(--fg-subtle)',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Power size={12} />
                  {conv.aiEnabled ? 'IA Ativa' : 'IA Off'}
                </button>

                {/* Generate AI response */}
                <button
                  onClick={async () => {
                    if (aiGenerating) return;
                    if (conv.isGroup) { alert('A IA não pode gerar respostas para grupos.'); return; }
                    setAiGenerating(true);
                    try {
                      const { data, error } = await supabase.functions.invoke('evolution-ai-reply', { body: { conversationId: conv.id, force: true, mode: 'suggestions' } });
                      if (error || data?.error) {
                        alert(data?.error || 'Erro ao gerar resposta. Tente novamente.');
                      } else if (data?.action === 'silenced') {
                        alert('A IA não tem certeza da resposta para este contexto.');
                      } else if (data?.reason === 'group_blocked' || data?.reason === 'group_blocked_send') {
                        alert('A IA não responde em grupos por política de segurança.');
                      }
                    } catch {
                      alert('Erro de conexão. Tente novamente.');
                    }
                    setAiGenerating(false);
                  }}
                  disabled={aiGenerating}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
                    background: 'var(--glass)', border: '1px solid var(--border)',
                    color: 'var(--fg-muted)', fontSize: 11, fontWeight: 500,
                    cursor: aiGenerating ? 'wait' : 'pointer', opacity: aiGenerating ? 0.5 : 1,
                  }}
                >
                  {aiGenerating ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Bot size={12} />}
                  {aiGenerating ? 'Gerando...' : 'Gerar IA'}
                </button>
              </>
            )}

            {/* Analyze client (force refresh) */}
            <button
              onClick={async () => {
                if (analyzing) return;
                setAnalyzing(true);
                try {
                  const { data, error } = await supabase.functions.invoke('evolution-client-analysis', {
                    body: { conversationId: conv.id, forceRefresh: true },
                  });
                  if (error || data?.error) {
                    alert(data?.error || 'Erro ao analisar cliente. Tente novamente.');
                  }
                } catch {
                  alert('Erro de conexão. Tente novamente.');
                }
                setAnalyzing(false);
              }}
              disabled={analyzing}
              title="Forçar nova análise do cliente (resumo, interesses, estágio)"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
                background: analyzing ? 'rgba(212,175,55,0.1)' : 'var(--glass)',
                border: `1px solid ${analyzing ? 'var(--accent-border)' : 'var(--border)'}`,
                color: analyzing ? 'var(--accent)' : 'var(--fg-muted)',
                fontSize: 11, fontWeight: 500,
                cursor: analyzing ? 'wait' : 'pointer', opacity: analyzing ? 0.7 : 1,
              }}
            >
              {analyzing ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
              {analyzing ? 'Analisando...' : 'Analisar'}
            </button>

            {/* Client analysis shortcut */}
            <button
              onClick={() => navigate(`/clientes?id=${conv.id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
                background: 'var(--glass)', border: '1px solid var(--border)',
                color: 'var(--fg-muted)', fontSize: 11, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <User size={12} /> Cliente
            </button>
          </div>
        </div>

        {/* Beautiful AI Summary Box */}
        {conv.aiAnalysis?.resumo && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: 'linear-gradient(to right, rgba(212, 175, 55, 0.08), rgba(212, 175, 55, 0.02))', borderLeft: '3px solid var(--accent)', borderRadius: '0 8px 8px 0' }}>
            <Brain size={14} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.5, margin: 0 }}>
              <strong style={{ fontWeight: 600, color: 'var(--accent)', marginRight: 6 }}>Contexto IA:</strong> 
              {conv.aiAnalysis.resumo}
            </p>
          </div>
        )}
      </div>

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
          {conv.messages
            .filter((msg) => !msg.suggestionGroupId) // Sugestões aparecem no painel separado
            .map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                quotedMessage={msg.quotedMessageId ? conv.messages.find((m) => m.id === msg.quotedMessageId) : null}
                onReply={(m) => { setReplyTo(m); inputRef.current?.focus(); }}
              />
            ))}
          {(() => {
            // "IA Pensando" só aparece quando:
            // 1. IA está ativa na conversa
            // 2. Última mensagem real (não-draft) é do cliente
            // 3. Status é ia_respondendo
            // 4. Ainda NÃO tem sugestões disponíveis (senão o painel de sugestões aparece)
            // 5. Ainda NÃO tem resposta da IA depois da última mensagem do cliente
            if (!conv.aiEnabled) return null;
            if (conv.status !== 'ia_respondendo') return null;

            const realMessages = conv.messages.filter((m) => !m.isDraft);
            const last = realMessages[realMessages.length - 1];
            if (!last || last.author !== 'cliente') return null;

            const hasSuggestions = conv.messages.some((m) => m.isDraft && m.suggestionGroupId);
            if (hasSuggestions) return null;

            // Se última mensagem foi há mais de 2 minutos, não está mais "pensando"
            const lastTs = last.timestamp instanceof Date ? last.timestamp : new Date(last.timestamp);
            const ageMs = Date.now() - lastTs.getTime();
            if (ageMs > 2 * 60 * 1000) return null;

            return (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', marginBottom: 4, paddingRight: 4 }}>
                      IA Pensando
                    </span>
                    <div style={{
                      padding: '12px 16px',
                      borderRadius: '16px 16px 4px 16px',
                      background: 'rgba(212, 175, 55, 0.08)',
                      border: '1px solid rgba(212, 175, 55, 0.2)',
                      display: 'flex', alignItems: 'center', gap: 4, height: 44
                    }}>
                      <div className="thinking-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                      <div className="thinking-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                      <div className="thinking-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })()}
          <div ref={endRef} />
        </div>
      </div>

      {/* AI Suggestions Panel — 2 respostas sugeridas */}
      {(() => {
        // Agrupa drafts de sugestão pela mesma group_id
        const suggestions = conv.messages.filter((m) => m.isDraft && m.suggestionGroupId);
        // Também suporta drafts legacy (sem suggestion_group_id) pra compatibilidade
        const legacyDraft = conv.messages.find((m) => m.isDraft && !m.suggestionGroupId);

        if (suggestions.length === 0 && !legacyDraft) return null;

        // Ordena sugestões: direct primeiro, warm depois
        const ordered = [...suggestions].sort((a, b) => {
          if (a.suggestionStyle === 'direct') return -1;
          if (b.suggestionStyle === 'direct') return 1;
          return 0;
        });

        const items = ordered.length > 0
          ? ordered
          : legacyDraft ? [legacyDraft] : [];

        const removeFromStore = (ids: string[]) => {
          useDashboardStore.setState((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === conv.id ? { ...c, messages: c.messages.filter((m) => !ids.includes(m.id)) } : c
            ),
          }));
        };

        const saveTrainingExample = async (aiOriginal: string, corrected: string) => {
          const context = conv.messages
            .filter((m) => !m.isDraft)
            .slice(-5)
            .map((m) => `${m.author === 'cliente' ? 'Cliente' : 'Atendente'}: ${m.content}`)
            .join('\n');
          await supabase.from('ai_training_examples').insert({
            conversation_id: conv.id,
            context,
            ai_response: aiOriginal,
            corrected_response: corrected,
          });
        };

        const approveAndSend = async (chosen: Message) => {
          const allIds = items.map((s) => s.id);
          // Otimistic UI: remove drafts e marca status como aguardando
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
          const allIds = items.map((s) => s.id);
          // Otimistic UI: remove drafts e sai do estado "ia_respondendo"
          useDashboardStore.setState((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === conv.id ? { ...c, messages: c.messages.filter((m) => !allIds.includes(m.id)), status: 'aguardando_humano' } : c
            ),
          }));
          await supabase.from('messages').delete().in('id', allIds);
          await supabase.from('conversations').update({ status: 'aguardando_humano' }).eq('id', conv.id);
        };

        const confidenceColor = (c: number | null | undefined) => {
          if (!c) return 'var(--fg-subtle)';
          if (c >= 80) return 'var(--emerald-light)';
          if (c >= 60) return '#fbbf24';
          if (c >= 40) return '#fb923c';
          return '#f87171';
        };

        const styleLabel = (s: Message['suggestionStyle']) => {
          if (s === 'direct') return { label: 'Direto', icon: '⚡', color: '#60a5fa' };
          if (s === 'warm') return { label: 'Acolhedor', icon: '💛', color: '#fbbf24' };
          return { label: 'Sugestão', icon: '🤖', color: 'var(--accent)' };
        };

        // Modo de edição
        if (editingDraft) {
          const editingItem = items.find((it) => it.id === editingDraft.id);
          if (editingItem) {
            return (
              <div style={{ borderTop: '1px solid var(--accent-border)', background: 'var(--glass)' }}>
                <div style={{ padding: '12px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Pencil size={12} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Editando resposta da IA
                    </span>
                    <button onClick={() => { setEditingDraft(null); setMsgText(''); }} style={{ marginLeft: 'auto', padding: 4, background: 'none', border: 'none', color: 'var(--fg-subtle)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <X size={14} />
                    </button>
                  </div>
                  <textarea
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    rows={3}
                    autoFocus
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--fg-dim)', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, outline: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => { setEditingDraft(null); setMsgText(''); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'var(--surface-3)', color: 'var(--fg-muted)', fontSize: 12, fontWeight: 500, border: '1px solid var(--border)', cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={async () => {
                        const corrected = msgText.trim();
                        if (!corrected) return;
                        const originalAI = editingItem.content;
                        const allIds = items.map((s) => s.id);
                        setEditingDraft(null);
                        setMsgText('');
                        useDashboardStore.setState((state) => ({
                          conversations: state.conversations.map((c) =>
                            c.id === conv.id ? { ...c, messages: c.messages.filter((m) => !allIds.includes(m.id)), status: 'aguardando_humano' } : c
                          ),
                        }));
                        supabase.functions.invoke('evolution-send', { body: { conversationId: conv.id, text: corrected } });
                        await supabase.from('messages').delete().in('id', allIds);
                        await supabase.from('conversations').update({ status: 'aguardando_humano' }).eq('id', conv.id);
                        if (corrected !== originalAI) await saveTrainingExample(originalAI, corrected);
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'var(--emerald)', color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                    >
                      <Send size={12} /> Enviar editado
                    </button>
                  </div>
                </div>
              </div>
            );
          }
        }

        return (
          <div style={{
            borderTop: '1px solid var(--accent-border)',
            background: 'linear-gradient(to bottom, rgba(212, 175, 55, 0.06), rgba(212, 175, 55, 0.02))',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px 8px' }}>
              <Bot size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {items.length > 1 ? `${items.length} Sugestões da IA` : 'Sugestão da IA'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
                · Escolha uma ou edite antes de enviar
              </span>
              <button
                onClick={discardAll}
                title="Descartar todas"
                style={{ marginLeft: 'auto', padding: 4, background: 'none', border: 'none', color: 'var(--fg-subtle)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
              >
                <Trash2 size={12} /> Descartar
              </button>
            </div>

            {/* Cards de sugestões */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: items.length > 1 ? '1fr 1fr' : '1fr',
              gap: 10,
              padding: '0 20px 12px',
            }}>
              {items.map((s) => {
                const st = styleLabel(s.suggestionStyle);
                const conf = s.suggestionConfidence;
                return (
                  <div
                    key={s.id}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: 'var(--glass)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-border)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; }}
                  >
                    {/* Header do card */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14 }}>{st.icon}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: st.color }}>{st.label}</span>
                      </div>
                      {conf !== null && conf !== undefined && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: `${confidenceColor(conf)}20`,
                          color: confidenceColor(conf),
                        }}>
                          {conf}% certeza
                        </span>
                      )}
                    </div>

                    {/* Conteúdo */}
                    <p style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
                      {s.content}
                    </p>

                    {/* Ações */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                      <button
                        onClick={() => approveAndSend(s)}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, background: 'var(--emerald)', color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                      >
                        <CheckCircle size={12} /> Enviar
                      </button>
                      <button
                        onClick={() => {
                          setEditingDraft(s);
                          setMsgText(s.content);
                        }}
                        title="Editar antes de enviar"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-3)', color: 'var(--fg-dim)', fontSize: 12, fontWeight: 500, border: '1px solid var(--border)', cursor: 'pointer' }}
                      >
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

      {/* Reply banner + Input */}
      <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        {replyTo && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 16px', maxWidth: '100%',
            background: 'var(--glass)',
          }}>
            <Reply size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <div style={{
              flex: 1, padding: '6px 10px', borderRadius: 6, minWidth: 0,
              borderLeft: `3px solid ${replyTo.author === 'cliente' ? 'var(--fg-subtle)' : 'var(--emerald)'}`,
              background: 'rgba(255,255,255,0.02)',
            }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: replyTo.author === 'cliente' ? 'var(--fg-muted)' : 'var(--emerald-light)' }}>
                {replyTo.author === 'cliente' ? 'Cliente' : 'Você'}
              </p>
              <p style={{ fontSize: 12, color: 'var(--fg-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {replyTo.content}
              </p>
            </div>
            <button onClick={() => setReplyTo(null)} style={{ padding: 4, background: 'none', border: 'none', color: 'var(--fg-subtle)', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        )}
        <div style={{ padding: 16 }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!msgText.trim() || !conv) return;
              const text = msgText.trim();
              const quoted = replyTo?.id || null;
              setMsgText('');
              setReplyTo(null);

              // Optimistic: add message locally immediately
              const tempId = `temp-${Date.now()}`;
              const optimisticMsg: Message = {
                id: tempId,
                author: 'humano',
                content: text,
                timestamp: new Date(),
                status: 'sent',
                quotedMessageId: quoted,
                sentBy: 'panel',
              };
              useDashboardStore.setState((state) => ({
                conversations: state.conversations.map((c) =>
                  c.id === conv.id
                    ? { ...c, messages: [...c.messages, optimisticMsg], lastMessageAt: new Date() }
                    : c
                ),
              }));

              // Send in background
              supabase.functions.invoke('evolution-send', {
                body: { conversationId: conv.id, text, quotedMessageId: quoted },
              }).catch((err) => console.error('Send failed:', err));
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: '100%' }}
          >
            <input
              ref={inputRef}
              type="text"
              placeholder="Digite uma mensagem..."
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              style={{ flex: 1, height: 40, padding: '0 16px', borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)', fontSize: 14, color: 'var(--fg-dim)', outline: 'none' }}
            />
            <button
              type="submit"
              disabled={!msgText.trim()}
              style={{
                width: 40, height: 40, borderRadius: 12,
                background: !msgText.trim() ? 'var(--surface-3)' : 'var(--accent)',
                border: 'none', color: 'var(--strong-text)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: !msgText.trim() ? 'not-allowed' : 'pointer', flexShrink: 0,
              }}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
