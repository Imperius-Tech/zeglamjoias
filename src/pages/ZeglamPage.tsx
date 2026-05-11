import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Banknote,
  Receipt,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboardStore } from '@/lib/store';
import { getSettings } from '@/lib/storage';
import { buildZeglamCobrarWhatsAppText } from '@/lib/zeglamCobrarTemplate';
import {
  amountMatches,
  nameFullyCompatibleWithProof,
  normalize,
  parseBrlAmount,
  phoneTail,
} from '@/lib/zeglamMatchUtils';

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
  matchTier?: 'phone_amount' | 'name_amount' | 'phone_provavel' | null;
  conversationId?: string;
  proofMessageId?: string;
  proofId?: string;
  provavelDiff?: { diffAbs: number; diffPct: number; proofValue: string | null };
}

/**
 * Extrai data/hora da coluna "Atraso" (texto vindo do scrape do Zeglam).
 * Aceita DD/MM/AAAA, traços, pontos, espaços ao redor de separadores e ISO AAAA-MM-DD.
 */
function parseAtrasoTimestamp(atraso: string): number {
  const s = String(atraso).trim().replace(/\u00a0/g, ' ');
  if (!s) return NaN;

  const fromDmy = (d: string, mo: string, y: string, hh?: string, mi?: string, sec?: string): number => {
    const day = parseInt(d, 10);
    const month = parseInt(mo, 10) - 1;
    const year = parseInt(y, 10);
    const h = hh !== undefined ? parseInt(hh, 10) : 0;
    const m = mi !== undefined ? parseInt(mi, 10) : 0;
    const s2 = sec !== undefined ? parseInt(sec, 10) : 0;
    if ([day, month, year, h, m, s2].some((n) => Number.isNaN(n))) return NaN;
    const t = new Date(year, month, day, h, m, s2, 0).getTime();
    return Number.isFinite(t) ? t : NaN;
  };

  const fromYmd = (y: string, mo: string, d: string, hh?: string, mi?: string, sec?: string): number => {
    return fromDmy(d, mo, y, hh, mi, sec);
  };

  let m = s.match(
    /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})(?:\s+(\d{1,2})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?)?/,
  );
  if (m) return fromDmy(m[1], m[2], m[3], m[4], m[5], m[6]);

  m = s.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{4})(?:\s+(\d{1,2})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?)?/);
  if (m) return fromDmy(m[1], m[2], m[3], m[4], m[5], m[6]);

  m = s.match(/(\d{4})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})(?:[T\s]+(\d{1,2})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?)?/);
  if (m) return fromYmd(m[1], m[2], m[3], m[4], m[5], m[6]);

  m = s.match(/(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})(?:\s+(\d{1,2})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?)?/);
  if (m) return fromDmy(m[1], m[2], m[3], m[4], m[5], m[6]);

  return NaN;
}

/** Número estável só para empate na ordenação — nunca usa nome do cliente. */
function pendingSortKeySid(salesId?: string): number {
  if (!salesId) return NaN;
  const n = parseInt(salesId, 10);
  return Number.isFinite(n) ? n : NaN;
}

export default function ZeglamPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [modalSalesId, setModalSalesId] = useState<string | null>(null);
  const [modalConversationId, setModalConversationId] = useState<string | null>(null);
  /** Catálogo/link da linha inadimplente (para texto da cobrança no modal). */
  const [modalCatalogo, setModalCatalogo] = useState<string | null>(null);
  /** Chave da linha ou `zeglam-modal-cobrar` enquanto envia evolution-send. */
  const [cobrarSendingKey, setCobrarSendingKey] = useState<string | null>(null);
  const [confirmPaymentLoading, setConfirmPaymentLoading] = useState(false);
  const [confirmPaymentError, setConfirmPaymentError] = useState<string | null>(null);
  /** Quando marcado (default), o POST de confirmação segue o fluxo Zeglam sem parâmetros extras. Desmarcado: tenta suprimir aviso automático ao cliente. */
  const [notifyZeglamCustomerOnConfirm, setNotifyZeglamCustomerOnConfirm] = useState(true);
  /** Aviso após confirmar com “não notificar” sem campo detectável no HTML (configure secrets ou confira o form Zeglam). */
  const [zeglamNotifyInfoBanner, setZeglamNotifyInfoBanner] = useState<string | null>(null);
  /** Comprovante que gerou o match para o cliente selecionado no modal. */
  const [modalProof, setModalProof] = useState<{
    id: string;
    media_url: string | null;
    detected_value: string | null;
    customer_name: string | null;
    created_at: string;
    payer_name?: string | null;
    bank?: string | null;
    payment_date?: string | null;
  } | null>(null);
  /** Estado de hover-zoom no preview do comprovante (origem do transform). */
  const [proofHoverZoom, setProofHoverZoom] = useState<{ active: boolean; x: number; y: number }>({ active: false, x: 50, y: 50 });
  const [error, setError] = useState<string | null>(null);
  const [pendingFilter, setPendingFilter] = useState<'todos' | 'tier1' | 'tier2' | 'tier3'>('todos');
  const [atrasoOrder, setAtrasoOrder] = useState<'recentes' | 'antigos'>('recentes');
  const [pendingPage, setPendingPage] = useState(1);
  const PENDING_PAGE_SIZE = 50;
  /** Metadata do último refresh do cache Zeglam (quando atualizado, qtde, ms). */
  const [cacheMeta, setCacheMeta] = useState<{ last_full_refresh_at: string | null; last_full_refresh_count: number | null } | null>(null);
  /** Estatísticas do Relatório Financeiro (funil dos comprovantes vs pendentes). */
  const [reportStats, setReportStats] = useState<{
    total_proofs: number; ja_confirmados: number; rejeitados: number;
    pendentes_total: number; pendentes_phone_valido: number; pendentes_jid_lid: number;
    pendentes_sem_valor: number; pendentes_com_zeglam_phone_match: number;
    pendentes_total_zeglam: number; pendentes_zeglam_com_phone: number;
    media_falhou: number; media_sem_analise: number;
  } | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
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

  type ProofIndexEntry = {
    proofKey: string;
    proof: { customer_name?: string | null; message_id?: string; conversation_id?: string; detected_value?: string | null };
    phoneTail: string;
    convId?: string;
    detectedValue?: string | null;
  };

  const fetchData = async (opts?: { quiet?: boolean; useCache?: boolean }) => {
    const quiet = opts?.quiet === true;
    const useCache = opts?.useCache !== false; // default true: ler cache primeiro pra UI instantânea
    if (!quiet) setRefreshing(true);
    setError(null);
    try {
      let pendingList: any[] = [];
      let phonesMap: Record<string, { phone_digits: string | null; customer_name: string | null }> = {};
      let cacheHit = false;

      if (useCache) {
        const { data: cached } = await supabase
          .from('zeglam_pending_cache')
          .select('sales_id, cliente, valor, atraso, catalogo, status_type, phone_digits, customer_name_zeglam')
          .order('fetched_at', { ascending: false });
        if (cached && cached.length > 0) {
          pendingList = cached.map((c) => ({
            salesId: c.sales_id,
            cliente: c.cliente,
            valor: c.valor,
            atraso: c.atraso,
            catalogo: c.catalogo,
            statusType: c.status_type,
          }));
          for (const c of cached) {
            phonesMap[c.sales_id] = {
              phone_digits: c.phone_digits,
              customer_name: c.customer_name_zeglam,
            };
          }
          cacheHit = true;
        }
      }

      // Sem cache: scrape ao vivo (lento mas garantido)
      if (!cacheHit) {
        const { data: allData, error: functionError } = await supabase.functions.invoke('zeglam-api', {
          body: { action: 'get_all' }
        });
        if (functionError) throw new Error(functionError.message);
        pendingList = allData?.pending || [];
        const salesIds = pendingList.map((p: any) => p.salesId).filter(Boolean);
        if (salesIds.length > 0) {
          const enrichRes = await supabase.functions.invoke('zeglam-api', { body: { action: 'enrich_phones', salesIds } });
          phonesMap = (enrichRes.data || {}) as Record<string, { phone_digits: string | null; customer_name: string | null }>;
        }
      }

      // Cruzamento sempre lê comprovantes/conversas direto do DB (rápido)
      const [proofsRes, convsRes] = await Promise.all([
        supabase.from('payment_proofs')
          .select('id, customer_name, message_id, conversation_id, detected_value, created_at, status, auto_matched_sales_id, auto_match_tier')
          .neq('status', 'rejeitado')
          .order('created_at', { ascending: false }),
        supabase.from('conversations').select('id, customer_name, customer_phone'),
      ]);
      const proofs = proofsRes.data || [];
      const conversations = convsRes.data || [];

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

      /** Telefone WhatsApp compatível + valor dentro da tolerância 1% (best-match por menor diff). */
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

      /** Tier 1.5: phone bate + valor com diff entre 1% e 10% (NÃO baixa auto, só sinaliza pra revisão humana). */
      const tryPhoneProvavel = (
        consumed: Set<string>,
        customer: any,
        enrich: { phone_digits?: string | null; customer_name?: string | null } | null,
      ): { entry: ProofIndexEntry; diffAbs: number; diffPct: number } | null => {
        const zeglamPhoneTail = phoneTail(enrich?.phone_digits || '');
        if (zeglamPhoneTail.length < 8) return null;
        const zeglamAmount = parseBrlAmount(customer.valor);
        if (zeglamAmount == null || zeglamAmount <= 0) return null;
        const candidates = proofIndex.filter(
          (entry) =>
            !consumed.has(entry.proofKey) &&
            entry.phoneTail.length >= 8 &&
            (entry.phoneTail.endsWith(zeglamPhoneTail) || zeglamPhoneTail.endsWith(entry.phoneTail)),
        );
        let best: { entry: ProofIndexEntry; diffAbs: number; diffPct: number } | null = null;
        for (const entry of candidates) {
          const proofAmount = parseBrlAmount(entry.detectedValue || '');
          if (proofAmount == null) continue;
          const diffSigned = proofAmount - zeglamAmount;
          const diffAbs = Math.abs(diffSigned);
          const ratio = diffAbs / zeglamAmount;
          if (ratio > 0.01 && ratio <= 0.10) {
            // diffPct preserva sinal: positivo = pagou a mais; negativo = pagou a menos
            const diffPct = diffSigned / zeglamAmount;
            if (!best || diffAbs < best.diffAbs) best = { entry, diffAbs, diffPct };
          }
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
        matchTier: null | 'phone_amount' | 'name_amount' | 'phone_provavel';
        enrich: { phone_digits?: string | null; customer_name?: string | null } | null;
        provavelDiff?: { diffAbs: number; diffPct: number; proofValue: string | null };
      };

      const rowResults = pendingList.map((customer: any): RowResult => {
        const enrich = customer.salesId ? phonesMap[customer.salesId] : null;

        // Tier 0: shortcut auto-match (proof.auto_matched_sales_id === customer.salesId)
        let matched: ProofIndexEntry | null = null;
        let tier: RowResult['matchTier'] = null;
        let provavelDiff: RowResult['provavelDiff'];
        if (customer.salesId) {
          const autoMatched = proofIndex.find((p) =>
            !consumedProofs.has(p.proofKey) &&
            (p.proof as any)?.auto_matched_sales_id === customer.salesId,
          );
          if (autoMatched) {
            matched = autoMatched;
            const autoTier = (autoMatched.proof as any)?.auto_match_tier;
            if (autoTier === 'phone_amount') tier = 'phone_amount';
            else if (autoTier === 'name_amount' || autoTier === 'payer_name_amount') tier = 'name_amount';
            else if (autoTier === 'phone_provavel') tier = 'phone_provavel';
            else tier = 'phone_amount';
          }
        }

        if (!matched) {
          matched = tryPhoneAndAmountMatch(new Set(consumedProofs), customer, enrich);
          if (matched) tier = 'phone_amount';
          else {
            matched = tryNameAndAmountMatch(consumedProofs, customer, enrich);
            if (matched) tier = 'name_amount';
          }
        }

        // Tier 1.5: se ainda não bateu, tenta match provável (phone + diff 1-10%)
        if (!matched) {
          const provavel = tryPhoneProvavel(new Set(consumedProofs), customer, enrich);
          if (provavel) {
            matched = provavel.entry;
            tier = 'phone_provavel';
            provavelDiff = {
              diffAbs: provavel.diffAbs,
              diffPct: provavel.diffPct,
              proofValue: provavel.entry.detectedValue ?? null,
            };
          }
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
          proofId: matched?.proofKey,
          provavelDiff: rowResults[idx].provavelDiff,
        };
      });

      console.log('[Zeglam Match Debug]', {
        totalCandidatesByPhone: debugMatches.length,
        consumedProofKeys: consumedProofs.size,
        sample: debugMatches.slice(0, 30),
      });
      // payments sempre vem vazio do zeglam-api atual; mantém fallback se algum dia voltar
      setPayments([]);
      setPendingCustomers(crossedPending);

      // Carrega meta do cache (não bloqueia render principal)
      supabase
        .from('zeglam_cache_meta')
        .select('last_full_refresh_at, last_full_refresh_count')
        .eq('id', 1)
        .maybeSingle()
        .then(({ data }) => { if (data) setCacheMeta(data as any); });
    } catch (e: any) {
      console.error('Error fetching Zeglam data:', e);
      setError(e.message || 'Erro ao conectar com o sistema Zeglam.');
    } finally {
      setLoading(false);
      if (!quiet) setRefreshing(false);
    }
  };

  const loadReportStats = async () => {
    setReportLoading(true);
    try {
      // 1) Stats de proofs
      const { data: proofsAll } = await supabase
        .from('payment_proofs')
        .select('id, status, detected_value, conversation_id');
      const proofs = proofsAll || [];
      const total_proofs = proofs.length;
      const ja_confirmados = proofs.filter((p: any) => p.status === 'confirmado').length;
      const rejeitados = proofs.filter((p: any) => p.status === 'rejeitado').length;
      const pendentes_total = proofs.filter((p: any) => p.status === 'pendente').length;
      const pendentes_sem_valor = proofs.filter((p: any) => p.status === 'pendente' && !(/R\$?\s*[\d.,]+/.test(String(p.detected_value || '')))).length;

      // 2) Conversations dos proofs pendentes pra contar phones validos
      const pendingConvIds = proofs.filter((p: any) => p.status === 'pendente').map((p: any) => p.conversation_id);
      let pendentes_phone_valido = 0;
      let pendentes_jid_lid = 0;
      let pendentes_com_zeglam_phone_match = 0;
      if (pendingConvIds.length) {
        const { data: convs } = await supabase
          .from('conversations')
          .select('id, customer_phone, whatsapp_jid')
          .in('id', pendingConvIds);
        const convArr = convs || [];
        pendentes_phone_valido = convArr.filter((c: any) => typeof c.whatsapp_jid === 'string' && c.whatsapp_jid.endsWith('@s.whatsapp.net')).length;
        pendentes_jid_lid = convArr.filter((c: any) => typeof c.whatsapp_jid === 'string' && c.whatsapp_jid.endsWith('@lid')).length;

        // Carrega tails 8 dos pendentes Zeglam pra cruzar
        const { data: zeg } = await supabase
          .from('zeglam_pending_cache')
          .select('phone_digits')
          .not('phone_digits', 'is', null);
        const zegTails = new Set<string>();
        for (const z of (zeg || [])) {
          const d = String((z as any).phone_digits || '').slice(-8);
          if (d.length === 8) zegTails.add(d);
        }
        for (const c of convArr) {
          if (typeof c.whatsapp_jid !== 'string' || !c.whatsapp_jid.endsWith('@s.whatsapp.net')) continue;
          const tail = String(c.customer_phone || '').replace(/\D/g, '').slice(-8);
          if (tail.length === 8 && zegTails.has(tail)) pendentes_com_zeglam_phone_match++;
        }
      }

      // 3) Stats Zeglam pending cache
      const { count: pendentes_total_zeglam } = await supabase
        .from('zeglam_pending_cache')
        .select('*', { count: 'exact', head: true });
      const { count: pendentes_zeglam_com_phone } = await supabase
        .from('zeglam_pending_cache')
        .select('*', { count: 'exact', head: true })
        .not('phone_digits', 'is', null);

      // 4) Mídias com erro/null análise
      const { count: media_falhou } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('author', 'cliente')
        .in('media_type', ['image', 'document'])
        .not('media_url', 'is', null)
        .filter('media_analysis->>error', 'not.is', null);
      const { count: media_sem_analise } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('author', 'cliente')
        .in('media_type', ['image', 'document'])
        .not('media_url', 'is', null)
        .is('media_analysis', null);

      setReportStats({
        total_proofs, ja_confirmados, rejeitados, pendentes_total,
        pendentes_phone_valido, pendentes_jid_lid, pendentes_sem_valor,
        pendentes_com_zeglam_phone_match,
        pendentes_total_zeglam: pendentes_total_zeglam || 0,
        pendentes_zeglam_com_phone: pendentes_zeglam_com_phone || 0,
        media_falhou: media_falhou || 0,
        media_sem_analise: media_sem_analise || 0,
      });
    } catch (e) {
      console.error('loadReportStats:', e);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => { if (activeTab === 'financeiro' && !reportStats) void loadReportStats(); }, [activeTab]);

  // Deep-link: ?openSales=XXXX abre modal pagamento direto. Usado por ComprovantesPage.
  const deepLinkHandledRef = useRef<string | null>(null);
  useEffect(() => {
    const openSales = searchParams.get('openSales');
    if (!openSales) return;
    if (deepLinkHandledRef.current === openSales) return;
    if (loading || pendingCustomers.length === 0) return;
    deepLinkHandledRef.current = openSales;
    setActiveTab('inadimplentes');
    const row = pendingCustomers.find((c) => String(c.salesId) === String(openSales));
    const convId = row?.conversationId ?? null;
    void handleCustomerClick(String(openSales), convId);
    // Limpa query params apos abrir
    const next = new URLSearchParams(searchParams);
    next.delete('openSales');
    next.delete('proofId');
    setSearchParams(next, { replace: true });
  }, [searchParams, loading, pendingCustomers, setSearchParams]);

  const closePaymentModal = () => {
    setIsModalOpen(false);
    setModalSalesId(null);
    setModalConversationId(null);
    setModalCatalogo(null);
    setConfirmPaymentError(null);
    setConfirmPaymentLoading(false);
    setPaymentDetails(null);
    setDetailLoading(false);
    setNotifyZeglamCustomerOnConfirm(true);
    setModalProof(null);
    setProofHoverZoom({ active: false, x: 50, y: 50 });
  };

  const sendZeglamCobrarWhatsApp = async (opts: {
    conversationId: string;
    cliente: string;
    catalogo?: string | null;
    sendingKey: string;
  }) => {
    const { conversationId, cliente, catalogo, sendingKey } = opts;
    const settings = await getSettings();
    const pixKey = settings.store.pixKey?.trim() ?? '';
    const pixHolderName = settings.store.pixHolderName?.trim() ?? '';
    const payment =
      pixKey && pixHolderName ? { pixKey, pixHolderName } : null;
    const text = buildZeglamCobrarWhatsAppText(
      cliente,
      catalogo?.trim() ? catalogo.trim() : null,
      payment,
    );
    const linkPreview = catalogo?.trim()
      ? `«${catalogo.trim().slice(0, 120)}${catalogo.trim().length > 120 ? '…' : ''}»`
      : 'texto genérico no link (sem catálogo na linha)';
    const pixPreview = payment
      ? `Dados de pagamento: Pix ${pixKey.slice(0, 28)}${pixKey.length > 28 ? '…' : ''} · ${pixHolderName.slice(0, 40)}${pixHolderName.length > 40 ? '…' : ''}`
      : 'Sem dados de pagamento na mensagem (configure Chave PIX e Titular em Configurações → Perfil da Loja).';
    if (
      !window.confirm(
        `Enviar mensagem de cobrança por WhatsApp para ${cliente}?\n\nCatálogo/link: ${linkPreview}\n\n${pixPreview}`,
      )
    )
      return;
    setCobrarSendingKey(sendingKey);
    try {
      const { error } = await supabase.functions.invoke('evolution-send', {
        body: { conversationId, text },
      });
      if (error) throw error;
    } catch (e) {
      console.error('evolution-send cobrar (Zeglam):', e);
      window.alert('Não foi possível enviar a cobrança. Verifique a instância Evolution e tente de novo.');
    } finally {
      setCobrarSendingKey(null);
    }
  };

  const handleCustomerClick = async (salesId: string, conversationId?: string | null) => {
    setModalSalesId(salesId);
    setModalConversationId(conversationId ?? null);
    const row = pendingCustomers.find((c) => String(c.salesId) === String(salesId));
    setModalCatalogo(row?.catalogo ?? null);
    setConfirmPaymentError(null);
    setNotifyZeglamCustomerOnConfirm(true);
    setZeglamNotifyInfoBanner(null);
    setIsModalOpen(true);
    setDetailLoading(true);
    setPaymentDetails(null);
    setModalProof(null);

    // Busca comprovante pelo UUID (não bloqueia o modal)
    const proofId = row?.proofId;
    if (proofId && typeof proofId === 'string' && !proofId.includes(':')) {
      void (async () => {
        try {
          const { data: pf } = await supabase
            .from('payment_proofs')
            .select('id, media_url, detected_value, customer_name, created_at')
            .eq('id', proofId)
            .maybeSingle();
          if (!pf) return;
          setModalProof({ ...pf, payer_name: null, bank: null, payment_date: null });
        } catch { /* preview é não-crítico */ }
      })();
    }

    try {
      const { data: details, error: detailError } = await supabase.functions.invoke('zeglam-api', {
        body: { action: 'get_payment_details', salesId }
      });
      if (detailError) throw detailError;
      setPaymentDetails(details as Record<string, string>);
    } catch (e) {
      console.error('Error fetching payment details:', e);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!modalSalesId) return;
    if (!paymentDetails?.['Saldo Pendente']) {
      setConfirmPaymentError('Carregue os detalhes do pagamento antes de confirmar.');
      return;
    }
    setConfirmPaymentLoading(true);
    setConfirmPaymentError(null);
    try {
      const saldo = paymentDetails['Saldo Pendente'];
      const { data, error } = await supabase.functions.invoke('zeglam-api', {
        body: {
          action: 'confirm_payment',
          salesId: modalSalesId,
          openAmount: saldo,
          totalPay: saldo,
          percentualEntrada: 100,
          notifyCustomer: notifyZeglamCustomerOnConfirm,
        },
      });
      if (error) {
        const body = data as { error?: string } | undefined;
        throw new Error(body?.error || error.message);
      }
      const body = data as {
        success?: boolean;
        status?: number;
        pathUsed?: string;
        preview?: string;
        stillInPendingList?: boolean;
        clientNotifySuppressionUnconfigured?: boolean;
        attemptLog?: { path: string; jwtSource: string; variant?: string; status: number; ok: boolean; stillPending?: boolean }[];
        error?: string;
      };
      if (body?.error) throw new Error(body.error);
      if (!body?.success) {
        if (body?.stillInPendingList) {
          const logLine =
            body.attemptLog
              ?.map(
                (a) =>
                  `${a.variant || a.path} → ${a.status}${a.stillPending === true ? ' (ainda pendente)' : a.stillPending === false ? ' (ok)' : ''}`,
              )
              .join(' · ') ?? '';
          throw new Error(
            'O POST /services/virtualcatalog (setAsPaid) foi aceito, mas a venda ainda aparece como pendente. ' +
              (logLine ? `Resumo: ${logLine}. ` : '') +
              'Confirme no Zeglam se o valor enviado (saldo em aberto) coincide com o esperado.',
          );
        }
        const logLine =
          body?.attemptLog?.map((a) => `${a.variant || a.path} (${a.jwtSource}) → ${a.status}`).join(' · ') ?? '';
        throw new Error(
          `O Zeglam não confirmou o pagamento (HTTP ${body?.status ?? '?'}, ${body?.pathUsed ?? '?'}). ` +
            (logLine ? `Detalhe: ${logLine}. ` : '') +
            'Se o erro persistir, copie da Rede o POST **services/virtualcatalog** ao confirmar (Payload, JWT redigido).',
        );
      }
      const confirmedSid = modalSalesId;
      if (body?.clientNotifySuppressionUnconfigured) {
        setZeglamNotifyInfoBanner(
          'Pagamento registrado. Não foi possível garantir que o aviso automático ao cliente fique desligado — ele pode ainda ser enviado.',
        );
      } else {
        setZeglamNotifyInfoBanner(null);
      }
      closePaymentModal();
      if (confirmedSid) {
        setPendingCustomers((prev) => prev.filter((c) => String(c.salesId) !== String(confirmedSid)));
      }
      void fetchData({ quiet: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao confirmar pagamento.';
      setConfirmPaymentError(msg);
    } finally {
      setConfirmPaymentLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const counts = {
    todos: pendingCustomers.length,
    tier1: pendingCustomers.filter(c => c.matchTier === 'phone_amount').length,
    tier2: pendingCustomers.filter(c => c.matchTier === 'name_amount').length,
    tier3: pendingCustomers.filter(c => c.matchTier === 'phone_provavel').length,
  };

  const filteredPending = useMemo(() => {
    const filtered = pendingCustomers.filter((customer) => {
      const matchesSearch =
        normalize(customer.cliente).includes(normalize(searchText)) ||
        normalize(customer.catalogo).includes(normalize(searchText));
      // TIER 1 = phone+valor exato (≤1%)
      if (pendingFilter === 'tier1') return matchesSearch && customer.matchTier === 'phone_amount';
      // TIER 2 = nome+valor exato (sem phone)
      if (pendingFilter === 'tier2') return matchesSearch && customer.matchTier === 'name_amount';
      // TIER 3 = phone+valor próximo (1-10%) - revisar manual
      if (pendingFilter === 'tier3') return matchesSearch && customer.matchTier === 'phone_provavel';
      return matchesSearch;
    });

    const withSortKey = filtered.map((c, idx) => ({
      row: c,
      idx,
      ts: parseAtrasoTimestamp(c.atraso),
      sid: pendingSortKeySid(c.salesId),
    }));

    withSortKey.sort((a, b) => {
      const aBad = Number.isNaN(a.ts);
      const bBad = Number.isNaN(b.ts);
      if (aBad && bBad) {
        const asn = Number.isNaN(a.sid) ? a.idx : a.sid;
        const bsn = Number.isNaN(b.sid) ? b.idx : b.sid;
        return asn - bsn;
      }
      if (aBad) return 1;
      if (bBad) return -1;
      if (a.ts !== b.ts) {
        return atrasoOrder === 'recentes' ? b.ts - a.ts : a.ts - b.ts;
      }
      if (!Number.isNaN(a.sid) && !Number.isNaN(b.sid) && a.sid !== b.sid) return a.sid - b.sid;
      return a.idx - b.idx;
    });

    return withSortKey.map((x) => x.row);
  }, [pendingCustomers, searchText, pendingFilter, atrasoOrder]);

  const totalPendingPages = Math.max(1, Math.ceil(filteredPending.length / PENDING_PAGE_SIZE));
  const currentPage = Math.min(pendingPage, totalPendingPages);
  const pagedPending = useMemo(
    () => filteredPending.slice((currentPage - 1) * PENDING_PAGE_SIZE, currentPage * PENDING_PAGE_SIZE),
    [filteredPending, currentPage],
  );

  useEffect(() => { setPendingPage(1); }, [searchText, pendingFilter, atrasoOrder]);

  /** KPIs do topo: total inadimplência R$, qtd Tier 1/2/3, oldest atraso. */
  const kpiData = useMemo(() => {
    const totalValor = pendingCustomers.reduce((acc, c) => acc + (parseBrlAmount(c.valor) || 0), 0);
    const tier1 = pendingCustomers.filter(c => c.matchTier === 'phone_amount').length;
    const tier2 = pendingCustomers.filter(c => c.matchTier === 'name_amount').length;
    const tier3 = pendingCustomers.filter(c => c.matchTier === 'phone_provavel').length;
    const comProof = tier1 + tier2;
    const provavel = tier3;
    const semProof = pendingCustomers.length - comProof - provavel;
    const pctMatch = pendingCustomers.length ? Math.round((comProof / pendingCustomers.length) * 100) : 0;
    let oldestDays = 0;
    for (const c of pendingCustomers) {
      const ts = parseAtrasoTimestamp(c.atraso);
      if (!Number.isNaN(ts)) {
        const days = Math.floor((Date.now() - ts) / 86400000);
        if (days > oldestDays) oldestDays = days;
      }
    }
    return {
      totalValor,
      totalCount: pendingCustomers.length,
      tier1, tier2, tier3,
      comProof,
      provavel,
      semProof,
      pctMatch,
      oldestDays,
    };
  }, [pendingCustomers]);

  /** "Atualizado há X min" baseado em cacheMeta.last_full_refresh_at. */
  const cacheAgeLabel = useMemo(() => {
    if (!cacheMeta?.last_full_refresh_at) return null;
    const ageMs = Date.now() - new Date(cacheMeta.last_full_refresh_at).getTime();
    const min = Math.floor(ageMs / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    return `há ${h}h`;
  }, [cacheMeta]);

  if (loading) return (
    <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ height: 32, width: 240, borderRadius: 8, background: 'var(--glass)', marginBottom: 8 }} />
      <div style={{ height: 14, width: 320, borderRadius: 6, background: 'var(--glass)', marginBottom: 24, opacity: 0.6 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ padding: 16, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)', height: 80 }}>
            <div style={{ height: 10, width: 80, background: 'var(--surface-2)', borderRadius: 4, marginBottom: 12 }} />
            <div style={{ height: 22, width: 120, background: 'var(--surface-2)', borderRadius: 4 }} />
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--glass)', borderRadius: 14, border: '1px solid var(--border)', padding: 16 }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < 6 ? '1px solid var(--border)' : 'none', opacity: 1 - (i * 0.1) }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-2)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 12, width: '60%', background: 'var(--surface-2)', borderRadius: 4, marginBottom: 6 }} />
              <div style={{ height: 10, width: '40%', background: 'var(--surface-2)', borderRadius: 4, opacity: 0.6 }} />
            </div>
            <div style={{ height: 14, width: 80, background: 'var(--surface-2)', borderRadius: 4 }} />
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--fg-subtle)', textAlign: 'center', marginTop: 16 }}>
        <Loader size={12} className="spin" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />
        Carregando inadimplentes...
      </p>
    </div>
  );

  return (
    <div className="zeglam-page" style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        
        {/* Header Dashboard */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--strong-text)', margin: 0 }}>Dashboard Zeglam</h1>
            <p style={{ fontSize: 12, color: 'var(--fg-subtle)', margin: '2px 0 0' }}>Conferência de pagamentos e inadimplência</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={async () => {
              setRefreshing(true);
              try {
                await supabase.functions.invoke('zeglam-cache-refresh', { body: { mode: 'pending_only' } });
              } catch {}
              await fetchData({ useCache: true });
            }} disabled={refreshing} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, background: 'var(--glass)', border: '1px solid var(--border)', cursor: refreshing ? 'wait' : 'pointer', color: 'var(--fg-muted)', fontSize: 12, fontWeight: 600 }}>
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Buscando...' : 'Atualizar'}
            </button>
            <a href="https://zeglam.semijoias.net/admin/" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, background: 'var(--accent)', color: '#000', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              <ExternalLink size={14} /> Sistema Original
            </a>
          </div>
        </div>

        {error && <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}><AlertCircle size={18} /><p style={{ margin: 0, fontSize: 12 }}>{error}</p></div>}
        {zeglamNotifyInfoBanner && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              background: 'rgba(251,191,36,0.1)',
              border: '1px solid rgba(251,191,36,0.35)',
              color: '#fbbf24',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              marginBottom: 20,
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>{zeglamNotifyInfoBanner}</p>
            <button
              type="button"
              onClick={() => setZeglamNotifyInfoBanner(null)}
              aria-label="Fechar aviso"
              style={{
                marginLeft: 'auto',
                flexShrink: 0,
                background: 'transparent',
                border: 'none',
                color: '#fbbf24',
                cursor: 'pointer',
                padding: 4,
                lineHeight: 1,
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

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
                    {p.conversationId ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flexShrink: 0, justifyContent: 'flex-end' }}>
                        <button onClick={async () => { await selectConversation(p.conversationId!); navigate('/conversas'); }} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-dim)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <MessageSquare size={12} /> Ver conversa
                        </button>
                        <button
                          type="button"
                          title="Enviar template de cobrança (WhatsApp)"
                          disabled={!!cobrarSendingKey}
                          onClick={() => {
                            const key = `conf-${p.salesId ?? i}`;
                            void sendZeglamCobrarWhatsApp({
                              conversationId: p.conversationId!,
                              cliente: p.cliente,
                              catalogo: p.catalogo,
                              sendingKey: key,
                            });
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 8,
                            background: 'rgba(251,191,36,0.12)',
                            border: '1px solid rgba(251,191,36,0.4)',
                            color: '#fbbf24',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: cobrarSendingKey ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            flexShrink: 0,
                            opacity: cobrarSendingKey && cobrarSendingKey !== `conf-${p.salesId ?? i}` ? 0.5 : 1,
                          }}
                        >
                          {cobrarSendingKey === `conf-${p.salesId ?? i}` ? (
                            <Loader size={12} className="spin" />
                          ) : (
                            <Banknote size={12} />
                          )}
                          Cobrar
                        </button>
                      </div>
                    ) : null}
                    {p.salesId && (
                      <button onClick={() => handleCustomerClick(p.salesId!, p.conversationId)} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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
            {/* KPIs */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}>
              <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Inadimplência total</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444' }}>
                  R$ {kpiData.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 2 }}>{kpiData.totalCount} clientes</div>
              </div>

              <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }} title="Telefone do WhatsApp bate com cadastro + valor exato. Match seguro.">
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--emerald-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Confirmados</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--emerald-light)' }}>{kpiData.tier1}</div>
                <div style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 2 }}>match seguro</div>
              </div>

              <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)' }} title="Nome bate + valor exato (telefone divergiu).">
                <div style={{ fontSize: 10, fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Prováveis</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#3b82f6' }}>{kpiData.tier2}</div>
                <div style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 2 }}>conferir antes</div>
              </div>

              <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }} title="Telefone bate, mas valor difere 1-10%. Revisar manualmente antes de dar baixa.">
                <div style={{ fontSize: 10, fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Revisar</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fbbf24' }}>{kpiData.tier3}</div>
                <div style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 2 }}>valor com diferença</div>
              </div>

              <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Maior atraso</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: kpiData.oldestDays > 90 ? '#ef4444' : '#f59e0b' }}>
                  {kpiData.oldestDays > 0 ? `${kpiData.oldestDays}d` : '—'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 2 }}>
                  {cacheAgeLabel ? `dados atualizados ${cacheAgeLabel}` : 'cache não configurado'}
                </div>
              </div>
            </div>

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
                <button onClick={() => setPendingFilter('todos')} title="Todos os pendentes" style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: pendingFilter === 'todos' ? 'var(--surface-3)' : 'transparent', color: pendingFilter === 'todos' ? 'var(--strong-text)' : 'var(--fg-muted)', border: 'none', cursor: 'pointer' }}>TODOS ({counts.todos})</button>
                <button onClick={() => setPendingFilter('tier1')} title="Telefone do WhatsApp bate com cadastro + valor exato. Match mais seguro." style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: pendingFilter === 'tier1' ? 'rgba(16,185,129,0.18)' : 'transparent', color: pendingFilter === 'tier1' ? 'var(--emerald-light)' : 'var(--fg-muted)', border: 'none', cursor: 'pointer' }}>CONFIRMADO ({counts.tier1})</button>
                <button onClick={() => setPendingFilter('tier2')} title="Nome do cliente bate + valor exato (telefone divergiu)." style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: pendingFilter === 'tier2' ? 'rgba(59,130,246,0.18)' : 'transparent', color: pendingFilter === 'tier2' ? '#3b82f6' : 'var(--fg-muted)', border: 'none', cursor: 'pointer' }}>PROVÁVEL ({counts.tier2})</button>
                <button onClick={() => setPendingFilter('tier3')} title="Telefone bate, mas valor está com 1-10% de diferença. Revisar antes de baixar." style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: pendingFilter === 'tier3' ? 'rgba(251,191,36,0.18)' : 'transparent', color: pendingFilter === 'tier3' ? '#fbbf24' : 'var(--fg-muted)', border: 'none', cursor: 'pointer' }}>REVISAR ({counts.tier3})</button>
              </div>
            </div>

            <div style={{ background: 'var(--glass)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead><tr style={{ background: 'var(--surface-2)' }}><th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase' }}>Cliente</th><th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase' }}>Cruzamento</th><th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase' }}>Atraso</th><th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase', textAlign: 'right' }}>Valor</th><th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase', textAlign: 'center' }}>Ações</th></tr></thead>
                  <tbody>{pagedPending.map((item, i) => (<tr key={i} style={{ borderBottom: i < pagedPending.length - 1 ? '1px solid var(--border)' : 'none' }}><td data-label="Cliente" style={{ padding: '12px 20px' }}>
                    <div
                      onClick={() => item.salesId && handleCustomerClick(item.salesId, item.conversationId)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: item.salesId ? 'pointer' : 'default' }}
                      className="customer-row"
                    >
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}><UserX size={12} /></div>
                      <div><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)' }}>{item.cliente}</span><ChevronRight size={10} style={{ color: 'var(--fg-faint)' }} /></div><div style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>{item.catalogo}</div></div>
                    </div>
                  </td><td data-label="Cruzamento" style={{ padding: '12px 20px' }}>{item.hasProof ? (item.matchTier === 'phone_amount' ? (<div title="Confirmado: telefone do WhatsApp bate com cadastro + valor exato" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: 'rgba(16,185,129,0.12)', color: 'var(--emerald-light)', fontSize: 10, fontWeight: 800, border: '1px solid rgba(16,185,129,0.3)' }}><FileCheck size={10} /> CONFIRMADO</div>) : item.matchTier === 'name_amount' ? (<div title="Provável: nome do cliente bate + valor exato (telefone divergiu)" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.12)', color: '#3b82f6', fontSize: 10, fontWeight: 800, border: '1px solid rgba(59,130,246,0.3)' }}><FileCheck size={10} /> PROVÁVEL</div>) : item.matchTier === 'phone_provavel' ? (<div title={item.provavelDiff ? `Revisar: telefone bate, mas valor com ${item.provavelDiff.diffPct >= 0 ? '+' : ''}${(item.provavelDiff.diffPct * 100).toFixed(1)}% (R$ ${item.provavelDiff.diffAbs.toFixed(2)}). Confira antes de dar baixa.` : 'Revisar: telefone bate, valor com diferença'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', fontSize: 10, fontWeight: 800, border: '1px solid rgba(251,191,36,0.45)', cursor: 'help' }}><FileCheck size={10} /> REVISAR{item.provavelDiff ? ` (${item.provavelDiff.diffPct >= 0 ? '+' : ''}${(item.provavelDiff.diffPct * 100).toFixed(1)}%)` : ''}</div>) : (<div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontSize: 10, fontWeight: 800 }}><FileCheck size={10} /> BATENDO</div>)) : (<span style={{ fontSize: 10, color: 'var(--fg-faint)', fontWeight: 600 }}>NÃO ENCONTRADO</span>)}</td><td data-label="Atraso" style={{ padding: '12px 20px' }}><span style={{ fontSize: 11, fontWeight: 600, color: item.statusType === 'danger' ? '#ef4444' : '#f59e0b' }}>{item.atraso}</span>                  </td><td data-label="Valor" style={{ padding: '12px 20px', textAlign: 'right' }}><div style={{ fontSize: 13, fontWeight: 800, color: '#ef4444' }}>{item.valor}</div></td><td data-label="Ações" style={{ padding: '12px 20px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                      {item.conversationId ? (
                        <>
                          <button
                            type="button"
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
                          <button
                            type="button"
                            title="Enviar template de cobrança (WhatsApp)"
                            disabled={!!cobrarSendingKey}
                            onClick={(e) => {
                              e.stopPropagation();
                              const key = `inad-${String(item.salesId ?? '')}-${String(item.conversationId)}-${i}`;
                              void sendZeglamCobrarWhatsApp({
                                conversationId: item.conversationId!,
                                cliente: item.cliente,
                                catalogo: item.catalogo,
                                sendingKey: key,
                              });
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '6px 10px',
                              borderRadius: 8,
                              background: 'rgba(251,191,36,0.12)',
                              border: '1px solid rgba(251,191,36,0.4)',
                              color: '#fbbf24',
                              fontSize: 10,
                              fontWeight: 800,
                              cursor: cobrarSendingKey ? 'wait' : 'pointer',
                              opacity:
                                cobrarSendingKey &&
                                cobrarSendingKey !== `inad-${String(item.salesId ?? '')}-${String(item.conversationId)}-${i}`
                                  ? 0.45
                                  : 1,
                            }}
                          >
                            {cobrarSendingKey === `inad-${String(item.salesId ?? '')}-${String(item.conversationId)}-${i}` ? (
                              <Loader size={11} className="spin" />
                            ) : (
                              <Banknote size={11} />
                            )}
                            COBRAR
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>—</span>
                      )}
                    </div>
                  </td></tr>))}</tbody>
                </table>
              </div>
              {filteredPending.length > PENDING_PAGE_SIZE && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)',
                  fontSize: 11, color: 'var(--fg-muted)', flexWrap: 'wrap', gap: 10,
                }}>
                  <span>
                    Mostrando <strong style={{ color: 'var(--strong-text)' }}>{(currentPage - 1) * PENDING_PAGE_SIZE + 1}</strong>
                    {' – '}
                    <strong style={{ color: 'var(--strong-text)' }}>{Math.min(currentPage * PENDING_PAGE_SIZE, filteredPending.length)}</strong>
                    {' de '}
                    <strong style={{ color: 'var(--strong-text)' }}>{filteredPending.length}</strong>
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setPendingPage(1)}
                      disabled={currentPage === 1}
                      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--glass)', color: currentPage === 1 ? 'var(--fg-faint)' : 'var(--fg-dim)', fontSize: 11, fontWeight: 700, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                    >«</button>
                    <button
                      type="button"
                      onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--glass)', color: currentPage === 1 ? 'var(--fg-faint)' : 'var(--fg-dim)', fontSize: 11, fontWeight: 700, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                    >‹ Anterior</button>
                    <span style={{ padding: '0 8px', fontSize: 11, fontWeight: 700, color: 'var(--strong-text)' }}>
                      {currentPage} / {totalPendingPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingPage((p) => Math.min(totalPendingPages, p + 1))}
                      disabled={currentPage === totalPendingPages}
                      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--glass)', color: currentPage === totalPendingPages ? 'var(--fg-faint)' : 'var(--fg-dim)', fontSize: 11, fontWeight: 700, cursor: currentPage === totalPendingPages ? 'not-allowed' : 'pointer' }}
                    >Próxima ›</button>
                    <button
                      type="button"
                      onClick={() => setPendingPage(totalPendingPages)}
                      disabled={currentPage === totalPendingPages}
                      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--glass)', color: currentPage === totalPendingPages ? 'var(--fg-faint)' : 'var(--fg-dim)', fontSize: 11, fontWeight: 700, cursor: currentPage === totalPendingPages ? 'not-allowed' : 'pointer' }}
                    >»</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'financeiro' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--strong-text)', marginBottom: 4 }}>Diagnóstico de Cruzamento Comprovantes ↔ Zeglam</h2>
              <p style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                Por que aparecem só ~13 matches dos 500+ comprovantes? Aqui está o funil real.
              </p>
              <button onClick={() => loadReportStats()} disabled={reportLoading} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-dim)', fontSize: 11, fontWeight: 600, cursor: reportLoading ? 'wait' : 'pointer' }}>
                {reportLoading ? 'Calculando...' : 'Atualizar relatório'}
              </button>
            </div>

            {!reportStats && !reportLoading && (
              <p style={{ fontSize: 13, color: 'var(--fg-subtle)', padding: 24, textAlign: 'center' }}>Clique em "Atualizar relatório" para calcular.</p>
            )}

            {reportLoading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                <Loader size={20} className="spin" style={{ color: 'var(--accent)' }} />
              </div>
            )}

            {reportStats && (
              <>
                {/* Funil de Comprovantes */}
                <div style={{ background: 'var(--glass)', borderRadius: 14, border: '1px solid var(--border)', padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--strong-text)', marginBottom: 14 }}>📊 Funil dos {reportStats.total_proofs} comprovantes recebidos</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { label: `Total recebido`, val: reportStats.total_proofs, pct: 100, color: '#3b82f6', note: 'Todos comprovantes detectados pela IA via WhatsApp' },
                      { label: `Já confirmados (Zevaldo deu baixa no Supabase)`, val: reportStats.ja_confirmados, pct: Math.round(reportStats.ja_confirmados / reportStats.total_proofs * 100), color: 'var(--emerald-light)', note: 'Saíram do funil — não precisam mais cruzamento' },
                      { label: `Rejeitados (falso positivo IA)`, val: reportStats.rejeitados, pct: Math.round(reportStats.rejeitados / reportStats.total_proofs * 100), color: 'var(--fg-subtle)', note: 'IA marcou como comprovante mas não era' },
                      { label: `Pendentes ainda (não confirmados)`, val: reportStats.pendentes_total, pct: Math.round(reportStats.pendentes_total / reportStats.total_proofs * 100), color: '#fbbf24', note: 'Aguardando processamento manual ou cruzamento' },
                    ].map((row) => (
                      <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: '0 0 60px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: row.color }}>{row.val}</div>
                        <div style={{ flex: 1, height: 22, borderRadius: 6, background: 'var(--surface-2)', overflow: 'hidden', position: 'relative' }}>
                          <div style={{ height: '100%', width: `${row.pct}%`, background: row.color, opacity: 0.3 }} />
                        </div>
                        <div style={{ flex: '0 0 250px', fontSize: 11, color: 'var(--fg-dim)' }}>
                          <strong>{row.label}</strong>
                          <div style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{row.note}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Por que pendentes não cruzam? */}
                <div style={{ background: 'var(--glass)', borderRadius: 14, border: '1px solid var(--border)', padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--strong-text)', marginBottom: 4 }}>🔍 Dos {reportStats.pendentes_total} comprovantes pendentes — por que não cruzam?</h3>
                  <p style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 14 }}>Funil de filtros aplicados pelo cruzamento automático.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { label: `Pendentes com phone WhatsApp válido (@s.whatsapp.net)`, val: reportStats.pendentes_phone_valido, total: reportStats.pendentes_total, color: '#3b82f6', desc: 'Phone normal Brasil. Bons candidatos.' },
                      { label: `Pendentes sem phone (JID @lid)`, val: reportStats.pendentes_jid_lid, total: reportStats.pendentes_total, color: '#fbbf24', desc: 'WhatsApp deu LID em vez de phone. Não cruza por phone.' },
                      { label: `Pendentes sem valor extraído`, val: reportStats.pendentes_sem_valor, total: reportStats.pendentes_total, color: '#ef4444', desc: 'IA não conseguiu ler valor R$ no comprovante.' },
                      { label: `Pendentes com phone match em algum pendente Zeglam`, val: reportStats.pendentes_com_zeglam_phone_match, total: reportStats.pendentes_phone_valido, color: 'var(--emerald-light)', desc: 'Cliente é inadimplente E mandou comprovante. Aqui sim pode virar match.' },
                    ].map((row) => (
                      <div key={row.label} style={{ padding: 12, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--strong-text)' }}>{row.label}</span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: row.color }}>{row.val} <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>/ {row.total}</span></span>
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>{row.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lado Zeglam */}
                <div style={{ background: 'var(--glass)', borderRadius: 14, border: '1px solid var(--border)', padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--strong-text)', marginBottom: 14 }}>🏪 Lado Zeglam (CRM)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ padding: 14, borderRadius: 10, background: 'var(--surface-2)' }}>
                      <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', fontWeight: 800 }}>Pendentes Zeglam total</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444', marginTop: 4 }}>{reportStats.pendentes_total_zeglam}</div>
                      <div style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>clientes inadimplentes scrape Zeglam</div>
                    </div>
                    <div style={{ padding: 14, borderRadius: 10, background: 'var(--surface-2)' }}>
                      <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', fontWeight: 800 }}>Com phone enriquecido</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--emerald-light)', marginTop: 4 }}>{reportStats.pendentes_zeglam_com_phone}</div>
                      <div style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>tem `phone_digits` populado pra cruzar</div>
                    </div>
                  </div>
                </div>

                {/* Mídias com falha */}
                <div style={{ background: 'rgba(239,68,68,0.05)', borderRadius: 14, border: '1px solid rgba(239,68,68,0.25)', padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: '#ef4444', marginBottom: 4 }}>⚠️ Mídias enviadas SEM análise (não viraram comprovante)</h3>
                  <p style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 14 }}>Imagens/PDFs do cliente que a IA não conseguiu analisar — provavelmente entre eles há comprovantes perdidos.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ padding: 14, borderRadius: 10, background: 'var(--surface-2)' }}>
                      <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', fontWeight: 800 }}>Análise falhou (rate limit / quota)</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444', marginTop: 4 }}>{reportStats.media_falhou}</div>
                      <div style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>OpenAI retornou erro — bulk-analyze cron está re-rodando</div>
                    </div>
                    <div style={{ padding: 14, borderRadius: 10, background: 'var(--surface-2)' }}>
                      <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', fontWeight: 800 }}>Nunca foi analisada</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#fbbf24', marginTop: 4 }}>{reportStats.media_sem_analise}</div>
                      <div style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>Webhook pegou mas job de análise não rodou</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 12 }}>
                    Estimativa baseline: <strong>~16% das mídias do cliente são comprovantes</strong>. Re-analisando todas, esperamos +
                    <strong style={{ color: 'var(--emerald-light)' }}> ~{Math.round((reportStats.media_falhou + reportStats.media_sem_analise) * 0.16)} comprovantes adicionais</strong>.
                  </p>
                </div>

                {/* Conclusão */}
                <div style={{ background: 'rgba(212,168,67,0.06)', borderRadius: 14, border: '1px solid var(--accent-border, rgba(212,168,67,0.4))', padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', marginBottom: 8 }}>💡 Por que só ~13 matches?</h3>
                  <ol style={{ fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
                    <li><strong>{reportStats.ja_confirmados} comprovantes ({Math.round(reportStats.ja_confirmados / reportStats.total_proofs * 100)}%)</strong> já foram baixados — saíram do funil de match.</li>
                    <li><strong>{reportStats.pendentes_jid_lid} pendentes</strong> chegaram com JID @lid (sem phone real) — não cruzam por phone.</li>
                    <li>Dos <strong>{reportStats.pendentes_phone_valido} pendentes com phone</strong>, apenas <strong>{reportStats.pendentes_com_zeglam_phone_match}</strong> têm pendente Zeglam mesmo phone — resto são clientes em dia mandando comprovante de pedido recente.</li>
                    <li>Desses {reportStats.pendentes_com_zeglam_phone_match}, só uma fração tem <strong>valor batendo</strong> (Tier 1 ≤1%) — clientes pagam parcial, com frete diferente, ou de pedido errado.</li>
                    <li><strong>{reportStats.media_falhou + reportStats.media_sem_analise} mídias sem análise</strong> — pode ter ~{Math.round((reportStats.media_falhou + reportStats.media_sem_analise) * 0.16)} comprovantes perdidos. Bulk re-analyze rodando agora pra recuperar.</li>
                  </ol>
                </div>
              </>
            )}
          </div>
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
          }} onClick={closePaymentModal}>
            
            <div
                className="modal-solid-container"
                style={{
                    width: '100%',
                    maxWidth: modalProof?.media_url ? 820 : 440,
                    borderRadius: 20,
                    boxShadow: '0 0 0 1px var(--accent), 0 30px 60px -12px rgba(0,0,0,0.9)',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#0d0d0d',
                    transition: 'max-width 0.3s ease',
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
                <button onClick={closePaymentModal} style={{ background: '#252525', border: 'none', width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
                  <X size={18} />
                </button>
              </div>

              {/* Content */}
              <div style={{ display: 'flex', maxHeight: '80vh' }}>

                {/* Painel esquerdo: dados e ações */}
                <div style={{ flex: '0 0 440px', padding: '20px', overflowY: 'auto', minWidth: 0 }}>
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

                      <div
                        style={{
                          padding: '14px 16px',
                          borderRadius: 12,
                          background: '#151515',
                          border: '1px solid rgba(212,212,216,0.35)',
                        }}
                      >
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 12,
                            cursor: confirmPaymentLoading ? 'not-allowed' : 'pointer',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#f4f4f5',
                            lineHeight: 1.45,
                            margin: 0,
                          }}
                        >
                          <input
                            type="checkbox"
                            className="zeglam-wa-checkbox"
                            checked={notifyZeglamCustomerOnConfirm}
                            onChange={(e) => setNotifyZeglamCustomerOnConfirm(e.target.checked)}
                            disabled={confirmPaymentLoading}
                          />
                          <span>Enviar mensagem automática ao cliente pelo Zeglam ao confirmar o pagamento.</span>
                        </label>
                      </div>

                      <button
                        type="button"
                        disabled={!!cobrarSendingKey || !modalConversationId || detailLoading || !paymentDetails}
                        onClick={() => {
                          if (!modalConversationId || !paymentDetails) return;
                          const cliente =
                            paymentDetails['Cliente'] ||
                            paymentDetails['Cliente/Telefone'] ||
                            'Cliente';
                          void sendZeglamCobrarWhatsApp({
                            conversationId: modalConversationId,
                            cliente: String(cliente),
                            catalogo: modalCatalogo,
                            sendingKey: 'zeglam-modal-cobrar',
                          });
                        }}
                        title="Envia o template de cobrança sem confirmar pagamento no Zeglam"
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 12,
                          background: 'rgba(251,191,36,0.08)',
                          border: '1px solid rgba(251,191,36,0.45)',
                          color: '#fbbf24',
                          fontSize: 13,
                          fontWeight: 800,
                          cursor:
                            cobrarSendingKey || !modalConversationId || detailLoading || !paymentDetails
                              ? 'not-allowed'
                              : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 10,
                          opacity: cobrarSendingKey && cobrarSendingKey !== 'zeglam-modal-cobrar' ? 0.45 : 1,
                        }}
                      >
                        {cobrarSendingKey === 'zeglam-modal-cobrar' ? (
                          <Loader size={18} className="spin" strokeWidth={2.5} />
                        ) : (
                          <Banknote size={18} strokeWidth={2.5} />
                        )}
                        Enviar cobrança (WhatsApp)
                      </button>

                      {/* AÇÕES FINAIS */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                         {confirmPaymentError ? (
                           <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fecaca', fontSize: 12, fontWeight: 600, lineHeight: 1.45 }}>
                             {confirmPaymentError}
                           </div>
                         ) : null}
                         <button
                           type="button"
                           disabled={confirmPaymentLoading || !modalSalesId}
                           onClick={() => void handleConfirmPayment()}
                           style={{ 
                            padding: '14px', 
                            borderRadius: 12, 
                            background: confirmPaymentLoading || !modalSalesId ? '#444' : 'var(--accent)', 
                            color: '#000', 
                            border: 'none', 
                            fontSize: 14, 
                            fontWeight: 900, 
                            cursor: confirmPaymentLoading || !modalSalesId ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            transition: 'transform 0.2s',
                            opacity: confirmPaymentLoading || !modalSalesId ? 0.7 : 1,
                         }} className="btn-confirm">
                            {confirmPaymentLoading ? (
                              <>
                                <Loader size={18} className="spin" strokeWidth={2.5} /> A CONFIRMAR…
                              </>
                            ) : (
                              <>
                                CONFIRMAR PAGAMENTO <ArrowRight size={18} strokeWidth={3} />
                              </>
                            )}
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

                {/* Painel direito: preview do comprovante */}
                {(() => {
                  const modalRow = pendingCustomers.find((c) => String(c.salesId) === String(modalSalesId));
                  const tier = modalRow?.matchTier;
                  const tierLabel = tier === 'phone_amount' ? 'CONFIRMADO' : tier === 'name_amount' ? 'PROVÁVEL' : tier === 'phone_provavel' ? 'REVISAR' : null;
                  const tierColor = tier === 'phone_amount' ? '#10b981' : tier === 'name_amount' ? '#60a5fa' : '#f59e0b';
                  if (!tierLabel && !modalProof) return null;
                  return (
                    <div style={{ width: 340, borderLeft: '1px solid #1e1e1e', background: '#080808', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                      {/* Cabeçalho do painel */}
                      <div style={{ padding: '14px 16px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Receipt size={12} style={{ color: '#555' }} />
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#555', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Comprovante</span>
                        </div>
                        {tierLabel && (
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: tierColor, color: '#000', letterSpacing: '0.05em' }}>
                            {tierLabel}
                          </span>
                        )}
                      </div>

                      {/* Preview do comprovante (img ou pdf) */}
                      <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        {modalProof ? (
                          modalProof.media_url ? (
                            (() => {
                              const url = modalProof.media_url;
                              const isPdf = /\.pdf(\?|$)/i.test(url);
                              return (
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.6)', border: '1px solid #2a2a2a', background: '#fff', position: 'relative', minHeight: 0 }}>
                                  {isPdf ? (
                                    <iframe
                                      src={`${url}#toolbar=0&navpanes=0&view=FitH`}
                                      title="Comprovante PDF"
                                      style={{ flex: 1, width: '100%', border: 'none', background: '#fff', minHeight: 400 }}
                                    />
                                  ) : (
                                    <div
                                      onMouseMove={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const x = ((e.clientX - rect.left) / rect.width) * 100;
                                        const y = ((e.clientY - rect.top) / rect.height) * 100;
                                        setProofHoverZoom({ active: true, x, y });
                                      }}
                                      onMouseLeave={() => setProofHoverZoom({ active: false, x: 50, y: 50 })}
                                      onClick={() => window.open(`/comprovante-viewer?url=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer')}
                                      title="Mover o mouse para zoom · clique para abrir visualizador completo"
                                      style={{
                                        width: '100%',
                                        overflow: 'hidden',
                                        cursor: 'zoom-in',
                                        background: '#f8f8f8',
                                        position: 'relative',
                                      }}
                                    >
                                      <img
                                        src={url}
                                        alt="Comprovante de pagamento"
                                        style={{
                                          width: '100%',
                                          display: 'block',
                                          transition: proofHoverZoom.active ? 'none' : 'transform 0.25s ease-out',
                                          transformOrigin: `${proofHoverZoom.x}% ${proofHoverZoom.y}%`,
                                          transform: proofHoverZoom.active ? 'scale(2.6)' : 'scale(1)',
                                          willChange: 'transform',
                                        }}
                                        onError={(e) => {
                                          const el = e.target as HTMLImageElement;
                                          const wrapper = el.parentElement?.parentElement;
                                          if (wrapper) {
                                            const viewer = `/comprovante-viewer?url=${encodeURIComponent(url)}`;
                                            wrapper.innerHTML = `<div style="padding:24px;text-align:center;color:#888;font-size:12px;background:#1a1a1a">Não foi possível carregar a imagem.<br/><a href="${viewer}" target="_blank" rel="noopener noreferrer" style="color:#fbbf24;text-decoration:underline;font-weight:700;display:inline-block;margin-top:8px">Abrir em nova aba ↗</a></div>`;
                                          }
                                        }}
                                      />
                                    </div>
                                  )}
                                  {/* Badge de instrução durante hover */}
                                  {!isPdf && proofHoverZoom.active && (
                                    <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', borderRadius: 6, padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#fff', pointerEvents: 'none', zIndex: 2 }}>
                                      🔍 Zoom · clique para visualizador
                                    </div>
                                  )}
                                  <a
                                    href={`/comprovante-viewer?url=${encodeURIComponent(url)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Abrir em nova aba com zoom"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', borderRadius: 6, padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#fff', textDecoration: 'none', zIndex: 2 }}
                                  >
                                    {isPdf ? 'Abrir PDF ↗' : 'Nova aba ↗'}
                                  </a>
                                </div>
                              );
                            })()
                          ) : (
                            <div style={{ flex: 1, minHeight: 200, borderRadius: 10, background: '#111', border: '1px solid #222', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                              <Receipt size={32} style={{ color: '#333' }} />
                              <span style={{ fontSize: 11, color: '#444' }}>Mídia não disponível</span>
                            </div>
                          )
                        ) : (
                          <div style={{ flex: 1, minHeight: 200, borderRadius: 10, background: '#111', border: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                            <Loader size={20} className="spin" style={{ color: '#333' }} />
                            <span style={{ fontSize: 11, color: '#444' }}>Carregando…</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

              </div>{/* fim do flex-row de content */}

            </div>
          </div>
        )}

      </div>
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } 
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

        /* Checkbox tipo formulário: caixa clara + visto ao marcar */
        .modal-solid-container .zeglam-wa-checkbox {
          appearance: none;
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          min-width: 20px;
          margin: 0;
          flex-shrink: 0;
          border-radius: 5px;
          border: 1.5px solid #a1a1aa;
          background: #e4e4e7;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .modal-solid-container .zeglam-wa-checkbox:hover:not(:disabled):not(:checked) {
          border-color: #d4d4d8;
          background: #f4f4f5;
        }
        .modal-solid-container .zeglam-wa-checkbox:checked {
          border-color: var(--accent);
          background: var(--accent) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23090b0b' stroke-width='2.3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.5 8.2 6.4 11 12.5 4.8'/%3E%3C/svg%3E") center / 12px 12px no-repeat;
        }
        .modal-solid-container .zeglam-wa-checkbox:checked:hover:not(:disabled) {
          filter: brightness(1.06);
        }
        .modal-solid-container .zeglam-wa-checkbox:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
