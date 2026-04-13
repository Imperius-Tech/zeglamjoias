import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function DashboardShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-with-sidebar" style={{ marginLeft: 0, height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            pointerEvents: 'none', position: 'absolute', top: 0, right: 0,
            width: 600, height: 400,
            background: 'radial-gradient(ellipse at top right, rgba(255,77,0,0.06), transparent 70%)',
          }} />
          {children}
        </main>
      </div>
    </div>
  );
}
