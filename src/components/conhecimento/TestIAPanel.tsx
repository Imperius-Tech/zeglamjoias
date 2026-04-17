import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';

interface AIResponse {
  reply: string;
  confidence: number;
}

export function TestIAPanel() {
  const entries = useDashboardStore((s) => s.knowledgeEntries);
  const conversations = useDashboardStore((s) => s.conversations);
  const selectedConvId = useDashboardStore((s) => s.selectedConversationId);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getConfidenceColor = (conf: number) => {
    if (conf >= 80) return '#10b981'; // Green
    if (conf >= 60) return '#f59e0b'; // Amber
    if (conf >= 40) return '#ef4444'; // Red
    return '#6b7280'; // Gray
  };

  const getConfidenceLabel = (conf: number) => {
    if (conf >= 80) return 'Muito confiante';
    if (conf >= 60) return 'Confiante';
    if (conf >= 40) return 'Pouco confiante';
    return 'Sem confiança';
  };

  const simulate = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResponse(null);
    setError(null);

    try {
      // Use selected conversation or create a temporary message for testing
      const convId = selectedConvId;
      if (!convId) {
        setError('Selecione uma conversa para testar a IA');
        setLoading(false);
        return;
      }

      // Insert a temporary message for the query
      const { data: tempMsg } = await supabase
        .from('messages')
        .insert({
          conversation_id: convId,
          author: 'cliente',
          content: query,
          sent_by: 'phone',
          is_draft: true,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!tempMsg) {
        setError('Erro ao criar mensagem de teste');
        setLoading(false);
        return;
      }

      // Call the edge function with force=true to get a draft response
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-ai-reply`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ conversationId: convId, force: true }),
        }
      );

      if (!res.ok) {
        setError('Erro ao gerar resposta da IA');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setResponse({
        reply: data.reply || data.error || 'Sem resposta',
        confidence: data.confidence ?? 0,
      });

      // Clean up temp message
      await supabase.from('messages').delete().eq('id', tempMsg.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [query, selectedConvId]);

  return (
    <div style={{ width: 360, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderLeft: '1px solid var(--border)' }}>
      <div style={{ padding: 20, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Sparkles size={16} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--strong-text)' }}>Teste a IA</h3>
        </div>
        <p style={{ fontSize: 12, color: 'var(--fg-subtle)', lineHeight: 1.5 }}>Veja como a IA responderia com o conhecimento atual.</p>
      </div>

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Digite uma pergunta..." rows={3}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); simulate(); } }}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 12, resize: 'none', background: 'var(--glass)', border: '1px solid var(--border)', fontSize: 14, color: 'var(--fg-dim)', outline: 'none', fontFamily: 'inherit' }}
        />
        <button onClick={simulate} disabled={!query.trim() || loading}
          style={{ width: '100%', height: 36, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 500, border: 'none', cursor: !query.trim() || loading ? 'not-allowed' : 'pointer', opacity: !query.trim() || loading ? 0.4 : 1 }}>
          <Send size={14} />Simular resposta
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '32px 0' }}>
              <div className="thinking-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
              <div className="thinking-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
              <div className="thinking-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
            </motion.div>
          )}
          {error && !loading && (
            <motion.div key="e" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
              <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: 'var(--fg-subtle)', marginBottom: 8 }}>Erro</p>
              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <p style={{ fontSize: 14, color: '#ef4444', lineHeight: 1.6 }}>{error}</p>
              </div>
            </motion.div>
          )}
          {!loading && response && !error && (
            <motion.div key="r" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
              <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: 'var(--fg-subtle)', marginBottom: 8 }}>Resposta da IA</p>
              <div style={{ padding: 16, borderRadius: 12, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
                <p style={{ fontSize: 14, color: 'var(--fg-dim)', lineHeight: 1.6, marginBottom: 16 }}>{response.reply}</p>

                {/* Confidence Score Display */}
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-subtle)' }}>Precisão</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: getConfidenceColor(response.confidence) }}>
                      {response.confidence}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden', marginBottom: 8 }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${response.confidence}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      style={{ height: '100%', background: getConfidenceColor(response.confidence), borderRadius: 3 }}
                    />
                  </div>

                  {/* Confidence Label */}
                  <span style={{ fontSize: 11, color: getConfidenceColor(response.confidence), fontWeight: 600 }}>
                    {getConfidenceLabel(response.confidence)}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
