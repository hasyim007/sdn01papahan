# Ringkasan Perbaikan (jangan lupa baca ini sebelum deploy)

## Apa yang sebenarnya terjadi (akar masalahnya)

Foto yang diunggah lewat "Klik untuk unggah foto dari perangkat" disimpan sebagai
teks base64 langsung menyatu dalam SATU baris database (D1). Cloudflare D1 punya
batas **keras 2MB per baris** — tapi kode lama baru menolak di 20MB, jadi begitu
foto-foto menumpuk sampai lewat ~2MB, penyimpanan ke server **gagal diam-diam**.

Ditambah ada bug di `saveDB()`: kalau localStorage (penyimpanan lokal browser)
penuh duluan — yang gampang terjadi karena base64 foto besar — fungsi langsung
berhenti dan **tidak pernah mengirim data ke server sama sekali**. Ini penyebab
utama kenapa perubahan di admin tidak muncul di halaman publik, dan kenapa
terasa harus "sinkron manual" padahal kodenya sebenarnya sudah otomatis.

## Perbaikan yang sudah dilakukan

### 1. Upload foto pakai link Google Drive ✅
Semua kolom foto di dashboard admin (Hero/Beranda, Sambutan Kepala Sekolah, Logo,
Halaman Kustom, Galeri, Prestasi, Testimoni, Berita, dll — total 7 titik) sekarang
otomatis mengenali & mengubah link Google Drive jadi link gambar langsung.

Cara pakai di Google Drive:
1. Klik kanan file foto di Drive → **Bagikan** (Share)
2. Ubah akses jadi **"Siapa saja yang memiliki link"** (Anyone with the link) → Pembaca/Viewer
3. Salin link-nya, tempel di kolom "atau tempel URL gambar / link Google Drive"
   di dashboard admin — otomatis berubah jadi link yang bisa tampil.

Keuntungan besar: foto lewat link Drive **tidak menambah ukuran data situs sama
sekali** (yang tersimpan cuma teksnya, bukan isi gambarnya) — jadi tidak akan
pernah kena masalah "data terlalu besar" lagi.

### 2. Perubahan admin otomatis muncul di publik ✅
- Bug `saveDB()` yang menghentikan pengiriman ke server saat localStorage penuh
  sudah diperbaiki — sekarang tetap lanjut mengirim ke server apa pun kondisi
  penyimpanan lokal.
- Ditambahkan `Cache-Control: no-store` di endpoint `/api/data` supaya tidak ada
  versi data basi yang nyangkut di cache browser/edge.
- Endpoint simpan (`PUT /api/data`) sekarang menangkap error dari database dan
  memberi pesan yang jelas di dashboard kalau memang gagal — bukan gagal diam-diam.

### 3. Sudah otomatis, tanpa sinkron manual ✅
Sinkronisasi **sudah otomatis** sejak awal (setiap klik "Simpan" di form manapun
otomatis mengirim ke server ~1.5 detik kemudian) — masalahnya bukan di alur
otomatisnya, tapi di dua bug di atas yang bikin proses otomatis itu gagal diam-diam.
Sekarang keduanya sudah diperbaiki. Tombol "Sinkron Sekarang" / "Ambil Data
Terbaru" tetap ada, tapi sifatnya cadangan saja (misal kalau koneksi sempat putus),
bukan langkah wajib.

### 4. Indikator ukuran data (baru)
Di menu **Pengaturan Akun**, sekarang ada penunjuk ukuran data situs saat ini
dibanding batas server (1,8MB), lengkap dengan peringatan kalau sudah mendekati
batas — supaya Bapak tahu SEBELUM simpan gagal, bukan sesudahnya.

## Yang perlu Bapak lakukan setelah deploy
- Untuk foto-foto yang SUDAH terlanjur diunggah sebagai file (bukan link), tidak
  perlu diubah kalau ukurannya masih wajar — cek saja indikator ukuran data di
  Pengaturan Akun. Kalau sudah kuning/merah, ganti foto-foto besar (terutama di
  Galeri/Hero) dengan link Google Drive.
- Tidak ada perubahan skema database — tidak perlu jalankan ulang `schema.sql`.
- Deploy seperti biasa lewat GitHub → Cloudflare Pages/Workers (push ke repo,
  Cloudflare otomatis build & deploy).
