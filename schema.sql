-- Jalankan SATU PER SATU di Cloudflare Dashboard > D1 > (database) > Console
-- (Console D1 di dashboard hanya mengeksekusi statement terakhir kalau ditempel sekaligus)

CREATE TABLE IF NOT EXISTS site_data (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO site_data (id, data, updated_at) VALUES ('main', '{}', 0);

-- =========================================================================
-- Kredensial admin TIDAK PERNAH disimpan di tabel site_data (yang dibaca
-- publik lewat GET /api/data). Kredensial hidup di tabel terpisah ini,
-- password disimpan sebagai HASH (PBKDF2-HMAC-SHA256), bukan teks biasa.
-- =========================================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,   -- hex-encoded PBKDF2 derived key
  salt TEXT NOT NULL,            -- hex-encoded random salt (16 byte)
  iterations INTEGER NOT NULL DEFAULT 100000,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Akun admin awal (default): username "admin", password "admin123".
-- !! WAJIB LOGIN LALU GANTI PASSWORD LEWAT MENU "Pengaturan Akun" SEGERA
-- !! SETELAH DEPLOY PERTAMA. Password ini hanya untuk login PERTAMA KALI.
INSERT OR IGNORE INTO admin_users (username, password_hash, salt, iterations, created_at, updated_at)
VALUES (
  'admin',
  '8d6aa7b52121c30adaa3f7f1f1bca5bcde32e2bcec355046cdd199752b9d9f9f',
  'bb1c844142284ddca6be256aec1d5726',
  100000,
  strftime('%s','now') * 1000,
  strftime('%s','now') * 1000
);

-- =========================================================================
-- Sesi login admin. Token acak (bukan bisa ditebak), tersimpan di cookie
-- HttpOnly di browser admin, dicocokkan ke sini di setiap request yang
-- butuh otorisasi (PUT /api/data, /api/admin/change-password, dst).
-- =========================================================================
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
