/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        coffee: {
          50:  '#f4faf6',
          100: '#e6f4ed',
          200: '#c5e7d5',
          300: '#96d3b1',
          400: '#61bb89',
          500: '#3c9e67',
          600: '#2e7f51',
          700: '#246540',
          800: '#1d5033',
          900: '#143824',
        },
      },
    },
  },
  plugins: [],
};
