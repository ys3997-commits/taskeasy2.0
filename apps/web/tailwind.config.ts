import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f3f7f4",
          100: "#e2ebe4",
          500: "#1f6b4a",
          600: "#185a3d",
          700: "#134a32",
          900: "#0c2a1c",
        },
        ink: {
          50: "#f7f8f8",
          100: "#eef0f0",
          200: "#d9dddc",
          500: "#5c6663",
          700: "#2f3835",
          900: "#151a18",
        },
      },
      fontFamily: {
        sans: ["var(--font-source-sans)", "Segoe UI", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
