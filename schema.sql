-- Jalankan SATU PER SATU di Cloudflare Dashboard > D1 > (database) > Console
-- (Console D1 di dashboard hanya mengeksekusi statement terakhir kalau ditempel sekaligus)

CREATE TABLE IF NOT EXISTS site_data (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO site_data (id, data, updated_at) VALUES ('main', '{}', 0);
