import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { categoryInfo, type CategoryKey } from '@/lib/mock-data';
import { CategoryCard } from '@/components/conhecimento/CategoryCard';
import { KnowledgeEditor } from '@/components/conhecimento/KnowledgeEditor';
import { TestIAPanel } from '@/components/conhecimento/TestIAPanel';

export default function ConhecimentoPage() {
  const entries = useDashboardStore((s) => s.knowledgeEntries);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);
  const [search, setSearch] = useState('');

  const categories = useMemo(() =>
    (Object.keys(categoryInfo) as CategoryKey[]).map((key) => ({ key, entries: entries.filter((e) => e.category === key) })),
    [entries]
  );

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
        {selectedCategory ? (
          <KnowledgeEditor categoryKey={selectedCategory} onBack={() => setSelectedCategory(null)} />
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 24, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em', color: '#fff', marginBottom: 8 }}>Base de Conhecimento</h1>
              <p style={{ fontSize: 14, color: 'var(--fg-muted)' }}>O que a IA sabe responder. Adicione, edite ou remova informações.</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 32 }}>
              <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                <Plus size={18} />Nova Informação
              </button>
              <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-subtle)' }} />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nas entradas..."
                  style={{ width: '100%', height: 40, paddingLeft: 36, paddingRight: 16, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)', fontSize: 14, color: 'var(--fg-dim)', outline: 'none' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {categories.map((cat, i) => <CategoryCard key={cat.key} categoryKey={cat.key} entries={cat.entries} index={i} onClick={() => setSelectedCategory(cat.key)} />)}
            </div>
          </motion.div>
        )}
      </div>
      <div className="hide-mobile">
        <TestIAPanel />
      </div>
    </div>
  );
}
