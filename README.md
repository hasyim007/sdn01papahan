# SDN 01 Papahan — Situs MPA (Cloudflare Workers + D1)

Migrasi dari SPA lama (satu file `index.html`, data di `localStorage`) ke
arsitektur MPA: HTML statis biasa untuk halaman tetap, Worker untuk halaman
dinamis (berita & halaman kustom), dan Cloudflare D1 sebagai database.
**Tidak memakai framework build seperti Astro** — sesuai keputusan project ini.

## Struktur

```
public/                  Halaman publik statis (disajikan sebagai Static Assets)
  index.html              Landing page
  profil.html, program.html, guru.html, prestasi.html, galeri.html, kontak.html
  assets/site.js          Fetch data publik + render nav/footer/isi halaman
  admin/                  Panel admin, path /admin/... (terpisah total dari publik)
    login.html, dashboard.html, hero.html, ... , pengaturan.html
    assets/admin.js        Editor generik (object/list) + auth guard

src/
  worker.js               Routing utama: /berita*, /[slug-custom], /api/*, /sitemap.xml, /robots.txt
  lib/db.js                Helper akses D1 (store, berita, custom_sections)
  lib/auth.js               Hash password (PBKDF2), session cookie httpOnly
  lib/render.js             Layout HTML untuk halaman yang dirender Worker

schema.sql                Skema D1
migration/
  migrate-data.js           Node script: data lama (JSON) -> seed.sql
  old-db-export.json        Contoh/data demo (setara DEFAULT_DB versi lama)
  seed.sql                   Hasil generate dari old-db-export.json (siap pakai)

wrangler.jsonc             Konfigurasi Workers + Static Assets + D1 binding
PANDUAN-DEPLOY-CLOUDFLARE.md   Panduan deploy dari nol
```

## Berjalan lokal

```
npm install
npx wrangler d1 create sdn01papahan-db   # sekali saja, lalu isi database_id ke wrangler.jsonc
npm run db:migrate:local
npm run db:seed:local
npm run dev
```
Buka `http://localhost:8787`. Login admin di `/admin/login.html` dengan
`admin` / `admin123` (data demo — segera ganti setelah login).

## Deploy produksi

Lihat `PANDUAN-DEPLOY-CLOUDFLARE.md`.

## Catatan desain

- Halaman tetap (`/profil`, `/program`, dst) adalah file HTML statis yang
  fetch data dari `/api/public/data` saat dibuka (client-side render), sama
  seperti pola lama tapi sumber datanya sekarang D1, bukan localStorage.
- Halaman berita (`/berita`, `/berita/:slug`) dan halaman kustom
  (`/[slug-custom]`) dirender **langsung oleh Worker** (template string di
  server) supaya tetap bisa di-crawl Google tanpa JavaScript, dan supaya
  artikel baru langsung tayang tanpa proses build ulang.
- Semua gambar disimpan sebagai base64 terkompresi langsung di kolom D1
  (fungsi `resizeImageFile()` di `admin/assets/admin.js`) — tidak memakai R2.
- Password admin di-hash (PBKDF2/SHA-256) di server, sesi disimpan di D1 dan
  dipetakan ke cookie httpOnly — tidak ada lagi cek password polos di client.
- `pageOrder` (urutan menu) disinkronkan dengan halaman kustom tanpa
  me-reset posisi yang sudah diatur admin (lihat komentar di
  `public/admin/page-order.html`) — ini memperbaiki bug yang sama di versi
  SPA lama.
