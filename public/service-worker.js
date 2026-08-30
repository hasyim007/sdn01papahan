/**
 * Service Worker -- Web Push Notification (Tahap 2), SDN 01 Papahan.
 *
 * PENTING: file ini WAJIB ada di root situs (/service-worker.js), BUKAN di
 * dalam subfolder. Cakupan (scope) sebuah service worker terbatas pada
 * folder tempat dia berada dan di bawahnya -- kalau dipindah ke subfolder,
 * dia tidak akan bisa "menjaga" seluruh halaman situs, hanya folder itu
 * saja, sehingga notifikasi push tidak akan diterima di halaman lain.
 *
 * Didaftarkan dari public/index.html lewat
 * navigator.serviceWorker.register('/service-worker.js').
 */

self.addEventListener('install', () => {
    // Langsung aktif tanpa menunggu tab lama ditutup -- wajar untuk
    // service worker yang hanya menangani push, tidak melakukan caching
    // apa pun yang bisa membuat halaman lama/baru bentrok.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Event push: notifikasi masuk dari server (lewat POST /api/admin/push/send
// di src/index.js). Payload dikirim terenkripsi oleh layanan push
// (Google/Mozilla/dst), browser yang mendekripsinya sebelum event ini
// terpicu -- kode di sini hanya perlu membaca isinya lalu memunculkan
// notifikasi asli di perangkat pengunjung.
self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (err) {
        // Payload bukan JSON (seharusnya tidak terjadi -- server selalu
        // mengirim JSON -- tapi dijaga supaya tidak error diam-diam).
        data = { title: 'SDN 01 Papahan', body: event.data ? event.data.text() : '' };
    }

    const title = data.title || 'SDN 01 Papahan';
    const options = {
        body: data.body || '',
        icon: data.icon || '/favicon-32.png',
        badge: data.badge || '/favicon-32.png',
        // Simpan link tujuan di sini supaya bisa dibaca lagi saat
        // notificationclick di bawah.
        data: { url: data.url || '/' },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// Event notificationclick: pengunjung klik notifikasinya -- fokuskan tab
// situs yang sudah terbuka kalau ada, atau buka tab baru ke link tujuan
// kalau belum ada tab situs ini yang terbuka sama sekali.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                    if ('navigate' in client) client.navigate(targetUrl);
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
        })
    );
});
