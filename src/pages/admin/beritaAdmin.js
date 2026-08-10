import { escapeHtml, beritaSlug } from '../../lib/html.js';

export function buildBeritaListBody(db) {
  const list = Array.isArray(db.berita) ? db.berita : [];
  const rows = list.length
    ? list.map((b) => `
      <tr class="border-b border-borderLight last:border-0">
        <td class="py-3 pr-4">
          <p class="font-semibold text-slateDark text-sm">${escapeHtml(b.title || '(tanpa judul)')}</p>
          <p class="text-xs text-slateMuted mt-0.5">/berita/${escapeHtml(beritaSlug(b))}</p>
        </td>
        <td class="py-3 pr-4 text-sm text-slateMuted whitespace-nowrap">${escapeHtml(b.category || '-')}</td>
        <td class="py-3 pr-4 text-sm text-slateMuted whitespace-nowrap">${escapeHtml(b.date || '-')}</td>
        <td class="py-3 text-right whitespace-nowrap">
          <a href="/admin/berita/${escapeHtml(b.id)}" class="admin-btn-secondary !py-1.5 !px-3 text-xs">Edit</a>
          <form method="POST" action="/admin/berita/${escapeHtml(b.id)}/hapus" class="inline" onsubmit="return confirm('Hapus berita ini?');">
            <button type="submit" class="admin-btn-danger !py-1.5 !px-3 ml-1">Hapus</button>
          </form>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="py-10 text-center text-sm text-slateMuted">Belum ada berita. Klik "Tulis Berita" untuk mulai.</td></tr>`;

  return `
  <div class="space-y-6">
    <div class="flex justify-end">
      <a href="/admin/berita/baru" class="admin-btn-primary"><i data-lucide="plus" class="w-4 h-4"></i> Tulis Berita</a>
    </div>
    <div class="inst-card overflow-x-auto">
      <table class="w-full min-w-[520px]">
        <thead><tr class="border-b border-borderLight text-left text-xs font-bold text-slate-400 uppercase">
          <th class="py-3 pr-4">Judul</th><th class="py-3 pr-4">Kategori</th><th class="py-3 pr-4">Tanggal</th><th class="py-3 text-right">Aksi</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

function field(label, input) {
  return `<div><label class="admin-label">${escapeHtml(label)}</label>${input}</div>`;
}

export function buildBeritaFormBody(article, isNew) {
  const b = article || {};
  const v = (x) => escapeHtml(x || '');
  return `
  <form method="POST" action="${isNew ? '/admin/berita/baru' : `/admin/berita/${v(b.id)}`}" class="space-y-6">
    <div class="inst-card p-6 space-y-4">
      ${field('Judul', `<input type="text" name="title" value="${v(b.title)}" required class="admin-input">`)}
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        ${field('Kategori', `<input type="text" name="category" value="${v(b.category)}" class="admin-input">`)}
        ${field('Tanggal', `<input type="text" name="date" value="${v(b.date)}" placeholder="mis. 12 Agustus 2026" class="admin-input">`)}
        ${field('Penulis', `<input type="text" name="author" value="${v(b.author) || 'Admin'}" class="admin-input">`)}
      </div>
      ${field('URL Gambar sampul', `<input type="text" name="image" value="${v(b.image)}" placeholder="https://..." class="admin-input">`)}
      ${field('Ringkasan (excerpt)', `<textarea name="excerpt" rows="2" class="admin-input">${v(b.excerpt)}</textarea>`)}
      ${field('Isi lengkap', `<textarea name="content" rows="10" class="admin-input">${v(b.content)}</textarea>`)}
      <p class="text-xs text-slateMuted">Pisahkan paragraf dengan baris kosong.</p>
    </div>
    <div class="flex justify-end gap-3">
      <a href="/admin/berita" class="admin-btn-secondary">Batal</a>
      <button type="submit" class="admin-btn-primary"><i data-lucide="save" class="w-4 h-4"></i> Simpan</button>
    </div>
  </form>`;
}
