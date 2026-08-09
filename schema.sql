-- =========================================================================
-- SDN 01 Papahan — schema.sql (Cloudflare D1 / SQLite)
-- Pola: 1 baris per "type" berisi JSON string di tabel `store` untuk data
-- yang jarang di-query satuan. Tabel relasional sendiri untuk `berita` dan
-- `custom_sections` karena Worker perlu query per-slug yang efisien.
-- =========================================================================

-- -------------------------------------------------------------------------
-- store: konten singleton / list kecil yang selalu dibaca utuh
-- type contoh: 'meta','hero','sambutan','profil','programHeader','program',
--   'guruHeader','guru','prestasiHeader','prestasi','ekskulHeader','ekskul',
--   'beritaHeader','agendaHeader','agenda','galeriHeader','galeri',
--   'testimoniHeader','testimoni','faq','kontak','footer','pageOrder'
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store (
    type       TEXT PRIMARY KEY,
    data       TEXT NOT NULL,          -- JSON string (object atau array)
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -------------------------------------------------------------------------
-- admin: kredensial admin (hash, bukan plain text)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin (
    id            INTEGER PRIMARY KEY CHECK (id = 1), -- single-row (single admin account)
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,        -- PBKDF2/SHA-256 hash, format: iterations:saltHex:hashHex
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -------------------------------------------------------------------------
-- sessions: session cookie admin (server-side validated)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);

-- -------------------------------------------------------------------------
-- berita: artikel berita — 1 baris per artikel, slug unik
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS berita (
    id               TEXT PRIMARY KEY,           -- mis. 'b1', atau uuid
    slug             TEXT NOT NULL UNIQUE,
    title            TEXT NOT NULL,
    excerpt          TEXT,
    content          TEXT,                       -- teks lengkap (boleh markdown-ish/\n\n paragraf)
    cover_image      TEXT,                       -- base64 data URL (dikompres di klien)
    og_image         TEXT,                       -- default = cover_image jika kosong
    category         TEXT,
    tags             TEXT,                       -- comma-separated
    author           TEXT DEFAULT 'Admin',
    meta_description TEXT,
    status           TEXT NOT NULL DEFAULT 'draft',   -- 'draft' | 'published'
    publish_at       TEXT,                       -- ISO datetime; jika di masa depan = terjadwal
    date_display     TEXT,                       -- teks tanggal tampilan lama, mis. "6 September 2026"
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_berita_status_publish ON berita (status, publish_at);
CREATE INDEX IF NOT EXISTS idx_berita_slug ON berita (slug);

-- -------------------------------------------------------------------------
-- berita_comments: komentar per artikel
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS berita_comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    berita_id   TEXT NOT NULL REFERENCES berita(id) ON DELETE CASCADE,
    name        TEXT,
    email       TEXT,
    message     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_berita ON berita_comments (berita_id);

-- -------------------------------------------------------------------------
-- custom_sections: halaman kustom tambahan — 1 baris per halaman, slug unik
-- items[] disimpan sebagai JSON di kolom items_json (jarang di-query satuan)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS custom_sections (
    id            TEXT PRIMARY KEY,      -- mis. 'cs_demo_fasilitas'
    slug          TEXT NOT NULL UNIQUE,  -- URL: /[slug]
    type          TEXT NOT NULL DEFAULT 'cards',
    eyebrow       TEXT,
    title         TEXT,
    subtitle      TEXT,
    bg_style      TEXT DEFAULT 'gray',
    active        INTEGER NOT NULL DEFAULT 1,
    menu_label    TEXT,
    columns       INTEGER DEFAULT 3,
    image         TEXT,
    image_position TEXT DEFAULT 'right',
    cta_label     TEXT,
    cta_link      TEXT,
    items_json    TEXT NOT NULL DEFAULT '[]',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_custom_sections_slug ON custom_sections (slug);

-- -------------------------------------------------------------------------
-- Seed data awal (dijalankan sekali). Password default: admin123
-- Hash di bawah adalah PLACEHOLDER — script migrasi (scripts/migrate-from-json.js)
-- akan menghasilkan hash asli dan menimpa baris ini. Ganti setelah deploy pertama
-- lewat /admin/pengaturan.
-- -------------------------------------------------------------------------
INSERT OR IGNORE INTO admin (id, username, password_hash)
VALUES (1, 'admin', 'PLACEHOLDER_RUN_MIGRATION_SCRIPT');

INSERT OR IGNORE INTO store (type, data) VALUES
('meta', '{"logoText":"S1","logoImage":"","schoolName":"SDN 01 Papahan","schoolLocation":"Kabupaten Karanganyar","pageTitle":"SDN 01 Papahan - Cerdas, Berakhlak, Berprestasi","navCtaText":"Hubungi Kami"}'),
('hero', '{"badge":"Penerimaan Siswa Baru 2026/2027 Dibuka","headlinePrefix":"Membentuk Generasi","headlineHighlight":"Cerdas & Berkarakter","subtitle":"Sekolah Dasar Negeri 01 Papahan berkomitmen memberikan pendidikan berkualitas dengan lingkungan belajar yang modern, aman, dan inovatif untuk putra-putri Anda.","ctaPrimary":"Kenali Kami Lebih Dekat","ctaSecondary":"Lihat Program","images":[],"stats":[{"value":"24+","label":"Tenaga Pendidik"},{"value":"500+","label":"Siswa Aktif"},{"value":"15+","label":"Ekstrakurikuler"}],"badge1Title":"Akreditasi A","badge1Subtitle":"BAN-S/M","badge2Value":"98%","badge2Label":"Tingkat Kelulusan"}'),
('sambutan', '{"badge":"Sambutan Kepala Sekolah","titlePrefix":"Selamat Datang di","titleHighlight":"SDN 01 Papahan","paragraphs":[],"name":"","role":"Kepala Sekolah","photo":""}'),
('profil', '{"eyebrow":"Profil Sekolah","title":"Membangun Fondasi Masa Depan","desc":"","visi":"","misi":[],"fasilitas":""}'),
('programHeader', '{"eyebrow":"Program Kurikulum","title":"Program Unggulan Sekolah","subtitle":""}'),
('program', '[]'),
('guruHeader', '{"eyebrow":"Tenaga Pendidik","titlePrefix":"Guru","titleHighlight":"Profesional & Dedikatif","subtitle":""}'),
('guru', '[]'),
('prestasiHeader', '{"eyebrow":"PRESTASI SISWA","titlePrefix":"Prestasi Siswa","titleHighlight":"Capaian","titleLight":"membanggakan","subtitle":""}'),
('prestasi', '[]'),
('ekskulHeader', '{"title":"Ekstrakurikuler","subtitle":"Penyaluran bakat & minat siswa"}'),
('ekskul', '[]'),
('beritaHeader', '{"eyebrow":"BERITA & ARTIKEL","titlePrefix":"Berita & Artikel","titleHighlight":"Informasi terkini","titleLight":"seputar sekolah","subtitle":""}'),
('agendaHeader', '{"title":"Agenda Mendatang"}'),
('agenda', '[]'),
('galeriHeader', '{"title":"Galeri Kegiatan"}'),
('galeri', '[]'),
('testimoniHeader', '{"title":"Kata Wali Murid"}'),
('testimoni', '[]'),
('faq', '[]'),
('kontak', '{"address":"","phone":"","email":""}'),
('footer', '{"desc":"","copyright":"© 2026 SDN 01 Papahan Karanganyar. All rights reserved.","socialFacebook":"#","socialInstagram":"#","socialYoutube":"#"}'),
('pageOrder', '[{"key":"beranda","label":"Beranda","icon":"flag","locked":true,"active":true},{"key":"sambutan","label":"Sambutan Kepala Sekolah","icon":"pen-line","locked":false,"active":true},{"key":"profil","label":"Profil Sekolah","icon":"building","locked":false,"active":true},{"key":"program","label":"Program Unggulan","icon":"graduation-cap","locked":false,"active":true},{"key":"pengajar","label":"Tenaga Pendidik","icon":"users","locked":false,"active":true},{"key":"prestasi","label":"Prestasi & Ekstrakurikuler","icon":"trophy","locked":false,"active":true},{"key":"berita","label":"Berita & Agenda","icon":"newspaper","locked":false,"active":true},{"key":"galeri","label":"Galeri Kegiatan","icon":"image","locked":false,"active":true},{"key":"testimoni","label":"Testimoni Wali Murid","icon":"quote","locked":false,"active":true},{"key":"faq","label":"FAQ & Kontak","icon":"help-circle","locked":false,"active":true}]');
