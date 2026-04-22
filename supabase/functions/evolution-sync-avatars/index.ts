import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const apiUrl = Deno.env.get('EVOLUTION_API_URL')!;
  const apiKey = Deno.env.get('EVOLUTION_API_KEY')!;

  try {
    const { action, limit = 50 } = await req.json().catch(() => ({ action: 'sync', limit: 50 }));

    if (action === 'sync') {
      // Get conversations without avatars or with null avatars
      const { data: convs } = await supabase
        .from('conversations')
        .select('id, whatsapp_jid, instance_id')
        .is('profile_pic_url', null)
        .limit(limit);

      if (!convs || convs.length === 0) {
        return new Response(JSON.stringify({ success: true, updated: 0, message: "No conversations without avatars" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get instance names
      const { data: instances } = await supabase.from('instances').select('evolution_instance_id, evolution_instance_name');
      const instanceMap = Object.fromEntries(instances?.map(i => [i.evolution_instance_id, i.evolution_instance_name]) || []);

      let updatedCount = 0;
      let failedCount = 0;

      for (const conv of convs) {
        const instanceName = instanceMap[conv.instance_id];
        if (!instanceName) continue;

        try {
          const res = await fetch(`${apiUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`, {
            method: 'POST',
            headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: conv.whatsapp_jid })
          });
          const data = await res.json();
          
          if (data.profilePictureUrl) {
            await supabase.from('conversations').update({ profile_pic_url: data.profilePictureUrl }).eq('id', conv.id);
            updatedCount++;
          } else {
            // Even if not found, we mark it so we don't try again immediately? 
            // Or just leave as null. For now, leave as null.
            failedCount++;
          }
        } catch (e) {
          console.error(`Error fetching avatar for ${conv.whatsapp_jid}:`, e);
          failedCount++;
        }
      }

      return new Response(JSON.stringify({ success: true, updated: updatedCount, failed: failedCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
