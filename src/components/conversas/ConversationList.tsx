import { useMemo } from 'react';
import { Search } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import type { ConversationStatus } from '@/lib/mock-data';
import { ConversationItem } from './ConversationItem';

const filters: { value: 'all' | ConversationStatus; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'ia_respondendo', label: 'IA respondendo' },
  { value: 'aguardando_humano', label: 'Aguardando' },
  { value: 'silenciada', label: 'Silenciada' },
  { value: 'encerrada', label: 'Encerrada' },
];

export function ConversationList() {
  const conversations = useDashboardStore((s) => s.conversations);
  const selectedId = useDashboardStore((s) => s.selectedConversationId);
  const filter = useDashboardStore((s) => s.conversationFilter);
  const searchQuery = useDashboardStore((s) => s.searchQuery);
  const selectConversation = useDashboardStore((s) => s.selectConversation);
  const setFilter = useDashboardStore((s) => s.setFilter);
  const setSearchQuery = useDashboardStore((s) => s.setSearchQuery);

  const filtered = useMemo(() => {
    let r = conversations;
    if (filter !== 'all') r = r.filter((c) => c.status === filter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter((c) => c.customerName.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)));
    }
    return r.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  }, [conversations, filter, searchQuery]);

  return (
    <div style={{
      width: 380, height: '100%', display: 'flex', flexDirection: 'column', flexShrink: 0,
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
    }}>
      {/* Search + Filters */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-subtle)' }} />
          <input
            type="text"
            placeholder="Buscar conversas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%', height: 36, paddingLeft: 36, paddingRight: 16, borderRadius: 12,
              background: 'var(--glass)', border: '1px solid var(--border)',
              fontSize: 13, color: 'var(--fg-dim)', outline: 'none',
            }}
          />
        </div>
        <div className="scrollbar-none" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {filters.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                style={{
                  flexShrink: 0, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 11, fontWeight: 500, transition: 'all 0.2s',
                  color: active ? 'var(--accent)' : 'var(--fg-muted)',
                  background: active ? 'var(--accent-bg)' : 'var(--glass)',
                  border: active ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
        {filtered.map((c) => (
          <ConversationItem key={c.id} conversation={c} isActive={selectedId === c.id} onClick={() => selectConversation(c.id)} />
        ))}
        {filtered.length === 0 && (
          <p style={{ textAlign: 'center', padding: '48px 0', fontSize: 14, color: 'var(--fg-subtle)' }}>
            Nenhuma conversa encontrada
          </p>
        )}
      </div>
    </div>
  );
}
