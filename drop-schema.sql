-- =============================================================================
-- DROP SCHEMA -- SDN 01 Papahan
-- =============================================================================
-- Kebalikan dari schema.sql: menghapus SEMUA tabel yang dibuat lewat
-- schema.sql (termasuk tabel yang dibuat otomatis oleh Worker lewat fungsi
-- ensureXxxTable() -- chatbot_settings & push_subscriptions -- yang secara
-- definisi SAMA PERSIS dengan yang ada di schema.sql, jadi tetap ikut
-- dihapus di sini).
--
-- !!! PERINGATAN -- DESTRUKTIF & TIDAK BISA DIBATALKAN (IRREVERSIBLE) !!!
-- Menjalankan file ini akan MENGHAPUS SELURUH ISI DATABASE: semua berita,
-- akun admin, sesi login, komentar publik, galeri, prestasi, langganan
-- notifikasi push, dan seluruh konten lain yang tersimpan di D1. TIDAK ADA
-- cara untuk mengembalikannya kecuali Anda punya backup terpisah (mis. lewat
-- menu admin > Pengaturan Akun > Backup/Restore, atau
-- `wrangler d1 export`).
--
-- KAPAN file ini dipakai:
--   - Reset total database ke kondisi kosong sebelum menjalankan ulang
--     schema.sql dari nol (mis. mau mulai bersih di lingkungan baru).
--   - Membongkar database lama saat pindah/migrasi ke skema baru yang tidak
--     kompatibel.
--   - Uji coba di database TERPISAH (staging/dev) -- JANGAN dijalankan di
--     database produksi tanpa backup.
--
-- CARA PAKAI (Cloudflare Dashboard):
--   Workers & Pages -> D1 -> database Anda -> tab Console -> tempel isi
--   file ini -> jalankan. Kalau Console menolak banyak statement sekaligus,
--   jalankan satu-satu (urutan di bawah SUDAH aman terhadap dependensi FK
--   -- custom_section_items dihapus SEBELUM custom_sections, karena ada
--   FOREIGN KEY di antara keduanya).
--
-- CARA PAKAI (wrangler CLI):
--   wrangler d1 execute sdn01papahan --remote --file=./drop-schema.sql
--   (hilangkan --remote untuk menjalankan ke database lokal/preview saja)
--
-- SETELAH menjalankan file ini, database benar-benar kosong (tanpa tabel
-- sama sekali) -- jalankan schema.sql lagi untuk membuat ulang semua tabel
-- + akun admin awal (admin / admin123, wajib ganti password saat login
-- pertama).
-- =============================================================================

-- --- Tabel dengan FOREIGN KEY -- WAJIB dihapus duluan ---
DROP TABLE IF EXISTS custom_section_items;   -- FK -> custom_sections(id)

-- --- Halaman/section kustom ---
DROP TABLE IF EXISTS custom_sections;

-- --- Notifikasi push (Tahap 2) ---
DROP TABLE IF EXISTS push_subscriptions;

-- --- Section list per konten ---
DROP TABLE IF EXISTS faq;
DROP TABLE IF EXISTS testimoni;
DROP TABLE IF EXISTS galeri;
DROP TABLE IF EXISTS agenda;

-- --- Chatbot AI ---
DROP TABLE IF EXISTS chatbot_settings;
DROP TABLE IF EXISTS chat_attempts;

-- --- Komentar publik & anti-spam ---
DROP TABLE IF EXISTS comment_attempts;
DROP TABLE IF EXISTS berita_comments;

-- --- Berita ---
DROP TABLE IF EXISTS berita;

-- --- Section list lain ---
DROP TABLE IF EXISTS ekskul;
DROP TABLE IF EXISTS prestasi;
DROP TABLE IF EXISTS guru;
DROP TABLE IF EXISTS program;
DROP TABLE IF EXISTS hero_images;

-- --- Media & pengaturan situs ---
DROP TABLE IF EXISTS images;
DROP TABLE IF EXISTS site_settings;

-- --- Login & keamanan -- dihapus PALING TERAKHIR ---
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS login_lockouts;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS admin_users;

-- Selesai -- database sekarang kosong (0 tabel). Indeks (CREATE INDEX di
-- schema.sql) otomatis ikut terhapus bersama tabelnya masing-masing, tidak
-- perlu DROP INDEX terpisah.
