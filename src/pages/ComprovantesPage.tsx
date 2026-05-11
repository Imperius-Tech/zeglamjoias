import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, CheckCircle, XCircle, Clock, CreditCard, ExternalLink, MessageSquare, Phone, Loader, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useDashboardStore } from '@/lib/store';
import { confirmProofPaymentInZeglam } from '@/lib/zeglamComprovanteConfirm';
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

export type AutoMatchTier = 'phone_amount' | 'name_amount' | 'payer_name_amount' | 'phone_provavel';

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
  auto_matched_sales_id?: string | null;
  auto_match_tier?: AutoMatchTier | null;
  auto_matched_at?: string | null;
  auto_match_details?: AutoMatchDetails | null;
  payer_name?: string | null;
}

interface AutoMatchDetails {
  pedido?: {
    sales_id?: string;
    cliente?: string;
    valor?: string;
    atraso?: string;
    catalogo?: string;
    customer_name_zeglam?: string;
    phone_digits?: string;
  };
  reasons?: string[];
  phone_matched?: { proof_tail?: string; zeglam_tail?: string };
  name_matched?: { proof_name?: string; zeglam_name?: string; source?: string };
  value_matched?: { proof?: string; zeglam?: string };
  value_diff?: { proof?: string; zeglam?: string; abs_diff?: string; pct_diff?: string };
}

const TIER_LABEL: Record<AutoMatchTier, { label: string; color: string; bg: string }> = {
  phone_amount: { label: 'CONFIRMADO', color: 'var(--emerald-light)', bg: 'rgba(16,185,129,0.18)' },
  name_amount: { label: 'PROVÁVEL (nome)', color: '#3b82f6', bg: 'rgba(59,130,246,0.18)' },
  payer_name_amount: { label: 'PROVÁVEL (pagador)', color: '#3b82f6', bg: 'rgba(59,130,246,0.18)' },
  phone_provavel: { label: 'REVISAR', color: '#fbbf24', bg: 'rgba(251,191,36,0.18)' },
};

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
  /** Quando marcado (default), confirmação no Zeglam com fluxo normal (notificar cliente). Desmarcado: tenta suprimir. */
  const [notifyZeglamOnProofConfirm, setNotifyZeglamOnProofConfirm] = useState(true);
  /** Erro ao registrar pagamento no Zeglam ou ao atualizar o comprovante. */
  const [whatsappNotifyError, setWhatsappNotifyError] = useState<string | null>(null);
  /** Aviso após confirmar com sucesso (fluxo Zeglam + DB). */
  const [whatsappNotifyOk, setWhatsappNotifyOk] = useState<string | null>(null);
  /** Aviso: supressão de notificação não configurada no scrape (pagamento ainda pode avisar o cliente). */
  const [whatsappNotifyWarn, setWhatsappNotifyWarn] = useState<string | null>(null);
  /** Modal "Vincular pagador" — id do comprovante quando aberto. */
  const [linkingProofId, setLinkingProofId] = useState<string | null>(null);
  const [linkingPayerName, setLinkingPayerName] = useState<string | null>(null);
  const [linkPendingList, setLinkPendingList] = useState<Array<{ salesId: string; valor: string; cliente: string }>>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkSelectedSalesId, setLinkSelectedSalesId] = useState<string | null>(null);
  /** Infinite scroll — quantos comprovantes mostrar na lista. Carrega +20 ao rolar até o fim. */
  const [visibleCount, setVisibleCount] = useState(20);
  const PROOFS_PAGE_SIZE = 20;

  useEffect(() => {
    setWhatsappNotifyError(null);
    setWhatsappNotifyOk(null);
    setWhatsappNotifyWarn(null);
    setNotifyZeglamOnProofConfirm(true);
  }, [selectedId]);

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

  /** Abre modal de vincular pagador e carrega lista de pendências do Zeglam. */
  async function openLinkModal(proofId: string, payerName: string | null) {
    setLinkingProofId(proofId);
    setLinkingPayerName(payerName);
    setLinkSelectedSalesId(null);
    setLinkSearch('');
    setLinkPendingList([]);
    setLinkBusy(true);
    try {
      const { data } = await supabase.functions.invoke('zeglam-api', { body: { action: 'get_all' } });
      const list = ((data as any)?.pending || []) as Array<{ salesId: string; valor: string; cliente: string }>;
      setLinkPendingList(list.filter((p) => p.salesId));
    } catch (e) {
      console.error('openLinkModal:', e);
    } finally {
      setLinkBusy(false);
    }
  }

  /** Salva alias e tenta confirmar pagamento usando o sales_id escolhido. */
  async function confirmLinkAndPay() {
    if (!linkingProofId || !linkSelectedSalesId) return;
    setLinkBusy(true);
    setWhatsappNotifyError(null);
    setWhatsappNotifyOk(null);
    try {
      const proof = proofs.find((p) => p.id === linkingProofId);
      if (!proof) { setLinkBusy(false); return; }
      const payerName = linkingPayerName || proof.media_analysis?.payment_data?.payer_name || proof.media_analysis?.payer_name || proof.customer_name;
      const phoneDigits = (proof.customer_phone || '').replace(/\D/g, '').slice(-9);

      // Salva alias (idempotente: se já existir mesma linha, faz update)
      const { data: existing } = await supabase
        .from('payer_aliases')
        .select('id, use_count')
        .eq('sales_id', linkSelectedSalesId)
        .eq('payer_name', payerName)
        .maybeSingle();
      if (existing) {
        await supabase.from('payer_aliases').update({
          last_used_at: new Date().toISOString(),
          use_count: ((existing.use_count as number) || 0) + 1,
          customer_phone_digits: phoneDigits || null,
          customer_name: proof.customer_name,
        }).eq('id', existing.id);
      } else {
        await supabase.from('payer_aliases').insert({
          payer_name: payerName,
          customer_name: proof.customer_name,
          customer_phone_digits: phoneDigits || null,
          sales_id: linkSelectedSalesId,
          notes: 'Criado via dashboard de comprovantes',
          last_used_at: new Date().toISOString(),
          use_count: 1,
        });
      }

      // Re-tenta confirmar — agora alias permite o match
      const valueRaw =
        proof.detected_value?.trim() ||
        proof.media_analysis?.payment_data?.value?.trim() ||
        proof.media_analysis?.payment_value?.trim() ||
        '';
      const zeglam = await confirmProofPaymentInZeglam(
        supabase,
        {
          conversation_id: proof.conversation_id,
          customer_name: proof.customer_name,
          detected_value: valueRaw,
          payer_name: payerName,
        },
        { notifyCustomer: notifyZeglamOnProofConfirm },
      );
      if (!zeglam.ok) {
        setWhatsappNotifyError(zeglam.error);
        setLinkBusy(false);
        return;
      }
      await supabase.from('payment_proofs').update({
        status: 'confirmado',
        confirmed_at: new Date().toISOString(),
      }).eq('id', linkingProofId);
      setWhatsappNotifyOk('Pagamento confirmado e pagador vinculado.');
      setLinkingProofId(null);
      await loadProofs();
    } catch (e: any) {
      setWhatsappNotifyError(e?.message || String(e));
    } finally {
      setLinkBusy(false);
    }
  }

  /** 1-click: confirma o auto-match (já tem auto_matched_sales_id) sem abrir modal. */
  async function confirmAutoMatch(proofId: string) {
    setUpdating(true);
    setWhatsappNotifyError(null);
    setWhatsappNotifyOk(null);
    try {
      const proof = proofs.find((p) => p.id === proofId);
      if (!proof || !proof.auto_matched_sales_id) { setUpdating(false); return; }
      const payerName = proof.payer_name || proof.media_analysis?.payment_data?.payer_name || proof.customer_name;
      const phoneDigits = (proof.customer_phone || '').replace(/\D/g, '').slice(-9);

      const { data: existing } = await supabase.from('payer_aliases').select('id, use_count').eq('sales_id', proof.auto_matched_sales_id).eq('payer_name', payerName).maybeSingle();
      if (existing) {
        await supabase.from('payer_aliases').update({ last_used_at: new Date().toISOString(), use_count: ((existing.use_count as number) || 0) + 1, customer_phone_digits: phoneDigits || null, customer_name: proof.customer_name }).eq('id', existing.id);
      } else {
        await supabase.from('payer_aliases').insert({ payer_name: payerName, customer_name: proof.customer_name, customer_phone_digits: phoneDigits || null, sales_id: proof.auto_matched_sales_id, notes: `Auto-match tier ${proof.auto_match_tier}`, last_used_at: new Date().toISOString(), use_count: 1 });
      }

      const valueRaw = proof.detected_value?.trim() || proof.media_analysis?.payment_data?.value?.trim() || '';
      const zeglam = await confirmProofPaymentInZeglam(supabase, {
        conversation_id: proof.conversation_id,
        customer_name: proof.customer_name,
        detected_value: valueRaw,
        payer_name: payerName,
      }, { notifyCustomer: notifyZeglamOnProofConfirm, forceSalesId: proof.auto_matched_sales_id! });
      if (!zeglam.ok) {
        setWhatsappNotifyError(zeglam.error);
        return;
      }
      await supabase.from('payment_proofs').update({ status: 'confirmado', confirmed_at: new Date().toISOString() }).eq('id', proofId);
      setWhatsappNotifyOk('Pagamento confirmado via auto-match.');
      await loadProofs();
    } catch (e: any) {
      setWhatsappNotifyError(e?.message || String(e));
    } finally {
      setUpdating(false);
    }
  }

  async function updateStatus(id: string, status: 'pendente' | 'confirmado' | 'rejeitado', notes?: string) {
    setUpdating(true);
    setWhatsappNotifyError(null);
    setWhatsappNotifyOk(null);
    setWhatsappNotifyWarn(null);
    const proof = proofs.find((p) => p.id === id);

    if (status === 'confirmado' && proof) {
      const valueRaw =
        proof.detected_value?.trim() ||
        proof.media_analysis?.payment_data?.value?.trim() ||
        proof.media_analysis?.payment_value?.trim() ||
        '';
      if (!valueRaw) {
        setWhatsappNotifyError(
          'Não há valor detectado no comprovante. Informe o valor na análise ou confirme o pagamento manualmente no Zeglam.',
        );
        setUpdating(false);
        return;
      }
      const payerName =
        proof.media_analysis?.payment_data?.payer_name?.trim() ||
        proof.media_analysis?.payer_name?.trim() ||
        null;
      const zeglam = await confirmProofPaymentInZeglam(
        supabase,
        {
          conversation_id: proof.conversation_id,
          customer_name: proof.customer_name,
          detected_value: valueRaw,
          payer_name: payerName,
        },
        { notifyCustomer: notifyZeglamOnProofConfirm },
      );
      if (!zeglam.ok) {
        if (zeglam.needsManualZeglam) {
          setLinkingProofId(id);
          setLinkingPayerName(payerName);
        }
        setWhatsappNotifyError(zeglam.error);
        setUpdating(false);
        return;
      }
      if (zeglam.clientNotifySuppressionUnconfigured) {
        setWhatsappNotifyWarn(
          'Pagamento registrado. Não foi possível garantir que o aviso automático ao cliente fique desligado — ele pode ainda ser enviado.',
        );
      }
    }

    const { error } = await supabase.from('payment_proofs').update({
      status,
      notes: notes || null,
      confirmed_at: status === 'confirmado' ? new Date().toISOString() : null,
    }).eq('id', id);

    if (error) {
      console.error('payment_proofs update:', error);
      setUpdating(false);
      return;
    }

    if (status === 'confirmado') {
      setWhatsappNotifyOk('Pagamento confirmado.');
    }

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

  // Reset visibleCount quando filtro/search muda
  useEffect(() => { setVisibleCount(PROOFS_PAGE_SIZE); }, [filter, search]);

  const visibleProofs = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200 && visibleCount < filtered.length) {
      setVisibleCount((c) => Math.min(c + PROOFS_PAGE_SIZE, filtered.length));
    }
  };

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
        <div onScroll={handleListScroll} style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <CreditCard size={32} style={{ color: 'var(--fg-faint)', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>
                {search || filter !== 'all' ? 'Nenhum comprovante encontrado' : 'Nenhum comprovante recebido ainda'}
              </p>
            </div>
          ) : (
            visibleProofs.map((proof) => {
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
                    {proof.auto_match_tier && proof.status === 'pendente' && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, padding: '2px 6px', borderRadius: 6, fontSize: 9, fontWeight: 700, background: TIER_LABEL[proof.auto_match_tier].bg, color: TIER_LABEL[proof.auto_match_tier].color }}>
                        ⚡ {TIER_LABEL[proof.auto_match_tier].label}
                      </div>
                    )}
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
          {filtered.length > 0 && visibleCount < filtered.length && (
            <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 11, color: 'var(--fg-subtle)' }}>
              <Loader size={14} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6, animation: 'spin 1s linear infinite' }} />
              Carregando mais... ({visibleCount} de {filtered.length})
            </div>
          )}
          {filtered.length > 0 && visibleCount >= filtered.length && filtered.length > PROOFS_PAGE_SIZE && (
            <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 10, color: 'var(--fg-faint)' }}>
              {filtered.length} comprovantes carregados
            </div>
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

              {whatsappNotifyError && (
                <div
                  role="alert"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: '#fecaca',
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <span>{whatsappNotifyError}</span>
                  {selectedId && (
                    <button
                      type="button"
                      onClick={() => {
                        const p = proofs.find((x) => x.id === selectedId);
                        const payer =
                          p?.media_analysis?.payment_data?.payer_name ||
                          p?.media_analysis?.payer_name ||
                          null;
                        openLinkModal(selectedId, payer);
                      }}
                      style={{
                        alignSelf: 'flex-start',
                        padding: '6px 12px',
                        borderRadius: 8,
                        background: 'rgba(212,168,67,0.15)',
                        border: '1px solid rgba(212,168,67,0.35)',
                        color: 'var(--accent)',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Vincular pagador manualmente
                    </button>
                  )}
                </div>
              )}

              {whatsappNotifyWarn && (
                <div
                  role="status"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: '#fcd34d',
                    background: 'rgba(251,191,36,0.12)',
                    border: '1px solid rgba(251,191,36,0.35)',
                  }}
                >
                  {whatsappNotifyWarn}
                </div>
              )}

              {whatsappNotifyOk && (
                <div
                  role="status"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: '#86efac',
                    background: 'rgba(16,185,129,0.12)',
                    border: '1px solid rgba(16,185,129,0.35)',
                  }}
                >
                  {whatsappNotifyOk}
                </div>
              )}

              {/* Actions */}
              <div style={{ marginTop: 'auto' }}>
                {selected.status === 'pendente' && (
                  <>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        cursor: updating ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--fg-muted)',
                        lineHeight: 1.45,
                        marginBottom: 10,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={notifyZeglamOnProofConfirm}
                        onChange={(e) => setNotifyZeglamOnProofConfirm(e.target.checked)}
                        disabled={updating}
                        style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--emerald)', flexShrink: 0 }}
                      />
                      <span>Notificar cliente automaticamente ao confirmar.</span>
                    </label>
                  {selected.auto_matched_sales_id && selected.auto_match_tier && (() => {
                    const d = selected.auto_match_details || {};
                    const pedido = d.pedido || {};
                    return (
                      <div style={{ marginBottom: 6, padding: 12, borderRadius: 10, background: TIER_LABEL[selected.auto_match_tier!].bg, border: `1px solid ${TIER_LABEL[selected.auto_match_tier!].color}40` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: TIER_LABEL[selected.auto_match_tier!].color, letterSpacing: 0.4 }}>
                            ⚡ AUTO-MATCH · {TIER_LABEL[selected.auto_match_tier!].label}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--fg-faint)' }}>Pedido <strong style={{ color: 'var(--fg-dim)' }}>{selected.auto_matched_sales_id}</strong></div>
                        </div>

                        {/* Pedido Zeglam detalhes */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8, padding: 8, borderRadius: 6, background: 'rgba(0,0,0,0.18)' }}>
                          {pedido.cliente && (<div><div style={{ fontSize: 8, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Cliente Zeglam</div><div style={{ fontSize: 11, color: 'var(--strong-text)', fontWeight: 600 }}>{pedido.cliente}</div></div>)}
                          {pedido.valor && (<div><div style={{ fontSize: 8, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Valor pendente</div><div style={{ fontSize: 11, color: 'var(--strong-text)', fontWeight: 600 }}>{pedido.valor}</div></div>)}
                          {pedido.atraso && (<div><div style={{ fontSize: 8, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Atraso</div><div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{pedido.atraso}</div></div>)}
                          {pedido.catalogo && (<div><div style={{ fontSize: 8, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Catálogo</div><div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{pedido.catalogo}</div></div>)}
                          {pedido.customer_name_zeglam && pedido.customer_name_zeglam !== pedido.cliente && (<div style={{ gridColumn: 'span 2' }}><div style={{ fontSize: 8, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Nome cadastrado</div><div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{pedido.customer_name_zeglam}</div></div>)}
                        </div>

                        {/* Razões match */}
                        {(d.reasons && d.reasons.length > 0) && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 9, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Por que combinou</div>
                            {d.reasons.map((r, i) => (
                              <div key={i} style={{ fontSize: 10, color: 'var(--fg-dim)', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                <span style={{ color: TIER_LABEL[selected.auto_match_tier!].color, flexShrink: 0 }}>✓</span><span>{r}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Diff valor se Tier3 */}
                        {d.value_diff && (
                          <div style={{ marginBottom: 8, fontSize: 10, color: '#fbbf24' }}>
                            ⚠ Diferença valor: proof <strong>{d.value_diff.proof}</strong> vs Zeglam <strong>{d.value_diff.zeglam}</strong> ({d.value_diff.pct_diff})
                          </div>
                        )}

                        <button onClick={() => confirmAutoMatch(selected.id)} disabled={updating}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 12px', borderRadius: 8, background: TIER_LABEL[selected.auto_match_tier!].color, color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                          <CheckCircle size={14} /> Aceitar match (1-clique)
                        </button>
                      </div>
                    );
                  })()}
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
                  </>
                )}
                {selected.status !== 'pendente' && (
                  <button onClick={() => updateStatus(selected.id, 'pendente')} disabled={updating}
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

      {linkingProofId && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget && !linkBusy) setLinkingProofId(null); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            style={{
              width: 'min(620px, 100%)', maxHeight: '90vh', overflow: 'hidden',
              borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ padding: 20, borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--strong-text)', marginBottom: 6 }}>
                Vincular pagador
              </h2>
              <p style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                Pagador <strong style={{ color: 'var(--accent)' }}>{linkingPayerName || '(nome não detectado)'}</strong> não casa com cliente.
                Escolha o pedido pendente correspondente. O sistema vai aprender essa relação para baixar automaticamente nas próximas vezes.
              </p>
            </div>

            <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-subtle)' }} />
                <input
                  type="text"
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  placeholder="Buscar por cliente ou valor..."
                  style={{
                    width: '100%', height: 36, paddingLeft: 36, paddingRight: 12, borderRadius: 10,
                    background: 'var(--glass)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--fg-dim)', outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
              {linkBusy && linkPendingList.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                  <Loader size={20} style={{ color: 'var(--fg-subtle)', animation: 'spin 1s linear infinite' }} />
                </div>
              ) : linkPendingList.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--fg-subtle)', textAlign: 'center', padding: 24 }}>Nenhuma pendência carregada.</p>
              ) : (
                linkPendingList
                  .filter((p) => {
                    if (!linkSearch.trim()) return true;
                    const q = linkSearch.toLowerCase();
                    return (p.cliente || '').toLowerCase().includes(q) || (p.valor || '').toLowerCase().includes(q);
                  })
                  .slice(0, 80)
                  .map((p) => {
                    const isSelected = linkSelectedSalesId === p.salesId;
                    return (
                      <div
                        key={p.salesId}
                        onClick={() => setLinkSelectedSalesId(p.salesId)}
                        style={{
                          padding: '10px 12px', borderRadius: 10, marginBottom: 4, cursor: 'pointer',
                          background: isSelected ? 'rgba(212,168,67,0.15)' : 'transparent',
                          border: isSelected ? '1px solid var(--accent-border, rgba(212,168,67,0.4))' : '1px solid transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)' }}>{p.cliente}</div>
                          <div style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>#{p.salesId}</div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>{p.valor}</div>
                      </div>
                    );
                  })
              )}
            </div>

            <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => { if (!linkBusy) setLinkingProofId(null); }}
                disabled={linkBusy}
                style={{
                  padding: '8px 16px', borderRadius: 10, background: 'var(--glass)', color: 'var(--fg-dim)',
                  border: '1px solid var(--border)', fontSize: 13, fontWeight: 600, cursor: linkBusy ? 'not-allowed' : 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmLinkAndPay}
                disabled={!linkSelectedSalesId || linkBusy}
                style={{
                  padding: '8px 16px', borderRadius: 10,
                  background: !linkSelectedSalesId || linkBusy ? 'rgba(212,168,67,0.4)' : 'var(--accent)',
                  color: '#1a1a1a', border: 'none', fontSize: 13, fontWeight: 700,
                  cursor: !linkSelectedSalesId || linkBusy ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {linkBusy ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
                Vincular e dar baixa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
