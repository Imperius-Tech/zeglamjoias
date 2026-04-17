import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Gem, Truck, CreditCard, RefreshCw, Tag, MessageSquare, type LucideIcon } from 'lucide-react';
import type { KnowledgeEntry, CategoryKey } from '@/lib/mock-data';
import { categoryInfo } from '@/lib/mock-data';

const iconMap: Record<string, LucideIcon> = { Gem, Truck, CreditCard, RefreshCw, Tag, MessageSquare };

export function CategoryCard({ categoryKey, entries, index, onClick }: { categoryKey: CategoryKey; entries: KnowledgeEntry[]; index: number; onClick: () => void }) {
  const info = categoryInfo[categoryKey];
  const Icon = iconMap[info.icon];
  const lastUpdate = entries.length ? entries.reduce((l, e) => (e.updatedAt > l ? e.updatedAt : l), entries[0].updatedAt) : new Date();
  const [hovered, setHovered] = useState(false);

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        textAlign: 'left', padding: 24, borderRadius: 16, cursor: 'pointer',
        background: 'var(--glass)', border: `1px solid ${hovered ? 'var(--border-strong)' : 'var(--border)'}`,
        transform: hovered ? 'translateY(-4px)' : 'none', transition: 'all 0.3s',
      }}
    >
      <div style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, background: `${info.color}15`, border: `1px solid ${info.color}25` }}>
        <Icon size={22} style={{ color: info.color }} />
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--strong-text)', marginBottom: 4 }}>{info.name}</h3>
      <p style={{ fontSize: 12, color: 'var(--fg-subtle)', marginBottom: 16 }}>{entries.length} informações cadastradas</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {entries.slice(0, 2).map((e) => <p key={e.id} className="truncate" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>&bull; {e.question}</p>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>atualizado {formatDistanceToNow(lastUpdate, { addSuffix: true, locale: ptBR })}</span>
        <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, opacity: hovered ? 1 : 0, transition: 'opacity 0.2s' }}>Ver tudo →</span>
      </div>
    </motion.button>
  );
}
