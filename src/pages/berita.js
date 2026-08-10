import { escapeHtml, beritaSlug, paragraphsHtml, truncateForMeta } from '../lib/html.js';

const INDO_MONTHS = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];

function parseBeritaMonthYear(dateStr) {
  const parts = String(dateStr || '').trim().split(/\s+/);
  if (parts.length < 2) return null;
  const monthName = parts[parts.length - 2];
  const year = parts[parts.length - 1];
  const monthIdx = INDO_MONTHS.indexOf(monthName.toLowerCase());
  if (monthIdx === -1 || !/^\d{4}$/.test(year)) return null;
  return { label: monthName + ' ' + year, monthIdx, year: parseInt(year, 10) };
}

// ================= /berita (daftar) =================
export function buildBeritaListBody(db) {
  const bh = db.beritaHeader || {};
  const cards = (db.berita || []).map((b) => `
        <article class="inst-card overflow-hidden group">
            <a href="/berita/${escapeHtml(beritaSlug(b))}" class="block">
                <div class="h-44 relative bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center overflow-hidden">
                    <span class="text-white/10 font-extrabold text-6xl select-none tracking-tight">Berita</span>
                    <span class="absolute top-4 left-4 px-3 py-1 rounded-full bg-indigo-500/90 text-white text-xs font-semibold">${escapeHtml(b.category || '')}</span>
                </div>
                <div class="p-5">
                    <div class="flex items-center gap-4 text-xs text-slateMuted mb-3">
                        <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> ${escapeHtml(b.date || '')}</span>
                        <span class="flex items-center gap-1"><i data-lucide="user" class="w-3.5 h-3.5"></i> ${escapeHtml(b.author || 'Admin')}</span>
                    </div>
                    <h3 class="font-bold text-slateDark mb-2 group-hover:text-primary transition-colors">${escapeHtml(b.title || '')}</h3>
                    <p class="text-sm text-slateMuted mb-4 line-clamp-2">${escapeHtml(b.excerpt || '')}</p>
                    <span class="text-sm font-semibold text-primary inline-flex items-center gap-1 group-hover:underline">Baca Selengkapnya <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i></span>
                </div>
            </a>
        </article>`).join('');

  const agenda = (db.agenda || []).map((a) => `
        <div class="inst-card p-4 flex gap-4 items-start">
            <div class="w-14 h-14 shrink-0 bg-blue-50 rounded-xl flex flex-col items-center justify-center text-primary">
                <span class="text-xs font-semibold uppercase">${escapeHtml(a.month || '')}</span>
                <span class="text-lg font-bold leading-none mt-1">${escapeHtml(a.day || '')}</span>
            </div>
            <div>
                <h4 class="font-bold text-slateDark text-sm">${escapeHtml(a.title || '')}</h4>
                <p class="text-xs text-slateMuted mt-1"><i data-lucide="clock" class="w-3 h-3 inline"></i> ${escapeHtml(a.time || '')}</p>
                <p class="text-xs text-slateMuted"><i data-lucide="map-pin" class="w-3 h-3 inline"></i> ${escapeHtml(a.location || '')}</p>
            </div>
        </div>`).join('');

  return `
    <section class="py-16 bg-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center max-w-2xl mx-auto mb-14">
                <span class="inline-block px-4 py-1.5 rounded-full bg-indigo-50 text-indigo-500 text-xs font-bold tracking-wide mb-4">${escapeHtml(bh.eyebrow || 'BERITA & ARTIKEL')}</span>
                <h2 class="text-3xl sm:text-4xl font-extrabold leading-snug mb-4">
                    <span class="text-slateDark">${escapeHtml(bh.titlePrefix || 'Berita & Artikel')}</span> <span class="text-indigo-600">${escapeHtml(bh.titleHighlight || '')}</span>
                </h2>
                <p class="text-slateMuted">${escapeHtml(bh.subtitle || '')}</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">${cards || '<p class="text-slateMuted col-span-2 text-center">Belum ada berita.</p>'}</div>
            ${agenda ? `
            <div class="mt-16 pt-16 border-t border-borderLight">
                <h3 class="text-2xl font-bold text-slateDark mb-8 text-center">${escapeHtml((db.agendaHeader && db.agendaHeader.title) || 'Agenda Mendatang')}</h3>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">${agenda}</div>
            </div>` : ''}
        </div>
    </section>`;
}

// ================= /berita/:slug (detail) =================
export function buildBeritaDetailBody(db, article) {
  const berita = db.berita || [];
  const idx = berita.findIndex((x) => x.id === article.id);
  const prev = idx > 0 ? berita[idx - 1] : null;
  const next = idx >= 0 && idx < berita.length - 1 ? berita[idx + 1] : null;

  const comments = (db.beritaComments && db.beritaComments[article.id]) || [];
  const commentsHtml = comments.length
    ? comments.map((c) => `
        <div class="flex gap-3">
            <div class="w-10 h-10 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">${escapeHtml((c.name || '?').trim().charAt(0).toUpperCase())}</div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <p class="font-semibold text-slateDark text-sm">${escapeHtml(c.name || '')}</p>
                    <span class="text-xs text-slateMuted">${escapeHtml(c.date || '')}</span>
                </div>
                <p class="text-sm text-slateMuted mt-1">${escapeHtml(c.message || '')}</p>
            </div>
        </div>`).join('')
    : '<p class="text-sm text-slateMuted">Belum ada komentar. Jadilah yang pertama berkomentar.</p>';

  const prevNextHtml = `
        ${prev ? `
        <a href="/berita/${escapeHtml(beritaSlug(prev))}" class="inst-card p-4 text-left flex items-center gap-3 hover:border-primary/30">
            <i data-lucide="arrow-left" class="w-4 h-4 text-primary shrink-0"></i>
            <div class="min-w-0"><p class="text-xs text-slateMuted">Berita Sebelumnya</p><p class="text-sm font-semibold text-slateDark truncate">${escapeHtml(prev.title)}</p></div>
        </a>` : '<div></div>'}
        ${next ? `
        <a href="/berita/${escapeHtml(beritaSlug(next))}" class="inst-card p-4 text-left flex items-center gap-3 justify-end hover:border-primary/30">
            <div class="min-w-0 text-right"><p class="text-xs text-slateMuted">Berita Selanjutnya</p><p class="text-sm font-semibold text-slateDark truncate">${escapeHtml(next.title)}</p></div>
            <i data-lucide="arrow-right" class="w-4 h-4 text-primary shrink-0"></i>
        </a>` : '<div></div>'}`;

  // Sidebar: berita terbaru, arsip per bulan, tags, sosial
  const recent = berita.slice(0, 3).map((b) => `
        <a href="/berita/${escapeHtml(beritaSlug(b))}" class="w-full flex items-start gap-3 text-left group">
            <div class="w-10 h-10 shrink-0 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm">N</div>
            <div class="min-w-0"><p class="text-sm font-semibold text-slateDark leading-snug line-clamp-2 group-hover:text-primary transition-colors">${escapeHtml(b.title)}</p><p class="text-xs text-slateMuted mt-0.5">${escapeHtml(b.date || '')}</p></div>
        </a>`).join('');

  const archiveMap = {};
  berita.forEach((b) => {
    const my = parseBeritaMonthYear(b.date);
    if (!my) return;
    const key = my.year + '-' + my.monthIdx;
    if (!archiveMap[key]) archiveMap[key] = { label: my.label, monthIdx: my.monthIdx, year: my.year, count: 0 };
    archiveMap[key].count++;
  });
  const archiveEntries = Object.values(archiveMap).sort((a, b) => b.year - a.year || b.monthIdx - a.monthIdx);
  const archiveHtml = archiveEntries.length
    ? archiveEntries.map((a) => `<div class="w-full flex items-center justify-between px-2 py-2 rounded-lg text-sm text-slateMuted"><span>${escapeHtml(a.label)}</span><span class="text-xs bg-slate-100 rounded-full px-2 py-0.5">${a.count}</span></div>`).join('')
    : '<p class="text-xs text-slateMuted">Belum ada arsip.</p>';

  const tagSet = new Set();
  berita.forEach((b) => String(b.tags || '').split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => tagSet.add(t)));
  const tagsHtml = tagSet.size
    ? Array.from(tagSet).map((t) => `<span class="px-3 py-1.5 rounded-full bg-slate-100 text-slateMuted text-xs font-medium">${escapeHtml(t)}</span>`).join('')
    : '<p class="text-xs text-slateMuted">Belum ada tag.</p>';

  const f = db.footer || {};

  return `
    <div class="min-h-screen bg-slate-50 -mt-20 pt-20">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div class="flex items-center gap-2 text-sm text-slateMuted mb-6 flex-wrap">
                <a href="/" class="hover:text-primary transition-colors">Beranda</a>
                <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                <a href="/berita" class="hover:text-primary transition-colors">Berita</a>
                <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                <span class="text-slateDark font-medium truncate max-w-xs sm:max-w-md">${escapeHtml(article.title)}</span>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div class="lg:col-span-2 space-y-6">
                    <article class="inst-card p-6 sm:p-8">
                        <span class="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-500 text-xs font-bold mb-4">${escapeHtml(article.category || '')}</span>
                        <h1 class="text-2xl sm:text-3xl font-extrabold text-slateDark leading-snug mb-3">${escapeHtml(article.title)}</h1>
                        <div class="flex items-center gap-4 text-xs text-slateMuted mb-6 pb-6 border-b border-borderLight">
                            <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> ${escapeHtml(article.date || '')}</span>
                            <span class="flex items-center gap-1"><i data-lucide="user" class="w-3.5 h-3.5"></i> ${escapeHtml(article.author || 'Admin')}</span>
                        </div>
                        <div class="text-sm sm:text-base text-slateDark/90 leading-relaxed space-y-4">${paragraphsHtml(article.content || article.excerpt)}</div>

                        <div class="mt-8 pt-6 border-t border-borderLight flex items-center gap-3">
                            <span class="text-sm font-semibold text-slateDark mr-1">Bagikan:</span>
                            <button onclick="shareBerita('facebook')" title="Bagikan ke Facebook" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-primary hover:text-white text-slateMuted flex items-center justify-center transition-colors"><i data-lucide="facebook" class="w-4 h-4"></i></button>
                            <button onclick="shareBerita('twitter')" title="Bagikan ke Twitter/X" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-primary hover:text-white text-slateMuted flex items-center justify-center transition-colors"><i data-lucide="twitter" class="w-4 h-4"></i></button>
                            <button onclick="shareBerita('whatsapp')" title="Bagikan ke WhatsApp" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-primary hover:text-white text-slateMuted flex items-center justify-center transition-colors"><i data-lucide="message-circle" class="w-4 h-4"></i></button>
                            <button onclick="shareBerita('copy')" title="Salin Tautan" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-primary hover:text-white text-slateMuted flex items-center justify-center transition-colors"><i data-lucide="link" class="w-4 h-4"></i></button>
                        </div>
                    </article>

                    <div class="inst-card p-6 sm:p-8">
                        <div class="flex items-center gap-2 mb-6 flex-wrap">
                            <i data-lucide="message-square" class="w-5 h-5 text-primary"></i>
                            <h3 class="font-bold text-slateDark">${comments.length} Komentar</h3>
                            <span class="text-sm text-slateMuted">Bergabunglah dalam diskusi</span>
                        </div>
                        <div class="space-y-5 mb-2">${commentsHtml}</div>
                        <div class="border-t border-borderLight pt-6 mt-6">
                            <h4 class="font-semibold text-slateDark mb-4 flex items-center gap-2"><i data-lucide="edit-3" class="w-4 h-4"></i> Tinggalkan Komentar</h4>
                            <form id="bd-comment-form" onsubmit="event.preventDefault(); submitBeritaComment('${escapeHtml(article.id)}');" class="space-y-4">
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <input type="text" id="bd-comment-name" placeholder="Nama Lengkap *" required class="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                                    <input type="email" id="bd-comment-email" placeholder="Email *" required class="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                                </div>
                                <textarea id="bd-comment-message" rows="4" placeholder="Tulis komentar Anda... *" required class="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"></textarea>
                                <button type="submit" class="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-slateDark text-white text-sm font-semibold hover:bg-slate-800 transition-colors shadow-soft">Kirim Komentar <i data-lucide="send" class="w-4 h-4"></i></button>
                            </form>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${prevNextHtml}</div>
                </div>

                <div class="space-y-6">
                    <div class="inst-card p-5">
                        <h4 class="font-bold text-slateDark mb-3 text-sm">Berita Terbaru</h4>
                        <div class="space-y-3">${recent || '<p class="text-xs text-slateMuted">Belum ada berita.</p>'}</div>
                    </div>
                    <div class="inst-card p-5">
                        <h4 class="font-bold text-slateDark mb-3 text-sm">Arsip Berita</h4>
                        <div class="space-y-1">${archiveHtml}</div>
                    </div>
                    <div class="inst-card p-5">
                        <h4 class="font-bold text-slateDark mb-3 text-sm">Tags</h4>
                        <div class="flex flex-wrap gap-2">${tagsHtml}</div>
                    </div>
                    <div class="inst-card p-5">
                        <h4 class="font-bold text-slateDark mb-3 text-sm">Ikuti Kami</h4>
                        <div class="flex gap-3">
                            <a href="${escapeHtml(f.socialFacebook || '#')}" target="_blank" rel="noopener" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-primary hover:text-white text-slateMuted flex items-center justify-center transition-colors"><i data-lucide="facebook" class="w-4 h-4"></i></a>
                            <a href="${escapeHtml(f.socialInstagram || '#')}" target="_blank" rel="noopener" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-primary hover:text-white text-slateMuted flex items-center justify-center transition-colors"><i data-lucide="instagram" class="w-4 h-4"></i></a>
                            <a href="${escapeHtml(f.socialYoutube || '#')}" target="_blank" rel="noopener" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-primary hover:text-white text-slateMuted flex items-center justify-center transition-colors"><i data-lucide="youtube" class="w-4 h-4"></i></a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// Script kecil khusus halaman detail: share + kirim komentar (PUT /api/data pakai
// X-Sync-Key dari localStorage kalau ada — mekanisme yang sama seperti versi lama;
// lihat catatan di ringkasan chat soal keterbatasan ini).
export function beritaDetailScript(articleId) {
  return `
<script>
function shareBerita(platform) {
    var url = window.location.href;
    var title = document.querySelector('h1').textContent;
    var shareUrl = '';
    if (platform === 'facebook') shareUrl = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
    else if (platform === 'twitter') shareUrl = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(title) + '&url=' + encodeURIComponent(url);
    else if (platform === 'whatsapp') shareUrl = 'https://wa.me/?text=' + encodeURIComponent(title + ' - ' + url);
    else if (platform === 'copy') {
        navigator.clipboard.writeText(url).then(function () { showToast('Tautan berhasil disalin.'); }).catch(function () { showToast('Gagal menyalin tautan.', 'error'); });
        return;
    }
    if (shareUrl) window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=500');
}
async function submitBeritaComment(articleId) {
    var name = document.getElementById('bd-comment-name').value.trim();
    var email = document.getElementById('bd-comment-email').value.trim();
    var message = document.getElementById('bd-comment-message').value.trim();
    if (!name || !email || !message) return;
    try {
        var res = await fetch('/api/data');
        var data = await res.json();
        data.beritaComments = data.beritaComments || {};
        if (!data.beritaComments[articleId]) data.beritaComments[articleId] = [];
        data.beritaComments[articleId].push({ name: name, email: email, message: message, date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) });
        var key = localStorage.getItem('sdn01papahan_sync_key') || '';
        if (key) {
            await fetch('/api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Sync-Key': key }, body: JSON.stringify(data) });
            showToast('Komentar berhasil dikirim.');
            location.reload();
        } else {
            showToast('Komentar butuh admin untuk tersimpan permanen — hubungi sekolah.', 'error');
        }
    } catch (e) {
        showToast('Gagal mengirim komentar.', 'error');
    }
}
</script>`;
}

export { truncateForMeta };
