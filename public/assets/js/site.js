// =========================================================================
// site.js — dipakai oleh semua halaman publik STATIS (profil, program, guru,
// prestasi, galeri, kontak). Landing "/" dan "/berita*" dirender Worker,
// jadi tidak memakai file ini.
// =========================================================================

function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error('Gagal memuat data: ' + url);
    return res.json();
}

async function loadCommonData() {
    return fetchJson('/api/store-all');
}

function routeForKey(key) {
    const map = {
        sambutan: '/#sambutan', profil: '/profil', program: '/program', pengajar: '/guru',
        prestasi: '/prestasi', berita: '/berita', galeri: '/galeri', testimoni: '/#testimoni', faq: '/kontak',
    };
    return map[key] || ('/' + key);
}

function renderNavbar(store, activeKey) {
    const meta = store.meta || {};
    const pageOrder = (store.pageOrder || []).filter((p) => p.active && p.key !== 'beranda');
    const links = pageOrder.map((p) => {
        const href = p.key.startsWith('custom:') ? `/${p.slug || ''}` : routeForKey(p.key);
        const cls = p.key === activeKey ? 'text-primary font-semibold' : 'text-slateMuted hover:text-slateDark';
        return `<a href="${href}" class="px-3 py-2 rounded-lg text-sm font-medium ${cls} hover:bg-slate-100 transition">${escHtml(p.label)}</a>`;
    }).join('');

    document.getElementById('navbar-root').innerHTML = `
    <nav class="fixed w-full z-50 glass" id="navbar">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-20">
                <a href="/" class="flex-shrink-0 flex items-center gap-3">
                    <div class="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-soft">${escHtml(meta.logoText || 'S1')}</div>
                    <div><h1 class="font-bold text-slateDark text-lg leading-tight">${escHtml(meta.schoolName)}</h1><p class="text-xs text-slateMuted">${escHtml(meta.schoolLocation)}</p></div>
                </a>
                <div class="hidden lg:flex items-center space-x-1">${links}</div>
                <div class="flex items-center gap-2 sm:gap-3">
                    <a href="/kontak" class="hidden md:inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium rounded-xl text-white bg-primary hover:bg-primaryHover shadow-soft transition-colors">${escHtml(meta.navCtaText || 'Hubungi Kami')}</a>
                    <button class="lg:hidden p-2 rounded-lg text-slateMuted hover:bg-slate-100" id="mobile-menu-btn"><i data-lucide="menu" class="w-6 h-6"></i></button>
                </div>
            </div>
            <div class="lg:hidden hidden flex-col gap-1 pb-4" id="mobile-menu">${links}</div>
        </div>
    </nav>`;
    document.title = `${document.title}`;
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    if (btn) btn.addEventListener('click', () => menu.classList.toggle('hidden'));
    if (window.lucide) lucide.createIcons();
}

function renderFooter(store) {
    const meta = store.meta || {};
    const footerData = store.footer || {};
    document.getElementById('footer-root').innerHTML = `
    <footer class="bg-slateDark text-slate-300 pt-16 pb-8">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="grid md:grid-cols-4 gap-10 border-b border-white/10 pb-10">
                <div class="md:col-span-2">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl">${escHtml(meta.logoText || 'S1')}</div>
                        <h2 class="font-bold text-white text-lg">${escHtml(meta.schoolName)}</h2>
                    </div>
                    <p class="text-sm text-slate-400 max-w-sm">${escHtml(footerData.desc || '')}</p>
                </div>
                <div><h3 class="text-white font-semibold mb-4 text-sm">Navigasi</h3>
                    <ul class="space-y-2 text-sm">
                        <li><a href="/profil" class="hover:text-white">Profil Sekolah</a></li>
                        <li><a href="/program" class="hover:text-white">Program Unggulan</a></li>
                        <li><a href="/berita" class="hover:text-white">Berita</a></li>
                        <li><a href="/galeri" class="hover:text-white">Galeri</a></li>
                    </ul>
                </div>
                <div><h3 class="text-white font-semibold mb-4 text-sm">Ikuti Kami</h3>
                    <div class="flex gap-3">
                        <a href="${escHtml(footerData.socialFacebook || '#')}" class="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-primary transition"><i data-lucide="facebook" class="w-4 h-4"></i></a>
                        <a href="${escHtml(footerData.socialInstagram || '#')}" class="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-primary transition"><i data-lucide="instagram" class="w-4 h-4"></i></a>
                        <a href="${escHtml(footerData.socialYoutube || '#')}" class="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-primary transition"><i data-lucide="youtube" class="w-4 h-4"></i></a>
                    </div>
                </div>
            </div>
            <p class="text-center text-xs text-slate-500 pt-6">${escHtml(footerData.copyright || '')}</p>
        </div>
    </footer>`;
    if (window.lucide) lucide.createIcons();
}

/** Dipanggil di tiap halaman statis setelah DOM ready. */
async function initPublicPage(activeKey, onData) {
    try {
        const store = await loadCommonData();
        renderNavbar(store, activeKey);
        renderFooter(store);
        if (typeof onData === 'function') await onData(store);
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error(err);
    }
}
