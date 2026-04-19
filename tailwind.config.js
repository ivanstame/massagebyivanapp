/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ——— Atelier direction (cream paper, copper accent, serif-led) ———
        paper: {
          DEFAULT: '#F6F1E8',       // cream paper background
          elev:    '#FBF7EF',       // slightly brighter card surface
          deep:    '#EDE5D5',       // recessed sections
        },
        ink: {
          DEFAULT: '#2A2520',       // warm near-black headings/body
          2:       '#5B534B',       // body secondary
          3:       '#8D857B',       // tertiary / meta
        },
        line: {
          DEFAULT: 'rgba(42,37,32,0.12)',
          soft:    'rgba(42,37,32,0.06)',
        },
        accent: {
          DEFAULT: '#B07A4E',       // copper — primary CTA
          ink:     '#8A5D36',       // deeper copper (hover)
          soft:    'rgba(176,122,78,0.12)',
          glow:    'rgba(176,122,78,0.22)',
        },
        // ——— Existing brand/teal kept as supporting only (legacy) ———
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
          500: '#1B7F84',           // Atelier supporting teal (quieter)
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
          500: '#B07A4E',           // Atelier copper (primary accent)
          600: '#8A5D36',
          700: '#73492a',
          800: '#5c3b22',
          900: '#452c1a',
        },
        cream: {
          50:  '#FBF7EF',
          100: '#F6F1E8',
          200: '#EDE5D5',
          300: '#e5ddd0',
          400: '#d9cdb9',
          500: '#c4b89f',
        },
        // Status colors (Atelier warm palette)
        success: '#5B7A4C',
        warn:    '#B8792A',
        danger:  '#A54641',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', '"Playfair Display"', 'Georgia', 'serif'],
        serif:   ['"Fraunces"', '"Source Serif Pro"', 'Georgia', 'serif'],
        sans:    ['"Inter Tight"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        'base': '17px',               // slightly dialed back from 18px
        'xs':   '12px',
        'sm':   '14px',
        'lg':   '19px',
        'xl':   '22px',
        '2xl':  '26px',
        '3xl':  '32px',
        '4xl':  '42px',
        '5xl':  '56px',
      },
      letterSpacing: {
        meta: '0.14em',
        eyebrow: '0.18em',
      },
      borderRadius: {
        'card': '14px',
        'btn':  '10px',
      },
      boxShadow: {
        'atelier-sm': '0 1px 2px rgba(42,37,32,0.04), 0 1px 3px rgba(42,37,32,0.04)',
        'atelier-md': '0 4px 14px rgba(42,37,32,0.06), 0 1px 3px rgba(42,37,32,0.04)',
        'atelier-lg': '0 18px 48px rgba(42,37,32,0.10), 0 2px 6px rgba(42,37,32,0.05)',
      },
      spacing: {
        '18':  '4.5rem',
        '88':  '22rem',
        '128': '32rem',
      },
      minHeight: {
        'touch': '48px',
      },
      minWidth: {
        'touch': '48px',
      }
    },
  },
  plugins: [],
}
