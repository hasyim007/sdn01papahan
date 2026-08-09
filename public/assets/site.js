// Fetch data publik sekali dari D1 (via Worker), lalu broadcast ke sections.js
// untuk mengisi markup asli (nav, footer, dan section masing-masing halaman).
async function loadSiteData() {
  const res = await fetch('/api/public/data');
  const data = await res.json();
  window.SITE_DATA = data;
  document.dispatchEvent(new CustomEvent('site-data-ready', { detail: data }));
}
document.addEventListener('DOMContentLoaded', loadSiteData);
