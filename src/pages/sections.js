import { escapeHtml } from '../lib/html.js';

const COLOR_ICON_BG = { primary: 'bg-blue-50', indigo: 'bg-indigo-50', emerald: 'bg-emerald-50', amber: 'bg-amber-50', rose: 'bg-rose-50', sky: 'bg-sky-50', orange: 'bg-orange-50', red: 'bg-red-50', blue: 'bg-blue-50' };
const COLOR_ICON_TEXT = { primary: 'text-primary', indigo: 'text-indigo-600', emerald: 'text-emerald-600', amber: 'text-amber-600', rose: 'text-rose-600', sky: 'text-sky-600', orange: 'text-orange-600', red: 'text-red-600', blue: 'text-blue-600' };
const COLOR_HOVER_BORDER = { primary: 'hover:border-primary/30', indigo: 'hover:border-indigo-300', emerald: 'hover:border-emerald-300', amber: 'hover:border-amber-300', rose: 'hover:border-rose-300', sky: 'hover:border-sky-300', orange: 'hover:border-orange-300', red: 'hover:border-red-300', blue: 'hover:border-blue-300' };

const pageHeader = (eyebrow, title, subtitle) => `
    <div class="text-center max-w-3xl mx-auto mb-16">
        <h2 class="text-primary font-semibold tracking-wide uppercase text-sm mb-2">${escapeHtml(eyebrow || '')}</h2>
        <h3 class="text-3xl font-bold text-slateDark mb-4">${escapeHtml(title || '')}</h3>
        ${subtitle ? `<p class="text-slateMuted text-lg">${escapeHtml(subtitle)}</p>` : ''}
    </div>`;

export function buildProfilHtml(db) {
  const p = db.profil || {};
  const misi = (p.misi || []).map((m) => `<li class="flex gap-2 items-start"><i data-lucide="check-circle-2" class="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5"></i> ${escapeHtml(m)}</li>`).join('');
  return `
    <section id="profil" class="py-20 bg-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            ${pageHeader(p.eyebrow, p.title, p.desc)}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div class="inst-card p-8">
                    <div class="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-primary mb-6"><i data-lucide="eye" class="w-7 h-7"></i></div>
                    <h4 class="text-xl font-bold text-slateDark mb-3">Visi Kami</h4>
                    <p class="text-slateMuted leading-relaxed">${escapeHtml(p.visi || '')}</p>
                </div>
                <div class="inst-card p-8">
                    <div class="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-6"><i data-lucide="target" class="w-7 h-7"></i></div>
                    <h4 class="text-xl font-bold text-slateDark mb-3">Misi Utama</h4>
                    <ul class="text-slateMuted space-y-2">${misi}</ul>
                </div>
                <div class="inst-card p-8">
                    <div class="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-6"><i data-lucide="building-2" class="w-7 h-7"></i></div>
                    <h4 class="text-xl font-bold text-slateDark mb-3">Fasilitas Modern</h4>
                    <p class="text-slateMuted leading-relaxed">${escapeHtml(p.fasilitas || '')}</p>
                </div>
            </div>
        </div>
    </section>`;
}

export function buildProgramHtml(db) {
  const h = db.programHeader || {};
  const grid = (db.program || []).map((item) => {
    const color = item.color || 'primary';
    return `
        <div class="group bg-white rounded-[1.25rem] border border-borderLight p-6 hover:shadow-soft transition-all ${COLOR_HOVER_BORDER[color] || ''} relative overflow-hidden">
            <div class="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-[100px] -z-0 transition-transform group-hover:scale-110"></div>
            <div class="relative z-10">
                <i data-lucide="${escapeHtml(item.icon || 'book-open')}" class="w-8 h-8 ${COLOR_ICON_TEXT[color] || 'text-primary'} mb-4"></i>
                <h4 class="text-lg font-bold text-slateDark mb-2">${escapeHtml(item.title || '')}</h4>
                <p class="text-sm text-slateMuted">${escapeHtml(item.desc || '')}</p>
            </div>
        </div>`;
  }).join('');
  return `
    <section id="program" class="py-20 bg-slate-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex flex-col md:flex-row justify-between items-end mb-12 gap-4">
                <div class="max-w-2xl">
                    <h2 class="text-primary font-semibold tracking-wide uppercase text-sm mb-2">${escapeHtml(h.eyebrow || '')}</h2>
                    <h3 class="text-3xl font-bold text-slateDark">${escapeHtml(h.title || '')}</h3>
                </div>
                <p class="text-slateMuted max-w-md">${escapeHtml(h.subtitle || '')}</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">${grid}</div>
        </div>
    </section>`;
}

export function buildPengajarHtml(db) {
  const h = db.guruHeader || {};
  const list = db.guru || [];
  const cards = list.map((g, i) => {
    const initial = (g.name || '?').trim().charAt(0).toUpperCase();
    const avatar = g.photo
      ? `<img src="${escapeHtml(g.photo)}" alt="${escapeHtml(g.name)}" class="w-full h-full object-cover">`
      : `<div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-slateDark to-slate-700"><span class="text-6xl font-extrabold text-white">${escapeHtml(initial)}</span></div>`;
    return `
        <div class="guru-card snap-start shrink-0 w-[230px] sm:w-[250px] inst-card overflow-hidden" data-index="${i}">
            <div class="relative w-full h-52">
                ${avatar}
                ${g.isKepsek ? `<div class="absolute top-3 right-3 w-7 h-7 bg-primary rounded-full flex items-center justify-center shadow"><i data-lucide="star" class="w-3.5 h-3.5 text-white fill-current"></i></div>` : ''}
            </div>
            <div class="p-5">
                <h4 class="font-bold text-slateDark leading-snug">${escapeHtml(g.name || '')}</h4>
                <p class="text-sm text-primary font-medium mb-3">${escapeHtml(g.role || '')}</p>
                <div class="space-y-1.5 text-xs text-slateMuted border-t border-borderLight pt-3">
                    ${g.experience ? `<div class="flex items-center gap-1.5"><i data-lucide="briefcase" class="w-3.5 h-3.5 text-primary shrink-0"></i> ${escapeHtml(g.experience)}</div>` : ''}
                    ${g.education ? `<div class="flex items-center gap-1.5"><i data-lucide="graduation-cap" class="w-3.5 h-3.5 text-primary shrink-0"></i> ${escapeHtml(g.education)}</div>` : ''}
                </div>
            </div>
        </div>`;
  }).join('');
  const dots = list.map((_, i) => `<button class="guru-dot h-2 rounded-full transition-all ${i === 0 ? 'bg-primary w-6' : 'bg-slate-200 w-2'}" data-inactive-bg="bg-slate-200" onclick="window['scrollTo_guru-track'] &amp;&amp; window['scrollTo_guru-track'](${i})" aria-label="Ke guru ${i + 1}"></button>`).join('');
  return `
    <section id="pengajar" class="py-20 bg-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-16">
                <span class="inline-flex items-center px-4 py-1.5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold tracking-wide uppercase mb-4">${escapeHtml(h.eyebrow || '')}</span>
                <h3 class="text-3xl sm:text-4xl font-extrabold text-slateDark mb-4">${escapeHtml(h.titlePrefix || '')} <span class="text-indigo-500">${escapeHtml(h.titleHighlight || '')}</span></h3>
                <p class="text-slateMuted text-lg max-w-2xl mx-auto">${escapeHtml(h.subtitle || '')}</p>
            </div>
            <div class="relative">
                <button onclick="window['scroll_guru-track'](-1)" aria-label="Sebelumnya" class="hidden md:flex absolute -left-5 top-[104px] z-10 w-11 h-11 rounded-full bg-white shadow-lg border border-borderLight items-center justify-center text-slateDark hover:bg-slate-50 hover:text-primary transition"><i data-lucide="chevron-left" class="w-5 h-5"></i></button>
                <button onclick="window['scroll_guru-track'](1)" aria-label="Berikutnya" class="hidden md:flex absolute -right-5 top-[104px] z-10 w-11 h-11 rounded-full bg-white shadow-lg border border-borderLight items-center justify-center text-slateDark hover:bg-slate-50 hover:text-primary transition"><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
                <div id="guru-track" class="flex gap-6 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory pb-2 -mx-1 px-1">${cards}</div>
            </div>
            <div id="guru-dots" class="flex justify-center gap-2 mt-8">${dots}</div>
        </div>
    </section>`;
}

export function buildPrestasiHtml(db) {
  const h = db.prestasiHeader || {};
  const list = db.prestasi || [];
  const cards = list.map((p, i) => {
    const photo = p.photo
      ? `<img src="${escapeHtml(p.photo)}" alt="${escapeHtml(p.title)}" class="w-full h-full object-cover">`
      : `<div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-100 to-slate-100"><i data-lucide="trophy" class="w-10 h-10 text-indigo-300"></i></div>`;
    return `
        <div class="prestasi-card snap-start shrink-0 w-[250px] sm:w-[270px] inst-card overflow-hidden p-3" data-index="${i}">
            <div class="relative w-full aspect-[4/5] rounded-2xl overflow-hidden mb-4 bg-slate-100">
                ${photo}
                <span class="absolute top-3 left-3 px-3 py-1 rounded-full bg-white/90 text-primary text-[11px] font-bold tracking-wide">${escapeHtml(p.badge || 'PENCAPAIAN')}</span>
            </div>
            <div class="flex items-center gap-2 mb-2">
                <span class="w-6 h-6 rounded-md bg-amber-50 flex items-center justify-center shrink-0"><i data-lucide="star" class="w-3.5 h-3.5 text-amber-500 fill-current"></i></span>
                <span class="text-xs text-slateMuted font-medium">${escapeHtml((p.date || '').toUpperCase())}</span>
            </div>
            <h4 class="font-bold text-slateDark leading-snug">${escapeHtml(p.title || '')}</h4>
            ${p.studentName ? `<p class="text-xs text-slateMuted mt-1">${escapeHtml(p.studentName)}</p>` : ''}
        </div>`;
  }).join('');
  const dots = list.map((_, i) => `<button class="prestasi-dot h-2 rounded-full transition-all ${i === 0 ? 'bg-primary w-6' : 'bg-slate-200 w-2'}" data-inactive-bg="bg-slate-200" onclick="window['scrollTo_prestasi-track'] &amp;&amp; window['scrollTo_prestasi-track'](${i})" aria-label="Ke prestasi ${i + 1}"></button>`).join('');
  return `
    <section id="prestasi" class="py-20 bg-slate-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center max-w-2xl mx-auto mb-14">
                <span class="inline-block px-4 py-1.5 rounded-full bg-indigo-50 text-indigo-500 text-xs font-bold tracking-wide mb-4">${escapeHtml(h.eyebrow || '')}</span>
                <h2 class="text-3xl sm:text-4xl font-extrabold leading-snug mb-4">
                    <span class="text-slateDark">${escapeHtml(h.titlePrefix || '')}</span> <span class="text-indigo-600">${escapeHtml(h.titleHighlight || '')}</span>
                </h2>
                <p class="text-slateMuted">${escapeHtml(h.subtitle || '')}</p>
            </div>
            <div class="relative">
                <button onclick="window['scroll_prestasi-track'](-1)" aria-label="Sebelumnya" class="hidden md:flex absolute -left-5 top-[110px] z-10 w-11 h-11 rounded-full bg-white shadow-lg border border-borderLight items-center justify-center text-slateDark hover:bg-slate-50 hover:text-primary transition"><i data-lucide="chevron-left" class="w-5 h-5"></i></button>
                <button onclick="window['scroll_prestasi-track'](1)" aria-label="Berikutnya" class="hidden md:flex absolute -right-5 top-[110px] z-10 w-11 h-11 rounded-full bg-white shadow-lg border border-borderLight items-center justify-center text-slateDark hover:bg-slate-50 hover:text-primary transition"><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
                <div id="prestasi-track" class="flex gap-5 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory pb-2 -mx-1 px-1">${cards}</div>
            </div>
            <div id="prestasi-dots" class="flex justify-center gap-2 mt-6">${dots}</div>
        </div>
    </section>`;
}

export function buildEkskulHtml(db) {
  const h = db.ekskulHeader || {};
  const list = (db.ekskul || []).map((e) => `
        <div class="inst-card p-4 flex items-center gap-4">
            <div class="w-10 h-10 ${COLOR_ICON_BG[e.color] || 'bg-orange-50'} ${COLOR_ICON_TEXT[e.color] || 'text-orange-600'} rounded-lg flex items-center justify-center shrink-0"><i data-lucide="${escapeHtml(e.icon || 'star')}" class="w-5 h-5"></i></div>
            <div>
                <h4 class="font-semibold text-slateDark text-sm">${escapeHtml(e.name || '')}</h4>
                <p class="text-xs text-slateMuted">${escapeHtml(e.status || '')}</p>
            </div>
        </div>`).join('');
  return `
    <section id="ekskul" class="py-20 bg-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center max-w-2xl mx-auto mb-12">
                <h2 class="text-2xl sm:text-3xl font-bold text-slateDark">${escapeHtml(h.title || 'Ekstrakurikuler')}</h2>
                <p class="text-sm text-slateMuted mt-2">${escapeHtml(h.subtitle || '')}</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">${list}</div>
        </div>
    </section>`;
}

export function buildGaleriHtml(db) {
  const title = (db.galeriHeader && db.galeriHeader.title) || 'Galeri Kegiatan';
  const list = db.galeri || [];
  const cards = list.map((g, i) => `
        <div class="galeri-card snap-start shrink-0 w-64 h-64 rounded-2xl overflow-hidden relative group" data-index="${i}">
            <img src="${escapeHtml(g.image || '')}" class="w-full h-full object-cover transition duration-500 group-hover:scale-110" alt="${escapeHtml(g.caption || '')}">
            <div class="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-end p-4"><p class="text-sm font-medium">${escapeHtml(g.caption || '')}</p></div>
        </div>`).join('');
  const dots = list.map((_, i) => `<button class="galeri-dot h-2 rounded-full transition-all ${i === 0 ? 'bg-primary w-6' : 'bg-slate-600 w-2'}" data-inactive-bg="bg-slate-600" onclick="window['scrollTo_galeri-scroll'] &amp;&amp; window['scrollTo_galeri-scroll'](${i})" aria-label="Ke foto ${i + 1}"></button>`).join('');
  return `
    <section id="galeri" class="py-20 bg-slate-900 text-white relative overflow-hidden">
        <div class="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-400 via-transparent to-transparent"></div>
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <h2 class="text-2xl font-bold mb-6">${escapeHtml(title)}</h2>
            <div class="relative">
                <button onclick="window['scroll_galeri-scroll'](-1)" aria-label="Sebelumnya" class="hidden md:flex absolute -left-5 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 border border-white/10 items-center justify-center text-white hover:bg-white/20 transition"><i data-lucide="chevron-left" class="w-5 h-5"></i></button>
                <button onclick="window['scroll_galeri-scroll'](1)" aria-label="Berikutnya" class="hidden md:flex absolute -right-5 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 border border-white/10 items-center justify-center text-white hover:bg-white/20 transition"><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
                <div id="galeri-scroll" class="flex gap-4 overflow-x-auto pb-4 no-scrollbar scroll-smooth snap-x snap-mandatory -mx-1 px-1">${cards}</div>
            </div>
            <div id="galeri-dots" class="flex justify-center gap-2 mt-2">${dots}</div>
        </div>
    </section>`;
}

export function buildTestimoniHtml(db) {
  const title = (db.testimoniHeader && db.testimoniHeader.title) || 'Kata Wali Murid';
  const list = db.testimoni || [];
  const cards = list.map((t, i) => {
    const avatar = t.photo
      ? `<img src="${escapeHtml(t.photo)}" alt="${escapeHtml(t.name)}" class="w-12 h-12 rounded-full object-cover">`
      : `<div class="w-12 h-12 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-sm shrink-0">${escapeHtml(String(t.name || '?').trim().charAt(0).toUpperCase())}</div>`;
    return `
        <div class="testimoni-card snap-start shrink-0 w-[320px] sm:w-[380px] glass-darker !bg-slate-800/50 !border-slate-700 p-8 rounded-2xl" data-index="${i}">
            <i data-lucide="quote" class="w-8 h-8 text-blue-400 mb-4 opacity-50"></i>
            <p class="text-lg text-slate-300 italic mb-6 leading-relaxed">"${escapeHtml(t.quote || '')}"</p>
            <div class="flex items-center gap-4">
                ${avatar}
                <div><h4 class="font-bold text-white text-sm">${escapeHtml(t.name || '')}</h4><p class="text-xs text-slate-400">${escapeHtml(t.role || '')}</p></div>
            </div>
        </div>`;
  }).join('');
  const dots = list.map((_, i) => `<button class="testimoni-dot h-2 rounded-full transition-all ${i === 0 ? 'bg-primary w-6' : 'bg-slate-600 w-2'}" data-inactive-bg="bg-slate-600" onclick="window['scrollTo_testimoni-track'] &amp;&amp; window['scrollTo_testimoni-track'](${i})" aria-label="Ke testimoni ${i + 1}"></button>`).join('');
  return `
    <section id="testimoni" class="py-20 bg-slate-950 text-white relative overflow-hidden">
        <div class="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-400 via-transparent to-transparent"></div>
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <h2 class="text-2xl font-bold mb-6">${escapeHtml(title)}</h2>
            <div class="relative">
                <button onclick="window['scroll_testimoni-track'](-1)" aria-label="Sebelumnya" class="hidden md:flex absolute -left-5 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 border border-white/10 items-center justify-center text-white hover:bg-white/20 transition"><i data-lucide="chevron-left" class="w-5 h-5"></i></button>
                <button onclick="window['scroll_testimoni-track'](1)" aria-label="Berikutnya" class="hidden md:flex absolute -right-5 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 border border-white/10 items-center justify-center text-white hover:bg-white/20 transition"><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
                <div id="testimoni-track" class="flex gap-6 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory pb-2 -mx-1 px-1">${cards}</div>
            </div>
            <div id="testimoni-dots" class="flex justify-center gap-2 mt-6">${dots}</div>
        </div>
    </section>`;
}

export function buildFaqHtml(db) {
  const list = (db.faq || []).map((f) => `
        <div class="inst-card overflow-hidden">
            <button class="w-full px-6 py-4 text-left flex justify-between items-center focus:outline-none" onclick="toggleFaq(this)">
                <span class="font-semibold text-slateDark">${escapeHtml(f.q || '')}</span>
                <i data-lucide="chevron-down" class="w-5 h-5 text-slateMuted transition-transform duration-300"></i>
            </button>
            <div class="px-6 pb-4 hidden text-slateMuted text-sm">${escapeHtml(f.a || '')}</div>
        </div>`).join('');
  return `
    <section id="faq" class="py-20 bg-slate-50">
        <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-12">
                <h2 class="text-3xl font-bold text-slateDark mb-2">Pertanyaan Umum (FAQ)</h2>
                <p class="text-slateMuted">Temukan jawaban dari pertanyaan yang sering diajukan.</p>
            </div>
            <div class="space-y-4">${list}</div>
        </div>
    </section>`;
}

export function buildKontakHtml(db) {
  const k = db.kontak || {};
  return `
    <section id="kontak" class="py-20 bg-slate-50">
        <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="inst-card p-8">
                <h3 class="text-2xl font-bold text-slateDark mb-6">Hubungi Kami</h3>
                <div class="space-y-4 mb-8">
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-lg bg-blue-50 text-primary flex items-center justify-center shrink-0"><i data-lucide="map-pin" class="w-5 h-5"></i></div>
                        <div><p class="font-semibold text-sm text-slateDark">Alamat</p><p class="text-sm text-slateMuted">${escapeHtml(k.address || '')}</p></div>
                    </div>
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-lg bg-blue-50 text-primary flex items-center justify-center shrink-0"><i data-lucide="phone" class="w-5 h-5"></i></div>
                        <div><p class="font-semibold text-sm text-slateDark">Telepon</p><p class="text-sm text-slateMuted">${escapeHtml(k.phone || '')}</p></div>
                    </div>
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-lg bg-blue-50 text-primary flex items-center justify-center shrink-0"><i data-lucide="mail" class="w-5 h-5"></i></div>
                        <div><p class="font-semibold text-sm text-slateDark">Email</p><p class="text-sm text-slateMuted">${escapeHtml(k.email || '')}</p></div>
                    </div>
                </div>
                <form class="space-y-4" onsubmit="event.preventDefault(); showToast('Pesan berhasil dikirim!'); this.reset();">
                    <div>
                        <label class="block text-xs font-semibold text-slateDark mb-1">Nama Lengkap</label>
                        <input type="text" class="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors text-sm" placeholder="Masukkan nama" required>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slateDark mb-1">Pesan</label>
                        <textarea rows="3" class="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors text-sm resize-none" placeholder="Tuliskan pertanyaan Anda..." required></textarea>
                    </div>
                    <button type="submit" class="w-full px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primaryHover transition-colors shadow-soft">Kirim Pesan</button>
                </form>
            </div>
        </div>
    </section>`;
}
