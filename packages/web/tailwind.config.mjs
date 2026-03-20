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
        grid: "url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%2724%27%20height%3D%2724%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%3E%3Cpath%20d%3D%27M23.5%200V24%27%20stroke%3D%27%23e5e5e5%27%20stroke-width%3D%271%27%2F%3E%3Cpath%20d%3D%27M0%2023.5H24%27%20stroke%3D%27%23e5e5e5%27%20stroke-width%3D%271%27%2F%3E%3C%2Fsvg%3E\")",
      },
      backgroundSize: {
        grid: "24px 24px",
      },
    },
  },
  plugins: [],
};
