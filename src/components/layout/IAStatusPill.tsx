import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';

export function IAStatusPill() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    supabase.from('ai_config').select('enabled').limit(1).single().then(({ data }) => {
      if (data) setEnabled(data.enabled);
    });
  }, []);

  const toggle = async () => {
    if (toggling || enabled === null) return;
    setToggling(true);
    const newVal = !enabled;
    setEnabled(newVal);
    await supabase.from('ai_config').update({ enabled: newVal, updated_at: new Date().toISOString() }).not('id', 'is', null);
    setToggling(false);
  };

  if (enabled === null) return null;

  return (
    <motion.button
      onClick={toggle}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.95 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', borderRadius: 999,
        background: 'var(--glass-strong)', backdropFilter: 'blur(24px)',
        border: `1px solid ${enabled ? 'rgba(16,185,129,0.3)' : 'var(--border-strong)'}`,
        cursor: 'pointer',
      }}
    >
      <span style={{ position: 'relative', width: 8, height: 8, display: 'inline-flex' }}>
        {enabled && <span className="anim-ping" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--emerald-light)', opacity: 0.75 }} />}
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: enabled ? 'var(--emerald)' : 'var(--fg-faint)' }} />
      </span>
      <span style={{ fontSize: 12, fontWeight: 500, color: enabled ? 'var(--fg-dim)' : 'var(--fg-subtle)' }}>
        {enabled ? 'IA ativa' : 'IA pausada'}
      </span>
    </motion.button>
  );
}
