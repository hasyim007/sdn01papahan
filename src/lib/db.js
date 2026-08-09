// =========================================================================
// db.js — helper akses D1. Pola `store`: 1 baris per type = JSON string.
// =========================================================================

export const STORE_TYPES = [
    'meta', 'hero', 'sambutan', 'profil',
    'programHeader', 'program',
    'guruHeader', 'guru',
    'prestasiHeader', 'prestasi',
    'ekskulHeader', 'ekskul',
    'beritaHeader',
    'agendaHeader', 'agenda',
    'galeriHeader', 'galeri',
    'testimoniHeader', 'testimoni',
    'faq', 'kontak', 'footer', 'pageOrder',
];

export async function getStore(env, type) {
    const row = await env.DB.prepare('SELECT data FROM store WHERE type = ?').bind(type).first();
    if (!row) return null;
    try { return JSON.parse(row.data); } catch { return null; }
}

export async function setStore(env, type, value) {
    const json = JSON.stringify(value);
    await env.DB.prepare(
        `INSERT INTO store (type, data, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(type) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).bind(type, json).run();
    return value;
}

/** Ambil semua store sekaligus (dipakai landing page & dashboard admin). */
export async function getAllStore(env) {
    const { results } = await env.DB.prepare('SELECT type, data FROM store').all();
    const out = {};
    for (const row of results) {
        try { out[row.type] = JSON.parse(row.data); } catch { out[row.type] = null; }
    }
    return out;
}

// ---------------------------------------------------------------------
// Berita
// ---------------------------------------------------------------------

function rowToBerita(row) {
    if (!row) return null;
    return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt,
        content: row.content,
        coverImage: row.cover_image,
        ogImage: row.og_image || row.cover_image,
        category: row.category,
        tags: row.tags,
        author: row.author,
        metaDescription: row.meta_description,
        status: row.status,
        publishAt: row.publish_at,
        dateDisplay: row.date_display,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function listBeritaPublished(env, { page = 1, perPage = 9 } = {}) {
    const nowIso = new Date().toISOString();
    const offset = (page - 1) * perPage;
    const { results } = await env.DB.prepare(
        `SELECT * FROM berita
         WHERE status = 'published' AND (publish_at IS NULL OR publish_at <= ?)
         ORDER BY COALESCE(publish_at, created_at) DESC
         LIMIT ? OFFSET ?`
    ).bind(nowIso, perPage, offset).all();
    const countRow = await env.DB.prepare(
        `SELECT COUNT(*) as c FROM berita WHERE status = 'published' AND (publish_at IS NULL OR publish_at <= ?)`
    ).bind(nowIso).first();
    return { items: results.map(rowToBerita), total: countRow.c, page, perPage };
}

export async function listBeritaAll(env) {
    const { results } = await env.DB.prepare('SELECT * FROM berita ORDER BY created_at DESC').all();
    return results.map(rowToBerita);
}

export async function getBeritaBySlug(env, slug, { publicOnly = true } = {}) {
    const row = await env.DB.prepare('SELECT * FROM berita WHERE slug = ?').bind(slug).first();
    if (!row) return null;
    const art = rowToBerita(row);
    if (publicOnly) {
        const now = Date.now();
        const isPublished = art.status === 'published' && (!art.publishAt || new Date(art.publishAt).getTime() <= now);
        if (!isPublished) return null;
    }
    return art;
}

export async function getBeritaById(env, id) {
    const row = await env.DB.prepare('SELECT * FROM berita WHERE id = ?').bind(id).first();
    return rowToBerita(row);
}

export async function upsertBerita(env, art) {
    const id = art.id || ('b_' + crypto.randomUUID().slice(0, 8));
    await env.DB.prepare(
        `INSERT INTO berita (id, slug, title, excerpt, content, cover_image, og_image, category, tags, author, meta_description, status, publish_at, date_display, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           slug=excluded.slug, title=excluded.title, excerpt=excluded.excerpt, content=excluded.content,
           cover_image=excluded.cover_image, og_image=excluded.og_image, category=excluded.category,
           tags=excluded.tags, author=excluded.author, meta_description=excluded.meta_description,
           status=excluded.status, publish_at=excluded.publish_at, date_display=excluded.date_display,
           updated_at=datetime('now')`
    ).bind(
        id, art.slug, art.title, art.excerpt || '', art.content || '',
        art.coverImage || '', art.ogImage || art.coverImage || '', art.category || '',
        art.tags || '', art.author || 'Admin', art.metaDescription || '',
        art.status || 'draft', art.publishAt || null, art.dateDisplay || ''
    ).run();
    return id;
}

export async function deleteBerita(env, id) {
    await env.DB.prepare('DELETE FROM berita WHERE id = ?').bind(id).run();
}

export async function listCommentsForBerita(env, beritaId) {
    const { results } = await env.DB.prepare('SELECT * FROM berita_comments WHERE berita_id = ? ORDER BY created_at DESC').bind(beritaId).all();
    return results;
}

export async function addComment(env, beritaId, { name, email, message }) {
    await env.DB.prepare('INSERT INTO berita_comments (berita_id, name, email, message) VALUES (?,?,?,?)')
        .bind(beritaId, name || null, email || null, message).run();
}

export async function deleteComment(env, commentId) {
    await env.DB.prepare('DELETE FROM berita_comments WHERE id = ?').bind(commentId).run();
}

// ---------------------------------------------------------------------
// Custom sections (halaman kustom)
// ---------------------------------------------------------------------

function rowToCustomSection(row) {
    if (!row) return null;
    let items = [];
    try { items = JSON.parse(row.items_json || '[]'); } catch { items = []; }
    return {
        id: row.id,
        slug: row.slug,
        type: row.type,
        eyebrow: row.eyebrow,
        title: row.title,
        subtitle: row.subtitle,
        bgStyle: row.bg_style,
        active: !!row.active,
        menuLabel: row.menu_label,
        columns: row.columns,
        image: row.image,
        imagePosition: row.image_position,
        ctaLabel: row.cta_label,
        ctaLink: row.cta_link,
        items,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function listCustomSections(env) {
    const { results } = await env.DB.prepare('SELECT * FROM custom_sections ORDER BY created_at ASC').all();
    return results.map(rowToCustomSection);
}

export async function getCustomSectionBySlug(env, slug) {
    const row = await env.DB.prepare('SELECT * FROM custom_sections WHERE slug = ? AND active = 1').bind(slug).first();
    return rowToCustomSection(row);
}

export async function upsertCustomSection(env, cs) {
    const id = cs.id || ('cs_' + crypto.randomUUID().slice(0, 8));
    await env.DB.prepare(
        `INSERT INTO custom_sections (id, slug, type, eyebrow, title, subtitle, bg_style, active, menu_label, columns, image, image_position, cta_label, cta_link, items_json, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           slug=excluded.slug, type=excluded.type, eyebrow=excluded.eyebrow, title=excluded.title,
           subtitle=excluded.subtitle, bg_style=excluded.bg_style, active=excluded.active,
           menu_label=excluded.menu_label, columns=excluded.columns, image=excluded.image,
           image_position=excluded.image_position, cta_label=excluded.cta_label, cta_link=excluded.cta_link,
           items_json=excluded.items_json, updated_at=datetime('now')`
    ).bind(
        id, cs.slug, cs.type || 'cards', cs.eyebrow || '', cs.title || '', cs.subtitle || '',
        cs.bgStyle || 'gray', cs.active ? 1 : 0, cs.menuLabel || cs.title || '', cs.columns || 3,
        cs.image || '', cs.imagePosition || 'right', cs.ctaLabel || '', cs.ctaLink || '',
        JSON.stringify(cs.items || [])
    ).run();
    return id;
}

export async function deleteCustomSection(env, id) {
    await env.DB.prepare('DELETE FROM custom_sections WHERE id = ?').bind(id).run();
}
