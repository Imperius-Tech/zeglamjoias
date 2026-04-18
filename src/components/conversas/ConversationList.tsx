import { useMemo, useState } from 'react';
import { Search, MessageCircle, Users, ArrowUpDown } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import type { ConversationStatus } from '@/lib/mock-data';
import { ConversationItem } from './ConversationItem';

type FilterValue = 'all' | ConversationStatus | 'adicionar_grupo';
const filters: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'adicionar_grupo', label: 'Adicionar ao grupo' },
  { value: 'ia_respondendo', label: 'IA respondendo' },
  { value: 'aguardando_humano', label: 'Aguardando' },
  { value: 'silenciada', label: 'Silenciada' },
  { value: 'encerrada', label: 'Encerrada' },
];

type SortKind = 'recent' | 'oldest' | 'unread' | 'priority' | 'name';
const sortOptions: { value: SortKind; label: string }[] = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'oldest', label: 'Mais antigas' },
  { value: 'unread', label: 'Não lidas primeiro' },
  { value: 'priority', label: 'Prioridade' },
  { value: 'name', label: 'Nome (A-Z)' },
];

const priorityWeight: Record<string, number> = { alta: 3, media: 2, baixa: 1 };

type TabKind = 'individuais' | 'grupos';

const tabs: { value: TabKind; label: string; icon: typeof MessageCircle }[] = [
  { value: 'individuais', label: 'Conversas', icon: MessageCircle },
  { value: 'grupos', label: 'Grupos', icon: Users },
];

export function ConversationList() {
  const conversations = useDashboardStore((s) => s.conversations);
  const selectedId = useDashboardStore((s) => s.selectedConversationId);
  const filter = useDashboardStore((s) => s.conversationFilter);
  const searchQuery = useDashboardStore((s) => s.searchQuery);
  const selectConversation = useDashboardStore((s) => s.selectConversation);
  const setFilter = useDashboardStore((s) => s.setFilter);
  const setSearchQuery = useDashboardStore((s) => s.setSearchQuery);

  const [activeTab, setActiveTab] = useState<TabKind>('individuais');
  const [sortBy, setSortBy] = useState<SortKind>('recent');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // Contadores por tipo (respeitam search mas não o filter)
  const { individualCount, groupCount } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let ind = 0;
    let grp = 0;
    for (const c of conversations) {
      if (q) {
        const matches = c.customerName.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q));
        if (!matches) continue;
      }
      if (c.isGroup) grp++;
      else ind++;
    }
    return { individualCount: ind, groupCount: grp };
  }, [conversations, searchQuery]);

  const filtered = useMemo(() => {
    let r = conversations.filter((c) => (activeTab === 'grupos' ? !!c.isGroup : !c.isGroup));
    if (filter === 'adicionar_grupo') {
      r = r.filter((c) => c.groupCandidateStatus === 'dados_coletados' || c.groupCandidateStatus === 'aguardando_dados');
    } else if (filter !== 'all') {
      r = r.filter((c) => c.status === filter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter((c) => c.customerName.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)));
    }
    const sorted = [...r];
    // Conversas com "dados_coletados" SEMPRE vão pro topo, independente do sort escolhido
    const pinCandidate = (c: { groupCandidateStatus?: string | null }) => (c.groupCandidateStatus === 'dados_coletados' ? 1 : 0);
    switch (sortBy) {
      case 'oldest':
        sorted.sort((a, b) => {
          const pd = pinCandidate(b) - pinCandidate(a);
          if (pd !== 0) return pd;
          return a.lastMessageAt.getTime() - b.lastMessageAt.getTime();
        });
        break;
      case 'unread':
        sorted.sort((a, b) => {
          const pd = pinCandidate(b) - pinCandidate(a);
          if (pd !== 0) return pd;
          if ((b.unreadCount > 0 ? 1 : 0) !== (a.unreadCount > 0 ? 1 : 0)) {
            return (b.unreadCount > 0 ? 1 : 0) - (a.unreadCount > 0 ? 1 : 0);
          }
          if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
          return b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
        });
        break;
      case 'priority':
        sorted.sort((a, b) => {
          const pd = pinCandidate(b) - pinCandidate(a);
          if (pd !== 0) return pd;
          const pa = priorityWeight[a.aiAnalysis?.prioridade as string] ?? 0;
          const pb = priorityWeight[b.aiAnalysis?.prioridade as string] ?? 0;
          if (pb !== pa) return pb - pa;
          const aWait = a.status === 'aguardando_humano' ? 1 : 0;
          const bWait = b.status === 'aguardando_humano' ? 1 : 0;
          if (bWait !== aWait) return bWait - aWait;
          return b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
        });
        break;
      case 'name':
        sorted.sort((a, b) => {
          const pd = pinCandidate(b) - pinCandidate(a);
          if (pd !== 0) return pd;
          return a.customerName.localeCompare(b.customerName, 'pt-BR');
        });
        break;
      case 'recent':
      default:
        sorted.sort((a, b) => {
          const pd = pinCandidate(b) - pinCandidate(a);
          if (pd !== 0) return pd;
          return b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
        });
    }
    return sorted;
  }, [conversations, filter, searchQuery, activeTab, sortBy]);

  const activeSortLabel = sortOptions.find((s) => s.value === sortBy)?.label ?? 'Ordenar';

  return (
    <div style={{
      width: 380, height: '100%', display: 'flex', flexDirection: 'column', flexShrink: 0,
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
    }}>
      {/* Tabs (Conversas / Grupos) */}
      <div style={{
        display: 'flex', padding: '12px 16px 0', gap: 4,
        borderBottom: '1px solid var(--border)',
      }}>
        {tabs.map((t) => {
          const active = activeTab === t.value;
          const count = t.value === 'individuais' ? individualCount : groupCount;
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              onClick={() => setActiveTab(t.value)}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: '10px 10px 0 0',
                border: 'none', background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontSize: 13, fontWeight: 600, transition: 'all 0.18s',
                color: active ? 'var(--accent)' : 'var(--fg-muted)',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-dim)'; }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-muted)'; }}
            >
              <Icon size={14} />
              {t.label}
              <span style={{
                minWidth: 20, height: 18, padding: '0 6px', borderRadius: 9,
                fontSize: 10, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: active ? 'var(--accent-bg)' : 'var(--surface-3)',
                color: active ? 'var(--accent)' : 'var(--fg-subtle)',
                border: active ? '1px solid var(--accent-border)' : '1px solid var(--border)',
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + Filters */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-subtle)' }} />
          <input
            type="text"
            placeholder={activeTab === 'grupos' ? 'Buscar grupos...' : 'Buscar conversas...'}
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

        {/* Sort dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setSortMenuOpen((v) => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
              background: 'var(--glass)', border: '1px solid var(--border)',
              color: 'var(--fg-dim)', fontSize: 12, fontWeight: 500,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ArrowUpDown size={13} style={{ color: 'var(--fg-subtle)' }} />
              <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>Ordenar:</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{activeSortLabel}</span>
            </span>
            <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>▾</span>
          </button>
          {sortMenuOpen && (
            <>
              <div
                onClick={() => setSortMenuOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 20 }}
              />
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 21,
                background: 'rgb(30, 33, 40)', border: '1px solid var(--border-strong)',
                borderRadius: 10, padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                {sortOptions.map((opt) => {
                  const active = sortBy === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => { setSortBy(opt.value); setSortMenuOpen(false); }}
                      style={{
                        width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6,
                        background: active ? 'var(--accent-bg)' : 'transparent',
                        color: active ? 'var(--accent)' : 'var(--fg-dim)',
                        fontSize: 12, fontWeight: active ? 600 : 500,
                        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}
                      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--glass-strong)'; }}
                      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                    >
                      {opt.label}
                      {active && <span style={{ fontSize: 12 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
        {filtered.map((c) => (
          <ConversationItem key={c.id} conversation={c} isActive={selectedId === c.id} onClick={() => selectConversation(c.id)} />
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            {activeTab === 'grupos' ? (
              <Users size={28} style={{ color: 'var(--fg-faint)', margin: '0 auto 10px' }} />
            ) : (
              <MessageCircle size={28} style={{ color: 'var(--fg-faint)', margin: '0 auto 10px' }} />
            )}
            <p style={{ fontSize: 13, color: 'var(--fg-subtle)', fontWeight: 500 }}>
              {searchQuery.trim()
                ? 'Nada encontrado'
                : activeTab === 'grupos'
                ? 'Nenhum grupo ainda'
                : 'Nenhuma conversa ainda'}
            </p>
            {!searchQuery.trim() && (
              <p style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>
                {activeTab === 'grupos'
                  ? 'Grupos do WhatsApp aparecerão aqui'
                  : 'Conversas com clientes aparecerão aqui'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
