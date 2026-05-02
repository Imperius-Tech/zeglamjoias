import { useState, useEffect } from 'react';
import { Store } from 'lucide-react';
import type { StoreSettings } from '@/lib/storage';
import { FieldGroup, TextInput, SectionTitle, SaveButton } from './SettingsField';

export function StoreSection({ data, onSave }: { data: StoreSettings; onSave: (d: StoreSettings) => void }) {
  const [form, setForm] = useState(data);
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof StoreSettings>(k: K, v: StoreSettings[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    setForm(data);
  }, [data]);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => { onSave(form); setSaving(false); }, 400);
  };

  return (
    <div>
      <SectionTitle title="Perfil da Loja" subtitle="Informações básicas da sua loja exibidas para clientes" />

      <div style={{
        padding: 20, borderRadius: 14, background: 'var(--glass)',
        border: '1px solid var(--border)', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg, #0f3460, #1a5276)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          overflow: 'hidden',
        }}>
          {form.logoUrl ? (
            <img src={form.logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Store size={24} style={{ color: '#c9a84c' }} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--strong-text)' }}>{form.name || 'Nome da Loja'}</p>
          <p style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>{form.phone || 'Telefone não configurado'}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        <FieldGroup label="Nome da Loja">
          <TextInput value={form.name} onChange={(v) => update('name', v)} placeholder="Zeglam Joias" />
        </FieldGroup>
        <FieldGroup label="Telefone / WhatsApp">
          <TextInput value={form.phone} onChange={(v) => update('phone', v)} placeholder="(21) 99999-0000" />
        </FieldGroup>
        <FieldGroup label="Email">
          <TextInput value={form.email} onChange={(v) => update('email', v)} placeholder="contato@zeglam.com.br" type="email" />
        </FieldGroup>
        <FieldGroup label="Endereço">
          <TextInput value={form.address} onChange={(v) => update('address', v)} placeholder="Rua..." />
        </FieldGroup>
        <FieldGroup label="Horário — Segunda a Sexta">
          <TextInput value={form.scheduleWeekday} onChange={(v) => update('scheduleWeekday', v)} placeholder="09:00 - 18:00" />
        </FieldGroup>
        <FieldGroup label="Horário — Sábado">
          <TextInput value={form.scheduleSaturday} onChange={(v) => update('scheduleSaturday', v)} placeholder="09:00 - 13:00" />
        </FieldGroup>
        <FieldGroup
          label="Chave PIX (cobrança automática)"
          description="Aparece em «Dados para pagamento» nas mensagens de cobrar do dashboard Zeglam (mesmo padrão do romaneio no WhatsApp)."
        >
          <TextInput
            value={form.pixKey}
            onChange={(v) => update('pixKey', v)}
            placeholder="Ex.: 48.441.153/0001-09 ou telefone com DDD"
          />
        </FieldGroup>
        <FieldGroup
          label="Nome do titular PIX"
          description="Nome ou razão social exibido após «Nome:» na mesma linha de pagamento."
        >
          <TextInput
            value={form.pixHolderName}
            onChange={(v) => update('pixHolderName', v)}
            placeholder="Ex.: Consultoria Z Gama (Zeglam Joias)"
          />
        </FieldGroup>
      </div>

      <div style={{ marginTop: 8 }}>
        <SaveButton onClick={handleSave} saving={saving} />
      </div>
    </div>
  );
}
