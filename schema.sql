-- Jalankan SATU PER SATU di Cloudflare Dashboard > D1 > (database) > Console
-- (Console D1 di dashboard hanya mengeksekusi statement terakhir kalau ditempel sekaligus)

CREATE TABLE IF NOT EXISTS site_data (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO site_data (id, data, updated_at) VALUES ('main', '{}', 0);

-- Akun admin CMS. Isi baris pertama manual lewat D1 Console (lihat catatan
-- generate hash di README/percakapan setup) — bukan lewat migrasi ini.
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Sesi login admin (cookie httpOnly menyimpan `token` ini).
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES admin_users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
