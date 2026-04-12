import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Lora', 'serif'],           // light mode headings
        displayDark: ['Bricolage Grotesque', 'sans-serif'], // dark mode headings
        body: ['IBM Plex Sans', 'sans-serif'],
        bodyDark: ['Outfit', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      colors: {
        // Light — Warm Analyst
        cream:  { DEFAULT: '#FAF7F1', 2: '#F4EFE6', 3: '#EDE5D8' },
        navy:   { DEFAULT: '#132C53', dim: 'rgba(19,44,83,0.07)', light: '#EAF0FB' },
        amber:  { DEFAULT: '#BF7A18', dim: 'rgba(191,122,24,0.08)', mid: 'rgba(191,122,24,0.18)' },
        walnut: { DEFAULT: '#1A1208', 2: '#3A2C18', 3: '#7A6A50', 4: '#AE9E86' },
        sienna: { DEFAULT: '#B83820', dim: 'rgba(184,56,32,0.07)' },
        forest: { DEFAULT: '#1A6B3A', dim: 'rgba(26,107,58,0.07)' },
        sand:   { DEFAULT: '#E4D9C8', 2: '#D4C5AE' },
        // Dark — Midnight Carbon
        carbon: { DEFAULT: '#0C0E14', 2: '#131620', 3: '#191D2E', 4: '#1F2438' },
        slate:  { DEFAULT: '#252B40', 2: '#2E3650' },
        gold:   { DEFAULT: '#FFB547', dim: 'rgba(255,181,71,0.08)', mid: 'rgba(255,181,71,0.18)' },
        periwinkle: { DEFAULT: '#7C9EFF', dim: 'rgba(124,158,255,0.06)' },
        rose:   { DEFAULT: '#FF5F7E', dim: 'rgba(255,95,126,0.08)' },
        mint:   { DEFAULT: '#4ADE80', dim: 'rgba(74,222,128,0.07)' },
        mist:   { DEFAULT: '#F0F2FF', 2: '#C0C8E8', 3: '#7080A8', 4: '#3D4860' },
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
}

export default config
