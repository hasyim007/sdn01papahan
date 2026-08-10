import { escapeHtml } from '../../lib/html.js';
import { bareLayout } from './shell.js';

export function buildLoginPage({ error, schoolName } = {}) {
  const body = `
  <div class="min-h-screen flex items-center justify-center bg-slate-50 px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <div class="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-soft mx-auto mb-4">S1</div>
        <h1 class="text-xl font-bold text-slateDark">${escapeHtml(schoolName || 'SDN 01 Papahan')}</h1>
        <p class="text-sm text-slateMuted mt-1">Masuk ke panel admin</p>
      </div>
      <div class="inst-card p-6 sm:p-8">
        <form method="POST" action="/api/login" class="space-y-4">
          <div>
            <label class="admin-label" for="username">Username</label>
            <input type="text" id="username" name="username" autocomplete="username" required class="admin-input">
          </div>
          <div>
            <label class="admin-label" for="password">Password</label>
            <input type="password" id="password" name="password" autocomplete="current-password" required class="admin-input">
          </div>
          ${error ? `<p class="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">${escapeHtml(error)}</p>` : ''}
          <button type="submit" class="w-full admin-btn-primary justify-center">Masuk</button>
        </form>
      </div>
      <p class="text-center mt-6">
        <a href="/" class="text-sm text-slateMuted hover:text-primary">&larr; Kembali ke situs</a>
      </p>
    </div>
  </div>`;

  return bareLayout({ title: 'Masuk', bodyHtml: body });
}
