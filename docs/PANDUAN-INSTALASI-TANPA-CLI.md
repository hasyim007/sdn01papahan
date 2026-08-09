# Panduan Instalasi TANPA CLI — Hanya Dashboard GitHub & Cloudflare

Panduan ini untuk Anda yang **tidak mau/tidak bisa pakai Terminal, Git, atau
Node.js sama sekali**. Semua langkah dilakukan lewat browser: dashboard
GitHub dan dashboard Cloudflare. Ikuti berurutan dari atas, jangan ada yang
dilewati.

**Total waktu:** kurang lebih 30–45 menit untuk yang pertama kali.

---

## Daftar Isi

1. [Persiapan Akun](#1-persiapan-akun)
2. [Upload Project ke GitHub](#2-upload-project-ke-github)
3. [Buat Database D1 di Cloudflare](#3-buat-database-d1-di-cloudflare)
4. [Isi Database ID ke wrangler.toml (lewat GitHub)](#4-isi-database-id-ke-wranglertoml-lewat-github)
5. [Jalankan schema.sql di D1 Console](#5-jalankan-schemasql-di-d1-console)
6. [Buat Password Admin Pertama](#6-buat-password-admin-pertama)
7. [Hubungkan GitHub ke Cloudflare Workers](#7-hubungkan-github-ke-cloudflare-workers)
8. [Cek Binding Database Otomatis Terpasang](#8-cek-binding-database-otomatis-terpasang)
9. [Atur Domain & SITE_URL](#9-atur-domain--site_url)
10. [Login & Cek Situs](#10-login--cek-situs)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Persiapan Akun

Anda perlu 2 akun gratis, buat dulu kalau belum punya:

- **GitHub**: [github.com/signup](https://github.com/signup)
- **Cloudflare**: [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)

Tidak perlu install apa pun di komputer. Yang Anda perlukan hanya file hasil
extract dari `sdn01-papahan-mpa.zip` yang sudah dibuatkan sebelumnya —
**extract dulu zip itu** di komputer Anda (klik kanan → Extract All / Extract
Here) sampai jadi folder biasa bernama `sdn01-papahan`.

---

## 2. Upload Project ke GitHub

1. Login ke [github.com](https://github.com).
2. Klik tombol **+** di pojok kanan atas → **New repository**.
3. Isi:
   - **Repository name**: `sdn01-papahan` (bebas, tapi ingat namanya)
   - **Visibility**: pilih **Private** (disarankan, karena nanti ada
     file konfigurasi yang sebaiknya tidak publik)
   - **JANGAN centang** "Add a README file" — biarkan repo kosong dulu.
4. Klik **Create repository**.
5. Di halaman repo yang masih kosong, Anda akan melihat beberapa opsi setup.
   Cari link kecil bertuliskan **"uploading an existing file"** (biasanya ada
   di paragraf tengah halaman) → klik itu.
6. Sekarang Anda ada di halaman upload. **Buka folder hasil extract**
   `sdn01-papahan` di komputer Anda (pakai File Explorer / Finder), lalu:
   - **Blok/select SEMUA isi di DALAM folder** `sdn01-papahan` (bukan folder
     `sdn01-papahan` itu sendiri — masuk dulu ke dalamnya, baru select all
     isinya: `wrangler.toml`, `schema.sql`, `package.json`, `README.md`,
     folder `src`, folder `public`, folder `scripts`, folder `docs`, dan
     `.gitignore`).
   - **Drag semua yang ter-select tadi** ke area upload di browser
     ("Drag files here to add them to your repository").
   - Tunggu sampai semua file selesai ter-upload (progress bar di setiap
     file akan hilang/centang). Untuk repo sebesar ini biasanya hanya
     beberapa detik — total ada sekitar 40 file.
   - **Penting:** pastikan struktur foldernya ikut terbawa (GitHub akan
     menampilkan path seperti `src/index.js`, `public/admin/login.html`,
     dst — bukan semua file numpuk rata di root tanpa folder). Browser modern
     (Chrome/Edge/Firefox terbaru) mendukung drag-folder ini dengan baik.
7. Scroll ke bawah, isi kolom **commit message** misalnya `Initial commit`,
   lalu klik tombol hijau **Commit changes**.
8. Setelah selesai, klik nama repo Anda untuk memastikan strukturnya benar —
   Anda harus melihat file/folder: `wrangler.toml`, `schema.sql`, `src/`,
   `public/`, `scripts/`, `docs/`, `package.json`, `README.md`.

> **Kalau drag-folder tidak berhasil** (sebagian browser lama tidak
> mendukung), upload manual satu per satu lewat tombol **Add file → Create
> new file**, ketik nama path lengkapnya (misal `src/lib/auth.js`) di kolom
> nama file — GitHub otomatis membuatkan foldernya — lalu copy-paste isi
> file dari komputer Anda ke editor GitHub. Ini lebih lama tapi selalu
> berhasil.

---

## 3. Buat Database D1 di Cloudflare

1. Login ke [dash.cloudflare.com](https://dash.cloudflare.com).
2. Di sidebar kiri, cari menu **Workers & Pages** (ikon petir). Klik.
3. Di dalam halaman **Workers & Pages**, cari tab/menu **D1 SQL Database**
   (kadang muncul sebagai item terpisah di sidebar bernama **D1**, atau
   sebagai tab di dalam Workers & Pages — tergantung versi dashboard).
4. Klik **Create Database**.
5. Isi **Database name**: `sdn01-papahan-db` (harus persis sama dengan yang
   ada di `wrangler.toml`, supaya cocok).
6. Klik **Create**.
7. Setelah database dibuat, Anda akan masuk ke halaman detail database
   tersebut. Di situ ada informasi **Database ID** — bentuknya deretan huruf
   angka acak seperti `a1b2c3d4-e5f6-7890-abcd-ef1234567890`.
   **Salin (copy) Database ID ini**, kita butuh di langkah berikutnya.

---

## 4. Isi Database ID ke wrangler.toml (lewat GitHub)

1. Kembali ke repo GitHub Anda.
2. Klik file **`wrangler.toml`** di root repo untuk membukanya.
3. Klik ikon **pensil (Edit this file)** di kanan atas tampilan file.
4. Cari baris:
   ```toml
   database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"
   ```
5. Ganti bagian `REPLACE_WITH_YOUR_D1_DATABASE_ID` dengan Database ID yang
   Anda salin di Langkah 3, sehingga jadi seperti:
   ```toml
   database_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
   ```
   (Database ID milik Anda tentu berbeda — pastikan tanda kutip `"..."`
   tetap ada di kiri-kanannya.)
6. Scroll ke bawah, klik **Commit changes...** → pilih **Commit directly to
   the `main` branch** → klik **Commit changes**.

---

## 5. Jalankan schema.sql di D1 Console

1. Kembali ke dashboard Cloudflare → **Workers & Pages → D1** → klik
   database `sdn01-papahan-db` yang tadi dibuat.
2. Cari tab **Console** (kadang disebut **Query**) di halaman database
   tersebut — ini semacam kotak untuk menjalankan perintah SQL langsung dari
   browser, tanpa CLI.
3. Kembali ke repo GitHub, buka file **`schema.sql`**, klik ikon
   **"Raw"** atau langsung **select-all isi filenya lalu copy** (Ctrl+A,
   Ctrl+C) dari tampilan GitHub.
4. Paste seluruh isi `schema.sql` ke kotak Console D1 tadi, lalu klik
   **Run** / **Execute**.
5. Kalau berhasil, akan muncul pesan sukses dan beberapa baris "rows
   written". Ini artinya semua tabel (`store`, `admin`, `sessions`,
   `berita`, `berita_comments`, `custom_sections`) sudah terbuat beserta
   data awal (kosong/default).

> **Kalau muncul error "only one statement allowed" atau semacamnya:**
> beberapa versi D1 Console hanya bisa menjalankan satu perintah SQL per
> klik. Kalau begitu, jalankan `schema.sql` secara bertahap: copy-paste
> **satu blok `CREATE TABLE ...;` sampai titik-koma penutupnya** dulu, klik
> Run, lanjut ke blok `CREATE TABLE`/`CREATE INDEX` berikutnya, klik Run
> lagi — ulangi sampai semua `CREATE TABLE` dan `CREATE INDEX` selesai
> dijalankan satu per satu. Baru setelah itu, copy-paste kedua blok
> `INSERT OR IGNORE INTO admin ...` dan `INSERT OR IGNORE INTO store ...`
> di bagian paling bawah file (boleh sekaligus atau dipisah juga), klik Run.

---

## 6. Buat Password Admin Pertama

Data admin di `schema.sql` sengaja diisi hash **palsu** (tidak bisa dipakai
login) supaya tidak ada password default yang gampang ditebak orang lain.
Anda wajib set password sendiri lewat tool offline berikut:

1. Di komputer Anda, buka folder hasil extract `sdn01-papahan` →
   masuk ke folder `scripts` → cari file **`generate-admin-hash.html`**.
2. **Dobel-klik file itu** — akan terbuka di browser Anda (Chrome/Edge/
   Firefox). File ini jalan sepenuhnya di browser Anda sendiri, tidak
   perlu internet, tidak perlu di-upload ke mana pun.
3. Isi **Username Admin** (boleh biarkan `admin`) dan **Password Admin**
   (buat yang kuat, minimal 8 karakter, campur huruf besar/kecil/angka).
4. Klik **Buat Perintah SQL**.
5. Klik **Salin ke Clipboard** untuk menyalin hasil SQL-nya.
6. Kembali ke tab **D1 Console** di Cloudflare (halaman yang sama seperti
   Langkah 5), paste SQL hasil tadi ke kotak Console, klik **Run**.
7. Kalau sukses, admin dengan username & password yang Anda buat tadi sudah
   aktif di database. **Catat/simpan password ini baik-baik** — tidak ada
   cara untuk "melihat ulang" password dari database, hanya bisa diganti
   ulang lewat cara yang sama kalau lupa.

---

## 7. Hubungkan GitHub ke Cloudflare Workers

1. Di dashboard Cloudflare, masuk ke **Workers & Pages**.
2. Klik **Create** (atau **Create application**) → pilih tab **Workers**.
3. Cari opsi **Import a repository** atau **Connect to Git** (istilahnya
   bisa sedikit berbeda tergantung update dashboard Cloudflare terbaru).
4. Kalau ini pertama kali, Cloudflare akan minta Anda **Connect GitHub
   Account** — klik itu, lalu di halaman GitHub yang muncul, pilih
   **Authorize Cloudflare Workers and Pages**, dan izinkan akses ke repo
   `sdn01-papahan` (atau "All repositories" kalau Anda tidak keberatan).
5. Setelah terhubung, pilih repository **`sdn01-papahan`** dari daftar,
   klik **Begin setup** / **Continue**.
6. Di halaman konfigurasi build:
   - **Project name**: bebas, misal `sdn01-papahan` (ini akan jadi bagian
     dari URL `NAMA-PROJECT.workers.dev`)
   - **Production branch**: `main`
   - **Build command**: **kosongkan saja** (tidak perlu build, project ini
     HTML/CSS/JS biasa)
   - **Deploy command**: biarkan default (biasanya otomatis terisi
     `npx wrangler deploy` — Cloudflare yang menjalankan ini di server
     mereka, bukan komputer Anda, jadi Anda tetap tidak perlu install apa
     pun)
7. Klik **Save and Deploy**.
8. Tunggu proses deploy (biasanya 30 detik – 2 menit). Kalau sukses, Anda
   akan diberi URL seperti `https://sdn01-papahan.NAMA-AKUN.workers.dev`.

---

## 8. Cek Binding Database Otomatis Terpasang

Karena `wrangler.toml` di repo Anda sudah berisi konfigurasi binding D1
(nama binding `DB` mengarah ke `sdn01-papahan-db`), Cloudflare **biasanya
otomatis membaca dan memasangnya** saat deploy. Untuk memastikan:

1. Di halaman project Worker Anda, buka tab **Settings**.
2. Cari bagian **Bindings** (atau **Variables and Secrets** → sub-bagian D1
   Database Bindings).
3. Pastikan ada satu binding dengan:
   - **Variable name**: `DB`
   - **D1 Database**: `sdn01-papahan-db`
4. Kalau **belum ada**, tambahkan manual: klik **Add binding** → pilih tipe
   **D1 Database** → Variable name isi `DB` → pilih database
   `sdn01-papahan-db` → **Save**. Setelah menyimpan binding manual, Cloudflare
   akan minta **Deploy** ulang — klik saja tombol deploy/redeploy yang
   muncul.

---

## 9. Atur Domain & SITE_URL

Situs Anda sudah bisa diakses lewat `https://NAMA-PROJECT.workers.dev` dari
Langkah 7. Ini sudah cukup untuk mulai memakai panel admin. Tapi untuk SEO
(supaya Google index dengan alamat yang benar) dan kalau Anda punya domain
sendiri (misal `sdn01papahan.sch.id`), lakukan ini:

### 9a. Tambah custom domain (opsional, kalau punya domain sendiri)

1. Di halaman Worker Anda → tab **Settings** → **Domains & Routes**.
2. Klik **Add** → **Custom Domain** → ketik domain Anda → ikuti instruksi
   (biasanya minta domain tersebut juga terdaftar/dikelola di Cloudflare
   DNS).

### 9b. Update SITE_URL supaya cocok

1. Kembali ke repo GitHub → buka **`wrangler.toml`** → klik **pensil (Edit)**.
2. Cari baris:
   ```toml
   SITE_URL = "https://sdn01papahan.example.workers.dev"
   ```
3. Ganti dengan URL asli situs Anda (dari Langkah 7 atau domain custom dari
   9a), misalnya:
   ```toml
   SITE_URL = "https://sdn01-papahan.NAMA-AKUN.workers.dev"
   ```
   atau kalau pakai domain sendiri:
   ```toml
   SITE_URL = "https://sdn01papahan.sch.id"
   ```
4. **Commit changes** langsung ke branch `main` (sama seperti Langkah 4).
5. Commit ini otomatis memicu Cloudflare untuk **deploy ulang** (karena
   sudah terhubung Git). Tunggu 1-2 menit, cek tab **Deployments** di
   halaman Worker untuk memastikan status **Success**.

---

## 10. Login & Cek Situs

1. Buka `https://URL-SITUS-ANDA/` — pastikan landing page muncul (masih
   kosong/default karena belum diisi konten, tidak apa-apa).
2. Buka `https://URL-SITUS-ANDA/admin/login` — login pakai username &
   password yang Anda buat di Langkah 6.
3. Setelah berhasil login, mulai isi konten satu-satu lewat menu sidebar:
   **Hero → Sambutan → Profil → Program → Guru → Prestasi → Berita →
   Galeri → Testimoni → FAQ → Kontak & Footer**.
4. Cek juga:
   - `https://URL-SITUS-ANDA/sitemap.xml` → harus muncul daftar URL.
   - `https://URL-SITUS-ANDA/robots.txt` → harus muncul isi `Disallow: /admin/`.
5. (Opsional, disarankan) Daftarkan situs ke
   [Google Search Console](https://search.google.com/search-console),
   verifikasi kepemilikan, lalu submit `sitemap.xml` supaya Google mulai
   meng-crawl.

---

## 11. Troubleshooting

**Deploy gagal, muncul error soal `database_id`**
→ Pastikan Langkah 4 sudah benar — `database_id` di `wrangler.toml` harus
persis sama dengan Database ID yang ditampilkan Cloudflare di halaman D1
Anda (tanpa spasi/karakter tambahan), dan tetap dalam tanda kutip.

**Deploy gagal, error lain yang tidak dimengerti**
→ Buka tab **Deployments** di halaman Worker Anda, klik deployment yang
gagal, lihat **Build log** — biasanya pesan errornya cukup jelas
(misal nama file salah ketik, atau folder `public` tidak ketemu karena
struktur upload di Langkah 2 berantakan). Betulkan file terkait langsung di
GitHub (edit → commit), nanti otomatis deploy ulang.

**Login admin selalu gagal ("Username atau password salah")**
→ Ulangi Langkah 6 dari awal — pastikan SQL hasil dari
`generate-admin-hash.html` benar-benar ter-paste utuh (2 baris: `DELETE...`
dan `INSERT...`) dan tombol **Run** di D1 Console benar-benar sukses tanpa
error.

**Halaman `/admin/*` atau `/berita/*` menampilkan 404 padahal sudah deploy**
→ Cek lagi isi `wrangler.toml` bagian `[assets]` — pastikan tidak ada yang
berubah/terhapus saat proses upload/edit di GitHub. Bandingkan dengan file
asli dari zip.

**Struktur folder berantakan setelah upload ke GitHub (semua file jadi satu
level, tidak ada folder `src`/`public`)**
→ Hapus semua file yang ter-upload (select file di root repo → Delete),
lalu ulangi Langkah 2 dengan lebih hati-hati: pastikan Anda drag folder
`src`, `public`, `scripts`, `docs` (bukan isi di dalamnya satu-satu) ke area
upload GitHub, supaya strukturnya ikut terbawa.

**Ingin ganti password admin nanti (bukan pertama kali)**
→ Tidak perlu lewat D1 Console lagi — cukup login ke `/admin/pengaturan`
dan ganti dari situ (form-nya minta password lama untuk verifikasi).

**Konten yang diisi di admin tidak muncul di situs publik**
→ Coba hard refresh browser (Ctrl+Shift+R / Cmd+Shift+R). Semua konten
dibaca langsung dari database setiap kali halaman dibuka, jadi seharusnya
selalu up-to-date tanpa perlu deploy ulang.
