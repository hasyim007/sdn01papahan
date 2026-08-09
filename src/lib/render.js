// =========================================================================
// render.js — template string builder untuk halaman yang dirender Worker
// (landing "/", "/berita", "/berita/:slug", "/[slug-custom]").
// Desain tetap konsisten dengan halaman statis (lihat public/assets/css/style.css)
// =========================================================================

export function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

export function nl2p(text) {
    return String(text ?? '')
        .split(/\n{2,}/)
        .map((p) => `<p class="mb-4 leading-relaxed">${esc(p).replace(/\n/g, '<br>')}</p>`)
        .join('');
}

const HEAD_LIBS = `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <script>
        tailwind.config = {
            theme: { extend: {
                fontFamily: { sans: ['"Plus Jakarta Sans"', 'sans-serif'] },
                colors: { primary: '#2563EB', primaryHover: '#1D4ED8', slateDark: '#0F172A', slateMuted: '#64748B', surface: '#FFFFFF', borderLight: '#F1F5F9' },
                boxShadow: { soft: '0 4px 20px -2px rgba(0,0,0,0.05)', glass: '0 8px 32px 0 rgba(31,38,135,0.07)' }
            } }
        }
    </script>
    <link rel="stylesheet" href="/assets/css/style.css">`;

export function pageHead({ title, description, url, image, siteUrl, type = 'website', noindex = false, jsonLd = null }) {
    const ogImage = image || `${siteUrl}/assets/img/og-default.jpg`;
    return `<meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description || '')}">
    <link rel="canonical" href="${esc(url)}">
    ${noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow">'}
    <meta property="og:type" content="${type}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description || '')}">
    <meta property="og:url" content="${esc(url)}">
    <meta property="og:image" content="${esc(ogImage)}">
    <meta name="twitter:card" content="summary_large_image">
    ${HEAD_LIBS}
    ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}`;
}

export function navbar({ meta, pageOrder, activeKey }) {
    const items = (pageOrder || []).filter((p) => p.active && p.key !== 'beranda');
    const links = items.map((p) => {
        const href = p.key.startsWith('custom:') ? `/${p.slug || ''}` : `/${routeForKey(p.key)}`;
        const activeCls = p.key === activeKey ? 'text-primary font-semibold' : 'text-slateMuted hover:text-slateDark';
        return `<a href="${esc(href)}" class="px-3 py-2 rounded-lg text-sm font-medium ${activeCls} hover:bg-slate-100 transition">${esc(p.label)}</a>`;
    }).join('');

    return `<nav class="fixed w-full z-50 glass" id="navbar">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-20">
            <a href="/" class="flex-shrink-0 flex items-center gap-3">
                <div class="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-soft">${esc(meta.logoText || 'S1')}</div>
                <div>
                    <h1 class="font-bold text-slateDark text-lg leading-tight">${esc(meta.schoolName)}</h1>
                    <p class="text-xs text-slateMuted">${esc(meta.schoolLocation)}</p>
                </div>
            </a>
            <div class="hidden lg:flex items-center space-x-1">${links}</div>
            <div class="flex items-center gap-2 sm:gap-3">
                <a href="/kontak" class="hidden md:inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium rounded-xl text-white bg-primary hover:bg-primaryHover shadow-soft transition-colors">${esc(meta.navCtaText || 'Hubungi Kami')}</a>
                <button class="lg:hidden p-2 rounded-lg text-slateMuted hover:bg-slate-100" id="mobile-menu-btn"><i data-lucide="menu" class="w-6 h-6"></i></button>
            </div>
        </div>
        <div class="lg:hidden hidden flex-col gap-1 pb-4" id="mobile-menu">${links}</div>
    </div>
</nav>`;
}

function routeForKey(key) {
    const map = {
        sambutan: '#sambutan', profil: 'profil', program: 'program', pengajar: 'guru',
        prestasi: 'prestasi', berita: 'berita', galeri: 'galeri', testimoni: '#testimoni', faq: 'kontak',
    };
    return map[key] || key;
}

export function footer({ meta, footerData }) {
    return `<footer class="bg-slateDark text-slate-300 pt-16 pb-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid md:grid-cols-4 gap-10 border-b border-white/10 pb-10">
            <div class="md:col-span-2">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl">${esc(meta.logoText || 'S1')}</div>
                    <h2 class="font-bold text-white text-lg">${esc(meta.schoolName)}</h2>
                </div>
                <p class="text-sm text-slate-400 max-w-sm">${esc(footerData.desc || '')}</p>
            </div>
            <div>
                <h3 class="text-white font-semibold mb-4 text-sm">Navigasi</h3>
                <ul class="space-y-2 text-sm">
                    <li><a href="/profil" class="hover:text-white">Profil Sekolah</a></li>
                    <li><a href="/program" class="hover:text-white">Program Unggulan</a></li>
                    <li><a href="/berita" class="hover:text-white">Berita</a></li>
                    <li><a href="/galeri" class="hover:text-white">Galeri</a></li>
                </ul>
            </div>
            <div>
                <h3 class="text-white font-semibold mb-4 text-sm">Ikuti Kami</h3>
                <div class="flex gap-3">
                    <a href="${esc(footerData.socialFacebook || '#')}" class="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-primary transition"><i data-lucide="facebook" class="w-4 h-4"></i></a>
                    <a href="${esc(footerData.socialInstagram || '#')}" class="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-primary transition"><i data-lucide="instagram" class="w-4 h-4"></i></a>
                    <a href="${esc(footerData.socialYoutube || '#')}" class="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-primary transition"><i data-lucide="youtube" class="w-4 h-4"></i></a>
                </div>
            </div>
        </div>
        <p class="text-center text-xs text-slate-500 pt-6">${esc(footerData.copyright || '')}</p>
    </div>
</footer>
<script>if(window.lucide) lucide.createIcons();
const mmBtn=document.getElementById('mobile-menu-btn'), mm=document.getElementById('mobile-menu');
if(mmBtn) mmBtn.addEventListener('click',()=>mm.classList.toggle('hidden'));
</script>`;
}

/** Bungkus konten dengan <html> lengkap + navbar + footer. */
export function layout({ head, bodyContent, meta, pageOrder, activeKey, footerData }) {
    return `<!DOCTYPE html>
<html lang="id">
<head>
${head}
</head>
<body class="antialiased overflow-x-hidden selection:bg-primary selection:text-white bg-[#F8FAFC] text-[#0F172A]">
${navbar({ meta, pageOrder, activeKey })}
<main class="pt-20">
${bodyContent}
</main>
${footer({ meta, footerData })}
</body>
</html>`;
}

export function schoolJsonLd({ meta, kontak, siteUrl }) {
    return {
        '@context': 'https://schema.org',
        '@type': 'School',
        name: meta.schoolName,
        address: kontak.address,
        telephone: kontak.phone,
        email: kontak.email,
        url: siteUrl,
    };
}

export function articleJsonLd({ art, siteUrl }) {
    return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: art.title,
        description: art.metaDescription || art.excerpt,
        image: art.ogImage ? [art.ogImage] : undefined,
        datePublished: art.publishAt || art.createdAt,
        dateModified: art.updatedAt,
        author: { '@type': 'Person', name: art.author || 'Admin' },
        mainEntityOfPage: `${siteUrl}/berita/${art.slug}`,
    };
}
