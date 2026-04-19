import { FlaskConical } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';

export function SandboxBanner() {
  const instances = useDashboardStore((s) => s.instances);
  const activeInstanceId = useDashboardStore((s) => s.activeInstanceId);
  const active = instances.find((i) => i.evolutionInstanceId === activeInstanceId);

  if (!active?.isSandbox) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      padding: '8px 16px',
      background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.08))',
      borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
      fontSize: 12, fontWeight: 600, color: '#f59e0b',
    }}>
      <FlaskConical size={14} />
      <span>
        Modo sandbox — <strong>{active.displayName}</strong>. Aprendizado e base de conhecimento isolados da produção.
      </span>
    </div>
  );
}
