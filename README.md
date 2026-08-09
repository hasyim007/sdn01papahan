# SDN 01 Papahan — MPA (Cloudflare Workers + D1)

Migrasi dari SPA (`localStorage`) ke arsitektur MPA statis + Worker dinamis,
sesuai `PROMPT-MIGRASI-MPA.md`.

## Struktur Project

```
sdn01-papahan/
├── wrangler.toml           # Konfigurasi Worker, Static Assets, D1 binding
├── schema.sql               # Skema database D1 + seed data awal
├── package.json
├── src/
│   ├── index.js              # Entry point Worker: routing, API, SSR
│   └── lib/
│       ├── auth.js           # Hash password (PBKDF2) + session cookie
│       ├── db.js              # Helper query D1
│       └── render.js          # Template HTML (navbar/footer/layout/SEO)
├── public/                   # Static Assets (disajikan Worker)
│   ├── profil.html, program.html, guru.html, prestasi.html,
│   │   galeri.html, kontak.html   → halaman publik statis (CSR fetch ke /api)
│   ├── robots.txt
│   ├── assets/{css,js}/            → CSS & JS bersama halaman publik
│   └── admin/                      → panel admin, 1 file per halaman
│       ├── login.html, dashboard.html, hero.html, sambutan.html,
│       │   profil.html, program.html, guru.html, prestasi.html,
│       │   berita.html, galeri.html, testimoni.html, faq.html,
│       │   kontak-footer.html, custom-sections.html, page-order.html,
│       │   pengaturan.html
│       └── assets/                 → CSS & JS bersama panel admin
├── scripts/
│   ├── migrate-from-json.js   # Migrasi data lama (localStorage) → D1
│   └── set-admin-password.js  # Set password admin untuk instalasi baru
└── docs/
    └── PANDUAN-DEPLOY-CLOUDFLARE.md
```

## Yang dirender Worker (SSR, demi SEO)

- `/` — landing page (ringkasan semua section + cuplikan berita terbaru)
- `/berita` — daftar berita (pagination)
- `/berita/:slug` — detail artikel (meta tags, Open Graph, JSON-LD `Article`)
- `/[slug-custom]` — halaman kustom dari admin
- `/sitemap.xml` — dibangun on-the-fly dari D1

## Yang berupa file statis (client-side fetch ke `/api/*`)

- `/profil`, `/program`, `/guru`, `/prestasi`, `/galeri`, `/kontak`
- Seluruh `/admin/*`

## Menjalankan secara lokal

```bash
npm install
npx wrangler d1 execute sdn01-papahan-db --local --file=./schema.sql
node scripts/set-admin-password.js admin admin123
npx wrangler d1 execute sdn01-papahan-db --local --file=./scripts/admin-password.sql
npx wrangler dev
```

Buka `http://localhost:8787`, admin di `http://localhost:8787/admin/login`.

Untuk deploy production, ikuti `docs/PANDUAN-DEPLOY-CLOUDFLARE.md`.

## Catatan desain/keputusan penting

- **Tanpa R2** — semua gambar disimpan base64 (dikompres di browser lewat
  `resizeImageFile()`, lihat `public/admin/assets/admin.js`) langsung di D1.
- **Password di-hash** (PBKDF2-SHA256, 100k iterasi) — lihat `src/lib/auth.js`.
- **Auth server-side** via session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`),
  divalidasi di setiap endpoint tulis `/api/*` (lihat `requireAuth()`).
- **`pageOrder` halaman kustom tidak reset** — logika sinkronisasi ada di
  `public/admin/page-order.html` (`syncCustomPagesIntoOrder()`): entry lama
  dipertahankan urutannya, hanya entry basi yang dihapus & entry baru yang
  ditambahkan di akhir.
- **`/admin/*` diblokir dari indexing**: `X-Robots-Tag: noindex` (di Worker,
  lihat `src/index.js`) + `<meta name="robots" content="noindex">` di tiap
  halaman admin + `Disallow: /admin/` di `robots.txt`.
