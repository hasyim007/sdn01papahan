# Panduan Keamanan & Arsitektur — SDN 01 Papahan

> Dokumen ini menggantikan versi sebelumnya, yang berhenti di titik "V3"
> (rate-limit login + lockout + CSP) dan sudah tidak mencerminkan banyak
> perubahan sesudahnya: database per-tabel, halaman artikel SEO, komentar
> publik, halaman kustom, multi-admin, dan beberapa perbaikan keamanan
> (stored XSS). Versi ini ditulis ulang dari kode sungguhan di `src/index.js`,
> `schema.sql`, `wrangler.toml`, dan `public/*.html` — bukan diturunkan dari
> dokumen lama.

## 1. Struktur file

```
public/
  index.html   ← Landing page publik (SPA) — beranda, profil, berita, dst.
                 Juga tempat tampilan interaktif artikel (#berita/<id>):
                 baca, bagikan, dan kirim komentar via JavaScript.
  login.html   ← Halaman login mandiri. Tidak ada logika admin apa pun di
                 file ini — aman dilihat siapa saja. Mengirim
                 username+password ke POST /api/login.
  admin.html   ← Dashboard admin (CMS). Berisi semua panel pengelolaan
                 konten, kelola akun, log keamanan, backup/restore, dan
                 pengaturan urutan halaman.

src/index.js   ← Cloudflare Worker: seluruh API (login, sesi, CRUD konten,
                 komentar publik, halaman artikel SEO, sitemap), gerbang
                 akses /admin.html, dan header keamanan.

schema.sql     ← Skema D1 untuk database BARU (bukan file migrasi dari versi
                 lama). Setiap tabel konten punya baris/kolomnya sendiri
                 (lihat bagian 2) — tidak ada lagi satu kolom JSON raksasa.

drop-schema.sql ← Kebalikan dari schema.sql — DROP TABLE untuk semua tabel,
                 dipakai untuk reset/hapus total database (lihat bagian 11).
                 DESTRUKTIF, tidak untuk dijalankan sembarangan.

wrangler.toml  ← Konfigurasi Worker: binding D1, ALLOWED_ORIGIN (CORS), dan
                 daftar run_worker_first (lihat bagian 4).
```

## 2. Arsitektur data: per-tabel, bukan satu blob JSON

Konten situs disimpan di D1 sebagai **banyak tabel kecil per section**,
bukan satu kolom JSON besar — ini untuk menghindari batas
`SQLITE_TOOBIG` saat situs sudah punya banyak foto/konten.

- `GET /api/data` membaca dari semua tabel di bawah ini dan **menyusunnya
  ulang** menjadi satu objek JSON besar — bentuknya sama persis seperti
  yang dipakai `admin.html` maupun situs publik, jadi dari sudut pandang
  front-end tidak ada yang berubah.
- `PUT /api/data` menerima objek JSON besar itu, **memecahnya** jadi
  banyak query kecil, dan menjalankannya sekaligus lewat `env.DB.batch()`
  (transaksi atomik — semua berhasil atau semua gagal bersama).

Daftar tabel di `schema.sql`:

| Tabel | Isi |
|---|---|
| `admin_users` | Akun admin (username, hash PBKDF2, salt, iterasi, `force_password_change`) |
| `sessions` | Sesi login aktif (cookie `admin_session`) |
| `login_lockouts` | Penguncian per-username setelah gagal login berulang |
| `login_attempts` | Riwayat percobaan login (untuk rate-limit & menu "Log Keamanan") |
| `comment_attempts` | Riwayat submit komentar publik per-IP (anti-spam, lihat bagian 6) |
| `site_settings` | Pengaturan singleton per section (meta, hero tanpa `images`, sambutan, profil, semua header section, kontak, footer, `pageOrder`) — 1 baris per `key` |
| `hero_images`, `program`, `guru`, `prestasi`, `ekskul`, `agenda`, `galeri`, `testimoni`, `faq` | Daftar item per section, masing-masing tabel sendiri |
| `berita` | Artikel berita (id dipertahankan apa adanya, `slug` untuk URL SEO) |
| `berita_comments` | Komentar publik pada berita — **sengaja TIDAK ikut ditimpa** oleh `PUT /api/data` (lihat bagian 6) |
| `custom_sections`, `custom_section_items` | Halaman/section kustom buatan admin (lihat bagian 7) |

**Pengecualian penting:** `berita_comments` dan `comment_attempts` tidak
pernah disentuh oleh proses "replace all" `PUT /api/data`. Kalau ikut
ditimpa, komentar pengunjung asli bisa hilang tertimpa data lama dari
sesi admin.html yang browser-nya belum di-refresh.

## 3. Autentikasi & sesi

- Password admin disimpan sebagai **hash PBKDF2-HMAC-SHA256** (100.000
  iterasi + salt acak 16 byte), bukan teks biasa.
- `POST /api/login` mencocokkan password di server memakai perbandingan
  *timing-safe*. Kalau cocok, server membuat token sesi acak (32 byte),
  simpan di tabel `sessions`, kirim lewat cookie
  `HttpOnly; Secure; SameSite=Lax` — tidak bisa dibaca lewat JavaScript
  (termasuk lewat XSS), dan kedaluwarsa otomatis setelah **12 jam**
  (`SESSION_TTL_MS` di `src/index.js`).
- `PUT /api/data`, `POST /api/admin/change-password`, dan seluruh endpoint
  `/api/admin/*` mewajibkan cookie sesi yang valid.
- **Wajib ganti password default:** akun seed awal (`admin` / `admin123`,
  dibuat lewat `schema.sql`) punya `force_password_change = 1`. Selama
  aktif, server menolak `PUT /api/data` dan endpoint kelola-admin lain
  dengan `403` — bukan cuma imbauan di dokumen. Dashboard juga otomatis
  mengunci navigasi ke menu lain sampai password diganti.
- Aturan password baru: minimal 8 karakter, tidak boleh sama dengan
  `admin123`.

### Rate-limit & penguncian brute-force

| Lapisan | Aturan | Tabel |
|---|---|---|
| Per-IP, lintas username | ≥ 20 percobaan **gagal** dalam 10 menit dari satu IP → ditolak `429` tanpa cek password sama sekali | `login_attempts` |
| Per-username | 5 kali gagal berturut-turut → akun dikunci 15 menit | `login_lockouts` |

*Catatan jujur:* durasi kunci per-username dibuat pendek karena secara
teori bisa disalahgunakan orang lain untuk mengunci akun Anda sendiri
dengan sengaja memasukkan password salah — proteksi utama tetap di
rate-limit per-IP.

### Kelola banyak akun admin

Menu **"Kelola Pengguna Admin"** di dashboard (endpoint
`GET/POST /api/admin/users`, `POST /api/admin/users/delete`) sudah aktif:

- Username baru: minimal 3 karakter, hanya huruf/angka/titik/garis
  bawah/strip.
- Password baru: minimal 8 karakter.
- Admin tidak bisa menghapus akunnya sendiri yang sedang dipakai login,
  dan tidak bisa menghapus admin terakhir yang tersisa.
- Menghapus akun langsung menghapus semua sesi login akun tersebut
  (logout paksa di semua perangkat).

### Log keamanan

Menu **"Log Keamanan"** (`GET /api/admin/security-log`) menampilkan 50
percobaan login terakhir (waktu, username, IP, berhasil/gagal). Belum
berupa notifikasi push/email real-time — itu butuh integrasi pihak
ketiga (mis. webhook Telegram/email) di luar cakupan saat ini.

## 4. Cara `/admin.html` benar-benar terlindungi

Cloudflare Workers Assets punya opsi `run_worker_first`
(`wrangler.toml`) yang saat ini mencakup:
`/`, `/index.html`, `/login.html`, `/admin.html`, `/admin`, `/api/*`,
`/berita/*`, `/sitemap.xml`.

Untuk path yang didaftarkan di situ, request masuk ke **Worker dulu**,
baru Worker memutuskan apakah file statisnya boleh dikirim:

1. Browser minta `/admin.html` (atau `/admin`).
2. Worker cek cookie sesi ke tabel `sessions` di D1.
3. **Tidak valid** → `302 redirect` ke `/login.html`. File `admin.html`
   **tidak pernah dikirim** — bukan disembunyikan lewat CSS/JS, memang
   tidak pernah sampai ke browser. Ctrl+U di titik ini hanya menampilkan
   halaman login.
4. **Valid** → Worker memanggil `env.ASSETS.fetch(request)` untuk
   mengirim file `admin.html` sungguhan, lalu menambahkan header
   keamanan (lihat bagian 5).

`/berita/*` dan `/sitemap.xml` juga didaftarkan di `run_worker_first`
karena **tidak punya file statis sama sekali** — keduanya dibangun
dinamis oleh Worker dari isi database (lihat bagian 8).

JavaScript di dalam `admin.html` juga memanggil `GET /api/session`
sebagai lapisan kedua (defense in depth) sebelum menampilkan data — tapi
perlindungan utama ada di langkah 3 di atas, di level server.

## 5. Header keamanan (CSP, dll.)

`withSecurityHeaders()` di `src/index.js` menambahkan ke setiap respons
HTML (publik & admin):

- `Content-Security-Policy` — skrip dibatasi ke `'self'`,
  `cdn.tailwindcss.com`, dan `unpkg.com` saja (domain yang memang
  dipakai); `object-src 'none'`; `frame-ancestors 'none'`; dll.
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (menonaktifkan geolocation/microphone/camera)

*Catatan jujur:* CSP masih mengizinkan `'unsafe-inline'` untuk
script/style karena arsitektur situs menaruh logic langsung di tag
`<script>` inline. Menghapus `'unsafe-inline'` total butuh memindahkan
semua JS ke file eksternal + CSP nonce — di luar cakupan saat ini.

## 6. Komentar publik pada berita

Berbeda dari versi lama (localStorage per-pengunjung), komentar publik
**sudah tersimpan di server dan tampil untuk semua pengunjung**:

- `POST /api/public/berita/:id/comments` — tidak butuh login (memang
  untuk publik), menerima `{ name, comment }`, dibatasi panjang wajar
  (nama ≤ 100 karakter, komentar ≤ 2000 karakter).
- **Rate-limit anti-spam per-IP**: maksimal **5 komentar per IP setiap
  10 menit**, lintas artikel (`isCommentRateLimited()` / tabel
  `comment_attempts`). Melebihi batas → `429`.
- Komentar dibaca lewat `GET /api/data` (field `beritaComments`) untuk
  tampilan interaktif SPA, dan juga dirender langsung di halaman
  artikel server-side (`/berita/:slug`, lihat bagian 8) supaya bisa
  dibaca tanpa JavaScript.
- Saat sebuah artikel dihapus admin, komentar yang menempel padanya ikut
  dihapus otomatis. Komentar untuk artikel yang masih ada **tidak pernah
  disentuh** oleh `PUT /api/data` (lihat bagian 2).

## 7. Halaman/Section kustom ("Tambah Halaman")

Menu **"Tambah Halaman"** di dashboard memungkinkan admin membuat
section baru di beranda tanpa perlu ubah kode, dengan 5 tipe tampilan:

| Tipe | Kegunaan |
|---|---|
| `text` | Teks + satu gambar berdampingan (mis. sejarah singkat) |
| `cards` | Grid kartu ikon + judul + deskripsi (mis. fasilitas) |
| `services` | Kartu layanan/aplikasi dengan ikon, badge, daftar poin, tombol tautan (mis. sistem informasi sekolah) |
| `gallery` | Grid foto dengan keterangan |
| `cta` | Banner ajakan besar dengan tombol tautan |

Setiap section punya id sendiri (`cs_<acak>`), bisa diaktifkan/nonaktifkan
dan diatur urutannya bersama halaman baku lain lewat menu
**"Atur Urutan Halaman"** (drag & drop atau tombol panah).

**Catatan keamanan:** karena `id` section kustom dan link (`ctaLink`,
link layanan, link sosial media) berasal dari data yang bisa dipulihkan
lewat file backup pihak luar, field-field ini **wajib** melalui
`escapeHtml()`/`escapeJsAttr()` (untuk konteks HTML & atribut JS) dan
`safeHref()` (untuk memblokir skema berbahaya seperti `javascript:` pada
link) sebelum dirender — baik di `index.html` maupun `admin.html`.
Jangan hapus pemanggilan fungsi-fungsi ini saat menambah field baru yang
sifatnya serupa (id/key/link yang tidak melalui validasi form biasa).

## 8. SEO: halaman artikel server-side & sitemap

- `GET /berita/:slug` — halaman artikel dirender penuh di server
  (bukan SPA), lengkap dengan meta tag, Open Graph, Twitter Card, dan
  JSON-LD `NewsArticle`, supaya bisa di-crawl Google/AI **tanpa
  menjalankan JavaScript sama sekali**. Ini terpisah dari tampilan
  `#berita/<id>` di `index.html` yang tetap dipakai untuk pengalaman
  interaktif (kirim komentar, bagikan, dst).
- `GET /berita/:slug/cover` — menyajikan foto sampul sebagai URL gambar
  HTTP biasa (bukan data URI base64), dibutuhkan karena `og:image` /
  `twitter:image` / JSON-LD `image` wajib berupa URL yang bisa
  di-*fetch* langsung oleh crawler. Kalau admin menempel URL gambar
  eksternal (bukan upload), URL itu dipakai langsung tanpa proxy.
- `GET /sitemap.xml` — dibangun dinamis dari isi D1 saat ini, otomatis
  mencantumkan setiap artikel yang ada tanpa perlu redeploy.
- Slug URL (`slugify()`) dibuat otomatis dari judul kalau kolom "URL
  Artikel" dikosongkan, dan dijaga agar unik antar-artikel
  (`dedupeSlugs()`) tiap kali admin menyimpan.

## 9. Backup & restore

Menu **Backup & Restore** di dashboard:

- **Unduh Backup** — mengekspor seluruh isi `DB` (konten situs) sebagai
  file `.json`. Kredensial admin tidak pernah ikut serta (memang sudah
  tidak disimpan di objek `DB` sejak versi login-server ini), jadi file
  backup aman dibagikan/disimpan.
- **Pulihkan Backup** — menerima file `.json` hasil ekspor atau objek DB
  mentah, memvalidasi bentuknya secara longgar (harus punya field
  `meta`), lalu menimpa seluruh data saat ini setelah konfirmasi. Field
  `admin` (kalau ada di file backup versi sangat lama) selalu dibuang
  sebagai jaring pengaman, baik di klien maupun di server (`PUT
  /api/data` juga menghapus field ini kalau terselip di body).

**Perlu diperhatikan:** karena file backup bisa berasal dari luar
(dibagikan antar-admin atau diedit manual), field seperti `id`
artikel/`id` section kustom **tidak divalidasi ulang isinya** saat
restore — hanya dipastikan tidak kosong (`migrateDB()`). Karena itu
semua tempat yang merender field-field ini **wajib** tetap melalui
`escapeHtml()`/`escapeJsAttr()`/`safeHref()` (lihat bagian 7). Ini bukan
celah yang sengaja dibiarkan terbuka — sudah diperbaiki di kode saat
ini — tapi jadi alasan kenapa aturan escaping di atas tidak boleh
dilonggarkan di masa depan.

## 10. Langkah deploy

1. **Buat/siapkan database D1** — kalau belum ada:
   ```
   wrangler d1 create sdn01papahan
   ```
   Salin `database_id` dari output tersebut ke `wrangler.toml`
   (menggantikan placeholder `GANTI-DENGAN-DATABASE-ID-BARU-ANDA`).
2. **Jalankan `schema.sql`** di Cloudflare Dashboard → Workers & Pages →
   D1 → database Anda → tab **Console**. Skrip ini untuk **database
   baru** — jalankan blok/statement demi statement kalau Console tidak
   menerima banyak statement sekaligus. Ini akan membuat akun admin
   awal: **username `admin`, password `admin123`**.
3. **Sesuaikan `ALLOWED_ORIGIN`** di `wrangler.toml` dengan domain asli
   situs Anda (dipakai untuk header CORS).
4. **Deploy** lewat Cloudflare Dashboard atau `wrangler deploy` seperti
   biasa.
5. **Login pertama kali** di `https://domain-anda/login.html` dengan
   `admin` / `admin123`.
6. **Segera ganti password** — dashboard akan otomatis mengarahkan ke
   menu ganti password dan mengunci menu lain sampai ini selesai
   (`force_password_change`).

## 11. Reset/hapus total database (drop-schema.sql)

File **`drop-schema.sql`** (baru, di root proyek) berisi kebalikan dari
`schema.sql` — `DROP TABLE IF EXISTS` untuk **semua 23 tabel** yang dibuat
lewat `schema.sql`, termasuk tabel yang sebenarnya dibuat otomatis oleh
Worker sendiri saat pertama dipakai (`chatbot_settings`,
`push_subscriptions` — lihat `ensureChatbotSettingsTable()` dan
`ensurePushSubscriptionsTable()` di `src/index.js`), karena definisinya
sama persis dengan yang ada di `schema.sql`.

> **PERINGATAN — DESTRUKTIF & TIDAK BISA DIBATALKAN.** Menjalankan file ini
> menghapus SELURUH isi database: semua berita, akun admin, sesi login,
> komentar publik, galeri, prestasi, langganan push, dan semua konten lain.
> Tidak ada cara mengembalikannya kecuali sudah punya backup terpisah (lihat
> menu admin > Pengaturan Akun > Backup/Restore, atau `wrangler d1 export`).
> **Jangan** jalankan di database produksi tanpa backup.

**Urutan drop di dalam file sudah aman terhadap dependensi FK** —
`custom_section_items` dihapus lebih dulu daripada `custom_sections` karena
ada `FOREIGN KEY (section_id) REFERENCES custom_sections(id)` di antara
keduanya (satu-satunya FK eksplisit di seluruh skema). Tabel lain tidak
punya FK antar-sesama, jadi urutannya bebas — tapi tetap dikelompokkan agar
mudah dibaca.

**Cara pakai — Cloudflare Dashboard:**
```
Workers & Pages → D1 → database Anda → tab Console → tempel isi
drop-schema.sql → jalankan.
```
Kalau Console menolak banyak statement sekaligus, jalankan baris per baris
(`DROP TABLE IF EXISTS nama_tabel;`).

**Cara pakai — Wrangler CLI:**
```
wrangler d1 execute sdn01papahan --remote --file=./drop-schema.sql
```
Hilangkan `--remote` untuk menjalankan ke database lokal/preview saja
(aman untuk dicoba dulu sebelum ke produksi).

Setelah dijalankan, database benar-benar kosong (0 tabel) — jalankan
`schema.sql` lagi untuk membuat ulang semua tabel + akun admin awal
(`admin` / `admin123`, wajib ganti password saat login pertama, lihat
bagian 3).

## 12. Hal yang sengaja belum dikerjakan (opsional, di luar cakupan saat ini)

- **Notifikasi real-time** untuk percobaan login gagal/mencurigakan
  (butuh integrasi pihak ketiga seperti webhook Telegram/email).
- **Cloudflare Turnstile** (CAPTCHA) di form login sebagai lapisan
  tambahan di atas rate-limit yang sudah ada.
- **Menghapus `'unsafe-inline'` dari CSP** — butuh migrasi semua JS
  inline ke file eksternal + CSP nonce, perubahan arsitektur yang cukup
  besar.
- **Cloudflare Access** di depan `/admin.html` sebagai lapisan tambahan
  (opsional; proteksi `run_worker_first` di bagian 4 sudah memadai untuk
  kebutuhan saat ini).
- **Panel "Log Keamanan" untuk komentar** — saat ini rate-limit komentar
  (bagian 6) berjalan otomatis di server, tapi belum ada tampilan log
  IP yang kena batas di dashboard (berbeda dengan log login yang sudah
  ada).
