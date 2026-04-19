import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SandboxBanner } from './SandboxBanner';

export function DashboardShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
