# Perbaikan Performa (Agustus 2026)

Perubahan ini dibuat merespons hasil PageSpeed Insights (Performance 62/desktop, error di mobile).

## Apa yang diubah

1. **Tailwind CSS: dari CDN runtime ke build production statis**
   - Sebelumnya: `<script src="https://cdn.tailwindcss.com">` — meng-compile ulang seluruh CSS di browser setiap kali halaman dibuka. Ini penyebab utama skor performa rendah dan kemungkinan penyebab error/timeout di test mobile.
   - Sekarang: CSS di-build sekali secara lokal menjadi `public/tailwind.css` (~38KB, minified) dan di-load lewat `<link rel="stylesheet">` biasa di `index.html`, `admin.html`, `login.html`.
   - Tidak perlu setup baru di Cloudflare — `public/tailwind.css` otomatis ke-serve sebagai static asset (lihat `[assets] directory = "./public"` di `wrangler.toml`).

2. **Lucide Icons: ditambah `defer`**
   - Script `unpkg.com/lucide` sekarang tidak lagi render-blocking.
   - Semua pemanggilan `lucide.createIcons()` sudah dipastikan jalan setelah `DOMContentLoaded` / dijaga dengan `if (window.lucide)`, jadi ikon tetap muncul normal.

3. **`loading="lazy"` pada gambar di bawah fold**
   - Diterapkan ke gambar galeri, prestasi, berita, testimoni, foto guru (carousel), dan cover gambar detail berita.
   - Foto sambutan kepala sekolah (dekat atas halaman) sengaja TIDAK di-lazy supaya tidak menunda LCP.

4. **CSP di `src/index.js` dirapikan**
   - `cdn.tailwindcss.com` dihapus dari `script-src`/`style-src` karena sudah tidak dipakai lagi.

## Cara rebuild CSS di kemudian hari

Kalau ada penambahan class Tailwind baru (mis. lewat class dinamis di JS), jalankan ulang build:

```bash
npm install
npm run build:css
```

Ini akan menulis ulang `public/tailwind.css`. Commit file hasil build ini juga ke repo/zip deploy — jangan andalkan CDN lagi di production.
