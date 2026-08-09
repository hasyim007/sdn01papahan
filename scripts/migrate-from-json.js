#!/usr/bin/env node
/**
 * scripts/migrate-from-json.js
 * ---------------------------------------------------------------------
 * Migrasi data lama (objek DB dari localStorage SPA lama) ke D1.
 *
 * CARA PAKAI:
 * 1. Di browser, buka situs SPA LAMA, lalu di DevTools Console jalankan:
 *      copy(localStorage.getItem('sdn01papahan_cms_db_v1'))
 *    Ini akan menyalin JSON DB lama ke clipboard.
 * 2. Paste ke file baru: scripts/db-export.json (di root project baru ini).
 * 3. Jalankan:
 *      node scripts/migrate-from-json.js scripts/db-export.json admin_password_baru
 *    (Argumen ke-2 = password admin BARU yang ingin dipakai, WAJIB diisi
 *    supaya tidak ada password polos yang ikut ter-commit ke git.)
 * 4. Script ini akan membuat file scripts/migration-data.sql
 * 5. Jalankan ke D1:
 *      npx wrangler d1 execute sdn01-papahan-db --remote --file=./scripts/migration-data.sql
 * ---------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const inputPath = process.argv[2];
const newPassword = process.argv[3];

if (!inputPath || !newPassword) {
    console.error('Pemakaian: node scripts/migrate-from-json.js <path-ke-db-export.json> <password-admin-baru>');
    process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf-8');
const db = JSON.parse(raw);

function sqlStr(v) {
    if (v === null || v === undefined) return 'NULL';
    return `'${String(v).replace(/'/g, "''")}'`;
}
function sqlJson(v) {
    return sqlStr(JSON.stringify(v ?? null));
}
function sqlInt(v) {
    return v ? 1 : 0;
}

// ---- Hash password (format sama dengan src/lib/auth.js: PBKDF2-SHA256) ----
function hashPasswordSync(password) {
    const iterations = 100000;
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    return `${iterations}:${salt.toString('hex')}:${hash.toString('hex')}`;
}

const lines = [];
lines.push('-- Auto-generated oleh scripts/migrate-from-json.js — JANGAN commit ke git.');
lines.push('BEGIN TRANSACTION;');

// ---- admin ----
const adminUsername = (db.admin && db.admin.username) || 'admin';
const passwordHash = hashPasswordSync(newPassword);
lines.push(`DELETE FROM admin WHERE id = 1;`);
lines.push(`INSERT INTO admin (id, username, password_hash) VALUES (1, ${sqlStr(adminUsername)}, ${sqlStr(passwordHash)});`);

// ---- store (singleton/array types) ----
const STORE_TYPES = [
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
for (const type of STORE_TYPES) {
    if (!(type in db)) continue;
    lines.push(`INSERT INTO store (type, data) VALUES (${sqlStr(type)}, ${sqlJson(db[type])})
      ON CONFLICT(type) DO UPDATE SET data = excluded.data, updated_at = datetime('now');`);
}

// ---- berita ----
for (const art of db.berita || []) {
    const slug = art.slug || String(art.title || '').toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-') || art.id;
    lines.push(`INSERT INTO berita (id, slug, title, excerpt, content, cover_image, og_image, category, tags, author, meta_description, status, publish_at, date_display)
      VALUES (${sqlStr(art.id)}, ${sqlStr(slug)}, ${sqlStr(art.title)}, ${sqlStr(art.excerpt)}, ${sqlStr(art.content)}, ${sqlStr(art.image || art.coverImage || '')}, ${sqlStr(art.ogImage || art.image || '')}, ${sqlStr(art.category)}, ${sqlStr(art.tags)}, ${sqlStr(art.author || 'Admin')}, ${sqlStr(art.metaDescription || art.excerpt || '')}, ${sqlStr('published')}, NULL, ${sqlStr(art.date)})
      ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, title=excluded.title;`);
}

// ---- beritaComments (map: { beritaId: [{name,email,message,...}] } ) ----
const comments = db.beritaComments || {};
for (const beritaId of Object.keys(comments)) {
    for (const c of comments[beritaId] || []) {
        lines.push(`INSERT INTO berita_comments (berita_id, name, email, message) VALUES (${sqlStr(beritaId)}, ${sqlStr(c.name)}, ${sqlStr(c.email)}, ${sqlStr(c.message || c.text || '')});`);
    }
}

// ---- customSections ----
for (const cs of db.customSections || []) {
    const slug = cs.slug || String(cs.title || '').toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-') || cs.id;
    lines.push(`INSERT INTO custom_sections (id, slug, type, eyebrow, title, subtitle, bg_style, active, menu_label, columns, image, image_position, cta_label, cta_link, items_json)
      VALUES (${sqlStr(cs.id)}, ${sqlStr(slug)}, ${sqlStr(cs.type || 'cards')}, ${sqlStr(cs.eyebrow)}, ${sqlStr(cs.title)}, ${sqlStr(cs.subtitle)}, ${sqlStr(cs.bgStyle || 'gray')}, ${sqlInt(cs.active)}, ${sqlStr(cs.menuLabel || cs.title)}, ${cs.columns || 3}, ${sqlStr(cs.image)}, ${sqlStr(cs.imagePosition || 'right')}, ${sqlStr(cs.ctaLabel)}, ${sqlStr(cs.ctaLink)}, ${sqlJson(cs.items || [])})
      ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, title=excluded.title, items_json=excluded.items_json;`);
}

lines.push('COMMIT;');

const outPath = path.join(path.dirname(inputPath), 'migration-data.sql');
fs.writeFileSync(outPath, lines.join('\n\n'), 'utf-8');

console.log(`Selesai. File SQL dibuat di: ${outPath}`);
console.log(`Username admin: ${adminUsername} (password sudah di-hash dengan password baru yang Anda berikan)`);
console.log('Jalankan ke D1 dengan:');
console.log(`  npx wrangler d1 execute sdn01-papahan-db --remote --file=${outPath}`);
