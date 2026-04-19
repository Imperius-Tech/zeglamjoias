import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Phone, MessageSquare, Clock, Users, Calendar, ArrowRight, Brain, RefreshCw, Loader, Target, TrendingUp, Tag, AlertCircle, UserPlus, CheckCircle2, Circle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDashboardStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Conversation } from '@/lib/mock-data';

const avatarGradients = [
  'linear-gradient(135deg,#f43f5e,#db2777)', 'linear-gradient(135deg,#8b5cf6,#7c3aed)',
  'linear-gradient(135deg,#3b82f6,#4f46e5)', 'linear-gradient(135deg,#06b6d4,#0d9488)',
  'linear-gradient(135deg,#f59e0b,#ea580c)', 'linear-gradient(135deg,#10b981,#16a34a)',
  'linear-gradient(135deg,#d946ef,#db2777)', 'linear-gradient(135deg,#0ea5e9,#3b82f6)',
];

function pickGradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return avatarGradients[Math.abs(h) % avatarGradients.length];
}

function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  if (src && !imgError) {
    return <img src={src} alt={name} onError={() => setImgError(true)} style={{ width: size, height: size, borderRadius: size / 2, objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      background: pickGradient(name),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: 'var(--strong-text)',
    }}>
      {name[0]?.toUpperCase()}
    </div>
  );
}

const sentimentColors: Record<string, string> = {
  positivo: 'var(--emerald)',
  neutro: 'var(--fg-subtle)',
  negativo: 'var(--amber)',
  insatisfeito: 'var(--red)',
};

const prioridadeColors: Record<string, string> = {
  altissima: '#ef4444',
  alta: 'var(--red)',
  media: 'var(--amber)',
  baixa: 'var(--fg-subtle)',
};

const prioridadeLabels: Record<string, string> = {
  altissima: 'Altíssima',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

interface Analysis {
  intencao?: string;
  status_atendimento?: string;
  interesse_produtos?: string[];
  sentimento?: string;
  prioridade?: string;
  resumo?: string;
  proxima_acao?: string;
  valor_potencial?: string;
  tags?: string[];
}

function AIAnalysisPanel({ conversationId }: { conversationId: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchAnalysis = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase.functions.invoke('evolution-client-analysis', {
        body: { conversationId, forceRefresh: force },
      });
      if (data?.analysis) {
        setAnalysis(data.analysis);
        // Update conversation_type locally without reloading all conversations
        if (!data.cached && data.analysis.conversation_type) {
          useDashboardStore.setState((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === conversationId
                ? { ...c, conversationType: data.analysis.conversation_type }
                : c
            ),
          }));
        }
      }
      else if (data?.error) setError(data.error);
    } catch (e: any) {
      setError(e.message || 'Erro ao analisar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, [conversationId]);

  if (loading) {
    return (
      <div style={{ padding: 20, borderRadius: 14, background: 'var(--glass)', border: '1px solid var(--border)', textAlign: 'center' }}>
        <Loader size={20} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
        <p style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Analisando conversa com IA...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20, borderRadius: 14, background: 'var(--glass)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <AlertCircle size={14} style={{ color: 'var(--red)' }} />
          <p style={{ fontSize: 12, color: 'var(--red)' }}>{error}</p>
        </div>
        <button onClick={() => fetchAnalysis(true)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={16} style={{ color: 'var(--accent)' }} />
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--strong-text)' }}>Análise da IA</p>
        </div>
        <button
          onClick={() => fetchAnalysis(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-subtle)', fontSize: 10, cursor: 'pointer' }}
        >
          <RefreshCw size={10} /> Atualizar
        </button>
      </div>

      {/* Resumo */}
      {analysis.resumo && (
        <div style={{ padding: 16, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.6 }}>{analysis.resumo}</p>
        </div>
      )}

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {/* Intenção */}
        <div style={{ padding: 14, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Target size={12} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 10, color: 'var(--fg-subtle)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Intenção</span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)' }}>{analysis.intencao || 'Indefinida'}</p>
        </div>

        {/* Sentimento */}
        <div style={{ padding: 14, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <TrendingUp size={12} style={{ color: sentimentColors[analysis.sentimento || ''] || 'var(--fg-subtle)' }} />
            <span style={{ fontSize: 10, color: 'var(--fg-subtle)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Sentimento</span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, color: sentimentColors[analysis.sentimento || ''] || 'var(--fg-dim)' }}>
            {analysis.sentimento ? analysis.sentimento.charAt(0).toUpperCase() + analysis.sentimento.slice(1) : 'N/A'}
          </p>
        </div>

        {/* Prioridade */}
        <div style={{ padding: 14, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <AlertCircle size={12} style={{ color: prioridadeColors[analysis.prioridade || ''] || 'var(--fg-subtle)' }} />
            <span style={{ fontSize: 10, color: 'var(--fg-subtle)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Prioridade</span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, color: prioridadeColors[analysis.prioridade || ''] || 'var(--fg-dim)' }}>
            {analysis.prioridade ? (prioridadeLabels[analysis.prioridade] || analysis.prioridade) : 'N/A'}
          </p>
        </div>

        {/* Valor potencial */}
        <div style={{ padding: 14, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <TrendingUp size={12} style={{ color: 'var(--emerald)' }} />
            <span style={{ fontSize: 10, color: 'var(--fg-subtle)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Potencial</span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)' }}>{analysis.valor_potencial || 'N/A'}</p>
        </div>
      </div>

      {/* Status atendimento */}
      {analysis.status_atendimento && (
        <div style={{ padding: 14, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: 10, color: 'var(--fg-subtle)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Status do atendimento</span>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)', marginTop: 4 }}>{analysis.status_atendimento.replace(/_/g, ' ')}</p>
        </div>
      )}

      {/* Próxima ação */}
      {analysis.proxima_acao && (
        <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,77,0,0.06)', border: '1px solid var(--accent-border)' }}>
          <span style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Próxima ação recomendada</span>
          <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginTop: 4, lineHeight: 1.5 }}>{analysis.proxima_acao}</p>
        </div>
      )}

      {/* Interesse em produtos */}
      {analysis.interesse_produtos && analysis.interesse_produtos.length > 0 && (
        <div style={{ padding: 14, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: 10, color: 'var(--fg-subtle)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Interesse em produtos</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {analysis.interesse_produtos.map((p) => (
              <span key={p} style={{ padding: '3px 10px', borderRadius: 6, background: 'rgba(212,168,67,0.12)', color: '#d4a843', fontSize: 11, fontWeight: 500 }}>{p}</span>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {analysis.tags && analysis.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {analysis.tags.map((tag) => (
            <span key={tag} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 10px', borderRadius: 6,
              background: 'var(--glass)', border: '1px solid var(--border)',
              fontSize: 10, color: 'var(--fg-muted)', fontWeight: 500,
            }}>
              <Tag size={8} /> {tag.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupCandidateProfilePanel({ conv }: { conv: Conversation }) {
  const data = conv.groupCandidateData;
  const status = conv.groupCandidateStatus;
  if (!status || !data) return null;

  const fields: { key: keyof NonNullable<typeof data>; label: string }[] = [
    { key: 'nome_completo', label: 'Nome completo' },
    { key: 'nome_marca', label: 'Marca' },
    { key: 'cidade', label: 'Cidade' },
    { key: 'galvanica', label: 'Galvânica' },
    { key: 'outro_grupo', label: 'Outro grupo?' },
    { key: 'outro_grupo_nome', label: 'Indicação' },
  ];

  const statusConfig = {
    aguardando_dados: { label: 'Coletando dados', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)' },
    dados_coletados: { label: 'Pronta para adicionar', color: 'var(--emerald-light)', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)' },
    adicionada: { label: 'Já adicionada ao grupo', color: '#60a5fa', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)' },
    recusada: { label: 'Recusada', color: 'var(--fg-subtle)', bg: 'var(--glass)', border: 'var(--border)' },
  };
  const s = statusConfig[status as keyof typeof statusConfig] || statusConfig.aguardando_dados;

  return (
    <div style={{
      marginBottom: 24,
      padding: 16,
      borderRadius: 14,
      background: s.bg,
      border: `1px solid ${s.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <UserPlus size={15} style={{ color: s.color }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--strong-text)' }}>
          Cadastro para entrada no grupo
        </span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          padding: '3px 8px', borderRadius: 6,
          background: s.border, color: s.color,
        }}>
          {s.label}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {fields.map((f) => {
          const val = data[f.key];
          const filled = !!val;
          return (
            <div key={f.key} style={{
              display: 'flex', flexDirection: 'column', gap: 3,
              padding: '10px 12px', borderRadius: 10,
              background: 'var(--glass)',
              border: '1px solid var(--border)',
              opacity: filled ? 1 : 0.55,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {filled
                  ? <CheckCircle2 size={11} style={{ color: 'var(--emerald-light)' }} />
                  : <Circle size={11} style={{ color: 'var(--fg-subtle)' }} />
                }
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fg-subtle)' }}>
                  {f.label}
                </span>
              </div>
              <span style={{
                fontSize: 13, color: filled ? 'var(--strong-text)' : 'var(--fg-subtle)',
                fontStyle: filled ? 'normal' : 'italic',
                wordBreak: 'break-word',
              }}>
                {filled ? (val as string) : 'não informado'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClientDetail({ conv, onOpenChat }: { conv: Conversation; onOpenChat: () => void }) {
  const totalMessages = conv.messages.length;
  const clientMessages = conv.messages.filter((m) => m.author === 'cliente').length;
  const sentMessages = totalMessages - clientMessages;
  const firstMessage = conv.messages[0];
  const lastMessage = conv.messages[conv.messages.length - 1];

  return (
    <motion.div
      key={conv.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      style={{ padding: '32px 36px', overflowY: 'auto', height: '100%' }}
    >
      {/* Profile header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
        <Avatar src={conv.profilePicUrl} name={conv.customerName} size={72} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--strong-text)', letterSpacing: '-0.02em' }}>
              {conv.customerName}
            </h2>
            {conv.conversationType === 'personal' && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontWeight: 600 }}>Pessoal</span>
            )}
            {conv.conversationType === 'business' && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.15)', color: 'var(--emerald-light)', fontWeight: 600 }}>Negócio</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Phone size={12} style={{ color: 'var(--fg-subtle)' }} />
            <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{conv.customerPhone}</span>
          </div>
        </div>
      </div>

      {/* Action button */}
      <button
        onClick={onOpenChat}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '12px 16px', borderRadius: 12, marginBottom: 24,
          background: 'var(--accent)', color: '#fff',
          fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer',
          justifyContent: 'center',
        }}
      >
        <MessageSquare size={16} /> Abrir conversa <ArrowRight size={14} />
      </button>

      {/* Dados de Cadastro do Grupo */}
      <GroupCandidateProfilePanel conv={conv} />

      {/* AI Analysis */}
      <div style={{ marginBottom: 24 }}>
        <AIAnalysisPanel conversationId={conv.id} />
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
        <div style={{ padding: 14, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)', textAlign: 'center' }}>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--strong-text)' }}>{totalMessages}</p>
          <p style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>Mensagens</p>
        </div>
        <div style={{ padding: 14, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)', textAlign: 'center' }}>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--strong-text)' }}>{clientMessages}</p>
          <p style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>Recebidas</p>
        </div>
        <div style={{ padding: 14, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)', textAlign: 'center' }}>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--strong-text)' }}>{sentMessages}</p>
          <p style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>Enviadas</p>
        </div>
      </div>

      {/* Timeline */}
      <div style={{ padding: 16, borderRadius: 14, background: 'var(--glass)', border: '1px solid var(--border)', marginBottom: 24 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Linha do tempo</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {firstMessage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={12} style={{ color: 'var(--fg-subtle)', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Primeira: {format(firstMessage.timestamp, "dd/MM/yy HH:mm", { locale: ptBR })}</span>
            </div>
          )}
          {lastMessage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={12} style={{ color: 'var(--fg-subtle)', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Última: {format(lastMessage.timestamp, "dd/MM/yy HH:mm", { locale: ptBR })}</span>
            </div>
          )}
        </div>
      </div>

      {/* Recent messages */}
      <div style={{ padding: 16, borderRadius: 14, background: 'var(--glass)', border: '1px solid var(--border)' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Últimas mensagens</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conv.messages.slice(-5).map((msg) => (
            <div key={msg.id} style={{ display: 'flex', gap: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                color: msg.author === 'cliente' ? 'var(--fg-subtle)' : msg.sentBy === 'ai' ? 'var(--accent)' : 'var(--emerald-light)',
                width: 45, flexShrink: 0, paddingTop: 2,
              }}>
                {msg.author === 'cliente' ? 'Cliente' : msg.sentBy === 'ai' ? 'IA' : 'Você'}
              </span>
              <p className="truncate" style={{ fontSize: 12, color: 'var(--fg-dim)', flex: 1 }}>{msg.content}</p>
              <span style={{ fontSize: 10, color: 'var(--fg-faint)', flexShrink: 0 }}>{format(msg.timestamp, 'HH:mm', { locale: ptBR })}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function ClientesPage() {
  const conversations = useDashboardStore((s) => s.conversations);
  const selectConversation = useDashboardStore((s) => s.selectConversation);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select client if ID is in URL
  useEffect(() => {
    const id = searchParams.get('id');
    if (id && conversations.some(c => c.id === id)) {
      setSelectedId(id);
    }
  }, [searchParams, conversations]);

  const clients = useMemo(() => {
    let list = [...conversations].sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.customerName.toLowerCase().includes(q) || c.customerPhone.includes(q));
    }
    return list;
  }, [conversations, search]);

  const selectedConv = selectedId ? conversations.find((c) => c.id === selectedId) : null;

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Left: Client list */}
      <div style={{
        width: 360, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', borderRight: '1px solid var(--border)',
      }}>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--strong-text)' }}>Clientes</h2>
            <span style={{ fontSize: 12, color: 'var(--fg-subtle)', background: 'var(--glass)', padding: '2px 10px', borderRadius: 8 }}>{clients.length}</span>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-subtle)' }} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..."
              style={{ width: '100%', height: 36, paddingLeft: 36, paddingRight: 16, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--fg-dim)', outline: 'none' }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
          {clients.map((c) => {
            const isActive = selectedId === c.id;
            return (
              <div key={c.id} onClick={() => setSelectedId(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                  background: isActive ? 'var(--hover)' : 'transparent',
                  borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                  transition: 'background 0.15s', marginBottom: 2,
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--glass-strong)'; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <Avatar src={c.profilePicUrl} name={c.customerName} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)' }}>{c.customerName}</span>
                    <span style={{ fontSize: 10, color: 'var(--fg-faint)', flexShrink: 0 }}>
                      {formatDistanceToNow(c.lastMessageAt, { addSuffix: false, locale: ptBR })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                    <span className="truncate" style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>{c.customerPhone}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {c.conversationType === 'personal' && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontWeight: 600 }}>P</span>}
                      {c.conversationType === 'business' && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: 'rgba(16,185,129,0.15)', color: 'var(--emerald-light)', fontWeight: 900 }}>N</span>}
                      <MessageSquare size={9} style={{ color: 'var(--fg-faint)' }} />
                      <span style={{ fontSize: 9, color: 'var(--fg-faint)' }}>{c.messages.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {clients.length === 0 && (
            <p style={{ textAlign: 'center', padding: '48px 0', fontSize: 14, color: 'var(--fg-subtle)' }}>Nenhum cliente encontrado</p>
          )}
        </div>
      </div>

      {/* Right: Client detail */}
      <div style={{ flex: 1, height: '100%', overflowY: 'auto' }}>
        {selectedConv ? (
          <ClientDetail conv={selectedConv} onOpenChat={() => { selectConversation(selectedConv.id); navigate('/conversas'); }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              style={{ width: 80, height: 80, borderRadius: 24, background: 'var(--glass)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={32} style={{ color: 'var(--fg-faint)' }} />
            </motion.div>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-muted)' }}>Selecione um cliente para ver detalhes</motion.p>
          </div>
        )}
      </div>
    </div>
  );
}
