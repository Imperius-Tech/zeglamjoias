/**
 * Entrada no grupo: texto vem da base de conhecimento (knowledge_entries).
 * IDs canônicos — duplicatas no banco devem manter o mesmo `answer`.
 */
export const GROUP_INTAKE_KNOWLEDGE_ENTRY_IDS = [
  '26c4e95f-2f64-449f-ad17-e2560356f01a',
  '23c63c09-41dd-4307-9891-182c1851a0e8',
] as const;

/**
 * Fallback alinhado ao `answer` em knowledge_entries (entrada no grupo).
 * Quem indicou entra só no template (`* Vendedor que te indicou:`); a IA não deve
 * repetir como pergunta solta quando o cliente já citou na mensagem — ver `GROUP_INTAKE_REFERRAL_INSTRUCTION`.
 */
export const DEFAULT_GROUP_INTAKE_BUBBLES = [
  'Olá.',
  'Tudo bem?',
  `Solicito, por gentileza, o envio das seguintes informações:

* Nome completo:
* Nome da marca:
* Cidade:
* Galvânica utilizada:
* Vendedor que te indicou:

Você já participa de algum Grupo de Compras Coletivas?
Se sim, poderia informar o nome?

Após o registro dos dados, realizarei sua inclusão no grupo.`,
];

/** Espelho do trecho anexado em `ai_config.system_prompt` no projeto (Supabase). */
export const GROUP_INTAKE_REFERRAL_INSTRUCTION = `[ZEG_ENTRADA_GRUPO]
Fluxo entrada no grupo: o modelo na base inclui "* Vendedor que te indicou:" — é ali que se pede a indicação. Se nas mensagens recentes o cliente JÁ citou quem indicou (ex.: a Lilian me indicou), não envie pergunta extra tipo "Alguém indicou você?" nem bolha repetindo esse pedido; confirme em uma frase curta se fizer sentido e peça só o que falta dos demais itens do template.
[/ZEG_ENTRADA_GRUPO]`;

/** Heurística compartilhada com Edge `send-group-intake-template`: cliente já mencionou quem indicou? */
export function customerLikelyAlreadyMentionedReferrer(customerText: string): boolean {
  const t = customerText.trim();
  if (t.length < 4) return false;
  if (/\b(indicou|indicada|indicaram|indicação)\b/i.test(t)) return true;
  if (/\b(me\s+indicou|me\s+indicaram|me\s+passou|me\s+passaram|fui\s+indicad)\b/i.test(t)) return true;
  if (/\bindicou\s+(o\s+)?grupo\b/i.test(t)) return true;
  return false;
}

export function stripVendorIndicationBullet(text: string): string {
  const lines = text.split('\n');
  const kept = lines.filter((line) => {
    const s = line.trim();
    if (/^(\*|·|•)?\s*Vendedor que te indicou/i.test(s)) return false;
    return true;
  });
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Mantém só o bullet do KB; remove a linha "* Vendedor que te indicou:" se já foi citado no histórico. */
export function omitGroupIntakeVendorIfAlreadyMentioned(bubbles: string[], customerTextBlob: string): string[] {
  if (!customerLikelyAlreadyMentionedReferrer(customerTextBlob)) return bubbles;
  return bubbles.map((b) =>
    /\bSolicito\b/i.test(b) || /Nome completo/i.test(b) ? stripVendorIndicationBullet(b) : b
  );
}

/**
 * Converte o `answer` do knowledge (parágrafos com \\n\\n) em sequência de mensagens curtas no WhatsApp.
 * Formato esperado: saudações na primeira linha/bloco, depois o bloco “Solicito…”.
 */
export function splitGroupIntakeAnswerToBubbles(answer: string): string[] {
  const blocks = answer
    .trim()
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) return [...DEFAULT_GROUP_INTAKE_BUBBLES];

  const firstLines = blocks[0]
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const bubbles: string[] = [];

  if (firstLines.length >= 2) {
    bubbles.push(firstLines[0]);
    bubbles.push(firstLines[1]);
  } else {
    bubbles.push(blocks[0]);
  }

  if (blocks.length > 1) {
    bubbles.push(blocks.slice(1).join('\n\n'));
  }

  return bubbles.filter(Boolean);
}
