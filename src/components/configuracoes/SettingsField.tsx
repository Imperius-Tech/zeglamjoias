import { type ReactNode } from 'react';

export function FieldGroup({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--strong-text)', marginBottom: 4 }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: 'var(--fg-subtle)', marginBottom: 8 }}>{description}</p>}
      {children}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder, type = 'text', readOnly = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; readOnly?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      style={{
        width: '100%', height: 40, padding: '0 14px', borderRadius: 10,
        background: readOnly ? 'var(--glass)' : 'var(--surface-2)',
        border: '1px solid var(--border)',
        fontSize: 13, color: readOnly ? 'var(--fg-subtle)' : 'var(--fg-dim)',
        transition: 'border-color 0.2s',
        cursor: readOnly ? 'default' : 'text',
      }}
    />
  );
}

export function TextArea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%', padding: '10px 14px', borderRadius: 10,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        fontSize: 13, color: 'var(--fg-dim)', resize: 'vertical',
        lineHeight: 1.5, transition: 'border-color 0.2s',
      }}
    />
  );
}

export function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%', height: 40, padding: '0 14px', borderRadius: 10,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        fontSize: 13, color: 'var(--fg-dim)', cursor: 'pointer',
      }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
        background: 'none', border: 'none', cursor: 'pointer', width: '100%',
      }}
    >
      <div style={{
        width: 44, height: 24, borderRadius: 12, padding: 2,
        background: checked ? 'var(--accent)' : 'var(--surface-3)',
        transition: 'background 0.2s', flexShrink: 0,
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: 10,
          background: '#fff',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      <span style={{ fontSize: 13, color: 'var(--fg-dim)' }}>{label}</span>
    </button>
  );
}

export function SaveButton({ onClick, saving }: { onClick: () => void; saving?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 24px', borderRadius: 10,
        background: 'var(--accent)', color: '#fff',
        fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
        opacity: saving ? 0.6 : 1,
        transition: 'opacity 0.2s, transform 0.1s',
      }}
    >
      {saving ? 'Salvando...' : 'Salvar alterações'}
    </button>
  );
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--strong-text)', letterSpacing: '-0.02em' }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 4 }}>{subtitle}</p>}
    </div>
  );
}
