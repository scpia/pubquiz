/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', "Liberation Mono", "Courier New", 'monospace'],
      },
      colors: {
        // Custom branding colors
        brand: {
          dark: '#0f172a',  // slate-950
          card: '#1e293b',  // slate-800
          primary: '#6366f1', // indigo-500
          accent: '#eab308',  // yellow-500
        }
      }
    },
  },
  plugins: [],
}