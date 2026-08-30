# Menu Admin Baru: Chatbot AI (Agustus 2026)

## Apa yang baru

Menu **"Chatbot AI"** ditambahkan di sidebar admin (`/admin`), di antara "Kontak & Footer"
dan "Pengaturan Akun". Dari sini admin bisa mengatur:

1. **Aktif/nonaktifkan chatbot** — kalau dinonaktifkan, tombol chat bulat di beranda
   publik hilang total (bukan cuma didisable).
2. **Nama chatbot** — tampil di kepala panel chat & kalimat sapaan pembuka.
3. **Sumber AI (provider)**:
   - **Cloudflare Workers AI** (default, bawaan, gratis, tidak perlu API key apa pun —
     ini yang dipakai sejak awal).
   - **Google Gemini** — opsional, pakai API key gratis milik admin sendiri dari
     [Google AI Studio](https://aistudio.google.com/apikey). Kunci disimpan di server,
     tidak pernah ditampilkan ulang ke browser setelah disimpan (hanya status
     "sudah tersimpan / belum").
4. **Instruksi/persona dasar tambahan (opsional)** — teks bebas dari admin yang
   disisipkan ke instruksi dasar chatbot (gaya bahasa, penekanan topik, dst).
   Aturan wajib bawaan (jawab hanya dari data sekolah, jangan mengarang, jangan
   bahas topik di luar sekolah) **tetap berlaku** apa pun isi instruksi tambahan ini.

## Kenapa chatbot sempat menampilkan "sedang gangguan"

Pesan itu berasal dari blok `catch` di `POST /api/chat` (`src/index.js`) — muncul
setiap kali pemanggilan model AI gagal (mis. binding `AI` di `wrangler.toml` belum
ter-deploy dengan benar, kuota Workers AI harian habis, atau error sementara dari
Cloudflare). Setelah update ini, kalau providernya "Cloudflare Workers AI" tapi
binding `AI` belum aktif, admin akan melihat **peringatan yang jelas** di menu
Chatbot AI (bukan cuma pesan generik ke pengunjung), dan bisa beralih ke provider
Google Gemini sebagai alternatif tanpa perlu menunggu binding tersebut diperbaiki.

## Wajib dilakukan setelah upload/deploy ulang

Tabel baru `chatbot_settings` **dibuat otomatis** oleh server saat pertama kali
dipakai (self-healing, sama seperti pola tabel `images` sebelumnya) — **tidak perlu**
menjalankan SQL manual tambahan di D1 console untuk situs yang sudah berjalan.

Kalau Anda membuat **database D1 baru dari nol**, jalankan `schema.sql` seperti
biasa — sudah termasuk `CREATE TABLE chatbot_settings` di dalamnya.

## Keamanan

- `gemini_api_key` disimpan di tabel `chatbot_settings`, **terpisah** dari
  `site_settings` — sengaja begitu supaya kuncinya tidak pernah ikut terbawa oleh
  `GET /api/data` (endpoint publik/tanpa-login yang dipakai beranda situs).
- Endpoint `GET/POST /api/admin/chatbot-settings` mewajibkan sesi login admin yang
  valid, sama seperti endpoint admin lain.
- Beranda publik hanya menerima subset aman (`enabled`, `botName`) lewat field
  `chatbotPublic` di `GET /api/data` — tidak pernah menerima API key atau instruksi
  kustom.
