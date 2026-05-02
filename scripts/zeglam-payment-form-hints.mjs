#!/usr/bin/env node
/**
 * Ajuda a descobrir nomes de campos / onclick do formulário de pagamento no admin Zeglam.
 * Uso: EMAIL=... PASSWORD=... node scripts/zeglam-payment-form-hints.mjs <VirtualCatalogSalesID>
 */
const BASE = 'https://zeglam.semijoias.net/admin';
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const salesId = process.argv[2];

if (!EMAIL || !PASSWORD || !salesId) {
  console.error('Uso: EMAIL=... PASSWORD=... node scripts/zeglam-payment-form-hints.mjs <salesId>');
  process.exit(1);
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

function parseCookies(headers) {
  const out = {};
  const setCookies = headers.getSetCookie?.() || [];
  for (const c of setCookies) {
    const [kv] = c.split(';');
    const [k, v] = kv.split('=');
    if (k && v) out[k.trim()] = v;
  }
  return out;
}
function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function getJwt(jar, source) {
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
  });
  const token = (await res.text()).trim();
  Object.assign(jar, parseCookies(res.headers));
  return token;
}

async function login(jar) {
  const loginJwt = await getJwt(jar, 'login');
  const body = new URLSearchParams({
    email: EMAIL,
    password: PASSWORD,
    JWT: loginJwt,
    Path: 'login',
  });
  const res = await fetch(`${BASE}/services/login`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${BASE}/`,
      'Origin': 'https://zeglam.semijoias.net',
      'Cookie': cookieHeader(jar),
    },
    body: body.toString(),
  });
  Object.assign(jar, parseCookies(res.headers));
  if (!jar['cookies-ctl']) {
    console.error('Login falhou (sem cookies-ctl).');
    process.exit(1);
  }
}

async function fetchFormPaymentHtml(jar) {
  const jwt = await getJwt(jar, 'virtualcatalog/form-payment');
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
    body: new URLSearchParams({
      JWT: jwt,
      Path: 'virtualcatalog/form-payment',
      VirtualCatalogSalesID: String(salesId),
    }).toString(),
  });
  return res.text();
}

const RE_HINT =
  /setas|paid|payment|confirm|registrar|marcar|pagar|liquid|romane|onclick|button|type="submit"|name="|VirtualCatalog/i;

(async () => {
  const jar = {};
  jar['ctl-sess-id'] = Math.random().toString(16).slice(2, 15);
  await login(jar);
  const html = await fetchFormPaymentHtml(jar);
  const lines = html.split(/[\n\r]+|<\/(div|tr|form|button|script)>/i);
  const hits = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.length < 8) continue;
    if (RE_HINT.test(t)) hits.push(t.slice(0, 400));
  }
  console.log(`--- ${hits.length} linhas com pistas (truncadas) ---\n`);
  for (const h of hits.slice(0, 120)) console.log(h + '\n---');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
