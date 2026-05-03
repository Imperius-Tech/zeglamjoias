import type { SupabaseClient } from '@supabase/supabase-js';
import {
  amountMatches,
  nameFullyCompatibleWithProof,
  parseBrlAmount,
  phoneTail,
} from '@/lib/zeglamMatchUtils';

export type ProofForZeglamConfirm = {
  conversation_id: string;
  customer_name: string;
  detected_value: string | null;
};

type PendingRow = {
  salesId?: string;
  valor: string;
  cliente: string;
};

type Enrich = { phone_digits: string | null; customer_name: string | null };

/**
 * Localiza a linha pendente no Zeglam que melhor casa com o comprovante
 * (telefone + valor, depois nome + valor), alinhado à lógica da página Zeglam.
 */
export async function findBestZeglamPendingForProof(
  supabase: SupabaseClient,
  proof: ProofForZeglamConfirm,
): Promise<{ salesId: string; valor: string; cliente: string } | null> {
  const { data: allData, error: gaErr } = await supabase.functions.invoke('zeglam-api', {
    body: { action: 'get_all' },
  });
  if (gaErr || !allData?.pending?.length) return null;

  const pendingList = allData.pending as PendingRow[];
  const salesIds = pendingList.map((p) => p.salesId).filter(Boolean) as string[];

  const [{ data: phonesMap }, { data: conv }] = await Promise.all([
    salesIds.length
      ? supabase.functions.invoke('zeglam-api', { body: { action: 'enrich_phones', salesIds } })
      : Promise.resolve({ data: {} as Record<string, Enrich> }),
    supabase.from('conversations').select('customer_phone').eq('id', proof.conversation_id).maybeSingle(),
  ]);

  const map = (phonesMap || {}) as Record<string, Enrich>;
  const proofPhoneTail = phoneTail(conv?.customer_phone);

  type Cand = { salesId: string; valor: string; cliente: string; diff: number; tier: number };
  const candidates: Cand[] = [];

  for (const row of pendingList) {
    if (!row.salesId) continue;
    const enrich = map[row.salesId] || null;
    const zeglamPhoneTail = phoneTail(enrich?.phone_digits || '');
    const zeglamAmount = parseBrlAmount(row.valor);
    const proofAmount = parseBrlAmount(proof.detected_value || '');
    if (zeglamAmount == null || proofAmount == null) continue;
    if (!amountMatches(row.valor, proof.detected_value || '')) continue;

    let tier = 999;
    if (
      zeglamPhoneTail.length >= 8 &&
      proofPhoneTail.length >= 8 &&
      (proofPhoneTail.endsWith(zeglamPhoneTail) || zeglamPhoneTail.endsWith(proofPhoneTail))
    ) {
      tier = 1;
    } else if (nameFullyCompatibleWithProof(proof.customer_name, [row.cliente, enrich?.customer_name])) {
      tier = 2;
    } else continue;

    candidates.push({
      salesId: row.salesId,
      valor: row.valor,
      cliente: row.cliente,
      diff: Math.abs(proofAmount - zeglamAmount),
      tier,
    });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.tier - b.tier || a.diff - b.diff);
  const best = candidates[0];
  return { salesId: best.salesId, valor: best.valor, cliente: best.cliente };
}

/**
 * Registra pagamento no Zeglam (`setAsPaid`). O envio da mensagem ao cliente
 * segue o fluxo oficial do Zeglam (não usa evolution-send deste painel).
 */
export async function confirmProofPaymentInZeglam(
  supabase: SupabaseClient,
  proof: ProofForZeglamConfirm,
  opts?: { /** Default `true`. `false` tenta suprimir o aviso automático do Zeglam (form scrape ou secrets). */
    notifyCustomer?: boolean },
): Promise<
  | { ok: true; salesId: string; clientNotifySuppressionUnconfigured?: boolean }
  | { ok: false; error: string; needsManualZeglam?: boolean }
> {
  const notifyCustomer = opts?.notifyCustomer !== false;
  const match = await findBestZeglamPendingForProof(supabase, proof);
  if (!match) {
    return {
      ok: false,
      needsManualZeglam: true,
      error:
        'Não encontramos pendência no Zeglam com o mesmo valor e nome/telefone deste comprovante. Confira em Sistema Zeglam ou ajuste o vínculo.',
    };
  }

  const { data: details, error: dErr } = await supabase.functions.invoke('zeglam-api', {
    body: { action: 'get_payment_details', salesId: match.salesId },
  });
  if (dErr) {
    return { ok: false, error: dErr.message };
  }
  const saldo = (details as Record<string, string>)['Saldo Pendente'];
  if (!saldo?.trim()) {
    return {
      ok: false,
      error: 'Não foi possível ler o saldo pendente no formulário Zeglam para este pedido.',
    };
  }

  const { data, error } = await supabase.functions.invoke('zeglam-api', {
    body: {
      action: 'confirm_payment',
      salesId: match.salesId,
      openAmount: saldo,
      totalPay: saldo,
      percentualEntrada: 100,
      notifyCustomer,
    },
  });

  if (error) {
    const body = data as { error?: string } | undefined;
    return { ok: false, error: body?.error || error.message };
  }

  const body = data as {
    success?: boolean;
    stillInPendingList?: boolean;
    clientNotifySuppressionUnconfigured?: boolean;
    error?: string;
    status?: number;
    attemptLog?: { variant?: string; status: number; stillPending?: boolean }[];
  };

  if (body?.error) return { ok: false, error: body.error };
  if (!body?.success) {
    const logLine =
      body?.attemptLog
        ?.map(
          (a) =>
            `${a.variant ?? 'setAsPaid'} → ${a.status}${a.stillPending === true ? ' (ainda pendente)' : ''}`,
        )
        .join(' · ') ?? '';
    return {
      ok: false,
      error: body?.stillInPendingList
        ? `O Zeglam aceitou a requisição, mas a venda ainda aparece como pendente.${logLine ? ` ${logLine}` : ''} Confira valores no Zeglam.`
        : `O Zeglam não confirmou o pagamento (HTTP ${body?.status ?? '?'}).${logLine ? ` ${logLine}` : ''}`,
    };
  }

  return {
    ok: true,
    salesId: match.salesId,
    ...(body?.clientNotifySuppressionUnconfigured ? { clientNotifySuppressionUnconfigured: true } : {}),
  };
}
