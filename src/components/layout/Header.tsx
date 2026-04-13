import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Bell, Menu } from 'lucide-react';
import { IAStatusPill } from './IAStatusPill';

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
  const currentRoute = routeNames[pathname] || 'Dashboard';

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{
        height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'rgba(9,9,11,0.8)', backdropFilter: 'blur(24px)',
      }}
    >
      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={onMenuClick} className="hide-desktop" style={{ padding: 8, borderRadius: 8, background: 'none', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer' }}>
          <Menu size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <span style={{ color: 'var(--fg-subtle)' }}>Zeglam</span>
          <span style={{ color: 'var(--fg-faint)' }}>/</span>
          <span style={{ color: '#fff', fontWeight: 500 }}>{currentRoute}</span>
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
        <div className="hide-mobile"><IAStatusPill /></div>
        <button style={{ position: 'relative', padding: 8, borderRadius: 8, background: 'none', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer' }}>
          <Bell size={18} />
          <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
        </button>
        <img src="/zeglam.png" alt="Zeglam" style={{ width: 32, height: 32, borderRadius: '50%' }} />
      </div>
    </motion.header>
  );
}
