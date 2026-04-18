import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Users } from 'lucide-react';
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
        background: c.isGroup ? 'linear-gradient(135deg,#0ea5e9,#06b6d4)' : pickGradient(c.customerName),
        display: c.profilePicUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 700, color: 'var(--strong-text)',
        flexShrink: 0,
      }}>
        {c.isGroup ? <Users size={18} color="#fff" /> : c.customerName[0]?.toUpperCase()}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {/* Row 1: Name + Status + Time */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)' }}>{c.customerName}</span>

            {/* Group badge */}
            {c.isGroup && (
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 4,
                background: 'rgba(14,165,233,0.15)', color: '#38bdf8', fontWeight: 700,
                flexShrink: 0, letterSpacing: '0.02em',
              }}>GRUPO</span>
            )}

            {/* Type Status: P (Pessoal) or N (Negócio) — only for individual chats */}
            {!c.isGroup && c.conversationType === 'personal' && (
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 4,
                background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontWeight: 900,
                flexShrink: 0
              }}>P</span>
            )}
            {!c.isGroup && c.conversationType === 'business' && (
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 4,
                background: 'rgba(16,185,129,0.15)', color: 'var(--emerald-light)', fontWeight: 900,
                flexShrink: 0
              }}>N</span>
            )}

            {/* Interest Tags */}
            {c.aiAnalysis?.interesse_produtos?.slice(0, 1).map((p: string) => (
              <span key={p} style={{ 
                fontSize: 9, padding: '1px 6px', borderRadius: 4, 
                background: 'rgba(212,175,55,0.12)', color: '#d4af37', fontWeight: 600,
                flexShrink: 0, border: '1px solid rgba(212,175,55,0.2)'
              }}>{p}</span>
            ))}
            {/* New badge */}
            {c.messages.length < 3 && (
              <span style={{
                fontSize: 8, padding: '1px 4px', borderRadius: 3,
                background: 'var(--accent)', color: '#fff', fontWeight: 800,
                textTransform: 'uppercase', flexShrink: 0
              }}>Novo</span>
            )}
            {/* Group candidate badges */}
            {c.groupCandidateStatus === 'dados_coletados' && (
              <span style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 4,
                background: 'rgba(16,185,129,0.18)', color: 'var(--emerald-light)',
                fontWeight: 800, flexShrink: 0, border: '1px solid rgba(16,185,129,0.35)',
                letterSpacing: '0.02em', textTransform: 'uppercase',
              }}>Adicionar ao grupo</span>
            )}
            {c.groupCandidateStatus === 'aguardando_dados' && (
              <span style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 4,
                background: 'rgba(251,191,36,0.15)', color: '#fbbf24',
                fontWeight: 700, flexShrink: 0, border: '1px solid rgba(251,191,36,0.3)',
              }}>Coletando</span>
            )}
            {c.groupCandidateStatus === 'adicionada' && (
              <span style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 4,
                background: 'rgba(148,163,184,0.1)', color: 'var(--fg-subtle)',
                fontWeight: 700, flexShrink: 0, border: '1px solid var(--border)',
              }}>No grupo</span>
            )}
          </div>
          <span style={{ fontSize: 11, color: 'var(--fg-subtle)', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {formatDistanceToNow(c.lastMessageAt, { addSuffix: false, locale: ptBR })}
          </span>
        </div>

        {/* Row 2: AI Summary or Last Message */}
        {c.aiAnalysis?.resumo ? (
          <p className="truncate" style={{ 
            fontSize: 11, color: 'var(--accent)', marginTop: 3, 
            fontWeight: 500, fontStyle: 'italic', opacity: 0.9 
          }}>
            {c.aiAnalysis.resumo}
          </p>
        ) : (
          <p className="truncate" style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3 }}>{last?.content}</p>
        )}

        {/* Row 3: Status indicators */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: st.color, display: 'inline-block' }} />
            <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>{st.label}</span>
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
