// =========================================================================
// Port persis dari fungsi render section di index.html SPA lama, hanya
// sumber datanya diganti dari `DB` (localStorage) menjadi parameter `data`
// (hasil fetch /api/public/data). Markup & class Tailwind TIDAK diubah.
// =========================================================================

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}
function reInitIcons() { if (window.lucide) window.lucide.createIcons(); }

const COLOR_ICON_BG = {
  primary: 'bg-blue-50', indigo: 'bg-indigo-50', emerald: 'bg-emerald-50',
  amber: 'bg-amber-50', rose: 'bg-rose-50', sky: 'bg-sky-50',
  orange: 'bg-orange-50', red: 'bg-red-50', blue: 'bg-blue-50'
};
const COLOR_ICON_TEXT = {
  primary: 'text-primary', indigo: 'text-indigo-600', emerald: 'text-emerald-600',
  amber: 'text-amber-600', rose: 'text-rose-600', sky: 'text-sky-600',
  orange: 'text-orange-600', red: 'text-red-600', blue: 'text-blue-600'
};
const COLOR_ACCENT_BLOB = {
  primary: 'bg-blue-50', indigo: 'bg-indigo-50', emerald: 'bg-emerald-50',
  amber: 'bg-amber-50', rose: 'bg-rose-50', sky: 'bg-sky-50',
  orange: 'bg-orange-50', red: 'bg-red-50', blue: 'bg-blue-50'
};
const COLOR_HOVER_BORDER = {
  primary: 'hover:border-primary/30', indigo: 'hover:border-indigo-300', emerald: 'hover:border-emerald-300',
  amber: 'hover:border-amber-300', rose: 'hover:border-rose-300', sky: 'hover:border-sky-300',
  orange: 'hover:border-orange-300', red: 'hover:border-red-300', blue: 'hover:border-blue-300'
};

// ---- Nav & brand ----
function renderMetaSection(data) {
  const m = data.meta || {};
  document.title = m.pageTitle || m.schoolName || document.title;
  const logoHtml = (m.logoImage && m.logoImage.trim())
    ? `<img src="${escapeHtml(m.logoImage)}" class="w-full h-full object-cover" alt="Logo">`
    : escapeHtml(m.logoText || 'S1');
  document.querySelectorAll('#brand-logo, #footer-logo').forEach(el => { el.classList.add('overflow-hidden'); el.innerHTML = logoHtml; });
  const brandName = document.getElementById('brand-name'); if (brandName) brandName.textContent = m.schoolName || '';
  const footerBrandName = document.getElementById('footer-brand-name'); if (footerBrandName) footerBrandName.textContent = m.schoolName || '';
  const brandLoc = document.getElementById('brand-location'); if (brandLoc) brandLoc.textContent = m.schoolLocation || '';
  const navCta = document.getElementById('nav-cta-text'); if (navCta) navCta.textContent = m.navCtaText || '';
}

// ---- Hero + carousel ----
let heroCarouselTimer = null;
let heroCarouselIndex = 0;
let __heroImages = [];

function heroCarouselImages() {
  const images = (__heroImages || []).filter(src => String(src || '').trim());
  return images.length ? images : ['https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&q=80&w=1000&h=800'];
}

function renderHeroSection(data) {
  const h = data.hero || {};
  __heroImages = h.images || [];
  const badge = document.getElementById('hero-badge'); if (badge) badge.textContent = h.badge || '';
  const headline = document.getElementById('hero-headline');
  if (headline && headline.firstChild) headline.firstChild.textContent = (h.headlinePrefix || '') + ' ';
  const hl = document.getElementById('hero-headline-highlight'); if (hl) hl.textContent = h.headlineHighlight || '';
  const sub = document.getElementById('hero-subtitle'); if (sub) sub.textContent = h.subtitle || '';
  const ctaP = document.getElementById('hero-cta-primary'); if (ctaP) ctaP.textContent = h.ctaPrimary || '';
  const ctaS = document.getElementById('hero-cta-secondary'); if (ctaS) ctaS.textContent = h.ctaSecondary || '';
  if (document.getElementById('hero-carousel-track')) renderHeroCarousel();
  const b1t = document.getElementById('hero-badge1-title'); if (b1t) b1t.textContent = h.badge1Title || '';
  const b1s = document.getElementById('hero-badge1-subtitle'); if (b1s) b1s.textContent = h.badge1Subtitle || '';
  const b2v = document.getElementById('hero-badge2-value'); if (b2v) b2v.textContent = h.badge2Value || '';
  const b2l = document.getElementById('hero-badge2-label'); if (b2l) b2l.textContent = h.badge2Label || '';
  const statsEl = document.getElementById('hero-stats');
  if (statsEl) statsEl.innerHTML = (h.stats || []).map(s => `
    <div><p class="text-3xl font-bold text-slateDark mb-1">${escapeHtml(s.value)}</p><p class="text-sm text-slateMuted">${escapeHtml(s.label)}</p></div>
  `).join('');
}

function renderHeroCarousel() {
  const images = heroCarouselImages();
  const count = images.length;
  heroCarouselIndex = 0;
  const track = document.getElementById('hero-carousel-track');
  if (track) {
    track.style.width = (count * 100) + '%';
    track.innerHTML = images.map(src => `<img src="${escapeHtml(src)}" alt="Kegiatan Belajar" class="h-full object-cover shrink-0" style="width:${(100 / count).toFixed(4)}%">`).join('');
  }
  const dotsWrap = document.getElementById('hero-carousel-dots');
  if (dotsWrap) {
    dotsWrap.innerHTML = count > 1 ? images.map((_, i) => `<button type="button" onclick="heroCarouselGoTo(${i})" aria-label="Ke gambar ${i + 1}" class="hero-carousel-dot h-1.5 rounded-full transition-all bg-white/60"></button>`).join('') : '';
  }
  if (heroCarouselTimer) clearInterval(heroCarouselTimer);
  if (count > 1) heroCarouselTimer = setInterval(() => { heroCarouselIndex = (heroCarouselIndex + 1) % count; updateHeroCarousel(); }, 4000);
  updateHeroCarousel();
}
function updateHeroCarousel() {
  const images = heroCarouselImages();
  const count = images.length;
  const track = document.getElementById('hero-carousel-track');
  if (track) track.style.transform = `translateX(-${heroCarouselIndex * (100 / count)}%)`;
  document.querySelectorAll('.hero-carousel-dot').forEach((d, i) => {
    d.className = 'hero-carousel-dot h-1.5 rounded-full transition-all ' + (i === heroCarouselIndex ? 'bg-white w-5' : 'bg-white/60 w-1.5');
  });
  const thumbsWrap = document.getElementById('hero-badge2-thumbs');
  if (thumbsWrap) {
    const upcomingCount = Math.min(3, count);
    const upcoming = [];
    for (let i = 1; i <= upcomingCount; i++) upcoming.push(images[(heroCarouselIndex + i) % count]);
    thumbsWrap.innerHTML = upcoming.map(src => `<img class="w-8 h-8 border-2 border-white rounded-full object-cover" src="${escapeHtml(src)}" alt="Gambar berikutnya">`).join('');
  }
}
function heroCarouselGoTo(i) {
  const count = heroCarouselImages().length;
  if (count <= 1) return;
  heroCarouselIndex = ((i % count) + count) % count;
  updateHeroCarousel();
  if (heroCarouselTimer) clearInterval(heroCarouselTimer);
  heroCarouselTimer = setInterval(() => { heroCarouselIndex = (heroCarouselIndex + 1) % count; updateHeroCarousel(); }, 4000);
}
function heroCarouselNext() { heroCarouselGoTo(heroCarouselIndex + 1); }

// ---- Sambutan ----
function renderSambutanSection(data) {
  const s = data.sambutan || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
  set('sambutan-badge', s.badge); set('sambutan-title-prefix', s.titlePrefix); set('sambutan-title-highlight', s.titleHighlight);
  set('sambutan-name', s.name); set('sambutan-role', s.role);
  const photo = document.getElementById('sambutan-photo'); if (photo) photo.src = s.photo || '';
  const paras = document.getElementById('sambutan-paragraphs');
  if (paras) paras.innerHTML = (s.paragraphs || []).map(p => `<p>${escapeHtml(p)}</p>`).join('');
}

// ---- Profil ----
function renderProfilSection(data) {
  const p = data.profil || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
  set('profil-eyebrow', p.eyebrow); set('profil-title', p.title); set('profil-desc', p.desc);
  set('profil-visi', p.visi); set('profil-fasilitas', p.fasilitas);
  const misi = document.getElementById('profil-misi-list');
  if (misi) misi.innerHTML = (p.misi || []).map(m => `<li class="flex gap-2 items-start"><i data-lucide="check-circle-2" class="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5"></i> ${escapeHtml(m)}</li>`).join('');
  reInitIcons();
}

// ---- Program ----
function renderProgramSection(data) {
  const h = data.programHeader || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
  set('program-eyebrow', h.eyebrow); set('program-title', h.title); set('program-subtitle', h.subtitle);
  const grid = document.getElementById('program-grid');
  if (grid) grid.innerHTML = (data.program || []).map(item => {
    const color = item.color || 'primary';
    return `
    <div class="group bg-white rounded-[1.25rem] border border-borderLight p-6 hover:shadow-soft transition-all ${COLOR_HOVER_BORDER[color] || ''} relative overflow-hidden">
      <div class="absolute top-0 right-0 w-24 h-24 ${COLOR_ACCENT_BLOB[color] || 'bg-blue-50'} rounded-bl-[100px] -z-0 transition-transform group-hover:scale-110"></div>
      <div class="relative z-10">
        <i data-lucide="${escapeHtml(item.icon || 'book-open')}" class="w-8 h-8 ${COLOR_ICON_TEXT[color] || 'text-primary'} mb-4"></i>
        <h4 class="text-lg font-bold text-slateDark mb-2">${escapeHtml(item.title)}</h4>
        <p class="text-sm text-slateMuted">${escapeHtml(item.desc)}</p>
      </div>
    </div>`;
  }).join('');
  reInitIcons();
}

// ---- Guru + carousel ----
function renderGuruSection(data) {
  const h = data.guruHeader || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
  set('guru-eyebrow', h.eyebrow); set('guru-title-prefix', h.titlePrefix); set('guru-title-highlight', h.titleHighlight); set('guru-subtitle', h.subtitle);
  const track = document.getElementById('guru-track');
  const dotsWrap = document.getElementById('guru-dots');
  const list = data.guru || [];
  if (track) track.innerHTML = list.map((g, i) => {
    const initial = (g.name || '?').trim().charAt(0).toUpperCase();
    const hasPhoto = g.photo && g.photo.trim();
    const avatar = hasPhoto
      ? `<img src="${escapeHtml(g.photo)}" alt="${escapeHtml(g.name)}" class="w-full h-full object-cover">`
      : `<div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-slateDark to-slate-700"><span class="text-6xl font-extrabold text-white">${escapeHtml(initial)}</span></div>`;
    return `
    <div class="guru-card snap-start shrink-0 w-[230px] sm:w-[250px] inst-card overflow-hidden" data-index="${i}">
      <div class="relative w-full h-52">${avatar}${g.isKepsek ? `<div class="absolute top-3 right-3 w-7 h-7 bg-primary rounded-full flex items-center justify-center shadow"><i data-lucide="star" class="w-3.5 h-3.5 text-white fill-current"></i></div>` : ''}</div>
      <div class="p-5">
        <h4 class="font-bold text-slateDark leading-snug">${escapeHtml(g.name)}</h4>
        <p class="text-sm text-primary font-medium mb-3">${escapeHtml(g.role)}</p>
        <div class="space-y-1.5 text-xs text-slateMuted border-t border-borderLight pt-3">
          ${g.experience ? `<div class="flex items-center gap-1.5"><i data-lucide="briefcase" class="w-3.5 h-3.5 text-primary shrink-0"></i> ${escapeHtml(g.experience)}</div>` : ''}
          ${g.education ? `<div class="flex items-center gap-1.5"><i data-lucide="graduation-cap" class="w-3.5 h-3.5 text-primary shrink-0"></i> ${escapeHtml(g.education)}</div>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
  if (dotsWrap) dotsWrap.innerHTML = list.map((_, i) => `<button class="guru-dot h-2 rounded-full transition-all ${i === 0 ? 'bg-primary w-6' : 'bg-slate-200 w-2'}" onclick="scrollGuruToIndex(${i})" aria-label="Ke guru ${i + 1}"></button>`).join('');
  reInitIcons();
}
function scrollGuruCarousel(direction) {
  const track = document.getElementById('guru-track'); const card = track && track.querySelector('.guru-card'); if (!card) return;
  const cardWidth = card.getBoundingClientRect().width + 24;
  track.scrollBy({ left: direction * cardWidth, behavior: 'smooth' });
}
function scrollGuruToIndex(i) {
  const track = document.getElementById('guru-track'); const card = track && track.querySelectorAll('.guru-card')[i];
  if (card) track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
}
let guruScrollTimeout = null;
function handleGuruScroll() {
  clearTimeout(guruScrollTimeout);
  guruScrollTimeout = setTimeout(() => {
    const track = document.getElementById('guru-track'); if (!track) return;
    const cards = Array.from(track.querySelectorAll('.guru-card')); if (!cards.length) return;
    let closest = 0, minDist = Infinity;
    cards.forEach((c, i) => { const dist = Math.abs((c.offsetLeft - track.offsetLeft) - track.scrollLeft); if (dist < minDist) { minDist = dist; closest = i; } });
    document.querySelectorAll('.guru-dot').forEach((d, i) => {
      const active = i === closest;
      d.classList.toggle('bg-primary', active); d.classList.toggle('w-6', active);
      d.classList.toggle('bg-slate-200', !active); d.classList.toggle('w-2', !active);
    });
  }, 100);
}

// ---- Prestasi + Ekskul + carousel ----
function renderPrestasiEkskulSection(data) {
  const h = data.prestasiHeader || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
  set('prestasi-eyebrow', h.eyebrow); set('prestasi-title-prefix', h.titlePrefix); set('prestasi-title-highlight', h.titleHighlight);
  set('prestasi-title-light', h.titleLight); set('prestasi-subtitle', h.subtitle);
  const track = document.getElementById('prestasi-track');
  const dotsWrap = document.getElementById('prestasi-dots');
  const list = Array.isArray(data.prestasi) ? data.prestasi : [];
  if (track) track.innerHTML = list.map((p, i) => {
    const hasPhoto = p.photo && String(p.photo).trim();
    const photo = hasPhoto
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
      <h4 class="font-bold text-slateDark leading-snug">${escapeHtml(p.title)}</h4>
      ${p.studentName ? `<p class="text-xs text-slateMuted mt-1">${escapeHtml(p.studentName)}</p>` : ''}
    </div>`;
  }).join('');
  if (dotsWrap) dotsWrap.innerHTML = list.map((_, i) => `<button class="prestasi-dot h-2 rounded-full transition-all ${i === 0 ? 'bg-primary w-6' : 'bg-slate-200 w-2'}" onclick="scrollPrestasiToIndex(${i})" aria-label="Ke prestasi ${i + 1}"></button>`).join('');

  const eh = data.ekskulHeader || {};
  set('ekskul-title', eh.title); set('ekskul-subtitle', eh.subtitle);
  const ekList = document.getElementById('ekskul-list');
  if (ekList) ekList.innerHTML = (data.ekskul || []).map(e => `
    <div class="inst-card p-4 flex items-center gap-4">
      <div class="w-10 h-10 ${COLOR_ICON_BG[e.color] || 'bg-orange-50'} ${COLOR_ICON_TEXT[e.color] || 'text-orange-600'} rounded-lg flex items-center justify-center shrink-0"><i data-lucide="${escapeHtml(e.icon || 'star')}" class="w-5 h-5"></i></div>
      <div><h4 class="font-semibold text-slateDark text-sm">${escapeHtml(e.name)}</h4><p class="text-xs text-slateMuted">${escapeHtml(e.status)}</p></div>
    </div>`).join('');
  reInitIcons();
}
function scrollPrestasiCarousel(direction) {
  const track = document.getElementById('prestasi-track'); const card = track && track.querySelector('.prestasi-card'); if (!card) return;
  const cardWidth = card.getBoundingClientRect().width + 20;
  track.scrollBy({ left: direction * cardWidth, behavior: 'smooth' });
}
function scrollPrestasiToIndex(i) {
  const track = document.getElementById('prestasi-track'); const card = track && track.querySelectorAll('.prestasi-card')[i];
  if (card) track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
}
let prestasiScrollTimeout = null;
function handlePrestasiScroll() {
  clearTimeout(prestasiScrollTimeout);
  prestasiScrollTimeout = setTimeout(() => {
    const track = document.getElementById('prestasi-track'); if (!track) return;
    const cards = Array.from(track.querySelectorAll('.prestasi-card')); if (!cards.length) return;
    let closest = 0, minDist = Infinity;
    cards.forEach((c, i) => { const dist = Math.abs((c.offsetLeft - track.offsetLeft) - track.scrollLeft); if (dist < minDist) { minDist = dist; closest = i; } });
    document.querySelectorAll('.prestasi-dot').forEach((d, i) => {
      const active = i === closest;
      d.classList.toggle('bg-primary', active); d.classList.toggle('w-6', active);
      d.classList.toggle('bg-slate-200', !active); d.classList.toggle('w-2', !active);
    });
  }, 100);
}

// ---- Berita + Agenda (cuplikan landing; daftar lengkap dirender Worker di /berita) ----
function renderBeritaAgendaSection(data) {
  const bh = data.beritaHeader || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
  set('berita-eyebrow', bh.eyebrow); set('berita-title-prefix', bh.titlePrefix); set('berita-title-highlight', bh.titleHighlight);
  set('berita-title-light', bh.titleLight); set('berita-subtitle', bh.subtitle);
  const list = document.getElementById('berita-list');
  if (list) list.innerHTML = (data.berita || []).slice(0, 6).map(b => `
    <a href="/berita/${escapeHtml(b.slug)}" class="inst-card overflow-hidden group cursor-pointer block">
      <div class="h-44 relative bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center overflow-hidden">
        ${b.coverImage ? `<img src="${escapeHtml(b.coverImage)}" class="w-full h-full object-cover" alt="${escapeHtml(b.title)}">` : `<span class="text-white/10 font-extrabold text-6xl select-none tracking-tight">Berita</span>`}
        <span class="absolute top-4 left-4 px-3 py-1 rounded-full bg-indigo-500/90 text-white text-xs font-semibold">${escapeHtml(b.category)}</span>
      </div>
      <div class="p-5">
        <div class="flex items-center gap-4 text-xs text-slateMuted mb-3">
          <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> ${escapeHtml(b.date)}</span>
          <span class="flex items-center gap-1"><i data-lucide="user" class="w-3.5 h-3.5"></i> ${escapeHtml(b.author || 'Admin')}</span>
        </div>
        <h3 class="font-bold text-slateDark mb-2 group-hover:text-primary transition-colors">${escapeHtml(b.title)}</h3>
        <p class="text-sm text-slateMuted mb-4 line-clamp-2">${escapeHtml(b.excerpt)}</p>
        <span class="text-sm font-semibold text-primary inline-flex items-center gap-1">Baca Selengkapnya <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i></span>
      </div>
    </a>`).join('');
  const agTitle = document.getElementById('agenda-title'); if (agTitle) agTitle.textContent = (data.agendaHeader && data.agendaHeader.title) || '';
  const agList = document.getElementById('agenda-list');
  if (agList) agList.innerHTML = (data.agenda || []).map(a => `
    <div class="inst-card p-4 flex gap-4 items-start">
      <div class="w-14 h-14 shrink-0 bg-blue-50 rounded-xl flex flex-col items-center justify-center text-primary">
        <span class="text-xs font-semibold uppercase">${escapeHtml(a.month)}</span><span class="text-lg font-bold leading-none mt-1">${escapeHtml(a.day)}</span>
      </div>
      <div>
        <h4 class="font-bold text-slateDark text-sm">${escapeHtml(a.title)}</h4>
        <p class="text-xs text-slateMuted mt-1"><i data-lucide="clock" class="w-3 h-3 inline"></i> ${escapeHtml(a.time)}</p>
        <p class="text-xs text-slateMuted"><i data-lucide="map-pin" class="w-3 h-3 inline"></i> ${escapeHtml(a.location)}</p>
      </div>
    </div>`).join('');
  reInitIcons();
}

// ---- Galeri + Testimoni + carousel ----
function renderGaleriTestimoniSection(data) {
  const gTitle = document.getElementById('galeri-title'); if (gTitle) gTitle.textContent = (data.galeriHeader && data.galeriHeader.title) || '';
  const scrollWrap = document.getElementById('galeri-scroll');
  const dotsWrap = document.getElementById('galeri-dots');
  const list = Array.isArray(data.galeri) ? data.galeri : [];
  if (scrollWrap) scrollWrap.innerHTML = list.map((g, i) => `
    <div class="galeri-card snap-start shrink-0 w-64 h-64 rounded-2xl overflow-hidden relative group" data-index="${i}">
      <img src="${escapeHtml(g.image)}" class="w-full h-full object-cover transition duration-500 group-hover:scale-110" alt="${escapeHtml(g.caption)}">
      <div class="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-end p-4"><p class="text-sm font-medium">${escapeHtml(g.caption)}</p></div>
    </div>`).join('');
  if (dotsWrap) dotsWrap.innerHTML = list.map((_, i) => `<button class="galeri-dot h-2 rounded-full transition-all ${i === 0 ? 'bg-primary w-6' : 'bg-slate-600 w-2'}" onclick="scrollGaleriToIndex(${i})" aria-label="Ke foto ${i + 1}"></button>`).join('');
  renderTestimoniSection(data);
}
function scrollGaleriCarousel(direction) {
  const track = document.getElementById('galeri-scroll'); const card = track && track.querySelector('.galeri-card'); if (!card) return;
  const cardWidth = card.getBoundingClientRect().width + 16;
  track.scrollBy({ left: direction * cardWidth, behavior: 'smooth' });
}
function scrollGaleriToIndex(i) {
  const track = document.getElementById('galeri-scroll'); const card = track && track.querySelectorAll('.galeri-card')[i];
  if (card) track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
}
let galeriScrollTimeout = null;
function handleGaleriScroll() {
  clearTimeout(galeriScrollTimeout);
  galeriScrollTimeout = setTimeout(() => {
    const track = document.getElementById('galeri-scroll'); if (!track) return;
    const cards = Array.from(track.querySelectorAll('.galeri-card')); if (!cards.length) return;
    let closest = 0, minDist = Infinity;
    cards.forEach((c, i) => { const dist = Math.abs((c.offsetLeft - track.offsetLeft) - track.scrollLeft); if (dist < minDist) { minDist = dist; closest = i; } });
    document.querySelectorAll('.galeri-dot').forEach((d, i) => {
      const active = i === closest;
      d.classList.toggle('bg-primary', active); d.classList.toggle('w-6', active);
      d.classList.toggle('bg-slate-600', !active); d.classList.toggle('w-2', !active);
    });
  }, 100);
}
function renderTestimoniSection(data) {
  const tTitle = document.getElementById('testimoni-title'); if (tTitle) tTitle.textContent = (data.testimoniHeader && data.testimoniHeader.title) || '';
  const track = document.getElementById('testimoni-track');
  const dotsWrap = document.getElementById('testimoni-dots');
  const list = Array.isArray(data.testimoni) ? data.testimoni : [];
  if (track) track.innerHTML = list.map((t, i) => {
    const hasPhoto = t.photo && String(t.photo).trim();
    const avatar = hasPhoto
      ? `<img src="${escapeHtml(t.photo)}" alt="${escapeHtml(t.name)}" class="w-12 h-12 rounded-full object-cover">`
      : `<div class="w-12 h-12 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-sm shrink-0">${escapeHtml(String(t.name || '?').trim().charAt(0).toUpperCase())}</div>`;
    return `
    <div class="testimoni-card snap-start shrink-0 w-[320px] sm:w-[380px] glass-darker !bg-slate-800/50 !border-slate-700 p-8 rounded-2xl" data-index="${i}">
      <i data-lucide="quote" class="w-8 h-8 text-blue-400 mb-4 opacity-50"></i>
      <p class="text-lg text-slate-300 italic mb-6 leading-relaxed">"${escapeHtml(t.quote)}"</p>
      <div class="flex items-center gap-4">${avatar}<div><h4 class="font-bold text-white text-sm">${escapeHtml(t.name)}</h4><p class="text-xs text-slate-400">${escapeHtml(t.role)}</p></div></div>
    </div>`;
  }).join('');
  if (dotsWrap) dotsWrap.innerHTML = list.map((_, i) => `<button class="testimoni-dot h-2 rounded-full transition-all ${i === 0 ? 'bg-primary w-6' : 'bg-slate-600 w-2'}" onclick="scrollTestimoniToIndex(${i})" aria-label="Ke testimoni ${i + 1}"></button>`).join('');
  reInitIcons();
}
function scrollTestimoniCarousel(direction) {
  const track = document.getElementById('testimoni-track'); const card = track && track.querySelector('.testimoni-card'); if (!card) return;
  const cardWidth = card.getBoundingClientRect().width + 24;
  track.scrollBy({ left: direction * cardWidth, behavior: 'smooth' });
}
function scrollTestimoniToIndex(i) {
  const track = document.getElementById('testimoni-track'); const card = track && track.querySelectorAll('.testimoni-card')[i];
  if (card) track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
}
let testimoniScrollTimeout = null;
function handleTestimoniScroll() {
  clearTimeout(testimoniScrollTimeout);
  testimoniScrollTimeout = setTimeout(() => {
    const track = document.getElementById('testimoni-track'); if (!track) return;
    const cards = Array.from(track.querySelectorAll('.testimoni-card')); if (!cards.length) return;
    let closest = 0, minDist = Infinity;
    cards.forEach((c, i) => { const dist = Math.abs((c.offsetLeft - track.offsetLeft) - track.scrollLeft); if (dist < minDist) { minDist = dist; closest = i; } });
    document.querySelectorAll('.testimoni-dot').forEach((d, i) => {
      const active = i === closest;
      d.classList.toggle('bg-primary', active); d.classList.toggle('w-6', active);
      d.classList.toggle('bg-slate-600', !active); d.classList.toggle('w-2', !active);
    });
  }, 100);
}

// ---- FAQ ----
function toggleFaq(btn) {
  const content = btn.nextElementSibling;
  content.classList.toggle('hidden');
  const icon = btn.querySelector('[data-lucide="chevron-down"]');
  if (icon) icon.classList.toggle('rotate-180');
}
function renderFaqSection(data) {
  const list = document.getElementById('faq-list');
  if (list) list.innerHTML = (data.faq || []).map(f => `
    <div class="inst-card overflow-hidden">
      <button class="w-full px-6 py-4 text-left flex justify-between items-center focus:outline-none" onclick="toggleFaq(this)">
        <span class="font-semibold text-slateDark">${escapeHtml(f.q)}</span>
        <i data-lucide="chevron-down" class="w-5 h-5 text-slateMuted transition-transform duration-300"></i>
      </button>
      <div class="px-6 pb-4 hidden text-slateMuted text-sm">${escapeHtml(f.a)}</div>
    </div>`).join('');
  reInitIcons();
}

// ---- Kontak & Footer ----
function renderKontakFooterSection(data) {
  const k = data.kontak || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
  set('kontak-address', k.address); set('kontak-phone', k.phone); set('kontak-email', k.email);
  const f = data.footer || {};
  set('footer-desc', f.desc); set('footer-copyright', f.copyright);
  const fb = document.getElementById('footer-social-facebook'); if (fb) fb.href = f.socialFacebook || '#';
  const ig = document.getElementById('footer-social-instagram'); if (ig) ig.href = f.socialInstagram || '#';
  const yt = document.getElementById('footer-social-youtube'); if (yt) yt.href = f.socialYoutube || '#';
}

// ---- Halaman/Section kustom (tampil di landing, disisipkan sebelum footer) ----
function csBgClass(bg) { return bg === 'dark' ? 'bg-slate-900 text-white' : (bg === 'gray' ? 'bg-slate-50' : 'bg-white'); }
function csMutedClass(bg) { return bg === 'dark' ? 'text-slate-300' : 'text-slateMuted'; }
function csEyebrowClass(bg) { return bg === 'dark' ? 'bg-white/10 border-white/10 text-white' : 'bg-blue-50 border-blue-100 text-primary'; }
function csCardClass(bg) { return bg === 'dark' ? 'bg-white/5 border border-white/10' : 'bg-white border border-borderLight shadow-soft'; }

function buildCustomSectionMarkup(s) {
  const bgSection = csBgClass(s.bgStyle);
  const muted = csMutedClass(s.bgStyle);
  const items = Array.isArray(s.items) ? s.items : [];
  const eyebrowHtml = (s.eyebrow && s.eyebrow.trim())
    ? `<span class="inline-flex items-center px-3 py-1.5 rounded-full border ${csEyebrowClass(s.bgStyle)} text-xs font-semibold mb-4">${escapeHtml(s.eyebrow)}</span>` : '';

  if (s.type === 'text') {
    const imgCol = `<div>${s.image ? `<img src="${escapeHtml(s.image)}" alt="${escapeHtml(s.title)}" class="rounded-2xl object-cover w-full h-72 lg:h-[420px] shadow-soft">` : ''}</div>`;
    const textCol = `<div>${eyebrowHtml}<h2 class="text-3xl sm:text-4xl font-bold mb-4">${escapeHtml(s.title)}</h2>${s.subtitle ? `<p class="${muted} leading-relaxed whitespace-pre-line mb-6">${escapeHtml(s.subtitle)}</p>` : ''}${(s.ctaLabel && s.ctaLink) ? `<a href="${escapeHtml(s.ctaLink)}" class="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primaryHover transition">${escapeHtml(s.ctaLabel)} <i data-lucide="arrow-right" class="w-4 h-4"></i></a>` : ''}</div>`;
    return `<section id="cs-${s.id}" class="py-20 ${bgSection}"><div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">${s.imagePosition === 'left' ? imgCol + textCol : textCol + imgCol}</div></section>`;
  }
  if (s.type === 'cards') {
    const cols = s.columns === 2 ? 'sm:grid-cols-2' : (s.columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3');
    return `<section id="cs-${s.id}" class="py-20 ${bgSection}"><div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div class="max-w-2xl mx-auto text-center mb-12">${eyebrowHtml}<h2 class="text-3xl sm:text-4xl font-bold mb-4">${escapeHtml(s.title)}</h2>${s.subtitle ? `<p class="${muted}">${escapeHtml(s.subtitle)}</p>` : ''}</div><div class="grid grid-cols-1 ${cols} gap-6">${items.map(it => `<div class="${csCardClass(s.bgStyle)} rounded-2xl p-6">${it.icon ? `<div class="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4"><i data-lucide="${escapeHtml(it.icon)}" class="w-6 h-6"></i></div>` : ''}<h3 class="font-bold mb-2">${escapeHtml(it.title || '')}</h3><p class="text-sm ${muted}">${escapeHtml(it.desc || '')}</p></div>`).join('')}</div></div></section>`;
  }
  if (s.type === 'gallery') {
    return `<section id="cs-${s.id}" class="py-20 ${bgSection}"><div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div class="max-w-2xl mx-auto text-center mb-12">${eyebrowHtml}<h2 class="text-3xl sm:text-4xl font-bold mb-4">${escapeHtml(s.title)}</h2>${s.subtitle ? `<p class="${muted}">${escapeHtml(s.subtitle)}</p>` : ''}</div><div class="grid grid-cols-2 md:grid-cols-3 gap-4">${items.map(it => `<div class="relative rounded-2xl overflow-hidden aspect-square group"><img src="${escapeHtml(it.image || '')}" alt="${escapeHtml(it.caption || '')}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">${it.caption ? `<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3"><p class="text-white text-xs font-medium">${escapeHtml(it.caption)}</p></div>` : ''}</div>`).join('')}</div></div></section>`;
  }
  if (s.type === 'cta') {
    return `<section id="cs-${s.id}" class="py-16 ${bgSection}"><div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8"><div class="rounded-3xl bg-gradient-to-br from-primary to-blue-500 text-white p-10 sm:p-14 text-center shadow-glass">${s.eyebrow ? `<span class="inline-flex items-center px-3 py-1.5 rounded-full border border-white/20 bg-white/10 text-white text-xs font-semibold mb-4">${escapeHtml(s.eyebrow)}</span>` : ''}<h2 class="text-3xl sm:text-4xl font-bold mb-4">${escapeHtml(s.title)}</h2>${s.subtitle ? `<p class="text-blue-50 max-w-xl mx-auto mb-8">${escapeHtml(s.subtitle)}</p>` : ''}${(s.ctaLabel && s.ctaLink) ? `<a href="${escapeHtml(s.ctaLink)}" class="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white text-primary text-sm font-bold hover:bg-blue-50 transition">${escapeHtml(s.ctaLabel)} <i data-lucide="arrow-right" class="w-4 h-4"></i></a>` : ''}</div></div></section>`;
  }
  return '';
}

// Menyisipkan section kustom sebagai elemen sejajar sebelum footer, dan mengisi
// link menu "Lainnya" (desktop) & menu mobile — persis pola versi lama.
function renderCustomSectionsInline(data) {
  const footer = document.getElementById('site-footer');
  document.querySelectorAll('[id^="cs-"]').forEach(el => el.remove());
  const sections = data.customSections || [];
  sections.forEach(s => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildCustomSectionMarkup(s).trim();
    const sectionEl = wrapper.firstElementChild;
    if (sectionEl && footer) footer.parentNode.insertBefore(sectionEl, footer);
  });
  const withMenu = sections.filter(s => s.menuLabel && s.menuLabel.trim());
  const navLinks = document.getElementById('nav-custom-links');
  if (navLinks) navLinks.innerHTML = withMenu.map(s => `<a href="/${escapeHtml(s.slug)}" class="block px-4 py-2 text-sm text-slateMuted hover:bg-slate-50 hover:text-primary">${escapeHtml(s.menuLabel)}</a>`).join('');
  const mobileNavLinks = document.getElementById('mobile-nav-custom-links');
  if (mobileNavLinks) mobileNavLinks.innerHTML = withMenu.map(s => `<a href="/${escapeHtml(s.slug)}" class="block px-3 py-3 rounded-lg text-base font-medium text-slateMuted hover:text-slateDark hover:bg-slate-50">${escapeHtml(s.menuLabel)}</a>`).join('');
  reInitIcons();
}

function showMessage() { showToast('Pesan Anda telah terkirim. Kami akan segera menghubungi Anda.'); }
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

// ---- Mobile menu toggle (dipakai semua halaman) ----
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('mobile-menu-btn');
  const menu = document.getElementById('mobile-menu');
  if (btn && menu) btn.addEventListener('click', () => menu.classList.toggle('hidden'));
});
