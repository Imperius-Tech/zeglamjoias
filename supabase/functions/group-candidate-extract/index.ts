import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// v17: INTENT_REGEX strict — exige verbo de intencao explicito + objeto "grupo" proximo.
// Falsos positivos eliminados v17:
//  - "compra coletiva" sozinho (cliente fala de pedido anterior)
//  - "amiga me indicou" sozinho (sem pedido entrada grupo)
//  - "fui indicada" sozinho (pode ser pra qualquer outra coisa)
// Match exige: (verbo intent) + (palavra grupo num raio curto) OU expressao idiomatica especifica.
const MAX_ASK_COUNT = 2;
const ASK_COOLDOWN_MS = 10 * 60 * 1000;
const TEMPLATE_GRACE_MS = 5 * 60 * 1000;

const INTENT_REGEX =
  /(?:quero|gostaria|posso|como\s+(?:faço|fazer))\s+(?:de\s+)?(?:entrar|participar|fazer\s+parte|ingressar|ser\s+adicionad[ao])(?:\s+\S+){0,4}\s+\bgrupo\b|entrar\s+n[oe]\s+grupo\b|participar\s+d[oe]\s+grupo\b|(?:^|[\s,.!?"])(?:me\s+)?(?:add|adiciona|adicionar|adicione|inclui|incluir|coloca|colocar|bota|botar|cadastra|cadastrar)\s+(?:me\s+)?(?:no|ao|em\s+um)\s+grupo\b|\b(?:link|convite)\s+(?:d[oe]\s+|do\s+|para\s+(?:entrar\s+n[oe]\s+)?)?grupo\b|\bgrupo\s+(?:de\s+)?(?:compras\s+coletivas|zeglam)\b.{0,40}(?:quero|gostaria|entrar|participar|me\s+(?:add|adiciona|incluir|coloca))|(?:quero|gostaria|posso|me\s+(?:add|adiciona|incluir))\b.{0,40}\bgrupo\s+(?:de\s+)?(?:compras\s+coletivas|zeglam)\b/i;

const INTAKE_TEMPLATE_SIGNATURES = [
  'Solicito, por gentileza, o envio das seguintes informa',
  'Para finalizar sua inclusão',
];

const ASK_MISSING_SIGNATURE = 'Pra finalizar sua inclusão no grupo, preciso';

const FIELD_LABELS: Record<string, string> = {
  nome_completo: 'Nome completo',
  nome_marca: 'Marca',
  cidade: 'Cidade',
  galvanica: 'Galvânica (ou "não tenho")',
  outro_grupo: 'Você participa de algum outro Grupo? (sim/não)',
};

function hasIntent(text: string): boolean { if (!text) return false; return INTENT_REGEX.test(text); }

function intakeTemplateInfo(historyMsgs: any[]): { sent: boolean; lastAt: number | null } {
  let lastAt: number | null = null;
  let sent = false;
  for (const m of historyMsgs) {
    if (m.author !== 'humano' && m.author !== 'ia') continue;
    const c = typeof m.content === 'string' ? m.content : '';
    if (INTAKE_TEMPLATE_SIGNATURES.some((sig) => c.includes(sig))) {
      sent = true;
      const ts = m.created_at ? new Date(m.created_at).getTime() : null;
      if (ts && (lastAt === null || ts > lastAt)) lastAt = ts;
    }
  }
  return { sent, lastAt };
}

function clientRespondedAfter(historyMsgs: any[], afterTs: number): boolean {
  for (const m of historyMsgs) {
    if (m.author !== 'cliente') continue;
    const ts = m.created_at ? new Date(m.created_at).getTime() : null;
    if (ts && ts > afterTs) return true;
  }
  return false;
}

// v13: detecta se ha QUALQUER msg humano/ia em conversa. Se sim, Zevaldo ja tocou -> nao auto-dispara
function hasAnyStaffMessage(historyMsgs: any[]): boolean {
  return historyMsgs.some((m: any) => m.author === 'humano' || m.author === 'ia');
}

function countAsksMissing(historyMsgs: any[]): { count: number; lastAt: number | null } {
  let count = 0; let lastAt: number | null = null;
  for (const m of historyMsgs) {
    if (m.author !== 'humano' && m.author !== 'ia') continue;
    const c = typeof m.content === 'string' ? m.content : '';
    if (c.includes(ASK_MISSING_SIGNATURE)) {
      count++;
      const ts = m.created_at ? new Date(m.created_at).getTime() : null;
      if (ts && (lastAt === null || ts > lastAt)) lastAt = ts;
    }
  }
  return { count, lastAt };
}

function missingRequiredFields(data: Record<string, string | null>): string[] {
  const required = ['nome_completo', 'nome_marca', 'cidade', 'galvanica', 'outro_grupo'];
  return required.filter((k) => !data[k]);
}

function buildAskMissingMessage(missing: string[]): string {
  const bullets = missing.map((k) => `• ${FIELD_LABELS[k] || k}`).join('\n');
  const count = missing.length;
  const pluralSuffix = count === 1 ? 'mais um dado' : `mais ${count} dados`;
  return `Pra finalizar sua inclusão no grupo, preciso de ${pluralSuffix}:\n\n${bullets}`;
}

function extractWithRegex(history: string): Record<string, string | null> {
  const res: Record<string, string | null> = {
    nome_completo: null, nome_marca: null, cidade: null, galvanica: null,
    outro_grupo_nome: null, outro_grupo: null,
  };
  const lines = history.split(/\n+/).map(l => l.trim()).filter(Boolean);
  for (const l of lines) {
    if (!l.startsWith('Cliente:')) continue;
    const body = l.replace(/^Cliente:\s*/i, '');
    const low = body.toLowerCase();
    const m1 = body.match(/nome\s*completo\s*[:\-–]\s*(.+)/i) || body.match(/meu\s+nome\s+é\s+(.+)/i);
    if (m1 && !res.nome_completo) res.nome_completo = m1[1].trim();
    const m2 = body.match(/nome\s*da\s*marca\s*[:\-–]\s*(.+)/i) || body.match(/minha\s+marca\s+(?:é|se\s+chama)\s+(.+)/i) || body.match(/marca\s*[:\-–]\s*(.+)/i);
    if (m2 && !res.nome_marca) res.nome_marca = m2[1].trim();
    const m3 = body.match(/cidade\s*[:\-–]\s*(.+)/i) || body.match(/sou\s+(?:de|da|do)\s+(.+)/i);
    if (m3 && !res.cidade) res.cidade = m3[1].trim();
    if (!res.galvanica) {
      if (/não\s+tenho|nao\s+tenho|sem\s+galv|não\s+uso|nao\s+uso|comprei\s+banhad|direto\s+(?:para|pro)\s+(?:o\s+)?meu\s+endere/i.test(body)) {
        res.galvanica = 'nenhuma';
      } else {
        const m4 = body.match(/galv[âa]nica\s*(?:utilizada)?\s*[:\-–]\s*(.+)/i);
        if (m4) res.galvanica = m4[1].trim();
      }
    }
    if (low.includes('não participo') || low.includes('nao participo')) res.outro_grupo = 'não';
    const ind1 = body.match(/(?:fui\s+)?indicad[ao]\s+(?:pel[ao]|por)\s+(.+?)(?:\.|,|$)/i);
    const ind2 = body.match(/(.+?)\s+me\s+indicou/i);
    const ind3 = body.match(/(.+?)\s+(?:me\s+)?passou\s+(?:o\s+)?(?:seu|teu)\s+contato/i);
    const ind4 = body.match(/(?:através|por meio)\s+d[ao]?\s+(.+?)(?:\.|,|$)/i);
    if ((ind1 || ind2 || ind3 || ind4) && !res.outro_grupo_nome) {
      const match = ind1 || ind2 || ind3 || ind4;
      const name = match![1].trim();
      res.outro_grupo_nome = name.charAt(0).toUpperCase() + name.slice(1);
    }
    const m5 = body.match(/participo\s+do\s+grupo\s+(.+)/i) || body.match(/grupo\s+da?\s+(.+?)(?:\.|$)/i);
    if (m5 && !res.outro_grupo_nome) { res.outro_grupo_nome = m5[1].trim(); res.outro_grupo = 'sim'; }
  }
  return res;
}

async function extractWithAI(history: string, apiKey: string, model: string): Promise<Record<string, string | null> | null> {
  try {
    const prompt = `Extrator rigido de dados. Analise o historico e extraia APENAS o que o CLIENTE explicitamente informou.\n\nHistorico:\n${history}\n\nJSON:\n{\n  "nome_completo": string|null,\n  "nome_marca": string|null,\n  "cidade": string|null,\n  "galvanica": string|null,\n  "outro_grupo": "sim"|"não"|null,\n  "outro_grupo_nome": string|null\n}\n\nREGRAS:\n1. Se cliente NAO falou nada do campo, use null.\n2. "galvanica": se cliente disse "nao tenho", "nao uso", "comprei banhada", "direto pro meu endereco", "sem galvanica" -> retorne "nenhuma". Se mencionou marca de galvanica -> retorne o nome. Se nada dito -> null.\n3. "outro_grupo" é "sim" se participa de outro grupo, "não" se declarou nao participar, null se nao mencionou.\n4. "outro_grupo_nome": quem indicou o cliente. So nome, capitalizado.\n5. Extraia APENAS linhas "Cliente:".\n6. Nao confunda intencao de entrar com participar de outro.`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0, response_format: { type: 'json_object' }, max_tokens: 300 }),
    });
    const data = await res.json();
    if (data.usage) { try { await supabase.from('openai_usage_log').insert({ function_name: 'group-candidate-extract', operation: 'extract', model: model || 'gpt-4o-mini', prompt_tokens: data.usage.prompt_tokens || 0, completion_tokens: data.usage.completion_tokens || 0, total_tokens: data.usage.total_tokens || 0, cost_usd: (data.usage.prompt_tokens / 1000) * 0.00015 + (data.usage.completion_tokens / 1000) * 0.0006 }); } catch {} }
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch (e) { console.error('[group-candidate-extract v13] AI failed:', e); return null; }
}

function isComplete(data: Record<string, string | null>): boolean {
  return !!(data.nome_completo && data.nome_marca && data.cidade && data.galvanica && data.outro_grupo);
}

async function getAIConfigForInstance(instanceId: string | null) {
  let query = supabase.from('ai_config').select('api_key, model, provider');
  if (instanceId) query = query.eq('instance_id', instanceId);
  const { data } = await query.limit(1).maybeSingle();
  return data;
}

async function resolveInstanceName(instanceId: string | null): Promise<string> {
  if (!instanceId) return 'Teste Zeglam';
  const { data } = await supabase.from('instances').select('evolution_instance_name').eq('evolution_instance_id', instanceId).maybeSingle();
  return data?.evolution_instance_name || 'Teste Zeglam';
}

async function sendMessage(instanceName: string, jid: string, text: string): Promise<boolean> {
  const apiUrl = Deno.env.get('EVOLUTION_API_URL');
  const apiKey = Deno.env.get('EVOLUTION_API_KEY');
  if (!apiUrl || !apiKey) return false;
  try {
    const instance = encodeURIComponent(instanceName);
    const res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: 'POST', headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: jid.replace('@s.whatsapp.net', ''), text }),
    });
    return res.ok;
  } catch { return false; }
}

async function circuitBreakerCheck(conversationId: string, content: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const { data, error } = await supabase.rpc('ai_can_send', { p_conversation_id: conversationId, p_content: content, p_max_total: 5, p_max_duplicate: 2, p_window_minutes: 30 });
    if (error) return { allowed: true };
    return { allowed: data?.allowed === true, reason: data?.reason };
  } catch { return { allowed: true }; }
}

async function circuitBreakerLog(conversationId: string, content: string, fnName: string) {
  try { await supabase.rpc('ai_log_send', { p_conversation_id: conversationId, p_content: content, p_function_name: fnName }); } catch {}
}

// v13: dispara send-group-intake-template fire-and-forget (ele tem check membership interno)
async function triggerIntakeTemplate(conversationId: string): Promise<{ triggered: boolean; reason?: string }> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const res = await fetch(`${supabaseUrl}/functions/v1/send-group-intake-template`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    });
    if (!res.ok) return { triggered: false, reason: `http_${res.status}` };
    const data = await res.json().catch(() => null);
    if (data?.skipped) return { triggered: false, reason: data.reason };
    return { triggered: data?.success === true };
  } catch (e) { return { triggered: false, reason: String(e) }; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { conversationId, autoAsk = true } = await req.json();
    if (!conversationId) return new Response(JSON.stringify({ error: 'missing conversationId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: conv } = await supabase.from('conversations').select('id, whatsapp_jid, group_candidate_status, group_candidate_data, instance_id, ai_enabled').eq('id', conversationId).maybeSingle();
    if (!conv) return new Response(JSON.stringify({ error: 'conversation_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (typeof conv.whatsapp_jid === 'string' && conv.whatsapp_jid.endsWith('@g.us')) {
      return new Response(JSON.stringify({ skipped: true, reason: 'group_conversation' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (conv.group_candidate_status === 'adicionada' || conv.group_candidate_status === 'recusada') {
      return new Response(JSON.stringify({ skipped: true, reason: 'already_closed', status: conv.group_candidate_status }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: msgs } = await supabase.from('messages').select('author, content, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(80);
    const msgList = (msgs || []).slice().reverse();
    const history = msgList.filter((m: any) => !!m.content).map((m: any) => `${m.author === 'cliente' ? 'Cliente' : 'Atendente'}: ${m.content}`).join('\n');

    const clientMessages = msgList.filter((m: any) => m.author === 'cliente').map((m: any) => m.content || '').join('\n');
    const hasGroupIntent = hasIntent(clientMessages);
    const alreadyInFlow = conv.group_candidate_status === 'intent_detectado' || conv.group_candidate_status === 'aguardando_dados' || conv.group_candidate_status === 'dados_coletados';
    const templateInfo = intakeTemplateInfo(msgList);
    const templateSent = templateInfo.sent;
    const staffTouched = hasAnyStaffMessage(msgList);

    if (!hasGroupIntent && !alreadyInFlow) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no_intent' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // v13: conversa nova + intent + staff NAO tocou + template NAO enviado -> auto-dispara template
    // send-group-intake-template v3 tem check membership interno (se ja e membro, marca adicionada + nao envia)
    if (!templateSent && !conv.group_candidate_data && !staffTouched) {
      await supabase.from('conversations').update({ group_candidate_status: 'intent_detectado', group_candidate_data: {}, group_candidate_updated_at: new Date().toISOString() }).eq('id', conversationId);

      // Circuit breaker: nao dispara se ja mandou 5 msgs ia/30min
      const cb = await circuitBreakerCheck(conversationId, 'Solicito, por gentileza');
      if (!cb.allowed) {
        return new Response(JSON.stringify({ success: true, status: 'intent_detectado', data: {}, complete: false, templateSent: false, autoTemplateTriggered: false, reason: `circuit_breaker_${cb.reason}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Dispara template (send-group-intake-template checa membership + marca adicionada se ja membro)
      const triggerResult = await triggerIntakeTemplate(conversationId);

      return new Response(JSON.stringify({ success: true, status: 'intent_detectado', data: {}, complete: false, templateSent: triggerResult.triggered, autoTemplateTriggered: triggerResult.triggered, triggerReason: triggerResult.reason }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Staff ja tocou mas nao tem dados coletados -> Zevaldo tomou conta. Nao dispara template.
    if (!templateSent && !conv.group_candidate_data && staffTouched) {
      await supabase.from('conversations').update({ group_candidate_status: 'intent_detectado', group_candidate_data: {}, group_candidate_updated_at: new Date().toISOString() }).eq('id', conversationId);
      return new Response(JSON.stringify({ success: true, status: 'intent_detectado', data: {}, complete: false, templateSent: false, autoTemplateTriggered: false, reason: 'staff_already_engaged' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let extracted: Record<string, string | null> | null = null;
    const aiCfg = await getAIConfigForInstance(conv.instance_id);
    if (aiCfg?.api_key && (aiCfg?.provider ?? 'openai') === 'openai') {
      extracted = await extractWithAI(history, aiCfg.api_key, aiCfg.model || 'gpt-4o-mini');
    }
    if (!extracted) extracted = extractWithRegex(history);

    const prev = (conv.group_candidate_data as Record<string, string | null>) || {};
    const merged: Record<string, string | null> = { ...prev };
    for (const k of Object.keys(extracted)) {
      const v = extracted[k];
      if (v && typeof v === 'string' && v.trim() && v.toLowerCase() !== 'null') merged[k] = v.trim();
      else if (!merged[k]) merged[k] = null;
    }

    const complete = isComplete(merged);
    const newStatus = complete ? 'dados_coletados' : 'aguardando_dados';
    const updatePayload: any = { group_candidate_status: newStatus, group_candidate_data: merged, group_candidate_updated_at: new Date().toISOString() };
    if (complete) updatePayload.status = 'aguardando_humano';
    await supabase.from('conversations').update(updatePayload).eq('id', conversationId);

    let askedMissing = false;
    let skipReason: string | null = null;

    if (!complete && autoAsk && conv.ai_enabled !== false && templateSent) {
      const now = Date.now();
      if (templateInfo.lastAt) {
        const sinceTemplate = now - templateInfo.lastAt;
        const clientResponded = clientRespondedAfter(msgList, templateInfo.lastAt);
        if (sinceTemplate < TEMPLATE_GRACE_MS && !clientResponded) {
          skipReason = `template_grace_${Math.round((TEMPLATE_GRACE_MS - sinceTemplate) / 1000)}s_remaining`;
          return new Response(JSON.stringify({ success: true, status: newStatus, data: merged, complete, templateSent: true, askedMissing: false, skipReason }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      const { count: askCount, lastAt: lastAskAt } = countAsksMissing(msgList);
      const cooldownExpired = !lastAskAt || (now - lastAskAt) > ASK_COOLDOWN_MS;

      if (askCount >= MAX_ASK_COUNT) {
        skipReason = `max_asks_reached_${askCount}`;
        await supabase.from('conversations').update({ status: 'aguardando_humano', priority: 'altissima', priority_reason: 'outro' }).eq('id', conversationId);
      } else if (!cooldownExpired) {
        skipReason = `cooldown_active_${Math.round((ASK_COOLDOWN_MS - (now - lastAskAt!)) / 1000)}s`;
      } else {
        const missing = missingRequiredFields(merged);
        if (missing.length > 0 && missing.length < 5) {
          const anyFilled = Object.values(merged).some((v) => v);
          if (anyFilled) {
            const text = buildAskMissingMessage(missing);
            const cb = await circuitBreakerCheck(conversationId, text);
            if (!cb.allowed) {
              skipReason = `circuit_breaker_${cb.reason}`;
              await supabase.from('conversations').update({ status: 'aguardando_humano', priority: 'altissima', priority_reason: 'outro' }).eq('id', conversationId);
            } else {
              const instanceName = await resolveInstanceName(conv.instance_id);
              const ok = await sendMessage(instanceName, conv.whatsapp_jid!, text);
              if (ok) {
                await supabase.from('messages').insert({ conversation_id: conversationId, author: 'ia', content: text, sent_by: 'ai', is_draft: false, whatsapp_message_id: `ask-missing-${Date.now()}`, created_at: new Date().toISOString(), status: 'sent' });
                await circuitBreakerLog(conversationId, text, 'group-candidate-extract');
                askedMissing = true;
              }
            }
          } else { skipReason = 'no_data_yet'; }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, status: newStatus, data: merged, complete, templateSent: true, askedMissing, skipReason }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[group-candidate-extract v13] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
