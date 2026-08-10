/**
 * Util murni (tanpa DOM) yang dipakai di semua halaman SSR.
 * Sengaja disalin ulang dari escapeHtml() yang sudah ada di public/index.html
 * supaya perilakunya identik antara versi client (admin/CMS) dan versi server (halaman publik).
 */

export function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// "Jadwal Pengambilan Buku Paket!" -> "jadwal-pengambilan-buku-paket"
export function slugify(str) {
  return (
    String(str || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'artikel'
  );
}

// URL berita dibuat dari judul + id, mis: "jadwal-pengambilan-buku-b4".
// Bagian -id di akhir dijamin unik & stabil walau judul diedit admin nanti.
export function beritaSlug(b) {
  return `${slugify(b.title)}-${b.id}`;
}

// Cari artikel berdasarkan potongan slug URL — cocokkan dulu persis (judul+id),
// kalau tidak ketemu coba cocokkan id polos di akhir (untuk tautan lama / fallback).
export function findBeritaBySlug(beritaList, slugParam) {
  const list = Array.isArray(beritaList) ? beritaList : [];
  let found = list.find((b) => beritaSlug(b) === slugParam);
  if (found) return found;
  found = list.find((b) => b.id === slugParam);
  if (found) return found;
  const lastDash = slugParam.lastIndexOf('-');
  if (lastDash !== -1) {
    const idPart = slugParam.slice(lastDash + 1);
    found = list.find((b) => b.id === idPart);
  }
  return found || null;
}

// Isi berita disimpan sebagai teks dengan baris kosong sebagai pemisah paragraf —
// sama persis dengan logika renderBeritaDetail() versi client.
export function paragraphsHtml(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
    .join('');
}

// Potong teks utuh jadi ringkasan aman untuk meta description (tanpa motong di tengah kata).
export function truncateForMeta(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}
