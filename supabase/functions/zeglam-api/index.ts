import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, salesId } = await req.json()
    
    let EMAIL = Deno.env.get('ZEGLAM_EMAIL')
    let PASSWORD = Deno.env.get('ZEGLAM_PASSWORD')

    if (!EMAIL || !PASSWORD) {
      const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
      const { data: configData } = await supabaseAdmin.from('zeglam_config').select('key, value')
      EMAIL = configData?.find(c => c.key === 'ZEGLAM_EMAIL')?.value
      PASSWORD = configData?.find(c => c.key === 'ZEGLAM_PASSWORD')?.value
    }

    if (!EMAIL || !PASSWORD) throw new Error('Credentials not found')

    const BASE = 'https://zeglam.semijoias.net/admin'
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

    const parseCookies = (headers: Headers) => {
      const out: Record<string, string> = {}
      const setCookies = headers.get('set-cookie')?.split(',') || []
      for (const c of setCookies) {
        const [kv] = c.split(';')
        const [k, v] = kv.split('=')
        if (k && v) out[k.trim()] = v.trim()
      }
      return out
    }
    const cookieHeader = (jar: Record<string, string>) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
    const jar: Record<string, string> = { 'ctl-sess-id': Math.random().toString(16).slice(2, 15) }

    const getJwt = async (source: string) => {
      const res = await fetch(`${BASE}/services/http-jwt`, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${BASE}/`,
          'Origin': 'https://zeglam.semijoias.net',
          'Cookie': cookieHeader(jar),
        },
        body: `Source=${encodeURIComponent(source)}`,
      })
      const token = (await res.text()).trim()
      Object.assign(jar, parseCookies(res.headers))
      return token
    }

    // Login
    const loginJwt = await getJwt('login')
    const loginRes = await fetch(`${BASE}/services/login`, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${BASE}/`,
        'Origin': 'https://zeglam.semijoias.net',
        'Cookie': cookieHeader(jar),
      },
      body: new URLSearchParams({ email: EMAIL, password: PASSWORD, JWT: loginJwt, Path: 'login' }).toString(),
    })
    Object.assign(jar, parseCookies(loginRes.headers))
    if (!jar['cookies-ctl']) throw new Error('Login failed')

    // Helper to fetch views
    const fetchView = async (path: string, params: Record<string, string> = {}) => {
      const jwtSource = path.includes('form-payment') ? 'virtualcatalog/form-payment' : path;
      const jwt = await getJwt(jwtSource)
      const res = await fetch(`${BASE}/services/view`, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${BASE}/`,
          'Origin': 'https://zeglam.semijoias.net',
          'Cookie': cookieHeader(jar),
        },
        body: new URLSearchParams({ JWT: jwt, Path: path, ...params }).toString(),
      })
      return await res.text()
    }

    const scrapPending = (html: string) => {
      const rows = []
      const tableContent = html.split('<tbody>')[1]?.split('</tbody>')[0] || ''
      const rowParts = tableContent.split('<tr>').filter(r => r.includes('</td>'))

      for (const row of rowParts) {
        const cols = row.split('</td>').map(c => c.replace('<td>', '').trim())
        if (cols.length < 4) continue

        const catalogo = cols[0].replace(/<[^>]*>/g, '').trim()
        const clienteRaw = cols[1]
        const atrasoRaw = cols[2]
        const valorRaw = cols[3]

        const salesIdMatch = valorRaw.match(/openFormPayment\((\d+)\)/)
        const salesId = salesIdMatch ? salesIdMatch[1] : null

        const cliente = clienteRaw.replace(/<[^>]*>/g, '').trim()
        
        let statusType = 'danger'
        if (atrasoRaw.includes('alert-warning')) statusType = 'warning'
        if (atrasoRaw.includes('alert-success')) statusType = 'success'

        const atraso = atrasoRaw.replace(/<[^>]*>/g, '').trim()
        const valor = valorRaw.split('<')[0].trim()

        rows.push({ catalogo, cliente, statusType, atraso, valor, salesId })
      }
      return rows
    }

    const scrapPaymentDetails = (html: string) => {
      const details: Record<string, string> = {}
      
      // 1. Processar <li> (Geralmente dados de endereço e composição)
      const liMatches = html.matchAll(/<li>([\s\S]*?)<\/li>/g)
      for (const m of liMatches) {
        const raw = m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
        
        if (raw.includes(':')) {
          const parts = raw.split(':')
          const key = parts[0].trim()
          const value = parts.slice(1).join(':').trim()
          if (key && value) details[key] = value
        } else if (raw.includes('(') && raw.includes(')')) {
          // Detectar provável nome/cidade
          details['Informação'] = raw
          if (raw.split(' ').length > 2 && !details['Cliente/Telefone']) {
            details['Cliente/Telefone'] = raw
          }
        } else if (raw.length > 2) {
          details[raw] = 'OK'
        }
      }

      // 2. Processar Labels e Inputs (Geralmente valores financeiros)
      const labelValueMatch = html.matchAll(/<label[^>]*>([\s\S]*?)<\/label>[\s\S]*?(?:<input[^>]*value="([^"]*)"|<textarea[^>]*>([\s\S]*?)<\/textarea>|<b>([\s\S]*?)<\/b>)/g)
      for (const m of labelValueMatch) {
        const key = m[1].replace(/<[^>]*>/g, '').replace(':', '').trim()
        const value = (m[2] || m[3] || m[4] || '').replace(/<[^>]*>/g, '').trim()
        if (key && value && !details[key]) details[key] = value
      }

      // 3. Fallback: procurar por textos em negrito que pareçam valores
      if (Object.keys(details).length < 3) {
        const bMatch = html.matchAll(/<b>([\s\S]*?)<\/b>[\s\S]*?<span>([\s\S]*?)<\/span>/g)
        for (const m of bMatch) {
           const key = m[1].replace(':', '').trim()
           const value = m[2].trim()
           if (key && value) details[key] = value
        }
      }

      return details
    }

    if (action === 'get_all') {
      const [pendingHtml] = await Promise.all([
        fetchView('virtualcatalog/all-pending-customers')
      ])

      return new Response(JSON.stringify({
        acertos: [], 
        payments: [], 
        pending: scrapPending(pendingHtml)
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'get_payment_details') {
      if (!salesId) throw new Error('salesId is required')
      const detailsHtml = await fetchView('virtualcatalog/form-payment', { VirtualCatalogSalesID: salesId })
      return new Response(JSON.stringify(scrapPaymentDetails(detailsHtml)), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
