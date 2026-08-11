/**
 * Worker API untuk situs SDN 01 Papahan.
 *
 * Endpoint publik (tanpa auth):
 *   GET  /api/data   -> baca seluruh data situs (konten publik, TIDAK PERNAH
 *                        berisi kredensial admin — itu di tabel terpisah).
 *
 * Endpoint auth:
 *   POST /api/login   -> { username, password } -> set-cookie sesi HttpOnly
 *                         (dilindungi rate-limit per-IP + penguncian akun,
 *                         lihat bagian "V3 - PROTEKSI LOGIN" di bawah)
 *   GET  /api/session -> cek apakah cookie sesi yang dikirim browser valid,
 *                         + status forcePasswordChange
 *   POST /api/logout  -> hapus sesi saat ini
 *
 * Endpoint khusus admin (WAJIB cookie sesi valid):
 *   PUT  /api/data                  -> simpan seluruh data situs
 *                                       (ditolak kalau forcePasswordChange)
 *   POST /api/admin/change-password -> ganti password admin (SELALU boleh,
 *                                       supaya admin bisa keluar dari mode
 *                                       "wajib ganti password")
 *   GET  /api/admin/users           -> daftar akun admin
 *   POST /api/admin/users           -> tambah akun admin (ditolak kalau
 *                                       forcePasswordChange)
 *   POST /api/admin/users/delete    -> hapus akun admin (ditolak kalau
 *                                       forcePasswordChange)
 *   GET  /api/admin/security-log    -> 50 percobaan login terakhir (untuk
 *                                       menu "Log Keamanan" di admin.html)
 *
 * Proteksi halaman /admin.html itu sendiri (agar dashboard TIDAK dikirim
 * ke browser yang belum login) diatur lewat `run_worker_first` di
 * wrangler.toml, ditangani di bagian "GERBANG HALAMAN ADMIN" di bawah.
 *
 * =========================================================================
 * V3 - PROTEKSI LOGIN (rate-limit, penguncian akun, wajib ganti password)
 * =========================================================================
 * - Setiap percobaan login (berhasil/gagal) dicatat ke tabel
 *   `login_attempts` beserta alamat IP pengakses.
 * - Rate-limit PER-IP: kalau satu IP gagal login >= IP_RATE_LIMIT_MAX kali
 *   dalam IP_RATE_LIMIT_WINDOW_MS terakhir (lintas username, jadi tidak
 *   bisa dielakkan dengan mencoba banyak username berbeda), permintaan
 *   ditolak 429 tanpa perlu mengecek password sama sekali.
 * - Penguncian PER-USERNAME: kalau satu username gagal login
 *   MAX_FAILED_ATTEMPTS kali berturut-turut, username itu dikunci selama
 *   LOCKOUT_DURATION_MS. Ini melindungi dari brute-force yang fokus ke satu
 *   akun. Catatan jujur: mekanisme ini secara teori bisa disalahgunakan
 *   orang lain untuk mengunci akun admin yang sah (dengan sengaja
 *   memasukkan password salah berulang kali) — makanya durasi kunci dibuat
 *   pendek (15 menit) dan proteksi utama tetap di rate-limit per-IP.
 * - `force_password_change` di tabel admin_users: akun seed awal (username
 *   `admin`, password `admin123`) otomatis bernilai 1, sehingga endpoint
 *   yang mengubah data (PUT /api/data, tambah/hapus admin) akan MENOLAK
 *   permintaan sampai password itu diganti — password default publik yang
 *   "lupa diganti" tidak lagi jadi celah yang bisa dieksploitasi, walau
 *   sesi berhasil login.
 */

const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;       // 15 menit
const IP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;   // 10 menit
const IP_RATE_LIMIT_MAX = 20;                     // gagal login per-IP lintas username
const LOGIN_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

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

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

// Sesi + status force_password_change dalam satu query (join ke admin_users)
// supaya setiap titik yang butuh sesi tahu juga apakah akun itu wajib ganti
// password dulu, tanpa query tambahan.
async function getValidSession(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT sessions.token AS token, sessions.username AS username,
            sessions.expires_at AS expires_at,
            admin_users.force_password_change AS force_password_change
     FROM sessions
     JOIN admin_users ON admin_users.username = sessions.username
     WHERE sessions.token = ?`
  ).bind(token).first();
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

// --------------------------------------------------------------------------
// V3: Content-Security-Policy + header keamanan lain untuk setiap halaman
// HTML yang dikirim (publik maupun admin). Tidak diterapkan ke aset non-HTML
// (CSS/JS/gambar) karena header ini hanya relevan untuk dokumen HTML.
//
// Catatan jujur: CSP di bawah masih mengizinkan 'unsafe-inline' untuk script
// & style, karena admin.html/index.html/login.html menaruh banyak logic
// langsung di tag <script> inline (bukan file terpisah). Idealnya semua JS
// dipindah ke file eksternal + dipakai CSP nonce/hash supaya 'unsafe-inline'
// bisa dihapus total — tapi itu perombakan besar di luar cakupan perbaikan
// ini. Meski begitu, CSP ini tetap berguna: domain yang boleh memuat script
// dibatasi hanya ke domain yang memang dipakai situs ini (cdn.tailwindcss.com,
// unpkg.com), jadi skrip asing dari domain lain (mis. lewat CDN pihak ketiga
// yang disusupi, atau suntikan link <script src="https://evil.com/x.js">)
// akan diblokir browser.
// --------------------------------------------------------------------------
function withSecurityHeaders(response) {
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' https: data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ');

  const newHeaders = new Headers(response.headers);
  newHeaders.set('Content-Security-Policy', csp);
  newHeaders.set('X-Content-Type-Options', 'nosniff');
  newHeaders.set('X-Frame-Options', 'DENY');
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  newHeaders.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// --------------------------------------------------------------------------
// V3: rate-limit per-IP + penguncian per-username + logging percobaan login
// --------------------------------------------------------------------------
async function isIpRateLimited(env, ip) {
  const since = Date.now() - IP_RATE_LIMIT_WINDOW_MS;
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND success = 0 AND created_at > ?'
  ).bind(ip, since).first();
  return !!(row && row.n >= IP_RATE_LIMIT_MAX);
}

async function getLockout(env, username) {
  return env.DB.prepare('SELECT * FROM login_lockouts WHERE username = ?').bind(username).first();
}

async function bumpLockout(env, username) {
  const now = Date.now();
  const existing = await getLockout(env, username);
  const failedCount = (existing ? existing.failed_count : 0) + 1;
  const lockedUntil = failedCount >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_DURATION_MS : 0;
  await env.DB.prepare(
    `INSERT INTO login_lockouts (username, failed_count, locked_until, last_attempt_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET
       failed_count = excluded.failed_count,
       locked_until = excluded.locked_until,
       last_attempt_at = excluded.last_attempt_at`
  ).bind(username, failedCount, lockedUntil, now).run();
  return lockedUntil;
}

async function resetLockout(env, username) {
  await env.DB.prepare('DELETE FROM login_lockouts WHERE username = ?').bind(username).run();
}

async function recordLoginAttempt(env, username, ip, success) {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO login_attempts (username, ip, success, created_at) VALUES (?, ?, ?, ?)'
  ).bind(username, ip, success ? 1 : 0, now).run();

  // Bersih-bersih ringan: ~1 dari 50 request login, buang log lebih dari 30
  // hari supaya tabel tidak membengkak tanpa perlu cron job terpisah.
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM login_attempts WHERE created_at < ?')
      .bind(now - LOGIN_LOG_RETENTION_MS).run();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env, request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // ---------------------------------------------------------------
    // GERBANG HALAMAN ADMIN — lihat wrangler.toml (run_worker_first).
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
      const assetResponse = await env.ASSETS.fetch(request);
      return withSecurityHeaders(assetResponse);
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
    // POST /api/login — dilindungi rate-limit per-IP + penguncian akun
    // (lihat komentar "V3 - PROTEKSI LOGIN" di atas file).
    // ---------------------------------------------------------------
    if (url.pathname === '/api/login' && request.method === 'POST') {
      const ip = getClientIp(request);

      if (await isIpRateLimited(env, ip)) {
        return json({ error: 'Terlalu banyak percobaan login dari jaringan Anda. Coba lagi dalam beberapa menit.' }, 429, env, request);
      }

      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!username || !password) return json({ error: 'Username dan password wajib diisi.' }, 400, env, request);

      const lockout = await getLockout(env, username);
      if (lockout && lockout.locked_until > Date.now()) {
        const minutesLeft = Math.ceil((lockout.locked_until - Date.now()) / 60000);
        return json({ error: `Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam ${minutesLeft} menit.` }, 429, env, request);
      }

      const user = await env.DB.prepare('SELECT * FROM admin_users WHERE username = ?').bind(username).first();
      // Pesan error SENGAJA generik (tidak bilang "username salah" vs "password salah")
      // supaya penyerang tidak bisa menebak username yang valid satu per satu.
      if (!user) {
        await recordLoginAttempt(env, username, ip, false);
        return json({ error: 'Username atau password salah.' }, 401, env, request);
      }

      const computed = await pbkdf2Hex(password, user.salt, user.iterations);
      if (!timingSafeEqualHex(computed, user.password_hash)) {
        await recordLoginAttempt(env, username, ip, false);
        const lockedUntil = await bumpLockout(env, username);
        if (lockedUntil > Date.now()) {
          return json({ error: `Terlalu banyak percobaan gagal. Akun dikunci selama ${Math.round(LOCKOUT_DURATION_MS / 60000)} menit.` }, 429, env, request);
        }
        return json({ error: 'Username atau password salah.' }, 401, env, request);
      }

      await recordLoginAttempt(env, username, ip, true);
      await resetLockout(env, username);

      const token = randomHex(32);
      const now = Date.now();
      await env.DB.prepare('INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .bind(token, user.username, now, now + SESSION_TTL_MS).run();

      return json({
        ok: true,
        username: user.username,
        forcePasswordChange: !!user.force_password_change,
      }, 200, env, request, {
        'Set-Cookie': sessionCookieHeader(token, SESSION_TTL_MS / 1000),
      });
    }

    // ---------------------------------------------------------------
    // GET /api/session — dipakai admin.html untuk verifikasi sebelum render
    // ---------------------------------------------------------------
    if (url.pathname === '/api/session' && request.method === 'GET') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Belum masuk.' }, 401, env, request);
      return json({
        ok: true,
        username: session.username,
        forcePasswordChange: !!session.force_password_change,
      }, 200, env, request);
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
    // POST /api/admin/change-password — wajib sesi valid + password lama benar.
    // SELALU diizinkan walau forcePasswordChange aktif (justru ini jalan
    // keluarnya) — cuma di sini juga flag force_password_change dimatikan.
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
      if (newPassword === 'admin123') return json({ error: 'Tidak boleh memakai password default. Pilih password lain.' }, 400, env, request);

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
        'UPDATE admin_users SET password_hash = ?, salt = ?, iterations = ?, force_password_change = 0, updated_at = ? WHERE username = ?'
      ).bind(newHash, newSalt, newIterations, Date.now(), user.username).run();

      return json({ ok: true }, 200, env, request);
    }

    // ---------------------------------------------------------------
    // Kelola banyak akun admin.
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
      if (session.force_password_change) {
        return json({ error: 'Anda wajib mengganti password terlebih dahulu sebelum menambah akun lain.' }, 403, env, request);
      }

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
        'INSERT INTO admin_users (username, password_hash, salt, iterations, force_password_change, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
      ).bind(username, hash, salt, iterations, now, now).run();

      return json({ ok: true }, 200, env, request);
    }

    if (url.pathname === '/api/admin/users/delete' && request.method === 'POST') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);
      if (session.force_password_change) {
        return json({ error: 'Anda wajib mengganti password terlebih dahulu sebelum menghapus akun.' }, 403, env, request);
      }

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
    // GET /api/admin/security-log — 50 percobaan login terakhir, dipakai
    // menu "Log Keamanan" di admin.html supaya admin sadar kalau ada yang
    // mencoba brute-force, tanpa perlu buka Cloudflare Dashboard.
    // ---------------------------------------------------------------
    if (url.pathname === '/api/admin/security-log' && request.method === 'GET') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);

      const { results } = await env.DB.prepare(
        'SELECT username, ip, success, created_at FROM login_attempts ORDER BY created_at DESC LIMIT 50'
      ).all();
      return json({ ok: true, attempts: results }, 200, env, request);
    }

    // ---------------------------------------------------------------
    // PUT /api/data — simpan seluruh data situs. WAJIB sesi admin valid,
    // DAN ditolak selama akun masih wajib ganti password (force_password_change).
    // ---------------------------------------------------------------
    if (url.pathname === '/api/data' && request.method === 'PUT') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);
      if (session.force_password_change) {
        return json({ error: 'Anda wajib mengganti password default terlebih dahulu sebelum bisa menyimpan perubahan. Buka menu Pengaturan Akun.' }, 403, env, request);
      }

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

    // ---------------------------------------------------------------
    // Untuk request lain yang cocok dengan file statis (index.html,
    // login.html, sitemap.xml, dst), teruskan ke asset binding lalu
    // tambahkan header keamanan (CSP dkk) untuk respons berjenis HTML.
    // ---------------------------------------------------------------
    if (env.ASSETS) {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        return withSecurityHeaders(assetResponse);
      } catch (e) { /* lanjut ke 404 di bawah */ }
    }

    return json({ error: 'Not found' }, 404, env, request);
  },
};
