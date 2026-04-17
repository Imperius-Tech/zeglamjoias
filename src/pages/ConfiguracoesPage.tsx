import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Store, Bot, Plug, Bell, UserCog, Loader } from 'lucide-react';
import { getSettings, saveSettingsSection, type AppSettings } from '@/lib/storage';
import { StoreSection } from '@/components/configuracoes/StoreSection';
import { AISection } from '@/components/configuracoes/AISection';
import { IntegrationSection } from '@/components/configuracoes/IntegrationSection';
import { NotificationsSection } from '@/components/configuracoes/NotificationsSection';
import { AccountSection } from '@/components/configuracoes/AccountSection';

type Tab = 'store' | 'ai' | 'integration' | 'notifications' | 'account';

const tabs: { id: Tab; label: string; icon: typeof Store }[] = [
  { id: 'store', label: 'Perfil da Loja', icon: Store },
  { id: 'ai', label: 'Comportamento da IA', icon: Bot },
  { id: 'integration', label: 'Integrações', icon: Plug },
  { id: 'notifications', label: 'Notificações', icon: Bell },
  { id: 'account', label: 'Conta', icon: UserCog },
];

export default function ConfiguracoesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('store');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const updateAndSave = useCallback(async <K extends keyof AppSettings>(section: K, data: AppSettings[K]) => {
    setSettings((prev) => prev ? { ...prev, [section]: data } : prev);
    await saveSettingsSection(section, data);
    showToast('Configurações salvas com sucesso');
  }, []);

  if (loading || !settings) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Loader size={24} style={{ color: 'var(--fg-subtle)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Sidebar tabs */}
      <nav style={{
        width: 240, flexShrink: 0, height: '100%', overflowY: 'auto',
        padding: '28px 12px', borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        <p style={{
          fontSize: 10, fontWeight: 900, textTransform: 'uppercase',
          letterSpacing: '0.2em', color: 'var(--fg-faint)',
          padding: '0 12px', marginBottom: 12,
        }}>
          Configurações
        </p>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 12px', borderRadius: 10,
                marginBottom: 2, fontSize: 13, fontWeight: 500,
                color: active ? 'var(--strong-text)' : 'var(--fg-muted)',
                background: active ? 'var(--glass-strong)' : 'transparent',
                border: 'none', cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={16} style={{ color: active ? 'var(--accent)' : 'var(--fg-subtle)', flexShrink: 0 }} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Content area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', position: 'relative' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{ maxWidth: 680 }}
          >
            {activeTab === 'store' && (
              <StoreSection data={settings.store} onSave={(d) => updateAndSave('store', d)} />
            )}
            {activeTab === 'ai' && (
              <AISection data={settings.ai} onSave={(d) => updateAndSave('ai', d)} />
            )}
            {activeTab === 'integration' && (
              <IntegrationSection />
            )}
            {activeTab === 'notifications' && (
              <NotificationsSection data={settings.notifications} onSave={(d) => updateAndSave('notifications', d)} />
            )}
            {activeTab === 'account' && (
              <AccountSection data={settings.account} onSave={(d) => updateAndSave('account', d)} />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3 }}
              style={{
                position: 'fixed', bottom: 24, right: 24, zIndex: 100,
                padding: '12px 20px', borderRadius: 12,
                background: 'var(--emerald)', color: '#fff',
                fontSize: 13, fontWeight: 600,
                boxShadow: '0 8px 32px rgba(16,185,129,0.3)',
              }}
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
