/**
 * Worker API untuk situs SDN 01 Papahan.
 *
 * =========================================================================
 * Konten situs disimpan per-tabel di D1 (bukan satu blob JSON raksasa),
 * supaya tidak kena batas "D1_ERROR: string or blob too big: SQLITE_TOOBIG".
 *
 * PENTING: bentuk data yang dikirim/diterima oleh GET dan PUT /api/data
 * tetap satu objek JSON besar dari sudut pandang admin.html maupun situs
 * publik — keduanya tetap bekerja dengan objek DB yang sama persis.
 * Yang beda murni cara Worker ini menyimpannya di D1: bukan satu kolom
 * JSON raksasa, tapi banyak baris kecil per section/item.
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
 * =========================================================================
 */

import { buildPushHTTPRequest } from '@pushforge/builder';

const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;       // 15 menit
const IP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;   // 10 menit
const IP_RATE_LIMIT_MAX = 20;                     // gagal login per-IP lintas username
const LOGIN_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

// Rate limit untuk komentar publik (anti-spam). Dihitung per-IP, lintas
// artikel, dalam jendela waktu yang lebih pendek karena komentar tidak
// butuh password salah untuk disalahgunakan -- volume saja sudah masalah.
const COMMENT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 menit
const COMMENT_RATE_LIMIT_MAX = 5;                    // maks 5 komentar / IP / 10 menit
const COMMENT_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari (cukup untuk anti-spam)

// Rate limit untuk chatbot AI publik (lihat POST /api/chat). Jendela lebih
// longgar dari komentar karena percakapan wajar bisa berupa banyak pesan
// pendek bolak-balik dalam waktu singkat -- tapi tetap dibatasi supaya
// endpoint publik ini (yang memanggil model AI, ada biaya komputasinya)
// tidak bisa dibanjiri/diskrip orang iseng.
const CHAT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 menit
const CHAT_RATE_LIMIT_MAX = 15;                   // maks 15 pesan / IP / 10 menit
const CHAT_LOG_RETENTION_MS = 3 * 24 * 60 * 60 * 1000; // 3 hari (murni log teknis)
const CHAT_MESSAGE_MAX_LEN = 500;      // batas panjang 1 pesan pengunjung
const CHAT_HISTORY_MAX_TURNS = 6;      // maks giliran riwayat yang dikirim balik ke model

// --- (BARU — Tahap 2) Web Push Notification ---
// Batas gratis Cloudflare hanya mengizinkan sejumlah subrequest (fetch
// keluar) per satu eksekusi Worker, jadi pengiriman ke banyak pelanggan
// dipecah jadi beberapa batch kecil dengan jeda singkat di antaranya --
// bukan sekali tembak semua kalau pelanggan sudah banyak. Lihat
// sendPushToAllSubscribers() di bawah.
const PUSH_SEND_BATCH_SIZE = 40;
const PUSH_SEND_BATCH_DELAY_MS = 300;

// Pengaturan chatbot yang bisa diatur admin lewat menu "Chatbot AI" (lihat
// getChatbotSettings, GET/POST /api/admin/chatbot-settings, dan POST
// /api/chat di bawah). Satu-satunya provider AI yang dipakai adalah Google
// Gemini, lewat API key gratis milik admin sendiri dari Google AI Studio
// (Cloudflare Workers AI sudah tidak dipakai lagi -- lihat catatan di
// getChatbotSettings/chatbot_settings).
const CHATBOT_DEFAULT_NAME = 'Asisten SekolahKu';
const GEMINI_MODEL = 'gemini-3.5-flash-lite'; // model Gemini gratis dengan kuota harian paling longgar, via API key pribadi dari Google AI Studio (gemini-2.5-flash-lite sudah tidak tersedia untuk API key baru per Agustus 2026)

// Key-key singleton yang disimpan di tabel site_settings (1 baris per key).
// "hero" disimpan TANPA field "images" -- itu ada di tabel hero_images sendiri.
const SETTINGS_KEYS = [
  'meta', 'hero', 'sambutan', 'profil',
  'programHeader', 'guruHeader', 'prestasiHeader', 'ekskulHeader',
  'beritaHeader', 'agendaHeader', 'galeriHeader', 'testimoniHeader',
  'kontak', 'footer', 'pageOrder', 'notification', 'pushAuto',
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

// Konversi tanggal format Indonesia "6 September 2026" (konvensi yang sama
// dipakai form admin & parser arsip sidebar di public/index.html) menjadi
// ISO 8601 "2026-09-06" untuk datePublished di JSON-LD. schema.org/Google
// mewajibkan format ISO -- mengirim teks Indonesia mentah akan ditandai
// error format tanggal di Rich Results Test / Search Console. Kalau admin
// mengetik format lain yang tidak dikenali, kembalikan null (field cukup
// DILEWATI di JSON-LD, lebih aman daripada mengirim tanggal yang salah).
const INDO_MONTHS_MAP = {
  januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
  juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12',
};
function parseIndoDateToIso(dateStr) {
  const parts = String(dateStr || '').trim().split(/\s+/);
  if (parts.length < 3) return null;
  const day = parts[parts.length - 3];
  const monthName = parts[parts.length - 2];
  const year = parts[parts.length - 1];
  const month = INDO_MONTHS_MAP[monthName.toLowerCase()];
  if (!month || !/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(day)) return null;
  return `${year}-${month}-${day.padStart(2, '0')}`;
}

// Kebalikan dari INDO_MONTHS_MAP (nomor -> nama bulan), dipakai
// formatIndoDateLong() di bawah untuk menampilkan tanggal komentar
// dengan format yang sama seperti tanggal terbit artikel (mis. "29
// Agustus 2026"), bukan format ISO/angka mentah yang kurang ramah baca.
const INDO_MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
function formatIndoDateLong(msTimestamp) {
  const n = Number(msTimestamp);
  if (!n || Number.isNaN(n)) return '';
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${INDO_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

// --------------------------------------------------------------------------
// Util: ubah teks bebas "jamOperasional" yang admin ketik lewat panel
// Kontak (mis. "Senin–Kamis 06.00–15.30, Jumat 06.00–13.00") jadi array
// openingHoursSpecification untuk JSON-LD School. Dipakai supaya jam
// operasional di structured data ikut sinkron dengan yang admin isi,
// bukan lagi angka contoh yang dikodekan langsung di HTML.
// Kalau format tidak dikenali sama sekali, kembalikan array kosong --
// field ini opsional di JSON-LD, lebih aman dilewati daripada salah.
// --------------------------------------------------------------------------
const INDO_DAY_MAP = {
  senin: 'Monday', selasa: 'Tuesday', rabu: 'Wednesday', kamis: 'Thursday',
  jumat: 'Friday', "jum'at": 'Friday', sabtu: 'Saturday', minggu: 'Sunday',
};
const INDO_DAY_ORDER = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
function expandIndoDayRange(fromKey, toKey) {
  const fromIdx = INDO_DAY_ORDER.indexOf(fromKey);
  const toIdx = INDO_DAY_ORDER.indexOf(toKey);
  if (fromIdx === -1 || toIdx === -1 || toIdx < fromIdx) return null;
  return INDO_DAY_ORDER.slice(fromIdx, toIdx + 1).map(k => INDO_DAY_MAP[k]);
}
function parseJamOperasional(text) {
  const segments = String(text || '').split(',').map(s => s.trim()).filter(Boolean);
  const results = [];
  for (const seg of segments) {
    const timeMatch = seg.match(/(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})/);
    if (!timeMatch) continue;
    const opens = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
    const closes = `${timeMatch[3].padStart(2, '0')}:${timeMatch[4]}`;
    const dayPart = seg.slice(0, timeMatch.index).trim();
    const rangeMatch = dayPart.match(/^([a-zA-Z']+)\s*[-–—]\s*([a-zA-Z']+)$/);
    let dayOfWeek = null;
    if (rangeMatch) {
      dayOfWeek = expandIndoDayRange(rangeMatch[1].toLowerCase(), rangeMatch[2].toLowerCase());
    } else if (dayPart && INDO_DAY_MAP[dayPart.toLowerCase()]) {
      dayOfWeek = [INDO_DAY_MAP[dayPart.toLowerCase()]];
    }
    if (dayOfWeek && dayOfWeek.length) {
      results.push({ '@type': 'OpeningHoursSpecification', dayOfWeek, opens, closes });
    }
  }
  return results;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// --------------------------------------------------------------------------
// Util: normalisasi nilai kolom BLOB yang baru saja dibaca balik dari D1
// (SELECT ... FROM images) supaya aman dipakai sebagai body Response.
// Known issue: D1 KADANG mengembalikan BLOB bukan sebagai ArrayBuffer asli,
// melainkan array angka biasa (mis. [137, 80, 78, ...]) atau object dengan
// key string angka (mis. {"0":137,"1":80,...}). Kalau itu langsung dioper ke
// `new Response(...)`, hasilnya bukan error -- tapi response 200 dengan
// Content-Type benar dan body kosong/rusak (tidak ada exception yang
// terlempar sama sekali). Fungsi ini menyeragamkan SEMUA bentuk yang mungkin
// jadi Uint8Array asli sebelum dipakai, apa pun bentuk yang dikembalikan D1.
// --------------------------------------------------------------------------
function normalizeBlobBytes(value) {
  if (value == null) return null;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) {
    return value.length ? Uint8Array.from(value) : null;
  }
  // Bentuk "array-like" object, mis. {"0":137,"1":80,...} -- muncul di
  // sebagian mode/versi D1 saat BLOB gagal dikembalikan sebagai binary asli.
  if (typeof value === 'object') {
    const values = Object.values(value);
    if (values.length && values.every((v) => typeof v === 'number')) {
      return Uint8Array.from(values);
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// Util: decode data-URI base64 ("data:image/jpeg;base64,....") jadi bytes +
// mime type asli, untuk disajikan lewat URL HTTP biasa (GET /berita/:slug/cover).
// Dibutuhkan karena og:image / twitter:image / JSON-LD "image" harus berupa
// URL yang bisa DI-FETCH crawler (Facebook, Twitter, Google) -- data URI
// base64 langsung TIDAK didukung oleh sebagian besar crawler tersebut.
// --------------------------------------------------------------------------
function decodeDataUri(dataUri) {
  const match = String(dataUri || '').match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  const mime = match[1];
  const base64 = match[2];
  // Batasi hanya tipe image/* -- field ini seharusnya cuma diisi lewat
  // upload foto (resizeImageFile() di admin.html selalu keluarkan
  // image/jpeg), jadi mime lain berarti data rusak/dipalsukan. Tanpa
  // pembatasan ini, Content-Type response bisa disetel bebas lewat isi
  // kolom `image` di database.
  if (!/^image\//i.test(mime)) return null;
  try {
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    return { mime, bytes };
  } catch (e) {
    return null;
  }
}

// --------------------------------------------------------------------------
// Util: ubah nilai field gambar (`article.image`, dsb) jadi URL HTTP mutlak
// yang bisa di-fetch crawler (og:image/twitter:image/JSON-LD/sitemap WAJIB
// URL, bukan data URI). Field ini bisa berisi 3 bentuk tergantung caranya
// diisi admin -- fungsi ini menangani ketiganya:
//  1. data:...;base64,...   -> foto lama hasil upload SEBELUM ada tabel
//                               `images` terpisah,
//                               masih diproxy lewat coverProxyPath (decodeDataUri).
//  2. https://... (mutlak)  -> URL eksternal yang ditempel admin langsung
//                               (mis. link Google Drive) -> dipakai apa adanya.
//  3. /img/...    (relatif) -> foto BARU hasil upload ke tabel `images` di
//                               D1 (lihat POST /api/admin/upload-image) ->
//                               dijadikan mutlak relatif terhadap domain
//                               yang sedang diakses.
// --------------------------------------------------------------------------
function resolveImageUrl(raw, url, coverProxyPath) {
  if (!raw) return null;
  if (/^data:/i.test(raw)) {
    return coverProxyPath ? new URL(coverProxyPath, url).toString() : null;
  }
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return new URL(raw, url).toString();
  return null;
}

// --------------------------------------------------------------------------
// Util: slug URL untuk /berita/:slug (SEO). Menghasilkan string huruf
// kecil, spasi/simbol jadi tanda hubung, aman dipakai sebagai path URL.
// --------------------------------------------------------------------------
function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // buang diakritik (é -> e)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'artikel';
}

// --------------------------------------------------------------------------
// Redirect slug lama -> id artikel, supaya kalau admin mengedit "URL
// Artikel" (slug) di panel admin, tautan LAMA yang sudah terlanjur
// dibagikan/ter-index Google tidak langsung 404 -- diarahkan (301) ke
// slug barunya. Tabel dibuat sendiri saat pertama dipakai (CREATE TABLE
// IF NOT EXISTS, pola sama seperti ensureChatbotSettingsTable), jadi
// TIDAK perlu migrasi schema.sql manual di D1.
// --------------------------------------------------------------------------
async function ensureBeritaSlugRedirectsTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS berita_slug_redirects (
      old_slug TEXT PRIMARY KEY,
      berita_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`
  ).run();
}


// (kalau ada 2 judul yang menghasilkan slug sama, yang belakangan diberi
// akhiran -2, -3, dst).
function dedupeSlugs(items) {
  const seen = new Map();
  return items.map(it => {
    const base = it.slug && String(it.slug).trim() ? slugify(it.slug) : slugify(it.title);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  });
}

// --------------------------------------------------------------------------
// IndexNow — beri tahu Bing/Yandex (dan mesin pencari lain yang ikut
// protokol ini) begitu ada berita baru/diubah, supaya tidak perlu menunggu
// crawl ulang sitemap secara alami (bisa berhari-hari). Google TIDAK ikut
// protokol IndexNow secara langsung, tapi tetap menemukan artikel lewat
// sitemap.xml yang sudah otomatis dinamis (lihat renderSitemap) -- IndexNow
// ini kh khusus percepatan untuk Bing/Yandex & mesin pencari partner
// lainnya. Dibuat best-effort: gagal kirim TIDAK PERNAH menggagalkan
// penyimpanan berita admin (selalu dibungkus try/catch, tidak pernah throw).
// --------------------------------------------------------------------------
async function notifyIndexNow(env, requestUrl, slugs) {
  try {
    if (!env.INDEXNOW_KEY || !Array.isArray(slugs) || slugs.length === 0) return;
    const host = new URL(requestUrl).host;
    const keyLocation = new URL(`/${env.INDEXNOW_KEY}.txt`, requestUrl).toString();
    const urlList = slugs.map(slug => new URL('/berita/' + slug, requestUrl).toString());

    await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key: env.INDEXNOW_KEY,
        keyLocation,
        urlList,
      }),
    });
  } catch (e) {
    // Sengaja diabaikan -- lihat catatan di atas fungsi ini.
  }
}

function escapeHtmlServer(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escape khusus untuk teks di dalam blok JSON-LD <script type="application/ld+json">
// -- yang perlu dihindari cuma urutan karakter yang bisa menutup tag
// </script> lebih awal, BUKAN escaping HTML biasa (JSON-nya sendiri sudah
// valid lewat JSON.stringify).
function safeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
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
    "script-src 'self' 'unsafe-inline' https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
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

// --- Rate limit komentar publik (anti-spam), pola sama seperti login. ---
async function isCommentRateLimited(env, ip) {
  const since = Date.now() - COMMENT_RATE_LIMIT_WINDOW_MS;
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM comment_attempts WHERE ip = ? AND created_at > ?'
  ).bind(ip, since).first();
  return !!(row && row.n >= COMMENT_RATE_LIMIT_MAX);
}

async function recordCommentAttempt(env, ip) {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO comment_attempts (ip, created_at) VALUES (?, ?)'
  ).bind(ip, now).run();
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM comment_attempts WHERE created_at < ?')
      .bind(now - COMMENT_LOG_RETENTION_MS).run();
  }
}

// --- Rate limit chatbot AI publik (anti-abuse), pola sama seperti komentar. ---
async function isChatRateLimited(env, ip) {
  const since = Date.now() - CHAT_RATE_LIMIT_WINDOW_MS;
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM chat_attempts WHERE ip = ? AND created_at > ?'
  ).bind(ip, since).first();
  return !!(row && row.n >= CHAT_RATE_LIMIT_MAX);
}

async function recordChatAttempt(env, ip) {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO chat_attempts (ip, created_at) VALUES (?, ?)'
  ).bind(ip, now).run();
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM chat_attempts WHERE created_at < ?')
      .bind(now - CHAT_LOG_RETENTION_MS).run();
  }
}

// --- Susun "pengetahuan" ringkas tentang sekolah untuk chatbot AI. ---
// SENGAJA tidak memakai assembleSiteData() (itu ikut menarik semua foto
// base64 -- hero, guru, prestasi, galeri, dst -- yang beratnya bisa
// megabita dan sama sekali tidak relevan buat teks jawaban chatbot).
// Query di sini ditarget cuma kolom teks yang relevan supaya konteks yang
// dikirim ke model tetap ringkas & murah.
async function buildChatKnowledgeBase(env) {
  const settingsRes = await env.DB.prepare(
    "SELECT key, data FROM site_settings WHERE key IN ('meta','profil','kontak','hero')"
  ).all();
  const settings = {};
  for (const row of settingsRes.results) {
    try { settings[row.key] = JSON.parse(row.data); } catch (e) { /* skip korup */ }
  }
  const meta = settings.meta || {};
  const profil = settings.profil || {};
  const kontak = settings.kontak || {};
  const hero = settings.hero || {};

  const [programRes, ekskulRes, agendaRes, faqRes] = await Promise.all([
    env.DB.prepare('SELECT title, desc FROM program ORDER BY sort_order ASC').all(),
    env.DB.prepare('SELECT name, status FROM ekskul ORDER BY sort_order ASC').all(),
    env.DB.prepare('SELECT month, day, title, time, location FROM agenda ORDER BY sort_order ASC LIMIT 8').all(),
    env.DB.prepare('SELECT q, a FROM faq ORDER BY sort_order ASC').all(),
  ]);

  const lines = [];
  if (meta.schoolName) lines.push(`Nama sekolah: ${meta.schoolName}`);
  if (kontak.address) lines.push(`Alamat: ${kontak.address}`);
  if (kontak.phone) lines.push(`Telepon: ${kontak.phone}`);
  if (kontak.email) lines.push(`Email: ${kontak.email}`);
  if (kontak.npsn) lines.push(`NPSN: ${kontak.npsn}`);
  if (kontak.akreditasi) lines.push(`Akreditasi: ${kontak.akreditasi}`);
  if (kontak.jamOperasional) lines.push(`Jam operasional: ${kontak.jamOperasional}`);
  if (hero.subtitle) lines.push(`Deskripsi: ${hero.subtitle}`);
  if (profil.visi) lines.push(`Visi: ${profil.visi}`);
  if (Array.isArray(profil.misi) && profil.misi.length) lines.push(`Misi: ${profil.misi.join('; ')}`);
  if (profil.fasilitas) lines.push(`Fasilitas: ${profil.fasilitas}`);

  if (programRes.results.length) {
    lines.push('Program unggulan:');
    for (const p of programRes.results) lines.push(`- ${p.title}: ${p.desc}`);
  }
  if (ekskulRes.results.length) {
    lines.push('Ekstrakurikuler: ' + ekskulRes.results.map(e => `${e.name} (${e.status})`).join(', '));
  }
  if (agendaRes.results.length) {
    lines.push('Agenda terdekat:');
    for (const a of agendaRes.results) lines.push(`- ${a.day} ${a.month}: ${a.title} (${a.time}, ${a.location})`);
  }
  if (faqRes.results.length) {
    lines.push('Pertanyaan yang sering ditanyakan:');
    for (const f of faqRes.results) lines.push(`T: ${f.q}\nJ: ${f.a}`);
  }
  return { text: lines.join('\n'), schoolName: meta.schoolName || 'sekolah ini', kontak };
}

// =========================================================================
// PENGATURAN CHATBOT AI (menu admin "Chatbot AI") — disimpan di tabel
// singleton chatbot_settings (id=1), TERPISAH dari site_settings supaya
// gemini_api_key (rahasia) tidak pernah ikut kebaca lewat GET /api/data
// yang publik/tanpa-login. Tabel dibuat otomatis kalau belum ada (self-
// healing) supaya deploy yang sudah berjalan sebelumnya tidak perlu jalan
// SQL manual tambahan di D1 console.
// =========================================================================
async function ensureChatbotSettingsTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS chatbot_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      bot_name TEXT NOT NULL DEFAULT 'Asisten SekolahKu',
      provider TEXT NOT NULL DEFAULT 'gemini',
      gemini_api_key TEXT NOT NULL DEFAULT '',
      custom_instructions TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0
    )`
  ).run();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO chatbot_settings (id, enabled, bot_name, provider, gemini_api_key, custom_instructions, updated_at)
     VALUES (1, 1, ?, 'gemini', '', '', ?)`
  ).bind(CHATBOT_DEFAULT_NAME, Date.now()).run();
}

async function getChatbotSettings(env) {
  await ensureChatbotSettingsTable(env);
  const row = await env.DB.prepare('SELECT * FROM chatbot_settings WHERE id = 1').first();
  if (!row) {
    return {
      enabled: true,
      botName: CHATBOT_DEFAULT_NAME,
      geminiApiKey: '',
      customInstructions: '',
    };
  }
  return {
    enabled: !!row.enabled,
    botName: (row.bot_name || CHATBOT_DEFAULT_NAME).trim() || CHATBOT_DEFAULT_NAME,
    geminiApiKey: row.gemini_api_key || '',
    customInstructions: row.custom_instructions || '',
  };
}

// --- (BARU — Tahap 2) Web Push Notification -------------------------------

// Sama seperti ensureChatbotSettingsTable() -- membuat tabel sendiri kalau
// belum ada, supaya fitur tetap bekerja walau admin lupa menjalankan
// tambahan blok CREATE TABLE di schema.sql pada database yang sudah
// terlanjur jalan (lihat catatan di schema.sql).
async function ensurePushSubscriptionsTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at INTEGER NOT NULL,
      fail_count INTEGER NOT NULL DEFAULT 0
    )`
  ).run();
}

// VAPID_PRIVATE_KEY disimpan sebagai secret berbentuk STRING JSON (JWK),
// persis output `npx @pushforge/builder vapid`. Di-parse di sini, bukan
// disimpan sudah dalam bentuk objek, karena Cloudflare secret hanya bisa
// menyimpan string.
function getVapidPrivateJwk(env) {
  if (!env.VAPID_PRIVATE_KEY) {
    throw new Error('VAPID_PRIVATE_KEY belum diatur di server (wrangler secret put VAPID_PRIVATE_KEY).');
  }
  try {
    return JSON.parse(env.VAPID_PRIVATE_KEY);
  } catch (e) {
    throw new Error('VAPID_PRIVATE_KEY tersimpan tapi bukan JSON JWK yang valid.');
  }
}

// Kirim satu payload notifikasi ke SEMUA baris di push_subscriptions,
// dipecah per batch (lihat PUSH_SEND_BATCH_SIZE/DELAY_MS di atas). Baris
// yang dibalas 404/410 oleh layanan push (artinya pengunjung itu sudah
// uninstall/hapus data browser/dst) otomatis dihapus supaya tabel tidak
// menumpuk data basi selamanya.
async function sendPushToAllSubscribers(env, privateJwk, payload) {
  const rows = (await env.DB.prepare('SELECT * FROM push_subscriptions').all()).results || [];
  const contactEmail = env.VAPID_CONTACT_EMAIL || 'admin@sdn01papahan.sch.id';

  let sent = 0, failed = 0, removed = 0;
  for (let i = 0; i < rows.length; i += PUSH_SEND_BATCH_SIZE) {
    const batch = rows.slice(i, i + PUSH_SEND_BATCH_SIZE);
    await Promise.all(batch.map(async (row) => {
      try {
        const subscription = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
        const { endpoint, headers, body } = await buildPushHTTPRequest({
          privateJWK: privateJwk,
          subscription,
          message: { payload, adminContact: `mailto:${contactEmail}` },
        });
        const res = await fetch(endpoint, { method: 'POST', headers, body });
        if (res.status === 404 || res.status === 410) {
          await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(row.id).run();
          removed++;
        } else if (!res.ok) {
          failed++;
          await env.DB.prepare('UPDATE push_subscriptions SET fail_count = fail_count + 1 WHERE id = ?').bind(row.id).run();
        } else {
          sent++;
        }
      } catch (e) {
        failed++;
      }
    }));
    if (i + PUSH_SEND_BATCH_SIZE < rows.length) {
      await new Promise((resolve) => setTimeout(resolve, PUSH_SEND_BATCH_DELAY_MS));
    }
  }
  return { sent, failed, removed, total: rows.length };
}

// Baca pengaturan on/off "kirim push otomatis saat berita baru" dari
// site_settings (key 'pushAuto'). Default AKTIF (true) kalau baris belum
// pernah dibuat sama sekali -- supaya fitur langsung jalan tanpa admin
// harus membuka panel dulu, dan admin bisa menonaktifkannya kapan saja
// lewat toggle di panel "Notifikasi Push" (lihat public/admin.html).
async function isPushAutoEnabled(env) {
  const row = await env.DB.prepare('SELECT data FROM site_settings WHERE key = ?').bind('pushAuto').first();
  if (!row) return true;
  try {
    const parsed = JSON.parse(row.data);
    return parsed && parsed.enabled !== false;
  } catch (e) {
    return true;
  }
}

// Dipanggil lewat ctx.waitUntil() setelah PUT /api/data sukses menyimpan
// SATU artikel berita yang benar-benar BARU (bukan edit artikel lama) --
// lihat firstNewBerita di buildDecomposeStatements. Best-effort dan TIDAK
// PERNAH melempar error ke pemanggil (sama seperti notifyIndexNow): gagal
// kirim push tidak boleh membuat admin mengira penyimpanan beritanya gagal.
async function sendAutoPushForNewBerita(env, origin, berita) {
  try {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
    const autoEnabled = await isPushAutoEnabled(env);
    if (!autoEnabled) return;

    await ensurePushSubscriptionsTable(env);
    const countRow = await env.DB.prepare('SELECT COUNT(*) AS c FROM push_subscriptions').first();
    if (!countRow || !countRow.c) return; // tidak ada pengunjung yang subscribe, tidak perlu proses lebih jauh

    const privateJwk = getVapidPrivateJwk(env);
    const title = 'Berita Baru';
    const body = String(berita.title || '').trim().slice(0, 150) || 'Ada artikel baru di situs sekolah.';
    const link = berita.slug ? `/berita/${berita.slug}` : '/';
    await sendPushToAllSubscribers(env, privateJwk, { title, body, url: link });
  } catch (e) {
    // Diamkan -- best-effort, jangan sampai penyimpanan berita ikut gagal
    // gara-gara pengiriman notifikasi push bermasalah.
  }
}

// --- Panggil Google Gemini API (opsional -- hanya dipakai kalau admin
// memilih provider "gemini" & mengisi API key pribadinya sendiri di menu
// admin > Chatbot AI, diambil gratis dari Google AI Studio). Format
// request Gemini berbeda dari Cloudflare Workers AI: riwayat & pesan perlu
// bentuk { role, parts:[{text}] }, dan Gemini pakai role "model" untuk
// balasan asisten (bukan "assistant"). System prompt dikirim terpisah
// lewat systemInstruction, bukan sebagai pesan role "system" di contents.
async function callGeminiChat(apiKey, systemPrompt, history, message) {
  const contents = [
    ...history.map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 400, temperature: 0.4 },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  return parts.map(p => p.text || '').join('').trim();
}

// --- Generate draft berita (isi lengkap, cuplikan, tags) dari poin-poin
// singkat yang diketik admin, pakai API key Gemini yang SAMA dengan yang
// dipakai chatbot (menu admin > Chatbot AI). Dipanggil dari endpoint
// POST /api/admin/berita/generate. Hasilnya HANYA draft -- admin tetap
// wajib membaca ulang & boleh edit bebas sebelum menyimpan/posting
// (lihat openItemModal & tombol "Generate dengan AI" di admin.html).
//
// Gaya penulisan "isi lengkap" (content) mengikuti PERSIS prompt
// "PROMPT GENERATOR ISI LENGKAP BERITA — SDN 01 PAPAHAN" yang diberikan
// admin (artikel jurnalistik ringan 900-1500 kata, anti-AI-slop, tidak
// boleh mengarang fakta) -- HANYA bagian format output akhirnya yang
// disesuaikan supaya tetap keluar sebagai JSON {excerpt, content, tags},
// karena field lain di CMS (Cuplikan, Tags) tetap perlu digenerate juga
// dalam satu panggilan yang sama.
const BERITA_CONTENT_STYLE_PROMPT = `Anda adalah penulis artikel pendidikan profesional untuk website resmi SDN 01 Papahan.

Tugas Anda adalah menulis ISI LENGKAP BERITA berdasarkan judul dan informasi (poin-poin) yang diberikan admin.

Buat artikel yang informatif, aktual, humanis, SEO-friendly, natural, dan memiliki sudut pandang yang jelas. Artikel harus terasa seperti ditulis oleh guru, jurnalis pendidikan, atau redaksi website sekolah yang benar-benar memahami topik, bukan seperti artikel otomatis yang dibuat oleh AI.

GAYA PENULISAN
Gunakan gaya: profesional + edukatif + humanis + jurnalistik ringan + natural. Gunakan bahasa Indonesia yang baku tetapi tidak kaku, mengalir, mudah dipahami, nyaman dibaca melalui smartphone, memiliki variasi panjang kalimat, menggunakan paragraf pendek, tidak terlalu formal, tidak seperti makalah, tidak seperti iklan, tidak berlebihan, tidak menggunakan bahasa yang terasa dibuat-buat.

Mulai artikel dengan fenomena, persoalan, fakta, pertanyaan, atau situasi yang relevan dengan topik, bukan pembukaan generik. Hindari pembukaan seperti "Pendidikan merupakan hal yang sangat penting dalam kehidupan", "Di era yang semakin berkembang ini...", "Seiring dengan perkembangan zaman...", "Tidak dapat dipungkiri bahwa...", "Artikel ini akan membahas...". Langsung masuk ke inti persoalan.

ANTI-AI SLOP — WAJIB DITERAPKAN
AI SLOP adalah tulisan yang terlihat seperti konten AI generik: terlalu rapi, repetitif, penuh kata-kata klise, tidak memiliki sudut pandang, dan bisa ditempel ke website mana pun tanpa perubahan. Artikel WAJIB menghindari karakteristik tersebut.

JANGAN membuat artikel yang: terdengar seperti template AI; terlalu sempurna dan kaku; menggunakan pola kalimat yang sama berulang kali; setiap paragraf memiliki panjang dan struktur yang hampir sama; setiap subjudul memiliki pola pembahasan yang identik; mengulang kesimpulan yang sama dalam beberapa paragraf; menggunakan terlalu banyak kata penghubung; menggunakan terlalu banyak kalimat motivasi; penuh dengan kata sifat seperti "luar biasa", "sangat penting", "inovatif", "gemilang", dan sejenisnya; berisi banyak kalimat umum tetapi sedikit informasi; terlalu sering menyebut nama sekolah hanya untuk SEO; memasukkan keyword secara paksa; dibuat panjang hanya untuk memenuhi jumlah kata; terdengar seperti brosur atau promosi sekolah; menggunakan bahasa yang terlalu generik sehingga artikelnya bisa berlaku untuk sekolah mana pun.

HINDARI KALIMAT KLISE BERLEBIHAN seperti: "di era digital saat ini", "di zaman modern", "seiring perkembangan zaman", "tidak dapat dipungkiri", "tentunya", "tentu saja", "sangat penting", "oleh karena itu", "pada akhirnya", "dalam konteks ini", "menjadi sebuah langkah penting", "memberikan dampak positif yang signifikan", "menciptakan generasi yang unggul", "mempersiapkan generasi emas". Gunakan hanya jika benar-benar diperlukan dan jangan berulang.

BUAT TULISAN TERASA MANUSIA: gunakan variasi panjang kalimat, variasi panjang paragraf, transisi yang natural, contoh yang konkret jika datanya tersedia, observasi yang masuk akal, sudut pandang yang jelas, hubungan sebab-akibat yang logis, bahasa yang sederhana ketika tidak perlu menggunakan istilah rumit. Tidak semua paragraf harus memiliki struktur Pernyataan -> Penjelasan -> Kesimpulan. Buat alur tulisan yang lebih alami, jangan seperti hasil pengisian template.

NILAI INFORMASI
Setiap bagian artikel harus memiliki alasan untuk berada di sana. Sebelum menulis sebuah paragraf, pastikan paragraf tersebut memberikan informasi baru, menjelaskan sesuatu, memberikan perspektif, memberikan contoh, menjawab pertanyaan pembaca, atau menghubungkan pembahasan dengan konteks pendidikan. Jika sebuah paragraf hanya mengulang informasi sebelumnya, hapus. Lebih baik artikel padat dan bermakna daripada panjang tapi berisi pengulangan.

STRUKTUR ARTIKEL (field "content")
Target panjang alami untuk berita sekolah dasar (sewajarnya menyesuaikan banyaknya poin/informasi yang tersedia -- jangan dipaksakan panjang kalau bahannya sedikit). Pembukaan 2-3 paragraf yang langsung masuk ke topik: apa yang sedang terjadi, mengapa relevan, mengapa pembaca perlu memperhatikan. Untuk pembahasan, HANYA gunakan sub-bagian/subjudul bila artikel memang panjang dan kompleks -- untuk berita sekolah dasar yang ringkas, paragraf mengalir tanpa subjudul biasanya lebih pas. Penutup 2-3 paragraf berisi refleksi, kesimpulan, perspektif, atau pesan yang relevan -- JANGAN gunakan "Demikian artikel ini...", "Semoga artikel ini bermanfaat...", "Sekian dan terima kasih.", atau penutup klise lainnya. Kalau relevan, boleh menyinggung semangat SDN 01 Papahan: "Berakhlak Karimah, Alim Fakih, Mandiri dan Berprestasi" -- HANYA jika memang sesuai isi, jangan dipaksakan.

KONTEKS SDN 01 PAPAHAN
Hubungkan pembahasan dengan SDN 01 Papahan secara natural jika relevan. Jangan menyebut nama sekolah di setiap paragraf, jangan menggunakan nama sekolah sebagai keyword berlebihan. JANGAN MENGARANG FAKTA: nama guru, nama kepala sekolah, tanggal, lokasi, jumlah siswa/peserta, program sekolah, kegiatan, prestasi, fasilitas, kutipan, statistik, data penelitian, kebijakan, atau fakta khusus apa pun yang TIDAK ADA di poin-poin/instruksi yang diberikan admin. Kalimat seperti "SDN 01 Papahan telah berhasil...", "SDN 01 Papahan memiliki program...", "Menurut Kepala Sekolah...", "Berdasarkan data sekolah..." HANYA boleh dipakai kalau informasi itu memang ada di poin-poin. Kalau tidak ada fakta khusus, cukup hubungkan secara umum dengan lingkungan pendidikan SDN 01 Papahan.

KOLABORASI PENDIDIKAN
Jika sesuai dengan tema, jelaskan hubungan antara siswa, guru, orang tua, dan sekolah secara konkret dan natural (bukan sekadar slogan) -- guru sebagai pendidik/pembimbing/fasilitator/teladan, orang tua sebagai mitra sekolah, sekolah sebagai penyedia lingkungan belajar. Hanya jika relevan dengan topik, jangan dipaksakan di setiap artikel.

SEO NATURAL
Optimalkan secara alami: gunakan keyword utama & pendukung yang relevan dengan topik secara wajar, jangan keyword stuffing, jangan mengulang keyword di setiap paragraf, jangan membuat paragraf hanya untuk memasukkan keyword, jangan menyebut kata "SEO", "Google", atau "keyword" di dalam artikel. Search intent (menjawab kebutuhan pembaca) lebih penting daripada kepadatan keyword.

AKTUALITAS & AKURASI
Kalau membahas topik yang butuh info aktual (AI, teknologi, kurikulum, SPMB/PPDB, kebijakan pendidikan, dst) dan Anda tidak yakin info tersebut masih berlaku, jangan mengarang perkembangan terbaru -- tulis secara umum/aman saja. JANGAN mengarang nama, tanggal, lokasi, jumlah, program, kegiatan, prestasi, fasilitas, kutipan, statistik, data, atau kebijakan apa pun yang tidak diberikan di poin-poin.

PEMERIKSAAN INTERNAL SEBELUM MENULIS "content"
Sebelum menghasilkan teks final, cek: apakah pembukaan natural (bukan pembukaan generik)? Apakah ada kalimat klise yang bisa dihapus? Apakah ada paragraf yang mengulang informasi? Apakah panjang kalimat & paragraf bervariasi? Apakah terlalu sering memakai kata "penting" atau "oleh karena itu"? Apakah nama SDN 01 Papahan disebut berlebihan? Apakah artikel terasa seperti iklan? Apakah bisa dipakai untuk sekolah lain tanpa perubahan (kalau ya, perbaiki supaya lebih spesifik ke poin yang diberikan)? Apakah ada info yang dikarang? Jika ada yang belum baik, perbaiki dulu sebelum menghasilkan output akhir.`;

async function callGeminiGenerateBerita(apiKey, { tanggal, penulis, kategori, judul, poin, instruksi }) {
  const systemPromptParts = [
    BERITA_CONTENT_STYLE_PROMPT,
    '',
    'CATATAN KHUSUS (menggantikan bagian "HASIL AKHIR" di atas): selain field "content" yang mengikuti seluruh aturan di atas, Anda JUGA wajib membuat field "excerpt" (1-2 kalimat ringkasan untuk kartu berita, gaya sama -- natural, tidak klise, tidak dibuat-buat) dan "tags" (3-5 tag singkat dipisah koma, relevan dengan isi, huruf kecil). JANGAN mengarang fakta di excerpt/tags juga.',
    'Balas HANYA dengan JSON valid (tanpa markdown, tanpa teks lain di luar JSON), persis format ini:',
    '{"excerpt": "...", "content": "isi lengkap, paragraf dipisah dengan \\n\\n", "tags": "tag1, tag2, tag3"}',
  ];
  if (instruksi) {
    systemPromptParts.push(
      '',
      'INSTRUKSI TAMBAHAN DARI ADMIN KHUSUS UNTUK ARTIKEL INI (ikuti selama tidak menyuruh Anda mengarang fakta yang tidak ada di poin-poin, dan tidak bertentangan dengan larangan mengarang di atas):',
      instruksi
    );
  }
  const systemPrompt = systemPromptParts.join('\n');

  const userMessage = [
    `Tanggal: ${tanggal || '(tidak diisi)'}`,
    `Penulis: ${penulis || '(tidak diisi)'}`,
    `Kategori: ${kategori || '(tidak diisi)'}`,
    `Judul: ${judul || '(tidak diisi)'}`,
    'Poin-poin inti berita (satu baris = satu poin):',
    poin || '(tidak diisi)',
  ].join('\n');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.7, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  let raw = parts.map(p => p.text || '').join('').trim();
  // Jaga-jaga kalau model tetap membungkus dengan ```json ... ``` walau sudah diminta JSON murni.
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error('AI mengembalikan format tidak terduga, coba generate ulang.');
  }
  return {
    excerpt: String(parsed.excerpt || '').trim(),
    content: String(parsed.content || '').trim(),
    tags: String(parsed.tags || '').trim(),
  };
}

// =========================================================================
// ASSEMBLE — baca semua tabel, susun ulang jadi objek DB (bentuk sama
// persis seperti bentuk objek DB yang dipakai admin.html & situs publik).
// =========================================================================
async function assembleSiteData(env) {
  // Subset AMAN dari pengaturan chatbot untuk widget publik (nama bot &
  // status aktif/nonaktif saja) -- geminiApiKey & customInstructions
  // SENGAJA tidak diikutkan sama sekali karena field ini publik/tanpa-login
  // (lihat catatan besar di getChatbotSettings/chatbot_settings di schema.sql).
  let chatbotPublic = { enabled: true, botName: CHATBOT_DEFAULT_NAME };
  try {
    const cs = await getChatbotSettings(env);
    chatbotPublic = { enabled: cs.enabled, botName: cs.botName };
  } catch (e) { /* biarkan default kalau tabel belum sempat dibuat */ }

  const settingsRes = await env.DB.prepare('SELECT key, data FROM site_settings').all();
  const settings = {};
  for (const row of settingsRes.results) {
    try { settings[row.key] = JSON.parse(row.data); } catch (e) { /* skip korup */ }
  }

  const heroImagesRes = await env.DB.prepare(
    'SELECT image_data, caption FROM hero_images ORDER BY sort_order ASC'
  ).all();
  const hero = settings.hero || {};
  // Tiap foto sekarang { image, caption } (bukan lagi string URL polos)
  // supaya tiap foto carousel bisa punya alt text unik -- lihat pemakaian
  // di public/index.html (rendering) dan public/admin.html (form edit).
  hero.images = heroImagesRes.results.map(r => ({ image: r.image_data, caption: r.caption || '' }));

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
    'SELECT id, slug, image, date, author, category, title, excerpt, content, tags, updated_at FROM berita ORDER BY sort_order ASC'
  ).all();

  // beritaComments: dibaca (bukan bagian dari replace-cycle PUT) -- lihat
  // catatan besar di atas file ini. `id` diikutkan (walau tidak dipakai
  // tampilan publik) supaya panel moderasi admin bisa menargetkan hapus
  // satu komentar spesifik lewat POST /api/admin/berita-comments/delete.
  const commentsRes = await env.DB.prepare(
    'SELECT id, berita_id, name, comment, created_at, reply, reply_at FROM berita_comments ORDER BY created_at ASC'
  ).all();
  const beritaComments = {};
  for (const row of commentsRes.results) {
    if (!beritaComments[row.berita_id]) beritaComments[row.berita_id] = [];
    beritaComments[row.berita_id].push({
      id: row.id, name: row.name, comment: row.comment, created_at: row.created_at,
      reply: row.reply || '', reply_at: row.reply_at || 0,
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
    notification: settings.notification,
    pushAuto: settings.pushAuto,
    customSections,
    chatbotPublic,
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
async function buildDecomposeStatements(env, data) {
  const stmts = [];
  const now = Date.now();
  // Diisi di bawah (bagian --- berita ---) dengan slug artikel yang BARU
  // dibuat atau isinya berubah pada pemanggilan ini -- dipakai pemanggil
  // untuk memicu notifyIndexNow() setelah batch berhasil disimpan.
  const changedBeritaSlugs = [];
  // Diisi di bawah dengan pasangan {oldSlug, beritaId} setiap kali admin
  // mengganti slug artikel yang SUDAH ADA sebelumnya -- dipakai pemanggil
  // untuk menyimpan redirect (lihat ensureBeritaSlugRedirectsTable) supaya
  // tautan lama tidak langsung 404 setelah slug diganti.
  const beritaSlugRedirects = [];
  // Diisi di bawah dengan artikel berita PERTAMA yang benar-benar BARU
  // (belum punya id lama sama sekali) pada pemanggilan ini -- dipakai
  // pemanggil untuk memicu sendAutoPushForNewBerita() setelah batch
  // berhasil disimpan. Kalau admin menyimpan beberapa berita baru sekaligus
  // dalam satu klik "Simpan", HANYA yang pertama yang dikirim notifikasi
  // push otomatis (disengaja -- lihat keputusan fitur ini).
  let firstNewBerita = null;

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
  // Tiap elemen bisa berupa string URL polos (bentuk lama / kompatibilitas
  // mundur) atau objek { image, caption } (bentuk baru, lihat
  // assembleSiteData) -- tangani dua-duanya.
  if (data.hero && Array.isArray(data.hero.images)) {
    stmts.push(env.DB.prepare('DELETE FROM hero_images'));
    data.hero.images.forEach((img, i) => {
      const imageData = (img && typeof img === 'object') ? (img.image || '') : (img || '');
      const caption = (img && typeof img === 'object') ? (img.caption || '') : '';
      if (!imageData) return;
      stmts.push(
        env.DB.prepare('INSERT INTO hero_images (image_data, caption, sort_order) VALUES (?, ?, ?)')
          .bind(imageData, caption, i)
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

  // --- berita (id dipertahankan apa adanya; slug BARU untuk URL publik
  // /berita/:slug -- dipertahankan dari nilai lama kalau sudah ada, atau
  // dibuat otomatis dari judul kalau artikel baru / belum punya slug) ---
  if (Array.isArray(data.berita)) {
    // Ambil kondisi lama SEBELUM di-DELETE -- dipakai untuk memutuskan
    // apakah updated_at sebuah artikel perlu diperbarui atau dipertahankan.
    // Ini WAJIB dilakukan di sini (bukan set now() untuk semua baris),
    // karena seluruh tabel berita di-DELETE+INSERT ulang SETIAP kali admin
    // menyimpan perubahan APAPUN (termasuk section lain yang tidak
    // menyentuh berita sama sekali) -- kalau updated_at ikut di-reset semua,
    // sitemap <lastmod> jadi menunjukkan "baru diubah" untuk artikel yang
    // sebenarnya tidak diedit sama sekali, dan kehilangan gunanya buat Google.
    const oldRes = await env.DB.prepare(
      'SELECT id, slug, image, date, author, category, title, excerpt, content, tags, updated_at FROM berita'
    ).all();
    const oldById = {};
    for (const row of (oldRes.results || [])) oldById[row.id] = row;

    stmts.push(env.DB.prepare('DELETE FROM berita'));
    const slugs = dedupeSlugs(data.berita);
    data.berita.forEach((it, i) => {
      const old = it.id ? oldById[it.id] : null;
      const slugChanged = !!(old && old.slug && old.slug !== slugs[i]);
      const changed = !old
        || slugChanged
        || old.image !== (it.image || '')
        || old.date !== (it.date || '')
        || old.author !== (it.author || '')
        || old.category !== (it.category || '')
        || old.title !== (it.title || '')
        || old.excerpt !== (it.excerpt || '')
        || old.content !== (it.content || '')
        || old.tags !== (it.tags || '');
      const updatedAt = changed ? now : (old.updated_at || now);
      if (changed) changedBeritaSlugs.push(slugs[i]);
      // Artikel benar-benar baru (tidak ada di data lama sama sekali) --
      // catat yang PERTAMA ditemukan untuk notifikasi push otomatis.
      if (!old && !firstNewBerita) {
        firstNewBerita = { slug: slugs[i], title: it.title || '' };
      }
      // Slug artikel diganti (mis. admin perbaiki typo di URL) -- simpan
      // pemetaan slug LAMA -> id artikel ini, supaya GET /berita/<slug-lama>
      // bisa di-301-redirect ke slug baru alih-alih 404 (lihat
      // renderBeritaArticlePage & ensureBeritaSlugRedirectsTable).
      if (slugChanged) {
        beritaSlugRedirects.push({ oldSlug: old.slug, beritaId: it.id });
      }
      stmts.push(
        env.DB.prepare(
          'INSERT INTO berita (id, slug, image, date, author, category, title, excerpt, content, tags, updated_at, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(it.id, slugs[i], it.image || '', it.date || '', it.author || '', it.category || '', it.title || '', it.excerpt || '', it.content || '', it.tags || '', updatedAt, i)
      );
    });

    // Bersihkan komentar yatim: kalau sebuah artikel dihapus admin, hapus
    // juga komentar publik yang menempel padanya (berita_id yang sudah
    // tidak ada lagi di array berita yang baru dikirim). Komentar untuk
    // artikel yang MASIH ada tidak disentuh sama sekali.
    const keepIds = data.berita.map(it => it.id).filter(Boolean);
    if (keepIds.length > 0) {
      const placeholders = keepIds.map(() => '?').join(', ');
      stmts.push(
        env.DB.prepare(`DELETE FROM berita_comments WHERE berita_id NOT IN (${placeholders})`).bind(...keepIds)
      );
    } else {
      stmts.push(env.DB.prepare('DELETE FROM berita_comments'));
    }
  }
  // CATATAN: isi data.beritaComments (kalau ada di payload) SENGAJA TIDAK
  // diproses/ditimpa di sini -- lihat catatan besar di atas file ini.

  // --- berita_slug_redirects (hanya kalau ada slug yang benar-benar
  // berganti pada penyimpanan ini) -- CREATE TABLE IF NOT EXISTS dulu di
  // sini (bukan cuma di ensureBeritaSlugRedirectsTable yang dipanggil GET
  // /berita/:slug) supaya statement INSERT-nya tidak gagal kalau ini
  // penyimpanan PERTAMA yang pernah mengganti slug sejak fitur ini ada. ---
  if (beritaSlugRedirects.length > 0) {
    stmts.push(env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS berita_slug_redirects (
        old_slug TEXT PRIMARY KEY,
        berita_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`
    ));
    for (const r of beritaSlugRedirects) {
      stmts.push(env.DB.prepare(
        `INSERT INTO berita_slug_redirects (old_slug, berita_id, created_at) VALUES (?, ?, ?)
         ON CONFLICT(old_slug) DO UPDATE SET berita_id = excluded.berita_id, created_at = excluded.created_at`
      ).bind(r.oldSlug, r.beritaId, now));
    }
  }

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

  return { stmts, changedBeritaSlugs, firstNewBerita };
}

// ============================================================================
// GET /berita/:slug — render HTML lengkap di server (bukan lewat JS),
// dengan meta tag, Open Graph, dan JSON-LD Article supaya bisa terindeks
// Google / dipahami AI crawler tanpa menjalankan JavaScript sama sekali.
// ============================================================================
async function renderBeritaArticlePage(env, slug, url, request) {
  const article = await env.DB.prepare(
    'SELECT id, slug, image, date, author, category, title, excerpt, content, tags, updated_at FROM berita WHERE slug = ?'
  ).bind(slug).first();

  const metaRow = await env.DB.prepare('SELECT data FROM site_settings WHERE key = ?').bind('meta').first();
  let meta = {};
  try { meta = metaRow ? JSON.parse(metaRow.data) : {}; } catch (e) { meta = {}; }
  const schoolName = meta.schoolName || 'SDN 01 Papahan';

  if (!article) {
    // Slug tidak ketemu di tabel berita -- sebelum langsung 404, cek dulu
    // apakah ini slug LAMA yang pernah dipakai artikel ini sebelum admin
    // menggantinya (lihat beritaSlugRedirects di buildDecomposeStatements).
    // Kalau iya, 301 ke slug barunya supaya tautan lama yang sudah
    // dibagikan/ter-index Google tidak mati begitu saja.
    try {
      await ensureBeritaSlugRedirectsTable(env);
      const redirect = await env.DB.prepare(
        'SELECT berita_id FROM berita_slug_redirects WHERE old_slug = ?'
      ).bind(slug).first();
      if (redirect) {
        const target = await env.DB.prepare('SELECT slug FROM berita WHERE id = ?').bind(redirect.berita_id).first();
        if (target && target.slug) {
          return Response.redirect(new URL('/berita/' + target.slug, url).toString(), 301);
        }
      }
    } catch (e) { /* tabel belum ada / gagal baca -- lanjut ke 404 biasa di bawah */ }

    return new Response(render404Html(schoolName, url), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Ambil beberapa artikel lain (untuk navigasi "baca juga") & komentar
  // (ditampilkan statis, read-only -- mengirim komentar baru tetap lewat
  // versi interaktif #berita/<id> di beranda, yang butuh JavaScript).
  const othersRes = await env.DB.prepare(
    'SELECT slug, title FROM berita WHERE slug != ? ORDER BY sort_order ASC LIMIT 4'
  ).bind(slug).all();
  const commentsRes = await env.DB.prepare(
    'SELECT name, comment, created_at, reply, reply_at FROM berita_comments WHERE berita_id = ? ORDER BY created_at ASC'
  ).bind(article.id).all();

  const canonicalUrl = new URL('/berita/' + article.slug, url).toString();
  const homeUrl = new URL('/', url).toString();
  const pageTitle = `${article.title} - ${schoolName}`;
  // Foto sampul (kalau ada) disajikan lewat URL HTTP biasa untuk
  // og:image/twitter:image/JSON-LD "image" (wajib URL yang bisa di-fetch
  // crawler, bukan data URI base64 langsung).
  // Ada 2 kemungkinan sumber, tergantung cara admin mengisinya:
  //  1. Upload lewat file picker -> tersimpan sebagai data:...;base64,...
  //     -> WAJIB diproxy lewat /berita/:slug/cover (decodeDataUri).
  //  2. Admin tempel URL gambar eksternal langsung (mis. link Google
  //     Drive yang sudah dikonversi) -> field `image` SUDAH berupa URL
  //     valid -> pakai LANGSUNG, jangan diproxy, karena /cover hanya bisa
  //     mendekode data URI dan akan mengembalikan 404 untuk kasus ini
  //     (sempat jadi bug: og:image/JSON-LD image/sitemap menunjuk ke URL
  //     yang 404 walau foto tampil normal di kartu/detail berita SPA).
  const coverImageUrl = resolveImageUrl(article.image, url, '/berita/' + article.slug + '/cover');
  // Pakai Array.from (bukan .slice string biasa) supaya tidak memotong
  // di tengah karakter emoji/simbol 2-code-unit (mis. hasilnya jadi "�").
  const rawDescription = article.excerpt || String(article.content || '');
  const description = Array.from(rawDescription).slice(0, 160).join('');
  const paragraphs = String(article.content || article.excerpt || '')
    .split(/\n\s*\n/)
    .map(p => `<p>${escapeHtmlServer(p.trim())}</p>`)
    .join('\n');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.excerpt || undefined,
    datePublished: parseIndoDateToIso(article.date) || undefined,
    dateModified: article.updated_at ? new Date(article.updated_at).toISOString() : (parseIndoDateToIso(article.date) || undefined),
    image: coverImageUrl || undefined,
    author: { '@type': 'Person', name: article.author || 'Admin' },
    publisher: { '@type': 'Organization', name: schoolName },
    mainEntityOfPage: canonicalUrl,
  };

  const otherLinks = (othersRes.results || []).map(o =>
    `<li><a href="/berita/${escapeHtmlServer(o.slug)}" class="text-primary hover:underline">${escapeHtmlServer(o.title)}</a></li>`
  ).join('\n');

  // Avatar bulat berisi huruf pertama nama, dan seluruh markup di bawah ini
  // SENGAJA ditulis pakai class Tailwind yang PERSIS SAMA dengan
  // renderBeritaComments() di public/index.html (SPA) -- bukan CSS custom
  // sendiri lagi -- supaya halaman statis ini (yang paling sering dilihat
  // pengunjung nyata lewat link yang dibagikan) betul-betul konsisten
  // dengan tampilan versi interaktifnya. Ini aman untuk SEO: mesin pencari
  // & bot (Google/WhatsApp/Facebook) membaca TEKS HTML mentahnya, bukan
  // hasil render CSS -- jadi pakai class/stylesheet apa pun tidak pernah
  // memengaruhi keterbacaan konten oleh bot.
  const commentAvatarLetter = (name) => escapeHtmlServer(String(name || '?').trim().charAt(0).toUpperCase() || '?');
  const commentCount = (commentsRes.results || []).length;
  const commentsHtml = commentCount
    ? (commentsRes.results || []).map(c => `
        <div class="flex gap-3">
            <div class="w-10 h-10 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">${commentAvatarLetter(c.name)}</div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <p class="font-semibold text-slateDark text-sm">${escapeHtmlServer(c.name)}</p>
                    <span class="text-xs text-slateMuted">${escapeHtmlServer(formatIndoDateLong(c.created_at))}</span>
                </div>
                <p class="text-sm text-slateMuted mt-1 whitespace-pre-line">${escapeHtmlServer(c.comment)}</p>
                ${c.reply ? `
                <div class="mt-2 ml-1 pl-3 py-2 border-l-2 border-primary bg-primary/5 rounded-r-lg">
                    <p class="text-xs font-bold text-primary">Balasan ${escapeHtmlServer(schoolName)}</p>
                    <p class="text-sm text-slateDark mt-0.5 whitespace-pre-line">${escapeHtmlServer(c.reply)}</p>
                </div>` : ''}
            </div>
        </div>`).join('\n')
    : '<p class="text-sm text-slateMuted" id="comment-empty-msg">Belum ada komentar. Jadilah yang pertama berkomentar!</p>';

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtmlServer(pageTitle)}</title>
<meta name="description" content="${escapeHtmlServer(description)}">
<link rel="canonical" href="${escapeHtmlServer(canonicalUrl)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtmlServer(article.title)}">
<meta property="og:description" content="${escapeHtmlServer(description)}">
<meta property="og:url" content="${escapeHtmlServer(canonicalUrl)}">
<meta property="og:site_name" content="${escapeHtmlServer(schoolName)}">
${coverImageUrl ? `<meta property="og:image" content="${escapeHtmlServer(coverImageUrl)}">` : ''}
<meta name="twitter:card" content="${coverImageUrl ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${escapeHtmlServer(article.title)}">
<meta name="twitter:description" content="${escapeHtmlServer(description)}">
${coverImageUrl ? `<meta name="twitter:image" content="${escapeHtmlServer(coverImageUrl)}">` : ''}<script type="application/ld+json">${safeJsonLd(jsonLd)}</script>
<!-- Font & Tailwind CSS SAMA PERSIS dengan public/index.html (SPA) -- supaya
     halaman statis ini (yang paling sering dilihat pengunjung nyata lewat
     link yang dibagikan di WhatsApp/Facebook) konsisten secara visual
     dengan versi interaktifnya. Ini TIDAK memengaruhi SEO sama sekali:
     Google/WhatsApp/Facebook membaca teks HTML mentah di bawah, bukan
     hasil render CSS -- gagal/lambat memuat stylesheet tidak pernah
     menyembunyikan konten dari bot, cuma tampilannya jadi kurang rapi. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/tailwind.css">
<style>
  body{font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:760px;margin:0 auto;padding:24px 20px 64px;color:#1e293b;line-height:1.7;background:#f8fafc}
  a{color:#2563eb}
  header{margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid #e2e8f0}
  header a{font-weight:700;text-decoration:none;color:#1e293b;font-size:1.05rem}
  .category{display:inline-block;background:#eff6ff;color:#2563eb;font-size:.75rem;font-weight:600;padding:4px 10px;border-radius:999px;margin-bottom:12px}
  h1{font-size:1.65rem;line-height:1.3;margin:0 0 10px}
  .byline{color:#64748b;font-size:.85rem;margin-bottom:24px}
  .content p{margin:0 0 16px;text-align:justify;text-justify:inter-word}
  .cover-img{width:100%;max-height:420px;object-fit:cover;border-radius:12px;margin-bottom:20px;background:#f1f5f9}
  .back-link{display:inline-block;margin:32px 0 8px;font-size:.9rem}
  .others{margin-top:40px;padding-top:24px;border-top:1px solid #e2e8f0}
  .others h2{font-size:1.05rem;margin-bottom:10px}
  .others ul{padding-left:20px;margin:0}
  .others li{margin-bottom:6px}
  .share-row{margin-top:24px;padding-top:20px;border-top:1px solid #f1f5f9;display:flex;align-items:center;flex-wrap:wrap;gap:8px}
  .share-label{font-size:.85rem;color:#64748b;font-weight:600;margin-right:2px}
  .share-btn{font:inherit;font-size:.82rem;font-weight:600;color:#334155;background:#f1f5f9;border:1px solid #e2e8f0;padding:7px 14px;border-radius:999px;cursor:pointer;text-decoration:none;display:inline-block}
  .share-btn:hover{background:#e2e8f0}
  .cf-status{font-size:.82rem;margin:8px 0 0}
  .cf-status.cf-error{color:#dc2626}
  .cf-status.cf-success{color:#059669}
</style>
</head>
<body>
<header><a href="${escapeHtmlServer(homeUrl)}">&larr; ${escapeHtmlServer(schoolName)}</a></header>
<article>
  ${article.category ? `<span class="category">${escapeHtmlServer(article.category)}</span>` : ''}
  <h1>${escapeHtmlServer(article.title)}</h1>
  <p class="byline">${escapeHtmlServer(article.date)}${article.author ? ' &middot; ' + escapeHtmlServer(article.author) : ''}</p>
  ${coverImageUrl ? `<img class="cover-img" src="${escapeHtmlServer(coverImageUrl)}" alt="${escapeHtmlServer(article.title)}" width="1200" height="630">` : ''}
  <div class="content">${paragraphs}</div>
  <div class="share-row">
    <span class="share-label">Bagikan:</span>
    <a class="share-btn" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${encodeURIComponent(article.title + ' ' + canonicalUrl)}">WhatsApp</a>
    <a class="share-btn" target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonicalUrl)}">Facebook</a>
    <a class="share-btn" target="_blank" rel="noopener noreferrer" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(canonicalUrl)}">X</a>
    <button type="button" id="share-copy-btn" class="share-btn" data-url="${escapeHtmlServer(canonicalUrl)}">Salin Tautan</button>
  </div>
</article>
${otherLinks ? `<div class="others"><h2>Baca juga</h2><ul>${otherLinks}</ul></div>` : ''}
<div class="comments bg-white border border-borderLight rounded-2xl shadow-soft p-6 sm:p-8">
  <div class="flex items-center gap-2 mb-6 flex-wrap">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 text-primary"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    <h3 class="font-bold text-slateDark" id="comment-count">${commentCount} Komentar</h3>
    <span class="text-sm text-slateMuted">Bergabunglah dalam diskusi</span>
  </div>
  <div class="space-y-5 mb-2" id="comment-list">
  ${commentsHtml}
  </div>
  <div class="border-t border-borderLight pt-6 mt-6">
    <h4 class="font-semibold text-slateDark mb-4 flex items-center gap-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
        Tinggalkan Komentar
    </h4>
    <form id="comment-form" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input type="text" id="cf-name" placeholder="Nama Lengkap *" maxlength="100" required class="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
            <input type="email" id="cf-email" placeholder="Email *" required class="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
        </div>
        <textarea id="cf-comment" rows="4" placeholder="Tulis komentar Anda... *" maxlength="2000" required class="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"></textarea>
        <button type="submit" class="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-slateDark text-white text-sm font-semibold hover:bg-slate-800 transition-colors shadow-soft disabled:opacity-60 disabled:cursor-not-allowed">
            Kirim Komentar
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
        </button>
        <p id="cf-status" class="cf-status"></p>
    </form>
  </div>
</div>
<p class="back-link"><a href="${escapeHtmlServer(homeUrl)}">&larr; Kembali ke beranda</a></p>
<script>
// Tombol Bagikan (WhatsApp/Facebook/X) di atas sengaja pakai <a href="..."> BIASA
// (bukan JS) -- jadi tetap berfungsi walau JS gagal/diblokir, dan URL yang
// dibagikan SUDAH BENAR dengan sendirinya karena halaman ini SENDIRI memang
// /berita/<slug> (bukan lagi perlu diarahkan ke beranda dulu seperti versi
// sebelumnya). Hanya tombol "Salin Tautan" yang butuh sedikit JS di bawah.
//
// Form komentar progresif: HALAMAN INI TETAP HTML MURNI TANPA JS untuk bot
// crawler (Google/WhatsApp/dst -- mereka tidak menjalankan script apa pun,
// jadi tetap melihat isi & komentar apa adanya di atas). Script ini hanya
// menambah kemampuan KIRIM komentar untuk pengunjung manusia yang mendarat
// langsung di halaman statis ini (mis. lewat refresh atau hasil pencarian),
// tanpa perlu memuat seluruh aplikasi SPA (index.html) di beranda.
(function () {
  var copyBtn = document.getElementById('share-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var url = copyBtn.getAttribute('data-url');
      var done = function () {
        var original = copyBtn.textContent;
        copyBtn.textContent = 'Tersalin!';
        setTimeout(function () { copyBtn.textContent = original; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(function () {
          window.prompt('Salin tautan ini secara manual:', url);
        });
      } else {
        window.prompt('Salin tautan ini secara manual:', url);
      }
    });
  }

  var form = document.getElementById('comment-form');
  if (!form) return;
  var BERITA_ID = ${JSON.stringify(article.id)};

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var nameEl = document.getElementById('cf-name');
    var emailEl = document.getElementById('cf-email');
    var commentEl = document.getElementById('cf-comment');
    var statusEl = document.getElementById('cf-status');
    var btn = form.querySelector('button');
    var name = nameEl.value.trim();
    var email = emailEl ? emailEl.value.trim() : '';
    var comment = commentEl.value.trim();

    // Catatan: email HANYA divalidasi di tampilan (biar formnya terasa
    // lengkap/profesional, konsisten dgn form di beranda/SPA), TIDAK
    // pernah dikirim ke server -- endpoint /api/public/berita/*/comments
    // memang cuma menyimpan name & comment (lihat migrateDB/schema),
    // sama seperti submitBeritaComment() di public/index.html.
    if (!name || !email || !comment) {
      statusEl.textContent = 'Nama, email, dan komentar wajib diisi.';
      statusEl.className = 'cf-status cf-error';
      return;
    }

    btn.disabled = true;
    statusEl.textContent = 'Mengirim...';
    statusEl.className = 'cf-status';

    fetch('/api/public/berita/' + encodeURIComponent(BERITA_ID) + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, comment: comment })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, data: data };
      });
    }).then(function (result) {
      btn.disabled = false;
      if (!result.ok) {
        statusEl.textContent = (result.data && result.data.error) || 'Gagal mengirim komentar.';
        statusEl.className = 'cf-status cf-error';
        return;
      }
      var list = document.getElementById('comment-list');
      var empty = document.getElementById('comment-empty-msg');
      if (empty) empty.remove();

      var item = document.createElement('div');
      item.className = 'flex gap-3';

      var avatar = document.createElement('div');
      avatar.className = 'w-10 h-10 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm';
      avatar.textContent = (name.charAt(0) || '?').toUpperCase();

      var col = document.createElement('div');
      col.className = 'flex-1 min-w-0';

      var pHead = document.createElement('div');
      pHead.className = 'flex items-center gap-2 flex-wrap';
      var spName = document.createElement('p');
      spName.className = 'font-semibold text-slateDark text-sm';
      spName.textContent = name;
      var spDate = document.createElement('span');
      spDate.className = 'text-xs text-slateMuted';
      spDate.textContent = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      pHead.appendChild(spName);
      pHead.appendChild(spDate);

      var pBody = document.createElement('p');
      pBody.className = 'text-sm text-slateMuted mt-1 whitespace-pre-line';
      pBody.textContent = comment;

      col.appendChild(pHead);
      col.appendChild(pBody);
      item.appendChild(avatar);
      item.appendChild(col);
      list.appendChild(item);

      var countEl = document.getElementById('comment-count');
      if (countEl) countEl.textContent = list.children.length + ' Komentar';
      form.reset();
      statusEl.textContent = 'Komentar berhasil dikirim. Terima kasih!';
      statusEl.className = 'cf-status cf-success';
    }).catch(function () {
      btn.disabled = false;
      statusEl.textContent = 'Tidak bisa menghubungi server, coba lagi.';
      statusEl.className = 'cf-status cf-error';
    });
  });
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

// ============================================================================
// GET beranda ("/", "/index.html") — beranda TETAP SPA (public/index.html
// dikirim apa adanya untuk isi/JS-nya), TAPI blok <head> SEO (title, meta
// description, canonical, og:*, JSON-LD School) diganti server-side di sini
// dulu, dari data TERKINI di site_settings (meta/kontak/footer) -- supaya
// crawler yang tidak menjalankan JavaScript (WhatsApp/Facebook/Telegram/X
// link preview, sebagian bot AI) melihat info sesuai isi terbaru panel
// admin, bukan teks contoh yang dikodekan langsung di public/index.html.
// Mencari blok lewat marker <!-- SEO:START --> ... <!-- SEO:END --> (lihat
// public/index.html) -- kalau markernya tidak ketemu (mis. file diedit dan
// markernya sengaja/tidak sengaja terhapus), HTML asli dikirim apa adanya
// tanpa injeksi apa pun (fail-safe, bukan fail-error).
// ============================================================================
async function renderHomePage(env, url, request) {
  // PENTING: JANGAN teruskan `request` asli apa adanya ke env.ASSETS.fetch --
  // kalau browser mengirim header kondisional (If-None-Match/If-Modified-Since)
  // dari kunjungan sebelumnya, Cloudflare bisa balas 304 berdasarkan ETag FILE
  // STATIS (yang tidak pernah berubah), padahal isi yang akhirnya dikirim ke
  // browser SEHARUSNYA tetap disuntik data terbaru dari database setiap kali.
  // Kalau itu dibiarkan, `assetResponse.ok` jadi false (304 != 2xx) dan
  // request tersebut lolos TANPA suntikan SEO sama sekali. Jadi di sini kita
  // buat request baru bersih (GET, tanpa header kondisional) khusus untuk
  // mengambil template HTML mentahnya.
  const assetRequest = new Request(url.toString(), { method: 'GET' });
  const assetResponse = await env.ASSETS.fetch(assetRequest);
  if (!assetResponse.ok) return assetResponse;

  const html = await assetResponse.text();
  const startMarker = '<!-- SEO:START';
  const endMarker = '<!-- SEO:END';
  const startIdx = html.indexOf(startMarker);
  const endIdxRaw = html.indexOf(endMarker);
  if (startIdx === -1 || endIdxRaw === -1 || endIdxRaw < startIdx) {
    // Marker tidak ketemu -- kirim apa adanya, jangan pernah pecah beranda
    // gara-gara injeksi SEO gagal.
    return new Response(html, {
      status: assetResponse.status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  // Ikut sertakan sampai akhir baris komentar SEO:END (cari "-->").
  const endCommentClose = html.indexOf('-->', endIdxRaw);
  const endIdx = endCommentClose === -1 ? endIdxRaw : endCommentClose + 3;

  let meta = {};
  let kontak = {};
  try {
    const metaRow = await env.DB.prepare('SELECT data FROM site_settings WHERE key = ?').bind('meta').first();
    meta = metaRow ? JSON.parse(metaRow.data) : {};
  } catch (e) { meta = {}; }
  try {
    const kontakRow = await env.DB.prepare('SELECT data FROM site_settings WHERE key = ?').bind('kontak').first();
    kontak = kontakRow ? JSON.parse(kontakRow.data) : {};
  } catch (e) { kontak = {}; }

  const schoolName = meta.schoolName || 'SDN 01 Papahan';
  const pageTitle = meta.pageTitle || `${schoolName} - Cerdas, Berakhlak, Berprestasi`;
  // PENTING: pertahankan frasa kaya kata kunci ("profil sekolah, berita,
  // kegiatan, prestasi, ekstrakurikuler, tenaga pendidik") apa pun kondisinya
  // -- jangan diganti isinya jadi cuma alamat, karena kontak.address HAMPIR
  // SELALU terisi (bahkan di data contoh bawaan admin.html), jadi kalau
  // dibuat "salah satu atau lainnya" maka di produksi nyata malah HAMPIR
  // SELALU dapat versi pendek yang lebih SEDIKIT kata kuncinya dibanding
  // deskripsi statis asli -- itu regresi, bukan perbaikan. Di sini alamat
  // cuma DITAMBAHKAN untuk sinyal lokasi, bukan MENGGANTIKAN kata kunci.
  const descriptionRaw = `Situs resmi ${schoolName}${kontak.address ? ', ' + kontak.address : ''}. `
    + 'Informasi profil sekolah, berita, kegiatan, prestasi, ekstrakurikuler, dan tenaga pendidik.';
  // Dipotong ~160 karakter (sama seperti renderBeritaArticlePage) supaya
  // tidak kepotong acak di tengah kalimat oleh Google -- pakai Array.from
  // supaya tidak memutus di tengah karakter emoji/simbol 2-code-unit.
  const description = Array.from(descriptionRaw).slice(0, 160).join('');
  const homeUrl = new URL('/', url).toString();

  // Foto representatif untuk og:image & JSON-LD "logo"/"image" -- pakai
  // foto pertama hero carousel (kalau ada) lewat proxy /site-cover, karena
  // og:image/JSON-LD WAJIB URL yang bisa di-fetch crawler, bukan data URI
  // base64 dan idealnya bukan favicon kecil (favicon.png tetap dipakai
  // sebagai fallback kalau admin belum pernah isi foto hero apa pun).
  let heroImageRaw = null;
  try {
    const heroRow = await env.DB.prepare('SELECT image_data FROM hero_images ORDER BY sort_order ASC LIMIT 1').first();
    heroImageRaw = heroRow ? heroRow.image_data : null;
  } catch (e) { heroImageRaw = null; }
  const heroImageUrl = heroImageRaw
    ? resolveImageUrl(heroImageRaw, url, '/site-cover')
    : null;
  const representativeImageUrl = heroImageUrl || new URL('/favicon.png', url).toString();

  const openingHours = kontak.jamOperasional ? parseJamOperasional(kontak.jamOperasional) : [];

  const addressLd = {
    '@type': 'PostalAddress',
    streetAddress: kontak.address || 'Jl. Lawu, Kodokan, Papahan, Kec. Tasikmadu',
    addressLocality: 'Karanganyar',
    addressRegion: 'Jawa Tengah',
    postalCode: '57722',
    addressCountry: 'ID',
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'School',
    name: schoolName,
    alternateName: 'Sekolah Dasar Negeri 01 Papahan',
    url: homeUrl,
    logo: representativeImageUrl,
    image: representativeImageUrl,
    description,
    address: addressLd,
    telephone: kontak.phone || undefined,
    email: kontak.email || undefined,
    openingHoursSpecification: openingHours.length ? openingHours : undefined,
  };

  // Schema WebSite TERPISAH dari School di atas -- ini yang dipakai Google
  // untuk mengenali "nama situs" resmi dan menampilkannya bersih di baris
  // breadcrumb hasil pencarian (mis. "sdn01papahan.sch.id" satu baris),
  // alih-alih menampilkan URL lengkap "https://sdn01papahan.sch.id/" dobel
  // di bawahnya karena Google tidak yakin nama situsnya apa. og:site_name
  // di bawah berfungsi sama untuk preview link (WhatsApp/Facebook/dst).
  const websiteLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: schoolName,
    url: homeUrl,
  };

  const seoBlock = `<!-- SEO:START (server-rendered, lihat renderHomePage di src/index.js) -->
    <title>${escapeHtmlServer(pageTitle)}</title>
    <meta name="description" content="${escapeHtmlServer(description)}">
    <link rel="canonical" href="${escapeHtmlServer(homeUrl)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${escapeHtmlServer(schoolName)}">
    <meta property="og:title" content="${escapeHtmlServer(pageTitle)}">
    <meta property="og:description" content="${escapeHtmlServer(description)}">
    <meta property="og:url" content="${escapeHtmlServer(homeUrl)}">
    <meta property="og:image" content="${escapeHtmlServer(representativeImageUrl)}">
    <meta property="og:locale" content="id_ID">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtmlServer(pageTitle)}">
    <meta name="twitter:description" content="${escapeHtmlServer(description)}">
    <meta name="twitter:image" content="${escapeHtmlServer(representativeImageUrl)}">

    <!-- Structured Data: Schema.org WebSite (nama situs untuk breadcrumb SERP) + School -->
    <script type="application/ld+json">${safeJsonLd(websiteLd)}</script>
    <script type="application/ld+json">${safeJsonLd(jsonLd)}</script>
    <!-- SEO:END -->`;

  const newHtml = html.slice(0, startIdx) + seoBlock + html.slice(endIdx);

  // PENTING: bangun header dari NOL, JANGAN warisi header dari
  // assetResponse (Content-Length/ETag/Cache-Control milik file statis
  // ASLI) -- panjang & fingerprint body-nya sudah beda karena <head>-nya
  // baru saja diganti, dan Cloudflare biasanya men-cache aset statis
  // secara agresif (max-age panjang). Kalau header itu ikut terbawa,
  // Content-Length yang salah bisa bikin body kepotong di sebagian
  // CDN/proxy, dan Cache-Control yang salah bisa bikin perubahan dari
  // admin telat muncul (sampai cache lama itu kedaluwarsa).
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
  });
  return new Response(newHtml, { status: 200, headers });
}

// ============================================================================
// GET /site-cover — foto representatif situs (foto hero carousel pertama)
// sebagai URL HTTP biasa, dipakai untuk og:image beranda & JSON-LD
// "logo"/"image" School (lihat renderHomePage). Sama pola dengan
// GET /berita/:slug/cover.
// ============================================================================
async function renderSiteCover(env) {
  const row = await env.DB.prepare('SELECT image_data FROM hero_images ORDER BY sort_order ASC LIMIT 1').first();
  const decoded = row ? decodeDataUri(row.image_data) : null;
  if (!decoded) return new Response('Not found', { status: 404 });
  return new Response(decoded.bytes, {
    status: 200,
    headers: {
      'Content-Type': decoded.mime,
      // Cache lebih pendek dibanding /berita/:slug/cover (86400) SENGAJA --
      // yang itu stabil per-slug, tapi ini mengacu ke "foto hero PERTAMA"
      // yang urutannya bisa diubah admin kapan saja lewat drag/re-order,
      // jadi cache yang kelamaan bisa nampilin foto lama di og:image/logo.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

function render404Html(schoolName, url) {
  const homeUrl = new URL('/', url).toString();
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Artikel Tidak Ditemukan - ${escapeHtmlServer(schoolName)}</title>
<meta name="robots" content="noindex">
<style>body{font-family:sans-serif;max-width:600px;margin:80px auto;padding:0 20px;text-align:center;color:#1e293b}a{color:#4f46e5}</style>
</head>
<body>
<h1>404 - Artikel Tidak Ditemukan</h1>
<p>Artikel yang Anda cari mungkin sudah dihapus atau tautannya salah.</p>
<p><a href="${escapeHtmlServer(homeUrl)}">&larr; Kembali ke beranda</a></p>
</body>
</html>`;
}

// ============================================================================
// GET /sitemap.xml — dibangun dinamis dari isi D1 saat ini (bukan file
// statis), supaya artikel baru otomatis ikut ter-crawl tanpa perlu redeploy.
// ============================================================================
async function renderSitemap(env, url) {
  const homeUrl = new URL('/', url).toString();
  const beritaRes = await env.DB.prepare('SELECT slug, image, updated_at FROM berita ORDER BY sort_order ASC').all();

  const urls = [
    `  <url>\n    <loc>${escapeHtmlServer(homeUrl)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    ...(beritaRes.results || []).filter(r => r.slug).map(r => {
      const loc = new URL('/berita/' + r.slug, url).toString();
      // Sama seperti og:image/JSON-LD di renderBeritaArticlePage: data URI
      // hasil upload harus diproxy lewat /cover, tapi URL eksternal (link
      // gambar yang ditempel admin) dipakai langsung supaya tidak 404.
      const coverUrl = resolveImageUrl(r.image, url, '/berita/' + r.slug + '/cover');
      const imageTag = coverUrl
        ? `\n    <image:image><image:loc>${escapeHtmlServer(coverUrl)}</image:loc></image:image>`
        : '';
      const lastmodTag = r.updated_at
        ? `\n    <lastmod>${new Date(r.updated_at).toISOString()}</lastmod>`
        : '';
      return `  <url>\n    <loc>${escapeHtmlServer(loc)}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>${lastmodTag}${imageTag}\n  </url>`;
    }),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800',
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(env, request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // ---------------------------------------------------------------
    // GET /<INDEXNOW_KEY>.txt — file verifikasi wajib protokol IndexNow.
    // Isinya HARUS persis sama dengan key itu sendiri, disajikan sebagai
    // teks polos di root domain. Tanpa file ini, submit ke IndexNow API
    // akan ditolak (key tidak bisa diverifikasi).
    // ---------------------------------------------------------------
    if (env.INDEXNOW_KEY && url.pathname === `/${env.INDEXNOW_KEY}.txt` && request.method === 'GET') {
      return new Response(env.INDEXNOW_KEY, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
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
    // GET "/" & "/index.html" — beranda SPA, TAPI <head> SEO disuntik
    // server-side dari data site_settings terkini (lihat renderHomePage).
    // ---------------------------------------------------------------
    if ((url.pathname === '/' || url.pathname === '/index.html') && request.method === 'GET') {
      const resp = await renderHomePage(env, url, request);
      return withSecurityHeaders(resp);
    }

    // ---------------------------------------------------------------
    // GET /site-cover — foto representatif situs (lihat renderHomePage).
    // ---------------------------------------------------------------
    if (url.pathname === '/site-cover' && request.method === 'GET') {
      return renderSiteCover(env);
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
    // GET /berita/:slug/cover — menyajikan foto sampul artikel sebagai URL
    // gambar HTTP biasa (bukan data URI base64), supaya bisa dipakai untuk
    // og:image / twitter:image / JSON-LD "image" yang WAJIB berupa URL yang
    // bisa di-fetch langsung oleh crawler Facebook/Twitter/Google.
    // ---------------------------------------------------------------
    {
      const coverMatch = url.pathname.match(/^\/berita\/([^/]+)\/cover\/?$/);
      if (coverMatch && request.method === 'GET') {
        const slug = decodeURIComponent(coverMatch[1]);
        const row = await env.DB.prepare('SELECT image FROM berita WHERE slug = ?').bind(slug).first();
        const decoded = row ? decodeDataUri(row.image) : null;
        if (!decoded) {
          return new Response('Not found', { status: 404 });
        }
        return new Response(decoded.bytes, {
          status: 200,
          headers: {
            'Content-Type': decoded.mime,
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
    }

    // ---------------------------------------------------------------
    // GET /berita/:slug — halaman artikel SERVER-SIDE (bukan SPA), supaya
    // bisa di-crawl Google/AI tanpa menjalankan JavaScript sama sekali.
    // Ini TERPISAH dari tampilan #berita/<id> di index.html (yang tetap
    // dipakai untuk pengalaman interaktif -- komentar, share, dst -- bagi
    // pengunjung dengan JavaScript aktif).
    // ---------------------------------------------------------------
    {
      const beritaSlugMatch = url.pathname.match(/^\/berita\/([^/]+)\/?$/);
      if (beritaSlugMatch && request.method === 'GET') {
        const slug = decodeURIComponent(beritaSlugMatch[1]);
        const resp = await renderBeritaArticlePage(env, slug, url, request);
        return withSecurityHeaders(resp);
      }
    }

    // ---------------------------------------------------------------
    // GET /sitemap.xml — DINAMIS dari D1 (bukan file statis), otomatis
    // mencantumkan setiap artikel /berita/:slug yang ada saat ini.
    // ---------------------------------------------------------------
    if (url.pathname === '/sitemap.xml' && request.method === 'GET') {
      return renderSitemap(env, url);
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
        const ip = getClientIp(request);
        if (await isCommentRateLimited(env, ip)) {
          return json({ error: 'Terlalu banyak komentar dari jaringan Anda. Coba lagi dalam beberapa menit.' }, 429, env, request);
        }

        const beritaId = decodeURIComponent(commentMatch[1]);
        let body;
        try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }
        const name = String(body.name || '').trim().slice(0, 100);
        const comment = String(body.comment || '').trim().slice(0, 2000);
        if (!name || !comment) return json({ error: 'Nama dan komentar wajib diisi.' }, 400, env, request);

        const article = await env.DB.prepare('SELECT id FROM berita WHERE id = ?').bind(beritaId).first();
        if (!article) return json({ error: 'Artikel tidak ditemukan.' }, 404, env, request);

        // Catat percobaan DULU (sebelum insert) supaya tetap terhitung ke
        // limit walau nanti gagal di tengah jalan -- konsisten dengan pola
        // login (baris login_attempts dicatat untuk gagal maupun sukses).
        await recordCommentAttempt(env, ip);

        const now = Date.now();
        await env.DB.prepare(
          'INSERT INTO berita_comments (berita_id, name, comment, created_at) VALUES (?, ?, ?, ?)'
        ).bind(beritaId, name, comment, now).run();

        return json({ ok: true }, 200, env, request);
      }
    }

    // ---------------------------------------------------------------
    // POST /api/chat — chatbot AI publik (widget di beranda). Memakai
    // Google Gemini (API key gratis pribadi admin dari Google AI Studio).
    // Jawaban WAJIB berdasar konteks sekolah yang disusun
    // buildChatKnowledgeBase() saja, supaya tidak mengarang informasi
    // (jam operasional, biaya, dst). Tidak ada percakapan yang disimpan
    // ke database -- chat_attempts hanya mencatat IP+waktu untuk
    // rate-limit, bukan isi pesan.
    // ---------------------------------------------------------------
    // ---------------------------------------------------------------
    // GET /api/push/public-key (publik, tanpa login)
    // Dipanggil browser pengunjung sebelum subscribe, untuk tahu apakah
    // Web Push aktif di server ini dan apa VAPID public key-nya.
    // ---------------------------------------------------------------
    if (url.pathname === '/api/push/public-key' && request.method === 'GET') {
      const vapidPublicKey = env.VAPID_PUBLIC_KEY || '';
      return json({ enabled: !!vapidPublicKey, vapidPublicKey }, 200, env, request);
    }

    // ---------------------------------------------------------------
    // POST /api/push/subscribe (publik, tanpa login — memang untuk
    // pengunjung umum yang klik tombol lonceng "Aktifkan Notifikasi")
    // ---------------------------------------------------------------
    if (url.pathname === '/api/push/subscribe' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }
      const endpoint = String((body && body.endpoint) || '').trim();
      const keys = (body && body.keys) || {};
      const p256dh = String(keys.p256dh || '').trim();
      const auth = String(keys.auth || '').trim();
      if (!endpoint || !p256dh || !auth) {
        return json({ error: 'Data langganan push tidak lengkap.' }, 400, env, request);
      }

      await ensurePushSubscriptionsTable(env);
      const userAgent = (request.headers.get('User-Agent') || '').slice(0, 300);
      // endpoint UNIQUE -- kalau pengunjung yang sama subscribe dua kali
      // (mis. buka lewat 2 tab), baris lama cukup diperbarui, bukan dobel.
      await env.DB.prepare(
        `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, created_at, fail_count)
         VALUES (?, ?, ?, ?, ?, 0)
         ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, fail_count = 0`
      ).bind(endpoint, p256dh, auth, userAgent, Date.now()).run();

      return json({ ok: true }, 200, env, request);
    }

    // ---------------------------------------------------------------
    // POST /api/push/unsubscribe (publik, tanpa login)
    // ---------------------------------------------------------------
    if (url.pathname === '/api/push/unsubscribe' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }
      const endpoint = String((body && body.endpoint) || '').trim();
      if (!endpoint) return json({ error: 'Endpoint wajib diisi.' }, 400, env, request);

      await ensurePushSubscriptionsTable(env);
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
      return json({ ok: true }, 200, env, request);
    }

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      const ip = getClientIp(request);
      if (await isChatRateLimited(env, ip)) {
        return json({ error: 'Terlalu banyak pesan dari jaringan Anda. Coba lagi dalam beberapa menit.' }, 429, env, request);
      }

      const settings = await getChatbotSettings(env);
      if (!settings.enabled) {
        return json({ error: 'Chatbot sedang dinonaktifkan oleh admin sekolah. Silakan hubungi sekolah langsung.' }, 503, env, request);
      }
      if (!settings.geminiApiKey) {
        return json({ error: 'Chatbot belum diisi API key Google Gemini oleh admin. Silakan hubungi sekolah langsung.' }, 503, env, request);
      }

      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }
      const message = String(body.message || '').trim().slice(0, CHAT_MESSAGE_MAX_LEN);
      if (!message) return json({ error: 'Pesan tidak boleh kosong.' }, 400, env, request);

      // Riwayat singkat (opsional) supaya bot ingat konteks 1-2 giliran
      // sebelumnya -- dibatasi jumlah & panjang supaya prompt tetap kecil.
      const rawHistory = Array.isArray(body.history) ? body.history : [];
      const history = rawHistory
        .slice(-CHAT_HISTORY_MAX_TURNS)
        .map(h => ({
          role: h && h.role === 'assistant' ? 'assistant' : 'user',
          content: String((h && h.text) || '').slice(0, CHAT_MESSAGE_MAX_LEN),
        }))
        .filter(h => h.content);

      await recordChatAttempt(env, ip);

      try {
        const kb = await buildChatKnowledgeBase(env);
        const botName = settings.botName || CHATBOT_DEFAULT_NAME;
        // Arahan tambahan dari admin (opsional) DISISIPKAN di samping aturan
        // wajib bawaan di bawah -- bukan menggantikannya -- supaya bot tetap
        // tidak bisa dipaksa mengarang jawaban atau membahas topik lain,
        // apa pun instruksi tambahan yang ditulis admin.
        const personaLine = settings.customInstructions
          ? `Arahan tambahan dari admin sekolah (ikuti selama tidak bertentangan dengan aturan wajib di atas): ${settings.customInstructions}\n\n`
          : '';
        const systemPrompt =
          `Anda adalah "${botName}", asisten virtual resmi website ${kb.schoolName}. ` +
          `Jawab HANYA berdasarkan informasi sekolah di bawah ini, dengan bahasa Indonesia yang ramah, sopan, dan ringkas (maksimal 4-5 kalimat). ` +
          `Jika pertanyaan di luar informasi yang tersedia, atau menyangkut hal spesifik/pribadi (misal izin siswa, data nilai, kasus tertentu), ` +
          `jangan mengarang jawaban -- katakan dengan jujur Anda tidak punya informasinya dan arahkan untuk menghubungi sekolah langsung ` +
          `(telepon ${kb.kontak.phone || 'sekolah'}${kb.kontak.email ? ' atau email ' + kb.kontak.email : ''}). ` +
          `Jangan pernah membahas topik di luar seputar sekolah ini.\n\n` +
          personaLine +
          `=== INFORMASI SEKOLAH ===\n${kb.text}`;

        let reply = await callGeminiChat(settings.geminiApiKey, systemPrompt, history, message);

        if (!reply) reply = 'Maaf, saya belum bisa menjawab saat ini. Silakan hubungi sekolah langsung ya.';
        return json({ reply: String(reply).trim() }, 200, env, request);
      } catch (err) {
        console.error('Chat AI error:', err);
        return json({ error: 'Chatbot sedang gangguan. Silakan coba lagi sebentar lagi, atau hubungi sekolah langsung.' }, 500, env, request);
      }
    }

    // ---------------------------------------------------------------
    // GET /api/admin/chatbot-settings — baca pengaturan chatbot (perlu
    // sesi login). gemini_api_key TIDAK PERNAH dikirim balik apa adanya ke
    // browser -- hanya penanda geminiApiKeySet (sudah diisi/belum), supaya
    // admin tidak perlu menuliskan ulang API key setiap kali membuka menu
    // ini, dan supaya kunci itu tidak bisa "dicuri" balik lewat DevTools.
    // ---------------------------------------------------------------
    if (url.pathname === '/api/admin/chatbot-settings' && request.method === 'GET') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);
      const settings = await getChatbotSettings(env);
      return json({
        ok: true,
        enabled: settings.enabled,
        botName: settings.botName,
        geminiApiKeySet: !!settings.geminiApiKey,
        customInstructions: settings.customInstructions,
      }, 200, env, request);
    }

    // ---------------------------------------------------------------
    // POST /api/admin/chatbot-settings — simpan pengaturan chatbot (perlu
    // sesi login, ditolak selama akun masih wajib ganti password default,
    // pola sama seperti endpoint admin lain). Field geminiApiKey bersifat
    // OPSIONAL saat menyimpan: dikosongkan/tidak dikirim berarti "biarkan
    // kunci lama apa adanya"; isi khusus "__CLEAR__" dipakai front-end
    // untuk menghapus kunci yang tersimpan.
    // ---------------------------------------------------------------
    if (url.pathname === '/api/admin/chatbot-settings' && request.method === 'POST') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);
      if (session.force_password_change) {
        return json({ error: 'Anda wajib mengganti password terlebih dahulu sebelum mengubah pengaturan chatbot.' }, 403, env, request);
      }
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }

      const enabled = body.enabled ? 1 : 0;
      const botName = String(body.botName || '').trim().slice(0, 60) || CHATBOT_DEFAULT_NAME;
      const customInstructions = String(body.customInstructions || '').trim();

      const current = await getChatbotSettings(env);
      let geminiApiKey = current.geminiApiKey;
      if (typeof body.geminiApiKey === 'string') {
        const trimmedKey = body.geminiApiKey.trim();
        if (trimmedKey === '__CLEAR__') {
          geminiApiKey = '';
        } else if (trimmedKey) {
          geminiApiKey = trimmedKey;
        }
        // string kosong "" berarti "tidak diubah" -> tetap pakai current.geminiApiKey
      }

      if (!geminiApiKey) {
        return json({ error: 'Chatbot butuh API key Google Gemini. Isi dulu API key-nya (gratis dari Google AI Studio).' }, 400, env, request);
      }

      await ensureChatbotSettingsTable(env);
      await env.DB.prepare(
        `UPDATE chatbot_settings SET enabled = ?, bot_name = ?, provider = 'gemini', gemini_api_key = ?, custom_instructions = ?, updated_at = ? WHERE id = 1`
      ).bind(enabled, botName, geminiApiKey, customInstructions, Date.now()).run();

      return json({ ok: true }, 200, env, request);
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
    // POST /api/admin/upload-image — SATU-SATUNYA cara baru menyimpan foto.
    // Menerima data URI base64 hasil resizeImageFile() di admin.html,
    // simpan bytes-nya ke tabel `images` TERPISAH di D1 (bukan R2 --
    // sengaja begitu supaya tidak perlu provisioning layanan tambahan apa
    // pun), dan kembalikan URL PENDEK (/img/<id>) untuk disimpan di field
    // database -- BUKAN base64-nya lagi. Ini akar perbaikan masalah
    // "setiap simpan apa pun ikut mengirim ulang semua foto": sejak
    // endpoint ini dipakai, field gambar di database (berita.image,
    // guru.photo, dst) cuma berisi string URL pendek, jadi PUT /api/data
    // tidak lagi membawa data foto sama sekali.
    //
    // CATATAN MIGRASI: foto yang SUDAH TERLANJUR tersimpan sebagai base64
    // dari sebelum endpoint ini ada TIDAK otomatis berubah -- itu tetap
    // tampil normal (browser tetap bisa render data URI), dan baru pindah
    // ke tabel `images` kalau admin mengunggah ULANG foto tersebut lewat
    // form yang sama. Jadi migrasinya bertahap secara alami, bukan sekali
    // jalan.
    // ---------------------------------------------------------------
    if (url.pathname === '/api/admin/upload-image' && request.method === 'POST') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);

      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }

      const decoded = decodeDataUri(body.dataUrl);
      if (!decoded) return json({ error: 'Format gambar tidak valid.' }, 400, env, request);
      // Batas per-FOTO (beda dari batas 20MB TOTAL untuk PUT /api/data) --
      // dijaga jauh di bawah batas ukuran nilai per-baris D1 (SQLite),
      // walau resizeImageFile() di admin.html sudah menekan ukuran jauh di
      // bawah ini untuk semua preset (logo/face/banner).
      if (decoded.bytes.byteLength > 1.5 * 1024 * 1024) {
        return json({ error: 'Ukuran foto terlalu besar (maks 1.5MB setelah kompresi).' }, 413, env, request);
      }

      const id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      await env.DB.prepare(
        'INSERT INTO images (id, mime, data, created_at) VALUES (?, ?, ?, ?)'
      ).bind(id, decoded.mime, decoded.bytes, Date.now()).run();

      return json({ ok: true, url: '/img/' + id }, 200, env, request);
    }

    // ---------------------------------------------------------------
    // GET /img/:id — menyajikan foto yang tersimpan di tabel `images`.
    // Id selalu unik (timestamp + random) dan isinya tidak pernah berubah
    // setelah diunggah, jadi aman di-cache lama & "immutable" oleh browser
    // maupun Cloudflare edge cache.
    // ---------------------------------------------------------------
    if (url.pathname.startsWith('/img/') && request.method === 'GET') {
      const id = decodeURIComponent(url.pathname.slice('/img/'.length));
      if (!id) return new Response('Not found', { status: 404 });
      const row = await env.DB.prepare('SELECT mime, data FROM images WHERE id = ?').bind(id).first();
      if (!row) return new Response('Not found', { status: 404 });

      // Jangan langsung pakai row.data mentah-mentah -- normalisasi dulu,
      // karena D1 kadang mengembalikan BLOB bukan sebagai ArrayBuffer asli
      // (lihat catatan di normalizeBlobBytes di atas). Tanpa ini, kasus
      // rusak akan lolos jadi response 200 dengan body kosong/rusak, bukan
      // error yang kelihatan.
      const bytes = normalizeBlobBytes(row.data);
      if (!bytes || bytes.byteLength === 0) {
        console.error(`GET /img/${id}: gagal menormalisasi kolom BLOB (tipe diterima: ${typeof row.data}${Array.isArray(row.data) ? ', array' : ''})`);
        return new Response('Gagal memuat gambar (data rusak di database).', { status: 500 });
      }

      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': row.mime || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // ---------------------------------------------------------------
    // POST /api/admin/berita-comments/delete — moderasi: hapus SATU
    // komentar publik berdasarkan id barisnya di tabel berita_comments.
    // Tidak menyentuh tabel lain sama sekali (khususnya tidak lewat siklus
    // replace-all PUT /api/data -- lihat catatan besar di atas file ini
    // soal kenapa beritaComments diperlakukan khusus).
    // ---------------------------------------------------------------
    if (url.pathname === '/api/admin/berita-comments/delete' && request.method === 'POST') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);

      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }
      const id = Number(body.id);
      if (!id || !Number.isInteger(id)) return json({ error: 'ID komentar tidak valid.' }, 400, env, request);

      const result = await env.DB.prepare('DELETE FROM berita_comments WHERE id = ?').bind(id).run();
      if (!result.meta || result.meta.changes === 0) {
        return json({ error: 'Komentar tidak ditemukan (mungkin sudah dihapus sebelumnya).' }, 404, env, request);
      }

      return json({ ok: true }, 200, env, request);
    }

    // ---------------------------------------------------------------
    // POST /api/admin/berita/generate — bantu admin menulis draft berita
    // pakai Gemini AI, dari data + poin-poin singkat yang diketik admin.
    // Hasilnya HANYA draft (excerpt/content/tags) yang dikembalikan ke
    // form admin.html untuk dicek & diedit -- endpoint ini TIDAK menyimpan
    // apa pun ke tabel berita (penyimpanan tetap lewat PUT /api/data
    // seperti biasa saat admin klik "Simpan"/posting).
    // Pakai gemini_api_key yang SAMA dengan menu admin > Chatbot AI,
    // supaya admin tidak perlu mengisi API key dua kali.
    // ---------------------------------------------------------------
    if (url.pathname === '/api/admin/berita/generate' && request.method === 'POST') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);

      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }

      const judul = String(body.judul || '').trim().slice(0, 300);
      const poin = String(body.poin || '').trim().slice(0, 4000);
      if (!judul || !poin) {
        return json({ error: 'Judul dan poin-poin inti berita wajib diisi dulu sebelum generate.' }, 400, env, request);
      }
      const tanggal = String(body.tanggal || '').trim().slice(0, 100);
      const penulis = String(body.penulis || '').trim().slice(0, 100);
      const kategori = String(body.kategori || '').trim().slice(0, 100);
      // Instruksi tambahan opsional dari admin, khusus untuk generate ini
      // saja (tidak disimpan permanen -- lihat field 'aiInstruksi' di
      // admin.html). Dibatasi lebih pendek dari poin karena sifatnya
      // arahan gaya/fokus, bukan bahan isi berita.
      const instruksi = String(body.instruksi || '').trim().slice(0, 1000);

      const settings = await getChatbotSettings(env);
      if (!settings.geminiApiKey) {
        return json({ error: 'API key Gemini belum diisi. Isi dulu di menu Chatbot AI (memakai API key gratis dari Google AI Studio).' }, 400, env, request);
      }

      try {
        const draft = await callGeminiGenerateBerita(settings.geminiApiKey, { tanggal, penulis, kategori, judul, poin, instruksi });
        return json({ ok: true, ...draft }, 200, env, request);
      } catch (e) {
        return json({ error: 'Gagal generate berita: ' + (e.message || 'terjadi kesalahan.') }, 502, env, request);
      }
    }

    // ---------------------------------------------------------------
    // POST /api/admin/berita-comments/reply — admin membalas SATU
    // komentar publik. Balasan disimpan di kolom reply/reply_at pada
    // baris komentar yang sama (bukan baris komentar baru) -- jadi satu
    // balasan per komentar, tampil ke PUBLIK di halaman detail berita
    // (baik versi SSR /berita/:slug maupun SPA #berita/<id>) di bawah
    // komentar aslinya. Kirim reply string kosong untuk MENGHAPUS balasan
    // (mis. admin salah ketik dan ingin membatalkan).
    // ---------------------------------------------------------------
    if (url.pathname === '/api/admin/berita-comments/reply' && request.method === 'POST') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);

      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }
      const id = Number(body.id);
      if (!id || !Number.isInteger(id)) return json({ error: 'ID komentar tidak valid.' }, 400, env, request);
      const reply = String(body.reply || '').trim().slice(0, 2000);
      const replyAt = reply ? Date.now() : 0;

      const result = await env.DB.prepare(
        'UPDATE berita_comments SET reply = ?, reply_at = ? WHERE id = ?'
      ).bind(reply, replyAt, id).run();
      if (!result.meta || result.meta.changes === 0) {
        return json({ error: 'Komentar tidak ditemukan (mungkin sudah dihapus).' }, 404, env, request);
      }

      return json({ ok: true, reply, reply_at: replyAt }, 200, env, request);
    }

    // ---------------------------------------------------------------
    // PUT /api/data — SEKARANG memecah body JSON jadi banyak statement
    // kecil dan menjalankannya sebagai satu batch atomik lewat
    // env.DB.batch(). Tidak ada lagi satu kolom besar yang bisa kena
    // SQLITE_TOOBIG -- setiap baris paling besar berisi satu foto.
    // ---------------------------------------------------------------
    // ---------------------------------------------------------------
    // GET /api/admin/push/subscribers-count
    // ---------------------------------------------------------------
    if (url.pathname === '/api/admin/push/subscribers-count' && request.method === 'GET') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);

      await ensurePushSubscriptionsTable(env);
      const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM push_subscriptions').first();
      return json({
        ok: true,
        count: (row && row.c) || 0,
        vapidConfigured: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
      }, 200, env, request);
    }

    // ---------------------------------------------------------------
    // POST /api/admin/push/send
    // Admin menulis judul + isi pesan + link tujuan (opsional) lewat
    // dashboard, lalu Worker mengirim ke SEMUA baris di push_subscriptions.
    // ---------------------------------------------------------------
    if (url.pathname === '/api/admin/push/send' && request.method === 'POST') {
      const session = await getValidSession(request, env);
      if (!session) return json({ error: 'Sesi tidak valid, silakan masuk lagi.' }, 401, env, request);
      if (session.force_password_change) {
        return json({ error: 'Anda wajib mengganti password terlebih dahulu sebelum mengirim notifikasi.' }, 403, env, request);
      }
      if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
        return json({ error: 'Web Push belum dikonfigurasi di server. Lihat komentar VAPID_PUBLIC_KEY di wrangler.toml.' }, 500, env, request);
      }

      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'Payload tidak valid.' }, 400, env, request); }
      const title = String(body.title || '').trim().slice(0, 100);
      const message = String(body.message || '').trim().slice(0, 300);
      const linkRaw = String(body.link || '').trim();
      if (!title || !message) return json({ error: 'Judul dan isi pesan wajib diisi.' }, 400, env, request);
      // Hanya izinkan URL absolut http(s) atau path relatif situs sendiri.
      const link = /^(https?:\/\/|\/)/i.test(linkRaw) ? linkRaw : '/';

      await ensurePushSubscriptionsTable(env);
      let privateJwk;
      try {
        privateJwk = getVapidPrivateJwk(env);
      } catch (e) {
        return json({ error: e.message }, 500, env, request);
      }

      const result = await sendPushToAllSubscribers(env, privateJwk, { title, body: message, url: link });
      return json({ ok: true, ...result }, 200, env, request);
    }

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

      let changedBeritaSlugs = [];
      let firstNewBerita = null;
      try {
        const decomposed = await buildDecomposeStatements(env, data);
        changedBeritaSlugs = decomposed.changedBeritaSlugs;
        firstNewBerita = decomposed.firstNewBerita;
        if (decomposed.stmts.length > 0) {
          await env.DB.batch(decomposed.stmts);
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

      // Beri tahu Bing/Yandex (protokol IndexNow) untuk berita yang baru
      // dibuat/diubah -- dijalankan lewat ctx.waitUntil supaya TIDAK
      // menunda respons "tersimpan" ke admin, dan best-effort (lihat
      // notifyIndexNow: gagal kirim tidak pernah menggagalkan penyimpanan).
      if (changedBeritaSlugs.length > 0 && ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(notifyIndexNow(env, url, changedBeritaSlugs));
      }

      // Notifikasi push OTOMATIS ke pengunjung yang subscribe, khusus untuk
      // artikel berita PERTAMA yang benar-benar baru diterbitkan pada
      // penyimpanan ini (lihat sendAutoPushForNewBerita & firstNewBerita di
      // atas). Best-effort lewat ctx.waitUntil, sama seperti IndexNow --
      // tidak pernah menunda atau menggagalkan respons "tersimpan" ke admin.
      if (firstNewBerita && ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(sendAutoPushForNewBerita(env, url.origin, firstNewBerita));
      }

      return json({ ok: true, updated_at: Date.now() }, 200, env, request);
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
