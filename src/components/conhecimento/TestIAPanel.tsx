import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, BookOpen, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';

interface TrainingExampleUsed {
  id: string;
  context: string;
  corrected_response: string;
  similarity: number;
  judge_score: number | null;
}

interface AIResponse {
  reply: string;
  confidence: number;
  priority?: 'normal' | 'alta' | 'altissima';
  needsHumanReason?: string | null;
  trainingExamplesUsed?: TrainingExampleUsed[];
  searchQuery?: string;
}

const REASON_LABEL: Record<string, string> = {
  status_pedido: 'Status do pedido',
  rastreio: 'Rastreio',
  valor_especifico: 'Valor/desconto específico',
  confirmacao_pagamento: 'Confirmação de pagamento',
  reclamacao_produto: 'Reclamação de produto',
  alteracao_pedido: 'Alteração de pedido',
  outro: 'Outro motivo',
};

export function TestIAPanel() {
  const selectedConvId = useDashboardStore((s) => s.selectedConversationId);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examplesExpanded, setExamplesExpanded] = useState(false);

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

      // Call the edge function with force=true + debug=true to get examples used
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-ai-reply`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ conversationId: convId, force: true, debug: true }),
        }
      );

      if (!res.ok) {
        setError('Erro ao gerar resposta da IA');
        setLoading(false);
        return;
      }

      const data = await res.json();
      // Suporta tanto resposta "suggestions" (array) quanto "reply" (único)
      const primaryReply = data.suggestions?.[0]?.reply || data.reply || data.error || 'Sem resposta';
      const primaryConfidence = data.suggestions?.[0]?.confidence ?? data.confidence ?? 0;

      setResponse({
        reply: primaryReply,
        confidence: primaryConfidence,
        priority: data.priority || 'normal',
        needsHumanReason: data.needsHumanReason || null,
        trainingExamplesUsed: data.trainingExamplesUsed || [],
        searchQuery: data.searchQuery,
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

              {response.priority === 'altissima' && response.needsHumanReason && (
                <div style={{
                  marginBottom: 10, padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 2 }}>Prioridade altíssima</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
                      {REASON_LABEL[response.needsHumanReason] || response.needsHumanReason} — lead marcado pra Zevaldo responder
                    </div>
                  </div>
                </div>
              )}

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

              {/* Training examples used (RAG) */}
              {response.trainingExamplesUsed && response.trainingExamplesUsed.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <button
                    onClick={() => setExamplesExpanded(!examplesExpanded)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px', borderRadius: 10,
                      background: 'var(--glass)', border: '1px solid var(--border)',
                      cursor: 'pointer', color: 'var(--fg-dim)', fontSize: 12, fontWeight: 600,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <BookOpen size={14} style={{ color: 'var(--accent)' }} />
                      {response.trainingExamplesUsed.length} exemplos do Zevaldo usados
                    </span>
                    {examplesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  <AnimatePresence>
                    {examplesExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {response.trainingExamplesUsed.map((ex, i) => {
                            const simPct = Math.round((ex.similarity || 0) * 100);
                            const simColor = simPct >= 70 ? '#10b981' : simPct >= 50 ? '#f59e0b' : '#6b7280';
                            return (
                              <div key={ex.id || i} style={{
                                padding: 10, borderRadius: 8,
                                background: 'var(--surface-2)', border: '1px solid var(--border)',
                                fontSize: 11,
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    Exemplo {i + 1}
                                  </span>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    {ex.judge_score != null && (
                                      <span style={{ fontSize: 9, color: 'var(--fg-subtle)' }}>
                                        score {Math.round(ex.judge_score * 10)}/10
                                      </span>
                                    )}
                                    {simPct > 0 && (
                                      <span style={{ fontSize: 9, fontWeight: 700, color: simColor, padding: '2px 6px', borderRadius: 4, background: `${simColor}22` }}>
                                        {simPct}% similar
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div style={{ marginBottom: 6 }}>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--fg-subtle)' }}>CLIENTE: </span>
                                  <span style={{ color: 'var(--fg-dim)' }}>{ex.context}</span>
                                </div>
                                <div>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)' }}>ZEVALDO: </span>
                                  <span style={{ color: 'var(--fg-dim)' }}>{ex.corrected_response}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
