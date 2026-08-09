// =========================================================================
// Helper akses D1. Pola "store": 1 baris per key, value = JSON string.
// =========================================================================

const STORE_KEYS = [
  'meta', 'hero', 'sambutan', 'profil',
  'programHeader', 'program',
  'guruHeader', 'guru',
  'prestasiHeader', 'prestasi',
  'ekskulHeader', 'ekskul',
  'beritaHeader',
  'agendaHeader', 'agenda',
  'galeriHeader', 'galeri',
  'testimoniHeader', 'testimoni',
  'faq', 'kontak', 'footer', 'pageOrder'
];

export async function getStoreValue(env, key) {
  const row = await env.DB.prepare('SELECT value FROM store WHERE key = ?').bind(key).first();
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

export async function setStoreValue(env, key, value) {
  const json = JSON.stringify(value);
  await env.DB.prepare(
    `INSERT INTO store (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).bind(key, json).run();
}

// Ambil seluruh data publik (semua key store + berita published + custom_sections aktif).
// Dipakai oleh /api/public/data untuk halaman statis, dan oleh Worker saat
// merender landing page / berita / custom pages.
export async function getPublicData(env) {
  const rows = await env.DB.prepare('SELECT key, value FROM store').all();
  const data = {};
  for (const r of rows.results) {
    try { data[r.key] = JSON.parse(r.value); } catch { /* skip */ }
  }
  const now = new Date().toISOString();
  const beritaRows = await env.DB.prepare(
    `SELECT * FROM berita WHERE status = 'published' AND publish_at <= ? ORDER BY publish_at DESC`
  ).bind(now).all();
  data.berita = beritaRows.results.map(mapBeritaRow);

  const customRows = await env.DB.prepare(
    `SELECT * FROM custom_sections WHERE active = 1 ORDER BY sort_order ASC`
  ).all();
  data.customSections = customRows.results.map(mapCustomRow);

  return data;
}

// Ambil seluruh data (termasuk draft/scheduled) untuk keperluan admin.
export async function getAdminData(env) {
  const rows = await env.DB.prepare('SELECT key, value FROM store').all();
  const data = {};
  for (const r of rows.results) {
    try { data[r.key] = JSON.parse(r.value); } catch { /* skip */ }
  }
  const beritaRows = await env.DB.prepare(`SELECT * FROM berita ORDER BY publish_at DESC`).all();
  data.berita = beritaRows.results.map(mapBeritaRow);
  const customRows = await env.DB.prepare(`SELECT * FROM custom_sections ORDER BY sort_order ASC`).all();
  data.customSections = customRows.results.map(mapCustomRow);
  return data;
}

export function mapBeritaRow(b) {
  return {
    id: b.id, slug: b.slug, title: b.title, excerpt: b.excerpt, content: b.content,
    category: b.category, tags: b.tags, author: b.author, coverImage: b.cover_image,
    metaDescription: b.meta_description, status: b.status, publishAt: b.publish_at,
    date: formatTanggalIndo(b.publish_at)
  };
}

export function mapCustomRow(c) {
  let items = [];
  try { items = JSON.parse(c.items_json); } catch { /* skip */ }
  return {
    id: c.id, slug: c.slug, type: c.type, eyebrow: c.eyebrow, title: c.title,
    subtitle: c.subtitle, bgStyle: c.bg_style, active: !!c.active, menuLabel: c.menu_label,
    columns: c.columns, items, image: c.image, imagePosition: c.image_position,
    ctaLabel: c.cta_label, ctaLink: c.cta_link
  };
}

export function formatTanggalIndo(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

export async function getBeritaBySlug(env, slug) {
  const row = await env.DB.prepare('SELECT * FROM berita WHERE slug = ?').bind(slug).first();
  return row ? mapBeritaRow(row) : null;
}

export async function getCustomBySlug(env, slug) {
  const row = await env.DB.prepare('SELECT * FROM custom_sections WHERE slug = ? AND active = 1').bind(slug).first();
  return row ? mapCustomRow(row) : null;
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'halaman';
}

export { STORE_KEYS };
