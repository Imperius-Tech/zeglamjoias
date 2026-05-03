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
    const bodyJson = await req.json()
    const { action, salesId, openAmount, totalPay, percentualEntrada, salesIds, notifyCustomer } = bodyJson as {
      action?: string
      salesId?: string
      openAmount?: string | number
      totalPay?: string | number
      percentualEntrada?: string | number
      salesIds?: string[]
      /** Quando `false`, tenta enviar ao Zeglam os parâmetros que desativam aviso ao cliente (env / HTML do form-payment). Default: true. */
      notifyCustomer?: boolean
    }
    
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

    const viewHeaders = () => ({
      'User-Agent': UA,
      'Accept': 'text/plain, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${BASE}/`,
      'Origin': 'https://zeglam.semijoias.net',
      'Cookie': cookieHeader(jar),
    })

    // Helper to fetch views (JWT source inferred from path, except form-payment)
    const fetchView = async (path: string, params: Record<string, string> = {}) => {
      const jwtSource = path.includes('form-payment') ? 'virtualcatalog/form-payment' : path;
      const jwt = await getJwt(jwtSource)
      const res = await fetch(`${BASE}/services/view`, {
        method: 'POST',
        headers: viewHeaders(),
        body: new URLSearchParams({ JWT: jwt, Path: path, ...params }).toString(),
      })
      const text = await res.text()
      Object.assign(jar, parseCookies(res.headers))
      return text
    }

    /** Tenta extrair do HTML do form-payment o campo (checkbox/hidden) ligado a notificar cliente, para POST sem aviso. */
    const scrapeClientNotifySuppressionExtras = (
      formHtml: string,
    ): { extras: Record<string, string>; source: 'scraped' | 'none' } => {
      const keyword = /whatsapp|notif|notifica|enviar|mensagem|avisar|comunica/i
      for (const m of formHtml.matchAll(/<input\b([^>]*)\/?>/gi)) {
        const attrs = m[1]
        const type = (/type=["']([^"']*)["']/i.exec(attrs)?.[1] || '').toLowerCase()
        if (type !== 'checkbox') continue
        const name = /name=["']([^"']+)["']/i.exec(attrs)?.[1]
        if (!name) continue
        const id = /id=["']([^"']+)["']/i.exec(attrs)?.[1]
        let snippet = attrs + '>'
        if (id) {
          const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const lab = formHtml.match(new RegExp(`<label\\b[^>]*for=["']${esc}["'][^>]*>([\\s\\S]{0,220})`, 'i'))
          if (lab) snippet += lab[1]
        }
        if (!keyword.test(name) && !keyword.test(snippet)) continue
        return { extras: { [name]: '0' }, source: 'scraped' }
      }
      for (const m of formHtml.matchAll(/<input\b([^>]*)\/?>/gi)) {
        const attrs = m[1]
        const type = (/type=["']([^"']*)["']/i.exec(attrs)?.[1] || '').toLowerCase()
        if (type !== 'hidden') continue
        const name = /name=["']([^"']+)["']/i.exec(attrs)?.[1]
        if (!name || !keyword.test(name)) continue
        return { extras: { [name]: '0' }, source: 'scraped' }
      }
      return { extras: {}, source: 'none' }
    }

    /** Marcar como pago: o admin usa `POST .../services/virtualcatalog` (não `services/view`). */
    const postVirtualCatalogSetAsPaid = async (
      saleId: string,
      openAmt: string,
      totalAmt: string,
      pct: string,
      notifyExtras: Record<string, string> = {},
    ) => {
      const jwt = await getJwt('setAsPaid')
      const params = new URLSearchParams({
        VirtualCatalogSaleID: saleId,
        OpenAmount: openAmt,
        PercentualEntrada: pct,
        TotalPay: totalAmt,
        JWT: jwt,
        Path: 'setAsPaid',
      })
      for (const [k, v] of Object.entries(notifyExtras)) {
        if (k && v !== undefined && v !== null) params.set(k, String(v))
      }
      const res = await fetch(`${BASE}/services/virtualcatalog`, {
        method: 'POST',
        headers: viewHeaders(),
        body: params.toString(),
      })
      const text = await res.text()
      Object.assign(jar, parseCookies(res.headers))
      return { ok: res.ok, status: res.status, text }
    }

    const looksLikeViewError = (html: string) => {
      const slice = html.slice(0, 6000).toLowerCase()
      return (
        slice.includes('alert-danger') ||
        /ocorreu um erro|erro ao processar|acesso negado|não autorizado|faça o login|faça login/.test(slice)
      )
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

    /** Converte texto tipo "R$ 1.234,56" ou "82,81" para número com ponto decimal (formato enviado ao Zeglam). */
    const parseMoneyToApiNumber = (raw: string | undefined | null): string | null => {
      if (raw == null) return null
      const t = String(raw).replace(/\s/g, '').replace(/R\$/gi, '').trim()
      if (!t) return null
      let s = t
      if (s.includes(',') && /\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) {
        s = s.replace(/\./g, '').replace(',', '.')
      } else if (s.includes(',')) {
        s = s.replace(',', '.')
      }
      const n = parseFloat(s)
      if (!Number.isFinite(n)) return null
      return String(n)
    }

    const amountFromClientOrDetails = (
      v: string | number | undefined,
      fallbackRaw: string | undefined,
    ): string | null => {
      if (typeof v === 'number' && Number.isFinite(v)) return String(v)
      if (typeof v === 'string' && v.trim()) {
        const p = parseMoneyToApiNumber(v)
        if (p) return p
      }
      return parseMoneyToApiNumber(fallbackRaw)
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

    /** Telefone/nome do cadastro Zeglam por VirtualCatalogSaleID (form-payment). Usado no painel para cruzar comprovante ↔ pendência. */
    if (action === 'enrich_phones') {
      const ids = Array.isArray(salesIds) ? salesIds.map((s) => String(s)).filter(Boolean) : []
      const out: Record<string, { phone_digits: string | null; customer_name: string | null }> = {}
      for (const sid of ids) {
        try {
          const formHtml = await fetchView('virtualcatalog/form-payment', { VirtualCatalogSalesID: sid })
          const details = scrapPaymentDetails(formHtml)
          const rawPhone = details['Cliente/Telefone'] || details['Telefone'] || details['Cliente'] || ''
          const digits = rawPhone.replace(/\D/g, '')
          const customer_name =
            (details['Cliente'] && details['Cliente'].trim()) ||
            (details['Nome'] && details['Nome'].trim()) ||
            null
          out[sid] = { phone_digits: digits.length >= 8 ? digits : null, customer_name }
        } catch {
          out[sid] = { phone_digits: null, customer_name: null }
        }
      }
      return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'confirm_payment') {
      if (!salesId) throw new Error('salesId is required')
      const sid = String(salesId)
      const formHtml = await fetchView('virtualcatalog/form-payment', { VirtualCatalogSalesID: sid })
      const details = scrapPaymentDetails(formHtml)
      const saldoRaw = details['Saldo Pendente']
      const pctStr = String(percentualEntrada ?? '100')
      const openStr = amountFromClientOrDetails(openAmount, saldoRaw)
      const totalStr = amountFromClientOrDetails(totalPay, saldoRaw) ?? openStr
      if (!openStr || !totalStr) {
        throw new Error(
          'Valores em aberto não encontrados. Abra o modal com detalhes ou envie openAmount/totalPay (número ou texto BRL).',
        )
      }

      const wantNotify = notifyCustomer !== false
      let notifyExtras: Record<string, string> = {}
      let notifySource: 'env' | 'scraped' | 'none' = 'none'
      const envParam = Deno.env.get('ZEGLAM_NOTIFY_CLIENT_PARAM')?.trim()
      if (envParam) {
        const onVal = Deno.env.get('ZEGLAM_NOTIFY_CLIENT_ON') ?? '1'
        const offVal = Deno.env.get('ZEGLAM_NOTIFY_CLIENT_OFF') ?? '0'
        notifyExtras = { [envParam]: wantNotify ? onVal : offVal }
        notifySource = 'env'
      } else if (!wantNotify) {
        const built = scrapeClientNotifySuppressionExtras(formHtml)
        notifyExtras = built.extras
        notifySource = built.source
      }

      const isStillPending = async (): Promise<boolean> => {
        const pendingHtml = await fetchView('virtualcatalog/all-pending-customers')
        const rows = scrapPending(pendingHtml)
        return rows.some((r) => String(r.salesId) === sid)
      }

      const r = await postVirtualCatalogSetAsPaid(sid, openStr, totalStr, pctStr, notifyExtras)
      const attemptLog = [
        {
          path: 'services/virtualcatalog',
          jwtSource: 'setAsPaid',
          variant: 'setAsPaid+VirtualCatalogSaleID',
          status: r.status,
          ok: r.ok,
          notifyCustomer: wantNotify,
          notifySource,
          notifyExtraKeys: Object.keys(notifyExtras),
        },
      ]
      const last = { ok: r.ok, status: r.status, text: r.text, path: 'virtualcatalog→setAsPaid' }

      let stillPending: boolean | undefined
      let success = false
      if (r.ok && !looksLikeViewError(r.text)) {
        try {
          stillPending = await isStillPending()
          success = !stillPending
        } catch {
          stillPending = true
        }
      }
      attemptLog[0] = { ...attemptLog[0], ...(stillPending !== undefined ? { stillPending } : {}) }

      const stillInPendingList = r.ok && !looksLikeViewError(r.text) && stillPending === true

      const clientNotifySuppressionUnconfigured = !wantNotify && notifySource === 'none'

      return new Response(
        JSON.stringify({
          success,
          status: last.status,
          pathUsed: last.path,
          preview: (last.text ?? '').slice(0, 800),
          attemptLog,
          notifyCustomer: wantNotify,
          clientNotifyConfigured: notifySource !== 'none' || wantNotify,
          ...(clientNotifySuppressionUnconfigured ? { clientNotifySuppressionUnconfigured: true } : {}),
          ...(stillInPendingList ? { stillInPendingList: true } : {}),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
