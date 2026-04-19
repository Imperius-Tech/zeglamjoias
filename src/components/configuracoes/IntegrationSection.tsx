import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wifi, WifiOff, Loader, QrCode, CheckCircle, MessageSquare, ArrowRight,
  RefreshCw, LogOut, Phone, Calendar, Server, Zap, Users, Image as ImageIcon,
  Database, Shield, Clock, Hash, Copy, Check, AlertTriangle, X, Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SectionTitle } from './SettingsField';
import { GroupSelector } from './GroupSelector';
import { PromotionsSection } from './PromotionsSection';
import { supabase } from '@/lib/supabase';
import { useDashboardStore } from '@/lib/store';

type ConnectionStatus = 'disconnected' | 'waiting' | 'connected';

interface SyncJob {
  id: string;
  status: 'running' | 'done' | 'error' | 'partial' | 'none';
  total_chats: number;
  synced_chats: number;
  total_messages: number;
  total_media: number;
  error: string | null;
  batch_offset?: number;
  max_chats?: number;
  started_at?: string | null;
  finished_at?: string | null;
  current_step?: string | null;
  current_chat_name?: string | null;
  new_conversations?: number;
  updated_conversations?: number;
}

interface InstanceInfo {
  id: string;
  name: string;
  profileName: string | null;
  profilePicUrl: string | null;
  ownerJid: string | null;
  number: string | null;
  integration: string;
  connectionStatus: string;
  createdAt: string;
  updatedAt: string;
  disconnectionAt: string | null;
  counts: {
    messages: number;
    contacts: number;
    chats: number;
  };
}

interface DbStats {
  conversations: number;
  messages: number;
  media: number;
  lastMessage: string | null;
  uniqueContacts: number;
  firstMessage: string | null;
}

interface AnalysisJob {
  id: string;
  instance_id: string;
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  current_media_type: string | null;
  cancel_requested: boolean;
  started_at: string | null;
  finished_at: string | null;
}

const statusConfig = {
  connected: { label: 'Conectado', color: 'var(--emerald)', icon: Wifi },
  disconnected: { label: 'Desconectado', color: 'var(--red)', icon: WifiOff },
  waiting: { label: 'Aguardando leitura...', color: 'var(--amber)', icon: Loader },
};

function parseConnectionState(data: any): ConnectionStatus {
  const state = data?.state || data?.instance?.state;
  if (state === 'open' || state === 'connected') return 'connected';
  if (state === 'connecting') return 'waiting';
  return 'disconnected';
}

function formatPhoneNumber(jid: string | null): string {
  if (!jid) return '—';
  const number = jid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
  if (number.length === 13 && number.startsWith('55')) {
    return `+55 (${number.slice(2, 4)}) ${number.slice(4, 9)}-${number.slice(9)}`;
  }
  if (number.length === 12 && number.startsWith('55')) {
    return `+55 (${number.slice(2, 4)}) ${number.slice(4, 8)}-${number.slice(8)}`;
  }
  return `+${number}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return 'agora mesmo';
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  if (diffDays < 30) return `há ${diffDays} dias`;
  return formatDate(iso);
}

function calculateDaysSince(iso: string): number {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function IntegrationSection() {
  const navigate = useNavigate();
  const activeInstanceId = useDashboardStore((s) => s.activeInstanceId);
  const activeInstanceName = useDashboardStore((s) => s.activeInstanceName);
  const instances = useDashboardStore((s) => s.instances);
  const activeInstance = instances.find((i) => i.evolutionInstanceId === activeInstanceId);
  const isProductionInstance = activeInstance && !activeInstance.isSandbox;
  
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<SyncJob | null>(null);
  const [maxChatsInput, setMaxChatsInput] = useState<number>(200);
  const [instanceInfo, setInstanceInfo] = useState<InstanceInfo | null>(null);
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [pendingMediaCount, setPendingMediaCount] = useState(0);
  const [downloadingMedia, setDownloadingMedia] = useState(false);
  const [mediaProgress, setMediaProgress] = useState({ downloaded: 0, failed: 0 });
  const cancelDownloadRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pendingAnalysisCount, setPendingAnalysisCount] = useState(0);
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const analysisLoopRef = useRef<boolean>(false);

  const loadConversations = useDashboardStore((s) => s.loadConversations);

  const [instanceName, setInstanceName] = useState<string>(activeInstanceName || 'Teste Zeglam');

  const loadInstanceInfo = useCallback(async (name: string) => {
    try {
      const { data } = await supabase.functions.invoke('evolution-qrcode', {
        body: { action: 'info', instanceName: name },
      });
      const info = Array.isArray(data) ? data[0] : data;
      if (info && info.id) {
        setInstanceInfo({
          id: info.id,
          name: info.name,
          profileName: info.profileName,
          profilePicUrl: info.profilePicUrl,
          ownerJid: info.ownerJid,
          number: info.number,
          integration: info.integration,
          connectionStatus: info.connectionStatus,
          createdAt: info.createdAt,
          updatedAt: info.updatedAt,
          disconnectionAt: info.disconnectionAt,
          counts: {
            messages: info._count?.Message || 0,
            contacts: info._count?.Contact || 0,
            chats: info._count?.Chat || 0,
          },
        });
      } else {
        setInstanceInfo(null);
      }
    } catch {
      setInstanceInfo(null);
    }
  }, []);

  const loadDbStats = useCallback(async () => {
    if (!activeInstanceId) return;
    try {
      // 1. Total conversations for this instance
      const { count: convCount } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('instance_id', activeInstanceId);

      // 2. All conversation IDs for this instance (paged to handle >1000)
      const convIds: string[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data: page } = await supabase
          .from('conversations')
          .select('id')
          .eq('instance_id', activeInstanceId)
          .range(from, from + pageSize - 1);
        if (!page || page.length === 0) break;
        for (const row of page) convIds.push(row.id);
        if (page.length < pageSize) break;
      }

      if (convIds.length === 0) {
        setDbStats({ conversations: convCount || 0, messages: 0, media: 0, lastMessage: null, firstMessage: null, uniqueContacts: convCount || 0 });
        return;
      }

      // 3. Messages counts + boundary dates via .in(conversation_id, convIds)
      // Supabase limits URL length, so batch in chunks of 500 IDs if needed
      async function countMessages(filter?: (q: any) => any): Promise<number> {
        let total = 0;
        for (let i = 0; i < convIds.length; i += 500) {
          const chunk = convIds.slice(i, i + 500);
          let q: any = supabase.from('messages').select('id', { count: 'exact', head: true }).in('conversation_id', chunk);
          if (filter) q = filter(q);
          const { count } = await q;
          total += count || 0;
        }
        return total;
      }

      const [msgTotal, mediaTotal] = await Promise.all([
        countMessages(),
        countMessages((q) => q.not('media_url', 'is', null).neq('media_url', 'FAILED')),
      ]);

      // 4. First and last message dates — query first chunk only (good enough for display)
      const firstChunk = convIds.slice(0, 500);
      const [{ data: lastData }, { data: firstData }] = await Promise.all([
        supabase.from('messages').select('created_at').in('conversation_id', firstChunk).order('created_at', { ascending: false }).limit(1),
        supabase.from('messages').select('created_at').in('conversation_id', firstChunk).order('created_at', { ascending: true }).limit(1),
      ]);

      setDbStats({
        conversations: convCount || 0,
        messages: msgTotal,
        media: mediaTotal,
        lastMessage: lastData?.[0]?.created_at || null,
        firstMessage: firstData?.[0]?.created_at || null,
        uniqueContacts: convCount || 0,
      });
    } catch (e) {
      console.error('loadDbStats error:', e);
    }
  }, [activeInstanceId]);

  // On mount/change of active instance: reset UI and re-check connection + info + stats + last sync job
  useEffect(() => {
    async function init() {
      if (!activeInstanceName) return;

      // Reset UI state when switching instances
      setInstanceName(activeInstanceName);
      setJob(null);
      setInstanceInfo(null);
      setDbStats(null);
      setError(null);
      setQrBase64(null);
      setStatus('disconnected');
      setChecking(true);
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }

      try {
        const { data } = await supabase.functions.invoke('evolution-qrcode', {
          body: { action: 'status', instanceName: activeInstanceName },
        });
        const s = parseConnectionState(data);
        setStatus(s);
        if (s === 'connected') setQrBase64(null);
      } catch { /* ignore */ }

      await Promise.all([loadInstanceInfo(activeInstanceName), loadDbStats()]);

      // Check latest sync job FOR THIS INSTANCE (not global)
      try {
        const { data } = await supabase.functions.invoke('evolution-sync', {
          body: { action: 'status', instanceName: activeInstanceName },
        });
        if (data && data.status && data.status !== 'none') {
          setJob(data);
          if (data.status === 'running') {
            startPolling(data.id);
          } else if (data.status === 'partial') {
            setJob({ ...data, status: 'running' });
            supabase.functions.invoke('evolution-sync', {
              body: { action: 'continue', jobId: data.id, instanceName: activeInstanceName },
            }).then(() => startPolling(data.id));
          }
        }
      } catch { /* ignore */ }

      setChecking(false);
    }
    init();

    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [loadInstanceInfo, loadDbStats, activeInstanceId, activeInstanceName]);

  function startPolling(jobId: string) {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke('evolution-sync', {
          body: { action: 'status', jobId },
        });
        if (data) {
          setJob(data);
          if (data.status === 'done' || data.status === 'error') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            if (data.status === 'done') {
              loadConversations();
              loadDbStats();
              downloadPendingMedia();
            }
          } else if (data.status === 'partial') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            const contInstance = activeInstanceName || instanceName;
            supabase.functions.invoke('evolution-sync', {
              body: { action: 'continue', jobId, instanceName: contInstance },
            }).then(() => {
              setJob((prev) => prev ? { ...prev, status: 'running' } : prev);
              startPolling(jobId);
            });
          }
        }
      } catch { /* ignore */ }
    }, 2000);
  }

  async function downloadPendingMedia() {
    let remaining = 1;
    while (remaining > 0) {
      try {
        const { data } = await supabase.functions.invoke('evolution-media-download', { body: { instanceName } });
        if (!data) break;
        remaining = data.remaining || 0;
        if (data.downloaded > 0) {
          setJob((prev) => prev ? { ...prev, total_media: (prev.total_media || 0) + data.downloaded } : prev);
        }
        if (data.downloaded === 0 && data.failed === 0) break;
      } catch { break; }
    }
  }

  const loadPendingMediaCount = useCallback(async () => {
    if (!activeInstanceId) { setPendingMediaCount(0); return; }
    const { data: convs } = await supabase.from('conversations').select('id').eq('instance_id', activeInstanceId);
    if (!convs || convs.length === 0) { setPendingMediaCount(0); return; }
    let total = 0;
    const ids = convs.map((c) => c.id);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', chunk)
        .not('media_type', 'is', null)
        .or('media_url.is.null,media_url.like.%.bin');
      total += count || 0;
    }
    setPendingMediaCount(total);
  }, [activeInstanceId]);

  useEffect(() => { loadPendingMediaCount(); }, [loadPendingMediaCount]);

  const handleDownloadAllMedia = useCallback(async () => {
    const targetInstance = activeInstanceName || instanceName;
    if (!targetInstance) return;
    cancelDownloadRef.current = false;
    setDownloadingMedia(true);
    setMediaProgress({ downloaded: 0, failed: 0 });
    try {
      let remaining = 1;
      let safetyStop = 0;
      while (remaining > 0 && safetyStop < 500 && !cancelDownloadRef.current) {
        safetyStop++;
        const { data } = await supabase.functions.invoke('evolution-media-download', { body: { instanceName: targetInstance } });
        if (cancelDownloadRef.current) break;
        if (!data) break;
        remaining = data.remaining || 0;
        setMediaProgress((prev) => ({
          downloaded: prev.downloaded + (data.downloaded || 0),
          failed: prev.failed + (data.failed || 0),
        }));
        setPendingMediaCount(remaining);
        if ((data.downloaded || 0) === 0 && (data.failed || 0) === 0) break;
      }
    } finally {
      cancelDownloadRef.current = false;
      setDownloadingMedia(false);
      loadDbStats();
      loadPendingMediaCount();
    }
  }, [activeInstanceName, instanceName, loadDbStats, loadPendingMediaCount]);

  const handleCancelDownload = useCallback(() => {
    cancelDownloadRef.current = true;
  }, []);

  const loadPendingAnalysisCount = useCallback(async () => {
    if (!activeInstanceId) { setPendingAnalysisCount(0); return; }
    const { count } = await supabase
      .from('messages')
      .select('id, conversations!inner(instance_id)', { count: 'exact', head: true })
      .eq('conversations.instance_id', activeInstanceId)
      .is('media_analysis', null)
      .not('media_url', 'is', null)
      .neq('media_url', '')
      .not('media_url', 'like', 'FAILED%')
      .in('media_type', ['image', 'audio', 'document', 'sticker', 'video']);
    setPendingAnalysisCount(count || 0);
  }, [activeInstanceId]);

  useEffect(() => { loadPendingAnalysisCount(); }, [loadPendingAnalysisCount]);

  // Recupera job ativo ao montar/trocar de instância
  useEffect(() => {
    if (!activeInstanceId) { setAnalysisJob(null); return; }
    (async () => {
      const { data } = await supabase
        .from('analysis_jobs')
        .select('*')
        .eq('instance_id', activeInstanceId)
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setAnalysisJob(data as AnalysisJob);
      else setAnalysisJob(null);
    })();
  }, [activeInstanceId]);

  const runAnalysisLoop = useCallback(async (jobId: string) => {
    if (analysisLoopRef.current) return;
    analysisLoopRef.current = true;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data } = await supabase.functions.invoke('evolution-batch-analyze', {
          body: { action: 'tick', jobId },
        });
        if (data?.job) setAnalysisJob(data.job as AnalysisJob);
        if (data?.done) break;
        // Pequena pausa entre batches pra aliviar rate limit Gemini
        await new Promise((r) => setTimeout(r, 800));
      }
    } catch (err) {
      console.error('analysis loop error:', err);
    } finally {
      analysisLoopRef.current = false;
      loadPendingAnalysisCount();
    }
  }, [loadPendingAnalysisCount]);

  const handleStartAnalysis = useCallback(async () => {
    if (!activeInstanceId) return;
    try {
      const { data } = await supabase.functions.invoke('evolution-batch-analyze', {
        body: { action: 'start', instanceId: activeInstanceId },
      });
      if (data?.job) {
        setAnalysisJob(data.job as AnalysisJob);
        if (data.job.status === 'running') runAnalysisLoop(data.job.id);
      }
    } catch (err: any) {
      console.error('start analysis error:', err);
    }
  }, [activeInstanceId, runAnalysisLoop]);

  const handleCancelAnalysis = useCallback(async () => {
    if (!analysisJob?.id) return;
    try {
      await supabase.functions.invoke('evolution-batch-analyze', {
        body: { action: 'cancel', jobId: analysisJob.id },
      });
    } catch {}
  }, [analysisJob?.id]);

  // Retoma loop se havia um job running ao montar
  useEffect(() => {
    if (analysisJob?.status === 'running' && !analysisLoopRef.current) {
      runAnalysisLoop(analysisJob.id);
    }
  }, [analysisJob?.id, analysisJob?.status, runAnalysisLoop]);

  const handleStartSync = useCallback(async () => {
    setError(null);
    const targetInstance = activeInstanceName || instanceName;
    if (!targetInstance) {
      setError('Nenhuma instância ativa.');
      return;
    }
    try {
      const { data } = await supabase.functions.invoke('evolution-sync', {
        body: { action: 'start', instanceName: targetInstance, maxChats: maxChatsInput },
      });
      if (data?.jobId) {
        setJob({ id: data.jobId, status: 'running', total_chats: 0, synced_chats: 0, total_messages: 0, total_media: 0, error: null, max_chats: maxChatsInput, started_at: new Date().toISOString(), current_step: 'fetching_chats' });
        startPolling(data.jobId);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao iniciar sincronização');
    }
  }, [maxChatsInput, activeInstanceName, instanceName]);

  const handleCancelSync = useCallback(async () => {
    if (!job?.id) return;
    try {
      await supabase.functions.invoke('evolution-sync', { body: { action: 'cancel', jobId: job.id } });
    } catch {}
  }, [job?.id]);

  const handleGenerateQR = async () => {
    setLoading(true);
    setError(null);
    setQrBase64(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('evolution-qrcode', {
        body: { action: 'connect', instanceName: instanceName },
      });
      if (fnError) throw new Error(fnError.message);
      // QR pode vir em data.qrcode.base64 (connect), data.qrcode (create) ou data.base64
      const qr =
        data?.qrcode?.base64 ||
        data?.qrcode?.code ||
        (typeof data?.qrcode === 'string' ? data.qrcode : null) ||
        data?.base64;
      if (qr && typeof qr === 'string' && qr.length > 50) {
        setQrBase64(qr);
        setStatus('waiting');
      } else {
        const s = parseConnectionState(data);
        if (s === 'connected') setStatus('connected');
        else setError('Resposta da API: ' + JSON.stringify(data).substring(0, 300));
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckScanned = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase.functions.invoke('evolution-qrcode', {
        body: { action: 'status', instanceName: instanceName },
      });
      const s = parseConnectionState(data);
      setStatus(s);
      if (s === 'connected') {
        setQrBase64(null);
        // Aguarda brevemente pra Evolution atualizar os metadados do novo número
        await new Promise((r) => setTimeout(r, 1500));
        await Promise.all([loadInstanceInfo(instanceName), loadDbStats()]);
        handleStartSync();
      } else {
        setError('Ainda não conectado. Tente escanear novamente.');
      }
    } catch {
      setError('Erro ao verificar conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => setShowDisconnectModal(true);

  const confirmDisconnect = async () => {
    setShowDisconnectModal(false);
    setLoading(true);
    setError(null);
    try {
      // Em produ\u00e7\u00e3o: apenas logout (preserva instance na Evolution, dados no DB intactos).
      // Em sandbox: delete completo (libera a instance para recria\u00e7\u00e3o limpa).
      const action = isProductionInstance ? 'logout' : 'delete';
      await supabase.functions.invoke('evolution-qrcode', {
        body: { action, instanceName },
      });
      setStatus('disconnected');
      setQrBase64(null);
      setJob(null);
      if (!isProductionInstance) setInstanceInfo(null);
    } catch (err: any) {
      setError(err.message || 'Erro ao desconectar WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyNumber = () => {
    if (!instanceInfo?.ownerJid) return;
    const phone = formatPhoneNumber(instanceInfo.ownerJid);
    navigator.clipboard.writeText(phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <Loader size={24} style={{ color: 'var(--fg-subtle)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const st = statusConfig[status];
  const StatusIcon = st.icon;
  const syncProgress = job && job.total_chats > 0
    ? Math.min(100, Math.round(((job.batch_offset || 0) / job.total_chats) * 100))
    : 0;
  const isRunning = job?.status === 'running' || job?.status === 'partial';
  const isDone = job?.status === 'done';
  const isError = job?.status === 'error';
  const isConnected = status === 'connected';

  return (
    <div>
      <SectionTitle title="Integração — WhatsApp" subtitle="Conecte seu WhatsApp via Evolution API para receber e enviar mensagens" />

      {/* Status badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 16, borderRadius: 14, marginBottom: 20,
        background: 'var(--glass)', border: '1px solid var(--border)',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${st.color}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <StatusIcon size={20} style={{
            color: st.color,
            ...(status === 'waiting' ? { animation: 'spin 1s linear infinite' } : {}),
          }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)' }}>Status da Conexão</p>
          <p style={{ fontSize: 12, color: st.color }}>{st.label}</p>
        </div>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: st.color,
          boxShadow: `0 0 8px ${st.color}60`,
        }} />
      </div>

      {/* Detailed info when connected */}
      {isConnected && instanceInfo && !isRunning && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Profile Card */}
          <div style={{
            padding: 24, borderRadius: 16, marginBottom: 20,
            background: 'var(--glass)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            {/* Avatar */}
            {instanceInfo.profilePicUrl ? (
              <img
                src={instanceInfo.profilePicUrl}
                alt={instanceInfo.profileName || 'Perfil'}
                style={{
                  width: 72, height: 72, borderRadius: '50%',
                  border: '2px solid var(--emerald)',
                  boxShadow: '0 0 16px rgba(16, 185, 129, 0.3)',
                  objectFit: 'cover',
                }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-sec))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 28, fontWeight: 700,
              }}>
                {(instanceInfo.profileName || 'W').charAt(0).toUpperCase()}
              </div>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--strong-text)', marginBottom: 4 }}>
                {instanceInfo.profileName || 'WhatsApp conectado'}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Phone size={14} style={{ color: 'var(--emerald)' }} />
                <p style={{ fontSize: 14, color: 'var(--fg-dim)', fontFamily: 'monospace' }}>
                  {formatPhoneNumber(instanceInfo.ownerJid)}
                </p>
                <button
                  onClick={handleCopyNumber}
                  style={{
                    padding: 4, borderRadius: 6, background: 'transparent',
                    border: 'none', color: 'var(--fg-subtle)', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center',
                  }}
                  title="Copiar número"
                >
                  {copied ? (
                    <Check size={12} style={{ color: 'var(--emerald)' }} />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--emerald)', boxShadow: '0 0 4px var(--emerald)' }} />
                <p style={{ fontSize: 11, color: 'var(--emerald)', fontWeight: 500 }}>
                  Online • Última atividade {timeAgo(instanceInfo.updatedAt)}
                </p>
              </div>
            </div>
          </div>

          {/* Section: Dados desta conexão (do banco) */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-subtle)' }}>
                Dados desta conexão
              </p>
              <span style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 6,
                background: 'rgba(16, 185, 129, 0.12)', color: 'var(--emerald)',
                fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                Dados reais do painel
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
            }}>
              <StatCard
                icon={MessageSquare}
                iconColor="#3b82f6"
                label="Conversas"
                value={dbStats?.conversations ?? 0}
                subtitle="clientes únicos"
              />
              <StatCard
                icon={Database}
                iconColor="#10b981"
                label="Mensagens"
                value={dbStats?.messages ?? 0}
                subtitle="recebidas/enviadas"
              />
              <StatCard
                icon={ImageIcon}
                iconColor="#8b5cf6"
                label="Mídias"
                value={dbStats?.media ?? 0}
                subtitle="baixadas"
              />
              <StatCard
                icon={Clock}
                iconColor="#f59e0b"
                label="Ativa há"
                value={dbStats?.firstMessage ? calculateDaysSince(dbStats.firstMessage) : 0}
                subtitle="dias"
              />
            </div>
          </div>

          {/* Section: Histórico da instância (da Evolution) */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-subtle)' }}>
                Histórico da instância
              </p>
              <span style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 6,
                background: 'rgba(148, 163, 184, 0.12)', color: 'var(--fg-subtle)',
                fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                Acumulado (todos os números)
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
            }}>
              <StatCard
                icon={MessageSquare}
                iconColor="#64748b"
                label="Chats"
                value={instanceInfo.counts.chats}
                subtitle="Evolution API"
              />
              <StatCard
                icon={Database}
                iconColor="#64748b"
                label="Mensagens"
                value={instanceInfo.counts.messages}
                subtitle="Evolution API"
              />
              <StatCard
                icon={Users}
                iconColor="#64748b"
                label="Contatos"
                value={instanceInfo.counts.contacts}
                subtitle="Evolution API"
              />
            </div>
          </div>

          {/* Pending media downloader */}
          {(pendingMediaCount > 0 || downloadingMedia) && (
            <div style={{
              padding: 18, borderRadius: 16, marginBottom: 20,
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(139, 92, 246, 0.03))',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'rgba(139, 92, 246, 0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {downloadingMedia ? (
                  <Loader size={18} style={{ color: '#8b5cf6', animation: 'spin 1s linear infinite' }} />
                ) : (
                  <ImageIcon size={18} style={{ color: '#8b5cf6' }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--strong-text)', marginBottom: 2 }}>
                  {downloadingMedia
                    ? (cancelDownloadRef.current
                        ? 'Cancelando download…'
                        : `Baixando mídias… ${mediaProgress.downloaded} baixadas`)
                    : `${pendingMediaCount.toLocaleString('pt-BR')} mídia${pendingMediaCount !== 1 ? 's' : ''} pendente${pendingMediaCount !== 1 ? 's' : ''}`}
                </p>
                <p style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
                  {downloadingMedia
                    ? `Restam ${pendingMediaCount.toLocaleString('pt-BR')} ${mediaProgress.failed > 0 ? `· ${mediaProgress.failed} falharam` : ''}`
                    : 'Fotos, áudios e documentos aguardando download da Evolution'}
                </p>
              </div>
              {downloadingMedia ? (
                <button
                  onClick={handleCancelDownload}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 18px', borderRadius: 10,
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: 'var(--red, #ef4444)',
                    fontSize: 13, fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239, 68, 68, 0.2)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239, 68, 68, 0.12)'; }}
                >
                  <X size={14} /> Cancelar
                </button>
              ) : (
                <button
                  onClick={handleDownloadAllMedia}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 18px', borderRadius: 10,
                    background: '#8b5cf6',
                    border: 'none',
                    color: '#fff',
                    fontSize: 13, fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
                  }}
                >
                  Baixar agora
                </button>
              )}
            </div>
          )}

          {/* Media analysis (AI) */}
          {(pendingAnalysisCount > 0 || (analysisJob && ['running', 'pending'].includes(analysisJob.status))) && (() => {
            const running = analysisJob?.status === 'running' || analysisLoopRef.current;
            const total = analysisJob?.total || pendingAnalysisCount;
            const processed = analysisJob?.processed || 0;
            const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
            return (
              <div style={{
                padding: 18, borderRadius: 16, marginBottom: 20,
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(34, 197, 94, 0.03))',
                border: '1px solid rgba(34, 197, 94, 0.25)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: 'rgba(34, 197, 94, 0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {running ? (
                      <Loader size={18} style={{ color: '#22c55e', animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <Sparkles size={18} style={{ color: '#22c55e' }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--strong-text)', marginBottom: 2 }}>
                      {running
                        ? (analysisJob?.cancel_requested
                            ? 'Cancelando análise…'
                            : `Analisando mídias com IA… ${processed}/${total}`)
                        : `${pendingAnalysisCount.toLocaleString('pt-BR')} mídia${pendingAnalysisCount !== 1 ? 's' : ''} sem análise`}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
                      {running && analysisJob
                        ? `${analysisJob.succeeded} ok · ${analysisJob.skipped} puladas${analysisJob.failed > 0 ? ` · ${analysisJob.failed} falharam` : ''}${analysisJob.current_media_type ? ` · ${analysisJob.current_media_type}` : ''}`
                        : 'Transcrições de áudio, descrição de imagens e OCR de documentos'}
                    </p>
                  </div>
                  {running ? (
                    <button
                      onClick={handleCancelAnalysis}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '10px 18px', borderRadius: 10,
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        color: 'var(--red, #ef4444)',
                        fontSize: 13, fontWeight: 600,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <X size={14} /> Cancelar
                    </button>
                  ) : (
                    <button
                      onClick={handleStartAnalysis}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '10px 18px', borderRadius: 10,
                        background: '#22c55e',
                        border: 'none',
                        color: '#fff',
                        fontSize: 13, fontWeight: 600,
                        cursor: 'pointer',
                        flexShrink: 0,
                        boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
                      }}
                    >
                      Analisar agora
                    </button>
                  )}
                </div>
                {running && (
                  <div style={{ marginTop: 12, height: 6, borderRadius: 3, background: 'rgba(34, 197, 94, 0.12)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #22c55e, #4ade80)',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Seletor de grupo default */}
          <GroupSelector instanceName={instanceName} instanceId={activeInstanceId} />

          {/* Promoções ativas (auto-atualizadas) */}
          <PromotionsSection instanceName={instanceName} instanceId={activeInstanceId} />

          {/* Technical Info */}
          <div style={{
            padding: 20, borderRadius: 16, marginBottom: 20,
            background: 'var(--glass)', border: '1px solid var(--border)',
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-subtle)', marginBottom: 14 }}>
              Informações técnicas
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              <InfoRow icon={Server} label="API" value="Evolution API v2" />
              <InfoRow icon={Zap} label="Integração" value={instanceInfo.integration || 'WHATSAPP-BAILEYS'} />
              <InfoRow icon={Hash} label="Instância" value={instanceInfo.name} />
              <InfoRow icon={Shield} label="ID da Instância" value={instanceInfo.id.slice(0, 8) + '...'} mono />
              <InfoRow icon={Calendar} label="Instância criada em" value={formatDate(instanceInfo.createdAt)} />
              <InfoRow icon={Clock} label="Última mensagem" value={dbStats?.lastMessage ? timeAgo(dbStats.lastMessage) : '—'} />
            </div>
          </div>
        </motion.div>
      )}

      {/* Sync job progress */}
      <AnimatePresence>
        {job && (isRunning || isDone || isError) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              padding: 24, borderRadius: 16, marginBottom: 20,
              background: 'var(--glass)', border: '1px solid var(--border)',
            }}
          >
            <SyncProgressCard job={job} onCancel={handleCancelSync} onGoConversas={() => navigate('/conversas')} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR Code / Actions area */}
      {!isRunning && (
        <div style={{
          padding: 28, borderRadius: 16, marginBottom: 20,
          background: 'var(--glass)', border: '1px solid var(--border)',
          textAlign: 'center',
        }}>
          {qrBase64 ? (
            <div style={{ marginBottom: 20 }}>
              <img
                src={qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                alt="QR Code WhatsApp"
                style={{ width: 240, height: 240, borderRadius: 12, margin: '0 auto' }}
              />
              <p style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 12 }}>
                Abra o WhatsApp no celular e escaneie o QR Code
              </p>
              <button
                onClick={handleCheckScanned}
                disabled={loading}
                style={{
                  marginTop: 12, padding: '8px 16px', borderRadius: 8,
                  background: 'var(--surface-3)', border: '1px solid var(--border)',
                  color: 'var(--fg-dim)', fontSize: 12, fontWeight: 500,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? 'Verificando...' : 'Já escaneei — verificar conexão'}
              </button>
            </div>
          ) : isConnected ? (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-subtle)', marginBottom: 14 }}>
                Ações rápidas
              </p>

              {/* Controle de quantidade + botão */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center',
                flexWrap: 'wrap', marginBottom: 14,
                padding: 14, borderRadius: 12,
                background: 'var(--glass)', border: '1px dashed var(--border)',
                maxWidth: 560, marginLeft: 'auto', marginRight: 'auto',
              }}>
                <div style={{ textAlign: 'left' }}>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fg-subtle)', display: 'block', marginBottom: 4 }}>
                    Quantas conversas sincronizar
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      min={10}
                      max={2000}
                      step={10}
                      value={maxChatsInput}
                      onChange={(e) => setMaxChatsInput(Math.max(10, Math.min(2000, parseInt(e.target.value) || 200)))}
                      style={{
                        width: 100, height: 36, padding: '0 10px', borderRadius: 8,
                        background: 'var(--surface-3)', border: '1px solid var(--border)',
                        fontSize: 13, color: 'var(--strong-text)', fontWeight: 600, outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[50, 200, 500, 1000].map((n) => (
                        <button
                          key={n}
                          onClick={() => setMaxChatsInput(n)}
                          style={{
                            padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                            fontSize: 11, fontWeight: 600,
                            background: maxChatsInput === n ? 'var(--accent-bg)' : 'var(--surface-3)',
                            color: maxChatsInput === n ? 'var(--accent)' : 'var(--fg-muted)',
                            border: `1px solid ${maxChatsInput === n ? 'var(--accent-border)' : 'var(--border)'}`,
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleStartSync}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 20px', borderRadius: 10,
                    background: 'var(--accent)', border: 'none',
                    color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={14} /> Sincronizar {maxChatsInput}
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--fg-subtle)', textAlign: 'center', marginBottom: 14 }}>
                Mín. 10 · Máx. 2.000 conversas. Maior = mais tempo e tokens.
              </p>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => { loadInstanceInfo(instanceName); loadDbStats(); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 20px', borderRadius: 10,
                    background: 'var(--surface-3)', border: '1px solid var(--border)',
                    color: 'var(--fg-dim)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={14} /> Atualizar info
                </button>
                <button
                  onClick={handleLogout}
                  disabled={loading}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 20px', borderRadius: 10,
                    background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: 'var(--red, #ef4444)', fontSize: 13, fontWeight: 500,
                    cursor: loading ? 'wait' : 'pointer',
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <LogOut size={14} />}
                  Desconectar WhatsApp
                </button>
              </div>
            </div>
          ) : (
            <div>
              <QrCode size={48} style={{ color: 'var(--fg-faint)', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 13, color: 'var(--fg-subtle)', marginBottom: 20 }}>
                Gere o QR Code para conectar seu WhatsApp
              </p>
              <button
                onClick={handleGenerateQR}
                disabled={loading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '12px 24px', borderRadius: 12,
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 14, fontWeight: 600, border: 'none',
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? (
                  <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Gerando...</>
                ) : (
                  <><QrCode size={16} /> Gerar QR Code</>
                )}
              </button>
            </div>
          )}

          {error && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 16 }}>{error}</p>
          )}
        </div>
      )}

      {/* Disconnect Modal */}
      <DisconnectModal
        open={showDisconnectModal}
        onClose={() => setShowDisconnectModal(false)}
        onConfirm={confirmDisconnect}
        instanceInfo={instanceInfo}
        dbStats={dbStats}
        isProduction={!!isProductionInstance}
        instanceName={instanceName}
      />
    </div>
  );
}

function DisconnectModal({
  open, onClose, onConfirm, instanceInfo, dbStats, isProduction, instanceName,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  instanceInfo: InstanceInfo | null;
  dbStats: DbStats | null;
  isProduction: boolean;
  instanceName: string;
}) {
  const [confirmInput, setConfirmInput] = useState('');

  useEffect(() => {
    if (!open) setConfirmInput('');
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const canConfirm = !isProduction || confirmInput.trim() === instanceName;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 20,
              overflow: 'hidden',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '24px 24px 0',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <AlertTriangle size={20} style={{ color: 'var(--red, #ef4444)' }} />
                </div>
                <div>
                  <h3 style={{
                    fontSize: 17, fontWeight: 700, color: 'var(--strong-text)',
                    margin: 0, letterSpacing: '-0.01em',
                  }}>
                    Desconectar WhatsApp?
                  </h3>
                  <p style={{
                    fontSize: 12, color: 'var(--fg-subtle)', margin: '4px 0 0',
                  }}>
                    Esta ação não pode ser desfeita
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'transparent', border: 'none',
                  color: 'var(--fg-subtle)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLButtonElement).style.background = 'var(--surface-3)';
                  (e.target as HTMLButtonElement).style.color = 'var(--strong-text)';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.background = 'transparent';
                  (e.target as HTMLButtonElement).style.color = 'var(--fg-subtle)';
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Connected profile summary */}
            {instanceInfo && (
              <div style={{
                margin: '20px 24px 0',
                padding: 14,
                background: 'var(--glass)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                {instanceInfo.profilePicUrl ? (
                  <img
                    src={instanceInfo.profilePicUrl}
                    alt=""
                    style={{
                      width: 40, height: 40, borderRadius: '50%',
                      objectFit: 'cover',
                      border: '1.5px solid var(--emerald)',
                    }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-sec))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 16, fontWeight: 700,
                  }}>
                    {(instanceInfo.profileName || 'W').charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--strong-text)',
                    margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {instanceInfo.profileName || 'WhatsApp conectado'}
                  </p>
                  <p style={{
                    fontSize: 11, color: 'var(--fg-subtle)', margin: '2px 0 0',
                    fontFamily: 'monospace',
                  }}>
                    {formatPhoneNumber(instanceInfo.ownerJid)}
                  </p>
                </div>
              </div>
            )}

            {/* What will happen */}
            <div style={{ padding: '20px 24px 0' }}>
              {isProduction && (
                <div style={{
                  padding: '10px 12px', borderRadius: 10, marginBottom: 14,
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <AlertTriangle size={16} style={{ color: 'var(--red, #ef4444)', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--red, #ef4444)', marginBottom: 2 }}>
                      Instância de PRODUÇÃO
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
                      Ação limitada a logout (instância preservada). Para re-conectar vai precisar escanear QR novamente.
                    </p>
                  </div>
                </div>
              )}
              <p style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--fg-subtle)', marginBottom: 12,
              }}>
                O que vai acontecer
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <ModalAction
                  variant="danger"
                  icon={<LogOut size={14} />}
                  title={isProduction ? 'Instância faz logout (preservada)' : 'Instância removida da Evolution'}
                  description={isProduction
                    ? 'A conexão WhatsApp é encerrada, mas a instância continua registrada na Evolution'
                    : 'A conexão WhatsApp será encerrada e a instância apagada'}
                />
                <ModalAction
                  variant="warning"
                  icon={<RefreshCw size={14} />}
                  title="Dados da conexão são resetados"
                  description="Nome, foto e contatos passam a ser do novo número quando reconectar"
                />
                <ModalAction
                  variant="safe"
                  icon={<Check size={14} />}
                  title="Histórico preservado"
                  description={dbStats
                    ? `${dbStats.conversations} conversa${dbStats.conversations !== 1 ? 's' : ''} e ${dbStats.messages.toLocaleString('pt-BR')} mensagens permanecem salvas`
                    : 'Conversas e mensagens já salvas no painel ficam intactas'}
                />
              </div>

              {isProduction && (
                <div style={{ marginTop: 18 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fg-subtle)', display: 'block', marginBottom: 6 }}>
                    Digite <strong style={{ color: 'var(--strong-text)' }}>{instanceName}</strong> para confirmar
                  </label>
                  <input
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder={instanceName}
                    autoFocus
                    style={{
                      width: '100%', height: 40, padding: '0 12px', borderRadius: 10,
                      background: 'var(--surface-3)', border: `1px solid ${canConfirm ? 'var(--emerald)' : 'var(--border)'}`,
                      fontSize: 13, color: 'var(--strong-text)', outline: 'none', fontFamily: 'monospace',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              marginTop: 24, padding: '16px 24px',
              background: 'var(--glass)',
              borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'flex-end', gap: 10,
            }}>
              <button
                onClick={onClose}
                style={{
                  padding: '10px 20px', borderRadius: 10,
                  background: 'var(--surface-3)', border: '1px solid var(--border)',
                  color: 'var(--fg-dim)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-3)'; }}
              >
                Cancelar
              </button>
              <button
                onClick={canConfirm ? onConfirm : undefined}
                disabled={!canConfirm}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 20px', borderRadius: 10,
                  background: canConfirm ? 'var(--red, #ef4444)' : 'var(--surface-3)',
                  border: `1px solid ${canConfirm ? 'var(--red, #ef4444)' : 'var(--border)'}`,
                  color: canConfirm ? '#fff' : 'var(--fg-subtle)',
                  fontSize: 13, fontWeight: 600,
                  cursor: canConfirm ? 'pointer' : 'not-allowed',
                  boxShadow: canConfirm ? '0 4px 12px rgba(239, 68, 68, 0.25)' : 'none',
                  opacity: canConfirm ? 1 : 0.5,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { if (canConfirm) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)'; }}
                onMouseLeave={(e) => { if (canConfirm) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)'; }}
              >
                <LogOut size={14} />
                {isProduction ? 'Sim, fazer logout' : 'Sim, desconectar'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ModalAction({
  variant, icon, title, description,
}: {
  variant: 'danger' | 'warning' | 'safe';
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const colors = {
    danger: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.2)', fg: '#ef4444' },
    warning: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.2)', fg: '#f59e0b' },
    safe: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.2)', fg: '#10b981' },
  }[variant];

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: colors.bg, border: `1px solid ${colors.border}`,
        color: colors.fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13, fontWeight: 600, color: 'var(--strong-text)',
          margin: 0, lineHeight: 1.4,
        }}>
          {title}
        </p>
        <p style={{
          fontSize: 12, color: 'var(--fg-subtle)',
          margin: '3px 0 0', lineHeight: 1.45,
        }}>
          {description}
        </p>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon, iconColor, label, value, subtitle,
}: {
  icon: any; iconColor: string; label: string; value: number; subtitle: string;
}) {
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: 'var(--glass)', border: '1px solid var(--border)',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: `${iconColor}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 10,
      }}>
        <Icon size={16} style={{ color: iconColor }} />
      </div>
      <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--strong-text)', marginBottom: 2 }}>
        {value.toLocaleString('pt-BR')}
      </p>
      <p style={{ fontSize: 11, color: 'var(--fg-subtle)', fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 2 }}>{subtitle}</p>
    </div>
  );
}

function InfoRow({
  icon: Icon, label, value, mono = false,
}: {
  icon: any; label: string; value: string; mono?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 7,
        background: 'var(--surface-3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={13} style={{ color: 'var(--fg-subtle)' }} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 10, color: 'var(--fg-subtle)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
        <p style={{
          fontSize: 12, color: 'var(--fg-dim)', fontWeight: 500,
          fontFamily: mono ? 'monospace' : 'inherit',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{value}</p>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

const stepLabels: Record<string, string> = {
  fetching_chats: 'Buscando conversas na Evolution...',
  fetching_contacts: 'Carregando contatos...',
  syncing_messages: 'Sincronizando mensagens',
  done: 'Concluído',
};

function SyncProgressCard({ job, onCancel, onGoConversas }: { job: SyncJob; onCancel: () => void; onGoConversas: () => void }) {
  const isRunning = job.status === 'running' || job.status === 'partial';
  const isDone = job.status === 'done';
  const isError = job.status === 'error';

  // Progresso real = batch_offset (quantos foram processados, incluindo skips) / total_chats
  // total_chats já vem como min(allEntries.length, max_chats) do sync v34+
  const target = job.total_chats || job.max_chats || 0;
  const processed = job.batch_offset || 0;
  const shown = Math.min(processed, target);
  const progress = target > 0 ? Math.min(100, Math.round((shown / target) * 100)) : 0;

  // ETA calc
  const startedAt = job.started_at ? new Date(job.started_at).getTime() : Date.now();
  const now = Date.now();
  const elapsedMs = now - startedAt;
  let etaMs = 0;
  if (shown > 0 && target > 0 && isRunning && shown < target) {
    const perChat = elapsedMs / shown;
    etaMs = perChat * (target - shown);
  }

  const totalDurationMs = isDone && job.finished_at && job.started_at
    ? new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()
    : elapsedMs;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isDone ? 'rgba(16,185,129,0.15)' : isError ? 'rgba(239,68,68,0.15)' : 'rgba(212,175,55,0.15)',
          border: `1px solid ${isDone ? 'rgba(16,185,129,0.3)' : isError ? 'rgba(239,68,68,0.3)' : 'rgba(212,175,55,0.3)'}`,
        }}>
          {isDone ? (
            <CheckCircle size={18} style={{ color: 'var(--emerald-light)' }} />
          ) : isError ? (
            <WifiOff size={18} style={{ color: 'var(--red-light)' }} />
          ) : (
            <Loader size={18} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--strong-text)', letterSpacing: '-0.01em' }}>
            {isDone ? 'Sincronização concluída' : isError ? 'Erro na sincronização' : (stepLabels[job.current_step || ''] || 'Sincronizando mensagens e mídias...')}
          </p>
          <p style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 2 }}>
            {isDone
              ? `Finalizada em ${formatDuration(totalDurationMs)}`
              : isError
              ? job.error || 'Falha desconhecida'
              : job.current_chat_name
              ? <>Processando <strong style={{ color: 'var(--fg-dim)' }}>{job.current_chat_name}</strong></>
              : `Decorrido: ${formatDuration(elapsedMs)}`}
          </p>
        </div>
        {isRunning && (
          <button
            onClick={onCancel}
            title="Cancelar sincronização"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
              background: 'var(--glass)', border: '1px solid var(--border)',
              color: 'var(--fg-muted)', fontSize: 11, fontWeight: 500,
            }}
          >
            <X size={12} /> Cancelar
          </button>
        )}
      </div>

      {/* Progress bar */}
      {(isRunning || isDone) && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-dim)' }}>
              {shown} / {target} conversas
            </span>
            <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
              {isRunning && etaMs > 0
                ? <>ETA <strong style={{ color: 'var(--accent)' }}>{formatDuration(etaMs)}</strong> · {progress}%</>
                : `${progress}%`}
            </span>
          </div>
          <div style={{ width: '100%', height: 8, borderRadius: 4, background: 'var(--surface-3)', overflow: 'hidden' }}>
            <motion.div
              animate={{ width: `${Math.max(3, progress)}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              style={{
                height: '100%', borderRadius: 4,
                background: isDone
                  ? 'linear-gradient(90deg, var(--emerald), var(--emerald-light))'
                  : 'linear-gradient(90deg, var(--accent), var(--accent-sec))',
                boxShadow: isRunning ? '0 0 12px rgba(212,175,55,0.35)' : 'none',
              }}
            />
          </div>
        </div>
      )}

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: isDone ? 16 : 0 }}>
        <Metric value={job.total_chats} label="Conversas" color="var(--accent)" />
        <Metric value={job.total_messages} label="Mensagens" color="#60a5fa" />
        <Metric value={job.total_media} label="Mídias" color="#a78bfa" />
        {typeof job.new_conversations === 'number' && job.new_conversations > 0 && (
          <Metric value={job.new_conversations} label="Novas" color="var(--emerald-light)" />
        )}
        {typeof job.updated_conversations === 'number' && job.updated_conversations > 0 && (
          <Metric value={job.updated_conversations} label="Atualizadas" color="#fbbf24" />
        )}
      </div>

      {/* Error details */}
      {isError && job.error && (
        <div style={{
          marginTop: 12, padding: 10, borderRadius: 8,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          fontSize: 12, color: '#fca5a5',
        }}>
          {job.error}
        </div>
      )}

      {isDone && (
        <button
          onClick={onGoConversas}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10,
            background: 'var(--accent)', color: '#fff',
            fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
          }}
        >
          <MessageSquare size={16} /> Ir para Conversas <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}

function Metric({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 10,
      background: 'var(--surface-3)', border: '1px solid var(--border)',
    }}>
      <p style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.02em' }}>{value ?? 0}</p>
      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fg-subtle)', marginTop: 4 }}>{label}</p>
    </div>
  );
}
