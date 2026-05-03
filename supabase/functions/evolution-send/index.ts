import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Dígitos do usuário no WhatsApp (Evolution sendText espera só números, sem @ suffix). */
function jidToEvoNumber(jid: string): string {
  const user = (jid || "").split("@")[0] || "";
  const digits = user.replace(/\D/g, "");
  return digits || user;
}

async function resolveInstanceName(
  conversationInstanceId: string | null | undefined,
  fallbackName?: string,
): Promise<string> {
  if (fallbackName) return fallbackName;
  if (!conversationInstanceId) return "Teste Zeglam";
  const { data } = await supabase
    .from("instances")
    .select("evolution_instance_name")
    .eq("evolution_instance_id", conversationInstanceId)
    .maybeSingle();
  return data?.evolution_instance_name || "Teste Zeglam";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiUrl = Deno.env.get("EVOLUTION_API_URL")!;
    const apiKey = Deno.env.get("EVOLUTION_API_KEY")!;

    const { conversationId, text, quotedMessageId, instanceName: bodyInstanceName } = await req.json();

    if (!conversationId || !text) {
      return new Response(
        JSON.stringify({ error: "conversationId and text required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: conv } = await supabase
      .from("conversations")
      .select("whatsapp_jid, instance_id")
      .eq("id", conversationId)
      .single();

    if (!conv?.whatsapp_jid) {
      return new Response(
        JSON.stringify({ error: "Conversa nao encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (conv.whatsapp_jid.endsWith("@g.us")) {
      return new Response(
        JSON.stringify({ error: "Conversa e grupo; use fluxo de grupo para enviar." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const instanceName = await resolveInstanceName(conv.instance_id, bodyInstanceName);
    const instance = encodeURIComponent(instanceName);

    const number = jidToEvoNumber(conv.whatsapp_jid);
    if (!number) {
      return new Response(
        JSON.stringify({ error: "JID invalido para envio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const evoBody: Record<string, unknown> = {
      number,
      text,
    };

    if (quotedMessageId) {
      const { data: quotedMsg } = await supabase
        .from("messages")
        .select("whatsapp_message_id")
        .eq("id", quotedMessageId)
        .single();

      if (quotedMsg?.whatsapp_message_id) {
        evoBody.quoted = {
          key: {
            remoteJid: conv.whatsapp_jid,
            id: quotedMsg.whatsapp_message_id,
          },
        };
      }
    }

    const evoRes = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(evoBody),
    });

    const evoData = await evoRes.json();

    if (!evoRes.ok) {
      return new Response(
        JSON.stringify({ error: "Falha ao enviar", details: evoData, instanceName }),
        { status: evoRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const waId = evoData?.key?.id || `sent-${Date.now()}`;

    await supabase.from("messages").upsert({
      conversation_id: conversationId,
      author: "humano",
      content: text,
      whatsapp_message_id: waId,
      quoted_message_id: quotedMessageId || null,
      created_at: new Date().toISOString(),
      status: "sent",
      sent_by: "panel",
    }, { onConflict: "whatsapp_message_id", ignoreDuplicates: true });

    await supabase.from("conversations").update({
      last_message_at: new Date().toISOString(),
    }).eq("id", conversationId);

    return new Response(
      JSON.stringify({ success: true, messageId: waId, instanceName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Send error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
