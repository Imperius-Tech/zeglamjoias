import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';

export function TestIAPanel() {
  const entries = useDashboardStore((s) => s.knowledgeEntries);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const simulate = useCallback(() => {
    if (!query.trim()) return;
    setLoading(true); setResponse(null);
    setTimeout(() => {
      const q = query.toLowerCase();
      const match = entries.find((e) => e.question.toLowerCase().split(/\s+/).some((w) => w.length > 3 && q.includes(w)));
      setResponse(match ? match.answer : 'A IA não encontrou resposta no conhecimento atual e silenciaria essa conversa. Adicione essa informação à base de conhecimento.');
      setLoading(false);
    }, 800);
  }, [query, entries]);

  return (
    <div style={{ width: 360, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderLeft: '1px solid var(--border)' }}>
      <div style={{ padding: 20, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Sparkles size={16} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Teste a IA</h3>
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
          {!loading && response && (
            <motion.div key="r" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
              <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: 'var(--fg-subtle)', marginBottom: 8 }}>Resposta da IA</p>
              <div style={{ padding: 16, borderRadius: 12, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
                <p style={{ fontSize: 14, color: 'var(--fg-dim)', lineHeight: 1.6 }}>{response}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
