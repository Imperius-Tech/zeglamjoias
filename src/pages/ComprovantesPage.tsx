import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, CheckCircle, XCircle, Clock, CreditCard, ExternalLink, MessageSquare, Phone, Loader, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useDashboardStore } from '@/lib/store';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MediaAnalysis {
  payment_value?: string | null;
  payer_name?: string | null;
  receiver_name?: string | null;
  date?: string | null;
  bank?: string | null;
  transaction_id?: string | null;
  type?: string | null;
  description?: string | null;
  confidence?: number;
  payment_data?: {
    value?: string | null;
    payer_name?: string | null;
    receiver_name?: string | null;
    date?: string | null;
    bank?: string | null;
    transaction_id?: string | null;
  } | null;
}

interface PaymentProof {
  id: string;
  conversation_id: string;
  message_id: string;
  customer_name: string;
  customer_phone: string;
  media_url: string;
  detected_value: string | null;
  status: 'pendente' | 'confirmado' | 'rejeitado';
  notes: string | null;
  confirmed_at: string | null;
  created_at: string;
  media_analysis?: MediaAnalysis | null;
}

const statusConfig = {
  pendente: { label: 'Pendente', color: 'var(--amber)', icon: Clock, bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
  confirmado: { label: 'Confirmado', color: 'var(--emerald)', icon: CheckCircle, bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)' },
  rejeitado: { label: 'Rejeitado', color: 'var(--red)', icon: XCircle, bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)' },
};

type FilterStatus = 'all' | 'pendente' | 'confirmado' | 'rejeitado';

export default function ComprovantesPage() {
  const navigate = useNavigate();
  const selectConversation = useDashboardStore((s) => s.selectConversation);
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadProofs();

    const channel = supabase
      .channel('payment-proofs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_proofs' }, () => {
        loadProofs();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadProofs() {
    const { data } = await supabase
      .from('payment_proofs')
      .select('*, messages!inner(media_analysis)')
      .order('created_at', { ascending: false });
    if (data) {
      setProofs(data.map((p: any) => ({
        ...p,
        media_analysis: p.messages?.media_analysis || null,
      })));
    }
    setLoading(false);
  }

  async function updateStatus(id: string, status: 'confirmado' | 'rejeitado', notes?: string) {
    setUpdating(true);
    await supabase.from('payment_proofs').update({
      status,
      notes: notes || null,
      confirmed_at: status === 'confirmado' ? new Date().toISOString() : null,
    }).eq('id', id);
    await loadProofs();
    setUpdating(false);
  }

  const filtered = useMemo(() => {
    let list = proofs;
    if (filter !== 'all') list = list.filter((p) => p.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.customer_name.toLowerCase().includes(q) || p.customer_phone.includes(q) || (p.detected_value || '').includes(q));
    }
    return list;
  }, [proofs, filter, search]);

  const selected = selectedId ? proofs.find((p) => p.id === selectedId) : null;

  const counts = {
    all: proofs.length,
    pendente: proofs.filter((p) => p.status === 'pendente').length,
    confirmado: proofs.filter((p) => p.status === 'confirmado').length,
    rejeitado: proofs.filter((p) => p.status === 'rejeitado').length,
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Loader size={24} style={{ color: 'var(--fg-subtle)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div className={`mobile-master-detail ${selectedId ? 'detail-active' : ''}`} style={{ display: 'flex', height: '100%' }}>
      {/* Left: List */}
      <div className="master-pane" style={{
        width: 400, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', borderRight: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--strong-text)' }}>Comprovantes</h2>
            {counts.pendente > 0 && (
              <span style={{
                padding: '2px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'rgba(245,158,11,0.15)', color: 'var(--amber)',
              }}>
                {counts.pendente} pendente{counts.pendente > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-subtle)' }} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente ou valor..."
              style={{ width: '100%', height: 36, paddingLeft: 36, paddingRight: 16, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--fg-dim)', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { value: 'all', label: `Todos (${counts.all})` },
              { value: 'pendente', label: `Pendentes (${counts.pendente})` },
              { value: 'confirmado', label: `Confirmados (${counts.confirmado})` },
              { value: 'rejeitado', label: `Rejeitados (${counts.rejeitado})` },
            ] as { value: FilterStatus; label: string }[]).map((f) => (
              <button key={f.value} onClick={() => setFilter(f.value)}
                style={{
                  flexShrink: 0, padding: '5px 10px', borderRadius: 8, fontSize: 10, fontWeight: 500, cursor: 'pointer',
                  color: filter === f.value ? 'var(--accent)' : 'var(--fg-muted)',
                  background: filter === f.value ? 'var(--accent-bg)' : 'var(--glass)',
                  border: filter === f.value ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <CreditCard size={32} style={{ color: 'var(--fg-faint)', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>
                {search || filter !== 'all' ? 'Nenhum comprovante encontrado' : 'Nenhum comprovante recebido ainda'}
              </p>
            </div>
          ) : (
            filtered.map((proof) => {
              const st = statusConfig[proof.status];
              const StIcon = st.icon;
              const isActive = selectedId === proof.id;
              return (
                <div key={proof.id} onClick={() => setSelectedId(proof.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px', borderRadius: 12, cursor: 'pointer', marginBottom: 2,
                    background: isActive ? 'var(--hover)' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--glass-strong)'; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Thumbnail */}
                  {proof.media_url.endsWith('.pdf') ? (
                    <div style={{ width: 44, height: 44, borderRadius: 8, flexShrink: 0, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CreditCard size={18} style={{ color: 'var(--fg-subtle)' }} />
                    </div>
                  ) : (
                    <img src={proof.media_url} alt="Comprovante"
                      style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)' }}>{proof.customer_name}</span>
                      <span style={{ fontSize: 10, color: 'var(--fg-faint)', flexShrink: 0 }}>
                        {formatDistanceToNow(new Date(proof.created_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
                        {proof.detected_value || 'Valor não detectado'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <StIcon size={10} style={{ color: st.color }} />
                        <span style={{ fontSize: 10, fontWeight: 600, color: st.color }}>{st.label}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className={`detail-pane ${selected ? '' : 'detail-empty'}`} style={{ flex: 1, height: '100%', overflowY: 'auto' }}>
        {selected ? (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ display: 'flex', height: '100%', flexDirection: 'column' }}
          >
            <button
              onClick={() => setSelectedId(null)}
              className="mobile-back-btn"
              style={{ margin: 12, padding: '8px 14px', borderRadius: 10, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-dim)', fontSize: 13, fontWeight: 600, cursor: 'pointer', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
            >
              ← Voltar
            </button>
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* Left: Document preview */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {selected.media_url.endsWith('.pdf') ? (
                  <iframe src={selected.media_url} style={{ width: '100%', height: '100%', border: 'none' }} title="Comprovante PDF" />
                ) : (
                  <a href={selected.media_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                    <img src={selected.media_url} alt="Comprovante" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  </a>
                )}
              </div>
            </div>

            {/* Right: Data panel */}
            <div style={{ width: 360, flexShrink: 0, height: '100%', overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Status + Client */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {(() => {
                  const st = statusConfig[selected.status];
                  const StIcon = st.icon;
                  return (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: st.bg, border: `1px solid ${st.border}` }}>
                      <StIcon size={14} style={{ color: st.color }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: st.color }}>{st.label}</span>
                    </div>
                  );
                })()}
                <button
                  onClick={async () => {
                    await selectConversation(selected.conversation_id);
                    const qs = selected.message_id
                      ? `?msg=${encodeURIComponent(selected.message_id)}`
                      : '';
                    navigate(`/conversas${qs}`);
                  }}
                  title={selected.message_id ? 'Ir para a mensagem do comprovante na conversa' : 'Abrir conversa'}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-muted)', fontSize: 11, cursor: 'pointer' }}
                >
                  <MessageSquare size={10} /> Conversa
                </button>
              </div>

              {/* Client name */}
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--strong-text)' }}>{selected.customer_name}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Phone size={10} style={{ color: 'var(--fg-subtle)' }} />
                  <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{selected.customer_phone}</span>
                </div>
              </div>

              {/* AI Analysis Cards */}
              {(() => {
                const a = selected.media_analysis;
                const fields = [
                  { label: 'Valor', value: a?.payment_data?.value || a?.payment_value, color: 'var(--emerald-light)', large: true },
                  { label: 'Pagador', value: a?.payment_data?.payer_name || a?.payer_name },
                  { label: 'Recebedor', value: a?.payment_data?.receiver_name || a?.receiver_name },
                  { label: 'Data', value: a?.payment_data?.date || a?.date },
                  { label: 'Banco', value: a?.payment_data?.bank || a?.bank },
                  { label: 'ID Transação', value: a?.payment_data?.transaction_id || a?.transaction_id, mono: true },
                ].filter(f => f.value);

                if (fields.length === 0) {
                  return (
                    <div style={{ padding: 14, borderRadius: 10, background: 'var(--glass)', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 10, color: 'var(--fg-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>Dados</span>
                      <p style={{ fontSize: 14, color: 'var(--fg-muted)', marginTop: 4 }}>Não detectado</p>
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: fields.length > 2 ? '1fr 1fr' : '1fr', gap: 8 }}>
                    {fields.map((f) => (
                      <div key={f.label} style={{
                        padding: '10px 14px', borderRadius: 10,
                        background: f.large ? 'rgba(16,185,129,0.06)' : 'var(--glass)',
                        border: `1px solid ${f.large ? 'rgba(16,185,129,0.2)' : 'var(--border)'}`,
                        gridColumn: f.large || f.mono ? '1 / -1' : undefined,
                      }}>
                        <span style={{ fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>{f.label}</span>
                        <p style={{
                          fontSize: f.mono ? 10 : f.large ? 22 : 13, fontWeight: f.large ? 800 : 600,
                          color: f.color || '#fff', marginTop: 2,
                          fontFamily: f.mono ? 'monospace' : 'inherit',
                          wordBreak: f.mono ? 'break-all' as const : 'normal' as const,
                        }}>
                          {f.value}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Timestamps */}
              <div style={{ padding: 12, borderRadius: 10, background: 'var(--glass)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>Recebido</span>
                  <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{format(new Date(selected.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                </div>
                {selected.confirmed_at && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>Confirmado</span>
                    <span style={{ fontSize: 10, color: 'var(--emerald-light)' }}>{format(new Date(selected.confirmed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ marginTop: 'auto' }}>
                {selected.status === 'pendente' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => updateStatus(selected.id, 'confirmado')} disabled={updating}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, background: 'var(--emerald)', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <CheckCircle size={14} /> Confirmar
                    </button>
                    <button onClick={() => updateStatus(selected.id, 'rejeitado')} disabled={updating}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, background: 'var(--surface-3)', color: 'var(--red)', fontSize: 13, fontWeight: 500, border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }}>
                      <XCircle size={14} /> Rejeitar
                    </button>
                  </div>
                )}
                {selected.status !== 'pendente' && (
                  <button onClick={() => updateStatus(selected.id, 'pendente' as any)} disabled={updating}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', borderRadius: 10,
                    background: 'var(--surface-3)', color: 'var(--fg-muted)',
                    fontSize: 12, fontWeight: 500, border: '1px solid var(--border)', cursor: 'pointer',
                  }}>
                    <Clock size={14} /> Voltar para pendente
                  </button>
                )}
              </div>
            </div>
            </div>
          </motion.div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              style={{ width: 80, height: 80, borderRadius: 24, background: 'var(--glass)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={32} style={{ color: 'var(--fg-faint)' }} />
            </motion.div>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-muted)' }}>Selecione um comprovante para verificar</motion.p>
          </div>
        )}
      </div>
    </div>
  );
}
