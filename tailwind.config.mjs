/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
      backgroundImage: {
        "grid": "url('/grid.svg')",
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
      }
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
