// =========================================================================
// admin.js — dipakai semua halaman /admin/*. Semua panggilan API pakai
// credentials:'include' supaya cookie session ikut terkirim.
// =========================================================================

const NAV_ITEMS = [
    { key: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', href: '/admin/dashboard' },
    { key: 'hero', label: 'Hero & Statistik', icon: 'image', href: '/admin/hero' },
    { key: 'sambutan', label: 'Sambutan Kepsek', icon: 'pen-line', href: '/admin/sambutan' },
    { key: 'profil', label: 'Profil Sekolah', icon: 'building', href: '/admin/profil' },
    { key: 'program', label: 'Program Unggulan', icon: 'graduation-cap', href: '/admin/program' },
    { key: 'guru', label: 'Tenaga Pendidik', icon: 'users', href: '/admin/guru' },
    { key: 'prestasi', label: 'Prestasi & Ekskul', icon: 'trophy', href: '/admin/prestasi' },
    { key: 'berita', label: 'Berita', icon: 'newspaper', href: '/admin/berita' },
    { key: 'galeri', label: 'Galeri', icon: 'image-plus', href: '/admin/galeri' },
    { key: 'testimoni', label: 'Testimoni', icon: 'quote', href: '/admin/testimoni' },
    { key: 'faq', label: 'FAQ', icon: 'help-circle', href: '/admin/faq' },
    { key: 'kontak-footer', label: 'Kontak & Footer', icon: 'contact', href: '/admin/kontak-footer' },
    { key: 'custom-sections', label: 'Halaman Kustom', icon: 'layout-template', href: '/admin/custom-sections' },
    { key: 'page-order', label: 'Urutan Halaman', icon: 'list-ordered', href: '/admin/page-order' },
    { key: 'pengaturan', label: 'Pengaturan Akun', icon: 'settings', href: '/admin/pengaturan' },
];

function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

async function api(path, opts = {}) {
    const res = await fetch(path, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        ...opts,
    });
    if (res.status === 401) {
        window.location.href = '/admin/login';
        throw new Error('Unauthorized');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
    return data;
}

async function requireAdminAuth() {
    try {
        const me = await api('/api/auth/me');
        if (!me.username) { window.location.href = '/admin/login'; return null; }
        return me.username;
    } catch {
        window.location.href = '/admin/login';
        return null;
    }
}

async function adminLogout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/admin/login';
}

function renderSidebar(activeKey, username) {
    const root = document.getElementById('admin-sidebar-root');
    if (!root) return;
    root.innerHTML = `
    <aside class="w-64 flex-shrink-0 bg-white border-r border-slate-100 h-screen sticky top-0 flex flex-col">
        <div class="p-5 border-b border-slate-100 flex items-center gap-3">
            <div class="w-9 h-9 bg-primary rounded-xl flex items-center justify-center text-white font-bold">S1</div>
            <div><p class="font-bold text-sm text-slateDark leading-tight">Admin Panel</p><p class="text-[11px] text-slateMuted">SDN 01 Papahan</p></div>
        </div>
        <nav class="flex-1 overflow-y-auto p-3 space-y-1">
            ${NAV_ITEMS.map((n) => `<a href="${n.href}" class="admin-nav-item ${n.key === activeKey ? 'active' : ''}"><i data-lucide="${n.icon}" class="w-4 h-4"></i>${escHtml(n.label)}</a>`).join('')}
        </nav>
        <div class="p-3 border-t border-slate-100">
            <a href="/" target="_blank" class="admin-nav-item"><i data-lucide="external-link" class="w-4 h-4"></i>Lihat Situs</a>
            <button onclick="adminLogout()" class="admin-nav-item w-full text-left text-red-600"><i data-lucide="log-out" class="w-4 h-4"></i>Logout${username ? ` (${escHtml(username)})` : ''}</button>
        </div>
    </aside>`;
    if (window.lucide) lucide.createIcons();
}

/** Inisialisasi standar tiap halaman admin (kecuali login). */
async function initAdminPage(activeKey) {
    const username = await requireAdminAuth();
    if (!username) return null;
    renderSidebar(activeKey, username);
    return username;
}

function toast(msg, type = 'success') {
    let el = document.getElementById('admin-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'admin-toast';
        el.className = 'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-glass text-sm font-medium transition-opacity';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = `fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-glass text-sm font-medium ${type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

/** Kompres gambar di sisi browser sebelum disimpan sebagai base64 di D1. */
function resizeImageFile(file, maxWidth = 1000, quality = 0.75) {
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

/**
 * Form field sederhana untuk objek singleton (mis. meta, hero, profil).
 * fields: [{key,label,type:'text'|'textarea'|'image'|'array-text'}]
 */
function buildSimpleForm(container, fields, data, onFieldChange) {
    container.innerHTML = fields.map((f) => {
        const val = data[f.key] ?? (f.type === 'array-text' ? [] : '');
        if (f.type === 'textarea') {
            return `<div class="mb-4"><label class="field-label">${escHtml(f.label)}</label><textarea class="field-input" rows="4" data-field="${f.key}">${escHtml(val)}</textarea></div>`;
        }
        if (f.type === 'array-text') {
            return `<div class="mb-4"><label class="field-label">${escHtml(f.label)} <span class="text-slateMuted font-normal">(satu baris = satu item)</span></label><textarea class="field-input" rows="4" data-field="${f.key}" data-array="1">${escHtml((val || []).join('\n'))}</textarea></div>`;
        }
        if (f.type === 'checkbox') {
            return `<div class="mb-4 flex items-center gap-2"><input type="checkbox" data-field="${f.key}" data-checkbox="1" ${val ? 'checked' : ''} id="chk-${f.key}"><label for="chk-${f.key}" class="text-sm text-slateDark">${escHtml(f.label)}</label></div>`;
        }
        if (f.type === 'image') {
            return `<div class="mb-4"><label class="field-label">${escHtml(f.label)}</label>
                <div class="flex items-center gap-3">
                    <img src="${escHtml(val || '')}" class="item-thumb" data-preview="${f.key}">
                    <input type="file" accept="image/*" data-image-field="${f.key}" class="text-sm">
                </div>
                <input type="hidden" data-field="${f.key}" value="${escHtml(val || '')}">
            </div>`;
        }
        return `<div class="mb-4"><label class="field-label">${escHtml(f.label)}</label><input type="text" class="field-input" data-field="${f.key}" value="${escHtml(val)}"></div>`;
    }).join('');

    container.querySelectorAll('[data-image-field]').forEach((input) => {
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const dataUrl = await resizeImageFile(file);
            const key = input.dataset.imageField;
            container.querySelector(`[data-preview="${key}"]`).src = dataUrl;
            container.querySelector(`input[data-field="${key}"]`).value = dataUrl;
            if (onFieldChange) onFieldChange();
        });
    });
}

/** Ambil data dari form yang dibuat buildSimpleForm(). */
function readSimpleForm(container) {
    const out = {};
    container.querySelectorAll('[data-field]').forEach((el) => {
        if (el.dataset.checkbox) {
            out[el.dataset.field] = el.checked;
        } else if (el.dataset.array) {
            out[el.dataset.field] = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
        } else {
            out[el.dataset.field] = el.value;
        }
    });
    return out;
}

/**
 * Manager generik untuk data berbentuk array-of-objects yang disimpan di
 * satu key `store` (mis. program[], guru[], prestasi[], galeri[], faq[]).
 * fields: [{key,label,type:'text'|'textarea'|'image'|'checkbox'}]
 * options: { titleField, subtitleField, thumbField }
 */
async function buildArrayManager(container, apiType, fields, options = {}) {
    let items = (await api(`/api/store/${apiType}`)).data || [];
    let openIndex = null;

    function itemLabel(it) {
        return it[options.titleField || fields[0].key] || '(tanpa judul)';
    }

    function render() {
        container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
          <p class="text-sm text-slateMuted">${items.length} item</p>
          <button id="am-add-btn" class="btn-primary flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>Tambah</button>
        </div>
        <div class="space-y-3" id="am-list"></div>`;

        const list = container.querySelector('#am-list');
        list.innerHTML = items.map((it, i) => `
          <div class="admin-card p-4">
            <div class="flex items-center justify-between cursor-pointer" data-toggle="${i}">
              <div class="flex items-center gap-3 min-w-0">
                ${options.thumbField ? `<img src="${escHtml(it[options.thumbField] || '')}" class="item-thumb flex-shrink-0">` : ''}
                <div class="min-w-0"><p class="font-semibold text-sm text-slateDark truncate">${escHtml(itemLabel(it))}</p>${options.subtitleField ? `<p class="text-xs text-slateMuted truncate">${escHtml(it[options.subtitleField] || '')}</p>` : ''}</div>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <button class="btn-danger" data-delete="${i}">Hapus</button>
                <i data-lucide="${openIndex === i ? 'chevron-up' : 'chevron-down'}" class="w-4 h-4 text-slateMuted"></i>
              </div>
            </div>
            ${openIndex === i ? `<div class="mt-4 pt-4 border-t border-slate-100" data-form="${i}"></div>` : ''}
          </div>`).join('') || '<p class="text-sm text-slateMuted text-center py-6">Belum ada item.</p>';

        if (openIndex !== null) {
            const formHost = list.querySelector(`[data-form="${openIndex}"]`);
            if (formHost) {
                buildSimpleForm(formHost, fields, items[openIndex] || {});
                const saveBar = document.createElement('div');
                saveBar.className = 'flex justify-end mt-2';
                saveBar.innerHTML = `<button class="btn-primary" data-save="${openIndex}">Simpan Item</button>`;
                formHost.appendChild(saveBar);
            }
        }

        list.querySelectorAll('[data-toggle]').forEach((el) => el.addEventListener('click', (e) => {
            if (e.target.closest('[data-delete]')) return;
            const i = parseInt(el.dataset.toggle, 10);
            openIndex = openIndex === i ? null : i;
            render();
        }));
        list.querySelectorAll('[data-delete]').forEach((el) => el.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Hapus item ini?')) return;
            items.splice(parseInt(el.dataset.delete, 10), 1);
            openIndex = null;
            await persist();
            render();
        }));
        list.querySelectorAll('[data-save]').forEach((el) => el.addEventListener('click', async () => {
            const i = parseInt(el.dataset.save, 10);
            const formHost = list.querySelector(`[data-form="${i}"]`);
            items[i] = { ...items[i], ...readSimpleForm(formHost) };
            openIndex = null;
            await persist();
            render();
        }));
        container.querySelector('#am-add-btn').addEventListener('click', () => {
            items.push({});
            openIndex = items.length - 1;
            render();
        });
        if (window.lucide) lucide.createIcons();
    }

    async function persist() {
        try {
            await api(`/api/store/${apiType}`, { method: 'PUT', body: JSON.stringify({ data: items }) });
            toast('Tersimpan');
        } catch (e) { toast(e.message, 'error'); }
    }

    render();
}
