import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#ffffff",
        surface: "#fafafa",
        "surface-hover": "#f5f5f5",
        border: "#e5e5e5",
        "border-strong": "#d4d4d4",
        "text-primary": "#0a0a0a",
        "text-secondary": "#525252",
        "text-muted": "#a3a3a3",
        accent: "#0070f3",
        "accent-hover": "#0060df",
        success: "#16a34a",
        warning: "#ca8a04",
        danger: "#dc2626",
        "priority-high": "#dc2626",
        "priority-medium": "#ca8a04",
        "priority-low": "#0070f3",
      },
      fontFamily: {
        sans: ["Geist", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
