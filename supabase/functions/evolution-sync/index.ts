import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BATCH_SIZE = 15;
/** Evolution findMessages: `offset` NÃO deve pular mensagens recentes — usamos página + offset 0 e deduplicação. */
const MAX_FIND_MESSAGES_PAGES = 12;

async function resolveInstance(
  instanceName: string | null | undefined,
): Promise<{ evolutionInstanceId: string; evolutionInstanceName: string } | null> {
  if (instanceName) {
    const { data } = await supabase.from("instances").select("evolution_instance_id, evolution_instance_name").eq(
      "evolution_instance_name",
      instanceName,
    ).maybeSingle();
    if (data) return { evolutionInstanceId: data.evolution_instance_id, evolutionInstanceName: data.evolution_instance_name };
  }
  const { data: cfg } = await supabase.from("evolution_config").select("active_instance_id, instance_name").limit(1).maybeSingle();
  if (cfg?.active_instance_id) {
    const { data: inst } = await supabase.from("instances").select("evolution_instance_id, evolution_instance_name").eq(
      "evolution_instance_id",
      cfg.active_instance_id,
    ).maybeSingle();
    if (inst) return { evolutionInstanceId: inst.evolution_instance_id, evolutionInstanceName: inst.evolution_instance_name };
  }
  return null;
}

async function evoFetch(path: string, method = "GET", body?: unknown) {
  const apiUrl = Deno.env.get("EVOLUTION_API_URL")!;
  const apiKey = Deno.env.get("EVOLUTION_API_KEY")!;
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text), text: null };
  } catch {
    return { status: res.status, json: null, text };
  }
}

function extractPhone(jid: string): string {
  const num = jid.split("@")[0];
  if (num.length >= 12) return `+${num.slice(0, 2)} (${num.slice(2, 4)}) ${num.slice(4, 9)}-${num.slice(9)}`;
  return num;
}

function chatTimestamp(chat: Record<string, unknown>): number {
  const candidates = [chat.conversationTimestamp, chat.updatedAt, chat.lastMessageTimestamp, chat.t, chat.messageTimestamp];
  for (const v of candidates) {
    if (v == null) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
    if (typeof v === "string") {
      const ms = Date.parse(v);
      if (Number.isFinite(ms)) return ms;
    }
  }
  return 0;
}

function unwrapMessage(msg: Record<string, unknown> | null | undefined): Record<string, unknown> | null | undefined {
  if (!msg) return msg;
  const u = msg as Record<string, { message?: Record<string, unknown> }>;
  if (u.viewOnceMessage?.message) return unwrapMessage(u.viewOnceMessage.message);
  if (u.viewOnceMessageV2?.message) return unwrapMessage(u.viewOnceMessageV2.message);
  if (u.ephemeralMessage?.message) return unwrapMessage(u.ephemeralMessage.message);
  if (u.documentWithCaptionMessage?.message) return unwrapMessage(u.documentWithCaptionMessage.message);
  if (u.editMessage?.message) return unwrapMessage(u.editMessage.message);
  return msg;
}

function detectMedia(rawMsg: Record<string, unknown> | undefined): { type: string | null; caption: string | null } {
  const msg = unwrapMessage(rawMsg);
  if (!msg) return { type: null, caption: null };
  if (msg.imageMessage) return { type: "image", caption: (msg.imageMessage as { caption?: string }).caption || null };
  if (msg.videoMessage) return { type: "video", caption: (msg.videoMessage as { caption?: string }).caption || null };
  if (msg.audioMessage) return { type: "audio", caption: null };
  if (msg.stickerMessage) return { type: "sticker", caption: null };
  if (msg.documentMessage) {
    return { type: "document", caption: (msg.documentMessage as { fileName?: string }).fileName || null };
  }
  return { type: null, caption: null };
}

function extractText(rawMsg: Record<string, unknown> | undefined): string | null {
  const msg = unwrapMessage(rawMsg);
  if (!msg) return null;
  const conv = msg.conversation;
  const ext = msg.extendedTextMessage as { text?: string } | undefined;
  return (typeof conv === "string" ? conv : null) || ext?.text || null;
}

function extractSpecialContent(rawMsg: Record<string, unknown> | undefined): string | null {
  const msg = unwrapMessage(rawMsg);
  if (!msg) return null;
  const react = msg.reactionMessage as { text?: string } | undefined;
  if (react) {
    const emoji = react.text || "";
    return emoji ? `reagiu com ${emoji}` : "removeu a reação";
  }
  if (msg.pollCreationMessage || msg.pollCreationMessageV3) {
    const poll = (msg.pollCreationMessage || msg.pollCreationMessageV3) as { name?: string };
    return `📊 Enquete: ${poll.name || "nova enquete"}`;
  }
  if (msg.pollUpdateMessage) return "📊 Votou em enquete";
  if (msg.locationMessage) return "📍 Localização compartilhada";
  if (msg.liveLocationMessage) return "📍 Localização ao vivo";
  if (msg.contactMessage) return `👤 Contato: ${(msg.contactMessage as { displayName?: string }).displayName || "contato"}`;
  if (msg.contactsArrayMessage) return "👤 Contatos compartilhados";
  if (msg.protocolMessage) return null;
  return null;
}

function buildContent(rawMsg: Record<string, unknown> | undefined): {
  content: string | null;
  mediaType: string | null;
  skip: boolean;
} {
  const { type, caption } = detectMedia(rawMsg);
  const text = extractText(rawMsg);
  const special = extractSpecialContent(rawMsg);
  const unwrapped = unwrapMessage(rawMsg);
  if ((unwrapped as { protocolMessage?: unknown })?.protocolMessage) return { content: null, mediaType: null, skip: true };
  let content = text || caption || special;
  if (!content) {
    if (type === "image") content = "[Mídia]";
    else if (type === "video") content = "[Vídeo]";
    else if (type === "audio") content = "[Áudio]";
    else if (type === "sticker") content = "[sticker]";
    else if (type === "document") content = "[Documento]";
    else return { content: null, mediaType: null, skip: true };
  }
  return { content, mediaType: type, skip: false };
}

function parseMessageRecords(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  const msgWrap = obj.messages;
  const nested =
    msgWrap && typeof msgWrap === "object" && Array.isArray((msgWrap as { records?: unknown }).records)
      ? (msgWrap as { records: unknown[] }).records
      : null;
  const top = Array.isArray(obj.records) ? obj.records : null;
  return nested ?? top ?? [];
}

async function fetchChatMessageRecords(instanceEnc: string, remoteJid: string): Promise<Record<string, unknown>[]> {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (let page = 1; page <= MAX_FIND_MESSAGES_PAGES; page++) {
    const res = await evoFetch(`/chat/findMessages/${instanceEnc}`, "POST", {
      where: { key: { remoteJid } },
      page,
      offset: 0,
    });
    if (res.status && res.status >= 400) {
      console.error(`[sync v38] findMessages HTTP ${res.status} jid=${remoteJid} page=${page}`, res.text?.slice?.(0, 200));
    }
    const records = parseMessageRecords(res.json);
    if (!records.length) break;
    let newly = 0;
    for (const row of records) {
      const r = row as { key?: { id?: string } };
      const id = r.key?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(r as Record<string, unknown>);
      newly++;
    }
    if (newly === 0) break;
  }
  return out;
}

function msgRecordCreatedAt(m: Record<string, unknown>): string {
  const candidates = [m.messageTimestamp, m.timestamp];
  for (const c of candidates) {
    if (c == null) continue;
    const n = Number(c);
    if (!Number.isFinite(n)) continue;
    const ms = n < 1e12 ? n * 1000 : n;
    return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

async function runBatch(
  jobId: string,
  batchOffset: number,
  maxChats: number,
  targetInstanceId: string,
  targetInstanceName: string,
) {
  const instance = encodeURIComponent(targetInstanceName);
  console.log(`[sync] runBatch jobId=${jobId} offset=${batchOffset} maxChats=${maxChats}`);

  try {
    const chatsRes = await evoFetch(`/chat/findChats/${instance}`, "POST", {});
    const chatsRaw = chatsRes.json;
    const chats = Array.isArray(chatsRaw)
      ? chatsRaw
      : ((chatsRaw as { chats?: unknown[] })?.chats ?? (chatsRaw as { data?: unknown[] })?.data ?? []);

    const allEntries = (chats as Record<string, unknown>[]).filter((c) => {
      const jid = (c.remoteJid || c.id) as string;
      if (!jid?.includes("@")) return false;
      return chatTimestamp(c) > 0;
    });
    allEntries.sort((a, b) => chatTimestamp(b) - chatTimestamp(a));

    const effectiveTotal = Math.min(allEntries.length, maxChats);

    console.log(`[sync] chats=${chats.length} filtered=${allEntries.length} effectiveTotal=${effectiveTotal}`);

    if (batchOffset === 0) {
      await supabase.from("sync_jobs").update({
        total_chats: effectiveTotal,
        started_at: new Date().toISOString(),
        current_step: "syncing_messages",
        synced_chats: 0,
        total_messages: 0,
        total_media: 0,
      }).eq("id", jobId);
    }

    if (batchOffset >= effectiveTotal) {
      await supabase.from("sync_jobs").update({
        status: "done",
        batch_offset: effectiveTotal,
        finished_at: new Date().toISOString(),
        current_step: "done",
      }).eq("id", jobId);
      return;
    }

    const batchEnd = Math.min(batchOffset + BATCH_SIZE, effectiveTotal);
    const batchChats = allEntries.slice(batchOffset, batchEnd);
    if (batchChats.length === 0) {
      await supabase.from("sync_jobs").update({
        status: "done",
        batch_offset: effectiveTotal,
        finished_at: new Date().toISOString(),
        current_step: "done",
      }).eq("id", jobId);
      return;
    }

    let syncedInBatch = 0;
    let msgsInBatch = 0;
    let mediaInBatch = 0;
    let lastChatName: string | null = null;

    for (const chat of batchChats) {
      const jid = (chat.remoteJid || chat.id) as string;
      const name = (chat.pushName || chat.name || extractPhone(jid)) as string;
      lastChatName = name;
      const chatTsMs = chatTimestamp(chat);
      const lastMsgAtISO = chatTsMs > 0 ? new Date(chatTsMs).toISOString() : new Date().toISOString();

      const recordsRaw = await fetchChatMessageRecords(instance, jid);
      const records = recordsRaw as Record<string, unknown>[];
      if (!records.length) continue;

      const { data: conv, error: convErr } = await supabase.from("conversations").upsert({
        whatsapp_jid: jid,
        instance_id: targetInstanceId,
        customer_name: name,
        customer_phone: extractPhone(jid),
        profile_pic_url: chat.profilePicUrl as string | null | undefined,
        status: "ia_respondendo",
        last_message_at: lastMsgAtISO,
      }, { onConflict: "whatsapp_jid,instance_id" }).select("id").single();
      if (convErr || !conv) {
        console.error(`[sync] upsert err jid=${jid}:`, convErr?.message);
        continue;
      }

      syncedInBatch++;

      const batch = records.map((m) => {
        const key = m.key as { id?: string; fromMe?: boolean } | undefined;
        const inner = (m.message || m) as Record<string, unknown> | undefined;
        const { content, mediaType, skip } = buildContent(inner);
        if (skip || !content || !key?.id) return null;
        return {
          conversation_id: conv.id,
          author: key.fromMe ? "humano" : "cliente",
          content,
          media_type: mediaType,
          whatsapp_message_id: key.id,
          created_at: msgRecordCreatedAt(m),
          status: key.fromMe ? "sent" : "delivered",
        };
      }).filter((x): x is NonNullable<typeof x> => x != null && Boolean(x.whatsapp_message_id));

      if (batch.length > 0) {
        const { error: msgErr } = await supabase.from("messages").upsert(batch, {
          onConflict: "whatsapp_message_id",
        });
        if (!msgErr) {
          msgsInBatch += batch.length;
          mediaInBatch += batch.filter((m) => m.media_type).length;
        }
        const last = batch.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];
        await supabase.from("conversations").update({ last_message_at: last.created_at }).eq("id", conv.id);
      }
    }

    const newOffset = batchEnd;
    const { data: jobNow } = await supabase.from("sync_jobs").select("synced_chats, total_messages, total_media").eq("id", jobId)
      .single();
    const newSynced = (jobNow?.synced_chats ?? 0) + syncedInBatch;
    const newMsgs = (jobNow?.total_messages ?? 0) + msgsInBatch;
    const newMedia = (jobNow?.total_media ?? 0) + mediaInBatch;

    console.log(`[sync] batch done offset=${newOffset}/${effectiveTotal} synced+=${syncedInBatch}`);

    if (newOffset >= effectiveTotal) {
      await supabase.from("sync_jobs").update({
        status: "done",
        batch_offset: newOffset,
        synced_chats: newSynced,
        total_messages: newMsgs,
        total_media: newMedia,
        finished_at: new Date().toISOString(),
        current_step: "done",
      }).eq("id", jobId);
    } else {
      await supabase.from("sync_jobs").update({
        status: "partial",
        batch_offset: newOffset,
        synced_chats: newSynced,
        total_messages: newMsgs,
        total_media: newMedia,
        current_chat_name: lastChatName,
      }).eq("id", jobId);
    }
  } catch (err) {
    console.error(`[sync] fatal:`, err);
    await supabase.from("sync_jobs").update({ status: "error", error: String(err) }).eq("id", jobId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let body: { action?: string; maxChats?: number; instanceName?: string; jobId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON invalido no corpo" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { action, maxChats, instanceName, jobId } = body;

  if (action === "start") {
    const resolved = await resolveInstance(instanceName);
    if (!resolved) {
      return new Response(JSON.stringify({ error: "Instância não encontrada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: job, error: insErr } = await supabase.from("sync_jobs").insert({
      status: "running",
      batch_offset: 0,
      instance_id: resolved.evolutionInstanceId,
      max_chats: maxChats || 200,
      current_step: "fetching_chats",
      synced_chats: 0,
      total_messages: 0,
      total_media: 0,
    }).select("id").single();
    if (insErr || !job) {
      return new Response(JSON.stringify({ error: insErr?.message || "Erro ao criar job de sync" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    EdgeRuntime.waitUntil(runBatch(job.id, 0, maxChats || 200, resolved.evolutionInstanceId, resolved.evolutionInstanceName));
    return new Response(JSON.stringify({
      success: true,
      jobId: job.id,
      instance: resolved.evolutionInstanceName,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (action === "status") {
    if (jobId) {
      const { data } = await supabase.from("sync_jobs").select("*").eq("id", jobId).maybeSingle();
      return new Response(JSON.stringify(data || { status: "none" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let q = supabase.from("sync_jobs").select("*");
    if (instanceName) {
      const resolved = await resolveInstance(instanceName);
      if (resolved) q = q.eq("instance_id", resolved.evolutionInstanceId);
    }
    const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    return new Response(JSON.stringify(data || { status: "none" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (action === "continue") {
    if (!jobId) {
      return new Response(JSON.stringify({ error: "jobId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: job } = await supabase.from("sync_jobs").select("*").eq("id", jobId).maybeSingle();
    if (!job) {
      return new Response(JSON.stringify({ error: "job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const resolved = await resolveInstance(instanceName);
    if (!resolved) {
      return new Response(JSON.stringify({ error: "Instância não encontrada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await supabase.from("sync_jobs").update({ status: "running" }).eq("id", jobId);
    EdgeRuntime.waitUntil(
      runBatch(jobId, job.batch_offset ?? 0, job.max_chats ?? 200, resolved.evolutionInstanceId, resolved.evolutionInstanceName),
    );
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (action === "cancel") {
    if (!jobId) {
      return new Response(JSON.stringify({ error: "jobId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await supabase.from("sync_jobs").update({
      status: "error",
      error: "cancelled by user",
      finished_at: new Date().toISOString(),
    }).eq("id", jobId);
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response("ok", { headers: corsHeaders });
});
