# Tutorial: GitHub (Repository) + Cloudflare Workers (Hosting) + D1 (Database)

## 0. Arsitektur

Semuanya jadi **satu domain, satu Worker**:

```
GitHub repo (nyimpen source code, versioning)
        │
        │  git push / atau Cloudflare tarik otomatis dari GitHub
        ▼
Cloudflare Worker "papahan-api"
   ├─ Serve file statis (public/index.html)  → ini WEBSITE-nya
   ├─ Serve API  (/api/data GET & PUT)        → src/index.js
   └─ Baca/tulis ke D1 (database SQLite)      → schema.sql
```

Karena HTML dan API sama-sama disajikan oleh Worker yang sama, **tidak perlu lagi GitHub Pages, dan tidak ada masalah CORS lintas domain**.

### Struktur folder final

```
papahan-web/
├── public/
│   └── index.html          ← ini isinya sdn_01_papahan.html (di-rename)
├── src/
│   └── index.js             ← kode Worker (API)
├── schema.sql               ← skema database D1
└── wrangler.toml            ← konfigurasi deploy
```

File-file dengan struktur ini sudah saya siapkan di paket download.

---

## Bagian A — Siapkan GitHub sebagai Repository

Fungsinya di sini murni **penyimpanan & version control kode**, bukan hosting.

```bash
mkdir papahan-web && cd papahan-web
# taruh folder public/, src/, dan file schema.sql, wrangler.toml di sini

git init
git add .
git commit -m "Initial commit - website SDN 01 Papahan"
git branch -M main
```

Buat repo baru di https://github.com/new (boleh **Private**, tidak wajib publik seperti kalau pakai GitHub Pages), lalu:

```bash
git remote add origin https://github.com/USERNAME/papahan-web.git
git push -u origin main
```

Selesai — GitHub tugasnya cuma sampai di sini (nyimpen kode). Hosting sesungguhnya ada di Cloudflare.

---

## Bagian B — Setup Alat Cloudflare

```bash
npm install -g wrangler
wrangler login
```
Browser terbuka → klik **Allow** untuk menghubungkan akun Cloudflare kamu.

---

## Bagian C — Buat Database D1

```bash
wrangler d1 create papahan_site_db
```

Output-nya berisi blok seperti ini — **salin `database_id`**:
```toml
[[d1_databases]]
binding = "DB"
database_name = "papahan_site_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Buka `wrangler.toml`, ganti baris `database_id = "PASTE_DATABASE_ID_DARI_DASHBOARD"` dengan ID asli tadi.

Lalu jalankan skema-nya ke database production:
```bash
wrangler d1 execute papahan_site_db --remote --file=./schema.sql
```
Ini membuat tabel `site_data` dan mengisi baris awal.

---

## Bagian D — Set Kunci Rahasia (SYNC_KEY)

Ini kunci yang dipakai admin untuk **menulis/mengedit** data situs lewat panel admin di website.

```bash
wrangler secret put SYNC_KEY
```
Ketik kunci acak yang panjang (24+ karakter), Enter. **Simpan baik-baik** — nanti dipakai di panel admin website.

---

## Bagian E — Deploy ke Cloudflare Workers

```bash
wrangler deploy
```

Setelah selesai, muncul URL seperti:
```
https://papahan-api.USERNAME.workers.dev
```

**Buka URL itu langsung di browser** — website kamu sudah tampil, karena `public/index.html` otomatis disajikan oleh Worker sebagai halaman utama. Tidak perlu GitHub Pages sama sekali.

---

## Bagian F — Aktifkan Sinkron Cloud di HTML

Karena sekarang HTML dan API satu domain yang sama, cukup arahkan `CLOUD_API_BASE` ke URL Worker kamu sendiri (dari Bagian E):

Di `public/index.html`, cari baris:
```js
const CLOUD_API_BASE = '';
```
Ganti:
```js
const CLOUD_API_BASE = 'https://papahan-api.USERNAME.workers.dev';
```

Commit & push perubahan ke GitHub (untuk arsip/histori), lalu deploy ulang ke Cloudflare:
```bash
git add public/index.html
git commit -m "Aktifkan sinkron cloud"
git push

wrangler deploy
```

> Setiap kali kamu mengubah kode (HTML maupun Worker), alurnya selalu: **edit → commit & push ke GitHub → `wrangler deploy`** untuk benar-benar mempublikasikannya.

---

## Bagian G — (Opsional) Auto-Deploy dari GitHub ke Cloudflare

Supaya tidak perlu jalankan `wrangler deploy` manual tiap kali push, kamu bisa hubungkan repo GitHub langsung ke Cloudflare (fitur **Workers Builds**), jadi setiap `git push` otomatis ter-deploy:

1. Dashboard Cloudflare → **Workers & Pages** → pilih Worker `papahan-api`.
2. Tab **Settings → Builds** (atau **Build & deployments**, namanya bisa sedikit berbeda tergantung update dashboard).
3. **Connect to Git** → pilih akun GitHub kamu → authorize → pilih repo `papahan-web`, branch `main`.
4. Set **Build command**: kosongkan (tidak perlu build, ini vanilla JS/HTML), dan **Deploy command**: `wrangler deploy` (biasanya sudah default).
5. Simpan. Sekarang setiap `git push` ke `main` akan otomatis trigger deploy ke Cloudflare — kamu tidak perlu `wrangler deploy` manual lagi.

Kalau step ini tidak kamu lakukan, tidak masalah — cukup ingat jalankan `wrangler deploy` manual tiap ada perubahan.

---

## Bagian H — (Opsional) Custom Domain

Kalau domain `sdn01papahan.sch.id` sudah dikelola lewat Cloudflare DNS (nameserver diarahkan ke Cloudflare):

1. Dashboard → **Workers & Pages** → Worker `papahan-api` → **Settings → Domains & Routes**.
2. **Add → Custom Domain** → masukkan `sdn01papahan.sch.id`.
3. Cloudflare otomatis atur DNS dan SSL-nya.
4. Update juga `ALLOWED_ORIGIN` di `wrangler.toml` ke domain ini kalau nanti kamu pisah lagi frontend/backend — untuk sekarang (satu Worker untuk semua) variabel ini tidak terlalu krusial tapi tetap aman dibiarkan.

---

## Bagian I — Verifikasi

1. Buka `https://papahan-api.USERNAME.workers.dev` (atau custom domain) → website harus muncul.
2. Cek API:
   ```bash
   curl https://papahan-api.USERNAME.workers.dev/api/data
   ```
   Harus balas JSON (`{}` kalau masih kosong).
3. Di panel admin website → isi **Kunci Sinkronisasi** dengan `SYNC_KEY` dari Bagian D → **Sinkron Sekarang** → harus sukses tanpa error.

---

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Buka URL Worker tapi halaman kosong/404 | Pastikan `public/index.html` ada persis di path itu, dan `[assets] directory = "./public"` di `wrangler.toml` sudah benar, lalu `wrangler deploy` ulang. |
| `401 Kunci sinkronisasi salah` | `SYNC_KEY` di panel admin ≠ yang di-set via `wrangler secret put SYNC_KEY`. Set ulang salah satunya agar sama. |
| Data tidak tersimpan | Pastikan pakai `--remote` saat `wrangler d1 execute` (tanpa itu hanya mengubah database simulasi lokal). |
| Perubahan kode tidak muncul di web | Kamu lupa `wrangler deploy` setelah edit (push ke GitHub saja TIDAK otomatis publish, kecuali sudah setup Bagian G). |
| Error saat `wrangler deploy` soal `assets`/`main` | Pastikan struktur folder persis: `public/index.html` dan `src/index.js`, sesuai `wrangler.toml`. |

---

## Ringkasan Perintah

```bash
# GitHub (repo saja)
git init && git add . && git commit -m "init"
git remote add origin https://github.com/USERNAME/papahan-web.git
git push -u origin main

# Cloudflare (hosting + API + database)
npm install -g wrangler
wrangler login
wrangler d1 create papahan_site_db                              # isi database_id ke wrangler.toml
wrangler d1 execute papahan_site_db --remote --file=./schema.sql
wrangler secret put SYNC_KEY
wrangler deploy                                                   # ini yang benar-benar publish website
```
