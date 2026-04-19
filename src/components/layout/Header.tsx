import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Bell, Menu, MessageSquare, AlertCircle, LogOut, Settings, Sun, Moon } from 'lucide-react';
import { IAStatusPill } from './IAStatusPill';
import { InstanceSwitcher } from './InstanceSwitcher';
import { useDashboardStore } from '@/lib/store';

const routeNames: Record<string, string> = {
  '/conversas': 'Conversas',
  '/clientes': 'Clientes',
  '/comprovantes': 'Comprovantes',
  '/conhecimento': 'Base de Conhecimento',
  '/metricas': 'Métricas',
  '/configuracoes': 'Configurações',
};

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const currentRoute = routeNames[pathname] || 'Dashboard';
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const conversations = useDashboardStore(s => s.conversations);
  const selectConversation = useDashboardStore(s => s.selectConversation);
  const theme = useDashboardStore(s => s.theme);
  const toggleTheme = useDashboardStore(s => s.toggleTheme);

  const waitingHuman = conversations.filter(c => c.status === 'aguardando_humano');
  const unreadConvs = conversations.filter(c => c.unreadCount > 0 && c.status !== 'aguardando_humano');
  const notificationsCount = waitingHuman.length + unreadConvs.length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    if (showNotifications || showUserMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications, showUserMenu]);

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'relative', zIndex: 50,
        height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--header-bg)', backdropFilter: 'blur(24px)',
      }}
    >
      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={onMenuClick} style={{ padding: 8, borderRadius: 8, background: 'none', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer' }}>
          <Menu size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <span style={{ color: 'var(--fg-subtle)' }}>Zeglam</span>
          <span style={{ color: 'var(--fg-faint)' }}>/</span>
          <span style={{ color: 'var(--strong-text)', fontWeight: 500 }}>{currentRoute}</span>
        </div>
      </div>

      {/* Center search */}
      <div className="hide-below-md" style={{ display: 'none', flex: 1, maxWidth: 400, margin: '0 32px' }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-subtle)' }} />
          <input
            type="text"
            placeholder="Buscar..."
            style={{
              width: '100%', height: 36, paddingLeft: 36, paddingRight: 16, borderRadius: 12,
              background: 'var(--glass)', border: '1px solid var(--border)',
              fontSize: 14, color: 'var(--fg-dim)', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="hide-mobile"><InstanceSwitcher /></div>
        <div className="hide-mobile"><IAStatusPill /></div>
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            style={{ position: 'relative', padding: 8, borderRadius: 8, background: showNotifications ? 'var(--surface-3)' : 'none', border: 'none', color: notificationsCount > 0 ? 'var(--fg)' : 'var(--fg-muted)', cursor: 'pointer', transition: 'background 0.2s' }}
          >
            <Bell size={18} />
            {notificationsCount > 0 && (
              <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
            )}
          </button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 8,
                  width: 320, background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
                  borderRadius: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', overflow: 'hidden', zIndex: 100,
                }}
              >
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--strong-text)' }}>Notificações</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {notificationsCount > 0 && (
                      <button 
                        onClick={() => {
                          const markAllAsRead = useDashboardStore.getState().markAllAsRead;
                          markAllAsRead();
                        }}
                        style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                      >
                        Limpar tudo
                      </button>
                    )}
                    {notificationsCount > 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--accent-bg)', color: 'var(--accent)', fontWeight: 600 }}>{notificationsCount}</span>}
                  </div>
                </div>
                
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {notificationsCount === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center' }}>
                      <Bell size={32} style={{ color: 'var(--border)', margin: '0 auto 12px' }} />
                      <p style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Nenhuma notificação nova</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {waitingHuman.map(c => (
                        <button
                          key={`wait-${c.id}`}
                          onClick={() => { selectConversation(c.id); navigate('/conversas'); setShowNotifications(false); }}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, borderBottom: '1px solid var(--border)', background: 'none', borderLeft: '3px solid var(--amber)', textAlign: 'left', cursor: 'pointer' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-3)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                        >
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <AlertCircle size={16} />
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-dim)', marginBottom: 4 }}>
                              <strong style={{ color: 'var(--strong-text)' }}>{c.customerName}</strong> aguarda atendimento humano
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>A IA pausou a conversa.</p>
                          </div>
                        </button>
                      ))}
                      {unreadConvs.map(c => (
                        <button
                          key={`unread-${c.id}`}
                          onClick={() => { selectConversation(c.id); navigate('/conversas'); setShowNotifications(false); }}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, borderBottom: '1px solid var(--border)', background: 'none', borderLeft: '3px solid var(--accent)', textAlign: 'left', cursor: 'pointer' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-3)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                        >
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-bg)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <MessageSquare size={16} />
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-dim)', marginBottom: 4 }}>
                              <strong style={{ color: 'var(--strong-text)' }}>{c.customerName}</strong> enviou {c.unreadCount} nova{c.unreadCount > 1 ? 's' : ''} mensagem{c.unreadCount > 1 ? 'ns' : ''}
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Clique para ver a conversa.</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div ref={userMenuRef} style={{ position: 'relative' }}>
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: '50%', outline: showUserMenu ? '2px solid var(--accent)' : 'none', outlineOffset: 2, transition: 'outline 0.2s' }}
          >
            <img src="/zeglam.png" alt="Zeglam" style={{ width: 32, height: 32, borderRadius: '50%', display: 'block' }} />
          </button>

          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 8,
                  width: 220, background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
                  borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', overflow: 'hidden', zIndex: 100,
                }}
              >
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--strong-text)' }}>Zevaldo</span>
                  <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Zeglam Joias</span>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', padding: 8 }}>
                  <button
                    onClick={() => { navigate('/configuracoes'); setShowUserMenu(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'none', border: 'none', color: 'var(--fg-dim)', fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--fg)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--fg-dim)'; }}
                  >
                    <Settings size={16} /> Configurações
                  </button>
                  <button
                    onClick={() => { toggleTheme(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'none', border: 'none', color: 'var(--fg-dim)', fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--fg)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--fg-dim)'; }}
                  >
                    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} 
                    Tema {theme === 'dark' ? 'Claro' : 'Escuro'}
                  </button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <button
                    onClick={async () => {
                      setShowUserMenu(false);
                      try {
                        const { supabase } = await import('@/lib/supabase');
                        await supabase.auth.signOut();
                      } catch (e) {
                        console.error('Logout failed', e);
                      }
                      navigate('/login');
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'none', border: 'none', color: 'var(--red)', fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <LogOut size={16} /> Sair da conta
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.header>
  );
}
