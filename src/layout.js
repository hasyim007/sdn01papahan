import { escapeHtml } from './lib/html.js';
import { customSectionSlug } from './pages/customSection.js';

// Menu baku — hrefs menuju halaman sungguhan yang sudah di-port.
// "Sambutan" belum di-port di tahap ini, jadi tetap anchor ke beranda (masih ada di sana).
const MAIN_NAV = [
  { href: '/', key: 'beranda', label: 'Beranda' },
  { href: '/#sambutan', key: 'sambutan', label: 'Sambutan' },
  { href: '/profil', key: 'profil', label: 'Profil' },
  { href: '/program', key: 'program', label: 'Program' },
  { href: '/pengajar', key: 'pengajar', label: 'Pengajar' },
  { href: '/berita', key: 'berita', label: 'Informasi' },
];

const BASE_MORE_NAV = [
  { href: '/prestasi', key: 'prestasi', label: 'Prestasi' },
  { href: '/ekskul', key: 'ekskul', label: 'Ekstrakurikuler' },
  { href: '/galeri', key: 'galeri', label: 'Galeri' },
  { href: '/testimoni', key: 'testimoni', label: 'Testimoni' },
  { href: '/faq', key: 'faq', label: 'FAQ' },
];

// Halaman kustom bikinan admin (yang diberi "Label Menu") otomatis muncul di sini —
// tidak perlu sentuh kode tiap kali admin nambah halaman baru.
function customNavItems(db) {
  return (db.customSections || [])
    .filter((s) => s.menuLabel && s.menuLabel.trim())
    .map((s) => ({ href: `/halaman/${customSectionSlug(s)}`, key: `custom:${s.id}`, label: s.menuLabel }));
}

// DB.pageOrder mengatur aktif/nonaktif tiap section (menu admin "Atur Urutan Halaman") —
// item yang dinonaktifkan disembunyikan dari navbar, sama seperti applyPageOrder() versi lama.
function isNavItemActive(db, key) {
  const order = db.pageOrder;
  if (!Array.isArray(order)) return true;
  const entry = order.find((p) => p && p.key === key);
  return entry ? entry.active !== false : true;
}


const HEAD_ASSETS = `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: { sans: ['"Plus Jakarta Sans"', 'sans-serif'] },
                    colors: {
                        primary: '#2563EB', primaryHover: '#1D4ED8', slateDark: '#0F172A',
                        slateMuted: '#64748B', surface: '#FFFFFF', borderLight: '#F1F5F9',
                    },
                    boxShadow: {
                        soft: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
                        glass: '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
                    }
                }
            }
        }
    </script>
    <style>
        body { background-color: #F8FAFC; color: #0F172A; }
        .glass { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.5); }
        .glass-darker { background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid #F1F5F9; }
        .inst-card { background: #FFFFFF; border: 1px solid #F1F5F9; border-radius: 16px; box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05); transition: all 0.3s ease; }
        .inst-card:hover { box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08); transform: translateY(-2px); }
        html { scroll-behavior: smooth; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        p.text-slateMuted, p.text-slate-300 { text-align: justify; }
    </style>`;

function navLinkClass(item, activeKey, mobile) {
  const isActive = item.key === activeKey;
  if (mobile) {
    return isActive
      ? 'block px-3 py-3 rounded-lg text-base font-medium text-primary bg-blue-50'
      : 'block px-3 py-3 rounded-lg text-base font-medium text-slateMuted hover:text-slateDark hover:bg-slate-50';
  }
  return isActive
    ? 'px-3 py-2 rounded-lg text-sm font-medium text-slateDark hover:bg-slate-100 transition'
    : 'px-3 py-2 rounded-lg text-sm font-medium text-slateMuted hover:text-slateDark hover:bg-slate-100 transition';
}

function renderNavbar(db, activeKey) {
  const brandLogo = db.meta.logoImage
    ? `<img src="${escapeHtml(db.meta.logoImage)}" class="w-full h-full object-cover" alt="Logo">`
    : escapeHtml(db.meta.logoText || 'S1');

  const moreNav = [...BASE_MORE_NAV, ...customNavItems(db)].filter((item) => isNavItemActive(db, item.key));
  const mainNav = MAIN_NAV.filter((item) => isNavItemActive(db, item.key));
  const mobileNav = [...mainNav.slice(0, 5), ...moreNav, { href: '/kontak', key: 'kontak', label: 'Kontak' }];

  const desktopMain = mainNav.map(
    (item) => `<a href="${item.href}" class="${navLinkClass(item, activeKey, false)}">${escapeHtml(item.label)}</a>`
  ).join('');

  const desktopMore = moreNav.map(
    (item) => `<a href="${item.href}" class="block px-4 py-2 text-sm text-slateMuted hover:bg-slate-50 hover:text-primary">${escapeHtml(item.label)}</a>`
  ).join('');

  const mobile = mobileNav.map(
    (item) => `<a href="${item.href}" class="${navLinkClass(item, activeKey, true)}">${escapeHtml(item.label)}</a>`
  ).join('');

  return `
    <nav class="fixed w-full z-50 transition-all duration-300 glass" id="navbar">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-20">
                <a href="/" class="flex-shrink-0 flex items-center gap-3">
                    <div class="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-soft overflow-hidden">${brandLogo}</div>
                    <div>
                        <h1 class="font-bold text-slateDark text-lg leading-tight">${escapeHtml(db.meta.schoolName || 'SDN 01 Papahan')}</h1>
                        <p class="text-xs text-slateMuted">${escapeHtml(db.meta.schoolLocation || '')}</p>
                    </div>
                </a>

                <div class="hidden lg:flex items-center space-x-1">
                    ${desktopMain}
                    <div class="relative group">
                        <button class="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-slateMuted hover:text-slateDark hover:bg-slate-100 transition">
                            Lainnya <i data-lucide="chevron-down" class="w-4 h-4"></i>
                        </button>
                        <div class="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-glass border border-borderLight opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right">
                            <div class="py-2">${desktopMore}</div>
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-2 sm:gap-3">
                    <a href="/kontak" class="hidden md:inline-flex items-center justify-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-xl text-white bg-primary hover:bg-primaryHover shadow-soft transition-colors">
                        ${escapeHtml(db.meta.navCtaText || 'Hubungi Kami')}
                    </a>
                    <a href="/masuk" title="Masuk" class="inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 border border-slate-200 text-sm font-medium rounded-xl text-slateDark bg-white hover:bg-slate-50 hover:border-primary/40 transition-colors">
                        <i data-lucide="lock" class="w-4 h-4"></i>
                        <span class="hidden sm:inline">Masuk</span>
                    </a>
                    <button class="lg:hidden p-2 rounded-lg text-slateMuted hover:bg-slate-100" id="mobile-menu-btn">
                        <i data-lucide="menu" class="w-6 h-6"></i>
                    </button>
                </div>
            </div>
        </div>

        <div class="lg:hidden hidden bg-white border-t border-borderLight shadow-soft absolute w-full" id="mobile-menu">
            <div class="px-4 pt-2 pb-6 space-y-1">${mobile}</div>
        </div>
    </nav>`;
}

function renderFooter(db) {
  const f = db.footer || {};
  return `
    <footer class="bg-white border-t border-borderLight pt-16 pb-8">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
                <div class="md:col-span-2">
                    <div class="flex items-center gap-2 mb-4">
                        <div class="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-sm">${escapeHtml(db.meta.logoText || 'S1')}</div>
                        <h2 class="font-bold text-slateDark text-lg">${escapeHtml(db.meta.schoolName || 'SDN 01 Papahan')}</h2>
                    </div>
                    <p class="text-sm text-slateMuted max-w-sm mb-6">${escapeHtml(f.desc || '')}</p>
                    <div class="flex space-x-4">
                        <a href="${escapeHtml(f.socialFacebook || '#')}" class="text-slate-400 hover:text-primary transition-colors"><i data-lucide="facebook" class="w-5 h-5"></i></a>
                        <a href="${escapeHtml(f.socialInstagram || '#')}" class="text-slate-400 hover:text-primary transition-colors"><i data-lucide="instagram" class="w-5 h-5"></i></a>
                        <a href="${escapeHtml(f.socialYoutube || '#')}" class="text-slate-400 hover:text-primary transition-colors"><i data-lucide="youtube" class="w-5 h-5"></i></a>
                    </div>
                </div>
                <div>
                    <h3 class="font-bold text-slateDark mb-4">Tautan Cepat</h3>
                    <ul class="space-y-2 text-sm">
                        <li><a href="/profil" class="text-slateMuted hover:text-primary transition-colors">Profil Sekolah</a></li>
                        <li><a href="/program" class="text-slateMuted hover:text-primary transition-colors">Program & Kurikulum</a></li>
                        <li><a href="/berita" class="text-slateMuted hover:text-primary transition-colors">Berita Terkini</a></li>
                        <li><a href="/faq" class="text-slateMuted hover:text-primary transition-colors">PPDB 2026</a></li>
                    </ul>
                </div>
                <div>
                    <h3 class="font-bold text-slateDark mb-4">Akses Internal</h3>
                    <ul class="space-y-2 text-sm">
                        <li><a href="#" class="text-slateMuted hover:text-primary transition-colors">Portal E-Rapor</a></li>
                        <li><a href="#" class="text-slateMuted hover:text-primary transition-colors">Perpustakaan Digital</a></li>
                        <li><a href="/masuk" class="text-slateMuted hover:text-primary transition-colors">Masuk</a></li>
                    </ul>
                </div>
            </div>
            <div class="border-t border-slate-100 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                <p class="text-xs text-slate-500">${escapeHtml(f.copyright || '')}</p>
                <div class="flex gap-4 text-xs text-slate-500">
                    <a href="#" class="hover:text-slateDark">Kebijakan Privasi</a>
                    <a href="#" class="hover:text-slateDark">Syarat Ketentuan</a>
                </div>
            </div>
        </div>
    </footer>`;
}

// Script bersama — carousel/dots/FAQ/toast/menu-mobile. Aman dipasang di semua
// halaman baru: fungsi hanya dipanggil dari elemen yang memang ada di halaman itu.
const SHARED_SCRIPT = `
<div id="toast" class="fixed bottom-6 left-1/2 -translate-x-1/2 translate-y-20 opacity-0 transition-all duration-300 bg-slateDark text-white px-5 py-3 rounded-xl shadow-glass flex items-center gap-2 z-[200]">
    <i id="toast-icon" data-lucide="check-circle" class="w-5 h-5 text-emerald-400"></i>
    <span id="toast-text" class="text-sm font-medium"></span>
</div>
<script>
function reInitIcons() { if (window.lucide) lucide.createIcons(); }
function showToast(text, type) {
    var toast = document.getElementById('toast');
    document.getElementById('toast-text').textContent = text;
    var icon = document.getElementById('toast-icon');
    icon.setAttribute('data-lucide', type === 'error' ? 'x-circle' : 'check-circle');
    icon.className = type === 'error' ? 'w-5 h-5 text-red-400' : 'w-5 h-5 text-emerald-400';
    reInitIcons();
    toast.classList.remove('translate-y-20', 'opacity-0');
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(function () { toast.classList.add('translate-y-20', 'opacity-0'); }, 2800);
}
function toggleFaq(button) {
    var content = button.nextElementSibling;
    var icon = button.querySelector('i');
    content.classList.toggle('hidden');
    icon.style.transform = content.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
}
function makeCarousel(trackId, cardClass, dotClass, gap) {
    var track = document.getElementById(trackId);
    if (!track) return;
    var timeout = null;
    function scrollBy(dir) {
        var card = track.querySelector('.' + cardClass);
        if (!card) return;
        track.scrollBy({ left: dir * (card.getBoundingClientRect().width + gap), behavior: 'smooth' });
    }
    function scrollToIndex(i) {
        var card = track.querySelectorAll('.' + cardClass)[i];
        if (card) track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
    }
    function onScroll() {
        clearTimeout(timeout);
        timeout = setTimeout(function () {
            var cards = Array.from(track.querySelectorAll('.' + cardClass));
            if (!cards.length) return;
            var closest = 0, minDist = Infinity;
            cards.forEach(function (c, i) {
                var dist = Math.abs((c.offsetLeft - track.offsetLeft) - track.scrollLeft);
                if (dist < minDist) { minDist = dist; closest = i; }
            });
            document.querySelectorAll('.' + dotClass).forEach(function (d, i) {
                var active = i === closest;
                var inactiveBg = d.getAttribute('data-inactive-bg') || 'bg-slate-200';
                d.classList.toggle('bg-primary', active);
                d.classList.toggle(inactiveBg, !active);
                d.classList.toggle('w-6', active);
                d.classList.toggle('w-2', !active);
            });
        }, 100);
    }
    track.addEventListener('scroll', onScroll);
    window['scroll_' + trackId] = scrollBy;
    window['scrollTo_' + trackId] = scrollToIndex;
}
document.addEventListener('DOMContentLoaded', function () {
    reInitIcons();
    var mobileBtn = document.getElementById('mobile-menu-btn');
    var mobileMenu = document.getElementById('mobile-menu');
    if (mobileBtn && mobileMenu) {
        mobileBtn.addEventListener('click', function () { mobileMenu.classList.toggle('hidden'); });
        document.querySelectorAll('#mobile-menu a').forEach(function (link) {
            link.addEventListener('click', function () { mobileMenu.classList.add('hidden'); });
        });
    }
    makeCarousel('guru-track', 'guru-card', 'guru-dot', 24);
    makeCarousel('prestasi-track', 'prestasi-card', 'prestasi-dot', 20);
    makeCarousel('galeri-scroll', 'galeri-card', 'galeri-dot', 16);
    makeCarousel('testimoni-track', 'testimoni-card', 'testimoni-dot', 24);
});
</script>`;

/**
 * layout({ db, activeKey, title, description, canonicalPath, ogImage, bodyHtml, extraScript })
 * Bungkus satu section/halaman jadi dokumen HTML lengkap: head + navbar + <main> + footer + script.
 */
export function layout({ db, activeKey, title, description, canonicalPath, ogImage, bodyHtml, extraScript }) {
  const siteUrl = 'https://sdn01papahan.sch.id'; // sesuaikan kalau domain berbeda
  const pageTitle = title || db.meta.pageTitle || 'SDN 01 Papahan';
  const desc = description || db.footer?.desc || '';
  const canonical = siteUrl + (canonicalPath || '/');

  return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(desc)}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(pageTitle)}">
    <meta property="og:description" content="${escapeHtml(desc)}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : ''}
    <meta name="twitter:card" content="summary_large_image">
    ${HEAD_ASSETS}
</head>
<body class="antialiased overflow-x-hidden selection:bg-primary selection:text-white">
${renderNavbar(db, activeKey)}
<main class="pt-20">
${bodyHtml}
</main>
${renderFooter(db)}
${SHARED_SCRIPT}
${extraScript || ''}
</body>
</html>`;
}
