import type { SupabaseClient } from '@supabase/supabase-js';
import {
  amountMatches,
  nameFullyCompatibleWithProof,
  normalize,
  parseBrlAmount,
  phoneTail,
} from '@/lib/zeglamMatchUtils';

export type ProofForZeglamConfirm = {
  conversation_id: string;
  customer_name: string;
  detected_value: string | null;
  /** Nome do pagador extraído do comprovante (ex: "JOAO DA SILVA"), opcional. */
  payer_name?: string | null;
};

async function lookupAliasSalesId(
  supabase: SupabaseClient,
  payerName: string | null | undefined,
  customerPhoneDigits: string | null,
): Promise<string | null> {
  const candidates = new Set<string>();
  if (payerName) candidates.add(normalize(payerName));
  if (customerPhoneDigits && customerPhoneDigits.length >= 8) candidates.add(`__phone__${customerPhoneDigits}`);
  if (!candidates.size) return null;

  const payerNormalizedList = Array.from(candidates).filter((c) => !c.startsWith('__phone__'));
  const phoneTails = Array.from(candidates).filter((c) => c.startsWith('__phone__')).map((c) => c.replace('__phone__', ''));

  const queries: Promise<{ data: any[] | null }>[] = [];
  if (payerNormalizedList.length) {
    queries.push(
      supabase
        .from('payer_aliases')
        .select('sales_id, customer_phone_digits, last_used_at, use_count')
        .in('payer_name_normalized', payerNormalizedList)
        .not('sales_id', 'is', null)
        .order('use_count', { ascending: false })
        .limit(5) as any,
    );
  }
  if (phoneTails.length) {
    queries.push(
      supabase
        .from('payer_aliases')
        .select('sales_id, customer_phone_digits, last_used_at, use_count')
        .in('customer_phone_digits', phoneTails)
        .not('sales_id', 'is', null)
        .order('use_count', { ascending: false })
        .limit(5) as any,
    );
  }

  const results = await Promise.all(queries);
  for (const r of results) {
    const row = r.data?.[0];
    if (row?.sales_id) return row.sales_id as string;
  }
  return null;
}

export async function recordPayerAliasUsage(supabase: SupabaseClient, aliasSalesId: string) {
  const { data: row } = await supabase
    .from('payer_aliases')
    .select('use_count')
    .eq('sales_id', aliasSalesId)
    .maybeSingle();
  await supabase
    .from('payer_aliases')
    .update({ last_used_at: new Date().toISOString(), use_count: ((row?.use_count as number) || 0) + 1 })
    .eq('sales_id', aliasSalesId);
}

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

  // Tier 3: alias manual de pagador (ex: marido paga pela esposa, financeiro PJ).
  if (!candidates.length) {
    const aliasSalesId = await lookupAliasSalesId(supabase, proof.payer_name || proof.customer_name, proofPhoneTail || null);
    if (aliasSalesId) {
      const aliasRow = pendingList.find((p) => p.salesId === aliasSalesId);
      if (aliasRow && amountMatches(aliasRow.valor, proof.detected_value || '')) {
        const proofAmount = parseBrlAmount(proof.detected_value || '') || 0;
        const zeglamAmount = parseBrlAmount(aliasRow.valor) || 0;
        candidates.push({
          salesId: aliasRow.salesId!,
          valor: aliasRow.valor,
          cliente: aliasRow.cliente,
          diff: Math.abs(proofAmount - zeglamAmount),
          tier: 3,
        });
      }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.tier - b.tier || a.diff - b.diff);
  const best = candidates[0];
  // Registra uso do alias se foi tier 3
  if (best.tier === 3) {
    recordPayerAliasUsage(supabase, best.salesId).catch(() => {});
  }
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
