import { escapeHtml } from '../../lib/html.js';

function statCard(icon, label, value, href) {
  return `
  <a href="${href}" class="inst-card p-5 flex items-center gap-4 hover:border-primary/30 transition">
    <div class="w-12 h-12 rounded-xl bg-blue-50 text-primary flex items-center justify-center flex-shrink-0">
      <i data-lucide="${icon}" class="w-6 h-6"></i>
    </div>
    <div>
      <p class="text-2xl font-bold text-slateDark leading-none">${value}</p>
      <p class="text-xs text-slateMuted mt-1">${escapeHtml(label)}</p>
    </div>
  </a>`;
}

function shortcutLink(href, icon, label) {
  return `<a href="${href}" class="flex items-center gap-3 px-4 py-3 rounded-xl border border-borderLight hover:border-primary/30 hover:bg-blue-50/40 transition">
    <i data-lucide="${icon}" class="w-4 h-4 text-primary"></i>
    <span class="text-sm font-medium text-slateDark">${escapeHtml(label)}</span>
  </a>`;
}

export function buildDashboardBody(db, username) {
  const beritaCount = (db.berita || []).length;
  const customCount = (db.customSections || []).length;
  const guruCount = (db.guru || []).length;
  const ekskulCount = (db.ekskul || []).length;

  return `
  <div class="space-y-8">
    <div class="inst-card p-6 bg-gradient-to-br from-primary to-primaryHover text-white border-0">
      <p class="text-sm opacity-90">Selamat datang kembali,</p>
      <h2 class="text-2xl font-bold">${escapeHtml(username || 'Admin')}</h2>
      <p class="text-sm opacity-80 mt-2">Kelola konten situs ${escapeHtml(db.meta?.schoolName || 'SDN 01 Papahan')} dari sini.</p>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      ${statCard('newspaper', 'Berita & Agenda', beritaCount, '/admin/berita')}
      ${statCard('file-plus', 'Halaman Custom', customCount, '/admin/halaman')}
      ${statCard('users', 'Tenaga Pendidik', guruCount, '/admin/pengajar')}
      ${statCard('star', 'Ekstrakurikuler', ekskulCount, '/admin/ekskul')}
    </div>

    <div>
      <h3 class="text-sm font-bold text-slateDark uppercase tracking-wide mb-3">Akses Cepat</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${shortcutLink('/admin/berita/baru', 'plus-circle', 'Tulis Berita Baru')}
        ${shortcutLink('/admin/halaman/baru', 'file-plus-2', 'Buat Halaman Custom')}
        ${shortcutLink('/admin/profil', 'building-2', 'Edit Profil Sekolah')}
        ${shortcutLink('/admin/pengaturan', 'settings', 'Pengaturan Identitas & Password')}
      </div>
    </div>
  </div>`;
}
