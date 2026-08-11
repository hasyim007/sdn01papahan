/**
 * Worker API untuk situs SDN 01 Papahan.
 *
 * Endpoint publik (tanpa auth):
 *   GET  /api/data   -> baca seluruh data situs (konten publik, TIDAK PERNAH
 *                        berisi kredensial admin — itu di tabel terpisah).
 *
 * Endpoint auth:
 *   POST /api/login   -> { username, password } -> set-cookie sesi HttpOnly
 *   GET  /api/session -> cek apakah cookie sesi yang dikirim browser valid
 *   POST /api/logout  -> hapus sesi saat ini
 *
 * Endpoint khusus admin (WAJIB cookie sesi valid):
 *   PUT  /api/data                  -> simpan seluruh data situs
 *   POST /api/admin/change-password -> ganti password admin
 *
 * Proteksi halaman /admin.html itu sendiri (agar dashboard TIDAK dikirim
 * ke browser yang belum login) diatur lewat `run_worker_first` di
 * wrangler.toml, ditangani di fungsi handleAdminPageGate() di bawah.
 */

const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam

// --------------------------------------------------------------------------
// Util: hashing password (PBKDF2-HMAC-SHA256 via WebCrypto, tersedia native
// di Cloudflare Workers — tidak perlu library tambahan).
// --------------------------------------------------------------------------
async function pbkdf2Hex(password, saltHex, iterations) {
  const enc = new TextEncoder();
  const saltBytes = hexToBytes(saltHex);
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function randomHex(byteLen) {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}
function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function sessionCookieHeader(token, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ];
  return parts.join('; ');
}

async function getValidSession(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare('SELECT token, username, expires_at FROM sessions WHERE token = ?')
    .bind(token).first();
  if (!row) return null;
  if (Date.now() > row.expires_at) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return row;
}

function corsHeaders(env, request) {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGIN || '';
  return {
    'Access-Control-Allow-Origin': (origin && origin === allowed) ? origin : allowed,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, env, request, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(env, request),
      ...(extraHeaders || {}),
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env, request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // ---------------------------------------------------------------
    // Gerbang halaman /admin.html — lihat wrangler.toml (run_worker_first).
    // Request ke /admin.html masuk ke sini SEBELUM file statisnya dikirim.
    // Kalau sesi tidak valid, admin.html TIDAK PERNAH dikirim ke browser;
    // pengunjung dialihkan ke /login.html.
    // ---------------------------------------------------------------
    if ((url.pathname === '/admin.html' || url.pathname === '/admin') && request.method === 'GET') {
      const session = await getValidSession(request, env);
      if (!session) {
        return Response.redirect(new URL('/login.html', url).toString(), 302);
      }
      // PENTING: teruskan request APA ADANYA (jangan paksa ganti ke /admin.html).
      // Cloudflare Assets otomatis mempersingkat /admin.html <-> /admin secara
      // internal; memaksa salah satu bentuk di sini menyebabkan redirect loop.
      return env.ASSETS.fetch(request);
    }

    // ---------------------------------------------------------------
    // GET /api/data — konten publik situs. TIDAK butuh auth (memang untuk
    // ditampilkan ke semua pengunjung), tapi kita jaga-jaga strip field
    // "admin" kalau-kalau masih ada sisa dari data lama.
    // ---------------------------------------------------------------
    if (url.pathname === '/api/data' && request.method === 'GET') {
      const row = await env.DB.prepare('SELECT data, updated_at FROM site_data WHERE id = ?')
        .bind('main').first();
      let data = row ? row.data : '{}';
      try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object' && 'admin' in parsed) {
          delete parsed.admin;
          data = JSON.stringify(parsed);
        }
      } catch (e) { /* biarkan apa adanya kalau bukan JSON valid */ }
      return new Response(data, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Updated-At': row ? String(row.updated_at) : '0',
          ...cors,
        },
      });
    }

    // ---------------------------------------------------------------
    // POST /api/login
    // ---------------------------------------------------------------
    if (url.pathname === '/api/login' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!username || !password) return json({ error: 'Username dan password wajib diisi.' }, 400, env, request);

      const user = await env.DB.prepare('SELECT * FROM admin_users WHERE username = ?').bind(username).first();
      // Pesan error SENGAJA generik (tidak bilang "username salah" vs "password salah")
      // supaya penyerang tidak bisa menebak username yang valid satu per satu.
      if (!user) return json({ error: 'Username atau password salah.' }, 401, env, request);

      const computed = await pbkdf2Hex(password, user.salt, user.iterations);
      if (!timingSafeEqualHex(computed, user.password_hash)) {
        return json({ error: 'Username atau password salah.' }, 401, env, request);
      }

      const token = randomHex(32);
      const now = Date.now();
      await env.DB.prepare('INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .bind(token, user.username, now, now + SESSION_TTL_MS).run();

      return json({ ok: true, username: user.username }, 200, env, request, {
        'Set-Cookie': sessionCookieHeader(token, SESSION_TTL_MS / 1000),
      });
    }

    // ---------------------------------------------------------------
    // GET /api/session — dipakai admin.html untuk verifikasi sebelum render
    // ---------------------------------------------------------------
    if (url.pathname === '/api/session' && request.method === 'GET') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Belum masuk.' }, 401, env, request);
      return json({ ok: true, username: session.username }, 200, env, request);
    }

    // ---------------------------------------------------------------
    // POST /api/logout
    // ---------------------------------------------------------------
    if (url.pathname === '/api/logout' && request.method === 'POST') {
      const token = getCookie(request, SESSION_COOKIE);
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
      return json({ ok: true }, 200, env, request, { 'Set-Cookie': sessionCookieHeader('', 0) });
    }

    // ---------------------------------------------------------------
    // POST /api/admin/change-password — wajib sesi valid + password lama benar
    // ---------------------------------------------------------------
    if (url.pathname === '/api/admin/change-password' && request.method === 'POST') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);

      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      if (!currentPassword || !newPassword) return json({ error: 'Password saat ini dan password baru wajib diisi.' }, 400, env, request);
      if (newPassword.length < 8) return json({ error: 'Password baru minimal 8 karakter.' }, 400, env, request);

      const user = await env.DB.prepare('SELECT * FROM admin_users WHERE username = ?').bind(session.username).first();
      if (!user) return json({ error: 'Akun tidak ditemukan.' }, 404, env, request);

      const computed = await pbkdf2Hex(currentPassword, user.salt, user.iterations);
      if (!timingSafeEqualHex(computed, user.password_hash)) {
        return json({ error: 'Password saat ini salah.' }, 401, env, request);
      }

      const newSalt = randomHex(16);
      const newIterations = 100000;
      const newHash = await pbkdf2Hex(newPassword, newSalt, newIterations);
      await env.DB.prepare(
        'UPDATE admin_users SET password_hash = ?, salt = ?, iterations = ?, updated_at = ? WHERE username = ?'
      ).bind(newHash, newSalt, newIterations, Date.now(), user.username).run();

      return json({ ok: true }, 200, env, request);
    }

    // ---------------------------------------------------------------
    // Kelola banyak akun admin (semua wajib sesi valid).
    // ---------------------------------------------------------------
    if (url.pathname === '/api/admin/users' && request.method === 'GET') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);
      const { results } = await env.DB.prepare(
        'SELECT username, created_at FROM admin_users ORDER BY created_at ASC'
      ).all();
      return json({ ok: true, users: results, currentUsername: session.username }, 200, env, request);
    }

    if (url.pathname === '/api/admin/users' && request.method === 'POST') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);

      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!username || username.length < 3) return json({ error: 'Username minimal 3 karakter.' }, 400, env, request);
      if (!/^[a-zA-Z0-9_.-]+$/.test(username)) return json({ error: 'Username hanya boleh huruf, angka, titik, garis bawah, dan strip.' }, 400, env, request);
      if (!password || password.length < 8) return json({ error: 'Password minimal 8 karakter.' }, 400, env, request);

      const existing = await env.DB.prepare('SELECT username FROM admin_users WHERE username = ?').bind(username).first();
      if (existing) return json({ error: 'Username sudah dipakai admin lain.' }, 409, env, request);

      const salt = randomHex(16);
      const iterations = 100000;
      const hash = await pbkdf2Hex(password, salt, iterations);
      const now = Date.now();
      await env.DB.prepare(
        'INSERT INTO admin_users (username, password_hash, salt, iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(username, hash, salt, iterations, now, now).run();

      return json({ ok: true }, 200, env, request);
    }

    if (url.pathname === '/api/admin/users/delete' && request.method === 'POST') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);

      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }
      const username = String(body.username || '').trim();
      if (!username) return json({ error: 'Username wajib diisi.' }, 400, env, request);
      if (username === session.username) return json({ error: 'Tidak bisa menghapus akun yang sedang Anda pakai untuk login.' }, 400, env, request);

      const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_users').first();
      if (countRow && countRow.n <= 1) return json({ error: 'Tidak bisa menghapus admin terakhir.' }, 400, env, request);

      await env.DB.prepare('DELETE FROM admin_users WHERE username = ?').bind(username).run();
      // Cabut semua sesi login admin yang dihapus, supaya langsung ter-logout di perangkat manapun.
      await env.DB.prepare('DELETE FROM sessions WHERE username = ?').bind(username).run();

      return json({ ok: true }, 200, env, request);
    }

    // ---------------------------------------------------------------
    // PUT /api/data — simpan seluruh data situs. WAJIB sesi admin valid.
    // ---------------------------------------------------------------
    if (url.pathname === '/api/data' && request.method === 'PUT') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);

      let bodyText;
      try {
        bodyText = await request.text();
        if (bodyText.length > 20 * 1024 * 1024) {
          return json({ error: 'Data terlalu besar (maks 20MB). Kompres gambar yang diunggah.' }, 413, env, request);
        }
        const parsed = JSON.parse(bodyText);
        // Jaring pengaman: kredensial tidak boleh pernah ikut tersimpan di sini,
        // walau client lama/berbeda mengirimkannya secara tidak sengaja.
        if (parsed && typeof parsed === 'object' && 'admin' in parsed) {
          delete parsed.admin;
          bodyText = JSON.stringify(parsed);
        }
      } catch (e) {
        return json({ error: 'Format data JSON tidak valid.' }, 400, env, request);
      }

      const now = Date.now();
      await env.DB.prepare(
        'INSERT INTO site_data (id, data, updated_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
      ).bind('main', bodyText, now).run();

      return json({ ok: true, updated_at: now }, 200, env, request);
    }

    // Untuk request lain yang cocok dengan file statis, biarkan asset binding yang menangani
    // (Worker ini hanya "diminta duluan" untuk path yang didaftarkan di run_worker_first).
    if (env.ASSETS) {
      try { return await env.ASSETS.fetch(request); } catch (e) { /* lanjut ke 404 di bawah */ }
    }

    return json({ error: 'Not found' }, 404, env, request);
  },
};
