import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// v40: Adicionado auto-fetch de profile_pic_url no webhook.
const BUFFER_SECONDS = 12;

const LEGACY_INSTANCE_MAP: Record<string, string> = {
  'Zevaldo': 'BFAEC0CF8EEF-4082-9A60-161146E70BCA',
  'Teste Zeglam': '17CDD9ED-08A0-462E-A392-B486AA095E1A',
  'Teste Zaglam': '17CDD9ED-08A0-462E-A392-B486AA095E1A',
};

const instanceCache = new Map<string, { id: string | null; expiresAt: number }>();
const INSTANCE_CACHE_TTL_MS = 60 * 1000;

async function resolveInstanceId(instanceName: string): Promise<string | null> {
  const now = Date.now();
  const cached = instanceCache.get(instanceName);
  if (cached && cached.expiresAt > now) return cached.id;
  const { data } = await supabase.from('instances').select('evolution_instance_id').eq('evolution_instance_name', instanceName).maybeSingle();
  if (data?.evolution_instance_id) {
    instanceCache.set(instanceName, { id: data.evolution_instance_id, expiresAt: now + INSTANCE_CACHE_TTL_MS });
    return data.evolution_instance_id;
  }
  if (LEGACY_INSTANCE_MAP[instanceName]) {
    instanceCache.set(instanceName, { id: LEGACY_INSTANCE_MAP[instanceName], expiresAt: now + INSTANCE_CACHE_TTL_MS });
    return LEGACY_INSTANCE_MAP[instanceName];
  }
  const { data: cfg } = await supabase.from('evolution_config').select('active_instance_id').limit(1).maybeSingle();
  const fallback = cfg?.active_instance_id || null;
  instanceCache.set(instanceName, { id: fallback, expiresAt: now + INSTANCE_CACHE_TTL_MS });
  return fallback;
}

function normalizeEvent(ev: string | undefined | null): string {
  if (!ev) return '';
  return ev.toLowerCase().replace(/_/g, '.').trim();
}

function isValidJid(jid: string): boolean {
  if (!jid) return false;
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid') || jid.endsWith('@g.us');
}

function extractPhone(jid: string): string {
  const num = jid.split('@')[0];
  if (num.length >= 12) { return `+${num.slice(0,2)} (${num.slice(2,4)}) ${num.slice(4,9)}-${num.slice(9)}`; }
  return num;
}

function unwrapMessage(msg: any): any {
  if (!msg) return msg;
  if (msg.viewOnceMessage?.message) return unwrapMessage(msg.viewOnceMessage.message);
  if (msg.viewOnceMessageV2?.message) return unwrapMessage(msg.viewOnceMessageV2.message);
  if (msg.ephemeralMessage?.message) return unwrapMessage(msg.ephemeralMessage.message);
  if (msg.documentWithCaptionMessage?.message) return unwrapMessage(msg.documentWithCaptionMessage.message);
  if (msg.editMessage?.message) return unwrapMessage(msg.editMessage.message);
  return msg;
}

function detectMedia(rawMsg: any): { type: string | null; caption: string | null; base64: string | null; mime: string | null; ext: string } {
  const msg = unwrapMessage(rawMsg);
  if (!msg) return { type: null, caption: null, base64: null, mime: null, ext: '' };
  const b64 = msg.base64 || rawMsg.base64 || null;
  if (msg.imageMessage) return { type: 'image', caption: msg.imageMessage.caption || null, base64: b64, mime: msg.imageMessage.mimetype || 'image/jpeg', ext: 'jpg' };
  if (msg.videoMessage) return { type: 'video', caption: msg.videoMessage.caption || null, base64: b64, mime: msg.videoMessage.mimetype || 'video/mp4', ext: 'mp4' };
  if (msg.audioMessage) return { type: 'audio', caption: null, base64: b64, mime: msg.audioMessage.mimetype || 'audio/ogg', ext: 'ogg' };
  if (msg.stickerMessage) return { type: 'sticker', caption: null, base64: b64, mime: 'image/webp', ext: 'webp' };
  if (msg.documentMessage) {
    const fn = msg.documentMessage.fileName || '';
    const ext = fn.includes('.') ? fn.split('.').pop()! : 'pdf';
    return { type: 'document', caption: fn || null, base64: b64, mime: msg.documentMessage.mimetype || 'application/octet-stream', ext };
  }
  return { type: null, caption: null, base64: null, mime: null, ext: '' };
}

async function fetchBase64OnDemand(instanceName: string, key: any, message: any): Promise<string | null> {
  try {
    const apiUrl = Deno.env.get('EVOLUTION_API_URL');
    const apiKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!apiUrl || !apiKey) return null;
    const instance = encodeURIComponent(instanceName);
    const res = await fetch(`${apiUrl}/chat/getBase64FromMediaMessage/${instance}`, {
      method: 'POST',
      headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { key, message } }),
    });
    if (!res.ok) { console.error(`[fetchBase64OnDemand] HTTP ${res.status}`); return null; }
    const data = await res.json().catch(() => null);
    return data?.base64 || null;
  } catch (e) { console.error('[fetchBase64OnDemand] exception:', e); return null; }
}

function extractContentSmart(rawMsg: any): { text: string | null; shouldIgnore: boolean } {
  const msg = unwrapMessage(rawMsg);
  if (!msg) return { text: null, shouldIgnore: false };
  if (msg.conversation) return { text: msg.conversation, shouldIgnore: false };
  if (msg.extendedTextMessage?.text) return { text: msg.extendedTextMessage.text, shouldIgnore: false };
  if (msg.imageMessage?.caption) return { text: msg.imageMessage.caption, shouldIgnore: false };
  if (msg.videoMessage?.caption) return { text: msg.videoMessage.caption, shouldIgnore: false };
  if (msg.reactionMessage) {
    const emoji = msg.reactionMessage.text || '';
    return { text: emoji ? `reagiu com ${emoji}` : 'removeu a reacao', shouldIgnore: false };
  }
  if (msg.pollCreationMessage || msg.pollCreationMessageV3) {
    const poll = msg.pollCreationMessage || msg.pollCreationMessageV3;
    const name = poll.name || 'Enquete';
    const opts = (poll.options || []).map((o: any) => o.optionName).filter(Boolean).join(' / ');
    return { text: `\\ud83d\\udcca ${name}${opts ? ` (${opts})` : ''}`, shouldIgnore: false };
  }
  if (msg.locationMessage) {
    const loc = msg.locationMessage;
    const coord = loc.degreesLatitude && loc.degreesLongitude ? ` (${loc.degreesLatitude.toFixed(4)}, ${loc.degreesLongitude.toFixed(4)})` : '';
    return { text: `\\ud83d\\udccd Localizacao${coord}`, shouldIgnore: false };
  }
  if (msg.contactMessage) {
    const name = msg.contactMessage.displayName || 'Contato';
    return { text: `\\ud83d\\udc64 Contato: ${name}`, shouldIgnore: false };
  }
  if (msg.contactsArrayMessage) {
    const cs = msg.contactsArrayMessage.contacts || [];
    const names = cs.map((c: any) => c.displayName).filter(Boolean).join(', ');
    return { text: `\\ud83d\\udc65 Contatos: ${names}`, shouldIgnore: false };
  }
  if (msg.protocolMessage) return { text: null, shouldIgnore: true };
  if (msg.templateMessage?.hydratedTemplate?.hydratedContentText) return { text: msg.templateMessage.hydratedTemplate.hydratedContentText, shouldIgnore: false };
  if (msg.buttonsMessage?.contentText) return { text: msg.buttonsMessage.contentText, shouldIgnore: false };
  return { text: null, shouldIgnore: false };
}

async function uploadMedia(convId: string, msgId: string, base64Data: string, mime: string, ext: string): Promise<string | null> {
  try {
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    const binaryStr = atob(cleanBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const fileName = `${convId}/${msgId}.${ext}`;
    const { data: uploaded, error } = await supabase.storage.from('media').upload(fileName, bytes, { contentType: mime, upsert: true });
    if (error) { console.error('Upload error:', error.message); return null; }
    if (uploaded) {
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
      return urlData?.publicUrl || null;
    }
    return null;
  } catch (err) { console.error('Upload exception:', err); return null; }
}

function mapStatus(evoStatus: string | number): string | null {
  const s = String(evoStatus).toUpperCase();
  if (s === 'DELIVERY_ACK' || s === 'DELIVERED' || s === '3' || s === 'SERVER_ACK') return 'delivered';
  if (s === 'READ' || s === 'READ_ACK' || s === '4' || s === '5') return 'read';
  if (s === 'PLAYED' || s === '6') return 'read';
  if (s === 'ERROR' || s === 'FAILED') return 'error';
  if (s === 'PENDING' || s === '0' || s === '1') return 'sent';
  if (s === 'SENT' || s === '2') return 'sent';
  return null;
}

async function schedulePendingReply(conversationId: string, instanceId: string | null, msgId: string) {
  const scheduledAt = new Date(Date.now() + BUFFER_SECONDS * 1000).toISOString();
  const now = new Date().toISOString();

  await supabase.from('messages').delete()
    .eq('conversation_id', conversationId)
    .eq('is_draft', true)
    .not('suggestion_group_id', 'is', null);

  const { data: existing } = await supabase
    .from('pending_ai_replies')
    .select('msg_count, processing')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (existing) {
    if (!existing.processing) {
      await supabase.from('pending_ai_replies').update({
        scheduled_at: scheduledAt,
        last_customer_msg_id: msgId,
        msg_count: (existing.msg_count || 1) + 1,
        updated_at: now,
      }).eq('conversation_id', conversationId);
    } else {
      await supabase.from('pending_ai_replies').upsert({
        conversation_id: conversationId,
        instance_id: instanceId || '',
        scheduled_at: scheduledAt,
        last_customer_msg_id: msgId,
        msg_count: 1,
        updated_at: now,
        processing: false,
        processing_since: null,
      }, { onConflict: 'conversation_id' });
    }
  } else {
    await supabase.from('pending_ai_replies').insert({
      conversation_id: conversationId,
      instance_id: instanceId || '',
      scheduled_at: scheduledAt,
      last_customer_msg_id: msgId,
      msg_count: 1,
    });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    if (!body) return new Response('ok', { headers: corsHeaders });

    const event = normalizeEvent(body.event);
    const evolutionInstanceName = body.instance || 'Teste Zeglam';
    const instanceId = await resolveInstanceId(evolutionInstanceName);

    if (event === 'messages.update' || event === 'message.update') {
      const data = body.data;
      const updates = Array.isArray(data) ? data : [data];
      for (const update of updates) {
        const msgId = update?.key?.id || update?.keyId || update?.id;
        const newStatus = update?.status || update?.update?.status;
        if (!msgId || !newStatus) continue;
        const mappedStatus = mapStatus(newStatus);
        if (!mappedStatus) continue;
        const statusPriority: Record<string, number> = { sent: 1, delivered: 2, read: 3, error: 0 };
        const { data: existingMsg } = await supabase.from('messages').select('id, status').eq('whatsapp_message_id', msgId).maybeSingle();
        if (existingMsg) {
          const currentPriority = statusPriority[existingMsg.status] || 0;
          const newPriority = statusPriority[mappedStatus] || 0;
          if (newPriority > currentPriority) {
            await supabase.from('messages').update({ status: mappedStatus }).eq('id', existingMsg.id);
          }
        }
      }
      return new Response('ok', { headers: corsHeaders });
    }

    if (event === 'messages.upsert' || event === 'message.upsert') {
      const data = body.data;
      const key = data?.key;
      const jid = key?.remoteJid;

      if (!key?.id || !jid || !isValidJid(jid)) return new Response('ignored', { headers: corsHeaders });

      const fromMe = key.fromMe === true;
      const msg = data.message;
      const initialStatus = data.status ? (mapStatus(data.status) || (fromMe ? 'sent' : 'delivered')) : (fromMe ? 'sent' : 'delivered');

      const media = detectMedia(msg);
      const { text: textContent, shouldIgnore } = extractContentSmart(msg);

      if (shouldIgnore) return new Response('ignored_protocol', { headers: corsHeaders });

      let content = textContent || media.caption;
      if (!content) {
        if (media.type === 'image') content = '[Midia]';
        else if (media.type === 'video') content = '[Video]';
        else if (media.type === 'audio') content = '[Audio]';
        else if (media.type === 'sticker') content = '[sticker]';
        else if (media.type === 'document') content = '[Documento]';
        else { content = '[Mensagem nao suportada]'; }
      }

      let { data: existing } = await supabase
        .from('conversations').select('id, customer_name, status, ai_enabled, group_candidate_status, profile_pic_url')
        .eq('whatsapp_jid', jid).eq('instance_id', instanceId).maybeSingle();

      const apiUrl = Deno.env.get('EVOLUTION_API_URL');
      const apiKey = Deno.env.get('EVOLUTION_API_KEY');

      let conversationId: string;
      if (existing) {
        conversationId = existing.id;
        const convUpdates: any = {};
        
        if (!fromMe && data.pushName && (existing.customer_name.startsWith('+') || existing.customer_name === 'Ronan Dias' || existing.customer_name === 'ronan dias')) {
           convUpdates.customer_name = data.pushName;
        }

        // Auto-fetch avatar if missing
        if (!fromMe && !existing.profile_pic_url && apiUrl && apiKey) {
          try {
            const avatarRes = await fetch(`${apiUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(evolutionInstanceName)}`, {
              method: 'POST',
              headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({ number: jid })
            }).then(r => r.json()).catch(() => null);
            if (avatarRes?.profilePictureUrl) convUpdates.profile_pic_url = avatarRes.profilePictureUrl;
          } catch (e) { console.error('[webhook] avatar fetch failed:', e); }
        }

        if (Object.keys(convUpdates).length > 0) {
          await supabase.from('conversations').update(convUpdates).eq('id', conversationId);
        }
      } else {
        const nameToUse = fromMe ? extractPhone(jid) : (data.pushName || extractPhone(jid));
        let profilePicUrl = null;
        
        if (!fromMe && apiUrl && apiKey) {
          try {
            const avatarRes = await fetch(`${apiUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(evolutionInstanceName)}`, {
              method: 'POST',
              headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({ number: jid })
            }).then(r => r.json()).catch(() => null);
            profilePicUrl = avatarRes?.profilePictureUrl || null;
          } catch {}
        }

        const { data: inserted } = await supabase.from('conversations').insert({
          customer_name: nameToUse,
          customer_phone: extractPhone(jid),
          whatsapp_jid: jid,
          instance_id: instanceId,
          status: 'aguardando_humano',
          profile_pic_url: profilePicUrl
        }).select('id').single();
        conversationId = inserted!.id;
      }

      let base64Data = media.base64;
      if (media.type && !base64Data) base64Data = await fetchBase64OnDemand(evolutionInstanceName, key, msg);
      let mediaUrl: string | null = null;
      if (media.type && base64Data) mediaUrl = await uploadMedia(conversationId, key.id, base64Data, media.mime || 'application/octet-stream', media.ext || 'bin');

      const { data: insertedMsg } = await supabase.from('messages').upsert({
        conversation_id: conversationId,
        author: fromMe ? 'humano' : 'cliente',
        content: content,
        media_type: media.type,
        media_url: mediaUrl,
        whatsapp_message_id: key.id,
        created_at: new Date().toISOString(),
        status: initialStatus
      }, { onConflict: 'whatsapp_message_id' }).select('id').single();

      const convUpdates: any = { last_message_at: new Date().toISOString() };

      if (!fromMe) {
        await supabase.rpc('increment_unread', { conv_id: conversationId });
        await supabase.rpc('increment_msgs_since_analysis', { conv_id: conversationId });

        if (existing?.status === 'encerrada' || existing?.status === 'silenciada') {
          convUpdates.status = 'aguardando_humano';
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const isGroupConv = typeof jid === 'string' && jid.endsWith('@g.us');

        // v39: SE é áudio/imagem/pdf COM media_url válido, dispara media-analysis SÍNCRONO (espera transcrição)
        // pra que o ai-reply consiga usar a transcrição no contexto.
        const shouldAnalyzeMedia = mediaUrl && media.type && ['audio','image','document'].includes(media.type) && insertedMsg?.id;
        if (shouldAnalyzeMedia) {
          try {
            // Síncrono pra áudios (cliente precisa da transcrição antes da IA)
            // Para imagens/pdf, também síncrono mas com timeout curto via AbortController se demorar muito
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 25000); // 25s max
            await fetch(`${supabaseUrl}/functions/v1/evolution-media-analysis`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ messageId: insertedMsg.id }),
              signal: controller.signal,
            }).catch((e) => console.error('[webhook v39] media-analysis failed:', e));
            clearTimeout(timeout);
          } catch (e) { console.error('[webhook v39] media-analysis exception:', e); }
        }

        fetch(`${supabaseUrl}/functions/v1/evolution-client-analysis`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, forceRefresh: true })
        }).catch(() => {});

        if (!isGroupConv) {
          await schedulePendingReply(conversationId, instanceId, key.id);
        } else if (existing?.ai_enabled || !existing) {
          fetch(`${supabaseUrl}/functions/v1/evolution-ai-reply`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId, mode: 'suggestions' })
          }).catch(() => {});
        }

      } else {
        convUpdates.unread_count = 0;
      }

      await supabase.from('conversations').update(convUpdates).eq('id', conversationId);

      if (media.type && !mediaUrl) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        fetch(`${supabaseUrl}/functions/v1/evolution-media-download`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ instanceName: evolutionInstanceName })
        }).catch(() => {});
      }
    }

    return new Response('ok', { headers: corsHeaders });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(String(err), { status: 500, headers: corsHeaders });
  }
});
