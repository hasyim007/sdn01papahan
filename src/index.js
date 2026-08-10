/**
 * Worker untuk sdn01papahan.sch.id
 * - GET  /api/data          -> baca seluruh data situs (publik, tanpa auth) — TIDAK BERUBAH
 * - PUT  /api/data          -> simpan seluruh data situs (wajib X-Sync-Key) — TIDAK BERUBAH
 * - GET  /berita            -> daftar berita (SSR dari D1)
 * - GET  /berita/:slug      -> detail 1 artikel (SSR + meta OG per artikel, untuk SEO & share preview)
 * - GET  /profil /program /pengajar /prestasi /ekskul /galeri /testimoni /faq /kontak
 *                            -> masing-masing 1 halaman penuh (SSR), konten identik dengan section
 *                               yang sama di beranda (public/index.html) — beranda sendiri BELUM
 *                               diubah, tetap dilayani oleh ASSETS seperti sebelumnya.
 * - selain itu               -> diteruskan ke ASSETS (public/index.html, /admin, gambar, dst — SPA lama)
 */

import { getSiteData } from './lib/data.js';
import { layout } from './layout.js';
import { findBeritaBySlug, beritaSlug, truncateForMeta } from './lib/html.js';
import { buildBeritaListBody, buildBeritaDetailBody, beritaDetailScript } from './pages/berita.js';
import {
  buildProfilHtml, buildProgramHtml, buildPengajarHtml, buildPrestasiHtml,
  buildEkskulHtml, buildGaleriHtml, buildTestimoniHtml, buildFaqHtml, buildKontakHtml,
} from './pages/sections.js';
import { buildCustomSectionMarkup, customSectionSlug, findCustomSectionBySlug } from './pages/customSection.js';
import { buildHomeBody, HERO_CAROUSEL_SCRIPT } from './pages/home.js';

import {
  hashPassword, verifyPassword, createSession, destroySession, getSessionUser,
  sessionCookieHeader, clearSessionCookieHeader, findUserByUsername, updateUserCredentials,
} from './lib/auth.js';
import { parseAdminForm } from './lib/formParse.js';
import { adminLayout } from './pages/admin/shell.js';
import { buildLoginPage } from './pages/admin/login.js';
import { buildDashboardBody } from './pages/admin/dashboard.js';
import { SECTION_CONFIGS } from './pages/admin/fieldConfig.js';
import { renderSectionForm, applySectionForm } from './pages/admin/sectionEditor.js';
import { buildBeritaListBody as buildBeritaAdminListBody, buildBeritaFormBody } from './pages/admin/beritaAdmin.js';
import { buildCustomPagesListBody, buildCustomPageFormBody } from './pages/admin/customPagesAdmin.js';
import { buildSettingsBody } from './pages/admin/settingsAdmin.js';

const SITE_URL = 'https://sdn01papahan.sch.id'; // sesuaikan kalau domain berbeda

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Key',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(env) },
  });
}

function html(body, status, extraHeaders) {
  return new Response(body, {
    status: status || 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...(extraHeaders || {}) },
  });
}

function redirect(location, status, extraHeaders) {
  return new Response(null, { status: status || 302, headers: { Location: location, ...(extraHeaders || {}) } });
}

async function saveSiteData(env, db) {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO site_data (id, data, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
  ).bind('main', JSON.stringify(db), now).run();
}

// ID baru untuk berita/halaman custom. SENGAJA acak (timestamp+random), BUKAN sekuensial —
// data situs yang sudah ada (dimigrasi dari SPA lama) memakai id seperti "b_1754821234567_x9k2p"
// atau "cs_l3k2n1ab3x", bukan "b1"/"s1". Kalau generator ini sekuensial dari 1, id baru bisa
// bentrok dengan id lama (mis. seed data "b1") dan menimpa/mengacaukan artikel yang sudah ada.
function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function adminPage({ activeKey, title, username, bodyHtml }) {
  return html(adminLayout({ activeKey, title, username, bodyHtml }));
}

// Field "columns" perlu Number, dan tiap item "features" (daftar fitur, dipisah baris
// baru di textarea) perlu jadi array string — dua-duanya tidak bisa digeneralisasi
// oleh parseAdminForm() karena sifatnya khusus untuk halaman custom.
function normalizeCustomPageFields(parsed) {
  if (parsed.flat.columns) parsed.flat.columns = Number(parsed.flat.columns) || 3;
  parsed.items = parsed.items.map((it) => ({
    ...it,
    features: String(it.features || '').split('\n').map((f) => f.trim()).filter(Boolean),
  }));
}

// Halaman-halaman statis baku: path -> { key nav aktif, judul, builder(db) -> HTML section }
const STATIC_PAGES = {
  '/profil': { key: 'profil', title: 'Profil Sekolah', build: buildProfilHtml },
  '/program': { key: 'program', title: 'Program & Kurikulum', build: buildProgramHtml },
  '/pengajar': { key: 'pengajar', title: 'Tenaga Pendidik', build: buildPengajarHtml },
  '/prestasi': { key: 'prestasi', title: 'Prestasi Siswa', build: buildPrestasiHtml },
  '/ekskul': { key: 'ekskul', title: 'Ekstrakurikuler', build: buildEkskulHtml },
  '/galeri': { key: 'galeri', title: 'Galeri Kegiatan', build: buildGaleriHtml },
  '/testimoni': { key: 'testimoni', title: 'Kata Wali Murid', build: buildTestimoniHtml },
  '/faq': { key: 'faq', title: 'Pertanyaan Umum (FAQ)', build: buildFaqHtml },
  '/kontak': { key: 'kontak', title: 'Hubungi Kami', build: buildKontakHtml },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const cors = corsHeaders(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // ---------- API (tidak berubah) ----------
    if (path === '/api/data' && request.method === 'GET') {
      const row = await env.DB.prepare('SELECT data, updated_at FROM site_data WHERE id = ?')
        .bind('main')
        .first();
      const data = row ? row.data : '{}';
      return new Response(data, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Updated-At': row ? String(row.updated_at) : '0',
          ...cors,
        },
      });
    }

    if (path === '/api/data' && request.method === 'PUT') {
      const key = request.headers.get('X-Sync-Key') || '';
      if (!env.SYNC_KEY || key !== env.SYNC_KEY) {
        return json({ error: 'Kunci sinkronisasi salah atau belum diatur.' }, 401, env);
      }
      let bodyText;
      try {
        bodyText = await request.text();
        if (bodyText.length > 20 * 1024 * 1024) {
          return json({ error: 'Data terlalu besar (maks 20MB). Kompres gambar yang diunggah.' }, 413, env);
        }
        JSON.parse(bodyText);
      } catch (e) {
        return json({ error: 'Format data JSON tidak valid.' }, 400, env);
      }
      const now = Date.now();
      await env.DB.prepare(
        'INSERT INTO site_data (id, data, updated_at) VALUES (?, ?, ?) ' +
          'ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
      ).bind('main', bodyText, now).run();
      return json({ ok: true, updated_at: now }, 200, env);
    }

    // ---------- Beranda (SSR, rakitan semua section sesuai DB.pageOrder) ----------
    if (path === '/' && request.method === 'GET') {
      const db = await getSiteData(env);
      const body = layout({
        db,
        activeKey: 'beranda',
        title: db.meta.pageTitle || db.meta.schoolName || 'SDN 01 Papahan',
        description: (db.hero && db.hero.subtitle) || (db.footer && db.footer.desc) || '',
        canonicalPath: '/',
        bodyHtml: buildHomeBody(db),
        extraScript: HERO_CAROUSEL_SCRIPT,
      });
      return html(body);
    }

    // ---------- Halaman SSR baru ----------
    if (path === '/berita' && request.method === 'GET') {
      const db = await getSiteData(env);
      const body = layout({
        db,
        activeKey: 'berita',
        title: `Berita & Agenda — ${db.meta.schoolName || 'SDN 01 Papahan'}`,
        description: (db.beritaHeader && db.beritaHeader.subtitle) || 'Berita dan agenda terbaru sekolah.',
        canonicalPath: '/berita',
        bodyHtml: buildBeritaListBody(db),
      });
      return html(body);
    }

    if (path.startsWith('/berita/') && request.method === 'GET') {
      const slugParam = decodeURIComponent(path.slice('/berita/'.length));
      const db = await getSiteData(env);
      const article = findBeritaBySlug(db.berita, slugParam);
      if (!article) {
        return html(
          layout({
            db,
            activeKey: 'berita',
            title: 'Berita tidak ditemukan',
            canonicalPath: path,
            bodyHtml: '<div class="max-w-3xl mx-auto px-4 py-24 text-center"><h1 class="text-2xl font-bold text-slateDark mb-2">Berita tidak ditemukan</h1><p class="text-slateMuted mb-6">Artikel mungkin sudah dihapus atau tautan tidak valid.</p><a href="/berita" class="text-primary font-semibold hover:underline">Kembali ke daftar berita</a></div>',
          })
        );
      }
      // Kalau URL diakses lewat id lama / judul yang sudah diedit, arahkan ke slug kanonik.
      const canonicalSlug = beritaSlug(article);
      if (slugParam !== canonicalSlug) {
        return Response.redirect(url.origin + '/berita/' + canonicalSlug, 301);
      }
      const body = layout({
        db,
        activeKey: 'berita',
        title: `${article.title} — ${db.meta.schoolName || 'SDN 01 Papahan'}`,
        description: truncateForMeta(article.excerpt || article.content || '', 160),
        canonicalPath: `/berita/${canonicalSlug}`,
        bodyHtml: buildBeritaDetailBody(db, article),
        extraScript: beritaDetailScript(article.id),
      });
      return html(body);
    }

    if (STATIC_PAGES[path] && request.method === 'GET') {
      const page = STATIC_PAGES[path];
      const db = await getSiteData(env);
      const body = layout({
        db,
        activeKey: page.key,
        title: `${page.title} — ${db.meta.schoolName || 'SDN 01 Papahan'}`,
        canonicalPath: path,
        bodyHtml: page.build(db),
      });
      return html(body);
    }

    if (path.startsWith('/halaman/') && request.method === 'GET') {
      const slugParam = decodeURIComponent(path.slice('/halaman/'.length));
      const db = await getSiteData(env);
      const section = findCustomSectionBySlug(db.customSections, slugParam);
      if (!section) {
        return html(
          layout({
            db,
            title: 'Halaman tidak ditemukan',
            canonicalPath: path,
            bodyHtml: '<div class="max-w-3xl mx-auto px-4 py-24 text-center"><h1 class="text-2xl font-bold text-slateDark mb-2">Halaman tidak ditemukan</h1><p class="text-slateMuted mb-6">Halaman mungkin sudah dihapus atau tautan tidak valid.</p><a href="/" class="text-primary font-semibold hover:underline">Kembali ke beranda</a></div>',
          }),
          404
        );
      }
      const canonicalSlug = customSectionSlug(section);
      if (slugParam !== canonicalSlug) {
        return Response.redirect(url.origin + '/halaman/' + canonicalSlug, 301);
      }
      const body = layout({
        db,
        activeKey: `custom:${section.id}`,
        title: `${section.title || section.menuLabel || 'Halaman'} — ${db.meta.schoolName || 'SDN 01 Papahan'}`,
        description: truncateForMeta(section.subtitle || '', 160),
        canonicalPath: `/halaman/${canonicalSlug}`,
        bodyHtml: buildCustomSectionMarkup(section),
      });
      return html(body);
    }

    if (path === '/sitemap.xml' && request.method === 'GET') {
      const db = await getSiteData(env);
      const urls = [
        { loc: '/', freq: 'daily', priority: '1.0' },
        ...Object.keys(STATIC_PAGES).map((p) => ({ loc: p, freq: 'weekly', priority: '0.7' })),
        { loc: '/berita', freq: 'daily', priority: '0.8' },
        ...(db.berita || []).map((b) => ({ loc: `/berita/${beritaSlug(b)}`, freq: 'monthly', priority: '0.6' })),
        ...(db.customSections || []).map((s) => ({ loc: `/halaman/${customSectionSlug(s)}`, freq: 'monthly', priority: '0.5' })),
      ];
      const body =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls
          .map(
            (u) =>
              `  <url><loc>${SITE_URL}${u.loc}</loc><changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`
          )
          .join('\n') +
        '\n</urlset>';
      return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
    }

    if (path === '/robots.txt' && request.method === 'GET') {
      const body = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /masuk\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
      return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    // ---------- /masuk (login) & CMS /admin — SSR baru, terpisah dari SPA lama ----------

    if (path === '/masuk' && request.method === 'GET') {
      const session = await getSessionUser(request, env);
      if (session) return redirect('/admin');
      const db = await getSiteData(env);
      const error = url.searchParams.get('error');
      return html(buildLoginPage({ error: error ? decodeURIComponent(error) : '', schoolName: db.meta.schoolName }));
    }

    if (path === '/api/login' && request.method === 'POST') {
      const form = await request.formData();
      const username = String(form.get('username') || '').trim();
      const password = String(form.get('password') || '');
      const user = username ? await findUserByUsername(env, username) : null;
      const ok = user && (await verifyPassword(password, user.password_hash));
      if (!ok) {
        return redirect('/masuk?error=' + encodeURIComponent('Username atau password salah.'));
      }
      const token = await createSession(env, user.id);
      return redirect('/admin', 302, { 'Set-Cookie': sessionCookieHeader(token, url.protocol === 'https:') });
    }

    if (path === '/api/logout' && request.method === 'POST') {
      const session = await getSessionUser(request, env);
      if (session) await destroySession(env, session.token);
      return redirect('/masuk', 302, { 'Set-Cookie': clearSessionCookieHeader(url.protocol === 'https:') });
    }

    if (path === '/admin' || path.startsWith('/admin/')) {
      const session = await getSessionUser(request, env);
      if (!session) return redirect('/masuk');
      const username = session.user.username;

      // ---- Dashboard ----
      if (path === '/admin' && request.method === 'GET') {
        const db = await getSiteData(env);
        return adminPage({ activeKey: 'dashboard', title: 'Dashboard', username, bodyHtml: buildDashboardBody(db, username) });
      }

      // ---- Section sederhana (profil, program, pengajar, prestasi, ekskul, galeri, testimoni, faq, kontak) ----
      const sectionMatch = path.match(/^\/admin\/([a-z]+)$/);
      const sectionKey = sectionMatch && sectionMatch[1];
      if (sectionKey && SECTION_CONFIGS[sectionKey]) {
        const db = await getSiteData(env);
        const config = SECTION_CONFIGS[sectionKey];
        if (request.method === 'GET') {
          return adminPage({ activeKey: sectionKey, title: config.title, username, bodyHtml: renderSectionForm(sectionKey, db) });
        }
        if (request.method === 'POST') {
          const parsed = await parseAdminForm(request);
          applySectionForm(sectionKey, db, parsed);
          await saveSiteData(env, db);
          return redirect(`/admin/${sectionKey}?saved=1`);
        }
      }

      // ---- Pengaturan: identitas ----
      if (path === '/admin/pengaturan' && request.method === 'GET') {
        const db = await getSiteData(env);
        return adminPage({ activeKey: 'pengaturan', title: 'Pengaturan', username, bodyHtml: buildSettingsBody(db, username) });
      }
      if (path === '/admin/pengaturan/identitas' && request.method === 'POST') {
        const db = await getSiteData(env);
        const form = await request.formData();
        db.meta = db.meta || {};
        ['schoolName', 'schoolLocation', 'pageTitle', 'navCtaText', 'logoText', 'logoImage'].forEach((k) => {
          db.meta[k] = String(form.get(k) || '').trim();
        });
        await saveSiteData(env, db);
        return redirect('/admin/pengaturan?saved=1');
      }
      if (path === '/admin/pengaturan/akun' && request.method === 'POST') {
        const form = await request.formData();
        const currentPassword = String(form.get('currentPassword') || '');
        const newUsername = String(form.get('username') || '').trim();
        const newPassword = String(form.get('newPassword') || '');
        const newPasswordConfirm = String(form.get('newPasswordConfirm') || '');

        const user = await findUserByUsername(env, username);
        const ok = user && (await verifyPassword(currentPassword, user.password_hash));
        if (!ok) {
          return redirect('/admin/pengaturan?error=' + encodeURIComponent('Password saat ini salah.'));
        }
        if (newPassword && newPassword !== newPasswordConfirm) {
          return redirect('/admin/pengaturan?error=' + encodeURIComponent('Konfirmasi password baru tidak cocok.'));
        }
        const passwordHash = newPassword ? await hashPassword(newPassword) : null;
        try {
          await updateUserCredentials(env, user.id, { username: newUsername || null, passwordHash });
        } catch (e) {
          const msg = String(e && e.message || '');
          const friendly = msg.includes('UNIQUE') ? 'Username sudah dipakai akun lain.' : 'Gagal menyimpan perubahan akun.';
          return redirect('/admin/pengaturan?error=' + encodeURIComponent(friendly));
        }
        return redirect('/admin/pengaturan?saved=1');
      }

      // ---- Berita ----
      if (path === '/admin/berita' && request.method === 'GET') {
        const db = await getSiteData(env);
        return adminPage({ activeKey: 'berita', title: 'Berita & Agenda', username, bodyHtml: buildBeritaAdminListBody(db) });
      }
      if (path === '/admin/berita/baru' && request.method === 'GET') {
        return adminPage({ activeKey: 'berita', title: 'Tulis Berita', username, bodyHtml: buildBeritaFormBody(null, true) });
      }
      if (path === '/admin/berita/baru' && request.method === 'POST') {
        const db = await getSiteData(env);
        const form = await request.formData();
        const id = newId('b');
        db.berita = db.berita || [];
        db.berita.unshift({
          id,
          title: String(form.get('title') || '').trim(),
          category: String(form.get('category') || '').trim(),
          date: String(form.get('date') || '').trim(),
          author: String(form.get('author') || 'Admin').trim(),
          image: String(form.get('image') || '').trim(),
          excerpt: String(form.get('excerpt') || '').trim(),
          content: String(form.get('content') || '').trim(),
        });
        await saveSiteData(env, db);
        return redirect('/admin/berita?saved=1');
      }
      const beritaHapusMatch = path.match(/^\/admin\/berita\/([^/]+)\/hapus$/);
      if (beritaHapusMatch && request.method === 'POST') {
        const db = await getSiteData(env);
        db.berita = (db.berita || []).filter((b) => b.id !== beritaHapusMatch[1]);
        await saveSiteData(env, db);
        return redirect('/admin/berita?saved=1');
      }
      const beritaEditMatch = path.match(/^\/admin\/berita\/([^/]+)$/);
      if (beritaEditMatch) {
        const db = await getSiteData(env);
        const id = beritaEditMatch[1];
        const article = (db.berita || []).find((b) => b.id === id);
        if (!article) return redirect('/admin/berita?error=' + encodeURIComponent('Berita tidak ditemukan.'));
        if (request.method === 'GET') {
          return adminPage({ activeKey: 'berita', title: 'Edit Berita', username, bodyHtml: buildBeritaFormBody(article, false) });
        }
        if (request.method === 'POST') {
          const form = await request.formData();
          Object.assign(article, {
            title: String(form.get('title') || '').trim(),
            category: String(form.get('category') || '').trim(),
            date: String(form.get('date') || '').trim(),
            author: String(form.get('author') || 'Admin').trim(),
            image: String(form.get('image') || '').trim(),
            excerpt: String(form.get('excerpt') || '').trim(),
            content: String(form.get('content') || '').trim(),
          });
          await saveSiteData(env, db);
          return redirect('/admin/berita?saved=1');
        }
      }

      // ---- Halaman custom ----
      if (path === '/admin/halaman' && request.method === 'GET') {
        const db = await getSiteData(env);
        return adminPage({ activeKey: 'halaman', title: 'Halaman Custom', username, bodyHtml: buildCustomPagesListBody(db) });
      }
      if (path === '/admin/halaman/baru' && request.method === 'GET') {
        return adminPage({ activeKey: 'halaman', title: 'Buat Halaman', username, bodyHtml: buildCustomPageFormBody(null, true) });
      }
      if (path === '/admin/halaman/baru' && request.method === 'POST') {
        const db = await getSiteData(env);
        const parsed = await parseAdminForm(request);
        normalizeCustomPageFields(parsed);
        const id = newId('cs');
        db.customSections = db.customSections || [];
        db.customSections.push({ id, ...parsed.flat, items: parsed.items });
        await saveSiteData(env, db);
        return redirect('/admin/halaman?saved=1');
      }
      const halamanHapusMatch = path.match(/^\/admin\/halaman\/([^/]+)\/hapus$/);
      if (halamanHapusMatch && request.method === 'POST') {
        const db = await getSiteData(env);
        db.customSections = (db.customSections || []).filter((s) => s.id !== halamanHapusMatch[1]);
        await saveSiteData(env, db);
        return redirect('/admin/halaman?saved=1');
      }
      const halamanEditMatch = path.match(/^\/admin\/halaman\/([^/]+)$/);
      if (halamanEditMatch) {
        const db = await getSiteData(env);
        const id = halamanEditMatch[1];
        const section = (db.customSections || []).find((s) => s.id === id);
        if (!section) return redirect('/admin/halaman?error=' + encodeURIComponent('Halaman tidak ditemukan.'));
        if (request.method === 'GET') {
          return adminPage({ activeKey: 'halaman', title: 'Edit Halaman', username, bodyHtml: buildCustomPageFormBody(section, false) });
        }
        if (request.method === 'POST') {
          const parsed = await parseAdminForm(request);
          normalizeCustomPageFields(parsed);
          Object.assign(section, parsed.flat, { items: parsed.items });
          await saveSiteData(env, db);
          return redirect('/admin/halaman?saved=1');
        }
      }

      return html('<p>Halaman admin tidak ditemukan.</p>', 404);
    }

    // ---------- Selain itu: gambar & aset statis lain ----------
    return env.ASSETS.fetch(request);
  },
};
