/**
 * Worker API untuk situs SDN 01 Papahan.
 *
 * =========================================================================
 * PERUBAHAN BESAR (Agustus 2026) — migrasi dari satu blob JSON (site_data)
 * ke skema per-tabel di D1, untuk menghilangkan error "D1_ERROR: string or
 * blob too big: SQLITE_TOOBIG" secara permanen.
 *
 * PENTING: bentuk data yang dikirim/diterima oleh GET dan PUT /api/data
 * TIDAK BERUBAH SAMA SEKALI dari sudut pandang admin.html maupun situs
 * publik — keduanya tetap bekerja dengan objek DB yang sama persis seperti
 * sebelumnya. Yang berubah murni cara Worker ini menyimpannya di D1: bukan
 * satu kolom JSON raksasa lagi, tapi banyak baris kecil per section/item.
 *
 * GET /api/data  -> membaca dari banyak tabel, MENYUSUN ULANG jadi satu
 *                   objek JSON dengan bentuk sama seperti sebelumnya.
 * PUT /api/data  -> menerima body JSON besar seperti sebelumnya, lalu
 *                   MEMECAHNYA jadi banyak query kecil dijalankan sekaligus
 *                   lewat env.DB.batch() (transaksi atomik — semua berhasil
 *                   atau semua gagal bersama).
 *
 * PENGECUALIAN: field `beritaComments` SENGAJA TIDAK ikut ditimpa oleh PUT
 * /api/data. Field ini tumbuh dari komentar publik (lewat endpoint
 * /api/public/berita/:slug/comments — lihat fungsi handlePublicComment di
 * bawah), bukan dari form admin, jadi tidak boleh diperlakukan sebagai
 * "replace all" tiap kali admin menyimpan section lain yang tidak
 * berhubungan (kalau ikut ditimpa, komentar asli bisa hilang tertimpa data
 * lama dari sesi admin.html yang browsernya belum di-refresh).
 *
 * MIGRASI DATA LAMA: lihat endpoint khusus admin
 * POST /api/admin/migrate-to-tables di bagian bawah file ini. Jalankan
 * SEKALI SAJA setelah schema_tambahan.sql dieksekusi dan worker ini
 * dideploy. Baca komentar di endpoint tersebut untuk detail keamanannya.
 * =========================================================================
 */

const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;       // 15 menit
const IP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;   // 10 menit
const IP_RATE_LIMIT_MAX = 20;                     // gagal login per-IP lintas username
const LOGIN_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

// Key-key singleton yang disimpan di tabel site_settings (1 baris per key).
// "hero" disimpan TANPA field "images" -- itu ada di tabel hero_images sendiri.
const SETTINGS_KEYS = [
  'meta', 'hero', 'sambutan', 'profil',
  'programHeader', 'guruHeader', 'prestasiHeader', 'ekskulHeader',
  'beritaHeader', 'agendaHeader', 'galeriHeader', 'testimoniHeader',
  'kontak', 'footer', 'pageOrder',
];

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

function withSecurityHeaders(response) {
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' https: data:",
    "connect-src 'self' https://unpkg.com",
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
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM login_attempts WHERE created_at < ?')
      .bind(now - LOGIN_LOG_RETENTION_MS).run();
  }
}

// =========================================================================
// ASSEMBLE — baca semua tabel, susun ulang jadi objek DB (bentuk sama
// persis seperti yang dulu tersimpan di kolom site_data.data).
// =========================================================================
async function assembleSiteData(env) {
  const settingsRes = await env.DB.prepare('SELECT key, data FROM site_settings').all();
  const settings = {};
  for (const row of settingsRes.results) {
    try { settings[row.key] = JSON.parse(row.data); } catch (e) { /* skip korup */ }
  }

  const heroImagesRes = await env.DB.prepare(
    'SELECT image_data FROM hero_images ORDER BY sort_order ASC'
  ).all();
  const hero = settings.hero || {};
  hero.images = heroImagesRes.results.map(r => r.image_data);

  const programRes = await env.DB.prepare(
    'SELECT icon, color, title, desc FROM program ORDER BY sort_order ASC'
  ).all();

  const guruRes = await env.DB.prepare(
    'SELECT photo, name, role, experience, education, is_kepsek FROM guru ORDER BY sort_order ASC'
  ).all();
  const guru = guruRes.results.map(r => ({
    photo: r.photo, name: r.name, role: r.role,
    experience: r.experience, education: r.education,
    isKepsek: !!r.is_kepsek,
  }));

  const prestasiRes = await env.DB.prepare(
    'SELECT photo, badge, date, title, student_name FROM prestasi ORDER BY sort_order ASC'
  ).all();
  const prestasi = prestasiRes.results.map(r => ({
    photo: r.photo, badge: r.badge, date: r.date,
    title: r.title, studentName: r.student_name,
  }));

  const ekskulRes = await env.DB.prepare(
    'SELECT icon, color, name, status FROM ekskul ORDER BY sort_order ASC'
  ).all();

  const beritaRes = await env.DB.prepare(
    'SELECT id, date, author, category, title, excerpt, content, tags FROM berita ORDER BY sort_order ASC'
  ).all();

  // beritaComments: dibaca (bukan bagian dari replace-cycle PUT) -- lihat
  // catatan besar di atas file ini.
  const commentsRes = await env.DB.prepare(
    'SELECT berita_id, name, comment, created_at FROM berita_comments ORDER BY created_at ASC'
  ).all();
  const beritaComments = {};
  for (const row of commentsRes.results) {
    if (!beritaComments[row.berita_id]) beritaComments[row.berita_id] = [];
    beritaComments[row.berita_id].push({
      name: row.name, comment: row.comment, created_at: row.created_at,
    });
  }

  const agendaRes = await env.DB.prepare(
    'SELECT month, day, title, time, location FROM agenda ORDER BY sort_order ASC'
  ).all();

  const galeriRes = await env.DB.prepare(
    'SELECT image, caption FROM galeri ORDER BY sort_order ASC'
  ).all();

  const testimoniRes = await env.DB.prepare(
    'SELECT quote, name, role, photo FROM testimoni ORDER BY sort_order ASC'
  ).all();

  const faqRes = await env.DB.prepare(
    'SELECT q, a FROM faq ORDER BY sort_order ASC'
  ).all();

  const customSectionsRes = await env.DB.prepare(
    'SELECT id, type, eyebrow, title, subtitle, bg_style, active, menu_label, image, image_position, columns, cta_label, cta_link FROM custom_sections ORDER BY sort_order ASC'
  ).all();
  const customItemsRes = await env.DB.prepare(
    'SELECT section_id, item_json FROM custom_section_items ORDER BY sort_order ASC'
  ).all();
  const itemsBySection = {};
  for (const row of customItemsRes.results) {
    if (!itemsBySection[row.section_id]) itemsBySection[row.section_id] = [];
    try { itemsBySection[row.section_id].push(JSON.parse(row.item_json)); } catch (e) { /* skip korup */ }
  }
  const customSections = customSectionsRes.results.map(r => ({
    id: r.id, type: r.type, eyebrow: r.eyebrow, title: r.title, subtitle: r.subtitle,
    bgStyle: r.bg_style, active: !!r.active, menuLabel: r.menu_label,
    image: r.image, imagePosition: r.image_position, columns: r.columns,
    ctaLabel: r.cta_label, ctaLink: r.cta_link,
    items: itemsBySection[r.id] || [],
  }));

  return {
    meta: settings.meta, hero, sambutan: settings.sambutan, profil: settings.profil,
    programHeader: settings.programHeader, program: programRes.results,
    guruHeader: settings.guruHeader, guru,
    prestasiHeader: settings.prestasiHeader, prestasi,
    ekskulHeader: settings.ekskulHeader, ekskul: ekskulRes.results,
    beritaHeader: settings.beritaHeader, berita: beritaRes.results, beritaComments,
    agendaHeader: settings.agendaHeader, agenda: agendaRes.results,
    galeriHeader: settings.galeriHeader, galeri: galeriRes.results,
    testimoniHeader: settings.testimoniHeader, testimoni: testimoniRes.results,
    faq: faqRes.results,
    kontak: settings.kontak, footer: settings.footer,
    pageOrder: settings.pageOrder,
    customSections,
  };
}

// =========================================================================
// DECOMPOSE — terima objek DB (bentuk sama seperti yang dikirim
// admin.html), pecah jadi banyak D1 statement, jalankan sebagai satu
// batch atomik (env.DB.batch). Strategi tiap tabel list: DELETE semua baris
// section itu, lalu INSERT ulang sesuai array yang baru -- aman karena
// admin.html SELALU mengirim seluruh array tiap kali Simpan (bukan cuma
// yang berubah), dan sebagian besar list tidak punya id eksplisit
// (urutan array = urutan tampil).
//
// beritaComments SENGAJA DIABAIKAN di sini -- lihat catatan besar di atas
// file ini kenapa field itu tidak boleh ikut proses replace-all.
// =========================================================================
function buildDecomposeStatements(env, data) {
  const stmts = [];
  const now = Date.now();

  // --- site_settings (singleton) ---
  for (const key of SETTINGS_KEYS) {
    if (data[key] === undefined) continue;
    let valueToStore = data[key];
    if (key === 'hero' && valueToStore && typeof valueToStore === 'object') {
      // jangan simpan images di sini -- itu di tabel hero_images sendiri.
      const { images, ...heroWithoutImages } = valueToStore;
      valueToStore = heroWithoutImages;
    }
    stmts.push(
      env.DB.prepare(
        `INSERT INTO site_settings (key, data, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
      ).bind(key, JSON.stringify(valueToStore), now)
    );
  }

  // --- hero_images ---
  if (data.hero && Array.isArray(data.hero.images)) {
    stmts.push(env.DB.prepare('DELETE FROM hero_images'));
    data.hero.images.forEach((img, i) => {
      stmts.push(
        env.DB.prepare('INSERT INTO hero_images (image_data, sort_order) VALUES (?, ?)')
          .bind(img, i)
      );
    });
  }

  // --- program ---
  if (Array.isArray(data.program)) {
    stmts.push(env.DB.prepare('DELETE FROM program'));
    data.program.forEach((it, i) => {
      stmts.push(
        env.DB.prepare('INSERT INTO program (icon, color, title, desc, sort_order) VALUES (?, ?, ?, ?, ?)')
          .bind(it.icon || '', it.color || '', it.title || '', it.desc || '', i)
      );
    });
  }

  // --- guru ---
  if (Array.isArray(data.guru)) {
    stmts.push(env.DB.prepare('DELETE FROM guru'));
    data.guru.forEach((it, i) => {
      stmts.push(
        env.DB.prepare(
          'INSERT INTO guru (photo, name, role, experience, education, is_kepsek, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(it.photo || '', it.name || '', it.role || '', it.experience || '', it.education || '', it.isKepsek ? 1 : 0, i)
      );
    });
  }

  // --- prestasi ---
  if (Array.isArray(data.prestasi)) {
    stmts.push(env.DB.prepare('DELETE FROM prestasi'));
    data.prestasi.forEach((it, i) => {
      stmts.push(
        env.DB.prepare(
          'INSERT INTO prestasi (photo, badge, date, title, student_name, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(it.photo || '', it.badge || '', it.date || '', it.title || '', it.studentName || '', i)
      );
    });
  }

  // --- ekskul ---
  if (Array.isArray(data.ekskul)) {
    stmts.push(env.DB.prepare('DELETE FROM ekskul'));
    data.ekskul.forEach((it, i) => {
      stmts.push(
        env.DB.prepare('INSERT INTO ekskul (icon, color, name, status, sort_order) VALUES (?, ?, ?, ?, ?)')
          .bind(it.icon || '', it.color || '', it.name || '', it.status || '', i)
      );
    });
  }

  // --- berita (id dipertahankan apa adanya) ---
  if (Array.isArray(data.berita)) {
    stmts.push(env.DB.prepare('DELETE FROM berita'));
    data.berita.forEach((it, i) => {
      stmts.push(
        env.DB.prepare(
          'INSERT INTO berita (id, date, author, category, title, excerpt, content, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(it.id, it.date || '', it.author || '', it.category || '', it.title || '', it.excerpt || '', it.content || '', it.tags || '', i)
      );
    });
  }
  // CATATAN: data.beritaComments SENGAJA TIDAK diproses di sini.

  // --- agenda ---
  if (Array.isArray(data.agenda)) {
    stmts.push(env.DB.prepare('DELETE FROM agenda'));
    data.agenda.forEach((it, i) => {
      stmts.push(
        env.DB.prepare('INSERT INTO agenda (month, day, title, time, location, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(it.month || '', it.day || '', it.title || '', it.time || '', it.location || '', i)
      );
    });
  }

  // --- galeri ---
  if (Array.isArray(data.galeri)) {
    stmts.push(env.DB.prepare('DELETE FROM galeri'));
    data.galeri.forEach((it, i) => {
      stmts.push(
        env.DB.prepare('INSERT INTO galeri (image, caption, sort_order) VALUES (?, ?, ?)')
          .bind(it.image || '', it.caption || '', i)
      );
    });
  }

  // --- testimoni ---
  if (Array.isArray(data.testimoni)) {
    stmts.push(env.DB.prepare('DELETE FROM testimoni'));
    data.testimoni.forEach((it, i) => {
      stmts.push(
        env.DB.prepare('INSERT INTO testimoni (quote, name, role, photo, sort_order) VALUES (?, ?, ?, ?, ?)')
          .bind(it.quote || '', it.name || '', it.role || '', it.photo || '', i)
      );
    });
  }

  // --- faq ---
  if (Array.isArray(data.faq)) {
    stmts.push(env.DB.prepare('DELETE FROM faq'));
    data.faq.forEach((it, i) => {
      stmts.push(
        env.DB.prepare('INSERT INTO faq (q, a, sort_order) VALUES (?, ?, ?)')
          .bind(it.q || '', it.a || '', i)
      );
    });
  }

  // --- custom_sections + custom_section_items (id dipertahankan) ---
  if (Array.isArray(data.customSections)) {
    stmts.push(env.DB.prepare('DELETE FROM custom_section_items'));
    stmts.push(env.DB.prepare('DELETE FROM custom_sections'));
    data.customSections.forEach((cs, i) => {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO custom_sections
             (id, type, eyebrow, title, subtitle, bg_style, active, menu_label, image, image_position, columns, cta_label, cta_link, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          cs.id, cs.type || '', cs.eyebrow || '', cs.title || '', cs.subtitle || '',
          cs.bgStyle || 'light', cs.active ? 1 : 0, cs.menuLabel || '',
          cs.image || '', cs.imagePosition || 'right', cs.columns || 3,
          cs.ctaLabel || '', cs.ctaLink || '', i
        )
      );
      (cs.items || []).forEach((item, j) => {
        stmts.push(
          env.DB.prepare('INSERT INTO custom_section_items (section_id, item_json, sort_order) VALUES (?, ?, ?)')
            .bind(cs.id, JSON.stringify(item), j)
        );
      });
    });
  }

  return stmts;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env, request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // ---------------------------------------------------------------
    // GERBANG HALAMAN ADMIN
    // ---------------------------------------------------------------
    if ((url.pathname === '/admin.html' || url.pathname === '/admin') && request.method === 'GET') {
      const session = await getValidSession(request, env);
      if (!session) {
        return Response.redirect(new URL('/login.html', url).toString(), 302);
      }
      const assetResponse = await env.ASSETS.fetch(request);
      return withSecurityHeaders(assetResponse);
    }

    // ---------------------------------------------------------------
    // GET /api/data — SEKARANG membaca dari banyak tabel (assembleSiteData)
    // alih-alih satu kolom JSON.
    // ---------------------------------------------------------------
    if (url.pathname === '/api/data' && request.method === 'GET') {
      const data = await assembleSiteData(env);
      return json(data, 200, env, request);
    }

    // ---------------------------------------------------------------
    // POST /api/public/berita/:slug/comments — submit komentar publik.
    // Endpoint BARU: hanya menambah baris ke berita_comments, tidak
    // pernah menyentuh tabel lain. Tidak butuh auth (memang untuk publik),
    // tapi dibatasi panjang wajar untuk mencegah penyalahgunaan.
    // ---------------------------------------------------------------
    {
      const commentMatch = url.pathname.match(/^\/api\/public\/berita\/([^/]+)\/comments$/);
      if (commentMatch && request.method === 'POST') {
        const beritaId = decodeURIComponent(commentMatch[1]);
        let body;
        try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }
        const name = String(body.name || '').trim().slice(0, 100);
        const comment = String(body.comment || '').trim().slice(0, 2000);
        if (!name || !comment) return json({ error: 'Nama dan komentar wajib diisi.' }, 400, env, request);

        const article = await env.DB.prepare('SELECT id FROM berita WHERE id = ?').bind(beritaId).first();
        if (!article) return json({ error: 'Artikel tidak ditemukan.' }, 404, env, request);

        const now = Date.now();
        await env.DB.prepare(
          'INSERT INTO berita_comments (berita_id, name, comment, created_at) VALUES (?, ?, ?, ?)'
        ).bind(beritaId, name, comment, now).run();

        return json({ ok: true }, 200, env, request);
      }
    }

    // ---------------------------------------------------------------
    // POST /api/login
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
        ok: true, username: user.username, forcePasswordChange: !!user.force_password_change,
      }, 200, env, request, { 'Set-Cookie': sessionCookieHeader(token, SESSION_TTL_MS / 1000) });
    }

    // ---------------------------------------------------------------
    // GET /api/session
    // ---------------------------------------------------------------
    if (url.pathname === '/api/session' && request.method === 'GET') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Belum masuk.' }, 401, env, request);
      return json({ ok: true, username: session.username, forcePasswordChange: !!session.force_password_change }, 200, env, request);
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
    // POST /api/admin/change-password
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
    // Kelola banyak akun admin
    // ---------------------------------------------------------------
    if (url.pathname === '/api/admin/users' && request.method === 'GET') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);
      const { results } = await env.DB.prepare('SELECT username, created_at FROM admin_users ORDER BY created_at ASC').all();
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
      await env.DB.prepare('DELETE FROM sessions WHERE username = ?').bind(username).run();

      return json({ ok: true }, 200, env, request);
    }

    // ---------------------------------------------------------------
    // GET /api/admin/security-log
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
    // PUT /api/data — SEKARANG memecah body JSON jadi banyak statement
    // kecil dan menjalankannya sebagai satu batch atomik lewat
    // env.DB.batch(). Tidak ada lagi satu kolom besar yang bisa kena
    // SQLITE_TOOBIG -- setiap baris paling besar berisi satu foto.
    // ---------------------------------------------------------------
    if (url.pathname === '/api/data' && request.method === 'PUT') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);
      if (session.force_password_change) {
        return json({ error: 'Anda wajib mengganti password default terlebih dahulu sebelum bisa menyimpan perubahan. Buka menu Pengaturan Akun.' }, 403, env, request);
      }

      let data;
      try {
        const bodyText = await request.text();
        // Batas kewajaran keseluruhan body (bukan lagi batas kolom D1 --
        // tapi tetap jaga-jaga terhadap payload yang tidak masuk akal).
        if (bodyText.length > 20 * 1024 * 1024) {
          return json({ error: 'Data terlalu besar (maks 20MB total). Kompres gambar yang diunggah.' }, 413, env, request);
        }
        data = JSON.parse(bodyText);
        if (data && typeof data === 'object' && 'admin' in data) delete data.admin;
      } catch (e) {
        return json({ error: 'Format data JSON tidak valid.' }, 400, env, request);
      }

      try {
        const stmts = buildDecomposeStatements(env, data);
        if (stmts.length > 0) {
          await env.DB.batch(stmts);
        }
      } catch (e) {
        const msg = String((e && e.message) || e);
        if (msg.includes('TOOBIG') || msg.toLowerCase().includes('too big')) {
          // Sekarang cuma mungkin kejadian kalau SATU item tunggal (mis. satu
          // foto guru) sendiri sudah lewat batas D1 -- bukan lagi gabungan
          // seluruh situs. Pesannya disesuaikan supaya admin tahu persis.
          return json({
            error: 'Salah satu foto yang diunggah masih terlalu besar untuk disimpan. Kompres foto tersebut (perkecil ukuran filenya), lalu coba simpan lagi.',
          }, 413, env, request);
        }
        throw e;
      }

      return json({ ok: true, updated_at: Date.now() }, 200, env, request);
    }

    // ---------------------------------------------------------------
    // POST /api/admin/migrate-to-tables — MIGRASI SATU KALI dari tabel
    // site_data lama (blob JSON tunggal) ke skema per-tabel baru.
    //
    // CARA PAKAI: setelah schema_tambahan.sql dijalankan & worker ini
    // dideploy, login sebagai admin lalu buka:
    //   https://sdn01papahan.sch.id/api/admin/migrate-to-tables
    // dari browser yang sedang login (atau lewat fetch() di DevTools
    // Console tab Admin: fetch('/api/admin/migrate-to-tables', {method:
    // 'POST', credentials:'same-origin'}).then(r=>r.json()).then(console.log)
    //
    // AMAN DIJALANKAN BERULANG (idempotent): setiap kali dipanggil, akan
    // membaca ulang site_data.data TERKINI dan menimpa tabel baru dengan
    // isinya (pola sama seperti PUT /api/data biasa) -- jadi tidak
    // merusak apa pun kalau dijalankan dua kali. TIDAK menghapus tabel
    // site_data lama -- itu keputusan manual terpisah setelah Anda
    // yakin migrasi berhasil (lihat langkah verifikasi di chat).
    // ---------------------------------------------------------------
    if (url.pathname === '/api/admin/migrate-to-tables' && request.method === 'POST') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);

      const row = await env.DB.prepare('SELECT data FROM site_data WHERE id = ?').bind('main').first();
      if (!row) return json({ error: 'Tidak ada data lama (site_data) untuk dimigrasikan.' }, 404, env, request);

      let oldData;
      try { oldData = JSON.parse(row.data); } catch (e) {
        return json({ error: 'Data lama di site_data bukan JSON yang valid.' }, 500, env, request);
      }

      const stmts = buildDecomposeStatements(env, oldData);
      if (stmts.length > 0) {
        await env.DB.batch(stmts);
      }

      // Migrasikan juga beritaComments lama (kalau ada) -- SEKALI SAJA di
      // sini, karena ini satu-satunya tempat field itu boleh diproses dari
      // sumber JSON lama (PUT /api/data biasa sengaja mengabaikannya).
      if (oldData.beritaComments && typeof oldData.beritaComments === 'object') {
        const commentStmts = [];
        for (const [beritaId, comments] of Object.entries(oldData.beritaComments)) {
          if (!Array.isArray(comments)) continue;
          for (const c of comments) {
            commentStmts.push(
              env.DB.prepare('INSERT INTO berita_comments (berita_id, name, comment, created_at) VALUES (?, ?, ?, ?)')
                .bind(beritaId, c.name || '', c.comment || '', c.created_at || Date.now())
            );
          }
        }
        if (commentStmts.length > 0) await env.DB.batch(commentStmts);
      }

      const verify = await assembleSiteData(env);
      return json({
        ok: true,
        message: 'Migrasi selesai. Periksa hasil di bawah, lalu bandingkan dengan backup JSON Anda sebelum menghapus tabel site_data lama.',
        counts: {
          guru: verify.guru.length,
          prestasi: verify.prestasi.length,
          program: verify.program.length,
          ekskul: verify.ekskul.length,
          berita: verify.berita.length,
          agenda: verify.agenda.length,
          galeri: verify.galeri.length,
          testimoni: verify.testimoni.length,
          faq: verify.faq.length,
          customSections: verify.customSections.length,
          heroImages: verify.hero.images.length,
        },
      }, 200, env, request);
    }

    // ---------------------------------------------------------------
    // File statis + header keamanan
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
