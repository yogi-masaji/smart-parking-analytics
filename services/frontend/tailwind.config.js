/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-primary': '#0a0e17',
        'brand-secondary': '#0f172a',
        'brand-card': '#131c2e',
        'brand-card-hover': '#18243c',
        'brand-surface': '#1e293b',
        'accent-cyan': '#06b6d4',
        'status-success': '#10b981',
        'status-warning': '#f59e0b',
        'status-danger': '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
