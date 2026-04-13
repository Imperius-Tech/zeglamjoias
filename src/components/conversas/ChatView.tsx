import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Send, Phone, AlertTriangle, Loader, X, Reply, CheckCircle, Trash2, Bot, User, Power, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDashboardStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { MessageBubble } from './MessageBubble';
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
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingDraft, setEditingDraft] = useState<Message | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conv?.messages.length, selectedId]);

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
      <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'rgba(12,12,14,0.8)', backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {conv.profilePicUrl ? (
            <img src={conv.profilePicUrl} alt={conv.customerName} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: pickGradient(conv.customerName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>{conv.customerName[0]?.toUpperCase()}</div>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{conv.customerName}</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: st.color }}>{st.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg-subtle)' }}>
              <Phone size={10} /><span>{conv.customerPhone}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* AI toggle for this conversation */}
          <button
            onClick={async () => {
              if (togglingAI) return;
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
              setAiGenerating(true);
              try {
                const { data, error } = await supabase.functions.invoke('evolution-ai-reply', { body: { conversationId: conv.id, force: true } });
                if (error || data?.error) {
                  alert(data?.error || 'Erro ao gerar resposta. Tente novamente.');
                } else if (data?.action === 'silenced') {
                  alert('A IA não tem certeza da resposta para este contexto.');
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

          {/* Client analysis shortcut */}
          <button
            onClick={() => navigate('/clientes')}
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
          {conv.messages.map((msg) => (
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

      {/* Draft approval bar */}
      {(() => {
        const lastDraft = conv.messages.filter((m) => m.isDraft).pop();
        if (!lastDraft) return null;

        const removeDraft = (draftId: string) => {
          useDashboardStore.setState((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === conv.id ? { ...c, messages: c.messages.filter((m) => m.id !== draftId) } : c
            ),
          }));
        };

        const saveTrainingExample = async (aiOriginal: string, corrected: string) => {
          // Get last 5 messages as context (excluding the draft)
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

        return (
          <div style={{ borderTop: '1px solid var(--accent-border)', background: 'rgba(255,77,0,0.04)' }}>
            {/* Edit mode */}
            {editingDraft && editingDraft.id === lastDraft.id && (
              <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Pencil size={12} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>Editando resposta da IA</span>
                  <button onClick={() => setEditingDraft(null)} style={{ marginLeft: 'auto', padding: 2, background: 'none', border: 'none', color: 'var(--fg-subtle)', cursor: 'pointer' }}><X size={12} /></button>
                </div>
                <textarea
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  rows={3}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--fg-dim)', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={async () => {
                      const corrected = msgText.trim();
                      if (!corrected) return;
                      const originalAI = editingDraft.content;
                      const draftId = editingDraft.id;
                      setEditingDraft(null);
                      setMsgText('');
                      removeDraft(draftId);
                      // Send corrected version
                      supabase.functions.invoke('evolution-send', { body: { conversationId: conv.id, text: corrected } });
                      await supabase.from('messages').delete().eq('id', draftId);
                      // Save training example if text was changed
                      if (corrected !== originalAI) {
                        await saveTrainingExample(originalAI, corrected);
                      }
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: 'var(--emerald)', color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                  >
                    <Send size={12} /> Enviar editado
                  </button>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px' }}>
              <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, flex: 1 }}>
                Sugestão da IA — revisar e aprovar?
              </span>
              <button
                onClick={async () => {
                  const text = lastDraft.content;
                  const draftId = lastDraft.id;
                  removeDraft(draftId);
                  supabase.functions.invoke('evolution-send', { body: { conversationId: conv.id, text } });
                  await supabase.from('messages').delete().eq('id', draftId);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: 'var(--emerald)', color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}
              >
                <CheckCircle size={12} /> Enviar
              </button>
              <button
                onClick={() => {
                  setEditingDraft(lastDraft);
                  setMsgText(lastDraft.content);
                  inputRef.current?.focus();
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: 'var(--surface-3)', color: 'var(--fg-dim)', fontSize: 12, fontWeight: 500, border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                <Pencil size={12} /> Editar
              </button>
              <button
                onClick={async () => {
                  const draftId = lastDraft.id;
                  removeDraft(draftId);
                  await supabase.from('messages').delete().eq('id', draftId);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: 'var(--surface-3)', color: 'var(--fg-muted)', fontSize: 12, fontWeight: 500, border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                <Trash2 size={12} /> Descartar
              </button>
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
                border: 'none', color: '#fff',
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
