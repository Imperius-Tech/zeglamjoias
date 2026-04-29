import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

/** Mesmo ID canônico que `src/lib/groupIntakeTemplate.ts`. */
const GROUP_INTAKE_KNOWLEDGE_ENTRY_ID = '26c4e95f-2f64-449f-ad17-e2560356f01a';

const DEFAULT_ANSWER_FALLBACK = `Olá.
Tudo bem?

Solicito, por gentileza, o envio das seguintes informações:

* Nome completo:
* Nome da marca:
* Cidade:
* Galvânica utilizada:
* Vendedor que te indicou:

Você já participa de algum Grupo de Compras Coletivas?
Se sim, poderia informar o nome?

Após o registro dos dados, realizarei sua inclusão no grupo.`;

/** Cliente já citou indicação na conversa recente → não repetir bullet de vendedor. */
function customerLikelyAlreadyMentionedReferrer(customerText: string): boolean {
  const t = customerText.trim();
  if (t.length < 4) return false;
  if (/\b(indicou|indicada|indicaram|indicação)\b/i.test(t)) return true;
  if (/\b(me\s+indicou|me\s+indicaram|me\s+passou|me\s+passaram|fui\s+indicad)\b/i.test(t)) return true;
  if (/\bindicou\s+(o\s+)?grupo\b/i.test(t)) return true;
  return false;
}

function stripVendorIndicationBullet(text: string): string {
  const lines = text.split('\n');
  const kept = lines.filter((line) => {
    const s = line.trim();
    if (/^(\*|·|•)?\s*Vendedor que te indicou/i.test(s)) return false;
    return true;
  });
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function splitGroupIntakeAnswerToBubbles(answer: string): string[] {
  const blocks = answer
    .trim()
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) return splitGroupIntakeAnswerToBubbles(DEFAULT_ANSWER_FALLBACK);

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

function buildSequenceFromKbAnswer(answer: string, omitVendorLine: boolean): { text: string; delayMs: number }[] {
  let bubbles = splitGroupIntakeAnswerToBubbles(answer);
  if (omitVendorLine) {
    bubbles = bubbles.map((b) =>
      /\bSolicito\b/i.test(b) || /Nome completo/i.test(b) ? stripVendorIndicationBullet(b) : b
    );
  }
  const delays = [0, 1500, 2200];
  return bubbles.map((text, i) => ({ text, delayMs: delays[i] ?? 1800 }));
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

async function resolveInstanceName(instanceId: string | null | undefined): Promise<string> {
  if (instanceId) {
    const { data } = await supabase.from('instances').select('evolution_instance_name').eq('evolution_instance_id', instanceId).maybeSingle();
    if (data?.evolution_instance_name) return data.evolution_instance_name;
  }
  const { data: cfg } = await supabase.from('evolution_config').select('instance_name').limit(1).maybeSingle();
  return cfg?.instance_name || 'Teste Zeglam';
}

async function sendOne(apiUrl: string, apiKey: string, instance: string, jid: string, text: string): Promise<string> {
  const res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
    method: 'POST', headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: jid.replace('@s.whatsapp.net', ''), text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`evolution_send_failed: ${JSON.stringify(data)}`);
  return data?.key?.id || `sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function checkAlreadyMember(conversationId: string): Promise<{ alreadyMember: boolean; groupName?: string; error?: string }> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const res = await fetch(`${supabaseUrl}/functions/v1/group-membership`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check', conversationId }),
    });
    if (!res.ok) return { alreadyMember: false, error: `http_${res.status}` };
    const data = await res.json();
    return { alreadyMember: !!data.alreadyMember, groupName: data.groupName };
  } catch (e) { return { alreadyMember: false, error: String(e) }; }
}

async function recentCustomerTextBlob(conversationId: string): Promise<string> {
  const { data: rows } = await supabase
    .from('messages')
    .select('author, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(25);
  if (!rows?.length) return '';
  const parts: string[] = [];
  for (const r of rows) {
    if (r.author === 'cliente' && typeof r.content === 'string') parts.push(r.content);
  }
  return parts.join('\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { conversationId, force, skipMembershipCheck, currentCustomerMessage } = await req.json();
    if (!conversationId) return new Response(JSON.stringify({ error: 'missing conversationId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const apiUrl = Deno.env.get('EVOLUTION_API_URL');
    const apiKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!apiUrl || !apiKey) return new Response(JSON.stringify({ error: 'evolution_not_configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: conv } = await supabase.from('conversations').select('id, whatsapp_jid, group_candidate_status, instance_id').eq('id', conversationId).maybeSingle();
    if (!conv || !conv.whatsapp_jid) return new Response(JSON.stringify({ error: 'conversation_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (conv.whatsapp_jid.endsWith('@g.us')) return new Response(JSON.stringify({ skipped: true, reason: 'group_conversation' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (!force && conv.group_candidate_status) return new Response(JSON.stringify({ skipped: true, reason: 'already_in_flow', status: conv.group_candidate_status }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let customerBlob = await recentCustomerTextBlob(conversationId);
    if (typeof currentCustomerMessage === 'string' && currentCustomerMessage.trim()) {
      customerBlob = `${currentCustomerMessage.trim()}\n${customerBlob}`;
    }
    const omitVendorLine = customerLikelyAlreadyMentionedReferrer(customerBlob);

    if (!skipMembershipCheck) {
      const membership = await checkAlreadyMember(conversationId);
      if (membership.alreadyMember) {
        await supabase.from('conversations').update({
          group_candidate_status: 'adicionada',
          group_candidate_updated_at: new Date().toISOString(),
        }).eq('id', conversationId);
        return new Response(JSON.stringify({
          skipped: true, reason: 'already_member',
          groupName: membership.groupName,
          markedAs: 'adicionada',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const { data: ke } = await supabase
      .from('knowledge_entries')
      .select('answer')
      .eq('id', GROUP_INTAKE_KNOWLEDGE_ENTRY_ID)
      .maybeSingle();
    const kbAnswer = (ke?.answer && String(ke.answer).trim()) || DEFAULT_ANSWER_FALLBACK;

    const INTAKE_SEQUENCE = buildSequenceFromKbAnswer(kbAnswer, omitVendorLine);

    await supabase.from('conversations').update({
      group_candidate_status: 'aguardando_dados',
      group_candidate_data: conv.group_candidate_status ? undefined : {},
      group_candidate_updated_at: new Date().toISOString(),
    }).eq('id', conversationId);

    const instanceName = await resolveInstanceName(conv.instance_id);
    const instance = encodeURIComponent(instanceName);
    const sent: { waId: string; text: string }[] = [];

    for (const step of INTAKE_SEQUENCE) {
      if (step.delayMs > 0) await sleep(step.delayMs);
      try {
        const waId = await sendOne(apiUrl, apiKey, instance, conv.whatsapp_jid, step.text);
        await supabase.from('messages').upsert({
          conversation_id: conversationId, author: 'humano', content: step.text, whatsapp_message_id: waId,
          created_at: new Date().toISOString(), status: 'sent', sent_by: 'ai',
        }, { onConflict: 'whatsapp_message_id', ignoreDuplicates: true });
        sent.push({ waId, text: step.text });
      } catch (e) {
        console.error('[send-group-intake-template] failed on step:', step.text, e);
        return new Response(JSON.stringify({ error: 'send_failed', sent, failed_on: step.text, details: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    await supabase.from('conversations').update({ last_message_at: new Date().toISOString(), status: 'ia_respondendo' }).eq('id', conversationId);

    return new Response(JSON.stringify({ success: true, sent, instanceName, omitVendorLine }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[send-group-intake-template] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
