import { useCallback, useEffect, useRef, useState } from 'react';
import { GraduationCap, Loader, Play, RefreshCw, CheckCircle2, AlertCircle, Clock, StopCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SectionTitle } from './SettingsField';

interface PreviewData {
  windowDays: number;
  since: string;
  conversationsInWindow: number;
  humanMessagesInWindow: number;
  totalExamples: number;
  lastJob: RetrainJob | null;
}

interface RetrainJob {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  finished_at: string | null;
  window_days: number;
  extracted: number;
  judged: number;
  polished: number;
  promoted: number;
  dedup_skipped: number;
  triggered_by: string;
  errors: unknown;
}

type Phase = 'idle' | 'extract' | 'judge' | 'polish' | 'promote' | 'done';

interface Props {
  instanceId: string | null;
}

const WINDOW_OPTIONS = [7, 14, 30, 60, 90];
const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Aguardando',
  extract: '1/4 Extraindo pares',
  judge: '2/4 Julgando qualidade',
  polish: '3/4 Polindo respostas',
  promote: '4/4 Promovendo + deduplicando',
  done: 'Finalizado',
};

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '—';
  const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${r > 0 ? ` ${r}s` : ''}`;
}

export function RetrainingSection({ instanceId }: Props) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [history, setHistory] = useState<RetrainJob[]>([]);
  const [windowDays, setWindowDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<Phase>('idle');
  const [liveStats, setLiveStats] = useState({ extracted: 0, judged: 0, polished: 0, promoted: 0, dedup: 0 });
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const cancelRef = useRef(false);

  const showToast = (msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 5000);
  };

  const loadData = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    try {
      const [prev, hist] = await Promise.all([
        supabase.functions.invoke('evolution-retrain-cycle', { body: { action: 'preview', instanceId, windowDays } }),
        supabase.functions.invoke('evolution-retrain-cycle', { body: { action: 'history', instanceId, limit: 5 } }),
      ]);
      if (prev.data) setPreview(prev.data as PreviewData);
      if (hist.data?.jobs) setHistory(hist.data.jobs as RetrainJob[]);
    } finally {
      setLoading(false);
    }
  }, [instanceId, windowDays]);

  useEffect(() => { void loadData(); }, [loadData]);

  const invoke = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('evolution-retrain-cycle', {
      body: { action, instanceId, ...extra },
    });
    if (error) throw error;
    return data;
  };

  const runPhase = async (jobId: string, action: string, maxIterations: number, onTick: (r: any) => void) => {
    for (let i = 0; i < maxIterations; i++) {
      if (cancelRef.current) return { cancelled: true };
      const res = await invoke(action, { jobId });
      if (res?.error) throw new Error(res.error);
      onTick(res);
      if (res.done) return res;
      await new Promise(r => setTimeout(r, 200));
    }
    return { timedOut: true };
  };

  const handleRun = async () => {
    if (!instanceId || currentJobId) return;
    const confirmed = window.confirm(
      `Executar retreinamento com janela de ${windowDays} dias?\n\n` +
      `Isso vai:\n` +
      `• Extrair novos pares cliente→Zevaldo\n` +
      `• Julgar cada par com IA (0-10)\n` +
      `• Polir respostas 7+\n` +
      `• Deduplicar por embedding\n` +
      `• Promover até 50 novos exemplos\n\n` +
      `Vai demorar alguns minutos e consumir créditos OpenAI.`
    );
    if (!confirmed) return;

    cancelRef.current = false;
    setLiveStats({ extracted: 0, judged: 0, polished: 0, promoted: 0, dedup: 0 });
    try {
      const start = await invoke('start', { windowDays, triggeredBy: 'manual' });
      if (start?.error) { showToast(`Erro: ${start.error}`, 'err'); return; }
      const jobId = start.jobId;
      setCurrentJobId(jobId);

      setCurrentPhase('extract');
      await runPhase(jobId, 'tick_extract', 50, (r) => {
        if (r.extractedTotal !== undefined) setLiveStats(s => ({ ...s, extracted: r.extractedTotal }));
      });
      if (cancelRef.current) return;

      setCurrentPhase('judge');
      await runPhase(jobId, 'tick_judge', 50, (r) => {
        if (r.judgedTotal !== undefined) setLiveStats(s => ({ ...s, judged: r.judgedTotal }));
      });
      if (cancelRef.current) return;

      setCurrentPhase('polish');
      await runPhase(jobId, 'tick_polish', 50, (r) => {
        if (r.polishedTotal !== undefined) setLiveStats(s => ({ ...s, polished: r.polishedTotal }));
      });
      if (cancelRef.current) return;

      setCurrentPhase('promote');
      await runPhase(jobId, 'tick_promote', 30, (r) => {
        if (r.promotedTotal !== undefined) setLiveStats(s => ({ ...s, promoted: r.promotedTotal, dedup: r.dedupTotal || 0 }));
      });

      await invoke('finish', { jobId });
      setCurrentPhase('done');
      showToast(`Ciclo concluído: +${liveStats.promoted} novos exemplos · ${liveStats.dedup} deduplicados`, 'ok');
      await loadData();
    } catch (err) {
      showToast(`Falha: ${String(err)}`, 'err');
    } finally {
      setCurrentJobId(null);
      setTimeout(() => setCurrentPhase('idle'), 3000);
    }
  };

  const handleCancel = async () => {
    if (!currentJobId) return;
    cancelRef.current = true;
    await invoke('cancel', { jobId: currentJobId });
    showToast('Retreinamento cancelado', 'err');
    setCurrentJobId(null);
    setCurrentPhase('idle');
    await loadData();
  };

  if (!instanceId) return null;

  const isRunning = currentJobId !== null;

  return (
    <div style={{ marginTop: 24 }}>
      <SectionTitle title="Retreinamento contínuo" subtitle="Extrai novos exemplos de conversas recentes, polindo e deduplicando automaticamente" />

      <div style={{
        padding: 20, borderRadius: 14, background: 'var(--glass)',
        border: '1px solid var(--border)', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <GraduationCap size={18} color="#eab308" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--strong-text)', margin: 0 }}>Próximo ciclo</p>
            <p style={{ fontSize: 12, color: 'var(--fg-subtle)', margin: 0 }}>
              {preview?.lastJob ? `Último: ${relativeTime(preview.lastJob.started_at)}` : 'Nunca executado'}
            </p>
          </div>
          <button
            onClick={() => void loadData()}
            disabled={loading || isRunning}
            style={{
              padding: 8, borderRadius: 8, background: 'var(--surface-2)',
              border: '1px solid var(--border)', cursor: loading ? 'wait' : 'pointer',
              color: 'var(--fg-muted)', opacity: isRunning ? 0.4 : 1,
            }}
            title="Recarregar"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 8 }}>Janela de conversas a considerar</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {WINDOW_OPTIONS.map((w) => (
              <button
                key={w}
                onClick={() => !isRunning && setWindowDays(w)}
                disabled={isRunning}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: windowDays === w ? 'rgba(234,179,8,0.15)' : 'var(--surface-2)',
                  border: `1px solid ${windowDays === w ? 'rgba(234,179,8,0.3)' : 'var(--border)'}`,
                  color: windowDays === w ? '#eab308' : 'var(--fg-muted)',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  opacity: isRunning ? 0.5 : 1,
                }}
              >
                {w}d
              </button>
            ))}
          </div>
        </div>

        {preview && !isRunning && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
            <StatCard label="Conversas" value={preview.conversationsInWindow} hint="com atividade na janela" />
            <StatCard label="Msgs Zevaldo" value={preview.humanMessagesInWindow} hint="pares potenciais" />
            <StatCard label="Total base" value={preview.totalExamples} hint="exemplos atuais" />
          </div>
        )}

        {isRunning && (
          <div style={{
            padding: 14, borderRadius: 10, background: 'rgba(234,179,8,0.08)',
            border: '1px solid rgba(234,179,8,0.3)', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Loader size={14} color="#eab308" className="spin" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#eab308' }}>{PHASE_LABEL[currentPhase]}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              <LiveStat label="Extraídos" value={liveStats.extracted} active={currentPhase === 'extract'} />
              <LiveStat label="Julgados" value={liveStats.judged} active={currentPhase === 'judge'} />
              <LiveStat label="Polidos" value={liveStats.polished} active={currentPhase === 'polish'} />
              <LiveStat label="Promovidos" value={liveStats.promoted} active={currentPhase === 'promote'} />
              <LiveStat label="Deduplicados" value={liveStats.dedup} active={currentPhase === 'promote'} />
            </div>
          </div>
        )}

        {!isRunning ? (
          <button
            onClick={handleRun}
            disabled={!preview || preview.conversationsInWindow === 0}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 10,
              background: 'linear-gradient(135deg, #eab308, #f59e0b)',
              border: 'none', color: '#1a1a1a',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: (!preview || preview.conversationsInWindow === 0) ? 0.5 : 1,
            }}
          >
            <Play size={16} /> Rodar retreinamento ({windowDays}d)
          </button>
        ) : (
          <button
            onClick={handleCancel}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 10,
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
              color: '#ef4444', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <StopCircle size={16} /> Cancelar
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div style={{
          padding: 20, borderRadius: 14, background: 'var(--glass)',
          border: '1px solid var(--border)',
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)', marginBottom: 12 }}>
            Últimos ciclos
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((job) => <JobRow key={job.id} job={job} />)}
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          padding: '12px 18px', borderRadius: 10,
          background: toast.kind === 'ok' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
          border: `1px solid ${toast.kind === 'ok' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
          color: toast.kind === 'ok' ? '#10b981' : '#ef4444',
          fontSize: 13, fontWeight: 600, maxWidth: 420,
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div style={{
      padding: 12, borderRadius: 10, background: 'var(--surface-2)',
      border: '1px solid var(--border)',
    }}>
      <p style={{ fontSize: 11, color: 'var(--fg-subtle)', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--strong-text)', margin: '4px 0 2px' }}>{value}</p>
      <p style={{ fontSize: 10, color: 'var(--fg-subtle)', margin: 0 }}>{hint}</p>
    </div>
  );
}

function LiveStat({ label, value, active }: { label: string; value: number; active: boolean }) {
  return (
    <div style={{
      padding: '6px 8px', borderRadius: 6,
      background: active ? 'rgba(234,179,8,0.15)' : 'var(--surface-2)',
      border: `1px solid ${active ? 'rgba(234,179,8,0.4)' : 'var(--border)'}`,
      textAlign: 'center',
    }}>
      <p style={{ fontSize: 9, color: 'var(--fg-subtle)', margin: 0, textTransform: 'uppercase' }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 700, color: active ? '#eab308' : 'var(--strong-text)', margin: 0 }}>{value}</p>
    </div>
  );
}

function JobRow({ job }: { job: RetrainJob }) {
  const statusColor = ({
    completed: '#10b981', failed: '#ef4444', cancelled: '#94a3b8', running: '#eab308',
  } as const)[job.status];
  const StatusIcon = ({
    completed: CheckCircle2, failed: AlertCircle, cancelled: AlertCircle, running: Loader,
  } as const)[job.status];

  return (
    <div style={{
      padding: 12, borderRadius: 10, background: 'var(--surface-2)',
      border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: `${statusColor}22`, border: `1px solid ${statusColor}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <StatusIcon size={14} color={statusColor} className={job.status === 'running' ? 'spin' : ''} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)' }}>
            +{job.promoted} exemplos
          </span>
          <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
            · {job.window_days}d · {job.triggered_by}
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--fg-subtle)', margin: '2px 0 0' }}>
          {job.extracted} extraídos → {job.judged} julgados → {job.polished} polidos → {job.dedup_skipped} deduplicados
        </p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={10} /> {relativeTime(job.started_at)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>
          {formatDuration(job.started_at, job.finished_at)}
        </div>
      </div>
    </div>
  );
}
