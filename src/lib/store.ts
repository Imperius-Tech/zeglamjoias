import { create } from 'zustand';
import { supabase } from './supabase';
import type {
  Conversation,
  ConversationStatus,
  ConversationType,
  KnowledgeEntry,
  Message,
  CategoryKey,
} from './mock-data';
import { conversations as mockConversations, knowledgeEntries as mockKnowledge } from './mock-data';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

interface DashboardState {
  conversations: Conversation[];
  selectedConversationId: string | null;
  conversationFilter: 'all' | ConversationStatus | 'adicionar_grupo';
  searchQuery: string;
  knowledgeEntries: KnowledgeEntry[];
  selectedCategory: CategoryKey | null;
  loading: boolean;
  theme: 'dark' | 'light';

  activeInstanceId: string | null;
  activeInstanceName: string | null;

  loadConversations: () => Promise<void>;
  loadKnowledgeEntries: () => Promise<void>;
  selectConversation: (id: string | null) => void;
  setFilter: (filter: 'all' | ConversationStatus | 'adicionar_grupo') => void;
  setSearchQuery: (query: string) => void;
  markAllAsRead: () => Promise<void>;
  takeoverConversation: (id: string) => Promise<void>;
  setSelectedCategory: (category: CategoryKey | null) => void;
  addKnowledgeEntry: (entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateKnowledgeEntry: (id: string, updates: Partial<KnowledgeEntry>) => Promise<void>;
  deleteKnowledgeEntry: (id: string) => Promise<void>;
  subscribeRealtime: () => () => void;
  toggleTheme: () => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  conversations: [],
  selectedConversationId: null,
  conversationFilter: 'all',
  searchQuery: '',
  knowledgeEntries: [],
  selectedCategory: null,
  loading: true,
  theme: (localStorage.getItem('zeglam_theme') as 'dark' | 'light') || 'dark',
  activeInstanceId: null,
  activeInstanceName: null,

  loadConversations: async () => {
    if (get().loading && get().conversations.length > 0) return; // Prevent double load

    if (DEMO_MODE) {
      set({ conversations: mockConversations, loading: false });
      return;
    }

    set({ loading: true, conversations: [] }); // CLEAR LIST IMMEDIATELY

    // Fetch current config to ensure we have the right IDs
    const { data: evoConfig } = await supabase
      .from('evolution_config')
      .select('active_instance_id, instance_name')
      .limit(1)
      .maybeSingle();

    const activeInstanceId = evoConfig?.active_instance_id || null;
    const activeInstanceName = evoConfig?.instance_name || null;

    // Update state immediately so realtime handlers are in sync
    set({ activeInstanceId, activeInstanceName });

    if (!activeInstanceId) {
      set({ conversations: [], loading: false });
      return;
    }

    // 1. Fetch conversations for THIS instance ONLY
    const { data: convos } = await supabase
      .from('conversations')
      .select('*')
      .eq('instance_id', activeInstanceId)
      .order('last_message_at', { ascending: false });

    if (!convos || convos.length === 0) {
      set({ conversations: [], loading: false });
      return;
    }

    const convIds = convos.map((c) => c.id);

    // 2. Fetch messages ONLY for these conversations (Optimized & Isolated)
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: true });

    // 3. Assemble isolated data structure
    const conversations: Conversation[] = convos.map((c) => ({
      id: c.id,
      customerName: c.customer_name,
      customerPhone: c.customer_phone,
      profilePicUrl: c.profile_pic_url || null,
      status: c.status as ConversationStatus,
      conversationType: (c.conversation_type || 'unknown') as ConversationType,
      aiEnabled: c.ai_enabled ?? true,
      unreadCount: c.unread_count || 0,
      aiAnalysis: c.ai_analysis || null,
      lastMessageAt: new Date(c.last_message_at),
      whatsappJid: c.whatsapp_jid || null,
      isGroup: typeof c.whatsapp_jid === 'string' && c.whatsapp_jid.endsWith('@g.us'),
      groupCandidateStatus: c.group_candidate_status || null,
      groupCandidateData: c.group_candidate_data || null,
      messages: (msgs ?? [])
        .filter((m) => m.conversation_id === c.id)
        .map((m) => ({
          id: m.id,
          author: m.author as Message['author'],
          content: m.content,
          timestamp: new Date(m.created_at),
          mediaUrl: m.media_url || null,
          mediaType: m.media_type as Message['mediaType'] || null,
          status: m.status as Message['status'] || null,
          quotedMessageId: m.quoted_message_id || null,
          sentBy: m.sent_by as Message['sentBy'] || null,
          isDraft: m.is_draft || false,
          mediaAnalysis: m.media_analysis || null,
          suggestionGroupId: m.suggestion_group_id || null,
          suggestionConfidence: m.suggestion_confidence ?? null,
          suggestionStyle: (m.suggestion_style as Message['suggestionStyle']) || null,
        })),
    }));

    set({ conversations, loading: false, activeInstanceId, activeInstanceName });
  },

  loadKnowledgeEntries: async () => {
    if (DEMO_MODE) {
      set({ knowledgeEntries: mockKnowledge });
      return;
    }

    const { data } = await supabase
      .from('knowledge_entries')
      .select('*')
      .order('created_at', { ascending: false });

    if (!data) return;

    const knowledgeEntries: KnowledgeEntry[] = data.map((e) => ({
      id: e.id,
      category: e.category as KnowledgeEntry['category'],
      question: e.question,
      answer: e.answer,
      createdAt: new Date(e.created_at),
      updatedAt: new Date(e.updated_at),
    }));

    set({ knowledgeEntries });
  },

  selectConversation: (id) => {
    if (!id) {
      set({ selectedConversationId: null });
      return;
    }

    const conversations = get().conversations;
    const conv = conversations.find(c => c.id === id);
    
    if (!conv) {
      set({ selectedConversationId: id });
      return;
    }

    const needsStatusUpdate = conv.status === 'aguardando_humano';

    // Update locally
    set((state) => ({
      selectedConversationId: id,
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, unreadCount: 0, status: needsStatusUpdate ? 'ia_respondendo' : c.status } : c
      ),
    }));

    // Update in DB (Async)
    const updates: any = { unread_count: 0 };
    if (needsStatusUpdate) updates.status = 'ia_respondendo';
    
    supabase.from('conversations').update(updates).eq('id', id).then(({ error }) => {
      if (error) console.error('Error updating conversation status:', error);
      // Force refresh to ensure everything is in sync
      get().loadConversations();
    });
  },

  setFilter: (filter) => set({ conversationFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  markAllAsRead: async () => {
    const activeId = get().activeInstanceId;
    if (!activeId) return;

    // Update in DB (unread counts)
    await supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('instance_id', activeId)
      .gt('unread_count', 0);

    // Update in DB (waiting human status)
    await supabase
      .from('conversations')
      .update({ status: 'ia_respondendo' })
      .eq('instance_id', activeId)
      .eq('status', 'aguardando_humano');

    // Update locally
    set((state) => ({
      conversations: state.conversations.map((c) => ({ 
        ...c, 
        unreadCount: 0,
        status: c.status === 'aguardando_humano' ? 'ia_respondendo' as ConversationStatus : c.status 
      })),
    }));
  },

  takeoverConversation: async (id) => {
    await supabase.from('conversations').update({ status: 'encerrada' }).eq('id', id);
    await supabase.from('messages').insert({
      conversation_id: id,
      author: 'sistema',
      content: 'Zevaldo assumiu a conversa',
    });

    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id
          ? {
              ...c,
              status: 'encerrada' as ConversationStatus,
              messages: [
                ...c.messages,
                { id: `sys-${Date.now()}`, author: 'sistema' as const, content: 'Zevaldo assumiu a conversa', timestamp: new Date() },
              ],
            }
          : c
      ),
    }));
  },

  setSelectedCategory: (category) => set({ selectedCategory: category }),

  addKnowledgeEntry: async (entry) => {
    const { data } = await supabase
      .from('knowledge_entries')
      .insert({ category: entry.category, question: entry.question, answer: entry.answer })
      .select()
      .single();

    if (!data) return;

    const newEntry: KnowledgeEntry = {
      id: data.id,
      category: data.category as KnowledgeEntry['category'],
      question: data.question,
      answer: data.answer,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };

    set((state) => ({ knowledgeEntries: [newEntry, ...state.knowledgeEntries] }));
  },

  updateKnowledgeEntry: async (id, updates) => {
    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.question !== undefined) dbUpdates.question = updates.question;
    if (updates.answer !== undefined) dbUpdates.answer = updates.answer;
    if (updates.category !== undefined) dbUpdates.category = updates.category;

    await supabase.from('knowledge_entries').update(dbUpdates).eq('id', id);

    set((state) => ({
      knowledgeEntries: state.knowledgeEntries.map((e) =>
        e.id === id ? { ...e, ...updates, updatedAt: new Date() } : e
      ),
    }));
  },

  deleteKnowledgeEntry: async (id) => {
    await supabase.from('knowledge_entries').delete().eq('id', id);
    set((state) => ({ knowledgeEntries: state.knowledgeEntries.filter((e) => e.id !== id) }));
  },

  subscribeRealtime: () => {
    // No realtime in demo mode
    if (DEMO_MODE) {
      return () => {};
    }

    // Listen for new messages
    const msgChannel = supabase
      .channel('messages-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as any;
        const currentActiveId = get().activeInstanceId;
        
        // Safety: If no active instance, ignore updates
        if (!currentActiveId) return;

        const newMsg: Message = {
          id: m.id,
          author: m.author as Message['author'],
          content: m.content,
          timestamp: new Date(m.created_at),
          mediaUrl: m.media_url || null,
          mediaType: m.media_type as Message['mediaType'] || null,
          status: m.status as Message['status'] || null,
          quotedMessageId: m.quoted_message_id || null,
          sentBy: m.sent_by as Message['sentBy'] || null,
          isDraft: m.is_draft || false,
          mediaAnalysis: m.media_analysis || null,
          suggestionGroupId: m.suggestion_group_id || null,
          suggestionConfidence: m.suggestion_confidence ?? null,
          suggestionStyle: (m.suggestion_style as Message['suggestionStyle']) || null,
        };

        // Play sound if message is from client
        if (m.author === 'cliente') {
          import('./storage').then(({ getSettings }) => {
            getSettings().then(settings => {
              if (settings.notifications.sound) {
                const sounds: Record<string, string> = {
                  default: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3',
                  elegant: 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3',
                  modern: 'https://assets.mixkit.co/active_storage/sfx/2361/2361-preview.mp3',
                };
                const audio = new Audio(sounds[settings.notifications.incomingSound] || sounds.default);
                audio.volume = settings.notifications.soundVolume || 0.5;
                audio.play().catch(() => {});
              }
            });
          });
        }

        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== m.conversation_id) return c;
            // If we have an optimistic temp message with same content, replace it
            const hasTempDuplicate = m.author === 'humano' && c.messages.some(
              (msg) => msg.id.startsWith('temp-') && msg.content === m.content
            );
            const messages = hasTempDuplicate
              ? c.messages.map((msg) =>
                  msg.id.startsWith('temp-') && msg.content === m.content ? newMsg : msg
                )
              : [...c.messages, newMsg];
            return { ...c, messages, lastMessageAt: new Date(m.created_at) };
          }),
        }));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as any;
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === m.conversation_id
              ? {
                  ...c,
                  messages: c.messages.map((msg) =>
                    msg.id === m.id
                      ? { ...msg, mediaUrl: m.media_url || msg.mediaUrl, content: m.content || msg.content, status: m.status as Message['status'] || msg.status, mediaAnalysis: m.media_analysis || msg.mediaAnalysis }
                      : msg
                  ),
                }
              : c
          ),
        }));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        const oldMsg = payload.old as any;
        if (!oldMsg?.id) return;
        set((state) => ({
          conversations: state.conversations.map((c) => ({
            ...c,
            messages: c.messages.filter((msg) => msg.id !== oldMsg.id),
          })),
        }));
      })
      .subscribe();

    // Listen for conversation updates (unread count, status, name)
    const convChannel = supabase
      .channel('conversations-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (payload) => {
        const updated = payload.new as any;
        const currentActiveId = get().activeInstanceId;

        // SEPARAÇÃO DE CONTAS: Ignora atualizações de outras instâncias ou se não houver instância ativa
        if (!currentActiveId || updated.instance_id !== currentActiveId) return;

        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === updated.id
              ? {
                  ...c,
                  customerName: updated.customer_name || c.customerName,
                  customerPhone: updated.customer_phone || c.customerPhone,
                  profilePicUrl: updated.profile_pic_url || c.profilePicUrl || null,
                  status: (updated.status as ConversationStatus) || c.status,
                  unreadCount: updated.unread_count ?? c.unreadCount,
                  lastMessageAt: updated.last_message_at ? new Date(updated.last_message_at) : c.lastMessageAt,
                  conversationType: (updated.conversation_type as ConversationType) || c.conversationType,
                  aiEnabled: updated.ai_enabled ?? c.aiEnabled,
                  aiAnalysis: updated.ai_analysis ?? c.aiAnalysis,
                  groupCandidateStatus: updated.group_candidate_status ?? c.groupCandidateStatus,
                  groupCandidateData: updated.group_candidate_data ?? c.groupCandidateData,
                }
              : c
          ).sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()),
        }));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, (payload) => {
        const c = payload.new as any;
        const currentActiveId = get().activeInstanceId;

        // SEPARAÇÃO DE CONTAS: Ignora conversas de outras instâncias ou se não houver instância ativa
        if (!currentActiveId || c.instance_id !== currentActiveId) return;

        const newConv: Conversation = {
          id: c.id,
          customerName: c.customer_name,
          customerPhone: c.customer_phone,
          profilePicUrl: c.profile_pic_url || null,
          status: c.status as ConversationStatus,
          conversationType: (c.conversation_type || 'unknown') as ConversationType,
          aiEnabled: c.ai_enabled ?? true,
          unreadCount: c.unread_count || 0,
          aiAnalysis: c.ai_analysis || null,
          lastMessageAt: new Date(c.last_message_at),
          messages: [],
        };
        set((state) => ({
          conversations: [newConv, ...state.conversations],
        }));
      })
      .subscribe();

    // Return cleanup function
    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(convChannel);
    };
  },

  toggleTheme: () => {
    set((state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('zeglam_theme', newTheme);
      if (newTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      return { theme: newTheme };
    });
  },
}));

// Apply initial theme
const initialTheme = localStorage.getItem('zeglam_theme');
if (initialTheme === 'light') {
  document.documentElement.setAttribute('data-theme', 'light');
}
