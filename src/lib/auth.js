// =========================================================================
// auth.js — hashing password (Web Crypto PBKDF2) + session cookie
// Semua endpoint tulis di /api/* WAJIB memanggil requireAuth() dulu.
// =========================================================================

const PBKDF2_ITERATIONS = 100000;
const SESSION_COOKIE = 'sdn01_session';
const SESSION_TTL_HOURS = 12;

function bufToHex(buf) {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function hexToBuf(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes.buffer;
}

export async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        256
    );
    return `${PBKDF2_ITERATIONS}:${bufToHex(salt)}:${bufToHex(bits)}`;
}

export async function verifyPassword(password, stored) {
    if (!stored || stored.split(':').length !== 3) return false;
    const [iterStr, saltHex, hashHex] = stored.split(':');
    const iterations = parseInt(iterStr, 10);
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: hexToBuf(saltHex), iterations, hash: 'SHA-256' },
        keyMaterial,
        256
    );
    const computedHex = bufToHex(bits);
    // constant-time-ish compare
    if (computedHex.length !== hashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < computedHex.length; i++) diff |= computedHex.charCodeAt(i) ^ hashHex.charCodeAt(i);
    return diff === 0;
}

function randomToken() {
    return bufToHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

export async function createSession(env, username) {
    const token = randomToken();
    const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();
    await env.DB.prepare('INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, ?)')
        .bind(token, username, expires)
        .run();
    return { token, expires };
}

export async function destroySession(env, token) {
    if (!token) return;
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
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

export function getSessionToken(request) {
    return parseCookies(request)[SESSION_COOKIE] || null;
}

export async function getSessionUser(env, request) {
    const token = getSessionToken(request);
    if (!token) return null;
    const row = await env.DB.prepare('SELECT username, expires_at FROM sessions WHERE token = ?').bind(token).first();
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
        await destroySession(env, token);
        return null;
    }
    return row.username;
}

export function sessionCookieHeader(token, maxAgeSeconds = SESSION_TTL_HOURS * 3600) {
    return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearCookieHeader() {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * Guard untuk endpoint /api/* yang butuh login. Return Response 401 kalau
 * gagal, atau null kalau OK (lanjut ke handler).
 */
export async function requireAuth(env, request) {
    const user = await getSessionUser(env, request);
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    return null;
}
