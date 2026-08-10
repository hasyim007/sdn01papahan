/**
 * Parser form POST untuk halaman admin. Semua form admin memakai konvensi nama
 * field: header[field] untuk objek tunggal, items[N][field] untuk daftar repeater,
 * list[N] untuk daftar string sederhana (mis. poin-poin misi).
 */
export async function parseAdminForm(request) {
  const formData = await request.formData();
  const header = {};
  const itemsMap = {};
  const listMap = {};
  const flat = {};

  for (const [key, rawValue] of formData.entries()) {
    const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
    let m;
    if ((m = key.match(/^header\[([^\]]+)\]$/))) {
      header[m[1]] = value;
    } else if ((m = key.match(/^items\[(\d+)\]\[([^\]]+)\]$/))) {
      const idx = Number(m[1]);
      itemsMap[idx] = itemsMap[idx] || {};
      itemsMap[idx][m[2]] = value;
    } else if ((m = key.match(/^list\[(\d+)\]$/))) {
      listMap[Number(m[1])] = value;
    } else {
      flat[key] = value;
    }
  }

  const items = Object.keys(itemsMap)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => itemsMap[k])
    .filter((it) => Object.values(it).some((v) => String(v || '').trim() !== ''));

  const list = Object.keys(listMap)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => listMap[k])
    .filter((v) => String(v || '').trim() !== '');

  return { header, items, list, flat };
}
