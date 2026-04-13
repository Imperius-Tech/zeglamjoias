import { useState } from 'react';
import type { NotificationSettings } from '@/lib/storage';
import { Toggle, SectionTitle, SaveButton } from './SettingsField';

export function NotificationsSection({ data, onSave }: { data: NotificationSettings; onSave: (d: NotificationSettings) => void }) {
  const [form, setForm] = useState(data);
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof NotificationSettings>(k: K, v: NotificationSettings[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => { onSave(form); setSaving(false); }, 400);
  };

  return (
    <div>
      <SectionTitle title="Notificações" subtitle="Escolha quando e como ser alertado" />

      <div style={{
        padding: 20, borderRadius: 14, background: 'var(--glass)',
        border: '1px solid var(--border)', marginBottom: 24,
      }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Alertas de conversa</p>
        <Toggle
          checked={form.silencedConversation}
          onChange={(v) => update('silencedConversation', v)}
          label="Conversa silenciada (IA não soube responder)"
        />
        <Toggle
          checked={form.newCustomer}
          onChange={(v) => update('newCustomer', v)}
          label="Novo cliente (primeira mensagem)"
        />
        <Toggle
          checked={form.customerInactivity}
          onChange={(v) => update('customerInactivity', v)}
          label="Inatividade do cliente"
        />

        {form.customerInactivity && (
          <div style={{ paddingLeft: 56, marginTop: 4, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Alertar após</span>
              <input
                type="number"
                min={1}
                max={120}
                value={form.inactivityMinutes}
                onChange={(e) => update('inactivityMinutes', Number(e.target.value))}
                style={{
                  width: 60, height: 32, padding: '0 8px', borderRadius: 8, textAlign: 'center',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  fontSize: 12, color: 'var(--fg-dim)',
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>minutos</span>
            </div>
          </div>
        )}
      </div>

      <div style={{
        padding: 20, borderRadius: 14, background: 'var(--glass)',
        border: '1px solid var(--border)', marginBottom: 24,
      }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Geral</p>
        <Toggle
          checked={form.dailySummary}
          onChange={(v) => update('dailySummary', v)}
          label="Resumo diário por email"
        />
        <Toggle
          checked={form.sound}
          onChange={(v) => update('sound', v)}
          label="Som de notificação"
        />
      </div>

      <SaveButton onClick={handleSave} saving={saving} />
    </div>
  );
}
