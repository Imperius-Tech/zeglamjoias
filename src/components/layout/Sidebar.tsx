import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, BookOpen, FileCheck, BarChart3, Settings, X, Users, Zap, LogOut, RefreshCw, Loader } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';

const navItems = [
  { href: '/conversas', label: 'Conversas', icon: MessageSquare, badge: true },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/conhecimento', label: 'Base de Conhecimento', icon: BookOpen },
  { href: '/comprovantes', label: 'Comprovantes', icon: FileCheck },
  { href: '/automacoes', label: 'Automações', icon: Zap },
  { href: '/metricas', label: 'Métricas', icon: BarChart3 },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pathname } = useLocation();
  const conversations = useDashboardStore((s) => s.conversations);
  const loadConversations = useDashboardStore((s) => s.loadConversations);
  const unreadTotal = conversations.reduce((a, c) => a + c.unreadCount, 0);
  const [switching, setSwitching] = useState(false);
  const [currentInst, setCurrentInst] = useState<string>('');

  useEffect(() => {
    supabase.from('evolution_config').select('active_instance_id').limit(1).maybeSingle().then(({ data }) => {
      if (data) setCurrentInst(data.active_instance_id);
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const activeInstanceName = useDashboardStore((s) => s.activeInstanceName);

  return (
    <>
      {open && (
        <div onClick={onClose} className="hide-desktop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
      )}
      <aside
        className="sidebar-fixed"
        style={{
          position: 'fixed', top: 0, left: 0, height: '100%', width: 260, zIndex: 50,
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', borderRight: '1px solid var(--border)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '24px 24px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/zeglam.png" alt="Zeglam" style={{ width: 32, height: 32, borderRadius: 8 }} />
              <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--strong-text)' }}>ZEGLAM</span>
              <span style={{ position: 'relative', width: 8, height: 8, display: 'inline-flex' }}>
                {unreadTotal > 0 && (
                  <span className="anim-ping" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--accent)', opacity: 0.75 }} />
                )}
                <span style={{ 
                  width: 8, height: 8, borderRadius: '50%', 
                  background: unreadTotal > 0 ? 'var(--accent)' : 'var(--emerald)',
                  boxShadow: unreadTotal > 0 ? '0 0 10px var(--accent)' : 'none',
                  transition: 'all 0.3s'
                }} />
              </span>
            </div>
            <button onClick={onClose} className="hide-desktop" style={{ padding: 4, borderRadius: 8, background: 'none', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>
          <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: 'var(--fg-subtle)', marginTop: 4 }}>
            Painel IA
          </p>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={onClose}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12,
                  textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'all 0.2s',
                  color: active ? 'var(--strong-text)' : 'var(--fg-muted)',
                  background: active ? 'var(--glass-strong)' : 'transparent',
                  borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                <Icon size={18} style={{ color: active ? 'var(--accent)' : undefined }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && unreadTotal > 0 && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10,
                    background: 'var(--accent)', fontSize: 10, fontWeight: 700, color: '#fff',
                  }}>
                    {unreadTotal}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User card */}
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12,
            background: 'var(--glass)', border: '1px solid var(--border)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-sec))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: 'var(--strong-text)',
            }}>{activeInstanceName?.[0]?.toUpperCase() || 'W'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: 'var(--strong-text)' }}>{activeInstanceName || 'WhatsApp'}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--emerald)' }} />
                <span style={{ fontSize: 11, color: 'var(--emerald-light)' }}>Online</span>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sair"
              style={{
                width: 32, height: 32, borderRadius: 8, background: 'rgba(239,68,68,0.1)',
                border: 'none', color: '#fca5a5', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
