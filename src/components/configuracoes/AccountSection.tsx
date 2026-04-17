import { useState } from 'react';
import type { AccountSettings } from '@/lib/storage';
import { FieldGroup, TextInput, SectionTitle, SaveButton } from './SettingsField';

export function AccountSection({ data, onSave }: { data: AccountSettings; onSave: (d: AccountSettings) => void }) {
  const [form, setForm] = useState(data);
  const [saving, setSaving] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [passError, setPassError] = useState('');

  const update = <K extends keyof AccountSettings>(k: K, v: AccountSettings[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = () => {
    if (passwords.newPass && passwords.newPass !== passwords.confirm) {
      setPassError('As senhas não coincidem');
      return;
    }
    setPassError('');
    setSaving(true);
    setTimeout(() => {
      onSave(form);
      setPasswords({ current: '', newPass: '', confirm: '' });
      setSaving(false);
    }, 400);
  };

  const initials = form.fullName
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <div>
      <SectionTitle title="Conta" subtitle="Suas informações pessoais e segurança" />

      <div style={{
        padding: 20, borderRadius: 14, background: 'var(--glass)',
        border: '1px solid var(--border)', marginBottom: 28,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent), var(--accent-sec))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 800, color: 'var(--strong-text)', flexShrink: 0,
        }}>
          {initials}
        </div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--strong-text)' }}>{form.fullName || 'Seu nome'}</p>
          <p style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Administrador</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        <FieldGroup label="Nome completo">
          <TextInput value={form.fullName} onChange={(v) => update('fullName', v)} placeholder="Seu nome" />
        </FieldGroup>
        <FieldGroup label="Email">
          <TextInput value={form.email} onChange={(v) => update('email', v)} placeholder="seu@email.com" type="email" />
        </FieldGroup>
      </div>

      <div style={{
        padding: 20, borderRadius: 14, background: 'var(--glass)',
        border: '1px solid var(--border)', marginBottom: 24,
      }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)', marginBottom: 16 }}>Alterar senha</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <FieldGroup label="Senha atual">
            <TextInput value={passwords.current} onChange={(v) => setPasswords((p) => ({ ...p, current: v }))} type="password" placeholder="••••••" />
          </FieldGroup>
          <FieldGroup label="Nova senha">
            <TextInput value={passwords.newPass} onChange={(v) => setPasswords((p) => ({ ...p, newPass: v }))} type="password" placeholder="••••••" />
          </FieldGroup>
          <FieldGroup label="Confirmar nova senha">
            <TextInput value={passwords.confirm} onChange={(v) => setPasswords((p) => ({ ...p, confirm: v }))} type="password" placeholder="••••••" />
          </FieldGroup>
        </div>
        {passError && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{passError}</p>}
      </div>

      <SaveButton onClick={handleSave} saving={saving} />
    </div>
  );
}
