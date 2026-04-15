/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e6f7f8',
          100: '#b3e8ea',
          200: '#80d9dc',
          300: '#4dcace',
          400: '#26bec3',
          500: '#009ea5',
          600: '#008a91',
          700: '#007a80',
          800: '#00636a',
          900: '#004c52',
        },
        teal: {
          50: '#e6faf8',
          100: '#b3f0ea',
          200: '#80e6dc',
          300: '#4ddcce',
          400: '#26d3c2',
          500: '#1DB5A6',
          600: '#1a9d91',
          700: '#15847a',
          800: '#116b63',
          900: '#0d524c',
        },
        copper: {
          50: '#fdf8f3',
          100: '#f8ebd9',
          200: '#f3ddbf',
          300: '#edd0a5',
          400: '#e8c38b',
          500: '#c49a6c',
          600: '#a17d54',
          700: '#8a6a47',
          800: '#73573a',
          900: '#5c442d',
        },
        cream: {
          50: '#fefdfb',
          100: '#faf9f7',
          200: '#f5f2ed',
          300: '#eee9e0',
          400: '#e5ddd0',
          500: '#d9cdb9',
        }
      },
      fontSize: {
        'base': '18px', // Increased base font size for 50+ audience
        'xs': '14px',
        'sm': '16px',
        'lg': '20px',
        'xl': '22px',
        '2xl': '24px',
        '3xl': '28px',
        '4xl': '32px',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      minHeight: {
        'touch': '48px', // Minimum touch target size
      },
      minWidth: {
        'touch': '48px', // Minimum touch target size
      }
    },
  },
  plugins: [],
}
