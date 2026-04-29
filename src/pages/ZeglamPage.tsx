import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  RefreshCw, 
  Loader, 
  ExternalLink, 
  AlertCircle,
  CheckCircle2,
  Clock,
  UserX,
  FileCheck,
  Search,
  MessageSquare,
  Info,
  ChevronRight,
  X,
  ArrowRight,
  User,
  MapPin,
  Package,
  TrendingUp,
  AlertTriangle,
  Wallet,
  SlidersHorizontal,
  ArrowDownWideNarrow,
  History,
  ChevronDown,
  Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboardStore } from '@/lib/store';

interface Payment {
  link: string;
  total: string;
  statusType: 'success' | 'warning' | 'danger';
  pago: string;
  aberto: string;
}

interface PendingCustomer {
  catalogo: string;
  cliente: string;
  statusType: 'success' | 'warning' | 'danger';
  atraso: string;
  valor: string;
  salesId?: string;
  hasProof?: boolean;
  matchTier?: 'phone_amount' | 'name_amount' | null;
  conversationId?: string;
  proofMessageId?: string;
}

/** DD/MM/AAAA (e horário opcional) vindos do scraping da coluna "Atraso". */
function parseAtrasoTimestamp(atraso: string): number {
  const m = String(atraso).trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (!m) return NaN;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const year = parseInt(m[3], 10);
  const hh = m[4] !== undefined ? parseInt(m[4], 10) : 0;
  const min = m[5] !== undefined ? parseInt(m[5], 10) : 0;
  const t = new Date(year, month, day, hh, min, 0, 0).getTime();
  return Number.isFinite(t) ? t : NaN;
}

export default function ZeglamPage() {
  const navigate = useNavigate();
  const selectConversation = useDashboardStore(s => s.selectConversation);
  const [activeTab, setActiveTab] = useState<'financeiro' | 'inadimplentes' | 'conferencia'>('inadimplentes');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pendingCustomers, setPendingCustomers] = useState<PendingCustomer[]>([]);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<Record<string, string> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [pendingFilter, setPendingFilter] = useState<'todos' | 'com_comprovante' | 'sem_comprovante'>('todos');
  const [atrasoOrder, setAtrasoOrder] = useState<'recentes' | 'antigos'>('recentes');
  /** Menu suspenso de ordenação (“gaveta” / dropdown). */
  const [ordenMenuOpen, setOrdenMenuOpen] = useState(false);
  const ordenMenuWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ordenMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (ordenMenuWrapRef.current?.contains(e.target as Node)) return;
      setOrdenMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOrdenMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [ordenMenuOpen]);

  const [searchText, setSearchText] = useState('');

  const normalize = (str: string) =>
    str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const phoneTail = (str: string | null | undefined, n = 9) => {
    if (!str) return "";
    const digits = str.replace(/\D/g, "");
    return digits.slice(-n);
  };

  const parseBrlAmount = (str: string | null | undefined): number | null => {
    if (!str) return null;
    const m = str.match(/R\$?\s*([\d.,]+)/i);
    const raw = m ? m[1] : str;
    const cleaned = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  };

  const amountMatches = (zeglamValue: string, proofValue: string, tolerancePct = 0.01) => {
    const a = parseBrlAmount(zeglamValue);
    const b = parseBrlAmount(proofValue);
    if (a == null || b == null || a <= 0 || b <= 0) return false;
    const diff = Math.abs(a - b) / a;
    return diff <= tolerancePct;
  };

  /** Comprovante “totalmente compatível” por texto: mesmo nome cadastrado (Zeglam x WhatsApp x comprovante), sem depender só do telefone. */
  const nameFullyCompatibleWithProof = (
    proofCustomerName: string,
    variants: Array<string | null | undefined>,
  ): boolean => {
    const pn = normalize(proofCustomerName || '');
    if (pn.length < 2) return false;
    for (const raw of variants) {
      const zn = normalize(String(raw ?? ''));
      if (!zn) continue;
      if (zn === pn) return true;
      if (zn.includes(pn) || pn.includes(zn)) return true;

      const zTok = zn.split(/\s+/).filter((t) => t.length >= 2);
      const pTok = pn.split(/\s+/).filter((t) => t.length >= 2);
      if (!zTok.length || !pTok.length) continue;

      const sharedExact = zTok.filter((t) => pTok.some((pt) => pt === t));
      if (sharedExact.length >= 2) return true;

      if (
        zTok.length >= 2 &&
        pTok.length >= 2 &&
        zTok[0] === pTok[0] &&
        zTok[zTok.length - 1] === pTok[pTok.length - 1]
      ) return true;

      const fuzzy = zTok.filter((t) =>
        pTok.some((pt) => pt === t || pt.includes(t) || t.includes(pt)),
      );
      if (zTok.length >= 3 && pTok.length >= 3 && fuzzy.length >= 2) return true;
    }
    return false;
  };

  type ProofIndexEntry = {
    proofKey: string;
    proof: { customer_name?: string | null; message_id?: string; conversation_id?: string; detected_value?: string | null };
    phoneTail: string;
    convId?: string;
    detectedValue?: string | null;
  };

  const fetchData = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const { data: allData, error: functionError } = await supabase.functions.invoke('zeglam-api', {
        body: { action: 'get_all' }
      });

      if (functionError) throw new Error(functionError.message);

      const pendingList = allData?.pending || [];
      const salesIds = pendingList.map((p: any) => p.salesId).filter(Boolean);

      const [proofsRes, convsRes, phonesRes] = await Promise.all([
        supabase.from('payment_proofs')
          .select('id, customer_name, message_id, conversation_id, detected_value, created_at, status')
          .neq('status', 'rejeitado')
          .order('created_at', { ascending: false }),
        supabase.from('conversations').select('id, customer_name, customer_phone'),
        salesIds.length > 0
          ? supabase.functions.invoke('zeglam-api', { body: { action: 'enrich_phones', salesIds } })
          : Promise.resolve({ data: {} })
      ]);

      const proofs = proofsRes.data || [];
      const conversations = convsRes.data || [];
      const phonesMap: Record<string, { phone_digits: string | null; customer_name: string | null }> = phonesRes.data || {};

      const proofIndex: ProofIndexEntry[] = proofs.map((p: {
        id?: string;
        customer_name?: string | null;
        message_id?: string;
        conversation_id?: string;
        detected_value?: string | null;
      }) => {
        const conv = conversations.find(c => c.id === p.conversation_id);
        const proofKey =
          typeof p.id === 'string'
            ? p.id
            : `${p.conversation_id || ''}:${p.message_id || ''}`;
        return {
          proofKey,
          proof: p,
          phoneTail: phoneTail(conv?.customer_phone),
          convId: p.conversation_id,
          detectedValue: p.detected_value,
        };
      });

      /** Telefone WhatsApp compatível + valor dentro da tolerância (best-match por menor diff). */
      const tryPhoneAndAmountMatch = (
        consumed: Set<string>,
        customer: any,
        enrich: { phone_digits?: string | null; customer_name?: string | null } | null,
      ): ProofIndexEntry | null => {
        const zeglamPhoneTail = phoneTail(enrich?.phone_digits || '');
        if (zeglamPhoneTail.length < 8) return null;
        const phoneNameCandidates = proofIndex.filter(
          (entry) =>
            !consumed.has(entry.proofKey) &&
            entry.phoneTail.length >= 8 &&
            (entry.phoneTail.endsWith(zeglamPhoneTail) || zeglamPhoneTail.endsWith(entry.phoneTail)),
        );
        const zeglamAmount = parseBrlAmount(customer.valor);
        if (zeglamAmount == null) return null;
        let best: ProofIndexEntry | null = null;
        let bestDiff = Infinity;
        for (const entry of phoneNameCandidates) {
          if (!amountMatches(customer.valor, entry.detectedValue || '')) continue;
          const proofAmount = parseBrlAmount(entry.detectedValue || '');
          if (proofAmount == null) continue;
          const diff = Math.abs(proofAmount - zeglamAmount);
          if (diff < bestDiff) { bestDiff = diff; best = entry; }
        }
        return best;
      };

      /** Nome alinhado (Zeglam / vínculo) + mesmo valor dentro da tolerança quando o telefone não cruza. */
      const tryNameAndAmountMatch = (
        consumed: Set<string>,
        customer: any,
        enrich: { phone_digits?: string | null; customer_name?: string | null } | null,
      ): ProofIndexEntry | null => {
        const variants = [customer.cliente as string | undefined, enrich?.customer_name || undefined];
        const free = proofIndex.filter((e) => !consumed.has(e.proofKey));
        const zeglamAmount = parseBrlAmount(customer.valor);
        if (zeglamAmount == null) return null;
        let best: ProofIndexEntry | null = null;
        let bestDiff = Infinity;
        for (const entry of free) {
          if (!nameFullyCompatibleWithProof(entry.proof?.customer_name || '', variants)) continue;
          if (!amountMatches(customer.valor, entry.detectedValue || '')) continue;
          const proofAmount = parseBrlAmount(entry.detectedValue || '');
          if (proofAmount == null) continue;
          const diff = Math.abs(proofAmount - zeglamAmount);
          if (diff < bestDiff) { bestDiff = diff; best = entry; }
        }
        return best;
      };

      const debugMatches: any[] = [];
      const consumedProofs = new Set<string>();

      type RowResult = {
        matched: ProofIndexEntry | null;
        matchTier: null | 'phone_amount' | 'name_amount';
        enrich: { phone_digits?: string | null; customer_name?: string | null } | null;
      };

      const rowResults = pendingList.map((customer: any): RowResult => {
        const enrich = customer.salesId ? phonesMap[customer.salesId] : null;

        let matched = tryPhoneAndAmountMatch(new Set(consumedProofs), customer, enrich);
        let tier: RowResult['matchTier'] = null;
        if (matched) tier = 'phone_amount';
        else {
          matched = tryNameAndAmountMatch(consumedProofs, customer, enrich);
          if (matched) tier = 'name_amount';
        }

        if (matched) consumedProofs.add(matched.proofKey);

        const enrichForDebug = enrich;
        const zeglamPhoneTail = phoneTail(enrichForDebug?.phone_digits || '');
        if (zeglamPhoneTail.length >= 8) {
          const phoneNameCandidates = proofIndex.filter((p) =>
            p.phoneTail.length >= 8 &&
            (p.phoneTail.endsWith(zeglamPhoneTail) || zeglamPhoneTail.endsWith(p.phoneTail)),
          );
          debugMatches.push({
            zeglamName: enrichForDebug?.customer_name || customer.cliente,
            zeglamPhone: enrichForDebug?.phone_digits,
            zeglamValue: customer.valor,
            matchTier: tier,
            candidates: phoneNameCandidates.map((c) => ({
              proofName: c.proof?.customer_name,
              detectedValue: c.detectedValue,
              valueMatched: amountMatches(customer.valor, c.detectedValue || ''),
            })),
            finalMatched: tier !== null,
          });
        }

        return { matched, matchTier: tier, enrich };
      });

      const crossedPending = pendingList.map((customer: any, idx: number) => {
        const enrich = rowResults[idx].enrich;
        const matched = rowResults[idx].matched;
        const zeglamPhoneTail = phoneTail(enrich?.phone_digits || '');

        const matchedConv =
          conversations.find((c) => {
            const cTail = phoneTail(c.customer_phone);
            return (
              cTail.length >= 8 &&
              zeglamPhoneTail.length >= 8 &&
              (cTail.endsWith(zeglamPhoneTail) || zeglamPhoneTail.endsWith(cTail))
            );
          }) || null;

        return {
          ...customer,
          hasProof: !!matched,
          matchTier: rowResults[idx].matchTier,
          conversationId: matched?.convId ?? matchedConv?.id,
          proofMessageId: matched?.proof?.message_id,
        };
      });

      console.log('[Zeglam Match Debug]', {
        totalCandidatesByPhone: debugMatches.length,
        consumedProofKeys: consumedProofs.size,
        sample: debugMatches.slice(0, 30),
      });
      setPayments(allData?.payments || []);
      setPendingCustomers(crossedPending);
    } catch (e: any) {
      console.error('Error fetching Zeglam data:', e);
      setError(e.message || 'Erro ao conectar com o sistema Zeglam.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCustomerClick = async (salesId: string) => {
    setIsModalOpen(true);
    setDetailLoading(true);
    setPaymentDetails(null);
    try {
      const { data: details, error: detailError } = await supabase.functions.invoke('zeglam-api', { 
        body: { action: 'get_payment_details', salesId } 
      });
      if (detailError) throw detailError;
      setPaymentDetails(details);
    } catch (e) {
      console.error('Error fetching payment details:', e);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const counts = {
    todos: pendingCustomers.length,
    com_comprovante: pendingCustomers.filter(c => c.hasProof).length,
    sem_comprovante: pendingCustomers.filter(c => !c.hasProof).length
  };

  const filteredPending = useMemo(() => {
    const filtered = pendingCustomers.filter((customer) => {
      const matchesSearch =
        normalize(customer.cliente).includes(normalize(searchText)) ||
        normalize(customer.catalogo).includes(normalize(searchText));
      if (pendingFilter === 'com_comprovante') return matchesSearch && customer.hasProof;
      if (pendingFilter === 'sem_comprovante') return matchesSearch && !customer.hasProof;
      return matchesSearch;
    });

    const withSortKey = filtered.map((c, idx) => ({
      row: c,
      idx,
      ts: parseAtrasoTimestamp(c.atraso),
    }));

    withSortKey.sort((a, b) => {
      const parseBad = Number.isNaN(a.ts);
      const parseBb = Number.isNaN(b.ts);
      if (parseBad && parseBb) return a.idx - b.idx;
      if (parseBad) return 1;
      if (parseBb) return -1;
      if (a.ts === b.ts) return a.idx - b.idx;
      return atrasoOrder === 'recentes' ? b.ts - a.ts : a.ts - b.ts;
    });

    return withSortKey.map((x) => x.row);
  }, [pendingCustomers, searchText, pendingFilter, atrasoOrder]);

  if (loading) return <div style={{ padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Loader size={24} className="spin" style={{ color: 'var(--accent)' }} /></div>;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        
        {/* Header Dashboard */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--strong-text)', margin: 0 }}>Dashboard Zeglam</h1>
            <p style={{ fontSize: 12, color: 'var(--fg-subtle)', margin: '2px 0 0' }}>Conferência de pagamentos e inadimplência</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => fetchData()} disabled={refreshing} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, background: 'var(--glass)', border: '1px solid var(--border)', cursor: refreshing ? 'wait' : 'pointer', color: 'var(--fg-muted)', fontSize: 12, fontWeight: 600 }}>
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Buscando...' : 'Atualizar'}
            </button>
            <a href="https://zeglam.semijoias.net/admin/" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, background: 'var(--accent)', color: '#000', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              <ExternalLink size={14} /> Sistema Original
            </a>
          </div>
        </div>

        {error && <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}><AlertCircle size={18} /><p style={{ margin: 0, fontSize: 12 }}>{error}</p></div>}

        {/* Tabs - Removed "Acertos" */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, padding: 4, background: 'var(--glass)', borderRadius: 12, width: 'fit-content', border: '1px solid var(--border)' }}>
          <button onClick={() => setActiveTab('inadimplentes')} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: activeTab === 'inadimplentes' ? 'var(--surface-2)' : 'transparent', color: activeTab === 'inadimplentes' ? 'var(--accent)' : 'var(--fg-muted)', border: 'none', cursor: 'pointer' }}>Inadimplentes ({pendingCustomers.length})</button>
          <button onClick={() => setActiveTab('conferencia')} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: activeTab === 'conferencia' ? 'var(--surface-2)' : 'transparent', color: activeTab === 'conferencia' ? 'var(--emerald-light)' : 'var(--fg-muted)', border: 'none', cursor: 'pointer' }}>Conferência ({pendingCustomers.filter(p => p.matchTier === 'phone_amount').length})</button>
          <button onClick={() => setActiveTab('financeiro')} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: activeTab === 'financeiro' ? 'var(--surface-2)' : 'transparent', color: activeTab === 'financeiro' ? 'var(--accent)' : 'var(--fg-muted)', border: 'none', cursor: 'pointer' }}>Relatório Financeiro</button>
        </div>

        {activeTab === 'conferencia' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)' }}>
              <CheckCircle2 size={16} style={{ color: 'var(--emerald-light)' }} />
              <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-dim)' }}>
                Pendentes com <strong>telefone E valor</strong> batendo (match forte). Tolerância valor: 1%. Comprovante já vinculado a conversa WhatsApp.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingCustomers.filter(p => p.matchTier === 'phone_amount').length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13, background: 'var(--glass)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  Nenhum pendente com match forte de telefone + valor.
                </div>
              ) : (
                pendingCustomers.filter(p => p.matchTier === 'phone_amount').map((p, i) => (
                  <div key={p.salesId || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <CheckCircle2 size={18} style={{ color: 'var(--emerald-light)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 13, color: 'var(--strong-text)' }}>{p.cliente}</strong>
                        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>· {p.catalogo}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
                        <span><Clock size={10} style={{ display: 'inline', marginRight: 4 }} />{p.atraso}</span>
                        <span style={{ color: 'var(--emerald-light)', fontWeight: 700 }}>{p.valor}</span>
                      </div>
                    </div>
                    {p.conversationId && (
                      <button onClick={async () => { await selectConversation(p.conversationId!); navigate('/conversas'); }} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-dim)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <MessageSquare size={12} /> Ver conversa
                      </button>
                    )}
                    {p.salesId && (
                      <button onClick={() => handleCustomerClick(p.salesId!)} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <FileCheck size={12} /> Detalhes
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'inadimplentes' && (
          <>
            {/* Search and Filters - RESTORED */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-muted)' }} />
                <input type="text" placeholder="Pesquisar cliente..." value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: 10, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--strong-text)', fontSize: 13 }} />
              </div>

              <div
                ref={ordenMenuWrapRef}
                style={{ position: 'relative', flexShrink: 0 }}
                className="zeglam-orden-wrap"
              >
                <button
                  type="button"
                  aria-expanded={ordenMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setOrdenMenuOpen((v) => !v)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: ordenMenuOpen
                      ? '#1c1c1f'
                      : 'var(--glass)',
                    border: `1px solid ${ordenMenuOpen ? 'rgba(212,175,55,0.45)' : 'var(--border)'}`,
                    cursor: 'pointer',
                    boxShadow: ordenMenuOpen
                      ? '0 6px 20px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(212,175,55,0.12)'
                      : undefined,
                  }}
                >
                  <SlidersHorizontal size={14} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, textAlign: 'left' }}>
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--fg-subtle)', textTransform: 'uppercase' }}>
                      Ordem do atraso
                    </span>
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--strong-text)',
                      lineHeight: 1.15,
                    }}>
                      {atrasoOrder === 'recentes' ? (
                        <><ArrowDownWideNarrow size={12} style={{ flexShrink: 0 }} /> Mais recentes</>
                      ) : (
                        <><History size={12} style={{ flexShrink: 0 }} /> Mais antigos</>
                      )}
                    </span>
                  </div>
                  <ChevronDown
                    size={16}
                    style={{
                      flexShrink: 0,
                      color: 'var(--fg-muted)',
                      transition: 'transform 0.2s ease',
                      transform: ordenMenuOpen ? 'rotate(-180deg)' : 'rotate(0)',
                    }}
                  />
                </button>

                {ordenMenuOpen && (
                  <div
                    role="menu"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% - 4px)',
                      right: 0,
                      minWidth: 248,
                      padding: '12px 6px 6px',
                      borderRadius: 12,
                      backgroundColor: '#18181b',
                      backgroundImage: 'none',
                      backdropFilter: 'none',
                      WebkitBackdropFilter: 'none',
                      isolation: 'isolate',
                      border: '1px solid rgba(212,175,55,0.28)',
                      boxShadow:
                        '0 20px 48px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.06)',
                      zIndex: 400,
                      animation: 'zeglamOrdenIn 0.18s ease-out both',
                    }}
                  >
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--fg-faint)', textTransform: 'uppercase', padding: '4px 8px 8px' }}>
                      Classificar pela data na coluna atraso
                    </div>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={atrasoOrder === 'recentes'}
                      onClick={() => { setAtrasoOrder('recentes'); setOrdenMenuOpen(false); }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        backgroundColor: '#18181b',
                        backgroundImage:
                          atrasoOrder === 'recentes'
                            ? 'linear-gradient(135deg, rgba(212,175,55,0.22), rgba(212,175,55,0.07))'
                            : 'none',
                        color: atrasoOrder === 'recentes' ? 'var(--accent)' : 'var(--fg-dim)',
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      <span style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontWeight: 800 }}>Mais recentes</span>
                        <span style={{ display: 'block', marginTop: 2, fontSize: 11, fontWeight: 500, color: 'var(--fg-muted)', opacity: 0.95 }}>
                          Data mais nova primeiro
                        </span>
                      </span>
                      {atrasoOrder === 'recentes' ? <Check size={16} style={{ flexShrink: 0 }} /> : null}
                    </button>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={atrasoOrder === 'antigos'}
                      onClick={() => { setAtrasoOrder('antigos'); setOrdenMenuOpen(false); }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        marginTop: 2,
                        backgroundColor: '#18181b',
                        backgroundImage:
                          atrasoOrder === 'antigos'
                            ? 'linear-gradient(135deg, rgba(245,158,11,0.22), rgba(245,158,11,0.06))'
                            : 'none',
                        color: atrasoOrder === 'antigos' ? '#f59e0b' : 'var(--fg-dim)',
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      <span style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontWeight: 800 }}>Mais antigos</span>
                        <span style={{ display: 'block', marginTop: 2, fontSize: 11, fontWeight: 500, color: 'var(--fg-muted)', opacity: 0.95 }}>
                          Quem atrasou há mais tempo primeiro
                        </span>
                      </span>
                      {atrasoOrder === 'antigos' ? (
                        <Check size={16} style={{ flexShrink: 0, color: '#f59e0b' }} />
                      ) : null}
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, background: 'var(--glass)', padding: 4, borderRadius: 10, border: '1px solid var(--border)' }}>
                <button onClick={() => setPendingFilter('todos')} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: pendingFilter === 'todos' ? 'var(--surface-3)' : 'transparent', color: pendingFilter === 'todos' ? 'var(--strong-text)' : 'var(--fg-muted)', border: 'none', cursor: 'pointer' }}>TODOS</button>
                <button onClick={() => setPendingFilter('com_comprovante')} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: pendingFilter === 'com_comprovante' ? 'rgba(59,130,246,0.15)' : 'transparent', color: pendingFilter === 'com_comprovante' ? '#3b82f6' : 'var(--fg-muted)', border: 'none', cursor: 'pointer' }}>COM COMPROVANTE ({counts.com_comprovante})</button>
                <button onClick={() => setPendingFilter('sem_comprovante')} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: pendingFilter === 'sem_comprovante' ? 'rgba(239,68,68,0.1)' : 'transparent', color: pendingFilter === 'sem_comprovante' ? '#ef4444' : 'var(--fg-muted)', border: 'none', cursor: 'pointer' }}>SEM COMPROVANTE ({counts.sem_comprovante})</button>
              </div>
            </div>

            <div style={{ background: 'var(--glass)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead><tr style={{ background: 'var(--surface-2)' }}><th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase' }}>Cliente</th><th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase' }}>Cruzamento</th><th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase' }}>Atraso</th><th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase', textAlign: 'right' }}>Valor</th><th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase', textAlign: 'center' }}>Ações</th></tr></thead>
                  <tbody>{filteredPending.map((item, i) => (<tr key={i} style={{ borderBottom: i < filteredPending.length - 1 ? '1px solid var(--border)' : 'none' }}><td style={{ padding: '12px 20px' }}>
                    <div
                      onClick={() => item.salesId && handleCustomerClick(item.salesId)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: item.salesId ? 'pointer' : 'default' }}
                      className="customer-row"
                    >
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}><UserX size={12} /></div>
                      <div><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)' }}>{item.cliente}</span><ChevronRight size={10} style={{ color: 'var(--fg-faint)' }} /></div><div style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>{item.catalogo}</div></div>
                    </div>
                  </td><td style={{ padding: '12px 20px' }}>{item.hasProof ? (<div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontSize: 10, fontWeight: 800 }}><FileCheck size={10} /> BATENDO</div>) : (<span style={{ fontSize: 10, color: 'var(--fg-faint)', fontWeight: 600 }}>NÃO ENCONTRADO</span>)}</td><td style={{ padding: '12px 20px' }}><span style={{ fontSize: 11, fontWeight: 600, color: item.statusType === 'danger' ? '#ef4444' : '#f59e0b' }}>{item.atraso}</span></td><td style={{ padding: '12px 20px', textAlign: 'right' }}><div style={{ fontSize: 13, fontWeight: 800, color: '#ef4444' }}>{item.valor}</div></td><td style={{ padding: '12px 20px', textAlign: 'center' }}>
                    {item.conversationId ? (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await selectConversation(item.conversationId ?? null);
                          const qs = item.proofMessageId ? `?msg=${item.proofMessageId}` : '';
                          navigate(`/conversas${qs}`);
                        }}
                        title={item.proofMessageId ? 'Ver comprovante' : 'Abrir conversa'}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: item.hasProof ? 'rgba(59,130,246,0.12)' : 'var(--glass)', border: `1px solid ${item.hasProof ? 'rgba(59,130,246,0.35)' : 'var(--border)'}`, color: item.hasProof ? '#3b82f6' : 'var(--fg-muted)', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                      >
                        <MessageSquare size={11} /> {item.hasProof ? 'COMPROVANTE' : 'CONVERSA'}
                      </button>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>—</span>
                    )}
                  </td></tr>))}</tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Modal Overlay - 100% OPAQUE & INTEGRATED */}
        {isModalOpen && (
          <div style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(0,0,0,0.9)', 
            zIndex: 9999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: 20
          }} onClick={() => setIsModalOpen(false)}>
            
            <div 
                className="modal-solid-container"
                style={{ 
                    width: '100%', 
                    maxWidth: 440, 
                    borderRadius: 20, 
                    boxShadow: '0 0 0 1px var(--accent), 0 30px 60px -12px rgba(0,0,0,0.9)',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#0d0d0d'
                }} 
                onClick={e => e.stopPropagation()}
            >
              
              {/* Header */}
              <div style={{ 
                padding: '16px 20px', 
                borderBottom: '1px solid var(--border)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                background: '#151515'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ background: 'var(--accent)', padding: 8, borderRadius: 10, color: '#000' }}>
                        <Wallet size={18} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--strong-text)' }}>Registrar Pagamento</h3>
                    </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} style={{ background: '#252525', border: 'none', width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
                  <X size={18} />
                </button>
              </div>

              {/* Content */}
              <div style={{ padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
                {detailLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 12 }}>
                      <Loader size={28} className="spin" style={{ color: 'var(--accent)' }} />
                      <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>SINCRONIZANDO...</p>
                  </div>
                ) : paymentDetails ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      
                      {/* IDENTIFICAÇÃO DO CLIENTE */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                         <div style={{ display: 'flex', gap: 12 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                                <User size={18} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>NOME / WHATSAPP</label>
                                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginTop: 2 }}>
                                    {paymentDetails['Cliente'] || paymentDetails['Cliente/Telefone'] || 'Não identificado'}
                                </div>
                            </div>
                         </div>

                         {/* ENDEREÇO / CIDADE / ESTADO */}
                         <div style={{ display: 'flex', gap: 12 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                                <MapPin size={18} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>CIDADE / ESTADO / CEP</label>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginTop: 2 }}>
                                    {Object.entries(paymentDetails).filter(([k]) => k.includes('CEP')).map(([k,v]) => (
                                        <div key={k}>{k.replace(', CEP', '').replace('CEP:', '').trim()} - {v}</div>
                                    ))}
                                    {Object.entries(paymentDetails).filter(([k]) => k.includes('CEP')).length === 0 && 'Localização não informada'}
                                </div>
                            </div>
                         </div>
                      </div>

                      {/* COMPOSIÇÃO DOS VALORES */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <TrendingUp size={12} style={{ color: 'var(--accent)' }} />
                            <h4 style={{ fontSize: 10, fontWeight: 900, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>DETALHAMENTO</h4>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {(() => {
                                // Tenta filtrar por "valor", se não encontrar quase nada, mostra tudo que for útil
                                let fields = Object.entries(paymentDetails).filter(([k,v]) => 
                                    v !== 'OK' && 
                                    !k.includes('Cliente') && 
                                    !k.includes('CEP') &&
                                    !k.includes('Total') &&
                                    !k.includes('Saldo') &&
                                    !k.includes('Percentual') &&
                                    !k.includes('Informação')
                                );
                                
                                if (fields.length === 0) {
                                    fields = Object.entries(paymentDetails).filter(([k,v]) => v !== 'OK' && k.length < 30);
                                }

                                return fields.map(([key, val], idx) => (
                                    <div key={idx} style={{ padding: '12px', background: '#151515', border: '1px solid #333', borderRadius: 12 }}>
                                        <label style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{key}</label>
                                        <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>{val}</div>
                                    </div>
                                ));
                            })()}
                        </div>
                      </div>

                      {/* RESUMO FINANCEIRO FINAL */}
                      <div style={{ background: '#151515', padding: '16px', borderRadius: 16, border: '1px solid #333', display: 'flex', flexDirection: 'column', gap: 8 }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#888', fontWeight: 700 }}>Total Compra</span>
                            <span style={{ fontSize: 13, color: '#fff', fontWeight: 800 }}>{paymentDetails['Total da Compra'] || '-'}</span>
                         </div>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#888', fontWeight: 700 }}>Total Pago</span>
                            <span style={{ fontSize: 13, color: '#10b981', fontWeight: 800 }}>{paymentDetails['Total já pago'] || '-'}</span>
                         </div>
                         <div style={{ 
                            marginTop: 4,
                            padding: '12px 16px', 
                            background: '#000', 
                            borderRadius: 12, 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            border: '2px solid #ef4444'
                         }}>
                            <div>
                                <span style={{ fontSize: 9, fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Saldo em Aberto</span>
                                <div style={{ fontSize: 22, fontWeight: 950, color: '#ef4444', marginTop: 2 }}>{paymentDetails['Saldo Pendente'] || '-'}</div>
                            </div>
                            <AlertTriangle size={24} style={{ color: '#ef4444' }} strokeWidth={2.5} />
                         </div>
                      </div>

                      {/* AÇÕES FINAIS */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                         <button style={{ 
                            padding: '14px', 
                            borderRadius: 12, 
                            background: 'var(--accent)', 
                            color: '#000', 
                            border: 'none', 
                            fontSize: 14, 
                            fontWeight: 900, 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            transition: 'transform 0.2s'
                         }} className="btn-confirm">
                            CONFIRMAR PAGAMENTO <ArrowRight size={18} strokeWidth={3} />
                         </button>
                         <button style={{ 
                            padding: '10px', 
                            borderRadius: 12, 
                            background: 'transparent', 
                            color: '#ef4444', 
                            border: '2px solid rgba(239,68,68,0.3)', 
                            fontSize: 12, 
                            fontWeight: 800, 
                            cursor: 'pointer',
                            textTransform: 'uppercase'
                         }}>
                            Cancelar Romaneio
                         </button>
                      </div>

                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '30px 20px' }}>
                      <AlertCircle size={40} style={{ color: 'var(--fg-faint)', marginBottom: 16 }} />
                      <p style={{ color: 'var(--fg-subtle)', fontWeight: 700, fontSize: 14 }}>Não conseguimos carregar os dados.</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

      </div>
      <style>{`
        .spin { animation: spin 1s linear infinite; } 
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes zeglamOrdenIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .customer-row:hover span { color: var(--accent) !important; text-decoration: underline; }
        
        .modal-solid-container {
            background-color: #0d0d0d !important;
            border: 1px solid var(--accent) !important;
        }
        
        .btn-confirm:hover {
            transform: translateY(-2px);
        }

        .modal-solid-container ::-webkit-scrollbar { width: 6px; }
        .modal-solid-container ::-webkit-scrollbar-track { background: transparent; }
        .modal-solid-container ::-webkit-scrollbar-thumb { background: #333; borderRadius: 10px; }
      `}</style>
    </div>
  );
}
