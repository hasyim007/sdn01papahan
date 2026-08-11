# Panduan: 3 Halaman Terpisah + Keamanan Login Admin

## 1. Apa yang berubah, dan kenapa

**Sebelumnya:** satu file `index.html` (4356 baris) berisi landing page, halaman
login, DAN dashboard admin sekaligus — semuanya tercampur dalam satu
`<script>`. Login diverifikasi **di JavaScript browser**, dan seluruh isi
website (termasuk `admin.username` & `admin.password` dalam bentuk teks
biasa) tersimpan dalam satu objek `DB` yang sama.

**Masalah nyata yang ditemukan** (bukan cuma soal Ctrl+U):

| # | Masalah | Dampak |
|---|---|---|
| 1 | `DEFAULT_DB.admin = { username: 'admin', password: 'admin123' }` ikut terkirim lewat `GET /api/data` yang **publik tanpa login** | Siapa pun yang tahu URL API bisa membaca password admin langsung, tanpa Ctrl+U sama sekali |
| 2 | Login: `if (u === DB.admin.username && p === DB.admin.password)` — dicek di browser | Siapa pun bisa buka Console browser dan mengetik `sessionStorage.setItem('sdn01papahan_cms_session','1')` lalu `enterAdminMode()` untuk masuk **tanpa password** |
| 3 | Panel "Pengaturan Akun" pakai `<input type="text">` untuk password, terisi otomatis dengan password lama | Password gampang kelihatan disorot orang lain / screenshot |
| 4 | Penulisan data (`PUT /api/data`) hanya dijaga `X-Sync-Key` yang diketik manual & disimpan di `localStorage` | Bukan login sungguhan, gampang lupa/salah pakai, tidak per-orang |

**Fakta penting yang tidak bisa diubah oleh solusi apa pun:** kode HTML/CSS/JS
yang **benar-benar dikirim** ke sebuah browser akan **selalu** bisa dibaca
lewat Ctrl+U / View Source oleh browser itu. Ini sifat dasar web, bukan bug.
Yang bisa dan sudah kami lakukan:

- **Tidak ada rahasia apa pun di dalam kode** yang dikirim ke browser (tidak ada password, tidak ada kunci rahasia).
- **Setiap aksi yang mengubah data diverifikasi di server** (Worker), bukan di JavaScript klien — jadi menyalin kode tidak memberi kemampuan apa-apa tanpa sesi login yang sah.
- **Isi halaman admin sendiri tidak dikirim** ke browser yang belum login — bukan disembunyikan dengan CSS/JS, tapi server menolak mengirimkannya sama sekali (redirect ke halaman login).

## 2. Arsitektur baru

```
public/
  index.html   ← Landing page publik. Desain SAMA PERSIS dengan sebelumnya.
                 Hanya link "Masuk" yang diarahkan ke /login.html
                 (sebelumnya membuka modal login di halaman yang sama).
  login.html   ← Halaman login baru, mandiri & ringan. Mengirim
                 username+password ke POST /api/login. Tidak ada logika
                 admin apa pun di file ini — aman dilihat siapa saja.
  admin.html   ← Dashboard admin. Desain SAMA PERSIS dengan sebelumnya
                 (semua panel/menu/fitur tetap ada), kecuali panel
                 "Pengaturan Akun" yang saya rombak jadi form ganti
                 password yang aman (lihat bagian 4).

src/index.js   ← Cloudflare Worker: /api/login, /api/session, /api/logout,
                 /api/admin/change-password, GET/PUT /api/data, dan
                 GERBANG untuk admin.html (lihat bagian 3).

schema.sql     ← Tabel baru: admin_users (password di-hash), sessions
                 (sesi login). Kredensial TIDAK PERNAH tercampur ke
                 tabel site_data (yang isinya publik).

wrangler.toml  ← Ditambah run_worker_first = ["/admin.html", "/api/*"]
```

## 3. Cara admin.html benar-benar terlindungi

Cloudflare Workers Assets punya opsi `run_worker_first`. Untuk path yang
didaftarkan di situ, **request masuk ke Worker dulu**, baru Worker yang
memutuskan apakah file statisnya boleh dikirim.

Alurnya untuk `/admin.html`:

1. Browser minta `/admin.html`.
2. Worker cek cookie sesi (`admin_session`) ke tabel `sessions` di D1.
3. **Kalau tidak valid/tidak ada** → Worker balas `302 redirect` ke `/login.html`. **File admin.html tidak pernah dikirim.** Ctrl+U di titik ini hanya akan menampilkan halaman login, bukan dashboard.
4. **Kalau valid** → Worker memanggil `env.ASSETS.fetch(request)` untuk mengirim file admin.html yang sebenarnya.

JavaScript di dalam `admin.html` sendiri **juga** memanggil `GET /api/session`
sebagai lapisan kedua (defense in depth) sebelum menampilkan data — tapi
perlindungan utamanya ada di langkah 3 di atas, di level server.

## 4. Alur login & sesi (server-side, sungguhan)

- Password admin disimpan di tabel `admin_users` sebagai **hash PBKDF2-HMAC-SHA256** (100.000 iterasi + salt acak), bukan teks biasa.
- `POST /api/login` mencocokkan password yang dikirim dengan hash tersimpan **di server**. Kalau cocok, server membuat token sesi acak (32 byte), simpan di tabel `sessions`, kirim balik lewat cookie `HttpOnly; Secure; SameSite=Lax` — cookie ini **tidak bisa dibaca lewat JavaScript** (termasuk JavaScript yang disuntikkan lewat XSS), dan browser otomatis mengirimkannya di setiap request berikutnya.
- `PUT /api/data` dan `POST /api/admin/change-password` mewajibkan cookie sesi yang valid. Tidak ada lagi `X-Sync-Key` yang diketik manual.
- Ganti password sekarang wajib memasukkan password lama, dan password baru langsung di-hash di server — tidak pernah tersimpan atau ditampilkan sebagai teks biasa.
- Sesi otomatis kedaluwarsa setelah 12 jam (bisa Anda ubah di `SESSION_TTL_MS` pada `src/index.js`).

## 5. Langkah deploy

1. **Update database D1** — buka Cloudflare Dashboard → Workers & Pages → D1 → database `papahan_site_db` → tab **Console**, lalu jalankan isi `schema.sql` (kalau Console tidak menerima banyak statement sekaligus, jalankan satu-satu, urut dari atas ke bawah).
   - Ini akan membuat akun admin awal: **username `admin`, password `admin123`**.
2. **Isi `database_id`** di `wrangler.toml` (masih placeholder `PASTE_DATABASE_ID_DARI_DASHBOARD`) dan sesuaikan `ALLOWED_ORIGIN` dengan domain asli situs Anda.
3. **Deploy** lewat Cloudflare Dashboard seperti biasa (upload folder ini / hubungkan ke GitHub sesuai alur yang biasa Anda pakai).
4. **Login pertama kali** di `https://domain-anda/login.html` dengan `admin` / `admin123`.
5. **SEGERA ganti password** lewat menu *Pengaturan → Ganti Password* di dashboard. Password `admin123` hanya untuk sekali pakai saat setup awal — jangan dibiarkan aktif.

## 6. Hal yang sengaja TIDAK saya ubah (dan kenapa)

- **Desain visual** landing page dan dashboard: markup HTML & class Tailwind saya pindahkan apa adanya, tidak saya tata ulang atau restyle. Satu-satunya perubahan visual adalah panel **Pengaturan Akun**, karena bentuk lamanya (password `type="text"` yang tampil otomatis) itu sendiri adalah sumber masalah yang Anda khawatirkan — jadi ini saya ganti jadi form "Password Saat Ini" + "Password Baru" yang standar dan aman.
- **Komentar berita dari pengunjung publik**: di kode asli, komentar tersimpan lewat mekanisme sinkron yang sama dengan data admin. Karena `PUT /api/data` sekarang khusus admin yang login, komentar pengunjung untuk sementara **hanya tersimpan di perangkat pengunjung itu sendiri** (localStorage), sama seperti perilaku aslinya saat sinkron cloud belum aktif (`CLOUD_API_BASE` kosong). Kalau nanti komentar publik ingin tampil untuk semua pengunjung, itu butuh endpoint terpisah yang aman (misalnya `POST /api/comments` dengan rate-limit), bukan lewat jalur admin — beri tahu saya kalau ingin ini dikerjakan.

## 7. V3 — Perbaikan tambahan (rate-limit, penguncian akun, wajib ganti password, CSP, log)

Enam kelemahan yang ditemukan saat review V2 sudah diperbaiki di V3:

| # | Kelemahan V2 | Perbaikan di V3 |
|---|---|---|
| 1 | Tidak ada rate-limit di `/api/login` | Login gagal dilacak per-IP (tabel `login_attempts`). Kalau satu IP gagal login ≥ 20 kali dalam 10 menit (lintas username apa pun), permintaan langsung ditolak 429 tanpa cek password. |
| 2 | Password default `admin123` bisa lupa diganti | Kolom baru `force_password_change` (aktif otomatis untuk akun seed awal). Selama aktif, **server menolak** `PUT /api/data` dan endpoint kelola-admin lain dengan 403 — bukan cuma imbauan di dokumen. Dashboard juga otomatis mengunci navigasi ke menu "Pengaturan Akun" sampai password diganti. |
| 3 | Tidak ada penguncian akun | Satu username yang gagal login 5x berturut-turut dikunci 15 menit (tabel `login_lockouts`). *Catatan jujur: durasi dibuat pendek karena mekanisme ini secara teori bisa disalahgunakan orang lain untuk mengunci akun Anda sendiri dengan sengaja memasukkan password salah — proteksi utama tetap di rate-limit per-IP pada poin 1.* |
| 4 | Tidak ada CSP header | Header `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` sekarang ditambahkan ke setiap halaman HTML (publik & admin) lewat `withSecurityHeaders()` di `src/index.js`. Domain skrip dibatasi hanya ke yang memang dipakai (`cdn.tailwindcss.com`, `unpkg.com`) — skrip asing dari domain lain akan diblokir browser. *Catatan jujur: CSP ini masih mengizinkan `'unsafe-inline'` untuk script/style karena arsitektur situs menaruh logic langsung di tag `<script>` inline; menghapus `'unsafe-inline'` total butuh memindahkan semua JS ke file eksternal + CSP nonce, di luar cakupan perbaikan ini.* |
| 5 | `ALLOWED_ORIGIN`/`database_id` berisiko lupa diisi | Di paket ini keduanya sudah terisi nilai asli (bukan placeholder) — tetap **cek ulang sebelum deploy** kalau Anda mengganti domain di kemudian hari. |
| 6 | Tidak ada log/notifikasi percobaan login gagal | Setiap percobaan login (berhasil/gagal) dicatat dengan IP di tabel `login_attempts`. Menu baru **"Log Keamanan"** di sidebar admin menampilkan 50 percobaan terakhir. (Belum berupa notifikasi push/email real-time — itu butuh integrasi layanan pihak ketiga seperti webhook Telegram/email, beri tahu saya kalau ingin ditambahkan.) |

**Migrasi database dari V2 ke V3:** buka Cloudflare Dashboard → D1 → Console, jalankan ulang isi `schema.sql` **satu per satu dari atas ke bawah**. Statement `CREATE TABLE IF NOT EXISTS` aman dijalankan ulang. Untuk `ALTER TABLE admin_users ADD COLUMN force_password_change ...` di bagian migrasi: kalau muncul error *"duplicate column name"*, itu artinya sudah pernah dijalankan — abaikan saja, aman.

**Setelah migrasi:** akun admin lama (yang sudah pernah ganti password dari `admin123`) TIDAK akan otomatis diminta ganti password lagi (`force_password_change` default 0 untuk kolom yang baru ditambahkan). Hanya akun seed baru yang otomatis kena wajib-ganti-password. Kalau Anda ingin memaksa semua admin lama ganti password juga, jalankan `UPDATE admin_users SET force_password_change = 1;` (baris ini sudah disiapkan sebagai komentar di akhir `schema.sql`, tinggal hapus tanda komentarnya).

## 8. Rekomendasi lanjutan (opsional, tidak saya kerjakan otomatis)

- Rate-limit per-IP & penguncian akun di `/api/login` sudah aktif sejak V3 (lihat bagian 7). Kalau ingin lapisan lebih kuat lagi, **Cloudflare Turnstile** (CAPTCHA tanpa mengganggu pengguna asli) bisa ditambahkan di form login sebagai proteksi tambahan.
- Kalau nanti butuh lebih dari satu akun admin/guru, tabel `admin_users` sudah mendukungnya — tinggal tambah baris & buat menu kelola pengguna.
- Pertimbangkan mengaktifkan **Cloudflare Access** di depan `/admin.html` sebagai lapisan tambahan (opsional, karena proteksi `run_worker_first` di atas sudah cukup kuat untuk kebutuhan sekarang).
