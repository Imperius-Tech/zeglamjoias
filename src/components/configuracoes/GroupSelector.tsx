import { useEffect, useState, useCallback } from 'react';
import { Users, Check, Loader, Search, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SectionTitle } from './SettingsField';

interface GroupOption {
  jid: string;
  name: string;
  lastMessageAt: string | null;
}

interface Props {
  instanceName: string;
  instanceId: string | null;
}

export function GroupSelector({ instanceName, instanceId }: Props) {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [currentJid, setCurrentJid] = useState<string | null>(null);
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [refreshingSnapshot, setRefreshingSnapshot] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<{ count: number; name: string } | null>(null);

  const loadGroups = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    try {
      // Grupos desta instância no nosso banco (conversations com JID @g.us)
      const { data } = await supabase
        .from('conversations')
        .select('whatsapp_jid, customer_name, last_message_at')
        .eq('instance_id', instanceId)
        .like('whatsapp_jid', '%@g.us')
        .order('last_message_at', { ascending: false })
        .limit(200);

      const list: GroupOption[] = (data || []).map((c) => ({
        jid: c.whatsapp_jid as string,
        name: c.customer_name || c.whatsapp_jid as string,
        lastMessageAt: c.last_message_at,
      }));
      setGroups(list);

      // Grupo atualmente configurado
      const { data: cfg } = await supabase
        .from('evolution_config')
        .select('default_group_jid, default_group_name')
        .limit(1)
        .maybeSingle();
      setCurrentJid(cfg?.default_group_jid || null);
      setCurrentName(cfg?.default_group_name || null);
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const selectGroup = async (g: GroupOption) => {
    if (saving) return;
    setSaving(true);
    setSnapshotStatus(null);
    try {
      await supabase
        .from('evolution_config')
        .update({
          default_group_jid: g.jid,
          default_group_name: g.name,
          updated_at: new Date().toISOString(),
        })
        .not('id', 'is', null);
      setCurrentJid(g.jid);
      setCurrentName(g.name);

      // Refresh automatico do snapshot pra capturar membros atuais
      setRefreshingSnapshot(true);
      const { data: res } = await supabase.functions.invoke('group-membership', {
        body: {
          action: 'debug_check_number',
          phoneNumber: '5500000000000', // phone dummy só pra forçar o snapshot
          forceRefresh: true,
          instanceName,
          groupJid: g.jid,
        },
      });
      if (res?.success) {
        setSnapshotStatus({ count: res.participantCount, name: res.groupName || g.name });
      }
    } finally {
      setSaving(false);
      setRefreshingSnapshot(false);
    }
  };

  const refreshSnapshot = async () => {
    if (!currentJid || refreshingSnapshot) return;
    setRefreshingSnapshot(true);
    try {
      const { data: res } = await supabase.functions.invoke('group-membership', {
        body: {
          action: 'debug_check_number',
          phoneNumber: '5500000000000',
          forceRefresh: true,
          instanceName,
          groupJid: currentJid,
        },
      });
      if (res?.success) {
        setSnapshotStatus({ count: res.participantCount, name: res.groupName || currentName || 'Grupo' });
      }
    } finally {
      setRefreshingSnapshot(false);
    }
  };

  const filtered = search.trim()
    ? groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
    : groups;

  return (
    <div style={{ marginBottom: 20 }}>
      <SectionTitle
        title="Grupo padrão de entrada"
        subtitle="Grupo do WhatsApp onde novos clientes serão adicionados após o cadastro"
      />

      {/* Grupo atual */}
      <div style={{
        padding: 14, borderRadius: 12, marginBottom: 14,
        background: currentJid ? 'rgba(16,185,129,0.06)' : 'var(--glass)',
        border: currentJid ? '1px solid rgba(16,185,129,0.25)' : '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: currentJid ? 'rgba(16,185,129,0.15)' : 'var(--surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Users size={16} style={{ color: currentJid ? 'var(--emerald-light)' : 'var(--fg-subtle)' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-subtle)', fontWeight: 700 }}>
              Grupo atual
            </p>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--strong-text)', marginTop: 2 }}>
              {currentName || 'Nenhum grupo configurado'}
            </p>
            {snapshotStatus && (
              <p style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 2 }}>
                {snapshotStatus.count} membros no snapshot
              </p>
            )}
          </div>
          {currentJid && (
            <button
              onClick={refreshSnapshot}
              disabled={refreshingSnapshot}
              title="Atualizar lista de membros do grupo"
              style={{
                padding: 8, borderRadius: 8,
                background: 'var(--glass)', border: '1px solid var(--border)',
                color: 'var(--fg-muted)', cursor: refreshingSnapshot ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center',
              }}
            >
              {refreshingSnapshot ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Busca */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 10,
        background: 'var(--glass)', border: '1px solid var(--border)',
        marginBottom: 10,
      }}>
        <Search size={14} style={{ color: 'var(--fg-subtle)' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar grupo..."
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontSize: 13, color: 'var(--strong-text)',
          }}
        />
      </div>

      {/* Lista */}
      <div style={{
        maxHeight: 320, overflowY: 'auto',
        border: '1px solid var(--border)', borderRadius: 10,
        background: 'var(--glass)',
      }}>
        {loading ? (
          <div style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--fg-subtle)' }}>
            <Loader size={14} className="spin" />
            <span style={{ fontSize: 12 }}>Carregando grupos...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--fg-subtle)', fontSize: 12 }}>
            {search ? 'Nenhum grupo encontrado' : 'Nenhum grupo sincronizado ainda. Participe de algum grupo no WhatsApp ou sincronize conversas primeiro.'}
          </div>
        ) : (
          filtered.map((g) => {
            const active = g.jid === currentJid;
            return (
              <button
                key={g.jid}
                onClick={() => selectGroup(g)}
                disabled={saving}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', background: active ? 'rgba(16,185,129,0.08)' : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border)',
                  cursor: saving ? 'wait' : 'pointer', textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <Users size={14} style={{ color: active ? 'var(--emerald-light)' : 'var(--fg-subtle)', flexShrink: 0 }} />
                <span style={{
                  flex: 1, fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? 'var(--emerald-light)' : 'var(--fg-dim)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {g.name}
                </span>
                {active && <Check size={14} style={{ color: 'var(--emerald-light)', flexShrink: 0 }} />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
