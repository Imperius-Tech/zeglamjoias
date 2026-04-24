// debug v2: force sess-id cookie
const BASE = 'https://zeglam.semijoias.net/admin';
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

// generate random sess-id (13 hex chars like 69d2bbf2b628d)
function genSessId() {
  return Math.random().toString(16).slice(2, 15);
}

const jar = { 'ctl-sess-id': genSessId() };
console.log('initial jar:', jar);

// step 1: http-jwt
console.log('\n=== http-jwt login ===');
const r1 = await fetch(`${BASE}/services/http-jwt`, {
  method: 'POST',
  headers: {
    'User-Agent': UA,
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': `${BASE}/`,
    'Origin': 'https://zeglam.semijoias.net',
    'Cookie': cookieHeader(jar),
  },
  body: 'Source=login',
});
console.log('status:', r1.status);
console.log('set-cookie:', r1.headers.getSetCookie?.());
Object.assign(jar, parseCookies(r1.headers));
const jwt = (await r1.text()).trim();
console.log('jwt:', jwt.slice(0, 50) + '...');
console.log('jar:', jar);

if (r1.status !== 200 || jwt.length < 10) {
  console.error('jwt failed');
  process.exit(1);
}

// step 2: login
console.log('\n=== login ===');
const body = new URLSearchParams({
  email: 'gustavosantosbbs@gmail.com',
  password: 'Zeglam2023',
  JWT: jwt,
  Path: 'login',
});
const r2 = await fetch(`${BASE}/services/login`, {
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
console.log('status:', r2.status);
console.log('set-cookie:', r2.headers.getSetCookie?.());
Object.assign(jar, parseCookies(r2.headers));
console.log('body:', (await r2.text()).slice(0, 500));
console.log('final jar:', jar);
