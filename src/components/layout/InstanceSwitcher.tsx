import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, FlaskConical, Building2 } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';

export function InstanceSwitcher() {
  const instances = useDashboardStore((s) => s.instances);
  const activeInstanceId = useDashboardStore((s) => s.activeInstanceId);
  const switchInstance = useDashboardStore((s) => s.switchInstance);

  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const active = instances.find((i) => i.evolutionInstanceId === activeInstanceId);
  if (instances.length === 0) return null;

  const Icon = active?.isSandbox ? FlaskConical : Building2;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 10,
          background: open ? 'var(--surface-3)' : 'var(--glass)',
          border: `1px solid ${active?.color || 'var(--border)'}40`,
          color: 'var(--strong-text)', fontSize: 12, fontWeight: 600,
          cursor: switching ? 'wait' : 'pointer',
          transition: 'all 0.15s',
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
        <ChevronDown size={12} style={{ color: 'var(--fg-subtle)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 8,
              width: 280, background: 'var(--surface-2)',
              border: '1px solid var(--border-strong)', borderRadius: 12,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)', overflow: 'hidden', zIndex: 100,
            }}
          >
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid var(--border)',
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--fg-subtle)',
            }}>
              Trocar instância
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', padding: 6 }}>
              {instances.map((inst) => {
                const isActive = inst.evolutionInstanceId === activeInstanceId;
                const InstIcon = inst.isSandbox ? FlaskConical : Building2;
                return (
                  <button
                    key={inst.id}
                    onClick={async () => {
                      if (isActive) { setOpen(false); return; }
                      setSwitching(true);
                      setOpen(false);
                      try {
                        await switchInstance(inst.evolutionInstanceId);
                      } finally {
                        setSwitching(false);
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8,
                      background: isActive ? 'var(--surface-3)' : 'none',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-3)'; }}
                    onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: `${inst.color}20`,
                      border: `1px solid ${inst.color}40`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <InstIcon size={14} style={{ color: inst.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)' }}>
                        {inst.displayName}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--fg-subtle)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {inst.isSandbox ? (
                          <span style={{ color: '#f59e0b', fontWeight: 600 }}>sandbox</span>
                        ) : (
                          <span style={{ color: '#10b981', fontWeight: 600 }}>produção</span>
                        )}
                        <span>·</span>
                        <span style={{ fontFamily: 'monospace' }}>{inst.evolutionInstanceName}</span>
                      </div>
                    </div>
                    {isActive && <Check size={14} style={{ color: inst.color, flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
