-- =========================================================================
-- schema.sql — untuk DATABASE D1 BARU (bukan migrasi dari database lama).
-- Jalankan SATU PER SATU di Cloudflare Dashboard > Workers & Pages > D1 >
-- (database baru Anda) > Console. (Console D1 hanya mengeksekusi statement
-- TERAKHIR kalau ditempel sekaligus semuanya, jadi jalankan blok demi
-- blok / statement demi statement.)
--
-- Tidak ada tabel site_data (blob JSON lama) di sini sama sekali, dan
-- tidak perlu memanggil endpoint /api/admin/migrate-to-tables -- semua
-- tabel di bawah ini langsung tabel per-menu yang dipakai src/index.js.
-- Situs akan mulai dalam keadaan kosong; isi datanya lewat panel admin
-- (/admin) setelah login.
-- =========================================================================

-- --- Akun admin. Password TIDAK PERNAH disimpan teks biasa, hanya HASH
-- (PBKDF2-HMAC-SHA256). ---
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

-- --- Sesi login admin (cookie HttpOnly di browser, dicocokkan ke sini). ---
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- --- Penguncian akun setelah beberapa kali gagal login (brute-force
-- protection). Satu baris per username. ---
CREATE TABLE IF NOT EXISTS login_lockouts (
  username TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER NOT NULL DEFAULT 0
);

-- --- Catatan tiap percobaan login (berhasil/gagal) dengan IP -- dipakai
-- untuk rate-limit per-IP dan menu "Log Keamanan" di admin. ---
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
-- TABEL KONTEN PER MENU (menggantikan blob JSON tunggal).
-- Nama tabel & kolom WAJIB sama persis dengan yang dipakai src/index.js
-- (assembleSiteData & buildDecomposeStatements).
-- =========================================================================

-- --- Pengaturan singleton per section (meta, hero tanpa images, sambutan,
-- profil, header tiap section, kontak, footer, pageOrder) ---
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- --- (BARU) Penyimpanan foto TERPISAH dari data teks lainnya ---
-- Sebelumnya semua foto (logo, foto guru, galeri, hero, sampul berita, dst)
-- disimpan sebagai teks base64 LANGSUNG di kolom-kolom seperti berita.image,
-- guru.photo, hero_images.image_data, dst. Akibatnya SETIAP kali admin
-- menyimpan perubahan apa pun (bahkan yang sama sekali tidak menyangkut
-- foto), SELURUH isi situs -- termasuk semua foto yang tidak berubah --
-- ikut terkirim ulang lewat PUT /api/data.
--
-- Sekarang: foto BARU (diunggah lewat POST /api/admin/upload-image) masuk
-- ke tabel INI, dan kolom seperti berita.image dkk cukup menyimpan URL
-- pendeknya saja (mis. "/img/img_1735000000000_ab12cd"), disajikan lewat
-- GET /img/:id di src/index.js. Foto LAMA yang masih tersimpan sebagai
-- base64 di kolom aslinya TETAP tampil normal apa adanya -- baru pindah ke
-- tabel ini kalau fotonya diunggah ULANG lewat form admin (migrasi
-- bertahap, bukan sekali jalan, supaya risikonya rendah).
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

-- --- Galeri gambar hero (carousel beranda) ---
CREATE TABLE IF NOT EXISTS hero_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_data TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_hero_images_sort ON hero_images (sort_order);

-- --- Program Unggulan ---
CREATE TABLE IF NOT EXISTS program (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  icon TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  desc TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_program_sort ON program (sort_order);

-- --- Tenaga Pendidik (guru) ---
CREATE TABLE IF NOT EXISTS guru (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  education TEXT NOT NULL DEFAULT '',
  is_kepsek INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_guru_sort ON guru (sort_order);

-- --- Prestasi ---
CREATE TABLE IF NOT EXISTS prestasi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo TEXT NOT NULL DEFAULT '',
  badge TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  student_name TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_prestasi_sort ON prestasi (sort_order);

-- --- Ekstrakurikuler ---
CREATE TABLE IF NOT EXISTS ekskul (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  icon TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ekskul_sort ON ekskul (sort_order);

-- --- Berita (id dipertahankan dari sisi admin, misalnya 'b1', 'b_172...') ---
-- kolom `slug` BARU: dipakai untuk URL publik /berita/:slug yang bisa
-- di-crawl Google/AI tanpa JavaScript (lihat rute GET /berita/:slug di
-- src/index.js). id lama TETAP DIPERTAHANKAN apa adanya untuk keperluan
-- internal (relasi ke berita_comments, routing SPA #berita/<id>) -- slug
-- murni tambahan untuk URL publik yang lebih ramah SEO.
-- kolom `updated_at` BARU: dipakai untuk <lastmod> di sitemap.xml dan
-- "dateModified" di JSON-LD NewsArticle (lihat renderSitemap &
-- renderBeritaArticlePage di src/index.js). Diisi ulang HANYA kalau isi
-- artikel itu benar-benar berubah dibanding sebelumnya (lihat
-- buildDecomposeStatements) -- bukan setiap kali admin menyimpan APAPUN,
-- supaya sinyal "baru diubah" ke Google tetap akurat per-artikel.
CREATE TABLE IF NOT EXISTS berita (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  image TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_berita_sort ON berita (sort_order);

-- --- Pemetaan slug LAMA -> id artikel, dibuat otomatis saat admin
-- mengganti "URL Artikel" (slug) sebuah berita yang sudah ada. Dipakai
-- GET /berita/:slug (renderBeritaArticlePage) untuk 301-redirect tautan
-- lama yang sudah terlanjur dibagikan/ter-index Google ke slug barunya,
-- alih-alih langsung 404. Tabel ini SEBENARNYA dibuat sendiri lewat
-- CREATE TABLE IF NOT EXISTS di ensureBeritaSlugRedirectsTable() saat
-- pertama dipakai -- baris ini di schema.sql murni dokumentasi/konsisten
-- untuk instalasi database BARU, tidak wajib dijalankan manual. ---
CREATE TABLE IF NOT EXISTS berita_slug_redirects (
  old_slug TEXT PRIMARY KEY,
  berita_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- --- Komentar publik pada berita (TIDAK ikut proses replace-all PUT
-- /api/data -- lihat catatan besar di src/index.js) ---
-- kolom `reply`/`reply_at` BARU: balasan admin atas satu komentar publik
-- (satu balasan per komentar, ditulis dari panel admin > Moderasi Komentar,
-- tampil ke publik di bawah komentar aslinya -- lihat POST
-- /api/admin/berita-comments/reply & renderBeritaArticlePage di src/index.js).
-- reply_at = 0 berarti belum/tidak ada balasan.
CREATE TABLE IF NOT EXISTS berita_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  berita_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  reply TEXT NOT NULL DEFAULT '',
  reply_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_berita_comments_berita_id ON berita_comments (berita_id);

-- --- Catatan tiap percobaan submit komentar publik per-IP -- dipakai
-- untuk rate-limit anti-spam (lihat isCommentRateLimited di src/index.js).
-- Terpisah dari berita_comments karena ini bukan konten, murni log teknis. ---
CREATE TABLE IF NOT EXISTS comment_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comment_attempts_ip_time ON comment_attempts (ip, created_at);

-- --- Catatan tiap pesan chatbot AI per-IP -- dipakai untuk rate-limit
-- anti-abuse (lihat isChatRateLimited di src/index.js), pola sama seperti
-- comment_attempts di atas. Tidak menyimpan isi pesan/percakapan sama
-- sekali (hanya IP + waktu), murni untuk menghitung jumlah request. ---
CREATE TABLE IF NOT EXISTS chat_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_attempts_ip_time ON chat_attempts (ip, created_at);

-- --- (BARU) Pengaturan Chatbot AI, diatur admin lewat menu "Chatbot AI".
-- Baris SINGLETON (selalu id = 1, dibuat otomatis lewat INSERT OR IGNORE
-- di bawah). SENGAJA dipisah dari tabel site_settings (bukan disimpan
-- sebagai salah satu key di sana) karena kolom gemini_api_key berisi
-- RAHASIA -- site_settings ikut terbawa penuh oleh GET /api/data yang
-- PUBLIK/tanpa-login (dipakai beranda), jadi kalau kuncinya nyasar ke situ
-- akan bocor ke siapa pun yang buka /api/data. Tabel ini hanya boleh
-- dibaca lewat endpoint admin (perlu sesi login) atau langsung dari server
-- saat memproses POST /api/chat -- lihat getChatbotSettings() &
-- GET/POST /api/admin/chatbot-settings di src/index.js. Subset yang aman
-- ditampilkan ke publik (enabled, bot_name) lewat field `chatbotPublic`
-- pada GET /api/data (lihat assembleSiteData()).
CREATE TABLE IF NOT EXISTS chatbot_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  bot_name TEXT NOT NULL DEFAULT 'Asisten SekolahKu',
  -- provider: 'cloudflare' (Workers AI, gratis, bawaan) atau 'gemini'
  -- (Google Gemini, API key gratis dari admin sendiri di Google AI Studio).
  provider TEXT NOT NULL DEFAULT 'cloudflare',
  gemini_api_key TEXT NOT NULL DEFAULT '',
  -- Instruksi/persona dasar tambahan dari admin (opsional), disisipkan ke
  -- system prompt server DI SAMPING aturan wajib bawaan (jawab hanya dari
  -- data sekolah, jangan mengarang, dst) -- lihat POST /api/chat.
  custom_instructions TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO chatbot_settings (id, enabled, bot_name, provider, gemini_api_key, custom_instructions, updated_at)
VALUES (1, 1, 'Asisten SekolahKu', 'cloudflare', '', '', strftime('%s','now') * 1000);

-- --- Agenda ---
CREATE TABLE IF NOT EXISTS agenda (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL DEFAULT '',
  day TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  time TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_agenda_sort ON agenda (sort_order);

-- --- Galeri foto ---
CREATE TABLE IF NOT EXISTS galeri (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_galeri_sort ON galeri (sort_order);

-- --- Testimoni ---
CREATE TABLE IF NOT EXISTS testimoni (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_testimoni_sort ON testimoni (sort_order);

-- --- FAQ ---
CREATE TABLE IF NOT EXISTS faq (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  q TEXT NOT NULL DEFAULT '',
  a TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_faq_sort ON faq (sort_order);

-- --- (BARU — Tahap 2) Langganan Web Push tiap browser pengunjung yang
-- mengizinkan notifikasi lewat tombol lonceng di beranda (lihat
-- POST /api/push/subscribe, POST /api/push/unsubscribe, dan
-- POST /api/admin/push/send di src/index.js, serta public/service-worker.js).
-- Tabel ini juga otomatis dibuat sendiri oleh Worker lewat
-- ensurePushSubscriptionsTable() kalau belum ada -- jadi kalau Anda lupa
-- menjalankan blok ini di database LAMA yang sudah terlanjur jalan, fitur
-- tetap akan bekerja begitu ada pengunjung pertama yang subscribe.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,   -- URL unik dari layanan push milik Google/Mozilla/dst, mewakili satu langganan (satu browser di satu perangkat)
  p256dh TEXT NOT NULL,             -- kunci publik enkripsi milik pelanggan (dari browser)
  auth TEXT NOT NULL,               -- kunci rahasia tambahan untuk enkripsi
  user_agent TEXT,                  -- info browser/perangkat, buat keperluan admin lihat statistik saja
  created_at INTEGER NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0   -- jumlah gagal kirim beruntun (bukan alasan hapus otomatis -- yang menghapus otomatis adalah balasan 404/410 dari layanan push, lihat sendPushToAllSubscribers())
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_created ON push_subscriptions (created_at);

-- --- Halaman kustom (menu tambahan buatan admin) ---
CREATE TABLE IF NOT EXISTS custom_sections (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT '',
  eyebrow TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '',
  bg_style TEXT NOT NULL DEFAULT 'light',
  active INTEGER NOT NULL DEFAULT 1,
  menu_label TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  image_position TEXT NOT NULL DEFAULT 'right',
  columns INTEGER NOT NULL DEFAULT 3,
  cta_label TEXT NOT NULL DEFAULT '',
  cta_link TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_custom_sections_sort ON custom_sections (sort_order);

-- --- Item di dalam tiap halaman kustom (bentuk bebas per `type`, disimpan
-- sebagai JSON per item) ---
CREATE TABLE IF NOT EXISTS custom_section_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL REFERENCES custom_sections(id) ON DELETE CASCADE,
  item_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_custom_section_items_section_id ON custom_section_items (section_id);
