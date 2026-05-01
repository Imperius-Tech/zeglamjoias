import { useState, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SandboxBanner } from './SandboxBanner';

const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;

export function DashboardShell({ children }: { children: ReactNode }) {
  // Default: aberto em desktop, fechado em mobile
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile());
  const { pathname } = useLocation();

  // Auto-close em mobile quando navega
  useEffect(() => {
    if (isMobile()) setSidebarOpen(false);
  }, [pathname]);

  // Re-sync ao redimensionar janela (ex: rotação ou resize)
  useEffect(() => {
    const onResize = () => {
      const mobile = isMobile();
      setSidebarOpen((cur) => (mobile ? false : cur || true));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className={sidebarOpen ? 'sidebar-open' : ''} style={{ height: '100vh', overflow: 'hidden', background: 'transparent' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-with-sidebar" style={{ height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <SandboxBanner />
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            pointerEvents: 'none', position: 'absolute', top: 0, right: 0,
            width: '60vw', height: '60vh',
            background: 'radial-gradient(ellipse at top right, rgba(212, 175, 55, 0.08), transparent 70%)',
          }} />
          {children}
        </main>
      </div>
    </div>
  );
}
