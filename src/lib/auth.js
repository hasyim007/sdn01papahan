/**
 * Autentikasi admin: hashing password (PBKDF2-SHA256, format "iterasi$saltHex$hashHex",
 * sama seperti dijelaskan saat setup manual lewat D1 Console) dan pengelolaan sesi login
 * berbasis cookie httpOnly (tabel admin_sessions).
 */

const PBKDF2_ITERATIONS = 100000;
const SESSION_COOKIE_NAME = 'session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function deriveBits(password, salt, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, 256);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(bits)}`;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 3) return false;
  const iterations = parseInt(parts[0], 10);
  const salt = fromHex(parts[1]);
  const expected = fromHex(parts[2]);
  if (!iterations || !salt.length || !expected.length) return false;
  const bits = await deriveBits(password, salt, iterations);
  return timingSafeEqual(new Uint8Array(bits), expected);
}

function randomToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createSession(env, userId) {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO admin_sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(token, userId, now, now + SESSION_TTL_MS).run();
  return token;
}

export async function destroySession(env, token) {
  if (!token) return;
  await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
}

function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

/**
 * Cek sesi dari cookie request. Kalau valid, perpanjang masa berlakunya (sliding
 * session) supaya admin yang aktif tidak ke-logout di tengah kerja. Mengembalikan
 * { user: {id, username} } atau null.
 */
export async function getSessionUser(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT admin_sessions.token as token, admin_sessions.expires_at as expires_at,
            admin_users.id as user_id, admin_users.username as username
     FROM admin_sessions JOIN admin_users ON admin_users.id = admin_sessions.user_id
     WHERE admin_sessions.token = ?`
  ).bind(token).first();

  if (!row || row.expires_at < now) return null;

  await env.DB.prepare('UPDATE admin_sessions SET expires_at = ? WHERE token = ?')
    .bind(now + SESSION_TTL_MS, token)
    .run();

  return { token, user: { id: row.user_id, username: row.username } };
}

export function sessionCookieHeader(token, isSecure) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; ${isSecure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookieHeader(isSecure) {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; ${isSecure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0`;
}

export async function findUserByUsername(env, username) {
  return env.DB.prepare('SELECT id, username, password_hash FROM admin_users WHERE username = ?')
    .bind(username)
    .first();
}

export async function updateUserCredentials(env, userId, { username, passwordHash }) {
  const now = Date.now();
  if (username && passwordHash) {
    await env.DB.prepare('UPDATE admin_users SET username = ?, password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(username, passwordHash, now, userId).run();
  } else if (username) {
    await env.DB.prepare('UPDATE admin_users SET username = ?, updated_at = ? WHERE id = ?')
      .bind(username, now, userId).run();
  } else if (passwordHash) {
    await env.DB.prepare('UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(passwordHash, now, userId).run();
  }
}
