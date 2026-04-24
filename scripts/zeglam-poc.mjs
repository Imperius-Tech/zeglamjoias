#!/usr/bin/env node
// POC: extrai "Próximos Acertos" do sistema Zeglam Semijoias
// Uso: EMAIL=x PASSWORD=y node scripts/zeglam-poc.mjs

const BASE = 'https://zeglam.semijoias.net/admin';
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('set EMAIL and PASSWORD env vars');
  process.exit(1);
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

function parseCookies(headers) {
  const out = {};
  const setCookies = headers.getSetCookie?.() || [];
  for (const c of setCookies) {
    const [kv] = c.split(';');
    const [k, v] = kv.split('=');
    out[k.trim()] = v;
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
  const newCookies = parseCookies(res.headers);
  Object.assign(jar, newCookies);
  return token;
}

function genSessId() {
  return Math.random().toString(16).slice(2, 15);
}

async function bootstrap(jar) {
  // ctl-sess-id is client-generated (any 13-hex string); server accepts it
  jar['ctl-sess-id'] = genSessId();
}

async function login(jar) {
  const jwt = await getJwt(jar, 'login');
  const body = new URLSearchParams({
    email: EMAIL,
    password: PASSWORD,
    JWT: jwt,
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
  const newCookies = parseCookies(res.headers);
  Object.assign(jar, newCookies);
  const text = await res.text();
  if (!jar['cookies-ctl']) {
    console.error('login failed. response:', text.slice(0, 500));
    process.exit(1);
  }
  return text;
}

async function view(jar, path) {
  const jwt = await getJwt(jar, path);
  const body = new URLSearchParams({ JWT: jwt, Path: path });
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
    body: body.toString(),
  });
  return res.text();
}

function extractProximosAcertos(html) {
  // find card block
  const idx = html.indexOf('Próximos Acertos');
  if (idx === -1) return [];
  // grab table slice from there
  const slice = html.slice(idx);
  const tableEnd = slice.indexOf('</table>');
  const tableHtml = slice.slice(0, tableEnd);

  const rows = [];
  const rowRe = /<tr>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td><a[^>]*onClick="Main\.getObj\('Maleta'\)\.openMaleta\((\d+),\s*(\d+)\);"[^>]*>(\d+)<\/a><\/td>\s*<\/tr>/g;
  let m;
  while ((m = rowRe.exec(tableHtml)) !== null) {
    rows.push({
      revendedora: m[1].trim(),
      data: m[2].trim(),
      maletaId: Number(m[3]),
      cicloId: Number(m[4]),
      ciclo: Number(m[5]),
    });
  }
  return rows;
}

(async () => {
  const jar = {};
  console.error('bootstrap...');
  await bootstrap(jar);
  console.error('login...');
  await login(jar);
  console.error('fetching dashboard...');
  const html = await view(jar, 'dashboard/index');
  const acertos = extractProximosAcertos(html);
  console.error(`extracted ${acertos.length} rows`);
  console.log(JSON.stringify(acertos, null, 2));
})().catch(e => {
  console.error('error:', e);
  process.exit(1);
});
