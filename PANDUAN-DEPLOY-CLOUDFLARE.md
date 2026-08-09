# Panduan Deploy — SDN 01 Papahan (Workers + Static Assets + D1)

Panduan ini untuk yang belum pernah pakai GitHub/Cloudflare sama sekali.
Ikuti urut dari atas.

## 0. Yang perlu disiapkan
- Akun [GitHub](https://github.com) (gratis)
- Akun [Cloudflare](https://dash.cloudflare.com/sign-up) (gratis)
- Node.js terpasang di komputer (cek dengan `node -v` di terminal — kalau
  belum ada, unduh di [nodejs.org](https://nodejs.org), pilih versi LTS)

## 1. Unggah project ke GitHub
1. Buat repository baru di GitHub, misal `sdn01papahan`.
2. Di terminal, masuk ke folder project ini lalu jalankan:
   ```
   git init
   git add .
   git commit -m "Migrasi ke Workers + D1 (tanpa Astro)"
   git branch -M main
   git remote add origin https://github.com/USERNAME-ANDA/sdn01papahan.git
   git push -u origin main
   ```

## 2. Login Cloudflare & install Wrangler
```
npm install
npx wrangler login
```
Ini akan membuka browser untuk login ke akun Cloudflare Anda.

## 3. Buat database D1
```
npx wrangler d1 create sdn01papahan-db
```
Perintah ini akan menampilkan `database_id`. **Salin ID tersebut**, lalu buka
`wrangler.jsonc` di project ini dan tempel menggantikan
`GANTI_DENGAN_DATABASE_ID_DARI_WRANGLER_D1_CREATE`.

## 4. Jalankan skema & data awal ke D1 (produksi)
```
npm run db:migrate:remote
npm run db:seed:remote
```
`db:migrate:remote` membuat semua tabel (`schema.sql`). `db:seed:remote`
mengisi data demo/awal (`migration/seed.sql`) — termasuk akun admin default
**username: `admin`, password: `admin123`**. **Segera ganti password ini**
lewat menu `/admin/pengaturan.html` setelah situs online.

> Kalau Anda punya data dari situs SPA lama (bukan data demo), lihat bagian
> "Migrasi data situs lama" di bawah sebelum menjalankan langkah ini.

## 5. Sesuaikan `SITE_URL`
Di `wrangler.jsonc`, ganti nilai `vars.SITE_URL` dengan domain situs Anda
nanti (mis. `https://sdn01papahan.sch.id` atau subdomain
`*.workers.dev` bawaan Cloudflare). Nilai ini dipakai untuk `sitemap.xml`,
tag `og:url`, dan `robots.txt`.

## 6. Deploy manual pertama kali (untuk memastikan semua beres)
```
npm run deploy
```
Wrangler akan menampilkan URL situs Anda, contoh:
`https://sdn01papahan.<nama-akun-anda>.workers.dev`. Buka URL itu — situs
publik dan `/admin/login.html` harusnya sudah bisa diakses.

## 7. Hubungkan ke GitHub supaya auto-deploy tiap push
1. Buka [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**.
2. Pilih Worker `sdn01papahan` yang baru saja dideploy.
3. Masuk ke tab **Settings → Builds** (atau **Git integration**), klik
   **Connect to Git**, pilih repository `sdn01papahan` yang tadi di-push.
4. Set build command kosong (tidak perlu build, karena bukan Astro/framework),
   dan output/deploy config mengikuti `wrangler.jsonc` yang sudah ada di repo.
5. Setelah tersambung, setiap kali Anda `git push` ke branch `main`,
   Cloudflare otomatis men-deploy ulang.

## 8. Domain kustom (opsional)
Di halaman Worker yang sama → **Settings → Domains & Routes** → **Add
Custom Domain**, arahkan ke domain sekolah (mis. `sdn01papahan.sch.id`)
jika domain tersebut sudah terdaftar di Cloudflare DNS.

---

## Migrasi data situs lama (dari localStorage SPA)

1. Buka situs SPA lama di browser.
2. Buka DevTools Console (F12), jalankan:
   ```js
   copy(localStorage.getItem('sdn01papahan_db'))
   ```
   (sesuaikan nama key `STORAGE_KEY` jika berbeda — cek di kode lama Anda).
   Ini menyalin seluruh data ke clipboard.
3. Buat file `migration/old-db-export.json` di project ini, tempel isi
   clipboard tadi (harus berupa JSON valid, bukan string ganda — kalau hasil
   copy masih berupa string ber-escape, `JSON.parse()` sekali dulu di
   Console lalu copy hasilnya).
4. Jalankan:
   ```
   node migration/migrate-data.js
   ```
   Ini menghasilkan `migration/seed.sql` baru berisi data situs lama Anda
   (bukan lagi data demo), termasuk artikel berita, halaman kustom, dan akun
   admin (password di-hash ulang dari password lama Anda).
5. Jalankan `npm run db:seed:remote` untuk memasukkannya ke D1 produksi.

## Menambah admin baru / reset password lewat CLI (darurat)

Kalau lupa password dan tidak bisa login sama sekali, generate hash baru:
```js
// jalankan di Node:
const crypto = require('crypto');
const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync('password-baru-anda', salt, 100000, 32, 'sha256');
console.log(`pbkdf2$100000$${salt.toString('hex')}$${hash.toString('hex')}`);
```
Lalu jalankan manual:
```
npx wrangler d1 execute sdn01papahan-db --remote --command "UPDATE admin_users SET password_hash='HASIL_HASH_DI_ATAS' WHERE username='admin'"
```
