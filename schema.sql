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
--
-- BARU DI V3: kolom `force_password_change`. Kalau bernilai 1, akun WAJIB
-- ganti password sebelum bisa melakukan aksi admin apa pun (simpan data,
-- kelola pengguna, dsb) -- endpoint lain akan menolak dengan 403 sampai
-- password diganti. Ini menutup celah "password default admin123 lupa
-- diganti", karena sekarang server sendiri yang memaksa, bukan cuma
-- imbauan di dokumen.
-- =========================================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,   -- hex-encoded PBKDF2 derived key
  salt TEXT NOT NULL,            -- hex-encoded random salt (16 byte)
  iterations INTEGER NOT NULL DEFAULT 100000,
  force_password_change INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Akun admin awal (default): username "admin", password "admin123".
-- force_password_change = 1 => begitu login pertama kali, admin.html akan
-- MEMAKSA ganti password lebih dulu sebelum menu lain bisa dipakai.
-- Tidak ada lagi jendela waktu di mana password default masih aktif dipakai.
INSERT OR IGNORE INTO admin_users (username, password_hash, salt, iterations, force_password_change, created_at, updated_at)
VALUES (
  'admin',
  '8d6aa7b52121c30adaa3f7f1f1bca5bcde32e2bcec355046cdd199752b9d9f9f',
  'bb1c844142284ddca6be256aec1d5726',
  100000,
  1,
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

-- =========================================================================
-- BARU DI V3: penguncian akun setelah beberapa kali gagal login berturut-
-- turut (brute-force protection). Satu baris per username.
-- =========================================================================
CREATE TABLE IF NOT EXISTS login_lockouts (
  username TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER NOT NULL DEFAULT 0
);

-- =========================================================================
-- BARU DI V3: catatan setiap percobaan login (berhasil maupun gagal),
-- dengan IP pengakses. Dipakai untuk (a) rate-limit per-IP supaya orang
-- tidak bisa mencoba banyak username berbeda dari satu sumber, dan
-- (b) log yang bisa dilihat admin di menu "Log Keamanan".
-- =========================================================================
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  ip TEXT NOT NULL,
  success INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts (ip, created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts (created_at);

-- =========================================================================
-- MIGRASI DARI V2 -> V3 (jalankan HANYA kalau database sudah pernah dipakai
-- untuk V2 sebelumnya, supaya tabel admin_users lama dapat kolom baru).
-- Kalau ini instalasi baru dari nol, statement di bawah boleh dilewati saja
-- (CREATE TABLE di atas sudah otomatis termasuk kolomnya, jadi ALTER TABLE
-- di bawah akan gagal dengan "duplicate column" -- itu wajar, abaikan saja).
-- =========================================================================
ALTER TABLE admin_users ADD COLUMN force_password_change INTEGER NOT NULL DEFAULT 0;

-- Kalau Anda migrasi dari V2 dan ingin memaksa admin lama ganti password
-- juga (opsional, hapus komentar baris di bawah kalau mau):
-- UPDATE admin_users SET force_password_change = 1;
