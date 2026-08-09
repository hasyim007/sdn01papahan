# Tutorial: GitHub (Repo) + Cloudflare Workers (Hosting) + D1 (Database) — 100% Lewat Browser, Tanpa CLI

Semua langkah di bawah dilakukan lewat website **github.com** dan **dash.cloudflare.com**. Tidak ada Terminal, tidak ada `npm`, tidak ada `wrangler`.

## Struktur file yang dibutuhkan

```
papahan-web/
├── public/
│   └── index.html     ← isi dari sdn_01_papahan.html
├── src/
│   └── index.js        ← kode Worker (API)
├── schema.sql
└── wrangler.toml
```

---

## Bagian A — Buat Repository di GitHub (lewat browser)

1. Buka https://github.com/new
2. Isi nama repo, misalnya `papahan-web`. Boleh **Private**.
3. Klik **Create repository**.
4. Di halaman repo yang masih kosong, klik **uploading an existing file** (atau tombol **Add file → Upload files**).
5. **Drag & drop** atau pilih file `sdn_01_papahan.html`, `index.js`, `schema.sql`, `wrangler.toml` dari komputer kamu — upload sekaligus.

Karena GitHub upload-file tidak bisa langsung bikin folder dengan drag file satu-satu ke path tertentu, cara paling gampang:

**Cara termudah — buat file satu per satu langsung di GitHub:**
1. Di halaman repo → klik **Add file → Create new file**.
2. Di kotak nama file, ketik: `public/index.html` (ketik tanda `/` akan otomatis membuat folder `public`).
3. Buka file `sdn_01_papahan.html` di komputer pakai Notepad/TextEdit → **Select All → Copy** → paste ke kotak editor GitHub.
4. Scroll ke bawah → **Commit changes**.
5. Ulangi untuk `src/index.js` (buat file baru dengan nama `src/index.js`, paste isi `index.js`).
6. Ulangi untuk `schema.sql` (nama file: `schema.sql`, taruh di root).
7. Ulangi untuk `wrangler.toml` (nama file: `wrangler.toml`, taruh di root).

Setelah ini, struktur repo kamu harus persis seperti daftar folder di atas. Cek dengan klik nama repo → pastikan ada folder `public/` dan `src/`.

> File `sdn_01_papahan.html` cukup besar (~260 KB). Kalau isinya kepanjangan untuk di-paste manual di editor GitHub, pakai cara **upload file** (langkah A4) saja untuk file itu — upload ke root dulu, lalu setelah ke-upload, klik file tersebut → titik tiga (**...**) atau ikon pensil **Edit** → tidak bisa pindah folder langsung dari situ, jadi cara paling pasti adalah: buat file kosong `public/index.html` dulu (langkah A2–A4 di atas, isi asal 1 karakter), commit, lalu buka file itu → klik ikon pensil (Edit) → hapus isi → paste isi `sdn_01_papahan.html` yang sudah di-copy dari editor teks lokal → **Commit changes**.

---

## Bagian B — Buat Database D1 (lewat Dashboard Cloudflare)

1. Buka https://dash.cloudflare.com → login.
2. Menu kiri: **Workers & Pages** → tab **D1 SQL Database** (atau cari "D1" di search bar dashboard).
3. Klik **Create Database**.
4. Nama database: `papahan_site_db` → **Create**.
5. Setelah dibuat, kamu akan melihat halaman detail database dengan **Database ID** — **salin ID ini**, contoh: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.

### B1. Isi Database ID ke `wrangler.toml`

1. Balik ke GitHub, buka file `wrangler.toml` di repo kamu.
2. Klik ikon pensil (**Edit this file**).
3. Ganti baris:
   ```
   database_id = "PASTE_DATABASE_ID_DARI_DASHBOARD"
   ```
   dengan ID asli yang kamu salin tadi.
4. **Commit changes**.

### B2. Jalankan Skema Database

1. Di dashboard Cloudflare, buka database `papahan_site_db` → tab **Console**.
2. Paste dan jalankan (klik **Execute** atau tombol run) **statement pertama saja dulu**:
   ```sql
   CREATE TABLE IF NOT EXISTS site_data (
     id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   ```
3. Setelah sukses, hapus, lalu paste dan jalankan statement kedua:
   ```sql
   INSERT OR IGNORE INTO site_data (id, data, updated_at) VALUES ('main', '{}', 0);
   ```
   (Console D1 di dashboard cuma menjalankan 1 statement terakhir kalau ditempel sekaligus — makanya harus dua kali terpisah.)
4. Cek tab **Tables** di sebelahnya — harus muncul tabel `site_data` dengan 1 baris data.

---

## Bagian C — Deploy Worker Langsung dari GitHub (lewat Dashboard)

Ini bagian yang menghubungkan GitHub kamu ke hosting Cloudflare — **tanpa command apapun**.

1. Dashboard Cloudflare → **Workers & Pages** → **Create**.
2. Pilih tab **Workers** → klik **Import a repository** (atau **Connect to Git**).
3. Kalau belum pernah, klik **Connect GitHub** → pilih akun/organisasi GitHub kamu → **Authorize Cloudflare Workers and Pages**.
4. Pilih repository `papahan-web` yang tadi kamu buat → **Begin setup**.
5. Di halaman konfigurasi:
   - **Project name**: biarkan default atau ubah, misalnya `papahan-api`.
   - **Branch**: `main`.
   - Cloudflare akan otomatis mendeteksi `wrangler.toml` di repo kamu dan memakainya sebagai konfigurasi (termasuk binding ke D1 dan folder `public/` untuk file statis) — biasanya kamu tidak perlu isi kolom build command apapun karena project ini bukan project yang perlu di-build (murni HTML + JS biasa).
6. Klik **Save and Deploy**.
7. Tunggu proses deploy selesai (biasanya < 1 menit). Setelah selesai, Cloudflare menampilkan URL seperti:
   ```
   https://papahan-api.USERNAME.workers.dev
   ```
8. Klik/buka URL itu — **website kamu harus langsung tampil**, karena `public/index.html` disajikan otomatis oleh Worker.

Sejak titik ini, **setiap kamu edit file di GitHub dan commit, Cloudflare otomatis re-deploy Worker-nya sendiri** — tidak perlu langkah manual apapun lagi.

---

## Bagian D — Set Kunci Rahasia SYNC_KEY (lewat Dashboard)

1. Dashboard → **Workers & Pages** → pilih Worker `papahan-api`.
2. Tab **Settings** → **Variables and Secrets**.
3. Klik **Add** (atau **+ Add variable**).
4. Isi:
   - **Name**: `SYNC_KEY`
   - **Type**: pilih **Secret** (bukan "Text/Plaintext") supaya nilainya tersembunyi.
   - **Value**: buat kunci acak yang panjang (24+ karakter, campur huruf & angka) — **simpan baik-baik**, ini yang nanti dipakai di panel admin website.
5. Klik **Save** / **Deploy**.

---

## Bagian E — Sambungkan HTML ke Worker (CLOUD_API_BASE)

Karena HTML dan API sekarang satu domain yang sama (disajikan oleh Worker yang sama), tinggal isi `CLOUD_API_BASE` dengan URL Worker kamu sendiri:

1. Di GitHub, buka `public/index.html` → klik ikon pensil (**Edit**).
2. Cari (pakai Ctrl+F di browser) baris:
   ```js
   const CLOUD_API_BASE = '';
   ```
3. Ganti jadi:
   ```js
   const CLOUD_API_BASE = 'https://papahan-api.USERNAME.workers.dev';
   ```
   (Ganti `USERNAME` sesuai URL asli dari Bagian C.)
4. **Commit changes** — Cloudflare akan otomatis re-deploy dalam beberapa detik/menit (bisa dicek progressnya di dashboard Worker kamu, tab **Deployments**).

---

## Bagian F — Verifikasi

1. Buka `https://papahan-api.USERNAME.workers.dev` — website harus tampil.
2. Buka URL yang sama tapi tambahkan `/api/data` di belakang, misalnya:
   ```
   https://papahan-api.USERNAME.workers.dev/api/data
   ```
   Harus muncul teks JSON (`{}` kalau data masih kosong).
3. Di website, buka panel admin → cari kolom **Kunci Sinkronisasi (X-Sync-Key)** → isi dengan `SYNC_KEY` dari Bagian D → **Simpan Kunci** → klik **Sinkron Sekarang** → harus sukses.

---

## Bagian G — (Opsional) Custom Domain

Kalau domain `sdn01papahan.sch.id` sudah pakai nameserver Cloudflare:

1. Dashboard → Worker `papahan-api` → **Settings → Domains & Routes**.
2. **Add → Custom Domain** → masukkan domainnya.
3. Cloudflare otomatis atur DNS + SSL.

---

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Deploy gagal, error soal `assets`/`main` | Cek ulang struktur file di GitHub: harus ada `public/index.html`, `src/index.js`, `wrangler.toml` di root repo (bukan di dalam subfolder tambahan). |
| Halaman kosong / 404 setelah deploy | Pastikan nama file benar-benar `public/index.html` (huruf kecil semua), dan isi `[assets] directory = "./public"` ada di `wrangler.toml`. |
| `401 Kunci sinkronisasi salah` | Nilai `SYNC_KEY` di panel admin website beda dengan yang di-set di Bagian D. Samakan. |
| Data situs tidak tersimpan | Cek lagi Bagian B2 — pastikan tabel `site_data` sudah benar-benar ada di tab **Tables**. |
| Setelah commit di GitHub, web tidak berubah | Cek tab **Deployments** di halaman Worker — kalau tidak ada deployment baru otomatis muncul, cek koneksi Git di **Settings → Builds** (pastikan masih terhubung ke repo & branch yang benar). |
| Waktu isi `wrangler.toml`, D1 tidak ke-bind | Pastikan `database_id` di `wrangler.toml` benar-benar sama persis dengan yang ditampilkan di halaman database D1 (Bagian B), tanpa spasi tambahan. |

---

## Ringkasan Alur

```
1. Buat repo GitHub → isi file (public/index.html, src/index.js, schema.sql, wrangler.toml)
2. Cloudflare Dashboard → buat D1 database → salin database_id
3. GitHub → edit wrangler.toml, isi database_id
4. Cloudflare Dashboard → D1 Console → jalankan schema.sql (2 statement, satu-satu)
5. Cloudflare Dashboard → Create Worker → Import dari GitHub repo → Deploy
6. Cloudflare Dashboard → Settings → Variables and Secrets → tambah SYNC_KEY
7. GitHub → edit public/index.html → isi CLOUD_API_BASE dengan URL Worker → commit (auto re-deploy)
8. Buka URL Worker → website + sinkron data sudah aktif
```
