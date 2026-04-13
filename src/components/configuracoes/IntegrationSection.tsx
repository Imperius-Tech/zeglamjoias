import { useState, useEffect, useCallback, useRef } from 'react';
import { Wifi, WifiOff, Loader, QrCode, CheckCircle, MessageSquare, ArrowRight, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SectionTitle } from './SettingsField';
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

export function IntegrationSection() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<SyncJob | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadConversations = useDashboardStore((s) => s.loadConversations);

  // On mount: check connection + check if there's a running sync job
  useEffect(() => {
    async function init() {
      // Check connection
      try {
        const { data } = await supabase.functions.invoke('evolution-qrcode', {
          body: { action: 'status', instanceName: 'Teste Zeglam' },
        });
        const s = parseConnectionState(data);
        setStatus(s);
        if (s === 'connected') setQrBase64(null);
      } catch { /* ignore */ }

      // Check latest sync job
      try {
        const { data } = await supabase.functions.invoke('evolution-sync', {
          body: { action: 'status' },
        });
        if (data && data.status !== 'none') {
          setJob(data);
          if (data.status === 'running') {
            startPolling(data.id);
          } else if (data.status === 'partial') {
            // Auto-continue from where it left off
            setJob({ ...data, status: 'running' });
            supabase.functions.invoke('evolution-sync', {
              body: { action: 'continue', jobId: data.id, instanceName: 'Teste Zeglam' },
            }).then(() => startPolling(data.id));
          }
        }
      } catch { /* ignore */ }

      setChecking(false);
    }
    init();

    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

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
              // Start media download in background
              downloadPendingMedia();
            }
          } else if (data.status === 'partial') {
            // Auto-continue next batch
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            supabase.functions.invoke('evolution-sync', {
              body: { action: 'continue', jobId, instanceName: 'Teste Zeglam' },
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
    // Download media in batches of 10, loop until none remaining
    let remaining = 1;
    while (remaining > 0) {
      try {
        const { data } = await supabase.functions.invoke('evolution-media-download', { body: {} });
        if (!data) break;
        remaining = data.remaining || 0;
        if (data.downloaded > 0) {
          // Update media count in job display
          setJob((prev) => prev ? { ...prev, total_media: (prev.total_media || 0) + data.downloaded } : prev);
        }
        if (data.downloaded === 0 && data.failed === 0) break;
      } catch {
        break;
      }
    }
  }

  const handleStartSync = useCallback(async () => {
    setError(null);
    try {
      const { data } = await supabase.functions.invoke('evolution-sync', {
        body: { action: 'start', instanceName: 'Teste Zeglam' },
      });
      if (data?.jobId) {
        setJob({ id: data.jobId, status: 'running', total_chats: 0, synced_chats: 0, total_messages: 0, total_media: 0, error: null });
        startPolling(data.jobId);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao iniciar sincronização');
    }
  }, []);

  const handleGenerateQR = async () => {
    setLoading(true);
    setError(null);
    setQrBase64(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('evolution-qrcode', {
        body: { action: 'connect', instanceName: 'Teste Zeglam' },
      });
      if (fnError) throw new Error(fnError.message);
      const qr = data?.qrcode?.base64 || data?.qrcode || data?.base64;
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
        body: { action: 'status', instanceName: 'Teste Zeglam' },
      });
      const s = parseConnectionState(data);
      setStatus(s);
      if (s === 'connected') {
        setQrBase64(null);
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

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <Loader size={24} style={{ color: 'var(--fg-subtle)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const st = statusConfig[status];
  const StatusIcon = st.icon;
  const syncProgress = job && job.total_chats > 0 ? Math.round((job.synced_chats / job.total_chats) * 100) : 0;
  const isRunning = job?.status === 'running' || job?.status === 'partial';
  const isDone = job?.status === 'done';
  const isError = job?.status === 'error';

  return (
    <div>
      <SectionTitle title="Integração — WhatsApp" subtitle="Conecte seu WhatsApp via Evolution API para receber e enviar mensagens" />

      {/* Status badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 16, borderRadius: 14, marginBottom: 32,
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
          <p style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Status da Conexão</p>
          <p style={{ fontSize: 12, color: st.color }}>{st.label}</p>
        </div>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: st.color,
          boxShadow: `0 0 8px ${st.color}60`,
        }} />
      </div>

      {/* Sync job progress */}
      <AnimatePresence>
        {job && (isRunning || isDone || isError) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              padding: 24, borderRadius: 16, marginBottom: 24,
              background: 'var(--glass)', border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              {isDone ? (
                <CheckCircle size={20} style={{ color: 'var(--emerald)' }} />
              ) : isError ? (
                <WifiOff size={20} style={{ color: 'var(--red)' }} />
              ) : (
                <Loader size={20} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
              )}
              <p style={{
                fontSize: 14, fontWeight: 600,
                color: isDone ? 'var(--emerald)' : isError ? 'var(--red)' : '#fff',
              }}>
                {isDone ? 'Sincronização concluída!' : isError ? 'Erro na sincronização' : 'Sincronizando mensagens e mídias...'}
              </p>
            </div>

            {isRunning && (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  width: '100%', height: 8, borderRadius: 4,
                  background: 'var(--surface-3)', overflow: 'hidden',
                }}>
                  <motion.div
                    animate={{ width: `${Math.max(5, syncProgress)}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    style={{
                      height: '100%', borderRadius: 4,
                      background: 'linear-gradient(90deg, var(--accent), var(--accent-sec))',
                    }}
                  />
                </div>
                {job.total_chats > 0 && (
                  <p style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 6 }}>
                    {job.synced_chats} de {job.total_chats} conversas
                  </p>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{job.total_chats}</p>
                <p style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Conversas</p>
              </div>
              <div>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{job.total_messages}</p>
                <p style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Mensagens</p>
              </div>
              <div>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{job.total_media}</p>
                <p style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Mídias</p>
              </div>
            </div>

            {isError && job.error && (
              <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{job.error}</p>
            )}

            {isDone && (
              <button
                onClick={() => navigate('/conversas')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  marginTop: 16, padding: '10px 20px', borderRadius: 10,
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                }}
              >
                <MessageSquare size={16} /> Ir para Conversas <ArrowRight size={14} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR Code / Connected area */}
      {!isRunning && (
        <div style={{
          padding: 32, borderRadius: 16, marginBottom: 24,
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
          ) : status === 'connected' ? (
            <div>
              <Wifi size={48} style={{ color: 'var(--emerald)', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>WhatsApp conectado!</p>
              <p style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 4 }}>
                Suas mensagens estão sendo recebidas em tempo real
              </p>
              <button
                onClick={handleStartSync}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  marginTop: 16, padding: '10px 20px', borderRadius: 10,
                  background: 'var(--surface-3)', border: '1px solid var(--border)',
                  color: 'var(--fg-dim)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}
              >
                <RefreshCw size={14} /> Sincronizar conversas
              </button>
            </div>
          ) : (
            <div>
              <QrCode size={48} style={{ color: 'var(--fg-faint)', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 13, color: 'var(--fg-subtle)', marginBottom: 20 }}>
                Gere o QR Code para conectar seu WhatsApp
              </p>
            </div>
          )}

          {status !== 'connected' && (
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
                <><QrCode size={16} /> {qrBase64 ? 'Gerar Novo QR Code' : 'Gerar QR Code'}</>
              )}
            </button>
          )}

          {error && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 16 }}>{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
