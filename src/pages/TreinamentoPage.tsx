import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, Send, Sparkles, ThumbsUp, Pencil, Check, Loader, BookOpen, X, AlertTriangle } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';

interface TrainingExampleUsed {
  id: string;
  context: string;
  corrected_response: string;
  similarity: number;
  judge_score: number | null;
}

interface Turn {
  id: string;
  query: string;
  aiReply: string;
  confidence: number;
  needsHumanReason: string | null;
  examplesUsed: TrainingExampleUsed[];
  state: 'pending_review' | 'approved' | 'editing' | 'saved';
  correctedResponse?: string;
  savedId?: string;
}

const REASON_LABEL: Record<string, string> = {
  status_pedido: 'Status do pedido',
  rastreio: 'Rastreio',
  valor_especifico: 'Valor/desconto',
  confirmacao_pagamento: 'Confirmação de pagamento',
  reclamacao_produto: 'Reclamação',
  alteracao_pedido: 'Alteração de pedido',
  outro: 'Outro motivo',
};

export default function TreinamentoPage() {
  const activeInstanceId = useDashboardStore((s) => s.activeInstanceId);
  const [query, setQuery] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalExamples, setTotalExamples] = useState<number>(0);
  const endRef = useRef<HTMLDivElement>(null);

  // Carrega contagem de exemplos
  const loadCount = useCallback(async () => {
    if (!activeInstanceId) return;
    const { count } = await supabase
      .from('ai_training_examples')
      .select('id', { count: 'exact', head: true })
      .eq('instance_id', activeInstanceId);
    setTotalExamples(count || 0);
  }, [activeInstanceId]);

  useEffect(() => { loadCount(); }, [loadCount]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns.length]);

  const ask = useCallback(async () => {
    if (!query.trim() || !activeInstanceId || loading) return;
    const q = query.trim();
    setQuery('');
    setLoading(true);

    const { data, error } = await supabase.functions.invoke('evolution-ai-test', {
      body: { instanceId: activeInstanceId, query: q },
    });

    setLoading(false);

    if (error || !data || data.error) {
      setTurns((prev) => [...prev, {
        id: `err-${Date.now()}`,
        query: q,
        aiReply: `❌ Erro: ${data?.error || error?.message || 'falha ao gerar resposta'}`,
        confidence: 0,
        needsHumanReason: null,
        examplesUsed: [],
        state: 'pending_review',
      }]);
      return;
    }

    setTurns((prev) => [...prev, {
      id: `t-${Date.now()}`,
      query: q,
      aiReply: data.reply || 'Sem resposta',
      confidence: data.confidence ?? 0,
      needsHumanReason: data.needsHumanReason || null,
      examplesUsed: data.examplesUsed || [],
      state: 'pending_review',
    }]);
  }, [query, activeInstanceId, loading]);

  const approve = useCallback((turnId: string) => {
    setTurns((prev) => prev.map((t) => t.id === turnId ? { ...t, state: 'approved' } : t));
  }, []);

  const startEdit = useCallback((turnId: string) => {
    setTurns((prev) => prev.map((t) =>
      t.id === turnId ? { ...t, state: 'editing', correctedResponse: t.aiReply } : t
    ));
  }, []);

  const cancelEdit = useCallback((turnId: string) => {
    setTurns((prev) => prev.map((t) =>
      t.id === turnId ? { ...t, state: 'pending_review', correctedResponse: undefined } : t
    ));
  }, []);

  const updateCorrection = useCallback((turnId: string, value: string) => {
    setTurns((prev) => prev.map((t) => t.id === turnId ? { ...t, correctedResponse: value } : t));
  }, []);

  const saveCorrection = useCallback(async (turnId: string) => {
    const turn = turns.find((t) => t.id === turnId);
    if (!turn || !turn.correctedResponse || !activeInstanceId) return;

    const { data, error } = await supabase.functions.invoke('evolution-save-correction', {
      body: {
        instanceId: activeInstanceId,
        clientQuery: turn.query,
        aiResponse: turn.aiReply,
        correctedResponse: turn.correctedResponse,
        source: 'manual_correction',
      },
    });

    if (error || !data?.success) {
      alert(`Erro ao salvar: ${data?.error || error?.message || 'desconhecido'}`);
      return;
    }

    setTurns((prev) => prev.map((t) => t.id === turnId ? { ...t, state: 'saved', savedId: data.id } : t));
    loadCount();
  }, [turns, activeInstanceId, loadCount]);

  const getConfColor = (c: number) => c >= 80 ? '#10b981' : c >= 60 ? '#f59e0b' : c >= 40 ? '#ef4444' : '#6b7280';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-1)' }}>
      {/* Header */}
      <div style={{
        padding: '20px 28px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(212,175,55,0.06))',
          border: '1px solid rgba(212,175,55,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <GraduationCap size={22} style={{ color: 'var(--accent)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--strong-text)', letterSpacing: '-0.01em' }}>
            Treinar IA
          </h1>
          <p style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 2 }}>
            Converse com a IA, corrija respostas, ensine novos padrões. Cada correção salva vira exemplo permanente.
          </p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 10,
          background: 'var(--glass)', border: '1px solid var(--border)',
        }}>
          <BookOpen size={14} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--strong-text)' }}>
            {totalExamples}
          </span>
          <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>exemplos</span>
        </div>
      </div>

      {/* Chat */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        {turns.length === 0 && !loading && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: 16, color: 'var(--fg-subtle)',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: 20,
              background: 'var(--glass)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Sparkles size={28} style={{ color: 'var(--fg-faint)' }} />
            </div>
            <p style={{ fontSize: 14, textAlign: 'center', maxWidth: 400, lineHeight: 1.6 }}>
              Digite uma pergunta que um cliente poderia fazer.<br />
              A IA responde com o conhecimento atual, e você aprova ou corrige.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, justifyContent: 'center', maxWidth: 600 }}>
              {['Quero entrar no grupo', 'Qual a chave Pix?', 'Como envio pedido pra galvânica?', 'Cadê meu pedido?', 'Tem pedido mínimo?'].map((s) => (
                <button
                  key={s}
                  onClick={() => setQuery(s)}
                  style={{
                    padding: '6px 12px', borderRadius: 16, fontSize: 11,
                    background: 'var(--glass)', border: '1px solid var(--border)',
                    color: 'var(--fg-dim)', cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900, margin: '0 auto' }}>
          <AnimatePresence initial={false}>
            {turns.map((turn) => (
              <motion.div
                key={turn.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                {/* Pergunta do "cliente" (Zevaldo simulando) */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{
                    maxWidth: '75%', padding: '10px 14px', borderRadius: 14,
                    background: 'var(--glass-strong)', border: '1px solid var(--border)',
                    fontSize: 14, color: 'var(--fg-dim)', lineHeight: 1.5,
                  }}>
                    {turn.query}
                  </div>
                </div>

                {/* Resposta da IA */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{
                    maxWidth: '85%', padding: '12px 16px', borderRadius: 14,
                    background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
                    fontSize: 14, color: 'var(--fg-dim)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                  }}>
                    {turn.aiReply}
                  </div>

                  {/* Meta: confidence + needsHuman + exemplos */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingLeft: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: getConfColor(turn.confidence) }}>
                      {turn.confidence}% confiança
                    </span>
                    {turn.needsHumanReason && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: 'rgba(239,68,68,0.1)', color: '#f87171', fontWeight: 700,
                      }}>
                        <AlertTriangle size={9} /> {REASON_LABEL[turn.needsHumanReason] || turn.needsHumanReason}
                      </span>
                    )}
                    {turn.examplesUsed.length > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>
                        · {turn.examplesUsed.length} exemplos usados
                      </span>
                    )}
                  </div>
                </div>

                {/* Ações de revisão */}
                {turn.state === 'pending_review' && (
                  <div style={{ display: 'flex', gap: 8, paddingLeft: 4 }}>
                    <button
                      onClick={() => approve(turn.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                        color: 'var(--emerald-light)', cursor: 'pointer',
                      }}
                    >
                      <ThumbsUp size={12} /> Boa resposta
                    </button>
                    <button
                      onClick={() => startEdit(turn.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                        background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)',
                        color: '#fbbf24', cursor: 'pointer',
                      }}
                    >
                      <Pencil size={12} /> Corrigir
                    </button>
                  </div>
                )}

                {turn.state === 'approved' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 4, fontSize: 11, color: 'var(--emerald-light)' }}>
                    <Check size={12} /> Aprovada
                  </div>
                )}

                {turn.state === 'editing' && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 10,
                    padding: 12, borderRadius: 12,
                    background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.25)',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Como a resposta deveria ser:
                    </span>
                    <textarea
                      value={turn.correctedResponse || ''}
                      onChange={(e) => updateCorrection(turn.id, e.target.value)}
                      rows={4}
                      style={{
                        padding: 10, borderRadius: 8, resize: 'vertical',
                        background: 'var(--glass)', border: '1px solid var(--border)',
                        color: 'var(--fg-dim)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => cancelEdit(turn.id)}
                        style={{
                          padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                          background: 'var(--glass)', border: '1px solid var(--border)',
                          color: 'var(--fg-muted)', cursor: 'pointer',
                        }}
                      >
                        <X size={12} style={{ display: 'inline', marginRight: 4 }} /> Cancelar
                      </button>
                      <button
                        onClick={() => saveCorrection(turn.id)}
                        disabled={!turn.correctedResponse?.trim()}
                        style={{
                          padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                          background: '#fbbf24', border: 'none', color: '#000',
                          cursor: turn.correctedResponse?.trim() ? 'pointer' : 'not-allowed',
                          opacity: turn.correctedResponse?.trim() ? 1 : 0.5,
                        }}
                      >
                        <Check size={12} style={{ display: 'inline', marginRight: 4 }} /> Salvar correção
                      </button>
                    </div>
                  </div>
                )}

                {turn.state === 'saved' && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', borderRadius: 10,
                    background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
                    fontSize: 11, color: 'var(--emerald-light)', fontWeight: 600,
                  }}>
                    <Check size={12} />
                    Correção salva. A IA vai usar esse exemplo nas próximas respostas similares.
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-subtle)', fontSize: 12 }}>
              <Loader size={14} className="spin" />
              <span>IA pensando...</span>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: 20, borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
        <form
          onSubmit={(e) => { e.preventDefault(); ask(); }}
          style={{ display: 'flex', gap: 10, maxWidth: 900, margin: '0 auto' }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite uma pergunta (simulando um cliente)..."
            disabled={loading}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 12,
              background: 'var(--glass)', border: '1px solid var(--border)',
              color: 'var(--fg-dim)', fontSize: 14, outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!query.trim() || loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 16px', borderRadius: 12,
              background: 'var(--accent)', border: 'none', color: '#000',
              fontSize: 13, fontWeight: 700,
              cursor: query.trim() && !loading ? 'pointer' : 'not-allowed',
              opacity: query.trim() && !loading ? 1 : 0.5,
            }}
          >
            {loading ? <Loader size={14} className="spin" /> : <Send size={14} />}
            Perguntar
          </button>
        </form>
      </div>
    </div>
  );
}
