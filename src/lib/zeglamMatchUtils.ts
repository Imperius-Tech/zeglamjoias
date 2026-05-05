/** Utilitários compartilhados — cruzamento comprovante ↔ pendências Zeglam. */

export function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Normaliza phone BR pra "DDD+8 dígitos finais" (sem 9 do celular, sem DDI).
 * Resolve mismatch entre WhatsApp JID (alguns sem 9 em contatos antigos) vs Zeglam CRM (com 9).
 *
 * Exemplos:
 *   "+55 (11) 95380-5966" → "11953805966" → tail 8 = "53805966"  ❌ ainda diferente sem DDD
 *   Solução: tail 8 sempre, sem se importar com DDD/9. Cobre contatos antigos e novos.
 */
export function phoneTail(str: string | null | undefined, n = 8): string {
  if (!str) return '';
  const digits = str.replace(/\D/g, '');
  return digits.slice(-n);
}

export function parseBrlAmount(str: string | null | undefined): number | null {
  if (!str) return null;
  const m = str.match(/R\$?\s*([\d.,]+)/i);
  const raw = m ? m[1] : str;
  const cleaned = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

export function amountMatches(zeglamValue: string, proofValue: string, tolerancePct = 0.01): boolean {
  const a = parseBrlAmount(zeglamValue);
  const b = parseBrlAmount(proofValue);
  if (a == null || b == null || a <= 0 || b <= 0) return false;
  const diff = Math.abs(a - b) / a;
  return diff <= tolerancePct;
}

export function nameFullyCompatibleWithProof(
  proofCustomerName: string,
  variants: Array<string | null | undefined>,
): boolean {
  const pn = normalize(proofCustomerName || '');
  if (pn.length < 2) return false;
  for (const raw of variants) {
    const zn = normalize(String(raw ?? ''));
    if (!zn) continue;
    if (zn === pn) return true;
    if (zn.includes(pn) || pn.includes(zn)) return true;

    const zTok = zn.split(/\s+/).filter((t) => t.length >= 2);
    const pTok = pn.split(/\s+/).filter((t) => t.length >= 2);
    if (!zTok.length || !pTok.length) continue;

    const sharedExact = zTok.filter((t) => pTok.some((pt) => pt === t));
    if (sharedExact.length >= 2) return true;

    if (
      zTok.length >= 2 &&
      pTok.length >= 2 &&
      zTok[0] === pTok[0] &&
      zTok[zTok.length - 1] === pTok[pTok.length - 1]
    ) {
      return true;
    }

    const fuzzy = zTok.filter((t) => pTok.some((pt) => pt === t || pt.includes(t) || t.includes(pt)));
    if (zTok.length >= 3 && pTok.length >= 3 && fuzzy.length >= 2) return true;
  }
  return false;
}
