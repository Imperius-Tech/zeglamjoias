import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, UserPlus, CheckCircle2, XCircle, Clock, MessageSquare, Phone, Loader, MapPin, Tag, Building2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useDashboardStore } from '@/lib/store';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface GroupCandidateData {
  nome_completo?: string;
  nome_marca?: string;
  cidade?: string;
  galvanica?: string;
  outro_grupo?: string;
  outro_grupo_nome?: string;
}

interface InterestedCandidate {
  id: string;
  customer_name: string;
  customer_phone: string;
  group_candidate_status: 'intent_detectado' | 'aguardando_dados' | 'dados_coletados' | 'adicionada' | 'recusada';
  group_candidate_data: GroupCandidateData | null;
  group_candidate_updated_at: string | null;
  last_message_at: string;
  profile_pic_url: string | null;
}

const statusConfig = {
  intent_detectado: { label: 'Interesse Detectado', color: 'var(--amber)', icon: Clock, bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
  aguardando_dados: { label: 'Coletando dados', color: 'var(--amber)', icon: Clock, bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
  dados_coletados: { label: 'Pronto p/ Adicionar', color: 'var(--emerald)', icon: CheckCircle2, bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)' },
  adicionada: { label: 'Já adicionada', color: 'var(--accent)', icon: UserPlus, bg: 'rgba(212,168,67,0.1)', border: 'rgba(212,168,67,0.2)' },
  recusada: { label: 'Recusada', color: 'var(--fg-subtle)', icon: XCircle, bg: 'var(--glass)', border: 'var(--border)' },
};

const defaultStatus = { label: 'Desconhecido', color: 'var(--fg-subtle)', icon: Clock, bg: 'var(--glass)', border: 'var(--border)' };

type FilterStatus = 'all' | 'aguardando_dados' | 'dados_coletados' | 'adicionada' | 'recusada';

export default function InteressadosPage() {
  const navigate = useNavigate();
  const selectConversation = useDashboardStore((s) => s.selectConversation);
  const [candidates, setCandidates] = useState<InterestedCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadCandidates();

    const channel = supabase
      .channel('group-candidates-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
        // Only reload if the change is related to group candidates
        if (payload.new && (payload.new as any).group_candidate_status !== undefined) {
          loadCandidates();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadCandidates() {
    const { data } = await supabase
      .from('conversations')
      .select('id, customer_name, customer_phone, group_candidate_status, group_candidate_data, group_candidate_updated_at, last_message_at, profile_pic_url')
      .not('group_candidate_status', 'is', null)
      .order('group_candidate_updated_at', { ascending: false });
    
    if (data) {
      setCandidates(data as InterestedCandidate[]);
    }
    setLoading(false);
  }

  async function updateStatus(id: string, status: InterestedCandidate['group_candidate_status']) {
    setUpdating(true);
    await supabase.from('conversations').update({
      group_candidate_status: status,
      group_candidate_updated_at: new Date().toISOString(),
    }).eq('id', id);
    await loadCandidates();
    setUpdating(false);
  }

  const filtered = useMemo(() => {
    let list = candidates;
    if (filter !== 'all') list = list.filter((c) => c.group_candidate_status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => 
        c.customer_name.toLowerCase().includes(q) || 
        c.customer_phone.includes(q) || 
        (c.group_candidate_data?.nome_completo || '').toLowerCase().includes(q) ||
        (c.group_candidate_data?.nome_marca || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [candidates, filter, search]);

  const selected = selectedId ? candidates.find((c) => c.id === selectedId) : null;

  const counts = {
    all: candidates.length,
    aguardando_dados: candidates.filter((c) => c.group_candidate_status === 'aguardando_dados').length,
    dados_coletados: candidates.filter((c) => c.group_candidate_status === 'dados_coletados').length,
    adicionada: candidates.filter((c) => c.group_candidate_status === 'adicionada').length,
    recusada: candidates.filter((c) => c.group_candidate_status === 'recusada').length,
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Loader size={24} style={{ color: 'var(--fg-subtle)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Left: List */}
      <div style={{
        width: 400, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', borderRight: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--strong-text)' }}>Interessados no Grupo</h2>
            {counts.dados_coletados > 0 && (
              <span style={{
                padding: '2px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'rgba(16,185,129,0.15)', color: 'var(--emerald-light)',
              }}>
                {counts.dados_coletados} pronto{counts.dados_coletados > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-subtle)' }} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, marca ou celular..."
              style={{ width: '100%', height: 36, paddingLeft: 36, paddingRight: 16, borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--fg-dim)', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }} className="hide-scrollbar">
            {([
              { value: 'all', label: `Todos (${counts.all})` },
              { value: 'aguardando_dados', label: `Coletando (${counts.aguardando_dados})` },
              { value: 'dados_coletados', label: `Prontos (${counts.dados_coletados})` },
              { value: 'adicionada', label: `Adicionados (${counts.adicionada})` },
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
              <UserPlus size={32} style={{ color: 'var(--fg-faint)', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>
                {search || filter !== 'all' ? 'Nenhum interessado encontrado' : 'Nenhum interessado cadastrado'}
              </p>
            </div>
          ) : (
            filtered.map((candidate) => {
              const st = statusConfig[candidate.group_candidate_status as keyof typeof statusConfig] || defaultStatus;
              const StIcon = st.icon;
              const isActive = selectedId === candidate.id;
              return (
                <div key={candidate.id} onClick={() => setSelectedId(candidate.id)}
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
                  {/* Avatar */}
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-sec))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 800, color: 'var(--strong-text)',
                    border: '2px solid var(--border)',
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    {candidate.customer_name[0]?.toUpperCase()}
                    {candidate.profile_pic_url && (
                      <img 
                        src={candidate.profile_pic_url} 
                        alt="" 
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)' }}>
                        {candidate.group_candidate_data?.nome_completo || candidate.customer_name}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--fg-faint)', flexShrink: 0 }}>
                        {candidate.group_candidate_updated_at 
                          ? formatDistanceToNow(new Date(candidate.group_candidate_updated_at), { addSuffix: true, locale: ptBR })
                          : formatDistanceToNow(new Date(candidate.last_message_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--fg-subtle)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {candidate.group_candidate_data?.nome_marca ? (
                          <><Building2 size={10} /> {candidate.group_candidate_data.nome_marca}</>
                        ) : (
                          <><Phone size={10} /> {candidate.customer_phone}</>
                        )}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <StIcon size={10} style={{ color: st.color }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: st.color }}>{st.label}</span>
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
      <div style={{ flex: 1, height: '100%', overflowY: 'auto' }}>
        {selected ? (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ padding: '32px 40px', maxWidth: 800, margin: '0 auto' }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 24,
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-sec))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, fontWeight: 800, color: 'var(--strong-text)',
                  border: '3px solid var(--border)',
                }}>
                  {selected.customer_name[0]?.toUpperCase()}
                </div>
                <div>
                  <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--strong-text)', letterSpacing: '-0.02em' }}>
                    {selected.group_candidate_data?.nome_completo || selected.customer_name}
                  </h1>
                  <p style={{ fontSize: 14, color: 'var(--fg-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Phone size={12} /> {selected.customer_phone}
                  </p>
                </div>
              </div>
              <button
                onClick={async () => { await selectConversation(selected.id); navigate('/conversas'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--fg-dim)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                <MessageSquare size={16} /> Ver conversa
              </button>
            </div>

            {/* Status Info */}
            <div style={{ 
              marginBottom: 32, padding: 20, borderRadius: 16, 
              background: (statusConfig[selected.group_candidate_status as keyof typeof statusConfig] || defaultStatus).bg, 
              border: `1px solid ${(statusConfig[selected.group_candidate_status as keyof typeof statusConfig] || defaultStatus).border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {(() => {
                  const st = statusConfig[selected.group_candidate_status as keyof typeof statusConfig] || defaultStatus;
                  const Icon = st.icon;
                  return <Icon size={20} style={{ color: st.color }} />;
                })()}
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: (statusConfig[selected.group_candidate_status as keyof typeof statusConfig] || defaultStatus).color }}>
                    Status: {(statusConfig[selected.group_candidate_status as keyof typeof statusConfig] || defaultStatus).label}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 2 }}>
                    Atualizado {selected.group_candidate_updated_at ? formatDistanceToNow(new Date(selected.group_candidate_updated_at), { addSuffix: true, locale: ptBR }) : 'há pouco'}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {selected.group_candidate_status === 'dados_coletados' && (
                  <button onClick={() => updateStatus(selected.id, 'adicionada')} disabled={updating}
                    style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    Marcar como Adicionado
                  </button>
                )}
                {selected.group_candidate_status === 'adicionada' && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', opacity: 0.8 }}>Participando do grupo</span>
                )}
              </div>
            </div>

            {/* Data Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
              {[
                { label: 'Nome da Marca', value: selected.group_candidate_data?.nome_marca, icon: Building2 },
                { label: 'Cidade', value: selected.group_candidate_data?.cidade, icon: MapPin },
                { label: 'Galvânica Utilizada', value: selected.group_candidate_data?.galvanica, icon: Tag },
                { label: 'Indicação/Outro Grupo', value: selected.group_candidate_data?.outro_grupo_nome || selected.group_candidate_data?.outro_grupo, icon: ExternalLink },
              ].map((f) => (
                <div key={f.label} style={{ padding: 20, borderRadius: 16, background: 'var(--glass)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <f.icon size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</span>
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 600, color: f.value ? 'var(--strong-text)' : 'var(--fg-muted)', fontStyle: f.value ? 'normal' : 'italic' }}>
                    {f.value || 'Não informado'}
                  </p>
                </div>
              ))}
            </div>

            {/* Actions Footer */}
            <div style={{ paddingTop: 32, borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
              <button onClick={() => updateStatus(selected.id, 'recusada')} disabled={updating}
                style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Recusar Entrada
              </button>
              {selected.group_candidate_status === 'aguardando_dados' && (
                <button onClick={() => updateStatus(selected.id, 'dados_coletados')} disabled={updating}
                  style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'var(--emerald)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Aprovar Cadastro
                </button>
              )}
              {selected.group_candidate_status !== 'aguardando_dados' && selected.group_candidate_status !== 'adicionada' && (
                <button onClick={() => updateStatus(selected.id, 'aguardando_dados')} disabled={updating}
                  style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'var(--glass)', color: 'var(--fg-dim)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Voltar para Coleta
                </button>
              )}
            </div>
          </motion.div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              style={{ width: 80, height: 80, borderRadius: 24, background: 'var(--glass)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserPlus size={32} style={{ color: 'var(--fg-faint)' }} />
            </motion.div>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-muted)' }}>Selecione um candidato para ver os dados</motion.p>
          </div>
        )}
      </div>
    </div>
  );
}
