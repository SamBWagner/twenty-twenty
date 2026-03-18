/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#3772FF",
        secondary: "#080708",
        tertiary: "#FDCA40",
        surface: "#FFFDF7",
      },
      boxShadow: {
        brutal: "4px 4px 0px 0px #080708",
        "brutal-sm": "2px 2px 0px 0px #080708",
        "brutal-lg": "6px 6px 0px 0px #080708",
        "brutal-xl": "8px 8px 0px 0px #080708",
        "brutal-primary": "4px 4px 0px 0px #3772FF",
        "brutal-tertiary": "4px 4px 0px 0px #FDCA40",
      },
      borderWidth: {
        3: "3px",
        4: "4px",
      },
      fontFamily: {
        sans: ['"Space Grotesk"', "system-ui", "sans-serif"],
        mono: ['"Space Mono"', "ui-monospace", "monospace"],
      },
      rotate: {
        1: "1deg",
        2: "2deg",
        3: "3deg",
      },
      backgroundImage: {
        grid: "linear-gradient(#e5e5e5 1px, transparent 1px), linear-gradient(90deg, #e5e5e5 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "24px 24px",
      },
    },
  },
  plugins: [],
};
