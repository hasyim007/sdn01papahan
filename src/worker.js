import { getPublicData, getAdminData, getStoreValue, setStoreValue, getBeritaBySlug,
         getCustomBySlug, mapBeritaRow, mapCustomRow, slugify, STORE_KEYS, formatTanggalIndo } from './lib/db.js';
import { hashPassword, verifyPassword, createSession, sessionCookieHeader,
         clearSessionCookieHeader, getSessionUser, requireAdmin } from './lib/auth.js';
import { pageLayout, navHtml, footerHtml, escapeHtml } from './lib/render.js';

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init.headers || {}) }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/robots.txt') return robotsTxt(env);
      if (path === '/sitemap.xml') return sitemapXml(env);
      if (path.startsWith('/api/')) return handleApi(request, env, path);
      if (path === '/berita' || path === '/berita/') return renderBeritaList(request, env, url);
      if (path.startsWith('/berita/')) return renderBeritaDetail(env, path.slice('/berita/'.length));

      // Coba layani file statis (halaman tetap, admin panel, aset).
      const assetResp = await env.ASSETS.fetch(request);
      if (assetResp.status !== 404) return assetResp;

      // Bukan file statis yang dikenal -> mungkin slug halaman kustom.
      const slug = path.replace(/^\/+|\/+$/g, '');
      if (slug && !slug.startsWith('admin') && !slug.startsWith('api')) {
        const customResp = await renderCustomPage(env, slug);
        if (customResp) return customResp;
      }
      return assetResp; // 404 bawaan dari Static Assets
    } catch (err) {
      return new Response('Terjadi kesalahan server: ' + err.message, { status: 500 });
    }
  }
};

// =========================================================================
// robots.txt & sitemap.xml
// =========================================================================
function robotsTxt(env) {
  const site = env.SITE_URL || '';
  const body = `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${site}/sitemap.xml\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function sitemapXml(env) {
  const site = env.SITE_URL || '';
  const staticPaths = ['/', '/profil', '/program', '/guru', '/prestasi', '/berita', '/galeri', '/kontak'];
  const now = new Date().toISOString();
  const beritaRows = await env.DB.prepare(
    `SELECT slug, updated_at FROM berita WHERE status='published' AND publish_at <= ? ORDER BY publish_at DESC`
  ).bind(now).all();
  const customRows = await env.DB.prepare(`SELECT slug, updated_at FROM custom_sections WHERE active = 1`).all();

  const urls = [
    ...staticPaths.map(p => ({ loc: site + p, lastmod: now.slice(0, 10) })),
    ...beritaRows.results.map(b => ({ loc: `${site}/berita/${b.slug}`, lastmod: (b.updated_at || now).slice(0, 10) })),
    ...customRows.results.map(c => ({ loc: `${site}/${c.slug}`, lastmod: (c.updated_at || now).slice(0, 10) }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${escapeHtml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n') +
    `\n</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}

// =========================================================================
// Halaman berita (dinamis, dirender Worker langsung dari D1)
// =========================================================================
async function renderBeritaList(request, env, url) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const perPage = 9;
  const meta = (await getStoreValue(env, 'meta')) || {};
  const pageOrder = (await getStoreValue(env, 'pageOrder')) || [];
  const footer = (await getStoreValue(env, 'footer')) || {};
  const now = new Date().toISOString();

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM berita WHERE status='published' AND publish_at <= ?`
  ).bind(now).first();
  const total = countRow?.c || 0;
  const rows = await env.DB.prepare(
    `SELECT * FROM berita WHERE status='published' AND publish_at <= ? ORDER BY publish_at DESC LIMIT ? OFFSET ?`
  ).bind(now, perPage, (page - 1) * perPage).all();
  const items = rows.results.map(mapBeritaRow);

  const cards = items.map(b => `
    <article class="inst-card overflow-hidden group cursor-pointer">
      <a href="/berita/${escapeHtml(b.slug)}" class="block">
        <div class="h-44 relative bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center overflow-hidden">
          ${b.coverImage ? `<img src="${escapeHtml(b.coverImage)}" class="w-full h-full object-cover" alt="${escapeHtml(b.title)}">` : `<span class="text-white/10 font-extrabold text-6xl select-none tracking-tight">Berita</span>`}
          <span class="absolute top-4 left-4 px-3 py-1 rounded-full bg-indigo-500/90 text-white text-xs font-semibold">${escapeHtml(b.category)}</span>
        </div>
        <div class="p-5">
          <div class="flex items-center gap-4 text-xs text-slateMuted mb-3">
            <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> ${escapeHtml(b.date)}</span>
            <span class="flex items-center gap-1"><i data-lucide="user" class="w-3.5 h-3.5"></i> ${escapeHtml(b.author || 'Admin')}</span>
          </div>
          <h3 class="font-bold text-slateDark mb-2 group-hover:text-primary transition-colors">${escapeHtml(b.title)}</h3>
          <p class="text-sm text-slateMuted mb-4 line-clamp-2">${escapeHtml(b.excerpt)}</p>
          <span class="text-sm font-semibold text-primary inline-flex items-center gap-1 hover:underline">Baca Selengkapnya <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i></span>
        </div>
      </a>
    </article>`).join('\n');

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pagination = totalPages > 1 ? `
    <div class="flex justify-center gap-2 mt-10">
      ${page > 1 ? `<a href="/berita?page=${page - 1}" class="px-4 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50">Sebelumnya</a>` : ''}
      <span class="px-4 py-2 text-sm text-slateMuted">Halaman ${page} dari ${totalPages}</span>
      ${page < totalPages ? `<a href="/berita?page=${page + 1}" class="px-4 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50">Berikutnya</a>` : ''}
    </div>` : '';

  const bodyHtml = `
  <section class="py-16 bg-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center max-w-2xl mx-auto mb-14">
        <span class="inline-block px-4 py-1.5 rounded-full bg-indigo-50 text-indigo-500 text-xs font-bold tracking-wide mb-4">BERITA & ARTIKEL</span>
        <h1 class="text-3xl sm:text-4xl font-extrabold text-slateDark mb-4">Semua Berita & Artikel</h1>
        <p class="text-slateMuted">Informasi dan kegiatan terkini seputar ${escapeHtml(meta.schoolName || 'sekolah')}.</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">${cards || '<p class="text-slateMuted col-span-3 text-center">Belum ada berita.</p>'}</div>
      ${pagination}
    </div>
  </section>`;

  return new Response(pageLayout({
    title: `Berita & Artikel — ${meta.schoolName || ''}`,
    description: `Kumpulan berita dan artikel terbaru dari ${meta.schoolName || ''}.`,
    canonicalPath: page > 1 ? `/berita?page=${page}` : '/berita',
    siteUrl: env.SITE_URL || '',
    navHtml: navHtml(meta, pageOrder, '/berita'),
    footerHtml: footerHtml(footer, meta),
    bodyHtml
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function renderBeritaDetail(env, slug) {
  const b = await getBeritaBySlug(env, slug);
  if (!b || (b.status !== 'published') || (new Date(b.publishAt) > new Date())) {
    return new Response('Artikel tidak ditemukan.', { status: 404 });
  }
  const meta = (await getStoreValue(env, 'meta')) || {};
  const pageOrder = (await getStoreValue(env, 'pageOrder')) || [];
  const footer = (await getStoreValue(env, 'footer')) || {};

  const paragraphs = String(b.content || '').split('\n').filter(Boolean)
    .map(p => `<p>${escapeHtml(p)}</p>`).join('\n');

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: b.title, description: b.metaDescription || b.excerpt,
    image: b.coverImage ? [b.coverImage] : undefined,
    datePublished: b.publishAt, author: { '@type': 'Person', name: b.author }
  };

  const tags = String(b.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const nowIso = new Date().toISOString();
  const recentRows = await env.DB.prepare(
    `SELECT slug, title, cover_image, publish_at FROM berita WHERE status='published' AND publish_at <= ? AND slug != ? ORDER BY publish_at DESC LIMIT 4`
  ).bind(nowIso, b.slug).all();
  const prevRow = await env.DB.prepare(
    `SELECT slug, title FROM berita WHERE status='published' AND publish_at <= ? AND publish_at < ? ORDER BY publish_at DESC LIMIT 1`
  ).bind(nowIso, b.publishAt).first();
  const nextRow = await env.DB.prepare(
    `SELECT slug, title FROM berita WHERE status='published' AND publish_at <= ? AND publish_at > ? ORDER BY publish_at ASC LIMIT 1`
  ).bind(nowIso, b.publishAt).first();
  const footer = (await getStoreValue(env, 'footer')) || {};

  const bodyHtml = `
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <div class="flex items-center gap-2 text-sm text-slateMuted mb-6 flex-wrap">
      <a href="/" class="hover:text-primary transition-colors">Beranda</a>
      <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
      <a href="/berita" class="hover:text-primary transition-colors">Berita</a>
      <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
      <span class="text-slateDark font-medium truncate max-w-xs sm:max-w-md">${escapeHtml(b.title)}</span>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div class="lg:col-span-2 space-y-6">
        <article class="inst-card p-6 sm:p-8">
          <span class="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-500 text-xs font-bold mb-4">${escapeHtml(b.category)}</span>
          <h1 class="text-2xl sm:text-3xl font-extrabold text-slateDark leading-snug mb-3">${escapeHtml(b.title)}</h1>
          <div class="flex items-center gap-4 text-xs text-slateMuted mb-6 pb-6 border-b border-borderLight">
            <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> ${escapeHtml(b.date)}</span>
            <span class="flex items-center gap-1"><i data-lucide="user" class="w-3.5 h-3.5"></i> ${escapeHtml(b.author)}</span>
          </div>
          ${b.coverImage ? `<img src="${escapeHtml(b.coverImage)}" class="w-full rounded-2xl mb-6" alt="${escapeHtml(b.title)}">` : ''}
          <div id="bd-content" class="text-sm sm:text-base text-slateDark/90 leading-relaxed space-y-4">${paragraphs}</div>
          ${tags.length ? `<div class="flex flex-wrap gap-2 mt-6 pt-6 border-t border-borderLight">${tags.map(t => `<span class="px-3 py-1 rounded-full bg-slate-100 text-slateMuted text-xs">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}

          <div class="mt-8 pt-6 border-t border-borderLight flex items-center gap-3">
            <span class="text-sm font-semibold text-slateDark mr-1">Bagikan:</span>
            <button onclick="shareBerita('facebook')" title="Bagikan ke Facebook" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-primary hover:text-white text-slateMuted flex items-center justify-center transition-colors"><i data-lucide="facebook" class="w-4 h-4"></i></button>
            <button onclick="shareBerita('twitter')" title="Bagikan ke Twitter/X" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-primary hover:text-white text-slateMuted flex items-center justify-center transition-colors"><i data-lucide="twitter" class="w-4 h-4"></i></button>
            <button onclick="shareBerita('whatsapp')" title="Bagikan ke WhatsApp" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-primary hover:text-white text-slateMuted flex items-center justify-center transition-colors"><i data-lucide="message-circle" class="w-4 h-4"></i></button>
            <button onclick="shareBerita('copy')" title="Salin Tautan" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-primary hover:text-white text-slateMuted flex items-center justify-center transition-colors"><i data-lucide="link" class="w-4 h-4"></i></button>
          </div>
        </article>

        <div class="inst-card p-6 sm:p-8">
          <div class="flex items-center gap-2 mb-6 flex-wrap">
            <i data-lucide="message-square" class="w-5 h-5 text-primary"></i>
            <h3 class="font-bold text-slateDark" id="bd-comment-count">0 Komentar</h3>
            <span class="text-sm text-slateMuted">Bergabunglah dalam diskusi</span>
          </div>
          <div class="space-y-5 mb-2" id="bd-comment-list"></div>
          <div class="border-t border-borderLight pt-6 mt-6">
            <h4 class="font-semibold text-slateDark mb-4 flex items-center gap-2"><i data-lucide="edit-3" class="w-4 h-4"></i> Tinggalkan Komentar</h4>
            <form id="bd-comment-form" onsubmit="event.preventDefault(); submitBeritaComment();" class="space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input type="text" id="bd-comment-name" placeholder="Nama Lengkap *" required class="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                <input type="email" id="bd-comment-email" placeholder="Email *" required class="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
              </div>
              <textarea id="bd-comment-message" rows="4" placeholder="Tulis komentar Anda... *" required class="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"></textarea>
              <label class="flex items-center gap-2 text-xs text-slateMuted">
                <input type="checkbox" id="bd-comment-save" class="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/30">
                Simpan nama dan email saya untuk komentar berikutnya
              </label>
              <button type="submit" class="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-slateDark text-white text-sm font-semibold hover:bg-slate-800 transition-colors shadow-soft">
                Kirim Komentar <i data-lucide="send" class="w-4 h-4"></i>
              </button>
            </form>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${prevRow ? `<a href="/berita/${escapeHtml(prevRow.slug)}" class="inst-card p-4 text-left flex items-center gap-3 hover:border-primary/30"><i data-lucide="arrow-left" class="w-4 h-4 text-primary shrink-0"></i><div class="min-w-0"><p class="text-xs text-slateMuted">Berita Sebelumnya</p><p class="text-sm font-semibold text-slateDark truncate">${escapeHtml(prevRow.title)}</p></div></a>` : '<div></div>'}
          ${nextRow ? `<a href="/berita/${escapeHtml(nextRow.slug)}" class="inst-card p-4 text-left flex items-center gap-3 justify-end hover:border-primary/30"><div class="min-w-0 text-right"><p class="text-xs text-slateMuted">Berita Selanjutnya</p><p class="text-sm font-semibold text-slateDark truncate">${escapeHtml(nextRow.title)}</p></div><i data-lucide="arrow-right" class="w-4 h-4 text-primary shrink-0"></i></a>` : '<div></div>'}
        </div>
      </div>

      <div class="space-y-6">
        <div class="inst-card p-5">
          <h4 class="font-bold text-slateDark mb-3 text-sm">Pencarian</h4>
          <div class="relative">
            <input type="text" id="bd-search-input" placeholder="Cari berita..." class="w-full pl-4 pr-10 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
            <i data-lucide="search" class="w-4 h-4 text-slateMuted absolute right-3 top-1/2 -translate-y-1/2"></i>
          </div>
        </div>
        <div class="inst-card p-5">
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-bold text-slateDark text-sm" id="bd-sidebar-list-title">Berita Terbaru</h4>
            <button onclick="resetBeritaSidebar()" id="bd-sidebar-reset" class="hidden text-xs text-primary font-semibold hover:underline">Reset</button>
          </div>
          <div class="space-y-3" id="bd-sidebar-list"></div>
        </div>
        <div class="inst-card p-5"><h4 class="font-bold text-slateDark mb-3 text-sm">Arsip Berita</h4><div class="space-y-1" id="bd-archive-list"></div></div>
        <div class="inst-card p-5"><h4 class="font-bold text-slateDark mb-3 text-sm">Tags</h4><div class="flex flex-wrap gap-2" id="bd-tags-list"></div></div>
        <div class="inst-card p-5">
          <h4 class="font-bold text-slateDark mb-3 text-sm">Ikuti Kami</h4>
          <div class="flex gap-3">
            <a href="${escapeHtml(footer.socialFacebook || '#')}" target="_blank" rel="noopener" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-primary hover:text-white text-slateMuted flex items-center justify-center transition-colors"><i data-lucide="facebook" class="w-4 h-4"></i></a>
            <a href="${escapeHtml(footer.socialInstagram || '#')}" target="_blank" rel="noopener" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-primary hover:text-white text-slateMuted flex items-center justify-center transition-colors"><i data-lucide="instagram" class="w-4 h-4"></i></a>
            <a href="${escapeHtml(footer.socialYoutube || '#')}" target="_blank" rel="noopener" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-primary hover:text-white text-slateMuted flex items-center justify-center transition-colors"><i data-lucide="youtube" class="w-4 h-4"></i></a>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script src="/assets/berita-detail.js"></script>`;

  return new Response(pageLayout({
    title: `${b.title} — ${meta.schoolName || ''}`,
    description: b.metaDescription || b.excerpt,
    ogImage: b.coverImage || undefined,
    ogType: 'article',
    canonicalPath: `/berita/${b.slug}`,
    siteUrl: env.SITE_URL || '',
    jsonLd,
    navHtml: navHtml(meta, pageOrder, '/berita'),
    footerHtml: footerHtml(footer, meta),
    bodyHtml
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// =========================================================================
// Halaman kustom (dinamis, dirender Worker langsung dari D1)
// =========================================================================
async function renderCustomPage(env, slug) {
  const c = await getCustomBySlug(env, slug);
  if (!c) return null;
  const meta = (await getStoreValue(env, 'meta')) || {};
  const pageOrder = (await getStoreValue(env, 'pageOrder')) || [];
  const footer = (await getStoreValue(env, 'footer')) || {};

  const cols = c.columns === 2 ? 'sm:grid-cols-2' : (c.columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3');
  const bgSection = c.bgStyle === 'dark' ? 'bg-slate-900 text-white' : (c.bgStyle === 'gray' ? 'bg-slate-50' : 'bg-white');
  const muted = c.bgStyle === 'dark' ? 'text-slate-300' : 'text-slateMuted';
  const eyebrowCls = c.bgStyle === 'dark' ? 'bg-white/10 border-white/10 text-white' : 'bg-blue-50 border-blue-100 text-primary';
  const cardCls = c.bgStyle === 'dark' ? 'bg-white/5 border border-white/10' : 'bg-white border border-borderLight shadow-soft';

  const items = (c.items || []).map(it => `
    <div class="${cardCls} rounded-2xl p-6">
      ${it.icon ? `<div class="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4"><i data-lucide="${escapeHtml(it.icon)}" class="w-6 h-6"></i></div>` : ''}
      <h3 class="font-bold mb-2">${escapeHtml(it.title || '')}</h3>
      <p class="text-sm ${muted}">${escapeHtml(it.desc || '')}</p>
    </div>`).join('\n');

  const bodyHtml = `
  <section class="py-20 ${bgSection}">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="max-w-2xl mx-auto text-center mb-12">
        ${c.eyebrow ? `<span class="inline-flex items-center px-3 py-1.5 rounded-full border ${eyebrowCls} text-xs font-semibold mb-4">${escapeHtml(c.eyebrow)}</span>` : ''}
        <h1 class="text-3xl sm:text-4xl font-bold mb-4">${escapeHtml(c.title)}</h1>
        ${c.subtitle ? `<p class="${muted}">${escapeHtml(c.subtitle)}</p>` : ''}
      </div>
      <div class="grid grid-cols-1 ${cols} gap-6">${items}</div>
    </div>
  </section>`;

  return new Response(pageLayout({
    title: `${c.title} — ${meta.schoolName || ''}`,
    description: c.subtitle,
    canonicalPath: `/${c.slug}`,
    siteUrl: env.SITE_URL || '',
    navHtml: navHtml(meta, pageOrder, '/' + c.slug),
    footerHtml: footerHtml(footer, meta),
    bodyHtml
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// =========================================================================
// API — /api/public/data, /api/auth/*, /api/admin/*
// =========================================================================
async function handleApi(request, env, path) {
  if (path === '/api/public/data' && request.method === 'GET') {
    const data = await getPublicData(env);
    return json(data);
  }

  if (path === '/api/auth/login' && request.method === 'POST') return apiLogin(request, env);
  if (path === '/api/auth/logout' && request.method === 'POST') return apiLogout(request, env);
  if (path === '/api/auth/me' && request.method === 'GET') return apiMe(request, env);

  const commentMatch = path.match(/^\/api\/public\/berita\/([^/]+)\/comments$/);
  if (commentMatch) return handlePublicComments(request, env, commentMatch[1]);


  if (path.startsWith('/api/admin/')) {
    const denied = await requireAdmin(request, env);
    if (denied) return denied;
    return handleAdminApi(request, env, path);
  }

  return json({ error: 'Endpoint tidak ditemukan.' }, { status: 404 });
}

async function apiLogin(request, env) {
  const { username, password } = await request.json().catch(() => ({}));
  if (!username || !password) return json({ error: 'Username dan password wajib diisi.' }, { status: 400 });
  const user = await env.DB.prepare('SELECT * FROM admin_users WHERE username = ?').bind(username).first();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return json({ error: 'Username atau password salah.' }, { status: 401 });
  }
  const { token, expires } = await createSession(env, user.id);
  return json({ ok: true }, { headers: { 'Set-Cookie': sessionCookieHeader(token, expires) } });
}

async function apiLogout(request, env) {
  const session = await getSessionUser(request, env);
  if (session) await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(session.token).run();
  return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookieHeader() } });
}

async function apiMe(request, env) {
  const session = await getSessionUser(request, env);
  if (!session) return json({ loggedIn: false });
  const user = await env.DB.prepare('SELECT username FROM admin_users WHERE id = ?').bind(session.userId).first();
  return json({ loggedIn: true, username: user?.username });
}

// ---- Komentar publik (tanpa login) ----
async function handlePublicComments(request, env, slug) {
  const b = await getBeritaBySlug(env, slug);
  if (!b) return json({ error: 'Artikel tidak ditemukan.' }, { status: 404 });

  if (request.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT id, name, message, created_at FROM berita_comments WHERE berita_id = ? ORDER BY created_at ASC`
    ).bind(b.id).all();
    return json(rows.results.map(c => ({
      id: c.id, name: c.name, message: c.message,
      date: formatTanggalIndo(c.created_at)
    })));
  }

  if (request.method === 'POST') {
    const { name, message } = await request.json().catch(() => ({}));
    if (!name || !message) return json({ error: 'Nama dan komentar wajib diisi.' }, { status: 400 });
    const id = 'bc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    await env.DB.prepare(
      `INSERT INTO berita_comments (id, berita_id, name, message) VALUES (?, ?, ?, ?)`
    ).bind(id, b.id, String(name).slice(0, 100), String(message).slice(0, 2000)).run();
    return json({ ok: true });
  }

  return json({ error: 'Metode tidak didukung.' }, { status: 405 });
}

// ---- Admin CRUD ----
async function handleAdminApi(request, env, path) {
  const rest = path.replace('/api/admin/', '');
  const [resource, id] = rest.split('/');

  if (resource === 'data' && request.method === 'GET') {
    return json(await getAdminData(env));
  }

  if (resource === 'store' && STORE_KEYS.includes(id) ) {
    if (request.method === 'GET') return json(await getStoreValue(env, id));
    if (request.method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (body === null) return json({ error: 'Body JSON tidak valid.' }, { status: 400 });
      await setStoreValue(env, id, body);
      return json({ ok: true });
    }
  }

  if (resource === 'berita') return handleBeritaApi(request, env, id);
  if (resource === 'custom-sections') return handleCustomApi(request, env, id);
  if (resource === 'comments') return handleCommentsApi(request, env, id);
  if (resource === 'account' && request.method === 'PUT') return handleAccountUpdate(request, env);

  return json({ error: 'Resource admin tidak dikenal.' }, { status: 404 });
}

async function handleBeritaApi(request, env, id) {
  if (request.method === 'GET' && !id) {
    const rows = await env.DB.prepare('SELECT * FROM berita ORDER BY publish_at DESC').all();
    return json(rows.results.map(mapBeritaRow));
  }
  if (request.method === 'POST' && !id) {
    const b = await request.json().catch(() => ({}));
    const newId = 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    let slug = slugify(b.slug || b.title);
    slug = await ensureUniqueSlug(env, 'berita', slug);
    await env.DB.prepare(`INSERT INTO berita
      (id, slug, title, excerpt, content, category, tags, author, cover_image, meta_description, status, publish_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        newId, slug, b.title || '', b.excerpt || '', b.content || '', b.category || '',
        b.tags || '', b.author || 'Admin', b.coverImage || '', b.metaDescription || '',
        b.status || 'published', b.publishAt || new Date().toISOString()
      ).run();
    return json({ ok: true, id: newId, slug });
  }
  if (request.method === 'PUT' && id) {
    const b = await request.json().catch(() => ({}));
    let slug = slugify(b.slug || b.title);
    slug = await ensureUniqueSlug(env, 'berita', slug, id);
    await env.DB.prepare(`UPDATE berita SET slug=?, title=?, excerpt=?, content=?, category=?,
      tags=?, author=?, cover_image=?, meta_description=?, status=?, publish_at=?, updated_at=datetime('now')
      WHERE id=?`).bind(
        slug, b.title || '', b.excerpt || '', b.content || '', b.category || '', b.tags || '',
        b.author || 'Admin', b.coverImage || '', b.metaDescription || '', b.status || 'published',
        b.publishAt || new Date().toISOString(), id
      ).run();
    return json({ ok: true, slug });
  }
  if (request.method === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM berita WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return json({ error: 'Permintaan berita tidak valid.' }, { status: 400 });
}

async function handleCustomApi(request, env, id) {
  if (request.method === 'GET' && !id) {
    const rows = await env.DB.prepare('SELECT * FROM custom_sections ORDER BY sort_order ASC').all();
    return json(rows.results.map(mapCustomRow));
  }
  if (request.method === 'POST' && !id) {
    const c = await request.json().catch(() => ({}));
    const newId = 'cs_' + Math.random().toString(36).slice(2, 10);
    let slug = slugify(c.slug || c.title);
    slug = await ensureUniqueSlug(env, 'custom_sections', slug);
    const countRow = await env.DB.prepare('SELECT COUNT(*) as c FROM custom_sections').first();
    await env.DB.prepare(`INSERT INTO custom_sections
      (id, slug, type, eyebrow, title, subtitle, bg_style, active, menu_label, columns, items_json, image, image_position, cta_label, cta_link, sort_order)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        newId, slug, c.type || 'cards', c.eyebrow || '', c.title || '', c.subtitle || '',
        c.bgStyle || 'gray', c.active === false ? 0 : 1, c.menuLabel || c.title || '',
        c.columns || 3, JSON.stringify(c.items || []), c.image || '', c.imagePosition || 'right',
        c.ctaLabel || '', c.ctaLink || '', countRow?.c || 0
      ).run();
    return json({ ok: true, id: newId, slug });
  }
  if (request.method === 'PUT' && id) {
    const c = await request.json().catch(() => ({}));
    let slug = slugify(c.slug || c.title);
    slug = await ensureUniqueSlug(env, 'custom_sections', slug, id);
    await env.DB.prepare(`UPDATE custom_sections SET slug=?, type=?, eyebrow=?, title=?, subtitle=?,
      bg_style=?, active=?, menu_label=?, columns=?, items_json=?, image=?, image_position=?,
      cta_label=?, cta_link=?, updated_at=datetime('now') WHERE id=?`).bind(
        slug, c.type || 'cards', c.eyebrow || '', c.title || '', c.subtitle || '', c.bgStyle || 'gray',
        c.active === false ? 0 : 1, c.menuLabel || c.title || '', c.columns || 3,
        JSON.stringify(c.items || []), c.image || '', c.imagePosition || 'right',
        c.ctaLabel || '', c.ctaLink || '', id
      ).run();
    return json({ ok: true, slug });
  }
  if (request.method === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM custom_sections WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return json({ error: 'Permintaan halaman kustom tidak valid.' }, { status: 400 });
}

async function handleCommentsApi(request, env, beritaId) {
  if (request.method === 'GET' && beritaId) {
    const rows = await env.DB.prepare('SELECT * FROM berita_comments WHERE berita_id = ? ORDER BY created_at DESC').bind(beritaId).all();
    return json(rows.results);
  }
  if (request.method === 'DELETE' && beritaId) {
    // beritaId di sini sebenarnya dipakai sebagai commentId, lihat route publik jika diperlukan terpisah.
    await env.DB.prepare('DELETE FROM berita_comments WHERE id = ?').bind(beritaId).run();
    return json({ ok: true });
  }
  return json({ error: 'Permintaan komentar tidak valid.' }, { status: 400 });
}

async function handleAccountUpdate(request, env) {
  const { username, password, currentPassword } = await request.json().catch(() => ({}));
  const session = await getSessionUser(request, env);
  const user = await env.DB.prepare('SELECT * FROM admin_users WHERE id = ?').bind(session.userId).first();
  if (!user || !(await verifyPassword(currentPassword || '', user.password_hash))) {
    return json({ error: 'Password saat ini salah.' }, { status: 401 });
  }
  const newUsername = username || user.username;
  const newHash = password ? await hashPassword(password) : user.password_hash;
  await env.DB.prepare('UPDATE admin_users SET username = ?, password_hash = ? WHERE id = ?')
    .bind(newUsername, newHash, user.id).run();
  return json({ ok: true });
}

async function ensureUniqueSlug(env, table, baseSlug, excludeId) {
  let slug = baseSlug;
  let n = 2;
  while (true) {
    const row = excludeId
      ? await env.DB.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`).bind(slug, excludeId).first()
      : await env.DB.prepare(`SELECT id FROM ${table} WHERE slug = ?`).bind(slug).first();
    if (!row) return slug;
    slug = `${baseSlug}-${n++}`;
  }
}
