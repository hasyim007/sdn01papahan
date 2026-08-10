import { escapeHtml, slugify } from '../lib/html.js';

const CS_SERVICE_COLORS = {
  emerald: { border: 'border-emerald-200', iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', badgeBg: 'bg-emerald-600', titleText: 'text-emerald-700', check: 'text-emerald-500', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  orange: { border: 'border-orange-200', iconBg: 'bg-orange-50', iconText: 'text-orange-600', badgeBg: 'bg-orange-500', titleText: 'text-orange-600', check: 'text-orange-500', btn: 'bg-orange-500 hover:bg-orange-600' },
  blue: { border: 'border-blue-200', iconBg: 'bg-blue-50', iconText: 'text-blue-600', badgeBg: 'bg-blue-600', titleText: 'text-blue-700', check: 'text-blue-500', btn: 'bg-blue-600 hover:bg-blue-700' },
  indigo: { border: 'border-indigo-200', iconBg: 'bg-indigo-50', iconText: 'text-indigo-600', badgeBg: 'bg-indigo-600', titleText: 'text-indigo-700', check: 'text-indigo-500', btn: 'bg-indigo-600 hover:bg-indigo-700' },
  purple: { border: 'border-purple-200', iconBg: 'bg-purple-50', iconText: 'text-purple-600', badgeBg: 'bg-purple-600', titleText: 'text-purple-700', check: 'text-purple-500', btn: 'bg-purple-600 hover:bg-purple-700' },
  rose: { border: 'border-rose-200', iconBg: 'bg-rose-50', iconText: 'text-rose-600', badgeBg: 'bg-rose-600', titleText: 'text-rose-700', check: 'text-rose-500', btn: 'bg-rose-600 hover:bg-rose-700' },
};
function csServiceColor(key) { return CS_SERVICE_COLORS[key] || CS_SERVICE_COLORS.blue; }

function csBgClass(bg) { return bg === 'dark' ? 'bg-slate-900 text-white' : bg === 'gray' ? 'bg-slate-50' : 'bg-white'; }
function csMutedClass(bg) { return bg === 'dark' ? 'text-slate-300' : 'text-slateMuted'; }
function csEyebrowClass(bg) { return bg === 'dark' ? 'bg-white/10 border-white/10 text-white' : 'bg-blue-50 border-blue-100 text-primary'; }
function csCardClass(bg) { return bg === 'dark' ? 'bg-white/5 border border-white/10' : 'bg-white border border-borderLight shadow-soft'; }

// Sama persis dengan buildCustomSectionMarkup() di public/index.html (fungsi itu memang
// sudah murni data->string, jadi diport apa adanya, tanpa perubahan logic).
export function buildCustomSectionMarkup(s) {
  const bgSection = csBgClass(s.bgStyle);
  const muted = csMutedClass(s.bgStyle);
  const items = Array.isArray(s.items) ? s.items : [];
  const eyebrowHtml = s.eyebrow && s.eyebrow.trim()
    ? `<span class="inline-flex items-center px-3 py-1.5 rounded-full border ${csEyebrowClass(s.bgStyle)} text-xs font-semibold mb-4">${escapeHtml(s.eyebrow)}</span>`
    : '';

  if (s.type === 'text') {
    const imgCol = `<div>${s.image ? `<img src="${escapeHtml(s.image)}" alt="${escapeHtml(s.title)}" class="rounded-2xl object-cover w-full h-72 lg:h-[420px] shadow-soft">` : ''}</div>`;
    const textCol = `
            <div>
                ${eyebrowHtml}
                <h2 class="text-3xl sm:text-4xl font-bold mb-4">${escapeHtml(s.title)}</h2>
                ${s.subtitle ? `<p class="${muted} leading-relaxed whitespace-pre-line mb-6">${escapeHtml(s.subtitle)}</p>` : ''}
                ${s.ctaLabel && s.ctaLink ? `<a href="${escapeHtml(s.ctaLink)}" class="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primaryHover transition">${escapeHtml(s.ctaLabel)} <i data-lucide="arrow-right" class="w-4 h-4"></i></a>` : ''}
            </div>`;
    return `
            <section id="cs-${s.id}" class="py-20 ${bgSection}">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    ${s.imagePosition === 'left' ? imgCol + textCol : textCol + imgCol}
                </div>
            </section>`;
  }

  if (s.type === 'cards') {
    const cols = s.columns === 2 ? 'sm:grid-cols-2' : s.columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3';
    return `
            <section id="cs-${s.id}" class="py-20 ${bgSection}">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="max-w-2xl mx-auto text-center mb-12">
                        ${eyebrowHtml}
                        <h2 class="text-3xl sm:text-4xl font-bold mb-4">${escapeHtml(s.title)}</h2>
                        ${s.subtitle ? `<p class="${muted}">${escapeHtml(s.subtitle)}</p>` : ''}
                    </div>
                    <div class="grid grid-cols-1 ${cols} gap-6">
                        ${items.map((it) => `
                            <div class="${csCardClass(s.bgStyle)} rounded-2xl p-6">
                                ${it.icon ? `<div class="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4"><i data-lucide="${escapeHtml(it.icon)}" class="w-6 h-6"></i></div>` : ''}
                                <h3 class="font-bold mb-2">${escapeHtml(it.title || '')}</h3>
                                <p class="text-sm ${muted}">${escapeHtml(it.desc || '')}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </section>`;
  }

  if (s.type === 'services') {
    const cols = s.columns === 2 ? 'sm:grid-cols-2' : s.columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3';
    return `
            <section id="cs-${s.id}" class="py-20 ${bgSection}">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="max-w-2xl mx-auto text-center mb-12">
                        ${eyebrowHtml}
                        <h2 class="text-3xl sm:text-4xl font-bold mb-4">${escapeHtml(s.title)}</h2>
                        ${s.subtitle ? `<p class="${muted}">${escapeHtml(s.subtitle)}</p>` : ''}
                    </div>
                    <div class="grid grid-cols-1 ${cols} gap-6">
                        ${items.map((it) => {
                          const c = csServiceColor(it.color);
                          const features = Array.isArray(it.features) ? it.features : [];
                          const link = (it.link || '').trim();
                          const linkText = it.linkText && it.linkText.trim() ? it.linkText : link.replace(/^https?:\/\//i, '').replace(/\/$/, '');
                          return `
                            <div class="rounded-2xl border-2 ${c.border} ${s.bgStyle === 'dark' ? 'bg-white/5' : 'bg-white'} p-6 flex flex-col shadow-soft">
                                <div class="w-20 h-20 rounded-full ${c.iconBg} flex items-center justify-center mb-4 mx-auto overflow-hidden">
                                    ${it.image ? `<img src="${escapeHtml(it.image)}" alt="${escapeHtml(it.title || '')}" class="w-full h-full object-cover">` : `<i data-lucide="globe" class="w-7 h-7 ${c.iconText}"></i>`}
                                </div>
                                <h3 class="text-xl font-extrabold text-center ${c.titleText} mb-2">${escapeHtml(it.title || '')}</h3>
                                ${it.badge ? `<div class="mx-auto mb-4 text-center"><span class="inline-block px-3 py-1.5 rounded-full ${c.badgeBg} text-white text-xs font-semibold">${escapeHtml(it.badge)}</span></div>` : ''}
                                ${it.listHeading ? `<p class="text-sm font-bold ${c.titleText} text-center mb-3">${escapeHtml(it.listHeading)}</p>` : ''}
                                <ul class="space-y-2 mb-6 flex-1">
                                    ${features.map((f) => `<li class="flex items-start gap-2 text-sm ${muted}"><i data-lucide="check-circle-2" class="w-4 h-4 ${c.check} shrink-0 mt-0.5"></i><span>${escapeHtml(f)}</span></li>`).join('')}
                                </ul>
                                ${link ? `
                                <div class="mt-auto pt-4 border-t ${s.bgStyle === 'dark' ? 'border-white/10' : 'border-slate-100'}">
                                    <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center gap-1.5 text-xs font-semibold ${c.iconText} hover:underline mb-3">
                                        <i data-lucide="globe" class="w-3.5 h-3.5"></i> ${escapeHtml(linkText)}
                                    </a>
                                    <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl ${c.btn} text-white text-sm font-semibold transition">
                                        Silakan klik di sini untuk menuju web <i data-lucide="arrow-right" class="w-4 h-4"></i>
                                    </a>
                                </div>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            </section>`;
  }

  if (s.type === 'gallery') {
    return `
            <section id="cs-${s.id}" class="py-20 ${bgSection}">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="max-w-2xl mx-auto text-center mb-12">
                        ${eyebrowHtml}
                        <h2 class="text-3xl sm:text-4xl font-bold mb-4">${escapeHtml(s.title)}</h2>
                        ${s.subtitle ? `<p class="${muted}">${escapeHtml(s.subtitle)}</p>` : ''}
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                        ${items.map((it) => `
                            <div class="relative rounded-2xl overflow-hidden aspect-square group">
                                <img src="${escapeHtml(it.image || '')}" alt="${escapeHtml(it.caption || '')}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                                ${it.caption ? `<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3"><p class="text-white text-xs font-medium">${escapeHtml(it.caption)}</p></div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </section>`;
  }

  if (s.type === 'cta') {
    return `
            <section id="cs-${s.id}" class="py-16 ${bgSection}">
                <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="rounded-3xl bg-gradient-to-br from-primary to-blue-500 text-white p-10 sm:p-14 text-center shadow-glass">
                        ${s.eyebrow ? `<span class="inline-flex items-center px-3 py-1.5 rounded-full border border-white/20 bg-white/10 text-white text-xs font-semibold mb-4">${escapeHtml(s.eyebrow)}</span>` : ''}
                        <h2 class="text-3xl sm:text-4xl font-bold mb-4">${escapeHtml(s.title)}</h2>
                        ${s.subtitle ? `<p class="text-blue-50 max-w-xl mx-auto mb-8">${escapeHtml(s.subtitle)}</p>` : ''}
                        ${s.ctaLabel && s.ctaLink ? `<a href="${escapeHtml(s.ctaLink)}" class="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white text-primary text-sm font-bold hover:bg-blue-50 transition">${escapeHtml(s.ctaLabel)} <i data-lucide="arrow-right" class="w-4 h-4"></i></a>` : ''}
                    </div>
                </div>
            </section>`;
  }

  return '';
}

// URL halaman kustom dibuat dari label menu (atau judul kalau menuLabel kosong) + id,
// sama polanya dengan beritaSlug() — deskriptif untuk SEO, stabil walau judul diedit.
export function customSectionSlug(s) {
  const base = (s.menuLabel && s.menuLabel.trim()) || s.title || 'halaman';
  return `${slugify(base)}-${s.id}`;
}

export function findCustomSectionBySlug(list, slugParam) {
  const arr = Array.isArray(list) ? list : [];
  let found = arr.find((s) => customSectionSlug(s) === slugParam);
  if (found) return found;
  found = arr.find((s) => s.id === slugParam);
  if (found) return found;
  const lastDash = slugParam.lastIndexOf('-');
  if (lastDash !== -1) {
    const idPart = slugParam.slice(lastDash + 1);
    found = arr.find((s) => s.id === idPart);
  }
  return found || null;
}
