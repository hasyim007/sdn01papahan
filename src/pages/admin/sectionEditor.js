import { escapeHtml } from '../../lib/html.js';
import { SECTION_CONFIGS } from './fieldConfig.js';

function renderField(field, name, value) {
  const v = escapeHtml(value == null ? '' : String(value));
  if (field.type === 'textarea') {
    return `<textarea name="${name}" rows="3" class="admin-input">${v}</textarea>`;
  }
  if (field.type === 'select') {
    const opts = [`<option value="" ${!value ? 'selected' : ''}>— pilih —</option>`]
      .concat((field.options || []).map((o) => `<option value="${escapeHtml(o)}" ${o === value ? 'selected' : ''}>${escapeHtml(o)}</option>`))
      .join('');
    return `<select name="${name}" class="admin-input">${opts}</select>`;
  }
  if (field.type === 'image') {
    return `
      <input type="text" name="${name}" value="${v}" placeholder="https://..." class="admin-input">
      ${value ? `<img src="${v}" class="mt-2 w-16 h-16 rounded-lg object-cover border border-borderLight">` : ''}
    `;
  }
  return `<input type="text" name="${name}" value="${v}" class="admin-input">`;
}

function renderFieldGroup(field, name, value) {
  return `<div><label class="admin-label">${escapeHtml(field.label)}</label>${renderField(field, name, value)}</div>`;
}

function renderItemRow(config, item, idxToken, removable) {
  const fieldsHtml = (config.itemFields || [])
    .map((f) => renderFieldGroup(f, `items[${idxToken}][${f.name}]`, item ? item[f.name] : ''))
    .join('');
  return `
  <div class="repeater-row" data-repeater-row>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${fieldsHtml}</div>
    ${removable !== false ? `<button type="button" onclick="repeaterRemove(this)" class="admin-btn-danger mt-3"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Hapus</button>` : ''}
  </div>`;
}

function renderListRow(value, idxToken) {
  return `
  <div class="flex items-center gap-2" data-repeater-row>
    <input type="text" name="list[${idxToken}]" value="${escapeHtml(value || '')}" class="admin-input">
    <button type="button" onclick="repeaterRemove(this)" class="admin-btn-danger flex-shrink-0"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
  </div>`;
}

/** Render form HTML lengkap (header fields + repeater items/list) untuk 1 section. */
export function renderSectionForm(sectionKey, db) {
  const config = SECTION_CONFIGS[sectionKey];
  if (!config) return '<p class="text-red-600">Konfigurasi section tidak ditemukan.</p>';

  const parts = [];

  // Object tunggal (profil, kontak) ATAU header dari section berbentuk list (program, dst)
  const headerFields = config.fields || config.headerFields;
  if (headerFields && headerFields.length) {
    const obj = config.dbKey ? db[config.dbKey] || {} : db[config.headerKey] || {};
    const fieldsHtml = headerFields.map((f) => renderFieldGroup(f, `header[${f.name}]`, obj[f.name])).join('');
    parts.push(`
      <div class="inst-card p-6">
        <h3 class="font-bold text-slateDark mb-4">${config.itemsKey ? 'Judul Section' : 'Detail'}</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${fieldsHtml}</div>
      </div>`);
  }

  // Daftar string sederhana (mis. misi)
  if (config.listField) {
    const values = Array.isArray(db[config.dbKey]?.[config.listField.key]) ? db[config.dbKey][config.listField.key] : [];
    const rows = values.map((v, i) => renderListRow(v, i)).join('');
    parts.push(`
      <div class="inst-card p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-slateDark">${escapeHtml(config.listField.label)}</h3>
          <button type="button" onclick="repeaterAdd('${config.listField.key}')" class="admin-btn-secondary"><i data-lucide="plus" class="w-4 h-4"></i> Tambah</button>
        </div>
        <div id="repeater-${config.listField.key}" data-next-index="${values.length}" class="space-y-3">${rows}</div>
        <template data-repeater-template="${config.listField.key}">${renderListRow('', '__INDEX__')}</template>
      </div>`);
  }

  // Daftar item repeater (program, pengajar, prestasi, ekskul, galeri, testimoni, faq)
  if (config.itemsKey) {
    const items = Array.isArray(db[config.itemsKey]) ? db[config.itemsKey] : [];
    const rows = items.map((item, i) => renderItemRow(config, item, i)).join('');
    parts.push(`
      <div class="inst-card p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-slateDark">Daftar ${escapeHtml(config.itemLabel || 'Item')}</h3>
          <button type="button" onclick="repeaterAdd('items')" class="admin-btn-secondary"><i data-lucide="plus" class="w-4 h-4"></i> Tambah</button>
        </div>
        <div id="repeater-items" data-next-index="${items.length}" class="space-y-3">${rows}</div>
        <template data-repeater-template="items">${renderItemRow(config, null, '__INDEX__')}</template>
      </div>`);
  }

  return `
  <form method="POST" action="/admin/${sectionKey}" class="space-y-6">
    ${parts.join('')}
    <div class="flex justify-end gap-3">
      <button type="submit" class="admin-btn-primary"><i data-lucide="save" class="w-4 h-4"></i> Simpan Perubahan</button>
    </div>
  </form>`;
}

/** Terapkan hasil parseAdminForm() ke objek db (mutasi in-place) untuk 1 section. */
export function applySectionForm(sectionKey, db, parsed) {
  const config = SECTION_CONFIGS[sectionKey];
  if (!config) return;

  if (config.dbKey) {
    db[config.dbKey] = db[config.dbKey] || {};
    Object.assign(db[config.dbKey], parsed.header);
    if (config.listField) {
      db[config.dbKey][config.listField.key] = parsed.list;
    }
  } else if (config.headerKey) {
    db[config.headerKey] = db[config.headerKey] || {};
    Object.assign(db[config.headerKey], parsed.header);
  }

  if (config.itemsKey) {
    db[config.itemsKey] = parsed.items;
  }
}
