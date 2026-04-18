import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  MessageSquare, Users, Bot, User, Phone, TrendingUp, TrendingDown,
  AlertCircle, UserPlus, CheckCircle2, Sparkles, Brain, RefreshCw, Loader,
  Clock, Activity, Tag,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface MetricsData {
  totals: {
    conversations: number;
    active_conversations: number;
    messages: number;
    messages_period: number;
    messages_prev_period: number;
    group_candidates_coletados: number;
    group_candidates_adicionadas: number;
    group_candidates_coletando: number;
  };
  by_author: Record<string, number>;
  by_sent_by: Record<string, number>;
  by_status: Record<string, number>;
  by_conversation_type: Record<string, number>;
  by_priority: Record<string, number>;
  daily_volume: { date: string; total: number; cliente: number; humano: number; ia: number }[];
  top_interests: { tag: string; count: number }[];
  training_examples: {
    total: number;
    high_signal: number;
    phone_reply: number;
    dashboard_edit: number;
    sync_pair: number;
  };
  response_coverage: {
    with_human_reply: number;
    without_reply: number;
  };
}

const periodOptions: { value: number; label: string }[] = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: 365, label: '1 ano' },
];

export default function MetricasPage() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(30);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.rpc('metrics_overview', { days_back: period });
      if (err) throw err;
      setData(res as MetricsData);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar métricas');
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { loadData(); }, [period]);

  if (loading) {
    return (
      <div style={{ padding: '32px 36px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Loader size={24} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '32px 36px' }}>
        <div style={{ padding: 20, borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
          {error || 'Dados indisponíveis'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 36px', height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.3em' }}>
              Zeglam
            </span>
            <span style={{ color: 'var(--fg-subtle)' }}>/</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-dim)' }}>Métricas</span>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.025em', color: 'var(--strong-text)', marginBottom: 6 }}>
            MÉTRICAS
          </h1>
          <p style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
            Indicadores de atendimento, aprendizado da IA e entrada no grupo.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--glass)', padding: 4, borderRadius: 10, border: '1px solid var(--border)' }}>
            {periodOptions.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                style={{
                  padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: period === p.value ? 'var(--accent-bg)' : 'transparent',
                  color: period === p.value ? 'var(--accent)' : 'var(--fg-muted)',
                  border: 'none',
                }}
              >{p.label}</button>
            ))}
          </div>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            title="Atualizar"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 10, cursor: refreshing ? 'wait' : 'pointer',
              background: 'var(--glass)', border: '1px solid var(--border)',
              color: 'var(--fg-muted)', fontSize: 12,
            }}
          >
            {refreshing
              ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
              : <RefreshCw size={12} />}
          </button>
        </div>
      </div>

      {/* KPIs principais */}
      <Section title="Visão geral">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <KpiCard
            icon={MessageSquare}
            label="Total de conversas"
            value={data.totals.conversations}
            sub={`${data.totals.active_conversations} ativas em ${period}d`}
            color="var(--accent)"
          />
          <KpiCard
            icon={Activity}
            label={`Mensagens (${period}d)`}
            value={data.totals.messages_period}
            delta={pctDelta(data.totals.messages_period, data.totals.messages_prev_period)}
            color="#60a5fa"
          />
          <KpiCard
            icon={UserPlus}
            label="Leads para o grupo"
            value={data.totals.group_candidates_coletados + data.totals.group_candidates_coletando}
            sub={`${data.totals.group_candidates_adicionadas} já adicionados`}
            color="var(--emerald-light)"
          />
          <KpiCard
            icon={AlertCircle}
            label="Sem resposta"
            value={data.response_coverage.without_reply}
            sub={`em ${period} dias`}
            color={data.response_coverage.without_reply > 0 ? '#fbbf24' : 'var(--fg-subtle)'}
          />
        </div>
      </Section>

      {/* Autoria das mensagens */}
      <Section title="De onde vêm as respostas">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card title="Mensagens por autor">
            <StackBar
              items={[
                { label: 'Cliente', value: data.by_author.cliente || 0, color: '#94a3b8' },
                { label: 'Zevaldo (humano)', value: data.by_author.humano || 0, color: 'var(--emerald-light)' },
                { label: 'IA', value: data.by_author.ia || 0, color: 'var(--accent)' },
              ]}
              total={(data.by_author.cliente || 0) + (data.by_author.humano || 0) + (data.by_author.ia || 0)}
            />
          </Card>
          <Card title="Canal das respostas do Zevaldo">
            <StackBar
              items={[
                { label: 'Celular (direto)', value: data.by_sent_by.phone || 0, color: '#60a5fa', icon: Phone },
                { label: 'Dashboard', value: data.by_sent_by.panel || 0, color: '#a78bfa', icon: User },
                { label: 'IA enviou', value: data.by_sent_by.ai || 0, color: 'var(--accent)', icon: Bot },
              ]}
              total={(data.by_sent_by.phone || 0) + (data.by_sent_by.panel || 0) + (data.by_sent_by.ai || 0)}
            />
          </Card>
        </div>
      </Section>

      {/* Volume diário */}
      <Section title={`Volume diário — últimos ${period} dias`}>
        <Card>
          <DailyChart data={data.daily_volume} />
        </Card>
      </Section>

      {/* Entrada no grupo */}
      <Section title="Fluxo de entrada no grupo">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <FunnelCard
            icon={UserPlus}
            label="Coletando dados"
            value={data.totals.group_candidates_coletando}
            color="#fbbf24"
          />
          <FunnelCard
            icon={CheckCircle2}
            label="Prontos p/ adicionar"
            value={data.totals.group_candidates_coletados}
            color="var(--emerald-light)"
          />
          <FunnelCard
            icon={Users}
            label="Já no grupo"
            value={data.totals.group_candidates_adicionadas}
            color="#60a5fa"
          />
        </div>
      </Section>

      {/* Aprendizado IA */}
      <Section title="Aprendizado da IA">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card title="Exemplos de treinamento">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 32, fontWeight: 900, color: 'var(--strong-text)', letterSpacing: '-0.03em' }}>
                {data.training_examples.total}
              </span>
              <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>exemplos · {data.training_examples.high_signal} alta-sinal</span>
            </div>
            <StackBar
              items={[
                { label: 'Resposta pelo celular', value: data.training_examples.phone_reply, color: '#60a5fa' },
                { label: 'Edição no dashboard', value: data.training_examples.dashboard_edit, color: 'var(--accent)' },
                { label: 'Pares do histórico', value: data.training_examples.sync_pair, color: '#a78bfa' },
              ]}
              total={data.training_examples.total}
              emptyMessage="Ainda não há exemplos suficientes. A IA aprende automaticamente quando você responde pelo celular ou edita sugestões."
            />
          </Card>
          <Card title="Tipos de conversa (classificação IA)">
            <StackBar
              items={[
                { label: 'Negócio', value: data.by_conversation_type.business || 0, color: 'var(--emerald-light)' },
                { label: 'Pessoal', value: data.by_conversation_type.personal || 0, color: '#a78bfa' },
                { label: 'Sem classificação', value: data.by_conversation_type.unknown || 0, color: '#94a3b8' },
              ]}
              total={Object.values(data.by_conversation_type).reduce((a, b) => a + b, 0)}
            />
          </Card>
        </div>
      </Section>

      {/* Status + Prioridade */}
      <Section title="Status das conversas">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card title="Por status">
            <StackBar
              items={[
                { label: 'IA respondendo', value: data.by_status.ia_respondendo || 0, color: 'var(--emerald-light)' },
                { label: 'Aguardando humano', value: data.by_status.aguardando_humano || 0, color: '#fbbf24' },
                { label: 'Silenciada', value: data.by_status.silenciada || 0, color: '#f87171' },
                { label: 'Encerrada', value: data.by_status.encerrada || 0, color: '#94a3b8' },
              ]}
              total={Object.values(data.by_status).reduce((a, b) => a + b, 0)}
            />
          </Card>
          <Card title="Por prioridade (análise IA)">
            <StackBar
              items={[
                { label: 'Alta', value: data.by_priority.alta || 0, color: '#f87171' },
                { label: 'Média', value: data.by_priority.media || 0, color: '#fbbf24' },
                { label: 'Baixa', value: data.by_priority.baixa || 0, color: '#94a3b8' },
                { label: 'Sem análise', value: data.by_priority.sem_analise || 0, color: 'var(--fg-subtle)' },
              ]}
              total={Object.values(data.by_priority).reduce((a, b) => a + b, 0)}
            />
          </Card>
        </div>
      </Section>

      {/* Interesses */}
      {data.top_interests.length > 0 && (
        <Section title="Interesses mais frequentes">
          <Card>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {data.top_interests.map((t, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 20,
                  background: 'rgba(212,175,55,0.1)',
                  border: '1px solid rgba(212,175,55,0.25)',
                }}>
                  <Tag size={11} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-dim)' }}>{t.tag}</span>
                  <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{t.count}</span>
                </div>
              ))}
            </div>
          </Card>
        </Section>
      )}
    </div>
  );
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? 100 : null;
  return Math.round(((curr - prev) / prev) * 100);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 12, fontWeight: 800, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 18, borderRadius: 14, background: 'var(--glass)', border: '1px solid var(--border)' }}>
      {title && <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', marginBottom: 14 }}>{title}</p>}
      {children}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, delta, color }: {
  icon: typeof MessageSquare; label: string; value: number; sub?: string; delta?: number | null; color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ padding: 16, borderRadius: 14, background: 'var(--glass)', border: '1px solid var(--border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${color}20`, border: `1px solid ${color}35`,
        }}>
          <Icon size={16} style={{ color }} />
        </div>
        {delta !== undefined && delta !== null && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 11, fontWeight: 700,
            padding: '2px 7px', borderRadius: 5,
            background: delta >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            color: delta >= 0 ? 'var(--emerald-light)' : '#fca5a5',
          }}>
            {delta >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--strong-text)', letterSpacing: '-0.03em', lineHeight: 1 }}>
        {value.toLocaleString('pt-BR')}
      </p>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </p>
      {sub && <p style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 2 }}>{sub}</p>}
    </motion.div>
  );
}

function FunnelCard({ icon: Icon, label, value, color }: {
  icon: typeof UserPlus; label: string; value: number; color: string;
}) {
  return (
    <div style={{
      padding: 16, borderRadius: 14,
      background: 'var(--glass)', border: `1px solid ${color}35`,
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}20`, border: `1px solid ${color}35`,
      }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <p style={{ fontSize: 28, fontWeight: 900, color, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</p>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', marginTop: 4 }}>{label}</p>
      </div>
    </div>
  );
}

function StackBar({ items, total, emptyMessage }: {
  items: { label: string; value: number; color: string; icon?: any }[];
  total: number;
  emptyMessage?: string;
}) {
  if (total === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--fg-subtle)', fontStyle: 'italic', padding: '8px 0' }}>
        {emptyMessage || 'Sem dados no período'}
      </p>
    );
  }
  return (
    <div>
      {/* Barra */}
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 12, background: 'var(--surface-3)' }}>
        {items.map((it, i) => {
          const pct = total > 0 ? (it.value / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div key={i} style={{ width: `${pct}%`, background: it.color }} title={`${it.label}: ${it.value} (${pct.toFixed(1)}%)`} />
          );
        })}
      </div>
      {/* Legenda */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((it, i) => {
          const pct = total > 0 ? (it.value / total) * 100 : 0;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: 'var(--fg-dim)' }}>{it.label}</span>
              <span style={{ fontWeight: 700, color: 'var(--strong-text)' }}>{it.value.toLocaleString('pt-BR')}</span>
              <span style={{ color: 'var(--fg-subtle)', fontSize: 10, minWidth: 42, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DailyChart({ data }: { data: MetricsData['daily_volume'] }) {
  const max = useMemo(() => Math.max(...data.map((d) => d.total), 1), [data]);

  if (!data || data.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Sem dados</p>;
  }

  const totalPeriod = data.reduce((a, b) => a + b.total, 0);
  const avgPerDay = Math.round(totalPeriod / data.length);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--strong-text)', letterSpacing: '-0.02em', lineHeight: 1 }}>{totalPeriod.toLocaleString('pt-BR')}</p>
          <p style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mensagens no período</p>
        </div>
        <div>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg-dim)', lineHeight: 1 }}>{avgPerDay}</p>
          <p style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Média/dia</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 160, paddingTop: 8 }}>
        {data.map((d, i) => {
          const h = (d.total / max) * 100;
          const clientePct = d.total > 0 ? (d.cliente / d.total) * 100 : 0;
          const iaPct = d.total > 0 ? (d.ia / d.total) * 100 : 0;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
              <div
                title={`${d.date} · ${d.total} mensagens (cliente: ${d.cliente}, humano: ${d.humano}, IA: ${d.ia})`}
                style={{
                  width: '100%', height: `${Math.max(h, d.total > 0 ? 2 : 0)}%`,
                  borderRadius: '4px 4px 0 0', overflow: 'hidden',
                  background: 'var(--surface-3)',
                  display: 'flex', flexDirection: 'column',
                  cursor: 'pointer', transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                {iaPct > 0 && <div style={{ height: `${iaPct}%`, background: 'var(--accent)' }} />}
                <div style={{ flex: 1, background: 'var(--emerald)' }} />
                {clientePct > 0 && <div style={{ height: `${clientePct}%`, background: '#94a3b8' }} />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legenda */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: '#94a3b8' }} /> Cliente
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--emerald)' }} /> Humano
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)' }} /> IA
        </div>
      </div>
    </div>
  );
}
