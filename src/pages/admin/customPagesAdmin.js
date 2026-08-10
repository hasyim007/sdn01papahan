import { escapeHtml } from '../../lib/html.js';
import { customSectionSlug } from '../customSection.js';

const TYPE_LABELS = { text: 'Teks + Gambar', cards: 'Kartu Grid', services: 'Kartu Layanan (foto+link)', gallery: 'Galeri Foto', cta: 'Ajakan (CTA)' };

export function buildCustomPagesListBody(db) {
  const list = Array.isArray(db.customSections) ? db.customSections : [];
  const rows = list.length
    ? list.map((s) => `
      <tr class="border-b border-borderLight last:border-0">
        <td class="py-3 pr-4">
          <p class="font-semibold text-slateDark text-sm">${escapeHtml(s.title || s.menuLabel || '(tanpa judul)')}</p>
          <p class="text-xs text-slateMuted mt-0.5">/halaman/${escapeHtml(customSectionSlug(s))}</p>
        </td>
        <td class="py-3 pr-4 text-sm text-slateMuted whitespace-nowrap">${escapeHtml(TYPE_LABELS[s.type] || s.type || '-')}</td>
        <td class="py-3 pr-4 text-sm text-slateMuted whitespace-nowrap">${s.menuLabel ? 'Tampil di menu' : 'Tersembunyi'}</td>
        <td class="py-3 text-right whitespace-nowrap">
          <a href="/admin/halaman/${escapeHtml(s.id)}" class="admin-btn-secondary !py-1.5 !px-3 text-xs">Edit</a>
          <form method="POST" action="/admin/halaman/${escapeHtml(s.id)}/hapus" class="inline" onsubmit="return confirm('Hapus halaman ini?');">
            <button type="submit" class="admin-btn-danger !py-1.5 !px-3 ml-1">Hapus</button>
          </form>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="py-10 text-center text-sm text-slateMuted">Belum ada halaman custom.</td></tr>`;

  return `
  <div class="space-y-6">
    <div class="flex justify-end">
      <a href="/admin/halaman/baru" class="admin-btn-primary"><i data-lucide="plus" class="w-4 h-4"></i> Buat Halaman</a>
    </div>
    <div class="inst-card overflow-x-auto">
      <table class="w-full min-w-[520px]">
        <thead><tr class="border-b border-borderLight text-left text-xs font-bold text-slate-400 uppercase">
          <th class="py-3 pr-4">Judul</th><th class="py-3 pr-4">Tipe</th><th class="py-3 pr-4">Menu</th><th class="py-3 text-right">Aksi</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

function field(label, input, help) {
  return `<div><label class="admin-label">${escapeHtml(label)}</label>${input}${help ? `<p class="text-xs text-slateMuted mt-1">${escapeHtml(help)}</p>` : ''}</div>`;
}

function renderItemRow(it, idxToken) {
  const v = (x) => escapeHtml(it && it[x] != null ? it[x] : '');
  const features = it && Array.isArray(it.features) ? it.features.join('\n') : '';
  return `
  <div class="repeater-row" data-repeater-row>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      ${field('Judul item', `<input type="text" name="items[${idxToken}][title]" value="${v('title')}" class="admin-input">`)}
      ${field('Ikon (untuk tipe Kartu Grid, nama Lucide)', `<input type="text" name="items[${idxToken}][icon]" value="${v('icon')}" class="admin-input">`)}
      ${field('URL Gambar (Kartu Layanan / Galeri)', `<input type="text" name="items[${idxToken}][image]" value="${v('image')}" class="admin-input">`)}
      ${field('Warna (Kartu Layanan)', `<input type="text" name="items[${idxToken}][color]" value="${v('color')}" placeholder="emerald/orange/blue/indigo/purple/rose" class="admin-input">`)}
      ${field('Badge (Kartu Layanan)', `<input type="text" name="items[${idxToken}][badge]" value="${v('badge')}" class="admin-input">`)}
      ${field('Link (Kartu Layanan)', `<input type="text" name="items[${idxToken}][link]" value="${v('link')}" placeholder="https://..." class="admin-input">`)}
      ${field('Teks link (Kartu Layanan)', `<input type="text" name="items[${idxToken}][linkText]" value="${v('linkText')}" class="admin-input">`)}
      ${field('Judul daftar fitur (Kartu Layanan)', `<input type="text" name="items[${idxToken}][listHeading]" value="${v('listHeading')}" class="admin-input">`)}
      ${field('Keterangan foto (Galeri)', `<input type="text" name="items[${idxToken}][caption]" value="${v('caption')}" class="admin-input">`)}
    </div>
    <div class="mt-4">
      ${field('Deskripsi (Kartu Grid) / Daftar fitur, 1 baris per poin (Kartu Layanan)', `<textarea name="items[${idxToken}][desc]" rows="3" class="admin-input">${v('desc')}</textarea><textarea name="items[${idxToken}][features]" rows="3" class="admin-input mt-2" placeholder="Satu fitur per baris">${escapeHtml(features)}</textarea>`)}
    </div>
    <button type="button" onclick="repeaterRemove(this)" class="admin-btn-danger mt-3"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Hapus item</button>
  </div>`;
}

export function buildCustomPageFormBody(section, isNew) {
  const s = section || { type: 'text', bgStyle: 'white', imagePosition: 'right', columns: 3 };
  const v = (x) => escapeHtml(s[x] != null ? s[x] : '');
  const items = Array.isArray(s.items) ? s.items : [];
  const typeOptions = Object.keys(TYPE_LABELS)
    .map((t) => `<option value="${t}" ${s.type === t ? 'selected' : ''}>${TYPE_LABELS[t]}</option>`).join('');
  const bgOptions = ['white', 'gray', 'dark']
    .map((t) => `<option value="${t}" ${s.bgStyle === t ? 'selected' : ''}>${t === 'white' ? 'Putih' : t === 'gray' ? 'Abu-abu' : 'Gelap'}</option>`).join('');

  return `
  <form method="POST" action="${isNew ? '/admin/halaman/baru' : `/admin/halaman/${v('id')}`}" class="space-y-6">
    <div class="inst-card p-6 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        ${field('Tipe layout', `<select name="type" class="admin-input">${typeOptions}</select>`)}
        ${field('Label menu (kosongkan agar tidak tampil di navbar)', `<input type="text" name="menuLabel" value="${v('menuLabel')}" class="admin-input">`)}
      </div>
      ${field('Judul halaman', `<input type="text" name="title" value="${v('title')}" required class="admin-input">`)}
      ${field('Subjudul', `<textarea name="subtitle" rows="2" class="admin-input">${v('subtitle')}</textarea>`)}
      ${field('Label kecil (eyebrow)', `<input type="text" name="eyebrow" value="${v('eyebrow')}" class="admin-input">`)}
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        ${field('Warna latar', `<select name="bgStyle" class="admin-input">${bgOptions}</select>`)}
        ${field('Jumlah kolom (Kartu Grid/Layanan)', `<input type="number" name="columns" value="${v('columns') || 3}" min="2" max="4" class="admin-input">`)}
        ${field('Posisi gambar (tipe Teks)', `<select name="imagePosition" class="admin-input"><option value="right" ${s.imagePosition !== 'left' ? 'selected' : ''}>Kanan</option><option value="left" ${s.imagePosition === 'left' ? 'selected' : ''}>Kiri</option></select>`)}
      </div>
      ${field('URL Gambar utama (tipe Teks)', `<input type="text" name="image" value="${v('image')}" class="admin-input">`)}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        ${field('Teks tombol CTA (tipe Teks/CTA)', `<input type="text" name="ctaLabel" value="${v('ctaLabel')}" class="admin-input">`)}
        ${field('Link tombol CTA', `<input type="text" name="ctaLink" value="${v('ctaLink')}" class="admin-input">`)}
      </div>
    </div>

    <div class="inst-card p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="font-bold text-slateDark">Daftar Item</h3>
          <p class="text-xs text-slateMuted mt-1">Dipakai untuk tipe Kartu Grid, Kartu Layanan, dan Galeri. Isi field yang relevan sesuai tipe di atas, kosongkan sisanya.</p>
        </div>
        <button type="button" onclick="repeaterAdd('items')" class="admin-btn-secondary flex-shrink-0"><i data-lucide="plus" class="w-4 h-4"></i> Tambah</button>
      </div>
      <div id="repeater-items" data-next-index="${items.length}" class="space-y-3">${items.map((it, i) => renderItemRow(it, i)).join('')}</div>
      <template data-repeater-template="items">${renderItemRow(null, '__INDEX__')}</template>
    </div>

    <div class="flex justify-end gap-3">
      <a href="/admin/halaman" class="admin-btn-secondary">Batal</a>
      <button type="submit" class="admin-btn-primary"><i data-lucide="save" class="w-4 h-4"></i> Simpan</button>
    </div>
  </form>`;
}
