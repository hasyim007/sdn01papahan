// =========================================================================
// Auth server-side: hash password dengan PBKDF2 (Web Crypto, tersedia native
// di Workers, tanpa dependency tambahan), session token random disimpan di
// D1 + dikirim lewat cookie httpOnly.
// =========================================================================

const ITERATIONS = 100000;
const SESSION_COOKIE = 'sdn01_admin_session';
const SESSION_TTL_HOURS = 12;

function bufToHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBuf(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, keyMaterial, 256
  );
  const saltOut = saltHex || bufToHex(salt);
  return `pbkdf2$${ITERATIONS}$${saltOut}$${bufToHex(bits)}`;
}

export async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const [, iterStr, salt, hashHex] = parts;
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBuf(salt), iterations: Number(iterStr), hash: 'SHA-256' }, keyMaterial, 256
  );
  return bufToHex(bits) === hashHex;
}

export function randomToken() {
  return bufToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createSession(env, userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();
  await env.DB.prepare(
    'INSERT INTO admin_sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(token, userId, expires).run();
  return { token, expires };
}

export function sessionCookieHeader(token, expiresISO) {
  const expires = new Date(expiresISO).toUTCString();
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`;
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match ? match[1] : null;
}

// Mengembalikan { userId } jika sesi valid, atau null. Sekaligus membersihkan
// sesi yang sudah kedaluwarsa agar tabel admin_sessions tidak menumpuk.
export async function getSessionUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT user_id, expires_at FROM admin_sessions WHERE token = ?'
  ).bind(token).first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return { userId: row.user_id, token };
}

export async function requireAdmin(request, env) {
  const session = await getSessionUser(request, env);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Belum login atau sesi kedaluwarsa.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }
  return null; // null berarti lolos
}

export { SESSION_COOKIE };
