import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "apple-gray": {
          50: "#fafafa",
          100: "#f5f5f7",
          200: "#e8e8ed",
          300: "#d2d2d7",
          400: "#86868b",
          500: "#6e6e73",
          600: "#515154",
          700: "#424245",
          800: "#1d1d1f",
          900: "#000000",
        },
        "apple-blue": {
          DEFAULT: "#0071e3",
          dark: "#0077ed",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "SF Pro Icons",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      fontSize: {
        xs: ["12px", "16px"],
        sm: ["14px", "20px"],
        base: ["17px", "25px"],
        lg: ["19px", "27px"],
        xl: ["21px", "29px"],
        "2xl": ["24px", "32px"],
        "3xl": ["28px", "36px"],
        "4xl": ["32px", "40px"],
        "5xl": ["40px", "44px"],
        "6xl": ["48px", "52px"],
        "7xl": ["56px", "60px"],
        "8xl": ["64px", "68px"],
        "9xl": ["80px", "84px"],
      },
      maxWidth: {
        container: "1024px",
        wide: "1440px",
      },
      spacing: {
        "18": "4.5rem",
        "88": "22rem",
        "128": "32rem",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [
    typography,
    function ({ addUtilities }: any) {
      addUtilities({
        ".scrollbar-hide": {
          "&::-webkit-scrollbar": {
            display: "none",
          },
          "-ms-overflow-style": "none",
          "scrollbar-width": "none",
        },
      });
    },
  ],
};
export default config;
