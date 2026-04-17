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
  aiAnalysis?: any;
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

export const conversations: Conversation[] = [
  {
    id: 'conv-1',
    customerName: 'Maria Silva',
    customerPhone: '85987654321',
    profilePicUrl: null,
    status: 'ia_respondendo',
    conversationType: 'business',
    aiEnabled: true,
    unreadCount: 0,
    lastMessageAt: new Date(Date.now() - 30 * 60000),
    messages: [
      { id: 'm1', author: 'cliente', content: 'Olá, o anel de ouro branco 18K é banhado ou maciço?', timestamp: new Date(Date.now() - 120 * 60000), status: 'read', sentBy: 'phone' },
      { id: 'm2', author: 'ia', content: 'Olá Maria! 👋 Nossos anéis de ouro branco 18K são totalmente maciços, não banhados. Possuem alta durabilidade e garantia de qualidade. Qual modelo você se interessou?', timestamp: new Date(Date.now() - 118 * 60000), status: 'read', sentBy: 'ai' },
      { id: 'm3', author: 'cliente', content: 'Qual é o valor do anel modelo "Elegância" em ouro 18K?', timestamp: new Date(Date.now() - 60 * 60000), status: 'read', sentBy: 'phone' },
      { id: 'm4', author: 'ia', content: 'O modelo "Elegância" em ouro 18K custa R$ 2.850,00. Temos opções de pagamento parcelado em até 12x sem juros. Deseja mais informações?', timestamp: new Date(Date.now() - 58 * 60000), status: 'read', sentBy: 'ai' },
      { id: 'm5', author: 'cliente', content: 'Perfeito! Vou querer parcelado. Como faz?', timestamp: new Date(Date.now() - 45 * 60000), status: 'read', sentBy: 'phone' },
      { id: 'm6', author: 'ia', content: 'Ótimo! 🎉 Você pode fazer o pagamento via PIX (10% desc), cartão (até 12x) ou boleto. Qual prefere?', timestamp: new Date(Date.now() - 30 * 60000), status: 'read', sentBy: 'ai' },
    ],
  },
  {
    id: 'conv-2',
    customerName: 'João Santos',
    customerPhone: '21999998888',
    profilePicUrl: null,
    status: 'aguardando_humano',
    conversationType: 'personal',
    aiEnabled: true,
    unreadCount: 1,
    lastMessageAt: new Date(Date.now() - 5 * 60000),
    messages: [
      { id: 'm7', author: 'cliente', content: 'Oi, recebi um anel como presente mas achei que não era ouro de verdade. Como faço para verificar a qualidade?', timestamp: new Date(Date.now() - 120 * 60000), status: 'read', sentBy: 'phone' },
      { id: 'm8', author: 'ia', content: 'Oi João! Podemos te ajudar com uma avaliação. Os anéis Zeglam vêm com certificado de autenticidade. Você tem o certificado ou o anel tem marcação 18K?', timestamp: new Date(Date.now() - 118 * 60000), status: 'read', sentBy: 'ai' },
      { id: 'm9', author: 'cliente', content: 'Sim, tem marcação 18K mas perdi o certificado. Posso levar em alguma loja para avaliar?', timestamp: new Date(Date.now() - 5 * 60000), status: 'read', sentBy: 'phone' },
    ],
  },
  {
    id: 'conv-3',
    customerName: 'Ana Costa',
    customerPhone: '11987654321',
    profilePicUrl: null,
    status: 'silenciada',
    conversationType: 'business',
    aiEnabled: true,
    unreadCount: 0,
    lastMessageAt: new Date(Date.now() - 24 * 60 * 60000),
    messages: [
      { id: 'm10', author: 'cliente', content: 'Qual o prazo de entrega para Volta Redonda?', timestamp: new Date(Date.now() - 24 * 60 * 60000), status: 'read', sentBy: 'phone' },
      { id: 'm11', author: 'ia', content: 'Olá Ana! O prazo de entrega para Volta Redonda é de 3-5 dias úteis via sedex. Deseja saber mais?', timestamp: new Date(Date.now() - 24 * 60 * 60000 + 120000), status: 'read', sentBy: 'ai' },
    ],
  },
  {
    id: 'conv-4',
    customerName: 'Carlos Oliveira',
    customerPhone: '31988776655',
    profilePicUrl: null,
    status: 'encerrada',
    conversationType: 'business',
    aiEnabled: true,
    unreadCount: 0,
    lastMessageAt: new Date(Date.now() - 2 * 24 * 60 * 60000),
    messages: [
      { id: 'm12', author: 'cliente', content: 'Comprei o anel semana passada mas chegou com um pequeno arranhão', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60000), status: 'read', sentBy: 'phone' },
      { id: 'm13', author: 'ia', content: 'Lamento ouvir isso Carlos! 😟 Podemos fazer uma troca ou devolução sem problema. Você prefere qual opção?', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60000 + 120000), status: 'read', sentBy: 'ai' },
      { id: 'm14', author: 'cliente', content: 'Prefiro troca', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60000 + 600000), status: 'read', sentBy: 'phone' },
      { id: 'm15', author: 'humano', content: 'Perfeito! Vou enviar um link de devolução. Assim que receber o item danificado, mandamos o novo. Obrigado!', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60000 + 720000), status: 'read', sentBy: 'panel' },
    ],
  },
  {
    id: 'conv-5',
    customerName: 'Fernanda Lima',
    customerPhone: '47992224444',
    profilePicUrl: null,
    status: 'ia_respondendo',
    conversationType: 'business',
    aiEnabled: true,
    unreadCount: 2,
    lastMessageAt: new Date(Date.now() - 10 * 60000),
    messages: [
      { id: 'm16', author: 'cliente', content: 'Vocês fazem customização em anéis?', timestamp: new Date(Date.now() - 30 * 60000), status: 'read', sentBy: 'phone' },
      { id: 'm17', author: 'ia', content: 'Sim, Fernanda! Oferecemos customização em anéis, colares e pulseiras. Você pode escolher o tipo de ouro (18K ou 14K), design e adicionar gravações. Qual sua ideia?', timestamp: new Date(Date.now() - 28 * 60000), status: 'read', sentBy: 'ai' },
      { id: 'm18', author: 'cliente', content: 'Gostaria de um anel com a inicial "F" gravada', timestamp: new Date(Date.now() - 10 * 60000), status: 'read', sentBy: 'phone' },
    ],
  },
  {
    id: 'conv-6',
    customerName: 'Roberto Martins',
    customerPhone: '85987112233',
    profilePicUrl: null,
    status: 'aguardando_humano',
    conversationType: 'business',
    aiEnabled: true,
    unreadCount: 0,
    lastMessageAt: new Date(Date.now() - 2 * 60 * 60000),
    messages: [
      { id: 'm19', author: 'cliente', content: 'Preciso enviar um comprovante de pagamento PIX que fiz', timestamp: new Date(Date.now() - 2 * 60 * 60000), status: 'read', sentBy: 'phone' },
      { id: 'm20', author: 'ia', content: 'Claro Roberto! Pode enviar a foto do comprovante que vou registrar no sistema', timestamp: new Date(Date.now() - 1.5 * 60 * 60000), status: 'read', sentBy: 'ai' },
      { id: 'm21', author: 'cliente', content: 'Enviando agora...', timestamp: new Date(Date.now() - 90 * 60000), status: 'read', sentBy: 'phone', mediaUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', mediaType: 'image', mediaAnalysis: { is_payment_proof: true, payment_value: 'R$ 1.500,00', type: 'PIX' } },
      { id: 'm22', author: 'sistema', content: 'Comprovante detectado: R$ 1.500,00 via PIX', timestamp: new Date(Date.now() - 85 * 60000), status: 'read', sentBy: 'ai' },
    ],
  },
];

export const knowledgeEntries: KnowledgeEntry[] = [
  { id: 'k1', category: 'produtos', question: 'O anel é maciço ou banhado?', answer: 'Todos os nossos anéis são totalmente maciços em ouro 18K ou 14K, nunca banhados. Possuem garantia vitalícia.', createdAt: new Date('2026-03-01'), updatedAt: new Date('2026-03-15') },
  { id: 'k2', category: 'produtos', question: 'Qual a diferença entre ouro 18K e 14K?', answer: 'O ouro 18K tem 75% de pureza (mais brilhante), enquanto 14K tem 58,3%. O 18K é mais macio, o 14K mais resistente. Ambos têm excelente qualidade.', createdAt: new Date('2026-03-01'), updatedAt: new Date('2026-03-15') },
  { id: 'k3', category: 'entrega', question: 'Qual o prazo de entrega?', answer: 'Entregamos em 3-5 dias úteis via Sedex para todo o Brasil. Frete grátis em compras acima de R$ 5.000.', createdAt: new Date('2026-03-01'), updatedAt: new Date('2026-03-15') },
  { id: 'k4', category: 'entrega', question: 'Vocês entregam em Volta Redonda?', answer: 'Sim! Entregamos em Volta Redonda em 3-5 dias úteis via Sedex. Você pode acompanhar a encomenda pelo rastreamento.', createdAt: new Date('2026-03-05'), updatedAt: new Date('2026-03-15') },
  { id: 'k5', category: 'pagamento', question: 'Qual o desconto para PIX?', answer: 'Oferecemos 10% de desconto para pagamentos via PIX à vista. Você também pode parcelar em até 12x no cartão sem juros.', createdAt: new Date('2026-03-01'), updatedAt: new Date('2026-03-15') },
  { id: 'k6', category: 'pagamento', question: 'Vocês parcelam no cartão?', answer: 'Sim! Parcelamos em até 12x sem juros no cartão de crédito. Também aceitamos boleto e PIX.', createdAt: new Date('2026-03-01'), updatedAt: new Date('2026-03-15') },
  { id: 'k7', category: 'trocas', question: 'Como faço uma troca ou devolução?', answer: 'Você tem 30 dias para solicitar troca ou devolução sem justificativa. Enviamos um código de devolução e reembolsamos assim que receber o item.', createdAt: new Date('2026-03-01'), updatedAt: new Date('2026-03-15') },
  { id: 'k8', category: 'promocoes', question: 'Há promoções vigentes?', answer: 'Sim! Este mês temos 15% off em anéis de ouro 14K e frete grátis em compras acima de R$ 5.000. Acompanhe nossas redes sociais para mais ofertas.', createdAt: new Date('2026-03-10'), updatedAt: new Date('2026-03-15') },
  { id: 'k9', category: 'atendimento', question: 'Como verificar a autenticidade de um anel?', answer: 'Todos os anéis Zeglam vêm com certificado de autenticidade e marcação 18K ou 14K. Se perder o certificado, pode verificar a marcação ou solicitar avaliação em nossas lojas.', createdAt: new Date('2026-03-01'), updatedAt: new Date('2026-03-15') },
];

export const categoryInfo = {
  produtos: { name: 'Produtos', icon: 'Gem' as const, color: '#d4a843' },
  entrega: { name: 'Entrega', icon: 'Truck' as const, color: '#3b82f6' },
  pagamento: { name: 'Pagamento', icon: 'CreditCard' as const, color: '#10b981' },
  trocas: { name: 'Trocas e Devoluções', icon: 'RefreshCw' as const, color: '#f59e0b' },
  promocoes: { name: 'Promoções', icon: 'Tag' as const, color: '#ef4444' },
  atendimento: { name: 'Atendimento', icon: 'MessageSquare' as const, color: '#8b5cf6' },
} as const;

export type CategoryKey = keyof typeof categoryInfo;
