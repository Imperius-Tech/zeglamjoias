import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare, Bot, Clock, AlertCircle, Loader, RefreshCw,
  DollarSign, Activity, TrendingUp, Zap, UserCheck, FileCheck,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboardStore } from '@/lib/store';

interface SLAData {
  total_respondidas: number;
  respondidas_1h: number;
  respondidas_4h: number;
  respondidas_24h: number;
  respondidas_mais_24h: number;
  nao_respondidas: number;
  tempo_medio_minutos: number | null;
  tempo_mediano_minutos: number | null;
}

interface AIEfficiencyData {
  msgs_ia_auto: number;
  msgs_humano: number;
  msgs_sugestao_aprovada: number;
  total_msgs_saida: number;
  taxa_automacao: number;
  confianca_media: number | null;
  consultas_humano_count: Record<string, number> | null;
  horas_economizadas: number;
}

interface PaymentsData {
  total_comprovantes: number;
  com_valor_detectado: number;
  total_valor: number;
  ticket_medio: number;
  pendentes: number;
  por_dia: { dia: string; qtd: number; total: number }[] | null;
}

interface BacklogConv {
  id: string;
  customer_name: string;
  customer_phone: string;
  hours: number;
}

interface BacklogItem {
  motivo: string;
  total: number;
  mais_antigo_horas: number;
  conversations: BacklogConv[] | null;
}

interface UrgentAging {
  conversation_id: string;
  customer_name: string;
  priority_reason: string | null;
  ai_reason: string | null;
  hours_waiting: number;
}

const periodOptions = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
];

const MOTIVO_LABEL: Record<string, string> = {
  rastreio: 'Rastreio',
  confirmacao_pagamento: 'Confirmar pagamento',
  reclamacao: 'Reclamação',
  frete_envio: 'Frete/envio',
  valor_desconto: 'Valor/desconto',
  status_pedido: 'Status do pedido',
  alteracao_cancelamento: 'Alterar/cancelar',
  grupo_inclusao: 'Entrar no grupo',
  link_pedido: 'Link/pedido',
  outro: 'Outro',
};

function formatTime(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} dias`;
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

export default function MetricasPage() {
  const navigate = useNavigate();
  const selectConversation = useDashboardStore((s) => s.selectConversation);
  const activeInstanceId = useDashboardStore((s) => s.activeInstanceId);
  const [period, setPeriod] = useState(30);
  const [expandedBacklog, setExpandedBacklog] = useState<string | null>('confirmacao_pagamento');

  const openConversation = (convId: string) => {
    selectConversation(convId);
    navigate('/conversas');
  };
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sla, setSLA] = useState<SLAData | null>(null);
  const [ai, setAI] = useState<AIEfficiencyData | null>(null);
  const [payments, setPayments] = useState<PaymentsData | null>(null);
  const [backlog, setBacklog] = useState<BacklogItem[]>([]);
  const [aging, setAging] = useState<UrgentAging[]>([]);

  const loadData = useCallback(async () => {
    if (!activeInstanceId) return;
    setRefreshing(true);
    setError(null);
    try {
      const [slaRes, aiRes, paymentsRes, backlogRes, agingRes] = await Promise.all([
        supabase.rpc('metrics_sla', { p_instance_id: activeInstanceId, p_days: period }),
        supabase.rpc('metrics_ai_efficiency', { p_instance_id: activeInstanceId, p_days: period }),
        supabase.rpc('metrics_payments', { p_instance_id: activeInstanceId, p_days: period }),
        supabase.rpc('metrics_backlog', { p_instance_id: activeInstanceId }),
        supabase.rpc('metrics_urgent_aging', { p_instance_id: activeInstanceId }),
      ]);
      if (slaRes.data?.[0]) setSLA(slaRes.data[0]);
      if (aiRes.data?.[0]) setAI(aiRes.data[0]);
      if (paymentsRes.data?.[0]) setPayments(paymentsRes.data[0]);
      setBacklog(backlogRes.data || []);
      setAging(agingRes.data || []);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar métricas');
    }
    setLoading(false);
    setRefreshing(false);
  }, [activeInstanceId, period]);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) {
    return (
      <div style={{ padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', overflowY: 'auto' }}>
        <Loader size={24} className="spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, color: '#ef4444', height: '100%', overflowY: 'auto' }}>
        <AlertCircle size={20} /> {error}
      </div>
    );
  }

  const slaTotal = sla ? sla.total_respondidas + sla.nao_respondidas : 0;
  const slaPct1h = sla && slaTotal > 0 ? (sla.respondidas_1h / slaTotal) * 100 : 0;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px 32px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--strong-text)', margin: 0 }}>Métricas</h1>
          <p style={{ fontSize: 13, color: 'var(--fg-subtle)', margin: '4px 0 0' }}>
            Acompanhe atendimento, eficiência da IA e pagamentos
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {periodOptions.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              style={{
                padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                background: period === p.value ? 'var(--accent)' : 'var(--glass)',
                color: period === p.value ? '#fff' : 'var(--fg-muted)',
                border: `1px solid ${period === p.value ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => void loadData()}
            disabled={refreshing}
            style={{
              padding: 8, borderRadius: 10, background: 'var(--glass)',
              border: '1px solid var(--border)', cursor: refreshing ? 'wait' : 'pointer',
              color: 'var(--fg-muted)',
            }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* ============ ATENDIMENTO ============ */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Atendimento
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 16 }}>
          <KPI
            icon={Clock}
            label="Tempo médio de resposta"
            value={formatTime(sla?.tempo_medio_minutos || null)}
            subLabel={`Mediana: ${formatTime(sla?.tempo_mediano_minutos || null)}`}
            color="#fbbf24"
          />
          <KPI
            icon={Zap}
            label="Respondidas em <1h"
            value={`${slaPct1h.toFixed(0)}%`}
            subLabel={`${sla?.respondidas_1h || 0} de ${slaTotal}`}
            color="#10b981"
          />
          <KPI
            icon={AlertCircle}
            label="Não respondidas"
            value={String(sla?.nao_respondidas || 0)}
            subLabel="Clientes aguardando"
            color="#ef4444"
          />
          <KPI
            icon={UserCheck}
            label="Respondidas >24h"
            value={String(sla?.respondidas_mais_24h || 0)}
            subLabel="SLA comprometido"
            color="#f59e0b"
          />
        </div>

        {/* SLA distribution bar */}
        {sla && sla.total_respondidas > 0 && (
          <div style={{ padding: 16, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--strong-text)', margin: 0, marginBottom: 10 }}>
              Distribuição por tempo de resposta
            </p>
            <SLABar
              total={sla.total_respondidas}
              buckets={[
                { label: '< 1h', count: sla.respondidas_1h, color: '#10b981' },
                { label: '1-4h', count: sla.respondidas_4h, color: '#84cc16' },
                { label: '4-24h', count: sla.respondidas_24h, color: '#f59e0b' },
                { label: '> 24h', count: sla.respondidas_mais_24h, color: '#ef4444' },
              ]}
            />
          </div>
        )}
      </section>

      {/* ============ EFICIÊNCIA DA IA ============ */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Eficiência da IA
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 16 }}>
          <KPI
            icon={Bot}
            label="Taxa de automação"
            value={`${ai?.taxa_automacao || 0}%`}
            subLabel={`${ai?.msgs_ia_auto || 0} de ${ai?.total_msgs_saida || 0} msgs`}
            color="var(--accent)"
          />
          <KPI
            icon={Activity}
            label="Confiança média"
            value={ai?.confianca_media ? `${ai.confianca_media}%` : '—'}
            subLabel="Das sugestões IA"
            color="#8b5cf6"
          />
          <KPI
            icon={Clock}
            label="Horas economizadas"
            value={`${ai?.horas_economizadas || 0}h`}
            subLabel="Estimativa período"
            color="#10b981"
          />
          <KPI
            icon={MessageSquare}
            label="Msgs manuais"
            value={String(ai?.msgs_humano || 0)}
            subLabel="Escritas pelo Zevaldo"
            color="var(--fg-muted)"
          />
        </div>

        {/* Top motivos CONSULTA_HUMANO */}
        {ai?.consultas_humano_count && Object.keys(ai.consultas_humano_count).length > 0 && (
          <div style={{ padding: 16, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--strong-text)', margin: 0, marginBottom: 10 }}>
              Principais motivos de escalação pro humano
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              {Object.entries(ai.consultas_humano_count)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([key, count]) => (
                  <div key={key} style={{
                    padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)',
                    border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                      {MOTIVO_LABEL[key] || key}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{count}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </section>

      {/* ============ PAGAMENTOS ============ */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Pagamentos
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 16 }}>
          <KPI
            icon={FileCheck}
            label="Comprovantes recebidos"
            value={String(payments?.total_comprovantes || 0)}
            subLabel={`${payments?.pendentes || 0} pendentes`}
            color="#10b981"
          />
          <KPI
            icon={DollarSign}
            label="Valor total detectado"
            value={formatCurrency(payments?.total_valor || 0)}
            subLabel={`${payments?.com_valor_detectado || 0} com valor lido`}
            color="#10b981"
          />
          <KPI
            icon={TrendingUp}
            label="Ticket médio"
            value={formatCurrency(payments?.ticket_medio || 0)}
            subLabel="Por comprovante"
            color="#10b981"
          />
        </div>
      </section>

      {/* ============ BACKLOG ============ */}
      {backlog.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Backlog — aguardando humano
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {backlog.map((b) => {
              const isExpanded = expandedBacklog === b.motivo;
              const convs = b.conversations || [];
              return (
                <div key={b.motivo} style={{
                  borderRadius: 12, background: 'var(--glass)',
                  border: '1px solid rgba(239,68,68,0.2)', overflow: 'hidden',
                }}>
                  <button
                    onClick={() => setExpandedBacklog(isExpanded ? null : b.motivo)}
                    style={{
                      width: '100%', padding: 14, background: 'transparent', border: 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                    }}
                  >
                    {isExpanded ? <ChevronDown size={16} style={{ color: '#ef4444', flexShrink: 0 }} /> : <ChevronRight size={16} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />}
                    <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--strong-text)', minWidth: 40 }}>{b.total}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
                      {MOTIVO_LABEL[b.motivo] || b.motivo}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: b.mais_antigo_horas > 24 ? '#ef4444' : 'var(--fg-subtle)',
                      padding: '3px 8px', borderRadius: 6,
                      background: b.mais_antigo_horas > 24 ? 'rgba(239,68,68,0.1)' : 'var(--surface-2)',
                    }}>
                      Mais antigo: {b.mais_antigo_horas}h
                    </span>
                  </button>
                  {isExpanded && convs.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                      {convs.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => openConversation(c.id)}
                          style={{
                            width: '100%', padding: '10px 16px 10px 46px', background: 'transparent',
                            border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{
                            fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
                            background: c.hours > 24 ? '#ef4444' : 'rgba(239,68,68,0.15)',
                            color: c.hours > 24 ? '#fff' : '#f87171',
                            minWidth: 60, textAlign: 'center', flexShrink: 0,
                          }}>
                            {c.hours < 1 ? `${Math.round(c.hours * 60)}min` : `${c.hours}h`}
                          </span>
                          <span style={{ fontSize: 13, color: 'var(--fg-dim)', fontWeight: 600, flex: 1, minWidth: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {c.customer_name}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Abrir →</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ============ URGENTES POR TEMPO ============ */}
      {aging.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Urgentes há mais tempo esperando
          </h2>
          <div style={{ borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            {aging.slice(0, 10).map((a, i) => (
              <button
                key={a.conversation_id}
                onClick={() => openConversation(a.conversation_id)}
                style={{
                  width: '100%', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
                  borderBottom: i < aging.length - 1 ? '1px solid var(--border)' : 'none',
                  background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
                  background: a.hours_waiting > 24 ? '#ef4444' : 'rgba(239,68,68,0.15)',
                  color: a.hours_waiting > 24 ? '#fff' : '#f87171',
                  minWidth: 70, textAlign: 'center', flexShrink: 0,
                }}>
                  {a.hours_waiting < 1 ? `${Math.round(a.hours_waiting * 60)}min` : `${a.hours_waiting}h`}
                </span>
                <span style={{ fontSize: 13, color: 'var(--fg-dim)', fontWeight: 600, flex: 1, minWidth: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {a.customer_name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--fg-subtle)', flex: 2, minWidth: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {MOTIVO_LABEL[a.priority_reason || ''] || a.priority_reason || a.ai_reason || '—'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--fg-subtle)', flexShrink: 0 }}>Abrir →</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

function KPI({ icon: Icon, label, value, subLabel, color }: {
  icon: any; label: string; value: string; subLabel?: string; color: string;
}) {
  return (
    <div style={{
      padding: 16, borderRadius: 12, background: 'var(--glass)',
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon size={14} style={{ color }} />
        <span style={{ fontSize: 11, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
      </div>
      <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--strong-text)', margin: '0 0 2px' }}>{value}</p>
      {subLabel && <p style={{ fontSize: 11, color: 'var(--fg-subtle)', margin: 0 }}>{subLabel}</p>}
    </div>
  );
}

function SLABar({ total, buckets }: { total: number; buckets: { label: string; count: number; color: string }[] }) {
  return (
    <>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        {buckets.map((b) => {
          const pct = total > 0 ? (b.count / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div key={b.label} style={{ width: `${pct}%`, background: b.color }} title={`${b.label}: ${b.count} (${pct.toFixed(1)}%)`} />
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {buckets.map((b) => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color }} />
            <span style={{ color: 'var(--fg-muted)' }}>{b.label}:</span>
            <span style={{ color: 'var(--fg-dim)', fontWeight: 600 }}>{b.count}</span>
          </div>
        ))}
      </div>
    </>
  );
}
