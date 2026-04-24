import { useEffect, useRef } from 'react';
import { Search, MessageCircle, Users, ArrowUpDown, CheckCheck, Loader, AlertTriangle } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import type { ConversationStatus } from '@/lib/mock-data';
import type { ConversationFilter, ConversationSort, ConversationTab } from '@/lib/store';
import { ConversationItem } from './ConversationItem';
import { useState } from 'react';

const filters: { value: ConversationFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'urgentes', label: 'Urgentes' },
  { value: 'business', label: 'Negócio' },
  { value: 'personal', label: 'Pessoais' },
  { value: 'nao_respondidas', label: 'Não respondidas' },
  { value: 'adicionar_grupo', label: 'Adicionar ao grupo' },
  { value: 'ia_respondendo', label: 'IA respondendo' },
  { value: 'aguardando_humano', label: 'Aguardando' },
  { value: 'silenciada', label: 'Silenciada' },
  { value: 'encerrada', label: 'Encerrada' },
];

const sortOptions: { value: ConversationSort; label: string }[] = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'oldest', label: 'Mais antigas' },
  { value: 'unread', label: 'Não lidas primeiro' },
  { value: 'priority', label: 'Prioridade' },
  { value: 'name', label: 'Nome (A-Z)' },
];

const tabs: { value: ConversationTab; label: string; icon: typeof MessageCircle }[] = [
  { value: 'individuais', label: 'Conversas', icon: MessageCircle },
  { value: 'grupos', label: 'Grupos', icon: Users },
];

export function ConversationList() {
  const conversations = useDashboardStore((s) => s.conversations);
  const selectedId = useDashboardStore((s) => s.selectedConversationId);
  const filter = useDashboardStore((s) => s.conversationFilter);
  const activeTab = useDashboardStore((s) => s.conversationTab);
  const sortBy = useDashboardStore((s) => s.conversationSort);
  const searchQuery = useDashboardStore((s) => s.searchQuery);
  const loading = useDashboardStore((s) => s.loading);
  const loadingMore = useDashboardStore((s) => s.loadingMore);
  const hasMore = useDashboardStore((s) => s.hasMoreConversations);
  const total = useDashboardStore((s) => s.totalConversations);
  const urgentCount = useDashboardStore((s) => s.urgentCount);
  const individualCount = useDashboardStore((s) => s.individualCount);
  const groupCount = useDashboardStore((s) => s.groupCount);
  const selectConversation = useDashboardStore((s) => s.selectConversation);
  const setFilter = useDashboardStore((s) => s.setFilter);
  const setTab = useDashboardStore((s) => s.setTab);
  const setSort = useDashboardStore((s) => s.setSort);
  const setSearchQuery = useDashboardStore((s) => s.setSearchQuery);
  const loadMore = useDashboardStore((s) => s.loadMoreConversations);
  const markAllAsRead = useDashboardStore((s) => s.markAllAsRead);

  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // IntersectionObserver pra infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !listRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          void loadMore();
        }
      },
      { root: listRef.current, rootMargin: '200px', threshold: 0 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, loadMore]);

  const activeSortLabel = sortOptions.find((s) => s.value === sortBy)?.label ?? 'Ordenar';

  return (
    <div className="conversation-list-panel" style={{
      width: 380, height: '100%', display: 'flex', flexDirection: 'column', flexShrink: 0,
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
    }}>
      {/* Tabs (Conversas / Grupos) */}
      <div style={{
        display: 'flex', height: 72, padding: '0 16px', gap: 4,
        borderBottom: '1px solid var(--border)',
        alignItems: 'flex-end',
      }}>
        {tabs.map((t) => {
          const active = activeTab === t.value;
          const count = t.value === 'individuais' ? individualCount : groupCount;
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-subtle)' }} />
            <input
              type="text"
              placeholder={activeTab === 'grupos' ? 'Buscar grupos...' : 'Buscar conversas...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%', height: 38, paddingLeft: 36, paddingRight: 16, borderRadius: 12,
                background: 'var(--glass)', border: '1px solid var(--border)',
                fontSize: 13, color: 'var(--fg-dim)', outline: 'none',
              }}
            />
          </div>
          <button
            onClick={async () => {
              setMarkingRead(true);
              await markAllAsRead();
              setMarkingRead(false);
            }}
            title="Marcar todas como lidas"
            disabled={markingRead}
            style={{
              width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--glass)', border: '1px solid var(--border)', cursor: markingRead ? 'wait' : 'pointer',
              color: 'var(--fg-muted)', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--fg-muted)')}
          >
            {markingRead ? <Loader size={18} className="spin" /> : <CheckCheck size={18} />}
          </button>
        </div>
        {/* Filter row: urgentes sempre visível (se houver) + dropdown com demais filtros */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {urgentCount > 0 && (
            <button
              onClick={() => setFilter(filter === 'urgentes' ? 'all' : 'urgentes')}
              style={{
                padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
                fontSize: 11, fontWeight: 700, transition: 'all 0.2s',
                color: filter === 'urgentes' ? '#fff' : '#ef4444',
                background: filter === 'urgentes' ? '#ef4444' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${filter === 'urgentes' ? '#ef4444' : 'rgba(239,68,68,0.35)'}`,
                display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              }}
            >
              <AlertTriangle size={11} />
              Urgentes
              <span style={{
                padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 800,
                background: filter === 'urgentes' ? 'rgba(255,255,255,0.25)' : '#ef4444',
                color: '#fff',
              }}>
                {urgentCount}
              </span>
            </button>
          )}

          {/* Filtros rapidos: N (Negocio) / P (Pessoal) */}
          <button
            onClick={() => setFilter(filter === 'business' ? 'all' : 'business')}
            title="Conversas de negócio"
            style={{
              width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
              fontSize: 12, fontWeight: 900, flexShrink: 0,
              color: filter === 'business' ? '#fff' : 'var(--emerald-light)',
              background: filter === 'business' ? 'var(--emerald)' : 'rgba(16,185,129,0.12)',
              border: `1px solid ${filter === 'business' ? 'var(--emerald)' : 'rgba(16,185,129,0.35)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >N</button>
          <button
            onClick={() => setFilter(filter === 'personal' ? 'all' : 'personal')}
            title="Conversas pessoais"
            style={{
              width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
              fontSize: 12, fontWeight: 900, flexShrink: 0,
              color: filter === 'personal' ? '#fff' : '#a78bfa',
              background: filter === 'personal' ? '#8b5cf6' : 'rgba(139,92,246,0.12)',
              border: `1px solid ${filter === 'personal' ? '#8b5cf6' : 'rgba(139,92,246,0.35)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >P</button>

          <div style={{ position: 'relative', flex: 1 }}>
            <button
              onClick={() => setFilterMenuOpen((v) => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                background: filter !== 'all' && filter !== 'urgentes' && filter !== 'business' && filter !== 'personal' ? 'var(--accent-bg)' : 'var(--glass)',
                border: `1px solid ${filter !== 'all' && filter !== 'urgentes' && filter !== 'business' && filter !== 'personal' ? 'var(--accent-border)' : 'var(--border)'}`,
                color: filter !== 'all' && filter !== 'urgentes' && filter !== 'business' && filter !== 'personal' ? 'var(--accent)' : 'var(--fg-dim)',
                fontSize: 12, fontWeight: 600,
              }}
            >
              <span>
                {filter === 'all' || filter === 'urgentes' || filter === 'business' || filter === 'personal'
                  ? 'Todas'
                  : (filters.find((f) => f.value === filter)?.label || 'Filtrar')}
              </span>
              <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>▾</span>
            </button>
            {filterMenuOpen && (
              <>
                <div onClick={() => setFilterMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 21,
                  background: 'rgb(30, 33, 40)', border: '1px solid var(--border-strong)',
                  borderRadius: 10, padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}>
                  {filters.filter((f) => f.value !== 'urgentes' && f.value !== 'business' && f.value !== 'personal').map((f) => {
                    const active = filter === f.value;
                    return (
                      <button
                        key={f.value}
                        onClick={() => { setFilter(f.value); setFilterMenuOpen(false); }}
                        style={{
                          width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6,
                          background: active ? 'var(--accent-bg)' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--fg-dim)',
                          fontSize: 12, fontWeight: active ? 600 : 500,
                          border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}
                        onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--glass-strong)'; }}
                        onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                      >
                        {f.label}
                        {active && <span style={{ fontSize: 12 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
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
              <div onClick={() => setSortMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
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
                      onClick={() => { setSort(opt.value); setSortMenuOpen(false); }}
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
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
        {loading && conversations.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <Loader size={20} className="spin" style={{ color: 'var(--accent)', margin: '0 auto' }} />
            <p style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 10 }}>Carregando conversas...</p>
          </div>
        )}

        {conversations.map((c) => (
          <ConversationItem key={c.id} conversation={c} isActive={selectedId === c.id} onClick={() => selectConversation(c.id)} />
        ))}

        {!loading && conversations.length === 0 && (
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
          </div>
        )}

        {hasMore && (
          <div ref={sentinelRef} style={{ padding: '16px 0', textAlign: 'center' }}>
            {loadingMore ? (
              <Loader size={16} className="spin" style={{ color: 'var(--accent)' }} />
            ) : (
              <p style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
                {conversations.length} de {total}
              </p>
            )}
          </div>
        )}

        {!hasMore && conversations.length > 0 && (
          <p style={{ fontSize: 11, color: 'var(--fg-faint)', textAlign: 'center', padding: '12px 0' }}>
            {total} {total === 1 ? 'conversa' : 'conversas'}
          </p>
        )}
      </div>
    </div>
  );
}
