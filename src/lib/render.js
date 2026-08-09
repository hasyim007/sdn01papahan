// =========================================================================
// Layout HTML untuk halaman yang dirender Worker (berita, custom pages) —
// nav & footer memakai markup dan class persis desain asli (lihat
// public/index.html untuk versi statisnya).
// =========================================================================

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function navHtml(meta, pageOrder, activeHref) {
  const logoHtml = (meta.logoImage && meta.logoImage.trim())
    ? `<img src="${escapeHtml(meta.logoImage)}" class="w-full h-full object-cover" alt="Logo">`
    : escapeHtml(meta.logoText || 'S1');
  const links = [
    ['/', 'Beranda'], ['/#sambutan', 'Sambutan'], ['/profil', 'Profil'],
    ['/program', 'Program'], ['/guru', 'Pengajar'], ['/berita', 'Informasi']
  ];
  const desktop = links.map(([href, label]) => {
    const active = href === activeHref;
    const cls = active
      ? 'px-3 py-2 rounded-lg text-sm font-medium text-primary bg-blue-50 transition'
      : 'px-3 py-2 rounded-lg text-sm font-medium text-slateMuted hover:text-slateDark hover:bg-slate-100 transition';
    return `<a href="${href}" class="${cls}">${label}</a>`;
  }).join('\n');

  return `
  <nav class="fixed w-full z-50 transition-all duration-300 glass" id="navbar">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-20">
        <a href="/" class="flex-shrink-0 flex items-center gap-3 cursor-pointer">
          <div class="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-soft overflow-hidden">${logoHtml}</div>
          <div>
            <h1 class="font-bold text-slateDark text-lg leading-tight">${escapeHtml(meta.schoolName)}</h1>
            <p class="text-xs text-slateMuted">${escapeHtml(meta.schoolLocation)}</p>
          </div>
        </a>
        <div class="hidden lg:flex items-center space-x-1">
          ${desktop}
          <div class="relative group">
            <button class="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-slateMuted hover:text-slateDark hover:bg-slate-100 transition">Lainnya <i data-lucide="chevron-down" class="w-4 h-4"></i></button>
            <div class="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-glass border border-borderLight opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right">
              <div class="py-2">
                <a href="/prestasi" class="block px-4 py-2 text-sm text-slateMuted hover:bg-slate-50 hover:text-primary">Prestasi</a>
                <a href="/prestasi#ekskul" class="block px-4 py-2 text-sm text-slateMuted hover:bg-slate-50 hover:text-primary">Ekstrakurikuler</a>
                <a href="/galeri" class="block px-4 py-2 text-sm text-slateMuted hover:bg-slate-50 hover:text-primary">Galeri</a>
                <a href="/galeri#testimoni" class="block px-4 py-2 text-sm text-slateMuted hover:bg-slate-50 hover:text-primary">Testimoni</a>
                <a href="/kontak" class="block px-4 py-2 text-sm text-slateMuted hover:bg-slate-50 hover:text-primary">FAQ</a>
              </div>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 sm:gap-3">
          <a href="/kontak" class="hidden md:inline-flex items-center justify-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-xl text-white bg-primary hover:bg-primaryHover shadow-soft transition-colors">${escapeHtml(meta.navCtaText || 'Hubungi Kami')}</a>
          <a href="/admin/login.html" title="Login Admin CMS" class="inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 border border-slate-200 text-sm font-medium rounded-xl text-slateDark bg-white hover:bg-slate-50 hover:border-primary/40 transition-colors">
            <i data-lucide="lock" class="w-4 h-4"></i><span class="hidden sm:inline">Login Admin</span>
          </a>
          <button class="lg:hidden p-2 rounded-lg text-slateMuted hover:bg-slate-100" id="mobile-menu-btn"><i data-lucide="menu" class="w-6 h-6"></i></button>
        </div>
      </div>
    </div>
    <div class="lg:hidden hidden bg-white border-t border-borderLight shadow-soft absolute w-full" id="mobile-menu">
      <div class="px-4 pt-2 pb-6 space-y-1">
        ${links.map(([href, label]) => `<a href="${href}" class="block px-3 py-3 rounded-lg text-base font-medium text-slateMuted hover:text-slateDark hover:bg-slate-50">${label}</a>`).join('\n        ')}
        <a href="/prestasi" class="block px-3 py-3 rounded-lg text-base font-medium text-slateMuted hover:text-slateDark hover:bg-slate-50">Prestasi</a>
        <a href="/galeri" class="block px-3 py-3 rounded-lg text-base font-medium text-slateMuted hover:text-slateDark hover:bg-slate-50">Galeri</a>
        <a href="/kontak" class="block px-3 py-3 rounded-lg text-base font-medium text-slateMuted hover:text-slateDark hover:bg-slate-50">FAQ</a>
      </div>
    </div>
  </nav>`;
}

export function footerHtml(footer, meta) {
  return `
  <footer class="bg-white border-t border-borderLight pt-16 pb-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
        <div class="md:col-span-2">
          <div class="flex items-center gap-2 mb-4">
            <div class="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-sm">${escapeHtml(meta.logoText || 'S1')}</div>
            <h2 class="font-bold text-slateDark text-lg">${escapeHtml(meta.schoolName)}</h2>
          </div>
          <p class="text-sm text-slateMuted max-w-sm mb-6">${escapeHtml(footer?.desc || '')}</p>
          <div class="flex space-x-4">
            <a href="${escapeHtml(footer?.socialFacebook || '#')}" class="text-slate-400 hover:text-primary transition-colors"><i data-lucide="facebook" class="w-5 h-5"></i></a>
            <a href="${escapeHtml(footer?.socialInstagram || '#')}" class="text-slate-400 hover:text-primary transition-colors"><i data-lucide="instagram" class="w-5 h-5"></i></a>
            <a href="${escapeHtml(footer?.socialYoutube || '#')}" class="text-slate-400 hover:text-primary transition-colors"><i data-lucide="youtube" class="w-5 h-5"></i></a>
          </div>
        </div>
        <div>
          <h3 class="font-bold text-slateDark mb-4">Tautan Cepat</h3>
          <ul class="space-y-2 text-sm">
            <li><a href="/profil" class="text-slateMuted hover:text-primary transition-colors">Profil Sekolah</a></li>
            <li><a href="/program" class="text-slateMuted hover:text-primary transition-colors">Program & Kurikulum</a></li>
            <li><a href="/berita" class="text-slateMuted hover:text-primary transition-colors">Berita Terkini</a></li>
            <li><a href="/kontak" class="text-slateMuted hover:text-primary transition-colors">PPDB 2026</a></li>
          </ul>
        </div>
        <div>
          <h3 class="font-bold text-slateDark mb-4">Akses Internal</h3>
          <ul class="space-y-2 text-sm">
            <li><a href="#" class="text-slateMuted hover:text-primary transition-colors">Portal E-Rapor</a></li>
            <li><a href="#" class="text-slateMuted hover:text-primary transition-colors">Perpustakaan Digital</a></li>
            <li><a href="/admin/login.html" class="text-slateMuted hover:text-primary transition-colors">Login Guru & Staf</a></li>
          </ul>
        </div>
      </div>
      <div class="border-t border-slate-100 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <p class="text-xs text-slate-500">${escapeHtml(footer?.copyright || '')}</p>
        <div class="flex gap-4 text-xs text-slate-500"><a href="#" class="hover:text-slateDark">Kebijakan Privasi</a><a href="#" class="hover:text-slateDark">Syarat Ketentuan</a></div>
      </div>
    </div>
  </footer>`;
}

// pageProps: { title, description, ogImage, ogType, canonicalPath, jsonLd, bodyHtml, navHtml, footerHtml, siteUrl }
export function pageLayout(p) {
  const canonical = `${p.siteUrl}${p.canonicalPath}`;
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(p.title)}</title>
<meta name="description" content="${escapeHtml(p.description || '')}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${p.ogType || 'website'}">
<meta property="og:title" content="${escapeHtml(p.title)}">
<meta property="og:description" content="${escapeHtml(p.description || '')}">
${p.ogImage ? `<meta property="og:image" content="${escapeHtml(p.ogImage)}">` : ''}
<meta property="og:url" content="${canonical}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/lucide@latest"></script>
<script>
  tailwind.config = { theme: { extend: {
    fontFamily: { sans: ['"Plus Jakarta Sans"', 'sans-serif'] },
    colors: { primary: '#2563EB', primaryHover: '#1D4ED8', slateDark: '#0F172A', slateMuted: '#64748B', surface: '#FFFFFF', borderLight: '#F1F5F9' },
    boxShadow: { 'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)', 'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.07)' }
  } } };
</script>
<link rel="stylesheet" href="/assets/site.css">
${p.jsonLd ? `<script type="application/ld+json">${JSON.stringify(p.jsonLd)}</script>` : ''}
</head>
<body class="antialiased overflow-x-hidden selection:bg-primary selection:text-white">
${p.navHtml}
<main class="pt-32 lg:pt-40">
${p.bodyHtml}
</main>
${p.footerHtml}
<script>
if (window.lucide) window.lucide.createIcons();
const mbtn = document.getElementById('mobile-menu-btn');
const mmenu = document.getElementById('mobile-menu');
if (mbtn && mmenu) mbtn.addEventListener('click', () => mmenu.classList.toggle('hidden'));
function toggleFaq(btn){ btn.nextElementSibling.classList.toggle('hidden'); }
</script>
</body>
</html>`;
}
