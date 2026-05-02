import type { Message } from '@/lib/mock-data';

/**
 * Tenta obter o rótulo do catálogo/link a partir do texto das mensagens (ex.: romaneio Zeglam).
 * Engenharia reversa completa do botão "cobrar" do admin pode vir depois via zeglam-api.
 */
export function guessLinkLabelFromConversation(messages: Message[]): string | null {
  const bodies = [...messages]
    .filter((m) => !m.isDraft && String(m.content || '').trim().length > 0)
    .reverse()
    .map((m) => String(m.content ?? '').replace(/\r/g, ''))

  for (const text of bodies) {
    const feita = text.match(/feita\s+no\s+link\s+([^\n]+?)(?:\n|\s*Att\.|\s*Att\s|$)/i)
    if (feita?.[1]) {
      const s = feita[1].replace(/\*+/g, '').trim()
      if (s.length >= 3) return s.slice(0, 200)
    }
    const boldLink = text.match(/\*([^*\n]{5,160}(?:Link|LINK|link)[^*\n]{0,80})\*/)
    if (boldLink?.[1]) {
      const s = boldLink[1].trim()
      if (s.length >= 5) return s.slice(0, 200)
    }
    const romaneioLinha = text.match(/romaneio[^\n]{0,120}?\n[^\n]*?(?:link|Link)\s*[:\s]?\s*([^\n]+)/i)
    if (romaneioLinha?.[1]) {
      const s = romaneioLinha[1].replace(/\*+/g, '').trim()
      if (s.length >= 3) return s.slice(0, 200)
    }
  }
  return null
}

/** Dados de pagamento no mesmo padrão das mensagens de romaneio (WhatsApp). */
export type CobrarPaymentLines = {
  pixKey: string;
  pixHolderName: string;
}

/**
 * Monta o texto de cobrança alinhado ao padrão romaneio Zeglam:
 * saudação → texto da cobrança → assinatura → dados PIX (se configurados) → rodapé automático.
 */
export function buildZeglamCobrarWhatsAppText(
  customerName: string,
  linkLabel: string | null,
  payment?: CobrarPaymentLines | null,
): string {
  const name = (customerName || 'Cliente').trim()
  const raw = linkLabel?.trim() ?? ''
  const inner = raw.replace(/^\*+|\*+$/g, '').trim()
  const linkMd = inner ? `*${inner}*` : '*seu pedido / catálogo*'

  const pixKey = payment?.pixKey?.trim() ?? ''
  const pixHolder = payment?.pixHolderName?.trim() ?? ''
  const paymentBlock =
    pixKey && pixHolder
      ? `\n\nDados para pagamento: Pix: *${pixKey}* Nome: *${pixHolder}*`
      : ''

  return `🚨 💰 🚨
Olá, ${name}

Essa é uma mensagem para te avisar que o seu pagamento do link ${linkMd} ainda não foi identificado. É essencial o pagamento seja feito o mais rápido possível para que as peças sejam garantidas junto ao fornecedor e nenhum membro do grupo seja prejudicado.

Caso já tenha realizado o pagamento, por favor enviar o comprovante de pagamento para darmos baixa no sistema.

Att, Equipe ZEGLAM JOIAS${paymentBlock}

_Mensagem automática_`
}
