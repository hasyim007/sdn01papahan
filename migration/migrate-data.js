#!/usr/bin/env node
// =========================================================================
// Migrasi data dari objek DB lama (hasil export localStorage SPA, format
// sama dengan DEFAULT_DB di index.html lama) menjadi migration/seed.sql
// yang siap dijalankan lewat: wrangler d1 execute ... --file=seed.sql
//
// Cara pakai:
//   1. Buka situs SPA lama di browser -> Console -> jalankan:
//        copy(localStorage.getItem('sdn01papahan_db'))
//      (sesuaikan STORAGE_KEY jika berbeda di file lama Anda)
//   2. Tempel hasilnya ke file migration/old-db-export.json
//   3. Jalankan: node migration/migrate-data.js
//   4. Hasilnya: migration/seed.sql — jalankan dengan
//        npm run db:seed:local   (untuk tes lokal)
//        npm run db:seed:remote  (untuk produksi, setelah db:migrate:remote)
// =========================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INPUT = path.join(__dirname, 'old-db-export.json');
const OUTPUT = path.join(__dirname, 'seed.sql');
const ITERATIONS = 100000;

function sqlEscape(str) {
  return String(str ?? '').replace(/'/g, "''");
}

function hashPasswordSync(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  return `pbkdf2$${ITERATIONS}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function slugify(text) {
  return String(text || '')
    .toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'halaman';
}

if (!fs.existsSync(INPUT)) {
  console.error(`File ${INPUT} tidak ditemukan.`);
  console.error('Ekspor dulu data lama (lihat komentar di bagian atas file ini), lalu simpan sebagai migration/old-db-export.json');
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const lines = [];

lines.push('-- File ini di-generate otomatis oleh migration/migrate-data.js — jangan diedit manual.');
lines.push('BEGIN TRANSACTION;');

// ---- store (key/value JSON) ----
const STORE_KEYS = [
  'meta', 'hero', 'sambutan', 'profil', 'programHeader', 'program', 'guruHeader', 'guru',
  'prestasiHeader', 'prestasi', 'ekskulHeader', 'ekskul', 'beritaHeader', 'agendaHeader',
  'agenda', 'galeriHeader', 'galeri', 'testimoniHeader', 'testimoni', 'faq', 'kontak',
  'footer', 'pageOrder'
];
STORE_KEYS.forEach(key => {
  if (db[key] === undefined) return;
  const json = JSON.stringify(db[key]);
  lines.push(`INSERT INTO store (key, value) VALUES ('${sqlEscape(key)}', '${sqlEscape(json)}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;`);
});

// ---- berita ----
(db.berita || []).forEach((b, i) => {
  const id = b.id || `b_migrated_${i}_${Date.now()}`;
  const slug = slugify(b.slug || b.title || id);
  lines.push(`INSERT INTO berita (id, slug, title, excerpt, content, category, tags, author, cover_image, meta_description, status, publish_at)
  VALUES ('${sqlEscape(id)}', '${sqlEscape(slug)}', '${sqlEscape(b.title)}', '${sqlEscape(b.excerpt)}', '${sqlEscape(b.content)}',
  '${sqlEscape(b.category)}', '${sqlEscape(b.tags)}', '${sqlEscape(b.author || 'Admin')}', '${sqlEscape(b.coverImage || b.image || '')}',
  '${sqlEscape(b.metaDescription || b.excerpt || '')}', '${sqlEscape(b.status || 'published')}',
  '${sqlEscape(b.publishAt || new Date().toISOString())}');`);
});

// ---- komentar berita ----
Object.entries(db.beritaComments || {}).forEach(([beritaId, comments]) => {
  (comments || []).forEach((c, i) => {
    const id = `bc_${beritaId}_${i}_${Date.now()}`;
    lines.push(`INSERT INTO berita_comments (id, berita_id, name, message) VALUES
    ('${sqlEscape(id)}', '${sqlEscape(beritaId)}', '${sqlEscape(c.name || 'Anonim')}', '${sqlEscape(c.message || c.text || '')}');`);
  });
});

// ---- custom sections ----
(db.customSections || []).forEach((c, i) => {
  const id = c.id || `cs_migrated_${i}`;
  const slug = slugify(c.slug || c.title || id);
  lines.push(`INSERT INTO custom_sections
  (id, slug, type, eyebrow, title, subtitle, bg_style, active, menu_label, columns, items_json, image, image_position, cta_label, cta_link, sort_order)
  VALUES ('${sqlEscape(id)}', '${sqlEscape(slug)}', '${sqlEscape(c.type || 'cards')}', '${sqlEscape(c.eyebrow)}', '${sqlEscape(c.title)}',
  '${sqlEscape(c.subtitle)}', '${sqlEscape(c.bgStyle || 'gray')}', ${c.active === false ? 0 : 1}, '${sqlEscape(c.menuLabel || c.title)}',
  ${c.columns || 3}, '${sqlEscape(JSON.stringify(c.items || []))}', '${sqlEscape(c.image || '')}', '${sqlEscape(c.imagePosition || 'right')}',
  '${sqlEscape(c.ctaLabel || '')}', '${sqlEscape(c.ctaLink || '')}', ${i});`);
});

// ---- admin user (password di-hash, TIDAK pernah disimpan polos) ----
const adminUsername = (db.admin && db.admin.username) || 'admin';
const adminPassword = (db.admin && db.admin.password) || 'admin123';
const hash = hashPasswordSync(adminPassword);
const adminId = 'admin_' + Date.now();
lines.push(`INSERT INTO admin_users (id, username, password_hash) VALUES
('${sqlEscape(adminId)}', '${sqlEscape(adminUsername)}', '${sqlEscape(hash)}')
ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash;`);

lines.push('COMMIT;');

fs.writeFileSync(OUTPUT, lines.join('\n\n') + '\n', 'utf8');
console.log(`Selesai. ${OUTPUT} dibuat dari ${INPUT}.`);
console.log(`Username admin: ${adminUsername} (password sesuai data lama, sudah di-hash di database).`);
console.log('Jalankan salah satu:');
console.log('  npm run db:seed:local   # untuk tes lokal (wrangler dev)');
console.log('  npm run db:seed:remote  # untuk database produksi di Cloudflare');
