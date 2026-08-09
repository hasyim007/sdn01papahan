// =========================================================================
// Admin app — shared oleh semua halaman /admin/*.html. Tiap halaman cukup
// set <body data-section="..."> dan panggil initAdminPage().
// Semua data diambil/disimpan lewat /api/admin/* (session cookie httpOnly,
// server-side auth — lihat src/lib/auth.js & src/worker.js).
// =========================================================================

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

const NAV_ITEMS = [
  { href: '/admin/dashboard.html', label: 'Dashboard', icon: 'layout-dashboard' },
  { href: '/admin/hero.html', label: 'Hero & Statistik', icon: 'flag' },
  { href: '/admin/sambutan.html', label: 'Sambutan', icon: 'pen-line' },
  { href: '/admin/profil.html', label: 'Profil Sekolah', icon: 'building' },
  { href: '/admin/program.html', label: 'Program Unggulan', icon: 'graduation-cap' },
  { href: '/admin/guru.html', label: 'Tenaga Pendidik', icon: 'users' },
  { href: '/admin/prestasi.html', label: 'Prestasi & Ekskul', icon: 'trophy' },
  { href: '/admin/berita.html', label: 'Berita', icon: 'newspaper' },
  { href: '/admin/galeri.html', label: 'Galeri', icon: 'image' },
  { href: '/admin/testimoni.html', label: 'Testimoni', icon: 'quote' },
  { href: '/admin/faq.html', label: 'FAQ', icon: 'help-circle' },
  { href: '/admin/kontak-footer.html', label: 'Kontak & Footer', icon: 'phone' },
  { href: '/admin/custom-sections.html', label: 'Halaman Kustom', icon: 'layout-template' },
  { href: '/admin/page-order.html', label: 'Urutan Halaman', icon: 'list-ordered' },
  { href: '/admin/pengaturan.html', label: 'Pengaturan Akun', icon: 'settings' }
];

async function ensureAuthed() {
  const res = await fetch('/api/auth/me');
  const data = await res.json();
  if (!data.loggedIn) {
    window.location.href = '/admin/login.html';
    return null;
  }
  return data;
}

function renderShell(activeHref, username) {
  const shell = document.getElementById('admin-shell');
  shell.innerHTML = `
    <aside class="w-64 bg-white border-r border-slate-100 flex-shrink-0 hidden md:flex flex-col">
      <div class="p-5 border-b border-slate-100">
        <p class="font-bold text-slateDark">SDN 01 Papahan</p>
        <p class="text-xs text-slateMuted">Panel Admin</p>
      </div>
      <nav class="flex-1 overflow-y-auto p-3 space-y-0.5">
        ${NAV_ITEMS.map(n => `
          <a href="${n.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${n.href === activeHref ? 'bg-blue-50 text-primary font-semibold' : 'text-slateMuted hover:bg-slate-50'}">
            <i data-lucide="${n.icon}" class="w-4 h-4"></i> ${n.label}
          </a>`).join('')}
      </nav>
      <div class="p-3 border-t border-slate-100">
        <p class="text-xs text-slateMuted px-3 mb-2">Masuk sebagai <b>${esc(username)}</b></p>
        <button id="logout-btn" class="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-red-600 hover:bg-red-50">
          <i data-lucide="log-out" class="w-4 h-4"></i> Keluar
        </button>
      </div>
    </aside>
    <main class="flex-1 overflow-y-auto p-6 md:p-10" id="admin-main"></main>`;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/admin/login.html';
  });
  window.lucide?.createIcons();
}

function pageHeader(title, subtitle) {
  return `<div class="mb-8"><h1 class="text-2xl font-bold text-slateDark">${esc(title)}</h1>
    ${subtitle ? `<p class="text-sm text-slateMuted mt-1">${esc(subtitle)}</p>` : ''}</div>`;
}

function toast(msg) {
  let t = document.getElementById('admin-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'admin-toast';
    t.className = 'fixed bottom-6 right-6 bg-slateDark text-white text-sm px-4 py-3 rounded-lg shadow-lg opacity-0 transition-opacity';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}

// -------------------------------------------------------------------------
// Editor "object" — form field sederhana untuk data tunggal (bukan larik).
// -------------------------------------------------------------------------
function renderObjectEditor(container, storeKey, fields, title, subtitle) {
  container.innerHTML = pageHeader(title, subtitle) + `<div class="bg-white rounded-2xl border border-slate-100 p-6 max-w-2xl space-y-4" id="obj-form"></div>
    <button id="obj-save" class="mt-6 px-6 py-2.5 bg-primary text-white rounded-lg font-semibold hover:bg-primaryHover">Simpan Perubahan</button>`;

  fetch('/api/admin/store/' + storeKey).then(r => r.json()).then(data => {
    data = data || {};
    const form = document.getElementById('obj-form');
    form.innerHTML = fields.map(f => renderField(f, data)).join('');
    bindImageInputs(form);
    document.getElementById('obj-save').addEventListener('click', async () => {
      const updated = collectFields(fields, data);
      const res = await fetch('/api/admin/store/' + storeKey, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated)
      });
      if (res.ok) toast('Perubahan disimpan.'); else toast('Gagal menyimpan.');
    });
  });
}

// Kompres gambar di sisi browser sebelum disimpan sebagai base64 di D1
// (reuse pola resizeImageFile() dari versi SPA lama — tanpa R2).
function resizeImageFile(file, maxWidth = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderField(f, data) {
  const val = getPath(data, f.key);
  if (f.type === 'image') {
    return `<div>
      <label class="block text-xs font-semibold text-slateDark mb-1">${esc(f.label)}</label>
      <div class="flex items-center gap-3 mb-2">
        <img data-preview="${f.key}" src="${esc(val)}" class="w-16 h-16 rounded-lg object-cover bg-slate-100 border border-slate-200">
        <label class="flex-1 cursor-pointer">
          <div class="px-3 py-2.5 rounded-lg border border-dashed border-slate-300 text-xs text-slateMuted text-center hover:border-primary hover:text-primary">
            Klik untuk unggah foto (otomatis dikompres)
          </div>
          <input type="file" accept="image/*" class="hidden" data-image-input="${f.key}">
        </label>
      </div>
      <input type="text" data-field="${f.key}" value="${esc(val)}" placeholder="atau tempel URL gambar"
        class="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-xs text-slateMuted"
        oninput="document.querySelector('[data-preview=\\'${f.key}\\']').src=this.value">
    </div>`;
  }
  if (f.type === 'textarea') {
    return `<div><label class="block text-xs font-semibold text-slateDark mb-1">${esc(f.label)}</label>
      <textarea data-field="${f.key}" rows="4" class="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm">${esc(val)}</textarea></div>`;
  }
  if (f.type === 'array-text') {
    // larik string, satu baris per item (mis. misi[])
    const arr = Array.isArray(val) ? val : [];
    return `<div><label class="block text-xs font-semibold text-slateDark mb-1">${esc(f.label)} (satu baris = satu item)</label>
      <textarea data-field="${f.key}" data-array="true" rows="4" class="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm">${esc(arr.join('\n'))}</textarea></div>`;
  }
  return `<div><label class="block text-xs font-semibold text-slateDark mb-1">${esc(f.label)}</label>
    <input type="text" data-field="${f.key}" value="${esc(val)}" class="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm"></div>`;
}

function collectFields(fields, base) {
  const out = JSON.parse(JSON.stringify(base || {}));
  fields.forEach(f => {
    const el = document.querySelector(`[data-field="${f.key}"]`);
    if (!el) return;
    if (el.dataset.array === 'true') {
      setPath(out, f.key, el.value.split('\n').map(s => s.trim()).filter(Boolean));
    } else {
      setPath(out, f.key, el.value);
    }
  });
  return out;
}

function bindImageInputs(root) {
  root.querySelectorAll('[data-image-input]').forEach(input => {
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const dataUrl = await resizeImageFile(file);
      const key = input.dataset.imageInput;
      const textInput = root.querySelector(`[data-field="${key}"]`);
      const preview = root.querySelector(`[data-preview="${key}"]`);
      if (textInput) textInput.value = dataUrl;
      if (preview) preview.src = dataUrl;
    });
  });
}

function getPath(obj, path) { return path.split('.').reduce((o, k) => (o || {})[k], obj); }
function setPath(obj, path, val) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) { cur[keys[i]] = cur[keys[i]] || {}; cur = cur[keys[i]]; }
  cur[keys[keys.length - 1]] = val;
}

// -------------------------------------------------------------------------
// Editor "list" — CRUD larik item (mis. program[], guru[], faq[]) yang
// disimpan sebagai satu store key (whole-array PUT), plus header opsional.
// -------------------------------------------------------------------------
function renderListEditor(container, storeKey, fields, title, subtitle, opts = {}) {
  container.innerHTML = pageHeader(title, subtitle) + `
    ${opts.headerFields ? `<div class="bg-white rounded-2xl border border-slate-100 p-6 mb-8 max-w-2xl space-y-4" id="header-form"></div>
    <button id="header-save" class="mb-10 px-6 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold">Simpan Judul Bagian</button>` : ''}
    <div class="flex justify-between items-center mb-4">
      <h2 class="font-semibold text-slateDark">Daftar Item</h2>
      <button id="add-item-btn" class="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold">+ Tambah</button>
    </div>
    <div id="item-list" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
    <div id="item-modal" class="hidden fixed inset-0 bg-black/40 items-center justify-center p-4 z-50">
      <div class="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <h3 class="font-bold text-slateDark mb-4" id="modal-title">Item</h3>
        <div id="modal-fields" class="space-y-4"></div>
        <div class="flex gap-3 mt-6">
          <button id="modal-save" class="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg font-semibold">Simpan</button>
          <button id="modal-cancel" class="px-4 py-2.5 border border-slate-200 rounded-lg">Batal</button>
        </div>
      </div>
    </div>`;

  let items = [];
  let headerData = {};
  let editIndex = null;

  async function load() {
    const res = await fetch('/api/admin/store/' + storeKey);
    items = (await res.json()) || [];
    renderItems();
    if (opts.headerFields) {
      const hres = await fetch('/api/admin/store/' + opts.headerKey);
      headerData = (await hres.json()) || {};
      document.getElementById('header-form').innerHTML = opts.headerFields.map(f => renderField(f, headerData)).join('');
    }
  }

  function renderItems() {
    document.getElementById('item-list').innerHTML = items.map((it, i) => `
      <div class="bg-white rounded-xl border border-slate-100 p-4 flex justify-between items-start gap-3">
        <div class="min-w-0">
          <p class="font-semibold text-slateDark text-sm truncate">${esc(it[fields[0].key])}</p>
          ${fields[1] ? `<p class="text-xs text-slateMuted truncate">${esc(it[fields[1].key])}</p>` : ''}
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button class="edit-btn text-primary text-xs font-semibold" data-i="${i}">Edit</button>
          <button class="del-btn text-red-600 text-xs font-semibold" data-i="${i}">Hapus</button>
        </div>
      </div>`).join('') || '<p class="text-sm text-slateMuted col-span-2">Belum ada item.</p>';

    document.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', () => openModal(Number(b.dataset.i))));
    document.querySelectorAll('.del-btn').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Hapus item ini?')) return;
      items.splice(Number(b.dataset.i), 1);
      await save();
    }));
  }

  function openModal(index) {
    editIndex = index;
    const data = index === null ? {} : items[index];
    document.getElementById('modal-title').textContent = index === null ? 'Tambah Item' : 'Edit Item';
    const modalFields = document.getElementById('modal-fields');
    modalFields.innerHTML = fields.map(f => renderField(f, data)).join('');
    bindImageInputs(modalFields);
    document.getElementById('item-modal').classList.remove('hidden');
    document.getElementById('item-modal').classList.add('flex');
  }
  function closeModal() {
    document.getElementById('item-modal').classList.add('hidden');
    document.getElementById('item-modal').classList.remove('flex');
    editIndex = null;
  }

  document.getElementById('add-item-btn').addEventListener('click', () => openModal(null));
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', async () => {
    const base = editIndex === null ? {} : items[editIndex];
    const item = collectFields(fields, base);
    if (editIndex === null) items.push(item); else items[editIndex] = item;
    closeModal();
    await save();
  });
  if (opts.headerFields) {
    document.getElementById('header-save').addEventListener('click', async () => {
      const updated = collectFields(opts.headerFields, headerData);
      await fetch('/api/admin/store/' + opts.headerKey, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated)
      });
      toast('Judul bagian disimpan.');
    });
  }

  async function save() {
    await fetch('/api/admin/store/' + storeKey, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(items)
    });
    renderItems();
    toast('Data disimpan.');
  }

  load();
}

// -------------------------------------------------------------------------
// Init per halaman
// -------------------------------------------------------------------------
async function initAdminPage() {
  const me = await ensureAuthed();
  if (!me) return;
  const section = document.body.dataset.section;
  const activeHref = '/admin/' + (section === 'dashboard' ? 'dashboard' : section) + '.html';
  renderShell(activeHref, me.username);
  const main = document.getElementById('admin-main');
  if (window.renderAdminSection) window.renderAdminSection(main, section);
}

document.addEventListener('DOMContentLoaded', initAdminPage);
