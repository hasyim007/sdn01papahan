import { escapeHtml } from '../../lib/html.js';

function field(label, input, help) {
  return `<div><label class="admin-label">${escapeHtml(label)}</label>${input}${help ? `<p class="text-xs text-slateMuted mt-1">${escapeHtml(help)}</p>` : ''}</div>`;
}

export function buildSettingsBody(db, username) {
  const m = db.meta || {};
  const v = (x) => escapeHtml(m[x] || '');

  return `
  <div class="space-y-8">
    <form method="POST" action="/admin/pengaturan/identitas" class="space-y-6">
      <div class="inst-card p-6 space-y-4">
        <h3 class="font-bold text-slateDark">Identitas Sekolah</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${field('Nama sekolah', `<input type="text" name="schoolName" value="${v('schoolName')}" class="admin-input">`)}
          ${field('Lokasi (ditampilkan di bawah nama)', `<input type="text" name="schoolLocation" value="${v('schoolLocation')}" class="admin-input">`)}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${field('Judul tab browser', `<input type="text" name="pageTitle" value="${v('pageTitle')}" class="admin-input">`)}
          ${field('Teks tombol CTA navbar', `<input type="text" name="navCtaText" value="${v('navCtaText')}" class="admin-input">`)}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${field('Teks logo (kalau tanpa gambar)', `<input type="text" name="logoText" value="${v('logoText')}" maxlength="3" class="admin-input">`)}
          ${field('URL Gambar logo', `<input type="text" name="logoImage" value="${v('logoImage')}" class="admin-input">`)}
        </div>
      </div>
      <div class="flex justify-end">
        <button type="submit" class="admin-btn-primary"><i data-lucide="save" class="w-4 h-4"></i> Simpan Identitas</button>
      </div>
    </form>

    <form method="POST" action="/admin/pengaturan/akun" class="space-y-6">
      <div class="inst-card p-6 space-y-4">
        <h3 class="font-bold text-slateDark">Akun Login</h3>
        <p class="text-sm text-slateMuted">Username saat ini: <strong>${escapeHtml(username || '')}</strong></p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${field('Username baru (kosongkan jika tidak diganti)', `<input type="text" name="username" class="admin-input">`)}
          ${field('Password saat ini', `<input type="password" name="currentPassword" required class="admin-input">`, 'Wajib diisi untuk verifikasi setiap kali menyimpan perubahan akun.')}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${field('Password baru (kosongkan jika tidak diganti)', `<input type="password" name="newPassword" class="admin-input">`)}
          ${field('Ulangi password baru', `<input type="password" name="newPasswordConfirm" class="admin-input">`)}
        </div>
      </div>
      <div class="flex justify-end">
        <button type="submit" class="admin-btn-primary"><i data-lucide="key" class="w-4 h-4"></i> Simpan Akun</button>
      </div>
    </form>
  </div>`;
}
