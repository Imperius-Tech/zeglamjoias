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

const DEMO_MODE = true;

interface DashboardState {
  conversations: Conversation[];
  selectedConversationId: string | null;
  conversationFilter: 'all' | ConversationStatus;
  searchQuery: string;
  knowledgeEntries: KnowledgeEntry[];
  selectedCategory: CategoryKey | null;
  loading: boolean;

  loadConversations: () => Promise<void>;
  loadKnowledgeEntries: () => Promise<void>;
  selectConversation: (id: string | null) => void;
  setFilter: (filter: 'all' | ConversationStatus) => void;
  setSearchQuery: (query: string) => void;
  takeoverConversation: (id: string) => Promise<void>;
  setSelectedCategory: (category: CategoryKey | null) => void;
  addKnowledgeEntry: (entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateKnowledgeEntry: (id: string, updates: Partial<KnowledgeEntry>) => Promise<void>;
  deleteKnowledgeEntry: (id: string) => Promise<void>;
  subscribeRealtime: () => () => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  conversations: [],
  selectedConversationId: null,
  conversationFilter: 'all',
  searchQuery: '',
  knowledgeEntries: [],
  selectedCategory: null,
  loading: true,

  loadConversations: async () => {
    if (DEMO_MODE) {
      set({ conversations: mockConversations, loading: false });
      return;
    }

    const { data: convos } = await supabase
      .from('conversations')
      .select('*')
      .order('last_message_at', { ascending: false });

    if (!convos) return;

    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });

    const conversations: Conversation[] = convos.map((c) => ({
      id: c.id,
      customerName: c.customer_name,
      customerPhone: c.customer_phone,
      profilePicUrl: c.profile_pic_url || null,
      status: c.status as ConversationStatus,
      conversationType: (c.conversation_type || 'unknown') as ConversationType,
      aiEnabled: c.ai_enabled ?? true,
      unreadCount: c.unread_count,
      lastMessageAt: new Date(c.last_message_at),
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
        })),
    }));

    set({ conversations, loading: false });
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

  selectConversation: (id) =>
    set((state) => ({
      selectedConversationId: id,
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, unreadCount: 0 } : c
      ),
    })),

  setFilter: (filter) => set({ conversationFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),

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
        };

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
      .subscribe();

    // Listen for conversation updates (unread count, status, name)
    const convChannel = supabase
      .channel('conversations-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (payload) => {
        const c = payload.new as any;
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === c.id
              ? {
                  ...conv,
                  customerName: c.customer_name || conv.customerName,
                  unreadCount: c.unread_count ?? conv.unreadCount,
                  status: (c.status as ConversationStatus) || conv.status,
                  lastMessageAt: c.last_message_at ? new Date(c.last_message_at) : conv.lastMessageAt,
                  profilePicUrl: c.profile_pic_url ?? conv.profilePicUrl,
                  conversationType: (c.conversation_type as ConversationType) || conv.conversationType,
                  aiEnabled: c.ai_enabled ?? conv.aiEnabled,
                }
              : conv
          ).sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()),
        }));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, (payload) => {
        const c = payload.new as any;
        const newConv: Conversation = {
          id: c.id,
          customerName: c.customer_name,
          customerPhone: c.customer_phone,
          profilePicUrl: c.profile_pic_url || null,
          status: c.status as ConversationStatus,
          conversationType: (c.conversation_type || 'unknown') as ConversationType,
          aiEnabled: c.ai_enabled ?? true,
          unreadCount: c.unread_count || 0,
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
}));
