// Definisi field per section "sederhana" (profil, program, pengajar, prestasi,
// ekskul, galeri, testimoni, faq, kontak) — dipakai sectionEditor.js untuk
// merender form & memparse hasil submit-nya secara generik, tanpa perlu file
// terpisah nyaris identik untuk tiap section.

const COLOR_OPTIONS = ['primary', 'indigo', 'emerald', 'amber', 'rose', 'sky', 'orange', 'red', 'blue'];

export const SECTION_CONFIGS = {
  profil: {
    title: 'Profil Sekolah',
    dbKey: 'profil',
    type: 'object',
    fields: [
      { name: 'eyebrow', label: 'Label kecil (eyebrow)', type: 'text' },
      { name: 'title', label: 'Judul section', type: 'text' },
      { name: 'desc', label: 'Deskripsi singkat', type: 'textarea' },
      { name: 'visi', label: 'Visi', type: 'textarea' },
    ],
    listField: { key: 'misi', label: 'Misi (poin-poin)', itemLabel: 'Poin misi' },
  },

  program: {
    title: 'Program & Kurikulum',
    headerKey: 'programHeader',
    itemsKey: 'program',
    headerFields: [
      { name: 'title', label: 'Judul section', type: 'text' },
      { name: 'subtitle', label: 'Subjudul', type: 'text' },
    ],
    itemFields: [
      { name: 'icon', label: 'Ikon (nama Lucide, mis. book-open)', type: 'text' },
      { name: 'title', label: 'Judul program', type: 'text' },
      { name: 'desc', label: 'Deskripsi', type: 'textarea' },
      { name: 'color', label: 'Warna', type: 'select', options: COLOR_OPTIONS },
    ],
    itemLabel: 'Program',
  },

  pengajar: {
    title: 'Tenaga Pendidik',
    headerKey: 'guruHeader',
    itemsKey: 'guru',
    headerFields: [
      { name: 'titlePrefix', label: 'Judul (awal)', type: 'text' },
      { name: 'titleHighlight', label: 'Judul (kata disorot)', type: 'text' },
      { name: 'subtitle', label: 'Subjudul', type: 'text' },
    ],
    itemFields: [
      { name: 'name', label: 'Nama', type: 'text' },
      { name: 'role', label: 'Jabatan / mengajar', type: 'text' },
      { name: 'photo', label: 'URL Foto', type: 'image' },
    ],
    itemLabel: 'Tenaga pendidik',
  },

  prestasi: {
    title: 'Prestasi Siswa',
    headerKey: 'prestasiHeader',
    itemsKey: 'prestasi',
    headerFields: [
      { name: 'titlePrefix', label: 'Judul (awal)', type: 'text' },
      { name: 'titleHighlight', label: 'Judul (kata disorot)', type: 'text' },
      { name: 'subtitle', label: 'Subjudul', type: 'text' },
    ],
    itemFields: [
      { name: 'title', label: 'Nama prestasi', type: 'text' },
      { name: 'photo', label: 'URL Foto', type: 'image' },
    ],
    itemLabel: 'Prestasi',
  },

  ekskul: {
    title: 'Ekstrakurikuler',
    headerKey: 'ekskulHeader',
    itemsKey: 'ekskul',
    headerFields: [
      { name: 'title', label: 'Judul section', type: 'text' },
      { name: 'subtitle', label: 'Subjudul', type: 'text' },
    ],
    itemFields: [
      { name: 'name', label: 'Nama ekskul', type: 'text' },
      { name: 'icon', label: 'Ikon (nama Lucide, mis. star)', type: 'text' },
      { name: 'color', label: 'Warna', type: 'select', options: COLOR_OPTIONS },
    ],
    itemLabel: 'Ekskul',
  },

  galeri: {
    title: 'Galeri Kegiatan',
    headerKey: 'galeriHeader',
    itemsKey: 'galeri',
    headerFields: [{ name: 'title', label: 'Judul section', type: 'text' }],
    itemFields: [
      { name: 'image', label: 'URL Foto', type: 'image' },
      { name: 'caption', label: 'Keterangan foto', type: 'text' },
    ],
    itemLabel: 'Foto',
  },

  testimoni: {
    title: 'Kata Wali Murid',
    headerKey: 'testimoniHeader',
    itemsKey: 'testimoni',
    headerFields: [{ name: 'title', label: 'Judul section', type: 'text' }],
    itemFields: [
      { name: 'name', label: 'Nama', type: 'text' },
      { name: 'role', label: 'Keterangan (mis. Wali murid kelas 3)', type: 'text' },
      { name: 'quote', label: 'Isi testimoni', type: 'textarea' },
      { name: 'photo', label: 'URL Foto', type: 'image' },
    ],
    itemLabel: 'Testimoni',
  },

  faq: {
    title: 'Pertanyaan Umum (FAQ)',
    itemsKey: 'faq',
    itemFields: [
      { name: 'q', label: 'Pertanyaan', type: 'text' },
      { name: 'a', label: 'Jawaban', type: 'textarea' },
    ],
    itemLabel: 'Pertanyaan',
  },

  kontak: {
    title: 'Kontak',
    dbKey: 'kontak',
    type: 'object',
    fields: [
      { name: 'address', label: 'Alamat', type: 'textarea' },
      { name: 'phone', label: 'Telepon', type: 'text' },
      { name: 'email', label: 'Email', type: 'text' },
    ],
  },
};
