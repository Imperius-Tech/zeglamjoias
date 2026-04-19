import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { AISettings } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useDashboardStore } from '@/lib/store';
import { FieldGroup, TextInput, TextArea, SelectInput, Toggle, SectionTitle, SaveButton } from './SettingsField';
import { RetrainingSection } from './RetrainingSection';

interface AIConfig {
  enabled: boolean;
  api_key: string;
  provider: 'openai' | 'gemini';
  system_prompt: string;
  model: string;
}

const modelOptions: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini — Rápido e barato' },
    { value: 'gpt-4o', label: 'GPT-4o — Mais inteligente' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini — Mais novo' },
    { value: 'gpt-4.1', label: 'GPT-4.1 — Mais capaz' },
  ],
  gemini: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — Rápido e barato' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — Mais inteligente' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — Estável' },
  ],
};

export function AISection({ data, onSave }: { data: AISettings; onSave: (d: AISettings) => void }) {
  const [form, setForm] = useState(data);
  const [saving, setSaving] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [savingAI, setSavingAI] = useState(false);
  const activeInstanceId = useDashboardStore((s) => s.activeInstanceId);

  useEffect(() => {
    if (!activeInstanceId) return;
    supabase
      .from('ai_config')
      .select('*')
      .eq('instance_id', activeInstanceId)
      .limit(1)
      .maybeSingle()
      .then(({ data: cfg }) => {
        if (cfg) setAiConfig({
          enabled: cfg.enabled,
          api_key: cfg.api_key,
          provider: cfg.provider || 'gemini',
          system_prompt: cfg.system_prompt,
          model: cfg.model,
        });
      });
  }, [activeInstanceId]);

  const update = <K extends keyof AISettings>(k: K, v: AISettings[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => { onSave(form); setSaving(false); }, 400);
  };

  const handleSaveAI = async () => {
    if (!aiConfig || !activeInstanceId) return;
    setSavingAI(true);
    await supabase.from('ai_config').update({
      api_key: aiConfig.api_key,
      provider: aiConfig.provider,
      system_prompt: aiConfig.system_prompt,
      model: aiConfig.model,
      updated_at: new Date().toISOString(),
    }).eq('instance_id', activeInstanceId);
    setSavingAI(false);
  };

  const handleProviderChange = (provider: string) => {
    if (!aiConfig) return;
    const p = provider as 'openai' | 'gemini';
    const defaultModel = modelOptions[p][0].value;
    setAiConfig({ ...aiConfig, provider: p, model: defaultModel });
  };

  return (
    <div>
      <SectionTitle title="Comportamento da IA" subtitle="Configure como a IA interage com seus clientes" />

      {/* AI Provider Config */}
      {aiConfig && (
        <div style={{
          padding: 20, borderRadius: 14, background: 'var(--glass)',
          border: '1px solid var(--border)', marginBottom: 24,
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)', marginBottom: 16 }}>Configuração da IA</p>

          <FieldGroup label="Provider" description="Escolha o provedor de IA">
            <div style={{ display: 'flex', gap: 8 }}>
              {(['gemini', 'openai'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center',
                    color: aiConfig.provider === p ? 'var(--strong-text)' : 'var(--fg-muted)',
                    background: aiConfig.provider === p ? (p === 'gemini' ? 'rgba(66,133,244,0.15)' : 'rgba(16,185,129,0.15)') : 'var(--surface-2)',
                    border: aiConfig.provider === p ? `1px solid ${p === 'gemini' ? 'rgba(66,133,244,0.3)' : 'rgba(16,185,129,0.3)'}` : '1px solid var(--border)',
                  }}
                >
                  {p === 'gemini' ? '🔵 Google Gemini' : '🟢 OpenAI GPT'}
                </button>
              ))}
            </div>
          </FieldGroup>

          <FieldGroup label="API Key" description={aiConfig.provider === 'gemini' ? 'Chave do Google AI Studio (aistudio.google.com)' : 'Chave da OpenAI (platform.openai.com)'}>
            <div style={{ position: 'relative' }}>
              <TextInput
                value={aiConfig.api_key}
                onChange={(v) => setAiConfig({ ...aiConfig, api_key: v })}
                placeholder={aiConfig.provider === 'gemini' ? 'AIza...' : 'sk-...'}
                type={showKey ? 'text' : 'password'}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  padding: 6, borderRadius: 6, background: 'none', border: 'none',
                  color: 'var(--fg-subtle)', cursor: 'pointer',
                }}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </FieldGroup>

          <FieldGroup label="Modelo" description="Modelo de IA para gerar respostas">
            <SelectInput
              value={aiConfig.model}
              onChange={(v) => setAiConfig({ ...aiConfig, model: v })}
              options={modelOptions[aiConfig.provider]}
            />
          </FieldGroup>

          <FieldGroup label="Prompt do sistema" description="Define a personalidade e regras da IA">
            <TextArea
              value={aiConfig.system_prompt}
              onChange={(v) => setAiConfig({ ...aiConfig, system_prompt: v })}
              rows={6}
            />
          </FieldGroup>

          <SaveButton onClick={handleSaveAI} saving={savingAI} />
        </div>
      )}

      {/* Existing behavior settings */}
      <FieldGroup label="Tom de voz" description="Define o estilo de comunicação padrão">
        <SelectInput
          value={form.tone}
          onChange={(v) => update('tone', v as AISettings['tone'])}
          options={[
            { value: 'formal', label: 'Formal — Linguagem profissional e respeitosa' },
            { value: 'amigavel', label: 'Amigável — Próximo mas profissional' },
            { value: 'casual', label: 'Casual — Descontraído, usa emojis' },
          ]}
        />
      </FieldGroup>

      <FieldGroup label="Mensagem de saudação" description="Primeira mensagem que o cliente recebe">
        <TextArea value={form.greeting} onChange={(v) => update('greeting', v)} placeholder="Olá! Como posso te ajudar?" />
      </FieldGroup>

      <FieldGroup label="Mensagem de despedida" description="Enviada ao encerrar a conversa">
        <TextArea value={form.farewell} onChange={(v) => update('farewell', v)} placeholder="Obrigada por falar conosco!" />
      </FieldGroup>

      <div style={{
        padding: 20, borderRadius: 14, background: 'var(--glass)',
        border: '1px solid var(--border)', marginBottom: 24,
      }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong-text)', marginBottom: 12 }}>Encaminhar para humano quando:</p>
        <Toggle checked={form.escalateUnknown} onChange={(v) => update('escalateUnknown', v)} label="IA não sabe responder" />
        <Toggle checked={form.escalateHumanRequest} onChange={(v) => update('escalateHumanRequest', v)} label="Cliente pede atendente humano" />
        <Toggle checked={form.escalateKeyword} onChange={(v) => update('escalateKeyword', v)} label="Palavra-chave detectada (ex: reclamação, problema)" />
      </div>

      <FieldGroup label="Tempo de silêncio (minutos)" description="Tempo que a IA espera antes de marcar a conversa como silenciada">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="number" min={1} max={60}
            value={form.silenceTimeoutMinutes}
            onChange={(e) => update('silenceTimeoutMinutes', Number(e.target.value))}
            style={{
              width: 80, height: 40, padding: '0 14px', borderRadius: 10, textAlign: 'center',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              fontSize: 13, color: 'var(--fg-dim)',
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>minutos</span>
        </div>
      </FieldGroup>

      <SaveButton onClick={handleSave} saving={saving} />

      <RetrainingSection instanceId={activeInstanceId} />
    </div>
  );
}
