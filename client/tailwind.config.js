/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        coffee: {
          25:  '#fefaf7',
          50:  '#fdf6f0',
          100: '#fae8d8',
          200: '#f5cba8',
          300: '#eda872',
          400: '#e3833c',
          500: '#d96018',
          600: '#b94a10',
          700: '#953710',
          800: '#782e13',
          900: '#612814',
        },
      },
      borderRadius: {
        'r-6': '0 6px 6px 0',
      },
    },
  },
  plugins: [],
};
