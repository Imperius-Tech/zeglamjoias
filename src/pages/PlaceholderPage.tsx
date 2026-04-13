import { motion } from 'framer-motion';
import { FileCheck, BarChart3, Settings, Lock, type LucideIcon } from 'lucide-react';

const icons: Record<string, LucideIcon> = { FileCheck, BarChart3, Settings };

export default function PlaceholderPage({ title, description, icon }: { title: string; description: string; icon: string }) {
  const Icon = icons[icon] || Settings;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ width: 80, height: 80, borderRadius: 24, background: 'var(--glass)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <Icon size={32} style={{ color: 'var(--fg-faint)' }} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{title}</h2>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', marginBottom: 24, lineHeight: 1.6 }}>{description}</p>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 999, background: 'var(--glass)', border: '1px solid var(--border)' }}>
          <Lock size={12} style={{ color: 'var(--fg-subtle)' }} />
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: 'var(--fg-subtle)' }}>Em breve</span>
        </div>
      </motion.div>
    </div>
  );
}
