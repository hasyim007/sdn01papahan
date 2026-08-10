import { escapeHtml } from '../../lib/html.js';

// Sumber tunggal daftar menu admin — dipakai buat render sidebar sekaligus
// jadi acuan urutan/label di dashboard.
export const ADMIN_NAV_GROUPS = [
  {
    label: 'Utama',
    items: [{ href: '/admin', key: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' }],
  },
  {
    label: 'Konten Beranda',
    items: [
      { href: '/admin/profil', key: 'profil', label: 'Profil Sekolah', icon: 'building-2' },
      { href: '/admin/program', key: 'program', label: 'Program & Kurikulum', icon: 'book-open' },
      { href: '/admin/pengajar', key: 'pengajar', label: 'Tenaga Pendidik', icon: 'users' },
      { href: '/admin/prestasi', key: 'prestasi', label: 'Prestasi Siswa', icon: 'trophy' },
      { href: '/admin/ekskul', key: 'ekskul', label: 'Ekstrakurikuler', icon: 'star' },
      { href: '/admin/galeri', key: 'galeri', label: 'Galeri Kegiatan', icon: 'image' },
      { href: '/admin/testimoni', key: 'testimoni', label: 'Kata Wali Murid', icon: 'quote' },
      { href: '/admin/faq', key: 'faq', label: 'FAQ', icon: 'help-circle' },
      { href: '/admin/kontak', key: 'kontak', label: 'Kontak', icon: 'phone' },
    ],
  },
  {
    label: 'Halaman Lain',
    items: [
      { href: '/admin/berita', key: 'berita', label: 'Berita & Agenda', icon: 'newspaper' },
      { href: '/admin/halaman', key: 'halaman', label: 'Halaman Custom', icon: 'file-plus' },
    ],
  },
  {
    label: 'Sistem',
    items: [{ href: '/admin/pengaturan', key: 'pengaturan', label: 'Pengaturan', icon: 'settings' }],
  },
];

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
        .inst-card { background: #FFFFFF; border: 1px solid #F1F5F9; border-radius: 16px; box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05); }
        .admin-input { width: 100%; padding: 0.625rem 0.875rem; border-radius: 0.75rem; border: 1px solid #E2E8F0; font-size: 0.875rem; transition: border-color .15s, box-shadow .15s; background: #fff; }
        .admin-input:focus { outline: none; border-color: #2563EB; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
        .admin-label { display:block; font-size: 0.8rem; font-weight: 600; color:#334155; margin-bottom: 0.375rem; }
        .admin-btn-primary { display:inline-flex; align-items:center; gap:.5rem; padding: 0.625rem 1.25rem; background:#2563EB; color:#fff; border-radius: 0.75rem; font-weight:600; font-size:.875rem; transition: background .15s; }
        .admin-btn-primary:hover { background:#1D4ED8; }
        .admin-btn-secondary { display:inline-flex; align-items:center; gap:.5rem; padding: 0.625rem 1.25rem; background:#fff; border:1px solid #E2E8F0; color:#334155; border-radius: 0.75rem; font-weight:600; font-size:.875rem; }
        .admin-btn-danger { display:inline-flex; align-items:center; gap:.5rem; padding: 0.5rem 0.875rem; background:#FEF2F2; color:#DC2626; border-radius: 0.625rem; font-weight:600; font-size:.8rem; }
        .repeater-row { border: 1px solid #F1F5F9; border-radius: 0.875rem; padding: 1rem; background: #F8FAFC; }
        html { scroll-behavior: smooth; }
    </style>`;

function navIconOnly(item, activeKey) {
  const active = item.key === activeKey;
  return `<a href="${item.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${active ? 'bg-primary text-white shadow-soft' : 'text-slateMuted hover:bg-slate-100 hover:text-slateDark'}">
    <i data-lucide="${item.icon}" class="w-4 h-4 flex-shrink-0"></i>
    <span>${escapeHtml(item.label)}</span>
  </a>`;
}

function renderSidebar(activeKey, username) {
  const groups = ADMIN_NAV_GROUPS.map((g) => `
    <div class="mb-6">
      <p class="px-3 mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">${escapeHtml(g.label)}</p>
      <div class="space-y-1">${g.items.map((item) => navIconOnly(item, activeKey)).join('')}</div>
    </div>`).join('');

  return `
  <aside id="admin-sidebar" class="fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-borderLight transform -translate-x-full lg:translate-x-0 transition-transform duration-200 overflow-y-auto">
    <div class="h-20 flex items-center gap-3 px-5 border-b border-borderLight">
      <div class="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold shadow-soft">S1</div>
      <div>
        <p class="font-bold text-slateDark text-sm leading-tight">CMS Papahan</p>
        <p class="text-xs text-slateMuted">Panel Admin</p>
      </div>
    </div>
    <nav class="p-4">${groups}</nav>
    <div class="p-4 border-t border-borderLight mt-2">
      <div class="flex items-center gap-2 px-3 py-2 text-xs text-slateMuted mb-2">
        <i data-lucide="user-circle" class="w-4 h-4"></i> <span>${escapeHtml(username || '')}</span>
      </div>
      <form method="POST" action="/api/logout">
        <button type="submit" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
          <i data-lucide="log-out" class="w-4 h-4"></i> Keluar
        </button>
      </form>
      <a href="/" target="_blank" class="mt-1 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slateMuted hover:bg-slate-100 transition-colors">
        <i data-lucide="external-link" class="w-4 h-4"></i> Lihat Situs
      </a>
    </div>
  </aside>
  <div id="admin-sidebar-overlay" class="fixed inset-0 bg-slateDark/40 z-30 hidden lg:hidden"></div>`;
}

const ADMIN_SHARED_SCRIPT = `
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
    window.__toastTimer = setTimeout(function () { toast.classList.add('translate-y-20', 'opacity-0'); }, 3200);
}
(function () {
  var params = new URLSearchParams(window.location.search);
  if (params.get('saved') === '1') showToast('Perubahan berhasil disimpan.');
  if (params.get('error')) showToast(decodeURIComponent(params.get('error')), 'error');
})();
document.addEventListener('DOMContentLoaded', function () {
    reInitIcons();
    var btn = document.getElementById('admin-menu-btn');
    var sidebar = document.getElementById('admin-sidebar');
    var overlay = document.getElementById('admin-sidebar-overlay');
    function closeSidebar() { sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); }
    function openSidebar() { sidebar.classList.remove('-translate-x-full'); overlay.classList.remove('hidden'); }
    if (btn) btn.addEventListener('click', openSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);
});

// Repeater generik: dipakai halaman dengan daftar item (program, pengajar, dst).
// Setiap baris punya template <template data-repeater-template="NAME"> tersembunyi.
// PENTING: index diambil dari counter "data-next-index" yang SELALU naik, bukan dari
// jumlah baris yang sedang tampil (list.children.length) — kalau pakai children.length,
// menghapus baris tengah lalu menambah baris baru bisa menghasilkan index yang sama
// dengan baris lain yang masih ada, dan field keduanya saling menimpa saat disimpan.
function repeaterAdd(name) {
    var list = document.getElementById('repeater-' + name);
    var tpl = document.querySelector('template[data-repeater-template="' + name + '"]');
    if (!list || !tpl) return;
    var idx = parseInt(list.getAttribute('data-next-index'), 10);
    if (isNaN(idx)) idx = list.children.length;
    list.setAttribute('data-next-index', String(idx + 1));
    var html = tpl.innerHTML.replace(/__INDEX__/g, idx);
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    list.appendChild(wrap.firstElementChild);
    reInitIcons();
}
function repeaterRemove(btn) {
    var row = btn.closest('[data-repeater-row]');
    if (row) row.remove();
}
</script>`;

/**
 * adminLayout({ activeKey, title, username, bodyHtml, extraScript })
 * Bungkus konten halaman admin dengan sidebar + topbar mobile + script bersama.
 */
export function adminLayout({ activeKey, title, username, bodyHtml, extraScript }) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title || 'Admin')} — CMS Papahan</title>
    <meta name="robots" content="noindex, nofollow">
    ${HEAD_ASSETS}
</head>
<body class="antialiased">
${renderSidebar(activeKey, username)}
<div class="lg:pl-64 min-h-screen">
  <header class="h-20 flex items-center justify-between px-4 sm:px-6 border-b border-borderLight bg-white sticky top-0 z-20">
    <div class="flex items-center gap-3">
      <button id="admin-menu-btn" class="lg:hidden p-2 rounded-lg text-slateMuted hover:bg-slate-100">
        <i data-lucide="menu" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg sm:text-xl font-bold text-slateDark">${escapeHtml(title || '')}</h1>
    </div>
  </header>
  <main class="p-4 sm:p-6 max-w-5xl">
    ${bodyHtml}
  </main>
</div>
${ADMIN_SHARED_SCRIPT}
${extraScript || ''}
</body>
</html>`;
}

/** Halaman polos tanpa sidebar — dipakai untuk /masuk. */
export function bareLayout({ title, bodyHtml, extraScript }) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title || 'Masuk')} — CMS Papahan</title>
    <meta name="robots" content="noindex, nofollow">
    ${HEAD_ASSETS}
</head>
<body class="antialiased">
${bodyHtml}
<script src="https://unpkg.com/lucide@latest"></script>
<script>if (window.lucide) lucide.createIcons();</script>
${extraScript || ''}
</body>
</html>`;
}
