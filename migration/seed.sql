-- File ini di-generate otomatis oleh migration/migrate-data.js — jangan diedit manual.

BEGIN TRANSACTION;

INSERT INTO store (key, value) VALUES ('meta', '{"logoText":"S1","logoImage":"","schoolName":"SDN 01 Papahan","schoolLocation":"Kabupaten Karanganyar","pageTitle":"SDN 01 Papahan - Cerdas, Berakhlak, Berprestasi","navCtaText":"Hubungi Kami"}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('hero', '{"badge":"Penerimaan Siswa Baru 2026/2027 Dibuka","headlinePrefix":"Membentuk Generasi","headlineHighlight":"Cerdas & Berkarakter","subtitle":"Sekolah Dasar Negeri 01 Papahan berkomitmen memberikan pendidikan berkualitas dengan lingkungan belajar yang modern, aman, dan inovatif untuk putra-putri Anda.","ctaPrimary":"Kenali Kami Lebih Dekat","ctaSecondary":"Lihat Program","images":["https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&q=80&w=1000&h=800","https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&q=80&w=1000&h=800","https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&q=80&w=1000&h=800"],"stats":[{"value":"24+","label":"Tenaga Pendidik"},{"value":"500+","label":"Siswa Aktif"},{"value":"15+","label":"Ekstrakurikuler"}],"badge1Title":"Akreditasi A","badge1Subtitle":"BAN-S/M","badge2Value":"98%","badge2Label":"Tingkat Kelulusan"}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('sambutan', '{"badge":"Sambutan Kepala Sekolah","titlePrefix":"Selamat Datang di","titleHighlight":"SDN 01 Papahan","paragraphs":["Puji syukur kami panjatkan ke hadirat Allah SWT atas karunia-Nya sehingga website resmi SDN 01 Papahan ini dapat terus hadir menjadi jembatan informasi yang efektif antara sekolah, peserta didik, orang tua murid, dan masyarakat luas.","Kami berkomitmen untuk terus berinovasi dalam memberikan layanan pendidikan terbaik, mencetak generasi unggul yang tidak hanya cerdas secara akademik, namun juga memiliki karakter mulia dan siap menghadapi tantangan masa depan."],"name":"Drs. H. Suyanto, M.Pd","role":"Kepala Sekolah SDN 01 Papahan","photo":"https://i.pravatar.cc/400?img=32"}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('profil', '{"eyebrow":"Profil Sekolah","title":"Membangun Fondasi Masa Depan","desc":"SDN 01 Papahan berdedikasi untuk menciptakan lingkungan yang inklusif, merangsang keingintahuan, dan menanamkan nilai-nilai luhur Pancasila.","visi":"Terwujudnya peserta didik yang religius, cerdas, terampil, berkarakter kebangsaan, dan berwawasan lingkungan.","misi":["Menanamkan keimanan dan ketakwaan.","Melaksanakan PAKEM (Pembelajaran Aktif, Kreatif, Efektif, Menyenangkan)."],"fasilitas":"Dilengkapi dengan ruang kelas nyaman, perpustakaan digital, lab komputer dasar, dan area olahraga yang memadai."}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('programHeader', '{"eyebrow":"Program Kurikulum","title":"Program Unggulan Sekolah","subtitle":"Dirancang untuk mengembangkan potensi akademik maupun non-akademik siswa secara seimbang."}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('program', '[{"icon":"book-open","color":"primary","title":"Kurikulum Merdeka","desc":"Pembelajaran intrakurikuler yang beragam di mana konten akan lebih optimal."},{"icon":"laptop","color":"indigo","title":"Literasi Digital","desc":"Pengenalan teknologi dasar dan etika berinternet sehat sejak usia dini."},{"icon":"leaf","color":"emerald","title":"Sekolah Adiwiyata","desc":"Program pembentukan karakter peduli dan berbudaya lingkungan hidup di sekolah."},{"icon":"heart-handshake","color":"amber","title":"Bina Karakter","desc":"Pembiasaan 5S (Senyum, Salam, Sapa, Sopan, Santun) setiap pagi dan ibadah bersama."}]')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('guruHeader', '{"eyebrow":"Tenaga Pendidik","titlePrefix":"Guru","titleHighlight":"Profesional & Dedikatif","subtitle":"Tenaga pengajar berpengalaman dan berkomitmen dalam mendidik putra-putri Anda."}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('guru', '[{"photo":"","name":"Drs. H. Suyanto, M.Pd","role":"Kepala Sekolah","experience":"20 Tahun Pengalaman","education":"S3 Pendidikan","isKepsek":true},{"photo":"","name":"Siti Aminah, S.Pd","role":"Wali Kelas VI","experience":"15 Tahun Pengalaman","education":"S2 Pendidikan Dasar","isKepsek":false},{"photo":"","name":"Budi Santoso, S.Or","role":"Guru PJOK","experience":"12 Tahun Pengalaman","education":"S1 Keolahragaan","isKepsek":false},{"photo":"","name":"Rina Wati, S.Pd.I","role":"Guru PAI","experience":"10 Tahun Pengalaman","education":"S1 Pendidikan Agama Islam","isKepsek":false}]')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('prestasiHeader', '{"eyebrow":"PRESTASI SISWA","titlePrefix":"Prestasi Siswa","titleHighlight":"Capaian","titleLight":"membanggakan yang telah diraih siswa/i SekolahKu","subtitle":"Capaian membanggakan yang telah diraih siswa/i SekolahKu"}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('prestasi', '[{"photo":"","badge":"PENCAPAIAN","date":"24 Mei 2026","title":"Karanganyar Futsal League","studentName":"Alya Putri"},{"photo":"","badge":"PENCAPAIAN","date":"24 Mei 2026","title":"Karanganyar Futsal League","studentName":"Raka Firmansyah"},{"photo":"","badge":"PENCAPAIAN","date":"30 Mar 2026","title":"Juara II Lomba Cerdas Cermat (LCC)","studentName":"Sinta Nurhaliza"},{"photo":"","badge":"PENCAPAIAN","date":"22 Mar 2026","title":"Medali Emas Olimpiade Matematika","studentName":"Dimas Aditya"}]')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('ekskulHeader', '{"title":"Ekstrakurikuler","subtitle":"Penyaluran bakat & minat siswa"}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('ekskul', '[{"icon":"tent","color":"orange","name":"Pramuka","status":"Wajib (Kelas 3-6)"},{"icon":"music","color":"blue","name":"Seni Tari & Karawitan","status":"Pilihan"},{"icon":"activity","color":"red","name":"Pencak Silat","status":"Pilihan"},{"icon":"book","color":"emerald","name":"BTA (Baca Tulis Al-Qur''an)","status":"Pilihan"}]')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('beritaHeader', '{"eyebrow":"BERITA & ARTIKEL","titlePrefix":"Berita & Artikel","titleHighlight":"Informasi terkini","titleLight":"seputar SekolahKu","subtitle":"Informasi terkini seputar SekolahKu"}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('agendaHeader', '{"title":"Agenda Mendatang"}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('agenda', '[{"month":"Agu","day":"17","title":"Upacara HUT RI ke-81","time":"07:00 - Selesai","location":"Lapangan Sekolah"},{"month":"Sep","day":"05","title":"Rapat Komite Wali Murid","time":"09:00 - 11:00","location":"Aula Sekolah"},{"month":"Okt","day":"12","title":"Penilaian Tengah Semester","time":"Sesuai Jadwal","location":"Ruang Kelas"}]')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('galeriHeader', '{"title":"Galeri Kegiatan"}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('galeri', '[{"image":"https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&q=80&w=400&h=400","caption":"Kegiatan Belajar"},{"image":"https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&q=80&w=400&h=400","caption":"Perpustakaan"},{"image":"https://images.unsplash.com/photo-1606761568499-6d2451b23c66?auto=format&fit=crop&q=80&w=400&h=400","caption":"Olahraga"}]')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('testimoniHeader', '{"title":"Kata Wali Murid"}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('testimoni', '[{"quote":"Menyekolahkan anak di SDN 01 Papahan adalah keputusan yang tepat. Selain fasilitasnya yang memadai, guru-gurunya sangat perhatian terhadap perkembangan karakter anak. Anak saya jadi lebih disiplin dan mandiri.","name":"Bpk. Haryanto","role":"Wali Murid Kelas IV","photo":"https://i.pravatar.cc/150?img=47"}]')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('faq', '[{"q":"Kapan pendaftaran siswa baru dibuka?","a":"Pendaftaran Peserta Didik Baru (PPDB) biasanya dibuka pada bulan Juni setiap tahunnya, mengikuti jadwal resmi dari Dinas Pendidikan Kabupaten Karanganyar."},{"q":"Apa saja syarat pendaftaran kelas 1?","a":"Syarat utama adalah usia minimal 6 tahun pada tanggal 1 Juli tahun berjalan, fotokopi Akte Kelahiran, KK, dan KTP Orang Tua."},{"q":"Apakah ada biaya SPP bulanan?","a":"Sebagai sekolah negeri, SDN 01 Papahan membebaskan biaya SPP bulanan sesuai dengan program Bantuan Operasional Sekolah (BOS) dari pemerintah."}]')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('kontak', '{"address":"Jl. Raya Papahan - Tasikmadu, Papahan, Kec. Tasikmadu, Kabupaten Karanganyar, Jawa Tengah 57722","phone":"(0271) 123456","email":"info@sdn01papahan.sch.id"}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('footer', '{"desc":"Mendidik putra-putri bangsa menjadi generasi yang cerdas, berakhlak mulia, dan siap menghadapi tantangan masa depan.","copyright":"© 2026 SDN 01 Papahan Karanganyar. All rights reserved.","socialFacebook":"#","socialInstagram":"#","socialYoutube":"#"}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO store (key, value) VALUES ('pageOrder', '[{"key":"beranda","label":"Beranda","icon":"flag","locked":true,"active":true},{"key":"sambutan","label":"Sambutan Kepala Sekolah","icon":"pen-line","locked":false,"active":true},{"key":"profil","label":"Profil Sekolah","icon":"building","locked":false,"active":true},{"key":"program","label":"Program Unggulan","icon":"graduation-cap","locked":false,"active":true},{"key":"pengajar","label":"Tenaga Pendidik","icon":"users","locked":false,"active":true},{"key":"prestasi","label":"Prestasi & Ekstrakurikuler","icon":"trophy","locked":false,"active":true},{"key":"berita","label":"Berita & Agenda","icon":"newspaper","locked":false,"active":true},{"key":"galeri","label":"Galeri Kegiatan","icon":"image","locked":false,"active":true},{"key":"testimoni","label":"Testimoni Wali Murid","icon":"quote","locked":false,"active":true},{"key":"faq","label":"FAQ & Kontak","icon":"help-circle","locked":false,"active":true}]')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO berita (id, slug, title, excerpt, content, category, tags, author, cover_image, meta_description, status, publish_at)
  VALUES ('b1', 'kegiatan-bakti-sosial-siswa-sekolahku-ke-panti-asuhan', 'Kegiatan Bakti Sosial Siswa SekolahKu ke Panti Asuhan', 'Siswa SekolahKu mengadakan kegiatan bakti sosial ke panti asuhan sebagai bagian dari program pendidikan karakter.', 'Sebanyak 50 siswa SekolahKu mengadakan kunjungan dan bakti sosial ke Panti Asuhan Harapan Mulia pada Sabtu, 5 September 2026. Kegiatan ini merupakan bagian dari program pendidikan karakter yang rutin dilaksanakan setiap semester.

Dalam kegiatan tersebut, siswa menyalurkan donasi berupa sembako, alat tulis, dan pakaian layak pakai. Selain itu, siswa juga berinteraksi dan bermain bersama anak-anak panti asuhan.

Kegiatan ini diharapkan dapat menumbuhkan rasa empati dan kepedulian sosial sejak dini pada diri siswa, sekaligus menjadi pengalaman berharga di luar kegiatan belajar mengajar di kelas.',
  'Kegiatan', 'kegiatan, bakti-sosial, peduli', 'Admin', '',
  'Siswa SDN 01 Papahan mengadakan bakti sosial ke panti asuhan sebagai bagian dari pendidikan karakter.', 'published',
  '2026-09-06T02:00:00.000Z');

INSERT INTO berita (id, slug, title, excerpt, content, category, tags, author, cover_image, meta_description, status, publish_at)
  VALUES ('b2', 'siswa-sekolahku-raih-medali-emas-olimpiade-sains-nasional', 'Siswa SekolahKu Raih Medali Emas Olimpiade Sains Nasional', 'Alya Putri, siswa kelas VI A, berhasil meraih medali emas dalam ajang Olimpiade Sains Nasional yang diselenggarakan di Jakarta.', 'Alya Putri, siswa kelas VI A, berhasil meraih medali emas dalam ajang Olimpiade Sains Nasional (OSN) yang diselenggarakan di Jakarta pada 18-20 Maret 2026.

Prestasi ini merupakan hasil dari latihan intensif yang dibimbing langsung oleh guru pembina sejak beberapa bulan sebelumnya. Alya bersaing dengan ratusan peserta dari seluruh Indonesia pada bidang studi Sains.

Pihak sekolah menyampaikan rasa bangga dan berharap prestasi ini dapat memotivasi siswa lain untuk terus berprestasi di bidang akademik maupun non-akademik.',
  'Prestasi', 'prestasi, olimpiade, sains', 'Admin', '',
  'Alya Putri, siswa SDN 01 Papahan, meraih medali emas Olimpiade Sains Nasional 2026 di Jakarta.', 'published',
  '2026-03-22T02:00:00.000Z');

INSERT INTO berita (id, slug, title, excerpt, content, category, tags, author, cover_image, meta_description, status, publish_at)
  VALUES ('b3', 'upacara-peringatan-hari-pramuka-ke-65', 'Upacara Peringatan Hari Pramuka ke-65', 'Siswa-siswi SDN 01 Papahan melaksanakan upacara peringatan Hari Pramuka dengan khidmat di lapangan utama sekolah.', 'Siswa-siswi SDN 01 Papahan melaksanakan upacara peringatan Hari Pramuka ke-65 dengan khidmat di lapangan utama sekolah pada Selasa, 12 Agustus 2026.

Upacara diikuti oleh seluruh siswa kelas 3 hingga kelas 6 yang tergabung dalam kegiatan ekstrakurikuler Pramuka, didampingi oleh guru pembina dan Kepala Sekolah selaku pembina upacara.

Dalam sambutannya, Kepala Sekolah mengajak seluruh siswa untuk meneladani nilai-nilai kepramukaan seperti kedisiplinan, kemandirian, dan jiwa kepemimpinan dalam kehidupan sehari-hari.',
  'Kegiatan', 'kegiatan, pramuka, upacara', 'Admin', '',
  'SDN 01 Papahan menggelar upacara peringatan Hari Pramuka ke-65 di lapangan sekolah.', 'published',
  '2026-08-12T02:00:00.000Z');

INSERT INTO berita (id, slug, title, excerpt, content, category, tags, author, cover_image, meta_description, status, publish_at)
  VALUES ('b4', 'jadwal-pengambilan-buku-paket-semester-ganjil', 'Jadwal Pengambilan Buku Paket Semester Ganjil', 'Diberitahukan kepada seluruh wali murid kelas 1-6 untuk dapat mengambil buku paket pembelajaran di perpustakaan.', 'Diberitahukan kepada seluruh wali murid kelas 1-6 bahwa pengambilan buku paket pembelajaran untuk Semester Ganjil Tahun Ajaran 2026/2027 dapat dilakukan mulai tanggal 5-9 Agustus 2026 di perpustakaan sekolah.

Wali murid diharapkan membawa kartu identitas siswa saat pengambilan buku. Buku paket wajib dijaga dengan baik karena akan digunakan selama satu semester dan dikembalikan dalam kondisi baik pada akhir semester.

Untuk informasi lebih lanjut, wali murid dapat menghubungi wali kelas masing-masing atau bagian tata usaha sekolah.',
  'Pengumuman', 'pengumuman, buku-paket', 'Admin', '',
  'Jadwal pengambilan buku paket Semester Ganjil TA 2026/2027 di SDN 01 Papahan.', 'published',
  '2026-08-05T02:00:00.000Z');

INSERT INTO custom_sections
  (id, slug, type, eyebrow, title, subtitle, bg_style, active, menu_label, columns, items_json, image, image_position, cta_label, cta_link, sort_order)
  VALUES ('cs_demo_fasilitas', 'fasilitas', 'cards', 'Sarana & Prasarana', 'Fasilitas Sekolah',
  'Lingkungan belajar yang nyaman, lengkap, dan mendukung tumbuh kembang siswa.', 'gray', 1, 'Fasilitas',
  3, '[{"icon":"book-open","title":"Perpustakaan","desc":"Koleksi buku pelajaran dan bacaan umum untuk menumbuhkan minat baca siswa."},{"icon":"flask-conical","title":"Laboratorium IPA","desc":"Ruang praktik sains dengan peralatan dasar untuk eksperimen siswa."},{"icon":"dribbble","title":"Lapangan Olahraga","desc":"Area luas untuk kegiatan olahraga, upacara, dan pramuka."}]', '', 'right',
  '', '', 0);

INSERT INTO admin_users (id, username, password_hash) VALUES
('admin_1786256140331', 'admin', 'pbkdf2$100000$5f8ad4967c366a2cd0d81ee47add3cc1$7b0eb4da31f321ef687cd71734a3d08cb092d0861835e963d3c8df25affc4584')
ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash;

COMMIT;
