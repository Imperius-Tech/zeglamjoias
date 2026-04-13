export type ConversationStatus = 'ia_respondendo' | 'aguardando_humano' | 'silenciada' | 'encerrada';

export interface Message {
  id: string;
  author: 'cliente' | 'ia' | 'humano' | 'sistema';
  content: string;
  timestamp: Date;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'document' | 'sticker' | null;
  status?: 'sent' | 'delivered' | 'read' | 'error' | null;
  quotedMessageId?: string | null;
  sentBy?: 'panel' | 'phone' | 'ai' | null;
  isDraft?: boolean;
  mediaAnalysis?: { is_payment_proof?: boolean; type?: string; description?: string; payment_value?: string; confidence?: number } | null;
}

export type ConversationType = 'business' | 'personal' | 'unknown';

export interface Conversation {
  id: string;
  customerName: string;
  customerPhone: string;
  profilePicUrl?: string | null;
  status: ConversationStatus;
  conversationType: ConversationType;
  aiEnabled: boolean;
  unreadCount: number;
  messages: Message[];
  lastMessageAt: Date;
}

export interface KnowledgeEntry {
  id: string;
  category: 'produtos' | 'entrega' | 'pagamento' | 'trocas' | 'promocoes' | 'atendimento';
  question: string;
  answer: string;
  createdAt: Date;
  updatedAt: Date;
}

export const conversations: Conversation[] = [];

export const knowledgeEntries: KnowledgeEntry[] = [];

export const categoryInfo = {
  produtos: { name: 'Produtos', icon: 'Gem' as const, color: '#d4a843' },
  entrega: { name: 'Entrega', icon: 'Truck' as const, color: '#3b82f6' },
  pagamento: { name: 'Pagamento', icon: 'CreditCard' as const, color: '#10b981' },
  trocas: { name: 'Trocas e Devoluções', icon: 'RefreshCw' as const, color: '#f59e0b' },
  promocoes: { name: 'Promoções', icon: 'Tag' as const, color: '#ef4444' },
  atendimento: { name: 'Atendimento', icon: 'MessageSquare' as const, color: '#8b5cf6' },
} as const;

export type CategoryKey = keyof typeof categoryInfo;
