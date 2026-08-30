/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/index.html',
    './public/admin.html',
    './public/login.html',
    './public/kebijakan-privasi.html',
    './public/syarat-ketentuan.html',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      colors: {
        primary: '#2563EB',
        primaryHover: '#1D4ED8',
        slateDark: '#0F172A',
        slateMuted: '#64748B',
        surface: '#FFFFFF',
        borderLight: '#F1F5F9',
      },
      boxShadow: {
        soft: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        glass: '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
      },
    },
  },
  plugins: [],
}
