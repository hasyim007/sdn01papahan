import { escapeHtml, paragraphsHtml } from '../lib/html.js';
import {
  buildProfilHtml, buildProgramHtml, buildPengajarHtml, buildPrestasiHtml,
  buildEkskulHtml, buildGaleriHtml, buildTestimoniHtml, buildFaqHtml,
} from './sections.js';
import { buildBeritaListBody } from './berita.js';
import { buildCustomSectionMarkup } from './customSection.js';

function heroImages(db) {
  const images = ((db.hero && db.hero.images) || []).filter((src) => String(src || '').trim());
  return images.length ? images : ['https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&q=80&w=1000&h=800'];
}

export function buildHeroHtml(db) {
  const h = db.hero || {};
  const images = heroImages(db);
  const count = images.length;
  const track = images.map((src) => `<img src="${escapeHtml(src)}" alt="Kegiatan Belajar" class="h-full object-cover shrink-0" style="width:${(100 / count).toFixed(4)}%">`).join('');
  const dots = count > 1 ? images.map((_, i) => `<button type="button" data-hero-dot="${i}" aria-label="Ke gambar ${i + 1}" class="hero-carousel-dot h-1.5 rounded-full transition-all ${i === 0 ? 'bg-white w-5' : 'bg-white/60 w-1.5'}"></button>`).join('') : '';
  const stats = (h.stats || []).map((s) => `
        <div class="group relative overflow-hidden rounded-2xl border border-borderLight bg-white p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glass">
            <span class="pointer-events-none absolute -top-6 -right-6 w-16 h-16 rounded-full bg-primary/10 transition-transform duration-300 group-hover:scale-110"></span>
            <span class="pointer-events-none absolute -top-6 -right-6 w-16 h-16 rounded-full border border-primary/20"></span>
            <p class="relative text-3xl font-bold text-slateDark mb-1">${escapeHtml(s.value)}</p>
            <p class="relative text-sm text-slateMuted">${escapeHtml(s.label)}</p>
        </div>`).join('');

  return `
    <section id="beranda" class="relative -mt-20 pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div class="absolute top-0 right-0 -mr-20 -mt-20 w-[600px] h-[600px] bg-blue-50 rounded-full blur-3xl opacity-50 -z-10"></div>
        <div class="absolute bottom-0 left-0 -ml-20 -mb-20 w-[400px] h-[400px] bg-slate-100 rounded-full blur-3xl opacity-50 -z-10"></div>
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
                <div class="max-w-2xl">
                    <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-primary text-sm font-semibold mb-6">
                        <span class="relative flex h-2 w-2">
                          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                          <span class="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                        </span>
                        <span>${escapeHtml(h.badge || '')}</span>
                    </div>
                    <h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slateDark tracking-tight mb-6 leading-[1.1]">
                        ${escapeHtml(h.headlinePrefix || '')} <span class="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">${escapeHtml(h.headlineHighlight || '')}</span>
                    </h1>
                    <p class="text-lg text-slateMuted mb-8 leading-relaxed max-w-lg">${escapeHtml(h.subtitle || '')}</p>
                    <div class="flex flex-col sm:flex-row gap-4">
                        <a href="/profil" class="inline-flex justify-center items-center gap-2 px-6 py-3.5 border border-transparent text-base font-semibold rounded-xl text-white bg-primary hover:bg-primaryHover shadow-soft transition-all hover:-translate-y-0.5">
                            <span>${escapeHtml(h.ctaPrimary || '')}</span> <i data-lucide="arrow-right" class="w-5 h-5"></i>
                        </a>
                        <a href="/program" class="inline-flex justify-center items-center gap-2 px-6 py-3.5 border border-slate-200 text-base font-semibold rounded-xl text-slateDark bg-white hover:bg-slate-50 transition-colors">
                            <span>${escapeHtml(h.ctaSecondary || '')}</span>
                        </a>
                    </div>
                    <div class="mt-12 grid grid-cols-3 gap-3 sm:gap-4">${stats}</div>
                </div>
                <div class="relative lg:ml-auto">
                    <div class="relative rounded-[2rem] p-4 glass-darker shadow-xl">
                        <div class="relative rounded-[1.5rem] overflow-hidden w-full h-[400px] lg:h-[500px] bg-slate-100" id="hero-carousel">
                            <div id="hero-carousel-track" class="flex h-full transition-transform duration-700 ease-in-out" style="width:${(count * 100)}%">${track}</div>
                            <div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10" id="hero-carousel-dots">${dots}</div>
                        </div>
                        <div class="absolute -bottom-6 -left-6 glass-darker p-4 rounded-2xl shadow-lg flex items-center gap-4 animate-[bounce_4s_infinite]">
                            <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600"><i data-lucide="award" class="w-6 h-6"></i></div>
                            <div><p class="text-sm font-bold text-slateDark">${escapeHtml(h.badge1Title || '')}</p><p class="text-xs text-slateMuted">${escapeHtml(h.badge1Subtitle || '')}</p></div>
                        </div>
                        <div class="absolute top-10 -right-6 glass-darker p-3 rounded-2xl shadow-lg flex items-center gap-3 animate-[bounce_5s_infinite] cursor-pointer select-none" id="hero-badge2" title="Lihat gambar berikutnya">
                            <div class="flex -space-x-2" id="hero-badge2-thumbs"></div>
                            <div class="pr-2"><p class="text-sm font-bold text-slateDark">${escapeHtml(h.badge2Value || '')}</p><p class="text-xs text-slateMuted">${escapeHtml(h.badge2Label || '')}</p></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>`;
}

export function buildSambutanHtml(db) {
  const s = db.sambutan || {};
  const paragraphs = (s.paragraphs || []).map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  return `
    <section id="sambutan" class="py-20 bg-slate-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="glass-darker rounded-[2rem] shadow-glass p-8 lg:p-12">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
                    <div class="relative max-w-md mx-auto lg:max-w-none">
                        <div class="absolute -top-4 -left-4 w-full h-full border-4 border-primary rounded-[1.5rem] -z-0"></div>
                        <img src="${escapeHtml(s.photo || '')}" alt="Kepala Sekolah" class="relative z-10 w-full h-[340px] lg:h-[420px] object-cover rounded-[1.5rem] shadow-lg">
                    </div>
                    <div>
                        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-primary text-sm font-semibold mb-6">
                            <i data-lucide="pen-line" class="w-4 h-4"></i> <span>${escapeHtml(s.badge || '')}</span>
                        </div>
                        <h3 class="text-3xl sm:text-4xl font-extrabold text-slateDark mb-6 leading-tight">
                            <span>${escapeHtml(s.titlePrefix || '')}</span><br>
                            <span class="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">${escapeHtml(s.titleHighlight || '')}</span>
                        </h3>
                        <div class="w-16 h-1 bg-primary rounded-full mb-6"></div>
                        <div class="space-y-4 text-slateMuted leading-relaxed mb-6">${paragraphs}</div>
                        <div class="pt-6 border-t border-borderLight">
                            <p class="font-bold text-primary text-lg">${escapeHtml(s.name || '')}</p>
                            <p class="text-xs font-semibold text-slateMuted uppercase tracking-wide">${escapeHtml(s.role || '')}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>`;
}

// Script carousel Hero — auto-geser tiap 4 detik, dot bisa diklik, badge "Tingkat Kelulusan"
// diklik untuk lompat ke gambar berikutnya. Dibaca dari DOM (bukan DB) supaya lepas dari data.
export const HERO_CAROUSEL_SCRIPT = `
<script>
(function () {
    var track = document.getElementById('hero-carousel-track');
    if (!track) return;
    var images = Array.from(track.querySelectorAll('img')).map(function (img) { return img.src; });
    var count = images.length;
    var index = 0;
    var timer = null;

    function update() {
        track.style.transform = 'translateX(-' + (index * (100 / count)) + '%)';
        document.querySelectorAll('.hero-carousel-dot').forEach(function (d, i) {
            d.className = 'hero-carousel-dot h-1.5 rounded-full transition-all ' + (i === index ? 'bg-white w-5' : 'bg-white/60 w-1.5');
        });
        var thumbsWrap = document.getElementById('hero-badge2-thumbs');
        if (thumbsWrap && count > 1) {
            var upcomingCount = Math.min(3, count);
            var upcoming = [];
            for (var i = 1; i <= upcomingCount; i++) upcoming.push(images[(index + i) % count]);
            thumbsWrap.innerHTML = upcoming.map(function (src) { return '<img class="w-8 h-8 border-2 border-white rounded-full object-cover" src="' + src + '" alt="Gambar berikutnya">'; }).join('');
        }
    }
    function goTo(i) {
        if (count <= 1) return;
        index = ((i % count) + count) % count;
        update();
        if (timer) clearInterval(timer);
        timer = setInterval(function () { index = (index + 1) % count; update(); }, 4000);
    }
    document.querySelectorAll('.hero-carousel-dot').forEach(function (d) {
        d.addEventListener('click', function () { goTo(parseInt(d.getAttribute('data-hero-dot'), 10)); });
    });
    var badge2 = document.getElementById('hero-badge2');
    if (badge2) badge2.addEventListener('click', function () { goTo(index + 1); });
    if (count > 1) timer = setInterval(function () { index = (index + 1) % count; update(); }, 4000);
    update();
})();
</script>`;

// Builder per key pageOrder (section baku). "beranda" (Hero) selalu dipasang terpisah
// karena locked & selalu pertama — tidak lewat map ini.
const SECTION_BUILDERS = {
  sambutan: buildSambutanHtml,
  profil: buildProfilHtml,
  program: buildProgramHtml,
  pengajar: buildPengajarHtml,
  prestasi: buildPrestasiHtml,
  ekskul: buildEkskulHtml,
  berita: buildBeritaListBody,
  galeri: buildGaleriHtml,
  testimoni: buildTestimoniHtml,
  faq: buildFaqHtml,
};

const CUSTOM_PAGE_KEY_PREFIX = 'custom:';
const DEFAULT_ORDER_KEYS = ['beranda', 'sambutan', 'profil', 'program', 'pengajar', 'prestasi', 'ekskul', 'berita', 'galeri', 'testimoni', 'faq'];

// Susun seluruh beranda sesuai DB.pageOrder: urutan & aktif/nonaktif section baku,
// plus halaman kustom disisipkan di posisi yang diatur admin — port dari applyPageOrder().
export function buildHomeBody(db) {
  const customById = {};
  (db.customSections || []).forEach((s) => { customById[s.id] = s; });

  let order = Array.isArray(db.pageOrder) && db.pageOrder.length ? db.pageOrder : DEFAULT_ORDER_KEYS.map((key) => ({ key, active: true }));

  // Jamin section baku yang belum ada di pageOrder (mis. data lama) tetap tampil.
  const seen = new Set(order.map((p) => p.key));
  DEFAULT_ORDER_KEYS.forEach((key) => {
    if (!seen.has(key)) order = [...order, { key, active: true }];
  });
  // Jamin semua halaman kustom yang ada tetap tampil walau belum tercatat di pageOrder.
  Object.keys(customById).forEach((id) => {
    const key = CUSTOM_PAGE_KEY_PREFIX + id;
    if (!seen.has(key)) order = [...order, { key, active: true }];
  });

  const parts = [];
  order.forEach((p) => {
    if (!p || p.active === false) return;
    if (p.key === 'beranda') return; // Hero dipasang manual di bawah, selalu paling awal
    if (p.key.startsWith(CUSTOM_PAGE_KEY_PREFIX)) {
      const section = customById[p.key.slice(CUSTOM_PAGE_KEY_PREFIX.length)];
      if (section && section.active !== false) parts.push(buildCustomSectionMarkup(section));
      return;
    }
    const build = SECTION_BUILDERS[p.key];
    if (build) parts.push(build(db));
  });

  return buildHeroHtml(db) + parts.join('\n');
}
