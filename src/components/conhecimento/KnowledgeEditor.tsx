import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, ChevronDown, ChevronUp, Pencil, Trash2, Plus } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { categoryInfo, type CategoryKey } from '@/lib/mock-data';

export function KnowledgeEditor({ categoryKey, onBack }: { categoryKey: CategoryKey; onBack: () => void }) {
  const allEntries = useDashboardStore((s) => s.knowledgeEntries);
  const entries = useMemo(() => allEntries.filter((e) => e.category === categoryKey), [allEntries, categoryKey]);
  const deleteEntry = useDashboardStore((s) => s.deleteKnowledgeEntry);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const info = categoryInfo[categoryKey];

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{ padding: 8, borderRadius: 8, background: 'none', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer' }}><ArrowLeft size={18} /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <span style={{ color: 'var(--fg-subtle)' }}>Base de Conhecimento</span>
          <span style={{ color: 'var(--fg-faint)' }}>›</span>
          <span style={{ color: '#fff', fontWeight: 500 }}>{info.name}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{entries.length} entradas</h2>
        <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 12, background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer' }}><Plus size={16} />Adicionar entrada</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {entries.map((entry, i) => {
          const isExp = expandedId === entry.id;
          return (
            <motion.div key={entry.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }}
              style={{ borderRadius: 12, overflow: 'hidden', background: 'var(--glass)', border: '1px solid var(--border)' }}>
              <button onClick={() => setExpandedId(isExp ? null : entry.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 className="truncate" style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>{entry.question}</h4>
                  {!isExp && <p className="truncate" style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 2 }}>{entry.answer}</p>}
                </div>
                {isExp ? <ChevronUp size={16} style={{ color: 'var(--fg-subtle)', marginLeft: 8, flexShrink: 0 }} /> : <ChevronDown size={16} style={{ color: 'var(--fg-subtle)', marginLeft: 8, flexShrink: 0 }} />}
              </button>
              <AnimatePresence>
                {isExp && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ padding: 12, borderRadius: 8, background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: 'var(--fg-subtle)', marginBottom: 8 }}>Resposta da IA</p>
                        <p style={{ fontSize: 14, color: 'var(--fg-dim)', lineHeight: 1.6 }}>{entry.answer}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--fg-faint)' }}>
                          <span>Criado: {format(entry.createdAt, 'dd/MM/yyyy', { locale: ptBR })}</span>
                          <span>Atualizado: {format(entry.updatedAt, 'dd/MM/yyyy', { locale: ptBR })}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button style={{ padding: 6, borderRadius: 8, background: 'none', border: 'none', color: 'var(--fg-subtle)', cursor: 'pointer' }}><Pencil size={14} /></button>
                          <button onClick={() => deleteEntry(entry.id)} style={{ padding: 6, borderRadius: 8, background: 'none', border: 'none', color: 'var(--fg-subtle)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
