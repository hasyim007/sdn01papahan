// Dipakai khusus halaman detail berita (dirender Worker). Port dari fungsi
// renderBeritaSidebarDefault/beritaSidebarSearch/filterBeritaSidebarByTag/
// filterBeritaSidebarByArchive/shareBerita/renderBeritaComments/
// submitBeritaComment di SPA lama, sumber data diganti fetch ke D1.

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}
function reInitIcons() { if (window.lucide) window.lucide.createIcons(); }

const INDO_MONTHS = ['januari','februari','maret','april','mei','juni','juli','agustus','september','oktober','november','desember'];
function parseBeritaMonthYear(dateStr) {
  const parts = String(dateStr || '').trim().split(/\s+/);
  if (parts.length < 2) return null;
  const monthName = parts[parts.length - 2];
  const year = parts[parts.length - 1];
  const monthIdx = INDO_MONTHS.indexOf(monthName.toLowerCase());
  if (monthIdx === -1 || !/^\d{4}$/.test(year)) return null;
  return { label: monthName + ' ' + year, monthIdx, year: parseInt(year, 10) };
}

function currentSlug() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

let ALL_BERITA = [];

function renderBeritaSidebarList(items) {
  document.getElementById('bd-sidebar-list').innerHTML = items.length ? items.map(b => `
    <a href="/berita/${escapeHtml(b.slug)}" class="w-full flex items-start gap-3 text-left group">
      <div class="w-10 h-10 shrink-0 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm">N</div>
      <div class="min-w-0">
        <p class="text-sm font-semibold text-slateDark leading-snug line-clamp-2 group-hover:text-primary transition-colors">${escapeHtml(b.title)}</p>
        <p class="text-xs text-slateMuted mt-0.5">${escapeHtml(b.date)}</p>
      </div>
    </a>`).join('') : `<p class="text-xs text-slateMuted">Tidak ada berita ditemukan.</p>`;
  reInitIcons();
}

function showBeritaSidebarResults(results, label) {
  document.getElementById('bd-sidebar-list-title').textContent = label + ' (' + results.length + ')';
  document.getElementById('bd-sidebar-reset').classList.remove('hidden');
  renderBeritaSidebarList(results);
}

function renderBeritaSidebarDefault() {
  document.getElementById('bd-sidebar-list-title').textContent = 'Berita Terbaru';
  document.getElementById('bd-sidebar-reset').classList.add('hidden');
  renderBeritaSidebarList(ALL_BERITA.slice(0, 3));

  const archiveMap = {};
  ALL_BERITA.forEach(b => {
    const my = parseBeritaMonthYear(b.date);
    if (!my) return;
    const key = my.year + '-' + my.monthIdx;
    if (!archiveMap[key]) archiveMap[key] = { label: my.label, monthIdx: my.monthIdx, year: my.year, count: 0 };
    archiveMap[key].count++;
  });
  const archiveEntries = Object.values(archiveMap).sort((a, b) => (b.year - a.year) || (b.monthIdx - a.monthIdx));
  document.getElementById('bd-archive-list').innerHTML = archiveEntries.length ? archiveEntries.map(a => `
    <button onclick="filterBeritaSidebarByArchive('${a.label.replace(/'/g, "\\'")}')" class="w-full flex items-center justify-between px-2 py-2 rounded-lg text-sm text-slateMuted hover:text-primary hover:bg-slate-50 transition-colors">
      <span>${escapeHtml(a.label)}</span><span class="text-xs bg-slate-100 rounded-full px-2 py-0.5">${a.count}</span>
    </button>`).join('') : `<p class="text-xs text-slateMuted">Belum ada arsip.</p>`;

  const tagSet = new Set();
  ALL_BERITA.forEach(b => String(b.tags || '').split(',').map(t => t.trim()).filter(Boolean).forEach(t => tagSet.add(t)));
  const tags = Array.from(tagSet);
  document.getElementById('bd-tags-list').innerHTML = tags.length ? tags.map(t => `
    <button onclick="filterBeritaSidebarByTag('${escapeHtml(t).replace(/'/g, "\\'")}')" class="px-3 py-1.5 rounded-full bg-slate-100 text-slateMuted text-xs font-medium hover:bg-primary hover:text-white transition-colors">${escapeHtml(t)}</button>`).join('') : `<p class="text-xs text-slateMuted">Belum ada tag.</p>`;
  reInitIcons();
}

function beritaSidebarSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) { renderBeritaSidebarDefault(); return; }
  const results = ALL_BERITA.filter(b =>
    (b.title || '').toLowerCase().includes(q) ||
    (b.excerpt || '').toLowerCase().includes(q) ||
    (b.content || '').toLowerCase().includes(q)
  );
  showBeritaSidebarResults(results, 'Hasil Pencarian');
}
function filterBeritaSidebarByTag(tag) {
  const q = tag.trim().toLowerCase();
  const results = ALL_BERITA.filter(b => String(b.tags || '').split(',').map(t => t.trim().toLowerCase()).includes(q));
  showBeritaSidebarResults(results, 'Tag: ' + tag);
}
function filterBeritaSidebarByArchive(label) {
  const results = ALL_BERITA.filter(b => { const my = parseBeritaMonthYear(b.date); return my && my.label === label; });
  showBeritaSidebarResults(results, 'Arsip: ' + label);
}
function resetBeritaSidebar() {
  document.getElementById('bd-search-input').value = '';
  renderBeritaSidebarDefault();
}

function shareBerita(platform) {
  const url = window.location.href;
  const title = document.querySelector('h1')?.textContent || document.title;
  let shareUrl = '';
  if (platform === 'facebook') shareUrl = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
  else if (platform === 'twitter') shareUrl = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(title) + '&url=' + encodeURIComponent(url);
  else if (platform === 'whatsapp') shareUrl = 'https://wa.me/?text=' + encodeURIComponent(title + ' - ' + url);
  else if (platform === 'copy') {
    navigator.clipboard.writeText(url).then(() => showToast('Tautan berhasil disalin.')).catch(() => showToast('Gagal menyalin tautan.'));
    return;
  }
  if (shareUrl) window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=500');
}

function showToast(text) {
  let toast = document.getElementById('site-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'site-toast';
    toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-slateDark text-white text-sm px-5 py-3 rounded-xl shadow-lg z-[100] transition-all duration-300 translate-y-20 opacity-0';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.remove('translate-y-20', 'opacity-0');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 2800);
}

// ---- Komentar ----
const COMMENT_IDENTITY_KEY = 'sdn01_comment_identity';

async function loadComments() {
  const slug = currentSlug();
  const res = await fetch(`/api/public/berita/${encodeURIComponent(slug)}/comments`);
  const list = await res.json();
  document.getElementById('bd-comment-count').textContent = list.length + ' Komentar';
  document.getElementById('bd-comment-list').innerHTML = list.length ? list.map(c => `
    <div class="flex gap-3">
      <div class="w-10 h-10 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">${escapeHtml((c.name || '?').trim().charAt(0).toUpperCase())}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <p class="font-semibold text-slateDark text-sm">${escapeHtml(c.name)}</p>
          <span class="text-xs text-slateMuted">${escapeHtml(c.date)}</span>
        </div>
        <p class="text-sm text-slateMuted mt-1 whitespace-pre-line">${escapeHtml(c.message)}</p>
      </div>
    </div>`).join('') : `<p class="text-sm text-slateMuted">Belum ada komentar. Jadilah yang pertama berkomentar!</p>`;
  reInitIcons();
}

function resetBeritaCommentForm() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(COMMENT_IDENTITY_KEY) || 'null'); } catch (e) { saved = null; }
  document.getElementById('bd-comment-name').value = saved ? (saved.name || '') : '';
  document.getElementById('bd-comment-email').value = saved ? (saved.email || '') : '';
  document.getElementById('bd-comment-message').value = '';
  document.getElementById('bd-comment-save').checked = !!saved;
}

async function submitBeritaComment() {
  const name = document.getElementById('bd-comment-name').value.trim();
  const email = document.getElementById('bd-comment-email').value.trim();
  const message = document.getElementById('bd-comment-message').value.trim();
  const save = document.getElementById('bd-comment-save').checked;
  if (!name || !email || !message) { showToast('Nama, email, dan komentar wajib diisi.'); return; }

  const slug = currentSlug();
  const res = await fetch(`/api/public/berita/${encodeURIComponent(slug)}/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, message })
  });
  if (!res.ok) { showToast('Gagal mengirim komentar.'); return; }

  if (save) localStorage.setItem(COMMENT_IDENTITY_KEY, JSON.stringify({ name, email }));
  else localStorage.removeItem(COMMENT_IDENTITY_KEY);

  document.getElementById('bd-comment-message').value = '';
  showToast('Komentar berhasil dikirim.');
  loadComments();
}

document.addEventListener('DOMContentLoaded', async () => {
  const searchInput = document.getElementById('bd-search-input');
  if (searchInput) searchInput.addEventListener('input', (e) => beritaSidebarSearch(e.target.value));

  resetBeritaCommentForm();
  loadComments();

  const res = await fetch('/api/public/data');
  const data = await res.json();
  ALL_BERITA = data.berita || [];
  renderBeritaSidebarDefault();
});
