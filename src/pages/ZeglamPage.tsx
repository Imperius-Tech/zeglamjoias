import { useState, useEffect } from 'react';
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
  Wallet
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

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
  conversationId?: string;
  proofMessageId?: string;
}

export default function ZeglamPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'financeiro' | 'inadimplentes'>('inadimplentes');
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
  const [searchText, setSearchText] = useState('');

  const normalize = (str: string) => 
    str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const getDigits = (str: string) => {
    if (!str) return "";
    const cleanStr = str.split('|')[0];
    return cleanStr.replace(/\D/g, "");
  };

  const fetchData = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const { data: allData, error: functionError } = await supabase.functions.invoke('zeglam-api', { 
        body: { action: 'get_all' } 
      });

      if (functionError) throw new Error(functionError.message);
      
      const [proofsRes, convsRes] = await Promise.all([
        supabase.from('payment_proofs')
          .select('customer_name, message_id, conversation_id, detected_value, created_at')
          .eq('status', 'pendente')
          .order('created_at', { ascending: false }),
        supabase.from('conversations').select('id, customer_name')
      ]);

      const proofs = proofsRes.data || [];
      const conversations = convsRes.data || [];

      const crossedPending = (allData?.pending || []).map((customer: any) => {
        const normalizedZeglamName = normalize(customer.cliente);
        const zeglamValueDigits = getDigits(customer.valor);
        
        const possibleProofs = proofs.filter(p => {
          if (!p.customer_name) return false;
          const pName = normalize(p.customer_name);
          return normalizedZeglamName.includes(pName) || pName.includes(normalizedZeglamName);
        });

        let matchedProof = possibleProofs.find(p => getDigits(p.detected_value) === zeglamValueDigits);
        if (!matchedProof && possibleProofs.length > 0) matchedProof = possibleProofs[0];

        const matchedConv = conversations.find(c => {
          if (!c.customer_name) return false;
          const cName = normalize(c.customer_name);
          return normalizedZeglamName.includes(cName) || cName.includes(normalizedZeglamName);
        });

        return {
          ...customer,
          hasProof: !!matchedProof,
          conversationId: matchedProof?.conversation_id || matchedConv?.id,
          proofMessageId: matchedProof?.message_id
        };
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

  const filteredPending = pendingCustomers.filter(customer => {
    const matchesSearch = normalize(customer.cliente).includes(normalize(searchText)) || 
                          normalize(customer.catalogo).includes(normalize(searchText));
    if (pendingFilter === 'com_comprovante') return matchesSearch && customer.hasProof;
    if (pendingFilter === 'sem_comprovante') return matchesSearch && !customer.hasProof;
    return matchesSearch;
  });

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
          <button onClick={() => setActiveTab('financeiro')} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: activeTab === 'financeiro' ? 'var(--surface-2)' : 'transparent', color: activeTab === 'financeiro' ? 'var(--accent)' : 'var(--fg-muted)', border: 'none', cursor: 'pointer' }}>Relatório Financeiro</button>
        </div>

        {activeTab === 'inadimplentes' && (
          <>
            {/* Search and Filters - RESTORED */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-muted)' }} />
                <input type="text" placeholder="Pesquisar cliente..." value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: 10, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--strong-text)', fontSize: 13 }} />
              </div>
              
              <div style={{ display: 'flex', gap: 6, background: 'var(--glass)', padding: 4, borderRadius: 10, border: '1px solid var(--border)' }}>
                <button onClick={() => setPendingFilter('todos')} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: pendingFilter === 'todos' ? 'var(--surface-3)' : 'transparent', color: pendingFilter === 'todos' ? 'var(--strong-text)' : 'var(--fg-muted)', border: 'none', cursor: 'pointer' }}>TODOS</button>
                <button onClick={() => setPendingFilter('com_comprovante')} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: pendingFilter === 'com_comprovante' ? 'rgba(59,130,246,0.15)' : 'transparent', color: pendingFilter === 'com_comprovante' ? '#3b82f6' : 'var(--fg-muted)', border: 'none', cursor: 'pointer' }}>COM COMPROVANTE ({counts.com_comprovante})</button>
                <button onClick={() => setPendingFilter('sem_comprovante')} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: pendingFilter === 'sem_comprovante' ? 'rgba(239,68,68,0.1)' : 'transparent', color: pendingFilter === 'sem_comprovante' ? '#ef4444' : 'var(--fg-muted)', border: 'none', cursor: 'pointer' }}>SEM COMPROVANTE</button>
              </div>
            </div>

            <div style={{ background: 'var(--glass)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead><tr style={{ background: 'var(--surface-2)' }}><th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase' }}>Cliente</th><th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase' }}>Cruzamento</th><th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase' }}>Atraso</th><th style={{ padding: '10px 20px', fontSize: 10, fontWeight: 800, color: 'var(--fg-faint)', textTransform: 'uppercase', textAlign: 'right' }}>Valor</th></tr></thead>
                  <tbody>{filteredPending.map((item, i) => (<tr key={i} style={{ borderBottom: i < filteredPending.length - 1 ? '1px solid var(--border)' : 'none' }}><td style={{ padding: '12px 20px' }}>
                    <div 
                      onClick={() => item.salesId && handleCustomerClick(item.salesId)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: item.salesId ? 'pointer' : 'default' }}
                      className="customer-row"
                    >
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}><UserX size={12} /></div>
                      <div><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)' }}>{item.cliente}</span><ChevronRight size={10} style={{ color: 'var(--fg-faint)' }} /></div><div style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>{item.catalogo}</div></div>
                    </div>
                  </td><td style={{ padding: '12px 20px' }}>{item.hasProof ? (<div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontSize: 10, fontWeight: 800 }}><FileCheck size={10} /> BATENDO</div>) : (<span style={{ fontSize: 10, color: 'var(--fg-faint)', fontWeight: 600 }}>NÃO ENCONTRADO</span>)}</td><td style={{ padding: '12px 20px' }}><span style={{ fontSize: 11, fontWeight: 600, color: item.statusType === 'danger' ? '#ef4444' : '#f59e0b' }}>{item.atraso}</span></td><td style={{ padding: '12px 20px', textAlign: 'right' }}><div style={{ fontSize: 13, fontWeight: 800, color: '#ef4444' }}>{item.valor}</div></td></tr>))}</tbody>
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
