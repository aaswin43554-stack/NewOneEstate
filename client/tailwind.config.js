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
          25:  '#FDFAF6',
          50:  '#FAF6F0',
          100: '#F2EAE0',
          200: '#E0D0BC',
          300: '#C9B49A',
          400: '#A8896A',
          500: '#8B6A47',
          600: '#6F5035',
          700: '#533A24',
          800: '#3A2616',
          900: '#221508',
        },
      },
      borderRadius: {
        'r-6': '0 6px 6px 0',
      },
    },
  },
  plugins: [],
};
