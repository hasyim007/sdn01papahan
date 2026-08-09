# Panduan Deploy — SDN 01 Papahan (Workers + Static Assets + D1)

Panduan ini untuk yang **belum pernah pakai GitHub atau Cloudflare sama sekali**.
Ikuti urut dari atas.

---

## 0. Yang Anda butuhkan

- Akun [GitHub](https://github.com) (gratis)
- Akun [Cloudflare](https://dash.cloudflare.com/sign-up) (gratis)
- Komputer dengan [Node.js](https://nodejs.org) terpasang (versi 18 ke atas)

---

## 1. Push project ini ke GitHub

1. Buat repository baru di GitHub, misal `sdn01-papahan`.
2. Di folder project ini (folder yang berisi `wrangler.toml`), jalankan:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/USERNAME_ANDA/sdn01-papahan.git
   git push -u origin main
   ```
3. **PENTING**: pastikan `scripts/db-export.json` dan file `*.sql` hasil migrasi
   **tidak ikut ter-commit** (sudah ada di `.gitignore`) — file itu mengandung
   password/hash, jangan sampai publik.

---

## 2. Buat database D1 di Cloudflare

1. Install Wrangler (CLI Cloudflare) secara lokal:
   ```bash
   npm install
   npx wrangler login
   ```
   Ini akan membuka browser untuk login ke akun Cloudflare Anda.

2. Buat database D1:
   ```bash
   npx wrangler d1 create sdn01-papahan-db
   ```
   Perintah ini menampilkan blok konfigurasi berisi `database_id`. **Salin
   `database_id` tersebut**, lalu buka `wrangler.toml` di project ini dan
   ganti baris:
   ```toml
   database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"
   ```
   dengan ID yang Anda dapat.

3. Jalankan schema (buat semua tabel):
   ```bash
   npx wrangler d1 execute sdn01-papahan-db --remote --file=./schema.sql
   ```

---

## 3. Isi data awal

Ada dua opsi tergantung situasi Anda:

### Opsi A — Situs baru (belum ada data dari SPA lama)

Set username & password admin pertama:
```bash
node scripts/set-admin-password.js admin PasswordAmanAnda123
npx wrangler d1 execute sdn01-papahan-db --remote --file=./scripts/admin-password.sql
```
Konten default (profil kosong dsb, lihat `schema.sql`) sudah otomatis terisi
saat menjalankan schema di langkah 2. Login ke `/admin/login` lalu mulai isi
konten lewat panel admin.

### Opsi B — Migrasi dari situs SPA lama (localStorage)

1. Buka situs SPA **lama** di browser, buka DevTools Console (F12), jalankan:
   ```js
   copy(localStorage.getItem('sdn01papahan_cms_db_v1'))
   ```
2. Buat file `scripts/db-export.json`, paste hasil copy tadi ke dalamnya.
3. Jalankan migrasi (ganti `PasswordBaruAnda123` dengan password admin baru
   yang ingin dipakai — password lama tidak ikut dimigrasikan karena versi
   lama menyimpannya polos/tidak di-hash):
   ```bash
   node scripts/migrate-from-json.js scripts/db-export.json PasswordBaruAnda123
   npx wrangler d1 execute sdn01-papahan-db --remote --file=./scripts/migration-data.sql
   ```
4. Selesai — semua profil, guru, berita, galeri, dst dari situs lama sudah
   masuk ke D1.

---

## 4. Hubungkan GitHub ke Cloudflare Workers (auto-deploy)

1. Buka [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Workers** → tab **Connect to Git** (atau **Import a repository**, tergantung versi dashboard).
2. Pilih repository `sdn01-papahan` yang tadi di-push ke GitHub.
3. Cloudflare akan mendeteksi `wrangler.toml` secara otomatis — biarkan
   pengaturan build default (tidak perlu build command, karena project ini
   tanpa framework build).
4. Di bagian **Bindings** pastikan binding D1 (`DB`) mengarah ke database
   `sdn01-papahan-db` yang dibuat di langkah 2. (Kalau `wrangler.toml` sudah
   benar berisi `database_id`, ini biasanya otomatis terbaca.)
5. Klik **Save and Deploy**. Setiap kali Anda `git push` ke branch `main`
   setelah ini, Cloudflare akan otomatis deploy ulang.

---

## 5. Set domain (opsional tapi disarankan untuk SEO)

1. Di halaman Worker Anda di dashboard, buka tab **Settings → Domains & Routes**.
2. Tambahkan custom domain (mis. `sdn01papahan.sch.id`) jika Anda punya, atau
   gunakan subdomain `*.workers.dev` bawaan.
3. **PENTING untuk SEO**: setelah tahu domain final, update `wrangler.toml`:
   ```toml
   [vars]
   SITE_URL = "https://domain-final-anda.com"
   ```
   lalu `git push` lagi supaya `SITE_URL` dipakai di sitemap.xml & meta tags
   Open Graph.

---

## 6. Login admin & cek situs

1. Buka `https://domain-anda/admin/login`, login dengan akun yang dibuat di
   Langkah 3.
2. Segera buka `/admin/pengaturan` untuk memastikan Anda tahu cara ganti
   password kalau perlu.
3. Cek `https://domain-anda/sitemap.xml` dan `https://domain-anda/robots.txt`
   sudah muncul dengan benar.
4. Daftarkan situs ke [Google Search Console](https://search.google.com/search-console)
   dan submit `sitemap.xml` supaya mulai ter-crawl.

---

## Troubleshooting

- **Login admin gagal terus** → pastikan Langkah 3 (set password) sudah
  dijalankan dan berhasil (`npx wrangler d1 execute ... --remote`). Password
  default di `schema.sql` sengaja berupa placeholder yang TIDAK BISA dipakai
  login, supaya tidak ada password default yang mudah ditebak.
- **Halaman kustom (`/slug-anda`) 404** → pastikan halaman tersebut diaktifkan
  (`active`) lewat `/admin/custom-sections`, dan sudah disimpan.
- **Perubahan konten tidak muncul di situs publik** → konten publik dibaca
  langsung dari D1 setiap request (tidak ada cache build), jadi seharusnya
  langsung berubah setelah disimpan di admin. Coba hard refresh (Ctrl+Shift+R).
- **Update kode tidak ter-deploy otomatis** → cek tab **Deployments** di
  dashboard Cloudflare untuk melihat log build/deploy terakhir.
