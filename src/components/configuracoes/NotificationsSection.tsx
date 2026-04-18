import { useState } from 'react';
import { motion } from 'framer-motion';
import type { NotificationSettings } from '@/lib/storage';
import { Toggle, SectionTitle, SaveButton, SelectInput, FieldGroup } from './SettingsField';
import { Volume2, Play } from 'lucide-react';
import { useSoundEffects } from '@/hooks/useSoundEffects';

export function NotificationsSection({ data, onSave }: { data: NotificationSettings; onSave: (d: NotificationSettings) => void }) {
  const [form, setForm] = useState(data);
  const [saving, setSaving] = useState(false);
  const { testSound } = useSoundEffects();

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
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)', marginBottom: 8 }}>Alertas de conversa</p>
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
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)', marginBottom: 8 }}>Configurações de Áudio</p>
        
        <Toggle
          checked={form.sound}
          onChange={(v) => update('sound', v)}
          label="Ativar sons de notificação"
        />

        {form.sound && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginTop: 16, overflow: 'hidden' }}>
            <FieldGroup label="Tipo de Som" description="Escolha o estilo do alerta sonoro">
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <SelectInput
                    value={form.incomingSound}
                    onChange={(v) => update('incomingSound', v as any)}
                    options={[
                      { value: 'default', label: 'Padrão (Sutil)' },
                      { value: 'elegant', label: 'Elegante (Cristalino)' },
                      { value: 'modern', label: 'Moderno (Tecnológico)' },
                    ]}
                  />
                </div>
                <button
                  onClick={() => testSound(form.incomingSound, form.soundVolume)}
                  style={{
                    width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 10, background: 'var(--surface-3)', border: '1px solid var(--border)',
                    cursor: 'pointer', color: 'var(--accent)',
                  }}
                  title="Testar Som"
                >
                  <Play size={16} fill="currentColor" style={{ pointerEvents: 'none' }} />
                </button>
              </div>
            </FieldGroup>

            <FieldGroup label="Volume do Som" description={`${Math.round(form.soundVolume * 100)}%`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Volume2 size={16} style={{ color: 'var(--fg-faint)' }} />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={form.soundVolume}
                  onChange={(e) => update('soundVolume', parseFloat(e.target.value))}
                  style={{
                    flex: 1, height: 4, borderRadius: 2, appearance: 'none',
                    background: 'var(--border)', outline: 'none', cursor: 'pointer',
                  }}
                />
              </div>
            </FieldGroup>
          </motion.div>
        )}
      </div>

      <div style={{
        padding: 20, borderRadius: 14, background: 'var(--glass)',
        border: '1px solid var(--border)', marginBottom: 24,
      }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)', marginBottom: 8 }}>Geral</p>
        <Toggle
          checked={form.dailySummary}
          onChange={(v) => update('dailySummary', v)}
          label="Resumo diário por email"
        />
      </div>

      <SaveButton onClick={handleSave} saving={saving} />
    </div>
  );
}
