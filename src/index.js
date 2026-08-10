/**
 * Worker API sederhana untuk sdn_01_papahan.html
 * - GET  /api/data  -> baca seluruh data situs (publik, tanpa auth)
 * - PUT  /api/data  -> simpan seluruh data situs (wajib header X-Sync-Key)
 *
 * Data disimpan sebagai SATU baris JSON di tabel D1 "site_data" (id = 'main'),
 * persis meniru struktur objek DB yang sebelumnya ada di localStorage.
 * Ini sengaja dibuat sesederhana mungkin — bukan skema relasional per tabel.
 */

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Key',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(env) },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (url.pathname === '/api/data' && request.method === 'GET') {
      const row = await env.DB.prepare('SELECT data, updated_at FROM site_data WHERE id = ?')
        .bind('main')
        .first();
      const data = row ? row.data : '{}';
      return new Response(data, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Updated-At': row ? String(row.updated_at) : '0',
          ...cors,
        },
      });
    }

    if (url.pathname === '/api/data' && request.method === 'PUT') {
      const key = request.headers.get('X-Sync-Key') || '';
      if (!env.SYNC_KEY || key !== env.SYNC_KEY) {
        return json({ error: 'Kunci sinkronisasi salah atau belum diatur.' }, 401, env);
      }

      let bodyText;
      try {
        bodyText = await request.text();
        if (bodyText.length > 20 * 1024 * 1024) {
          return json({ error: 'Data terlalu besar (maks 20MB). Kompres gambar yang diunggah.' }, 413, env);
        }
        JSON.parse(bodyText); // validasi JSON valid
      } catch (e) {
        return json({ error: 'Format data JSON tidak valid.' }, 400, env);
      }

      const now = Date.now();
      await env.DB.prepare(
        'INSERT INTO site_data (id, data, updated_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
      ).bind('main', bodyText, now).run();

      return json({ ok: true, updated_at: now }, 200, env);
    }

    return json({ error: 'Not found' }, 404, env);
  },
};
