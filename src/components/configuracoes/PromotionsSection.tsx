import { useCallback, useEffect, useState } from 'react';
import { Tag, RefreshCw, Loader, Users, X, Check, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SectionTitle } from './SettingsField';

interface GroupOption {
  jid: string;
  name: string;
}

interface Promotion {
  id: string;
  title: string;
  description: string | null;
  link_url: string | null;
  discount_text: string | null;
  category: string | null;
  valid_until: string | null;
  active: boolean;
  extracted_at: string;
}

interface Props {
  instanceId: string | null;
  instanceName: string;
}

export function PromotionsSection({ instanceId, instanceName }: Props) {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [currentGroup, setCurrentGroup] = useState<{ jid: string | null; name: string | null; lastSync: string | null }>({ jid: null, name: null, lastSync: null });
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    try {
      const [promosRes, cfgRes] = await Promise.all([
        supabase.functions.invoke('evolution-extract-promotions', {
          body: { instanceId, action: 'list' },
        }),
        supabase.from('evolution_config').select('promotions_group_jid, promotions_group_name, promotions_last_sync_at').limit(1).maybeSingle(),
      ]);
      if (promosRes.data) {
        setPromotions(promosRes.data.promotions || []);
      }
      if (cfgRes.data) {
        setCurrentGroup({
          jid: cfgRes.data.promotions_group_jid,
          name: cfgRes.data.promotions_group_name,
          lastSync: cfgRes.data.promotions_last_sync_at,
        });
      }

      // Grupos disponíveis (pra trocar grupo de promoções)
      const { data: convs } = await supabase
        .from('conversations')
        .select('whatsapp_jid, customer_name')
        .eq('instance_id', instanceId)
        .like('whatsapp_jid', '%@g.us')
        .order('last_message_at', { ascending: false })
        .limit(200);
      setGroups((convs || []).map((c) => ({ jid: c.whatsapp_jid as string, name: c.customer_name || c.whatsapp_jid as string })));
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => { loadData(); }, [loadData]);

  const setGroup = async (g: GroupOption | null) => {
    const { error } = await supabase.functions.invoke('evolution-extract-promotions', {
      body: { instanceId, action: 'set_group', groupJid: g?.jid, groupName: g?.name },
    });
    if (error) { showToast('Erro ao salvar grupo'); return; }
    setCurrentGroup({ jid: g?.jid || null, name: g?.name || null, lastSync: currentGroup.lastSync });
    setSelectorOpen(false);
    showToast(g ? `Grupo definido: ${g.name}` : 'Grupo removido');
  };

  const syncNow = async () => {
    if (!instanceId || syncing) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-extract-promotions', {
        body: { instanceId, action: 'sync' },
      });
      if (error || data?.error) {
        showToast(`Erro: ${data?.error || error?.message}`);
        return;
      }
      showToast(`${data.promotionsCount} promoções extraídas de ${data.messagesScanned} mensagens`);
      await loadData();
    } finally {
      setSyncing(false);
    }
  };

  const deactivate = async (promotionId: string) => {
    const { error } = await supabase.functions.invoke('evolution-extract-promotions', {
      body: { instanceId, action: 'deactivate', promotionId },
    });
    if (error) { showToast('Erro ao desativar'); return; }
    setPromotions((prev) => prev.filter((p) => p.id !== promotionId));
  };

  const filtered = search.trim() ? groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase())) : groups;

  const formatRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.round(diff / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min}min atrás`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h}h atrás`;
    const d = Math.round(h / 24);
    return `${d}d atrás`;
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <SectionTitle
        title="Promoções ativas (auto-atualizadas)"
        subtitle="IA lê o grupo onde você divulga promoções e mantém a lista sempre atualizada. Usado em respostas automáticas."
      />

      {/* Grupo configurado */}
      <div style={{
        padding: 14, borderRadius: 12, marginBottom: 14,
        background: currentGroup.jid ? 'rgba(34,197,94,0.05)' : 'var(--glass)',
        border: currentGroup.jid ? '1px solid rgba(34,197,94,0.25)' : '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: currentGroup.jid ? 'rgba(34,197,94,0.15)' : 'var(--surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Tag size={16} style={{ color: currentGroup.jid ? '#22c55e' : 'var(--fg-subtle)' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-subtle)', fontWeight: 700 }}>
              Grupo monitorado
            </p>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--strong-text)', marginTop: 2 }}>
              {currentGroup.name || 'Nenhum grupo configurado'}
            </p>
            {currentGroup.lastSync && (
              <p style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 2 }}>
                Última sincronização: {formatRelative(currentGroup.lastSync)}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setSelectorOpen((v) => !v)}
              style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-dim)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              {currentGroup.jid ? 'Trocar' : 'Selecionar grupo'}
            </button>
            {currentGroup.jid && (
              <button
                onClick={syncNow}
                disabled={syncing}
                style={{ padding: '8px 14px', borderRadius: 8, background: '#22c55e', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: syncing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {syncing ? <Loader size={12} className="spin" /> : <RefreshCw size={12} />}
                {syncing ? 'Atualizando…' : 'Atualizar agora'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Seletor inline */}
      {selectorOpen && (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: 'var(--glass)', border: '1px solid var(--border)' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar grupo..."
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--strong-text)', fontSize: 13, outline: 'none', marginBottom: 8 }}
          />
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {currentGroup.jid && (
              <button
                onClick={() => setGroup(null)}
                style={{ padding: '8px 12px', borderRadius: 8, background: 'transparent', border: '1px dashed rgba(239,68,68,0.3)', color: '#f87171', fontSize: 12, textAlign: 'left', cursor: 'pointer' }}
              >
                <X size={12} style={{ display: 'inline', marginRight: 6 }} /> Remover grupo atual
              </button>
            )}
            {filtered.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--fg-subtle)', textAlign: 'center', padding: 16 }}>
                Nenhum grupo encontrado. Sincronize conversas primeiro.
              </p>
            ) : (
              filtered.map((g) => (
                <button
                  key={g.jid}
                  onClick={() => setGroup(g)}
                  style={{
                    padding: '8px 12px', borderRadius: 8, background: g.jid === currentGroup.jid ? 'rgba(34,197,94,0.08)' : 'transparent',
                    border: 'none', color: g.jid === currentGroup.jid ? '#22c55e' : 'var(--fg-dim)',
                    fontSize: 12, fontWeight: g.jid === currentGroup.jid ? 700 : 500,
                    textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <Users size={12} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                  {g.jid === currentGroup.jid && <Check size={12} />}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Lista de promoções */}
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-subtle)' }}>
          <Loader size={16} className="spin" style={{ display: 'inline' }} /> Carregando…
        </div>
      ) : promotions.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--fg-subtle)', fontSize: 12, background: 'var(--glass)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {currentGroup.jid
            ? 'Nenhuma promoção ativa. Clique em "Atualizar agora" pra extrair.'
            : 'Selecione um grupo primeiro pra começar a extração automática.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 11, color: 'var(--fg-subtle)', fontWeight: 600 }}>
            {promotions.length} {promotions.length === 1 ? 'promoção ativa' : 'promoções ativas'}
          </p>
          {promotions.map((p) => (
            <div key={p.id} style={{
              padding: 12, borderRadius: 10,
              background: 'var(--glass)', border: '1px solid var(--border)',
              display: 'flex', gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--strong-text)' }}>{p.title}</span>
                  {p.discount_text && (
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(212,175,55,0.15)', color: 'var(--accent)', fontWeight: 700 }}>
                      {p.discount_text}
                    </span>
                  )}
                  {p.category && (
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--fg-subtle)', fontWeight: 600 }}>
                      {p.category}
                    </span>
                  )}
                </div>
                {p.description && (
                  <p style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 4, lineHeight: 1.4 }}>{p.description}</p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  {p.link_url && (
                    <a href={p.link_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <ExternalLink size={10} /> Abrir link
                    </a>
                  )}
                  {p.valid_until && (
                    <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
                      Válido até {new Date(p.valid_until).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--fg-subtle)', marginLeft: 'auto' }}>
                    extraída {formatRelative(p.extracted_at)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => deactivate(p.id)}
                title="Desativar"
                style={{ padding: 6, borderRadius: 6, background: 'transparent', border: 'none', color: 'var(--fg-subtle)', cursor: 'pointer', flexShrink: 0, alignSelf: 'flex-start' }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
          padding: '10px 16px', borderRadius: 10,
          background: 'var(--surface-3)', border: '1px solid var(--accent-border)',
          color: 'var(--fg-dim)', fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

      {/* Suprime warning de instanceName não usado */}
      <span style={{ display: 'none' }}>{instanceName}</span>
    </div>
  );
}
