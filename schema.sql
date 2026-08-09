-- =========================================================================
-- SDN 01 Papahan — Skema D1
-- Pola: tabel `store` (1 baris per "type", isi JSON) untuk data yang jarang
-- di-query satuan, ditambah tabel relasional khusus untuk `berita` dan
-- `custom_sections` karena keduanya butuh query per-slug yang efisien.
-- =========================================================================

-- Data umum non-berita, 1 baris per key, value berupa JSON string.
-- Key yang dipakai: meta, hero, sambutan, profil, programHeader, program,
-- guruHeader, guru, prestasiHeader, prestasi, ekskulHeader, ekskul,
-- beritaHeader, agendaHeader, agenda, galeriHeader, galeri, testimoniHeader,
-- testimoni, faq, kontak, footer, pageOrder
CREATE TABLE IF NOT EXISTS store (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL,       -- JSON string
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Artikel berita — tabel relasional sendiri, query per-slug wajib efisien
-- (dipakai Worker untuk merender /berita/:slug dan /sitemap.xml).
CREATE TABLE IF NOT EXISTS berita (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    excerpt         TEXT NOT NULL DEFAULT '',
    content         TEXT NOT NULL DEFAULT '',
    category        TEXT NOT NULL DEFAULT '',
    tags            TEXT NOT NULL DEFAULT '',
    author          TEXT NOT NULL DEFAULT 'Admin',
    cover_image     TEXT NOT NULL DEFAULT '',   -- base64 (data URL), dikompres di klien
    meta_description TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'published', -- 'draft' | 'published'
    publish_at      TEXT NOT NULL DEFAULT (datetime('now')), -- jadwal tayang
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_berita_status_publish ON berita(status, publish_at);

-- Komentar per artikel berita.
CREATE TABLE IF NOT EXISTS berita_comments (
    id          TEXT PRIMARY KEY,
    berita_id   TEXT NOT NULL REFERENCES berita(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'Anonim',
    message     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_berita ON berita_comments(berita_id);

-- Halaman kustom (dulu "customSections") — tabel sendiri karena butuh
-- resolve slug -> halaman secara efisien di Worker (route /[slug-custom]).
CREATE TABLE IF NOT EXISTS custom_sections (
    id          TEXT PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    type        TEXT NOT NULL DEFAULT 'cards', -- 'cards' | 'text' | dst
    eyebrow     TEXT NOT NULL DEFAULT '',
    title       TEXT NOT NULL DEFAULT '',
    subtitle    TEXT NOT NULL DEFAULT '',
    bg_style    TEXT NOT NULL DEFAULT 'gray',
    active      INTEGER NOT NULL DEFAULT 1,   -- 0/1
    menu_label  TEXT NOT NULL DEFAULT '',
    columns     INTEGER NOT NULL DEFAULT 3,
    items_json  TEXT NOT NULL DEFAULT '[]',   -- JSON array
    image       TEXT NOT NULL DEFAULT '',
    image_position TEXT NOT NULL DEFAULT 'right',
    cta_label   TEXT NOT NULL DEFAULT '',
    cta_link    TEXT NOT NULL DEFAULT '',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Akun admin — password di-hash (PBKDF2/SHA-256 via Web Crypto di Worker),
-- tidak pernah disimpan/kirim polos.
CREATE TABLE IF NOT EXISTS admin_users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,   -- format: pbkdf2$<iterations>$<saltHex>$<hashHex>
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sesi login admin (dipetakan ke cookie httpOnly).
CREATE TABLE IF NOT EXISTS admin_sessions (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON admin_sessions(expires_at);
