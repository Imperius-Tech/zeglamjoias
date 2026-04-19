import { useState } from 'react';
import { Check, UserPlus, X, RefreshCw, Copy, Loader, Search, Users, AlertCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboardStore } from '@/lib/store';
import type { Conversation, GroupCandidateData } from '@/lib/mock-data';

type FieldKey = keyof GroupCandidateData;

const fields: { key: FieldKey; label: string }[] = [
  { key: 'nome_completo', label: 'Nome completo' },
  { key: 'nome_marca', label: 'Marca' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'galvanica', label: 'Galvânica' },
  { key: 'outro_grupo', label: 'Outro grupo?' },
  { key: 'outro_grupo_nome', label: 'Indicação' },
];

type MembershipCheck = { alreadyMember: boolean; groupName: string | null; participantCount: number } | null;

export function GroupCandidateCard({ conv }: { conv: Conversation }) {
  const [busy, setBusy] = useState<null | 'refresh' | 'mark_added' | 'dismiss' | 'check' | 'add'>(null);
  const [membership, setMembership] = useState<MembershipCheck>(null);
  const [addResult, setAddResult] = useState<{ method?: string; inviteUrl?: string; error?: string } | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(`group-card-collapsed-${conv.id}`) === '1';
  });
  const data = conv.groupCandidateData || {};
  const status = conv.groupCandidateStatus;

  if (!status || status === 'adicionada' || status === 'recusada') return null;

  const complete = status === 'dados_coletados';

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (next) localStorage.setItem(`group-card-collapsed-${conv.id}`, '1');
    else localStorage.removeItem(`group-card-collapsed-${conv.id}`);
  };

  const filledCount = fields.filter((f) => data[f.key]).length;

  const refresh = async () => {
    if (busy) return;
    setBusy('refresh');
    try {
      await supabase.functions.invoke('group-candidate-extract', { body: { conversationId: conv.id } });
    } finally { setBusy(null); }
  };

  const markAdded = async () => {
    if (busy) return;
    setBusy('mark_added');
    useDashboardStore.setState((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conv.id ? { ...c, groupCandidateStatus: 'adicionada' } : c
      ),
    }));
    await supabase.from('conversations').update({
      group_candidate_status: 'adicionada',
      group_candidate_updated_at: new Date().toISOString(),
    }).eq('id', conv.id);
    setBusy(null);
  };

  const dismiss = async () => {
    if (busy) return;
    setBusy('dismiss');
    useDashboardStore.setState((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conv.id ? { ...c, groupCandidateStatus: 'recusada' } : c
      ),
    }));
    await supabase.from('conversations').update({
      group_candidate_status: 'recusada',
      group_candidate_updated_at: new Date().toISOString(),
    }).eq('id', conv.id);
    setBusy(null);
  };

  const checkMembership = async () => {
    if (busy) return;
    setBusy('check');
    setAddResult(null);
    try {
      const { data: res, error } = await supabase.functions.invoke('group-membership', {
        body: { action: 'check', conversationId: conv.id },
      });
      if (error || res?.error) {
        setMembership(null);
        setAddResult({ error: (res?.error || error?.message || 'erro ao verificar').toString() });
      } else {
        setMembership({ alreadyMember: !!res.alreadyMember, groupName: res.groupName, participantCount: res.participantCount });
      }
    } finally { setBusy(null); }
  };

  const addToGroup = async () => {
    if (busy) return;
    setBusy('add');
    setAddResult(null);
    try {
      const { data: res, error } = await supabase.functions.invoke('group-membership', {
        body: { action: 'add', conversationId: conv.id },
      });
      if (error || res?.error || res?.success === false) {
        setAddResult({ error: (res?.error || error?.message || 'erro ao adicionar').toString() });
      } else {
        setAddResult({ method: res.method, inviteUrl: res.inviteUrl });
        useDashboardStore.setState((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conv.id ? { ...c, groupCandidateStatus: 'adicionada' } : c
          ),
        }));
      }
    } finally { setBusy(null); }
  };

  const copyAll = () => {
    const lines = fields
      .filter((f) => data[f.key])
      .map((f) => `${f.label}: ${data[f.key]}`)
      .join('\n');
    if (lines) navigator.clipboard?.writeText(lines).catch(() => {});
  };

  return (
    <div style={{
      margin: '12px 16px 0',
      padding: 14,
      borderRadius: 12,
      background: complete
        ? 'linear-gradient(to right, rgba(16,185,129,0.08), rgba(16,185,129,0.02))'
        : 'linear-gradient(to right, rgba(251,191,36,0.08), rgba(251,191,36,0.02))',
      border: `1px solid ${complete ? 'rgba(16,185,129,0.3)' : 'rgba(251,191,36,0.25)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: collapsed ? 0 : 10 }}>
        <UserPlus size={16} style={{ color: complete ? 'var(--emerald-light)' : '#fbbf24' }} />
        <span style={{
          fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
          color: complete ? 'var(--emerald-light)' : '#fbbf24',
        }}>
          {complete ? 'Pronta para adicionar ao grupo' : 'Coletando dados de entrada no grupo'}
        </span>
        {collapsed && (
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 6,
            background: complete ? 'rgba(16,185,129,0.12)' : 'rgba(251,191,36,0.12)',
            color: complete ? 'var(--emerald-light)' : '#fbbf24', fontWeight: 700,
          }}>
            {filledCount}/{fields.length} preenchidos
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {!collapsed && (
            <>
              <button
                onClick={copyAll}
                title="Copiar dados"
                style={{ padding: 6, borderRadius: 6, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <Copy size={12} />
              </button>
              <button
                onClick={refresh}
                disabled={busy === 'refresh'}
                title="Re-extrair do histórico"
                style={{ padding: 6, borderRadius: 6, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-muted)', cursor: busy === 'refresh' ? 'wait' : 'pointer', display: 'flex', alignItems: 'center' }}
              >
                {busy === 'refresh' ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
              </button>
            </>
          )}
          <button
            onClick={toggleCollapse}
            title={collapsed ? 'Expandir' : 'Recolher'}
            style={{ padding: 6, borderRadius: 6, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        </div>
      </div>

      {!collapsed && (<>

      {/* Grid de campos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {fields.map((f) => {
          const val = data[f.key];
          const filled = !!val;
          return (
            <div key={f.key} style={{
              display: 'flex', flexDirection: 'column', gap: 2,
              padding: '8px 10px', borderRadius: 8,
              background: filled ? 'var(--glass)' : 'rgba(148,163,184,0.05)',
              border: `1px solid ${filled ? 'var(--border)' : 'var(--border)'}`,
              opacity: filled ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {filled ? (
                  <Check size={10} style={{ color: 'var(--emerald-light)' }} />
                ) : (
                  <X size={10} style={{ color: 'var(--fg-subtle)' }} />
                )}
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fg-subtle)' }}>
                  {f.label}
                </span>
              </div>
              <span style={{ fontSize: 12, color: filled ? 'var(--fg-dim)' : 'var(--fg-subtle)', fontStyle: filled ? 'normal' : 'italic' }}>
                {filled ? (val as string) : 'não informado'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Feedback de verificação */}
      {membership && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, marginBottom: 10,
          background: membership.alreadyMember ? 'rgba(251,191,36,0.1)' : 'rgba(59,130,246,0.08)',
          border: `1px solid ${membership.alreadyMember ? 'rgba(251,191,36,0.25)' : 'rgba(59,130,246,0.2)'}`,
        }}>
          {membership.alreadyMember ? (
            <AlertCircle size={13} style={{ color: '#fbbf24', flexShrink: 0 }} />
          ) : (
            <Users size={13} style={{ color: '#60a5fa', flexShrink: 0 }} />
          )}
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            {membership.alreadyMember
              ? <>Já está no grupo <strong>{membership.groupName || 'Zeglam'}</strong> ({membership.participantCount} membros)</>
              : <>Ainda não faz parte de <strong>{membership.groupName || 'Zeglam'}</strong> ({membership.participantCount} membros)</>}
          </span>
        </div>
      )}
      {addResult && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, marginBottom: 10,
          background: addResult.error ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.1)',
          border: `1px solid ${addResult.error ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}`,
        }}>
          {addResult.error ? (
            <AlertCircle size={13} style={{ color: '#f87171', flexShrink: 0 }} />
          ) : (
            <Check size={13} style={{ color: 'var(--emerald-light)', flexShrink: 0 }} />
          )}
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            {addResult.error ? (
              <>Falhou: {addResult.error}</>
            ) : addResult.method === 'invite_link_sent' ? (
              <>Adição direta não foi possível (privacidade do WhatsApp). Link de convite enviado ao cliente.</>
            ) : (
              <>Adicionada ao grupo com sucesso.</>
            )}
          </span>
        </div>
      )}

      {/* Ações */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          onClick={dismiss}
          disabled={busy === 'dismiss'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
            background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-muted)',
            fontSize: 12, fontWeight: 500, cursor: busy === 'dismiss' ? 'wait' : 'pointer',
          }}
        >
          {busy === 'dismiss' ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={12} />}
          Descartar
        </button>
        <button
          onClick={checkMembership}
          disabled={busy === 'check'}
          title="Verificar se o número já participa do grupo"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
            background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-dim)',
            fontSize: 12, fontWeight: 500, cursor: busy === 'check' ? 'wait' : 'pointer',
          }}
        >
          {busy === 'check' ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={12} />}
          Verificar grupo
        </button>
        <button
          onClick={markAdded}
          disabled={busy === 'mark_added' || !complete}
          title={!complete ? 'Aguarde os dados serem coletados' : 'Marcar manualmente como já adicionada'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
            background: 'var(--glass)', border: '1px solid var(--border)',
            color: complete ? 'var(--fg-dim)' : 'var(--fg-subtle)',
            fontSize: 12, fontWeight: 500,
            cursor: complete && !busy ? 'pointer' : 'not-allowed',
            opacity: complete ? 1 : 0.6,
          }}
        >
          {busy === 'mark_added' ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
          Marcar manual
        </button>
        <button
          onClick={addToGroup}
          disabled={busy === 'add' || !complete}
          title={!complete ? 'Aguarde os dados serem coletados' : 'Adicionar automaticamente ao grupo'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
            background: complete ? 'var(--emerald)' : 'rgba(16,185,129,0.2)',
            color: complete ? '#fff' : 'var(--fg-subtle)',
            fontSize: 12, fontWeight: 600, border: 'none',
            cursor: complete && !busy ? 'pointer' : 'not-allowed',
            opacity: complete ? 1 : 0.6,
          }}
        >
          {busy === 'add' ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <UserPlus size={12} />}
          Adicionar ao grupo
        </button>
      </div>

      </>)}
    </div>
  );
}
