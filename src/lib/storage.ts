import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────

export interface StoreSettings {
  name: string;
  phone: string;
  email: string;
  address: string;
  scheduleWeekday: string;
  scheduleSaturday: string;
  logoUrl: string;
}

export interface AISettings {
  tone: 'formal' | 'amigavel' | 'casual';
  greeting: string;
  farewell: string;
  escalateUnknown: boolean;
  escalateHumanRequest: boolean;
  escalateKeyword: boolean;
  silenceTimeoutMinutes: number;
}

export interface EvolutionSettings {
  instanceUrl: string;
  apiKey: string;
  instanceName: string;
  webhookUrl: string;
  connectionStatus: 'connected' | 'disconnected' | 'waiting';
}

export interface NotificationSettings {
  silencedConversation: boolean;
  newCustomer: boolean;
  customerInactivity: boolean;
  inactivityMinutes: number;
  dailySummary: boolean;
  sound: boolean;
}

export interface AccountSettings {
  fullName: string;
  email: string;
}

export interface AppSettings {
  store: StoreSettings;
  ai: AISettings;
  evolution: EvolutionSettings;
  notifications: NotificationSettings;
  account: AccountSettings;
}

const defaults: AppSettings = {
  store: {
    name: 'Zeglam Joias',
    phone: '(21) 99999-0000',
    email: 'contato@zeglamjoias.com.br',
    address: '',
    scheduleWeekday: '09:00 - 18:00',
    scheduleSaturday: '09:00 - 13:00',
    logoUrl: '',
  },
  ai: {
    tone: 'amigavel',
    greeting: 'Olá! Bem-vindo(a) à Zeglam Joias ✨ Como posso te ajudar?',
    farewell: 'Obrigada por falar com a gente! Qualquer dúvida, estamos aqui 💛',
    escalateUnknown: true,
    escalateHumanRequest: true,
    escalateKeyword: false,
    silenceTimeoutMinutes: 5,
  },
  evolution: {
    instanceUrl: '',
    apiKey: '',
    instanceName: '',
    webhookUrl: '',
    connectionStatus: 'disconnected',
  },
  notifications: {
    silencedConversation: true,
    newCustomer: true,
    customerInactivity: false,
    inactivityMinutes: 10,
    dailySummary: false,
    sound: true,
  },
  account: {
    fullName: 'Zevaldo Gama',
    email: '',
  },
};

// ─── Settings (from `settings` + `evolution_config` tables) ───

export async function getSettings(): Promise<AppSettings> {
  const [settingsRes, evolutionRes] = await Promise.all([
    supabase.from('settings').select('section, data'),
    supabase.from('evolution_config').select('*').limit(1).single(),
  ]);

  const settings = { ...defaults };

  if (settingsRes.data) {
    for (const row of settingsRes.data) {
      const section = row.section as string;
      if (section in defaults && section !== 'evolution') {
        (settings as any)[section] = { ...(defaults as any)[section], ...(row.data as any) };
      }
    }
  }

  if (evolutionRes.data) {
    const d = evolutionRes.data;
    settings.evolution = {
      instanceUrl: d.instance_url ?? '',
      apiKey: d.api_key ?? '',
      instanceName: d.instance_name ?? '',
      webhookUrl: d.webhook_url ?? '',
      connectionStatus: d.connection_status ?? 'disconnected',
    };
  }

  return settings;
}

export async function saveSettingsSection<K extends keyof AppSettings>(
  section: K,
  data: AppSettings[K]
): Promise<void> {
  if (section === 'evolution') {
    const evo = data as EvolutionSettings;
    await supabase
      .from('evolution_config')
      .update({
        instance_url: evo.instanceUrl,
        api_key: evo.apiKey,
        instance_name: evo.instanceName,
        webhook_url: evo.webhookUrl,
        connection_status: evo.connectionStatus,
        updated_at: new Date().toISOString(),
      })
      .not('id', 'is', null); // update all rows (there's only one)
  } else {
    await supabase
      .from('settings')
      .update({ data, updated_at: new Date().toISOString() })
      .eq('section', section);
  }
}
