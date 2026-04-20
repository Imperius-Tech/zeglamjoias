import { FlaskConical, Building2 } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';

export function InstanceSwitcher() {
  const instances = useDashboardStore((s) => s.instances);
  const activeInstanceId = useDashboardStore((s) => s.activeInstanceId);

  const active = instances.find((i) => i.evolutionInstanceId === activeInstanceId);
  if (instances.length === 0) return null;

  const Icon = active?.isSandbox ? FlaskConical : Building2;

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 10,
          background: 'var(--glass)',
          border: `1px solid ${active?.color || 'var(--border)'}40`,
          color: 'var(--strong-text)', fontSize: 12, fontWeight: 600,
        }}
      >
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: active?.color || 'var(--accent)',
          boxShadow: `0 0 6px ${active?.color || 'var(--accent)'}80`,
        }} />
        <Icon size={13} style={{ color: active?.color || 'var(--fg-muted)' }} />
        <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {active?.displayName || 'Sem instância'}
        </span>
      </div>
    </div>
  );
}
