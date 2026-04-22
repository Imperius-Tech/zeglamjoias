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
const PAGE_SIZE = 50;

let searchDebounce: ReturnType<typeof setTimeout> | null = null;

function rowToConversation(r: any): Conversation {
  const lastMsg = r.last_msg_id ? [{
    id: r.last_msg_id,
    author: r.last_msg_author as Message['author'],
    content: r.last_msg_content,
    timestamp: new Date(r.last_msg_created_at),
    mediaUrl: r.last_msg_media_url || null,
    mediaType: r.last_msg_media_type as Message['mediaType'] || null,
    status: r.last_msg_status as Message['status'] || null,
    quotedMessageId: null,
    sentBy: null,
    isDraft: false,
    mediaAnalysis: null,
    suggestionGroupId: null,
    suggestionConfidence: null,
    suggestionStyle: null,
  }] : [];

  return {
    id: r.id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    profilePicUrl: r.profile_pic_url || null,
    status: r.status as ConversationStatus,
    conversationType: (r.conversation_type || 'unknown') as ConversationType,
    aiEnabled: r.ai_enabled ?? true,
    unreadCount: r.unread_count || 0,
    aiAnalysis: r.ai_analysis || null,
    lastMessageAt: new Date(r.last_message_at),
    whatsappJid: r.whatsapp_jid || null,
    isGroup: typeof r.whatsapp_jid === 'string' && r.whatsapp_jid.endsWith('@g.us'),
    groupCandidateStatus: r.group_candidate_status || null,
    groupCandidateData: r.group_candidate_data || null,
    priority: r.priority || 'normal',
    priorityReason: r.priority_reason || null,
    pendingReplyAt: r.pending_scheduled_at ? new Date(r.pending_scheduled_at) : null,
    pendingReplyMsgCount: r.pending_msg_count ?? null,
    messages: lastMsg,
    messagesLoaded: false,
  };
}

export interface Instance {
  id: string;
  evolutionInstanceId: string;
  evolutionInstanceName: string;
  displayName: string;
  color: string;
  isSandbox: boolean;
}

export type ConversationFilter = 'all' | ConversationStatus | 'adicionar_grupo' | 'urgentes' | 'nao_respondidas';
export type ConversationTab = 'individuais' | 'grupos';
export type ConversationSort = 'recent' | 'oldest' | 'unread' | 'priority' | 'name';

interface DashboardState {
  conversations: Conversation[];
  selectedConversationId: string | null;
  conversationFilter: ConversationFilter;
  conversationTab: ConversationTab;
  conversationSort: ConversationSort;
  searchQuery: string;
  totalConversations: number;
  hasMoreConversations: boolean;
  loadingMore: boolean;
  urgentCount: number;
  individualCount: number;
  groupCount: number;
  unrepliedCount: number;
  knowledgeEntries: KnowledgeEntry[];
  selectedCategory: CategoryKey | null;
  loading: boolean;
  theme: 'dark' | 'light';

  instances: Instance[];
  activeInstanceId: string | null;
  activeInstanceName: string | null;

  loadInstances: () => Promise<void>;
  switchInstance: (evolutionInstanceId: string) => Promise<void>;
  loadConversations: () => Promise<void>;
  loadMoreConversations: () => Promise<void>;
  refreshCounts: () => Promise<void>;
  loadConversationMessages: (conversationId: string) => Promise<void>;
  loadKnowledgeEntries: () => Promise<void>;
  selectConversation: (id: string | null) => void;
  setFilter: (filter: ConversationFilter) => void;
  setTab: (tab: ConversationTab) => void;
  setSort: (sort: ConversationSort) => void;
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
  conversationTab: 'individuais',
  conversationSort: 'recent',
  searchQuery: '',
  totalConversations: 0,
  hasMoreConversations: false,
  loadingMore: false,
  urgentCount: 0,
  individualCount: 0,
  groupCount: 0,
  unrepliedCount: 0,
  knowledgeEntries: [],
  selectedCategory: null,
  loading: true,
  theme: (localStorage.getItem('zeglam_theme') as 'dark' | 'light') || 'dark',
  instances: [],
  activeInstanceId: null,
  activeInstanceName: null,

  loadInstances: async () => {
    if (DEMO_MODE) return;

    const { data } = await supabase
      .from('instances')
      .select('*')
      .order('is_sandbox', { ascending: true });

    if (!data) return;

    const instances: Instance[] = data.map((r) => ({
      id: r.id,
      evolutionInstanceId: r.evolution_instance_id,
      evolutionInstanceName: r.evolution_instance_name,
      displayName: r.display_name,
      color: r.color || '#d4af37',
      isSandbox: !!r.is_sandbox,
    }));

    const { data: evoConfig } = await supabase
      .from('evolution_config')
      .select('active_instance_id')
      .limit(1)
      .maybeSingle();

    const storedId = localStorage.getItem('zeglam_active_instance');
    const activeId = storedId || evoConfig?.active_instance_id || instances[0]?.evolutionInstanceId || null;
    const active = instances.find((i) => i.evolutionInstanceId === activeId) || instances[0] || null;

    set({
      instances,
      activeInstanceId: active?.evolutionInstanceId || null,
      activeInstanceName: active?.evolutionInstanceName || null,
    });
  },

  switchInstance: async (evolutionInstanceId) => {
    const { instances } = get();
    const target = instances.find((i) => i.evolutionInstanceId === evolutionInstanceId);
    if (!target) return;

    localStorage.setItem('zeglam_active_instance', target.evolutionInstanceId);

    set({
      activeInstanceId: target.evolutionInstanceId,
      activeInstanceName: target.evolutionInstanceName,
      conversations: [],
      selectedConversationId: null,
      loading: true,
    });

    await supabase
      .from('evolution_config')
      .update({
        active_instance_id: target.evolutionInstanceId,
        instance_name: target.evolutionInstanceName,
        updated_at: new Date().toISOString(),
      })
      .not('id', 'is', null);

    await Promise.all([get().loadConversations(), get().loadKnowledgeEntries()]);
  },

  loadConversations: async () => {
    if (DEMO_MODE) {
      set({ conversations: mockConversations, loading: false });
      return;
    }

    // Sempre mostra loading ao trocar filtro/tab/sort — reseta lista.
    set({ loading: true, conversations: [] });

    let activeInstanceId = get().activeInstanceId;
    let activeInstanceName = get().activeInstanceName;

    if (!activeInstanceId) {
      const { data: evoConfig } = await supabase
        .from('evolution_config')
        .select('active_instance_id, instance_name')
        .limit(1)
        .maybeSingle();
      activeInstanceId = evoConfig?.active_instance_id || null;
      activeInstanceName = evoConfig?.instance_name || null;
      set({ activeInstanceId, activeInstanceName });
    }

    if (!activeInstanceId) {
      set({ conversations: [], loading: false, totalConversations: 0, hasMoreConversations: false });
      return;
    }

    const { conversationFilter, conversationTab, conversationSort, searchQuery } = get();

    const { data: rows } = await supabase.rpc('get_conversations_page', {
      p_instance_id: activeInstanceId,
      p_filter: conversationFilter,
      p_sort: conversationSort,
      p_tab: conversationTab,
      p_search: searchQuery.trim(),
      p_limit: PAGE_SIZE,
      p_offset: 0,
    });

    const conversations = (rows || []).map(rowToConversation);
    const total = (rows && rows[0]?.total_count) ? Number(rows[0].total_count) : conversations.length;

    set({
      conversations,
      loading: false,
      activeInstanceId,
      activeInstanceName,
      totalConversations: total,
      hasMoreConversations: conversations.length < total,
    });

    // Refresh counts em background (não bloqueia render)
    void get().refreshCounts();
  },

  loadMoreConversations: async () => {
    if (DEMO_MODE) return;
    const { loadingMore, hasMoreConversations, conversations, activeInstanceId,
            conversationFilter, conversationTab, conversationSort, searchQuery } = get();
    if (loadingMore || !hasMoreConversations || !activeInstanceId) return;

    set({ loadingMore: true });

    const { data: rows } = await supabase.rpc('get_conversations_page', {
      p_instance_id: activeInstanceId,
      p_filter: conversationFilter,
      p_sort: conversationSort,
      p_tab: conversationTab,
      p_search: searchQuery.trim(),
      p_limit: PAGE_SIZE,
      p_offset: conversations.length,
    });

    const nextBatch: Conversation[] = (rows || []).map(rowToConversation);
    const existingIds = new Set(conversations.map((c) => c.id));
    const merged = [...conversations, ...nextBatch.filter((c: Conversation) => !existingIds.has(c.id))];
    const total = (rows && rows[0]?.total_count) ? Number(rows[0].total_count) : get().totalConversations;

    set({
      conversations: merged,
      loadingMore: false,
      totalConversations: total,
      hasMoreConversations: merged.length < total,
    });
  },

  refreshCounts: async () => {
    if (DEMO_MODE) return;
    const activeInstanceId = get().activeInstanceId;
    if (!activeInstanceId) return;

    // Counts por categoria — query única direta na tabela, sem carregar rows
    const { data } = await supabase.rpc('get_conversation_counts', { p_instance_id: activeInstanceId });
    if (data && data[0]) {
      set({
        urgentCount: Number(data[0].urgent_count) || 0,
        individualCount: Number(data[0].individual_count) || 0,
        groupCount: Number(data[0].group_count) || 0,
        unrepliedCount: Number(data[0].unreplied_count) || 0,
      });
    }
  },

  loadConversationMessages: async (conversationId: string) => {
    if (DEMO_MODE) return;

    const msgs: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);
      if (!page || page.length === 0) break;
      for (const m of page) msgs.push(m);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    const messages: Message[] = msgs.map((m) => ({
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
      autoSendAt: m.auto_send_at ? new Date(m.auto_send_at) : null,
    }));

    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, messages, messagesLoaded: true } : c
      ),
    }));
  },

  loadKnowledgeEntries: async () => {
    if (DEMO_MODE) {
      set({ knowledgeEntries: mockKnowledge });
      return;
    }

    const activeInstanceId = get().activeInstanceId;
    if (!activeInstanceId) {
      set({ knowledgeEntries: [] });
      return;
    }

    const { data } = await supabase
      .from('knowledge_entries')
      .select('*')
      .eq('instance_id', activeInstanceId)
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

  selectConversation: async (id) => {
    if (!id) {
      set({ selectedConversationId: null });
      return;
    }

    let conversations = get().conversations;
    let conv = conversations.find(c => c.id === id);

    // Se não estiver na lista atual, buscamos do banco
    if (!conv) {
      set({ loading: true });
      const { data: row } = await supabase
        .from('conversations')
        .select(`
          *,
          last_msg:messages(id, author, content, created_at, media_url, media_type, status)
        `)
        .eq('id', id)
        .order('created_at', { foreignTable: 'messages', ascending: false })
        .limit(1, { foreignTable: 'messages' })
        .maybeSingle();

      if (row) {
        // Mapeia o resultado similar ao rowToConversation
        const r = {
          ...row,
          last_msg_id: row.last_msg?.[0]?.id,
          last_msg_author: row.last_msg?.[0]?.author,
          last_msg_content: row.last_msg?.[0]?.content,
          last_msg_created_at: row.last_msg?.[0]?.created_at,
          last_msg_media_url: row.last_msg?.[0]?.media_url,
          last_msg_media_type: row.last_msg?.[0]?.media_type,
          last_msg_status: row.last_msg?.[0]?.status,
        };
        conv = rowToConversation(r);
        set((state) => ({ conversations: [conv!, ...state.conversations] }));
      } else {
        set({ selectedConversationId: null, loading: false });
        return;
      }
    }

    // Reset de filtros para garantir visibilidade no painel lateral
    const isGroup = conv.isGroup;
    set({
      selectedConversationId: id,
      conversationFilter: 'all',
      conversationTab: isGroup ? 'grupos' : 'individuais',
      searchQuery: '',
      loading: false,
    });

    // Lazy-load mensagens completas (se ainda não carregadas)
    if (!conv.messagesLoaded) {
      get().loadConversationMessages(id);
    }

    const needsStatusUpdate = conv.status === 'aguardando_humano';

    // Update locally (unread count)
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, unreadCount: 0, status: needsStatusUpdate ? 'ia_respondendo' : c.status } : c
      ),
    }));

    // Update in DB (Async)
    const updates: any = { unread_count: 0 };
    if (needsStatusUpdate) updates.status = 'ia_respondendo';

    supabase.from('conversations').update(updates).eq('id', id).then(({ error }) => {
      if (error) console.error('Error updating conversation status:', error);
    });
  },

  setFilter: (filter) => {
    set({ conversationFilter: filter });
    void get().loadConversations();
  },
  setTab: (tab) => {
    set({ conversationTab: tab });
    void get().loadConversations();
  },
  setSort: (sort) => {
    set({ conversationSort: sort });
    void get().loadConversations();
  },
  setSearchQuery: (query) => {
    set({ searchQuery: query });
    // Debounce leve: recarregar só após pausa de digitação
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { void get().loadConversations(); }, 300);
  },

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
    const activeInstanceId = get().activeInstanceId;
    if (!activeInstanceId) return;

    const { data } = await supabase
      .from('knowledge_entries')
      .insert({ category: entry.category, question: entry.question, answer: entry.answer, instance_id: activeInstanceId })
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
          autoSendAt: m.auto_send_at ? new Date(m.auto_send_at) : null,
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
            let messages: Message[];
            if (hasTempDuplicate) {
              messages = c.messages.map((msg) =>
                msg.id.startsWith('temp-') && msg.content === m.content ? newMsg : msg
              );
            } else if (!c.messagesLoaded) {
              // Conversa ainda não foi aberta: mantém só a última como preview
              messages = [newMsg];
            } else {
              messages = [...c.messages, newMsg];
            }
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
                  priority: updated.priority ?? c.priority,
                  priorityReason: updated.priority_reason ?? c.priorityReason,
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

    // Realtime para pending_ai_replies (buffer timer antes da IA gerar)
    const pendingChannel = supabase
      .channel('pending-replies-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_ai_replies' }, (payload) => {
        const newRow = payload.new as any;
        const oldRow = payload.old as any;
        const convId = newRow?.conversation_id || oldRow?.conversation_id;
        if (!convId) return;
        const isDelete = payload.eventType === 'DELETE';
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  pendingReplyAt: isDelete ? null : (newRow?.scheduled_at ? new Date(newRow.scheduled_at) : null),
                  pendingReplyMsgCount: isDelete ? null : (newRow?.msg_count ?? null),
                }
              : c
          ),
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(convChannel);
      supabase.removeChannel(pendingChannel);
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
