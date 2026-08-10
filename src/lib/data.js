/**
 * Ambil satu blob JSON site_data dari D1 (sama seperti GET /api/data),
 * lalu jamin field-field yang dipakai halaman SSR selalu ada (default aman)
 * supaya renderer tidak perlu jaga-jaga null-check di mana-mana.
 */
export async function getSiteData(env) {
  const row = await env.DB.prepare('SELECT data, updated_at FROM site_data WHERE id = ?')
    .bind('main')
    .first();

  let db;
  try {
    db = row && row.data ? JSON.parse(row.data) : {};
  } catch (e) {
    db = {};
  }

  db.meta = db.meta || {};
  db.hero = db.hero || {};
  db.footer = db.footer || {};
  db.kontak = db.kontak || {};
  db.profil = db.profil || {};
  db.programHeader = db.programHeader || {};
  db.program = Array.isArray(db.program) ? db.program : [];
  db.guruHeader = db.guruHeader || {};
  db.guru = Array.isArray(db.guru) ? db.guru : [];
  db.prestasiHeader = db.prestasiHeader || {};
  db.prestasi = Array.isArray(db.prestasi) ? db.prestasi : [];
  db.ekskulHeader = db.ekskulHeader || {};
  db.ekskul = Array.isArray(db.ekskul) ? db.ekskul : [];
  db.galeriHeader = db.galeriHeader || {};
  db.galeri = Array.isArray(db.galeri) ? db.galeri : [];
  db.testimoniHeader = db.testimoniHeader || {};
  db.testimoni = Array.isArray(db.testimoni) ? db.testimoni : [];
  db.faq = Array.isArray(db.faq) ? db.faq : [];
  db.beritaHeader = db.beritaHeader || {};
  db.berita = Array.isArray(db.berita) ? db.berita : [];
  db.beritaComments = db.beritaComments && typeof db.beritaComments === 'object' ? db.beritaComments : {};
  db.agendaHeader = db.agendaHeader || {};
  db.agenda = Array.isArray(db.agenda) ? db.agenda : [];
  db.customSections = Array.isArray(db.customSections) ? db.customSections : [];

  return db;
}
