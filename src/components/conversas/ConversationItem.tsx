import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Users, AlertTriangle } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import type { Conversation, ConversationStatus } from '@/lib/mock-data';

const PRIORITY_REASON_LABEL: Record<string, string> = {
  status_pedido: 'Status do pedido',
  rastreio: 'Rastreio',
  valor_especifico: 'Valor/desconto',
  confirmacao_pagamento: 'Confirmação de pagamento',
  reclamacao_produto: 'Reclamação',
  alteracao_pedido: 'Alteração de pedido',
  outro: 'Ação humana',
};

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

function formatPhone(phone: string) {
  if (!phone) return 'Desconhecido';
  const clean = phone.replace(/\D/g, '');
  if (clean.length >= 12) {
    return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  }
  return phone;
}

export function ConversationItem({ conversation: c, isActive, onClick }: { conversation: Conversation; isActive: boolean; onClick: () => void }) {
  const last = c.messages[c.messages.length - 1];
  const st = statusConfig[c.status];
  const isUrgent = c.priority === 'altissima' || c.aiAnalysis?.prioridade === 'altissima';
  const urgentReason = c.priorityReason || c.aiAnalysis?.consulta_pendente || null;

  // Identificação inteligente: se o nome for numérico ou curto demais, usa o telefone formatado
  const isNumeric = /^\d+$/.test(c.customerName || '');
  const displayName = (isNumeric || !c.customerName) ? formatPhone(c.customerPhone) : c.customerName;

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
        padding: '12px 14px',
        borderRadius: 14,
        cursor: 'pointer',
        marginBottom: 4,
        background: isActive
          ? 'var(--glass-strong)'
          : isUrgent
            ? 'rgba(239,68,68,0.06)'
            : 'transparent',
        border: isActive
          ? '1px solid var(--accent)'
          : isUrgent
            ? '1px solid rgba(239,68,68,0.3)'
            : '1px solid transparent',
        boxShadow: isActive
          ? '0 8px 24px rgba(212, 175, 55, 0.15)'
          : isUrgent
            ? '0 4px 16px rgba(239,68,68,0.12)'
            : 'none',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Indicador Lateral de Seleção ou Urgência */}
      {isActive ? (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
          background: 'var(--accent)', boxShadow: '0 0 12px var(--accent)'
        }} />
      ) : isUrgent ? (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
          background: '#ef4444', boxShadow: '0 0 10px rgba(239,68,68,0.6)'
        }} />
      ) : null}

      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {c.profilePicUrl ? (
          <img
            src={c.profilePicUrl}
            alt={displayName}
            style={{
              width: 44, height: 44, borderRadius: 22,
              objectFit: 'cover', border: isActive ? '2px solid var(--accent)' : '2px solid transparent'
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).nextElementSibling as HTMLElement).style.removeProperty('display'); }}
          />
        ) : null}
        <div style={{
          width: 44, height: 44, borderRadius: 22,
          background: c.isGroup ? 'linear-gradient(135deg,#0ea5e9,#06b6d4)' : pickGradient(displayName),
          display: c.profilePicUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700, color: '#fff',
          border: isActive ? '2px solid var(--accent)' : '2px solid transparent'
        }}>
          {c.isGroup ? <Users size={20} /> : displayName[0]?.toUpperCase()}
        </div>
        
        {/* Badge de Status Online/IA na Foto */}
        <div style={{
          position: 'absolute', bottom: 0, right: 0, width: 14, height: 14,
          borderRadius: 7, border: '2px solid var(--surface)',
          background: st.color, boxShadow: '0 0 8px ' + st.color
        }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Row 1: Name + Status + Time */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span className="truncate" style={{ 
              fontSize: 14, fontWeight: 700, 
              color: isActive ? 'var(--accent)' : 'var(--strong-text)',
              letterSpacing: '-0.01em'
            }}>
              {displayName}
            </span>

            {/* Group badge */}
            {c.isGroup && (
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 4,
                background: 'rgba(14,165,233,0.15)', color: '#38bdf8', fontWeight: 700,
              }}>GRUPO</span>
            )}

            {/* Tipo da conversa: P (pessoal) ou N (negócio) */}
            {c.conversationType === 'personal' && (
              <span title="Conversa pessoal" style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 4,
                background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontWeight: 900,
                flexShrink: 0,
              }}>P</span>
            )}
            {c.conversationType === 'business' && (
              <span title="Lead de negócio" style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 4,
                background: 'rgba(16,185,129,0.15)', color: 'var(--emerald-light)', fontWeight: 900,
                flexShrink: 0,
              }}>N</span>
            )}

            {/* Urgente badge */}
            {isUrgent && (
              <span
                title={urgentReason ? (PRIORITY_REASON_LABEL[urgentReason] || urgentReason) : 'Prioridade altíssima'}
                style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 4,
                  background: 'rgba(239,68,68,0.15)', color: '#f87171', fontWeight: 800,
                  display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
                }}
              >
                <AlertTriangle size={9} /> URGENTE
              </span>
            )}
          </div>
          <span style={{ fontSize: 10, color: 'var(--fg-subtle)', whiteSpace: 'nowrap' }}>
            {formatDistanceToNow(c.lastMessageAt, { addSuffix: false, locale: ptBR })}
          </span>
        </div>

        {/* Row 2: AI Summary or Last Message */}
        <div style={{ marginTop: 2 }}>
          {c.aiAnalysis?.resumo ? (
            <p className="truncate" style={{ 
              fontSize: 12, color: 'var(--accent)', 
              fontWeight: 500, fontStyle: 'italic', opacity: 0.9 
            }}>
              ✨ {c.aiAnalysis.resumo}
            </p>
          ) : (
            <p className="truncate" style={{ 
              fontSize: 12, color: 'var(--fg-muted)', 
              opacity: isActive ? 1 : 0.7 
            }}>
              {last ? (
                <>
                  {last.author === 'humano' ? 'Você: ' : ''}
                  {last.content}
                </>
              ) : (
                <span style={{ color: 'var(--fg-faint)', fontStyle: 'italic' }}>Nenhuma mensagem ainda</span>
              )}
            </p>
          )}
        </div>

        {/* Row 3: Status indicators */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: isActive ? 'var(--fg-muted)' : 'var(--fg-subtle)', fontWeight: 500 }}>{st.label}</span>
          </div>
          {c.unreadCount > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
              background: 'var(--accent)', fontSize: 10, fontWeight: 800, color: '#fff',
              boxShadow: '0 4px 10px rgba(212, 175, 55, 0.3)'
            }}>{c.unreadCount}</span>
          )}
        </div>
      </div>
    </div>
  );
}
