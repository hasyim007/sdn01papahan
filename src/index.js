import {
    getStore, setStore, getAllStore, STORE_TYPES,
    listBeritaPublished, listBeritaAll, getBeritaBySlug, getBeritaById, upsertBerita, deleteBerita,
    listCommentsForBerita, addComment, deleteComment,
    listCustomSections, getCustomSectionBySlug, upsertCustomSection, deleteCustomSection,
} from './lib/db.js';
import {
    verifyPassword, hashPassword, createSession, destroySession,
    getSessionUser, getSessionToken, sessionCookieHeader, clearCookieHeader, requireAuth,
} from './lib/auth.js';
import { esc, nl2p, pageHead, layout, schoolJsonLd, articleJsonLd } from './lib/render.js';

function json(data, init = {}) {
    return new Response(JSON.stringify(data), {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const { pathname } = url;

        try {
            if (pathname.startsWith('/api/')) {
                return await handleApi(request, env, url);
            }
            if (pathname === '/sitemap.xml') {
                return await renderSitemap(env, url);
            }
            if (pathname === '/' ) {
                return await renderLanding(env, url);
            }
            if (pathname === '/berita' || pathname === '/berita/') {
                return await renderBeritaList(env, url);
            }
            if (pathname.startsWith('/berita/')) {
                const slug = pathname.replace('/berita/', '').replace(/\/$/, '');
                return await renderBeritaDetail(env, url, slug);
            }

            // Coba file statis dulu (halaman publik & admin ada di /public).
            const assetResp = await env.ASSETS.fetch(request);
            if (assetResp.status !== 404) {
                if (pathname.startsWith('/admin/')) {
                    const headers = new Headers(assetResp.headers);
                    headers.set('X-Robots-Tag', 'noindex, nofollow');
                    return new Response(assetResp.body, { status: assetResp.status, headers });
                }
                return assetResp;
            }

            // Bukan file statis -> coba resolve sebagai halaman kustom (/[slug])
            const slug = pathname.replace(/^\//, '').replace(/\/$/, '');
            if (slug && !slug.includes('/')) {
                const cs = await getCustomSectionBySlug(env, slug);
                if (cs) return await renderCustomSection(env, url, cs);
            }

            return new Response('Halaman tidak ditemukan', { status: 404 });
        } catch (err) {
            console.error(err);
            return new Response('Terjadi kesalahan server: ' + err.message, { status: 500 });
        }
    },
};

// =========================================================================
// API /api/*
// =========================================================================

async function handleApi(request, env, url) {
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
    const seg = parts[1];
    const method = request.method;

    // ---- Auth ----
    if (seg === 'auth') {
        if (parts[2] === 'login' && method === 'POST') {
            const body = await request.json().catch(() => ({}));
            const row = await env.DB.prepare('SELECT username, password_hash FROM admin WHERE username = ?')
                .bind(body.username || '').first();
            if (!row || !(await verifyPassword(body.password || '', row.password_hash))) {
                return json({ error: 'Username atau password salah' }, { status: 401 });
            }
            const { token } = await createSession(env, row.username);
            return json({ ok: true, username: row.username }, { headers: { 'Set-Cookie': sessionCookieHeader(token) } });
        }
        if (parts[2] === 'logout' && method === 'POST') {
            await destroySession(env, getSessionToken(request));
            return json({ ok: true }, { headers: { 'Set-Cookie': clearCookieHeader() } });
        }
        if (parts[2] === 'me' && method === 'GET') {
            const user = await getSessionUser(env, request);
            return json({ username: user || null });
        }
        return json({ error: 'Not found' }, { status: 404 });
    }

    // ---- Store (content singleton/array types) ----
    if (seg === 'store') {
        const type = parts[2];
        if (!type || !STORE_TYPES.includes(type)) return json({ error: 'Unknown store type' }, { status: 400 });
        if (method === 'GET') {
            const data = await getStore(env, type);
            return json({ type, data });
        }
        if (method === 'PUT') {
            const denied = await requireAuth(env, request);
            if (denied) return denied;
            const body = await request.json().catch(() => null);
            if (body === null || !('data' in body)) return json({ error: 'Body harus { data: ... }' }, { status: 400 });
            const saved = await setStore(env, type, body.data);
            return json({ ok: true, type, data: saved });
        }
        return json({ error: 'Method not allowed' }, { status: 405 });
    }

    if (seg === 'store-all' && method === 'GET') {
        return json(await getAllStore(env));
    }

    // ---- Berita ----
    if (seg === 'berita') {
        const id = parts[2];
        if (!id && method === 'GET') {
            const denied = await requireAuth(env, request);
            if (denied) return denied;
            return json({ items: await listBeritaAll(env) });
        }
        if (!id && method === 'POST') {
            const denied = await requireAuth(env, request);
            if (denied) return denied;
            const body = await request.json().catch(() => ({}));
            if (!body.slug || !body.title) return json({ error: 'slug dan title wajib diisi' }, { status: 400 });
            const savedId = await upsertBerita(env, body);
            return json({ ok: true, id: savedId });
        }
        if (id && id !== 'comments' && method === 'GET') {
            const denied = await requireAuth(env, request);
            if (denied) return denied;
            const art = await getBeritaById(env, id);
            if (!art) return json({ error: 'Not found' }, { status: 404 });
            return json({ item: art });
        }
        if (id && method === 'DELETE') {
            const denied = await requireAuth(env, request);
            if (denied) return denied;
            await deleteBerita(env, id);
            return json({ ok: true });
        }
        return json({ error: 'Not found' }, { status: 404 });
    }

    // ---- Komentar berita ----
    // GET  /api/comments/:beritaId       -> daftar komentar (admin)
    // POST /api/comments/:beritaSlug     -> publik kirim komentar (slug artikel published)
    // DELETE /api/comments/:commentId    -> admin hapus
    if (seg === 'comments') {
        const identifier = parts[2];
        if (method === 'GET' && identifier) {
            const denied = await requireAuth(env, request);
            if (denied) return denied;
            return json({ items: await listCommentsForBerita(env, identifier) });
        }
        if (method === 'POST' && identifier) {
            const art = await getBeritaBySlug(env, identifier, { publicOnly: true });
            if (!art) return json({ error: 'Artikel tidak ditemukan' }, { status: 404 });
            const body = await request.json().catch(() => ({}));
            if (!body.message || !body.message.trim()) return json({ error: 'Komentar tidak boleh kosong' }, { status: 400 });
            await addComment(env, art.id, body);
            return json({ ok: true });
        }
        if (method === 'DELETE' && identifier) {
            const denied = await requireAuth(env, request);
            if (denied) return denied;
            await deleteComment(env, identifier);
            return json({ ok: true });
        }
        return json({ error: 'Not found' }, { status: 404 });
    }

    // ---- Custom sections (halaman kustom) ----
    if (seg === 'custom-sections') {
        const id = parts[2];
        if (!id && method === 'GET') {
            const denied = await requireAuth(env, request);
            if (denied) return denied;
            return json({ items: await listCustomSections(env) });
        }
        if (!id && method === 'POST') {
            const denied = await requireAuth(env, request);
            if (denied) return denied;
            const body = await request.json().catch(() => ({}));
            if (!body.slug || !body.title) return json({ error: 'slug dan title wajib diisi' }, { status: 400 });
            const savedId = await upsertCustomSection(env, body);
            return json({ ok: true, id: savedId });
        }
        if (id && method === 'DELETE') {
            const denied = await requireAuth(env, request);
            if (denied) return denied;
            await deleteCustomSection(env, id);
            return json({ ok: true });
        }
        return json({ error: 'Not found' }, { status: 404 });
    }

    // ---- Ganti kredensial admin ----
    if (seg === 'admin' && parts[2] === 'credentials' && method === 'POST') {
        const denied = await requireAuth(env, request);
        if (denied) return denied;
        const user = await getSessionUser(env, request);
        const body = await request.json().catch(() => ({}));
        const row = await env.DB.prepare('SELECT password_hash FROM admin WHERE username = ?').bind(user).first();
        if (!row || !(await verifyPassword(body.currentPassword || '', row.password_hash))) {
            return json({ error: 'Password saat ini salah' }, { status: 401 });
        }
        const newUsername = (body.newUsername || user).trim();
        const newHash = body.newPassword ? await hashPassword(body.newPassword) : row.password_hash;
        await env.DB.prepare('UPDATE admin SET username = ?, password_hash = ?, updated_at = datetime(\'now\') WHERE username = ?')
            .bind(newUsername, newHash, user).run();
        return json({ ok: true, username: newUsername });
    }

    return json({ error: 'Not found' }, { status: 404 });
}

// =========================================================================
// SSR pages
// =========================================================================

async function loadCommon(env) {
    const store = await getAllStore(env);
    return store;
}

async function renderLanding(env, url) {
    const s = await loadCommon(env);
    const siteUrl = env.SITE_URL || url.origin;
    const latestNews = (await listBeritaPublished(env, { page: 1, perPage: 3 })).items;
    const customSections = (await listCustomSections(env)).filter((c) => c.active);

    const heroImg = (s.hero.images && s.hero.images[0]) || 'https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&q=80&w=1000&h=800';

    const body = `
<section class="relative pt-10 pb-20 overflow-hidden">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
    <div>
      <span class="inline-block px-4 py-1.5 rounded-full bg-blue-50 text-primary text-xs font-semibold mb-6">${esc(s.hero.badge)}</span>
      <h1 class="text-4xl sm:text-5xl font-extrabold text-slateDark leading-tight mb-6">${esc(s.hero.headlinePrefix)} <span class="text-primary">${esc(s.hero.headlineHighlight)}</span></h1>
      <p class="text-slateMuted text-lg mb-8 leading-relaxed">${esc(s.hero.subtitle)}</p>
      <div class="flex flex-wrap gap-4 mb-10">
        <a href="/profil" class="px-6 py-3 rounded-xl bg-primary text-white font-medium shadow-soft hover:bg-primaryHover transition">${esc(s.hero.ctaPrimary)}</a>
        <a href="/program" class="px-6 py-3 rounded-xl border border-slate-200 text-slateDark font-medium hover:bg-slate-50 transition">${esc(s.hero.ctaSecondary)}</a>
      </div>
      <div class="grid grid-cols-3 gap-4">
        ${(s.hero.stats || []).map((st) => `<div><p class="text-2xl font-extrabold text-primary">${esc(st.value)}</p><p class="text-xs text-slateMuted">${esc(st.label)}</p></div>`).join('')}
      </div>
    </div>
    <div class="relative">
      <img src="${esc(heroImg)}" alt="${esc(s.meta.schoolName)}" class="rounded-3xl shadow-glass w-full h-[420px] object-cover">
      <div class="absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-glass p-4 flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><i data-lucide="award" class="w-5 h-5 text-emerald-600"></i></div>
        <div><p class="font-bold text-sm text-slateDark">${esc(s.hero.badge1Title)}</p><p class="text-xs text-slateMuted">${esc(s.hero.badge1Subtitle)}</p></div>
      </div>
    </div>
  </div>
</section>

<section id="sambutan" class="py-20 bg-white">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-3 gap-10 items-center">
    <img src="${esc(s.sambutan.photo || '')}" alt="${esc(s.sambutan.name)}" class="rounded-2xl w-full h-64 object-cover md:col-span-1">
    <div class="md:col-span-2">
      <span class="text-xs font-semibold text-primary">${esc(s.sambutan.badge)}</span>
      <h2 class="text-3xl font-bold text-slateDark mt-2 mb-4">${esc(s.sambutan.titlePrefix)} <span class="text-primary">${esc(s.sambutan.titleHighlight)}</span></h2>
      ${(s.sambutan.paragraphs || []).map((p) => `<p class="text-slateMuted mb-3 text-justify">${esc(p)}</p>`).join('')}
      <p class="font-bold text-slateDark mt-4">${esc(s.sambutan.name)}</p>
      <p class="text-sm text-slateMuted">${esc(s.sambutan.role)}</p>
    </div>
  </div>
</section>

<section id="program" class="py-20">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center max-w-2xl mx-auto mb-12">
      <span class="text-xs font-semibold text-primary">${esc(s.programHeader.eyebrow)}</span>
      <h2 class="text-3xl font-bold text-slateDark mt-2">${esc(s.programHeader.title)}</h2>
      <p class="text-slateMuted mt-3">${esc(s.programHeader.subtitle)}</p>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
      ${(s.program || []).slice(0, 4).map((p) => `<div class="inst-card p-6"><div class="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4"><i data-lucide="${esc(p.icon)}" class="w-6 h-6 text-primary"></i></div><h3 class="font-bold text-slateDark mb-2">${esc(p.title)}</h3><p class="text-sm text-slateMuted">${esc(p.desc)}</p></div>`).join('')}
    </div>
    <div class="text-center mt-10"><a href="/program" class="text-primary font-medium hover:underline">Lihat Semua Program &rarr;</a></div>
  </div>
</section>

<section id="pengajar" class="py-20 bg-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center max-w-2xl mx-auto mb-12">
      <span class="text-xs font-semibold text-primary">${esc(s.guruHeader.eyebrow)}</span>
      <h2 class="text-3xl font-bold text-slateDark mt-2">${esc(s.guruHeader.titlePrefix)} <span class="text-primary">${esc(s.guruHeader.titleHighlight)}</span></h2>
      <p class="text-slateMuted mt-3">${esc(s.guruHeader.subtitle)}</p>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
      ${(s.guru || []).slice(0, 4).map((g) => `<div class="inst-card p-6 text-center"><img src="${esc(g.photo || 'https://i.pravatar.cc/150')}" class="w-20 h-20 rounded-full object-cover mx-auto mb-4"><h3 class="font-bold text-slateDark">${esc(g.name)}</h3><p class="text-xs text-primary font-medium mb-1">${esc(g.role)}</p><p class="text-xs text-slateMuted">${esc(g.education)}</p></div>`).join('')}
    </div>
    <div class="text-center mt-10"><a href="/guru" class="text-primary font-medium hover:underline">Lihat Semua Tenaga Pendidik &rarr;</a></div>
  </div>
</section>

<section id="berita" class="py-20">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center max-w-2xl mx-auto mb-12">
      <span class="text-xs font-semibold text-primary">${esc(s.beritaHeader.eyebrow)}</span>
      <h2 class="text-3xl font-bold text-slateDark mt-2">${esc(s.beritaHeader.titlePrefix)}</h2>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      ${latestNews.map((a) => `<a href="/berita/${esc(a.slug)}" class="inst-card overflow-hidden block">
        <img src="${esc(a.coverImage || 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&q=80&w=600&h=400')}" class="w-full h-44 object-cover">
        <div class="p-5"><span class="text-xs text-primary font-semibold">${esc(a.category || '')}</span><h3 class="font-bold text-slateDark mt-2 mb-2 line-clamp-2">${esc(a.title)}</h3><p class="text-xs text-slateMuted">${esc(a.dateDisplay || '')}</p></div>
      </a>`).join('') || '<p class="text-slateMuted col-span-3 text-center">Belum ada berita.</p>'}
    </div>
    <div class="text-center mt-10"><a href="/berita" class="text-primary font-medium hover:underline">Lihat Semua Berita &rarr;</a></div>
  </div>
</section>

${customSections.length ? customSections.map((cs) => renderCustomSectionBlock(cs)).join('') : ''}

<section id="testimoni" class="py-20 bg-white">
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
    <h2 class="text-3xl font-bold text-slateDark mb-10">${esc(s.testimoniHeader.title)}</h2>
    ${(s.testimoni || []).slice(0, 1).map((t) => `<blockquote class="text-lg text-slateMuted italic mb-6">"${esc(t.quote)}"</blockquote><img src="${esc(t.photo || '')}" class="w-14 h-14 rounded-full object-cover mx-auto mb-2"><p class="font-bold text-slateDark">${esc(t.name)}</p><p class="text-xs text-slateMuted">${esc(t.role)}</p>`).join('')}
  </div>
</section>

<section id="faq" class="py-20">
  <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
    <h2 class="text-3xl font-bold text-slateDark text-center mb-10">${esc(s.beritaHeader ? 'FAQ & Kontak' : '')}</h2>
    <div class="space-y-4">
      ${(s.faq || []).map((f) => `<details class="inst-card p-5"><summary class="font-semibold text-slateDark cursor-pointer">${esc(f.q)}</summary><p class="text-sm text-slateMuted mt-3">${esc(f.a)}</p></details>`).join('')}
    </div>
    <div class="text-center mt-10"><a href="/kontak" class="text-primary font-medium hover:underline">Lihat Kontak Lengkap &rarr;</a></div>
  </div>
</section>`;

    const head = pageHead({
        title: s.meta.pageTitle,
        description: s.hero.subtitle,
        url: siteUrl + '/',
        siteUrl,
        jsonLd: schoolJsonLd({ meta: s.meta, kontak: s.kontak, siteUrl }),
    });
    const html = layout({ head, bodyContent: body, meta: s.meta, pageOrder: s.pageOrder, activeKey: 'beranda', footerData: s.footer });
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

function renderCustomSectionBlock(cs) {
    const bg = cs.bgStyle === 'gray' ? 'bg-slate-50' : 'bg-white';
    const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[cs.columns] || 'sm:grid-cols-2 lg:grid-cols-3';
    return `<section class="py-20 ${bg}">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center max-w-2xl mx-auto mb-12">
      <span class="text-xs font-semibold text-primary">${esc(cs.eyebrow)}</span>
      <h2 class="text-3xl font-bold text-slateDark mt-2">${esc(cs.title)}</h2>
      <p class="text-slateMuted mt-3">${esc(cs.subtitle)}</p>
    </div>
    <div class="grid ${cols} gap-6">
      ${(cs.items || []).map((it) => `<div class="inst-card p-6"><div class="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4"><i data-lucide="${esc(it.icon || 'star')}" class="w-6 h-6 text-primary"></i></div><h3 class="font-bold text-slateDark mb-2">${esc(it.title)}</h3><p class="text-sm text-slateMuted">${esc(it.desc)}</p></div>`).join('')}
    </div>
  </div>
</section>`;
}

async function renderCustomSection(env, url, cs) {
    const s = await loadCommon(env);
    const siteUrl = env.SITE_URL || url.origin;
    const body = `<div class="pt-10">${renderCustomSectionBlock(cs)}</div>`;
    const head = pageHead({
        title: `${cs.title} - ${s.meta.schoolName}`,
        description: cs.subtitle,
        url: `${siteUrl}/${cs.slug}`,
        siteUrl,
    });
    const html = layout({ head, bodyContent: body, meta: s.meta, pageOrder: s.pageOrder, activeKey: `custom:${cs.slug}`, footerData: s.footer });
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

async function renderBeritaList(env, url) {
    const s = await loadCommon(env);
    const siteUrl = env.SITE_URL || url.origin;
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const { items, total, perPage } = await listBeritaPublished(env, { page, perPage: 9 });
    const totalPages = Math.max(1, Math.ceil(total / perPage));

    const body = `
<section class="py-16">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center max-w-2xl mx-auto mb-12">
      <span class="text-xs font-semibold text-primary">${esc(s.beritaHeader.eyebrow)}</span>
      <h1 class="text-3xl font-bold text-slateDark mt-2">${esc(s.beritaHeader.titlePrefix)}</h1>
      <p class="text-slateMuted mt-3">${esc(s.beritaHeader.subtitle)}</p>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      ${items.map((a) => `<a href="/berita/${esc(a.slug)}" class="inst-card overflow-hidden block">
        <img src="${esc(a.coverImage || 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&q=80&w=600&h=400')}" class="w-full h-44 object-cover">
        <div class="p-5"><span class="text-xs text-primary font-semibold">${esc(a.category || '')}</span><h3 class="font-bold text-slateDark mt-2 mb-2 line-clamp-2">${esc(a.title)}</h3><p class="text-sm text-slateMuted line-clamp-2 mb-2">${esc(a.excerpt || '')}</p><p class="text-xs text-slateMuted">${esc(a.dateDisplay || '')}</p></div>
      </a>`).join('') || '<p class="text-slateMuted col-span-3 text-center">Belum ada berita.</p>'}
    </div>
    ${totalPages > 1 ? `<div class="flex justify-center gap-2 mt-12">
      ${Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => `<a href="/berita?page=${p}" class="w-10 h-10 flex items-center justify-center rounded-lg ${p === page ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slateDark hover:bg-slate-50'}">${p}</a>`).join('')}
    </div>` : ''}
  </div>
</section>`;

    const head = pageHead({
        title: `Berita & Artikel - ${s.meta.schoolName}`,
        description: s.beritaHeader.subtitle,
        url: `${siteUrl}/berita${page > 1 ? `?page=${page}` : ''}`,
        siteUrl,
    });
    const html = layout({ head, bodyContent: body, meta: s.meta, pageOrder: s.pageOrder, activeKey: 'berita', footerData: s.footer });
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

async function renderBeritaDetail(env, url, slug) {
    const s = await loadCommon(env);
    const siteUrl = env.SITE_URL || url.origin;
    const art = await getBeritaBySlug(env, slug, { publicOnly: true });
    if (!art) return new Response('Artikel tidak ditemukan', { status: 404 });
    const comments = await listCommentsForBerita(env, art.id);

    const body = `
<article class="py-16">
  <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
    <span class="text-xs font-semibold text-primary">${esc(art.category || '')}</span>
    <h1 class="text-3xl sm:text-4xl font-extrabold text-slateDark mt-2 mb-4">${esc(art.title)}</h1>
    <div class="flex items-center gap-3 text-xs text-slateMuted mb-8">
      <span>${esc(art.author || 'Admin')}</span><span>&bull;</span><span>${esc(art.dateDisplay || '')}</span>
    </div>
    ${art.coverImage ? `<img src="${esc(art.coverImage)}" class="w-full h-80 object-cover rounded-2xl mb-8">` : ''}
    <div class="prose max-w-none text-slateDark">${nl2p(art.content)}</div>
    ${art.tags ? `<div class="flex flex-wrap gap-2 mt-8">${art.tags.split(',').map((t) => `<span class="px-3 py-1 rounded-full bg-slate-100 text-xs text-slateMuted">#${esc(t.trim())}</span>`).join('')}</div>` : ''}

    <div class="mt-16 border-t border-slate-200 pt-10">
      <h2 class="font-bold text-slateDark mb-6">Komentar (${comments.length})</h2>
      <div class="space-y-4 mb-8">
        ${comments.map((c) => `<div class="inst-card p-4"><p class="font-semibold text-sm text-slateDark">${esc(c.name || 'Anonim')}</p><p class="text-sm text-slateMuted mt-1">${esc(c.message)}</p></div>`).join('') || '<p class="text-sm text-slateMuted">Belum ada komentar. Jadilah yang pertama!</p>'}
      </div>
      <form id="comment-form" class="inst-card p-6 space-y-3">
        <div class="grid sm:grid-cols-2 gap-3">
          <input type="text" name="name" placeholder="Nama (opsional)" class="border border-slate-200 rounded-lg px-4 py-2 text-sm">
          <input type="email" name="email" placeholder="Email (opsional)" class="border border-slate-200 rounded-lg px-4 py-2 text-sm">
        </div>
        <textarea name="message" required placeholder="Tulis komentar Anda..." class="w-full border border-slate-200 rounded-lg px-4 py-2 text-sm" rows="3"></textarea>
        <button type="submit" class="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primaryHover transition">Kirim Komentar</button>
        <p id="comment-msg" class="text-sm hidden"></p>
      </form>
    </div>
  </div>
</article>
<script>
document.getElementById('comment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const msgEl = document.getElementById('comment-msg');
  try {
    const res = await fetch('/api/comments/${esc(art.slug)}', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fd.get('name'), email: fd.get('email'), message: fd.get('message') })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengirim komentar');
    msgEl.textContent = 'Komentar terkirim! Muat ulang halaman untuk melihatnya.';
    msgEl.className = 'text-sm text-emerald-600';
    e.target.reset();
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.className = 'text-sm text-red-600';
  }
  msgEl.classList.remove('hidden');
});
</script>`;

    const head = pageHead({
        title: `${art.title} - ${s.meta.schoolName}`,
        description: art.metaDescription || art.excerpt,
        url: `${siteUrl}/berita/${art.slug}`,
        image: art.ogImage,
        siteUrl,
        type: 'article',
        jsonLd: articleJsonLd({ art, siteUrl }),
    });
    const html = layout({ head, bodyContent: body, meta: s.meta, pageOrder: s.pageOrder, activeKey: 'berita', footerData: s.footer });
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

async function renderSitemap(env, url) {
    const siteUrl = env.SITE_URL || url.origin;
    const staticPages = ['', 'profil', 'program', 'guru', 'prestasi', 'berita', 'galeri', 'kontak'];
    const news = await listBeritaAll(env);
    const publishedNews = news.filter((a) => a.status === 'published' && (!a.publishAt || new Date(a.publishAt).getTime() <= Date.now()));
    const customs = (await listCustomSections(env)).filter((c) => c.active);

    const urls = [
        ...staticPages.map((p) => ({ loc: `${siteUrl}/${p}`, changefreq: 'weekly' })),
        ...publishedNews.map((a) => ({ loc: `${siteUrl}/berita/${a.slug}`, lastmod: (a.updatedAt || '').slice(0, 10), changefreq: 'monthly' })),
        ...customs.map((c) => ({ loc: `${siteUrl}/${c.slug}`, changefreq: 'monthly' })),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.changefreq}</changefreq></url>`).join('\n')}
</urlset>`;

    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=UTF-8' } });
}
