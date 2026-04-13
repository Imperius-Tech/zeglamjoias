import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Conversation, ConversationStatus } from '@/lib/mock-data';

const statusConfig: Record<ConversationStatus, { color: string; label: string }> = {
  ia_respondendo: { color: 'var(--emerald)', label: 'IA respondendo' },
  aguardando_humano: { color: 'var(--amber)', label: 'Aguardando humano' },
  silenciada: { color: 'var(--red)', label: 'Silenciada' },
  encerrada: { color: 'var(--fg-subtle)', label: 'Encerrada' },
};

const avatarGradients = [
  'linear-gradient(135deg,#f43f5e,#db2777)', 'linear-gradient(135deg,#8b5cf6,#7c3aed)',
  'linear-gradient(135deg,#3b82f6,#4f46e5)', 'linear-gradient(135deg,#06b6d4,#0d9488)',
  'linear-gradient(135deg,#f59e0b,#ea580c)', 'linear-gradient(135deg,#10b981,#16a34a)',
  'linear-gradient(135deg,#d946ef,#db2777)', 'linear-gradient(135deg,#0ea5e9,#3b82f6)',
];

function pickGradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return avatarGradients[Math.abs(h) % avatarGradients.length];
}

export function ConversationItem({ conversation: c, isActive, onClick }: { conversation: Conversation; isActive: boolean; onClick: () => void }) {
  const last = c.messages[c.messages.length - 1];
  const st = statusConfig[c.status];

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: 12,
        borderRadius: 12,
        cursor: 'pointer',
        background: isActive ? 'var(--hover)' : 'transparent',
        borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--glass-strong)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Avatar */}
      {c.profilePicUrl ? (
        <img
          src={c.profilePicUrl}
          alt={c.customerName}
          style={{
            width: 40, minWidth: 40, height: 40, borderRadius: 20,
            objectFit: 'cover', flexShrink: 0,
          }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).nextElementSibling as HTMLElement).style.removeProperty('display'); }}
        />
      ) : null}
      <div style={{
        width: 40, minWidth: 40, height: 40, borderRadius: 20,
        background: pickGradient(c.customerName),
        display: c.profilePicUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 700, color: '#fff',
        flexShrink: 0,
      }}>
        {c.customerName[0]?.toUpperCase()}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {/* Row 1: Name + time */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{c.customerName}</span>
          <span style={{ fontSize: 11, color: 'var(--fg-subtle)', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {formatDistanceToNow(c.lastMessageAt, { addSuffix: true, locale: ptBR })}
          </span>
        </div>
        {/* Row 2: Last message */}
        <p className="truncate" style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3 }}>{last?.content}</p>
        {/* Row 3: Status + unread */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: st.color, display: 'inline-block' }} />
            <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>{st.label}</span>
            {c.conversationType === 'personal' && (
              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontWeight: 600 }}>Pessoal</span>
            )}
          </div>
          {c.unreadCount > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
              background: 'var(--accent)', fontSize: 10, fontWeight: 700, color: '#fff',
            }}>{c.unreadCount}</span>
          )}
        </div>
      </div>
    </div>
  );
}
