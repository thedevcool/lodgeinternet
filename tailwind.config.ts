import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Client design tokens (iOS 27 + apple.com) ─────────────────────
        // Values live as RGB channels in app/globals.css (`--canvas: 245 245 247`)
        // so opacity modifiers work (`bg-accent/10`). Dark mode flips the
        // variables — never use `dark:` variants in client code.
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          2: "rgb(var(--surface-2) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          2: "rgb(var(--ink-2) / <alpha-value>)",
          3: "rgb(var(--ink-3) / <alpha-value>)",
        },
        hairline: "var(--hairline)",
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          ink: "rgb(var(--accent-ink) / <alpha-value>)",
        },
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        wa: {
          DEFAULT: "rgb(var(--wa) / <alpha-value>)",
          ink: "rgb(var(--wa-ink) / <alpha-value>)",
        },
        // ── Admin palette (unchanged) ─────────────────────────────────────
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
      // ── Client design tokens, continued ──────────────────────────────────
      // Concentric radii: a sheet holds cards, a card holds inner controls.
      borderRadius: {
        sheet: "28px",
        card: "22px",
        inner: "14px",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        float: "var(--shadow-float)",
      },
      transitionTimingFunction: {
        ios: "cubic-bezier(0.32, 0.72, 0, 1)",
        // Slight overshoot, like iOS 27's liquid selection pills.
        spring: "cubic-bezier(0.34, 1.36, 0.64, 1)",
      },
      keyframes: {
        "sheet-up": { from: { transform: "translateY(100%)" }, to: { transform: "translateY(0)" } },
        "sheet-down": { from: { transform: "translateY(0)" }, to: { transform: "translateY(100%)" } },
        "pop-in": { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "scale(1)" } },
        "pop-out": { from: { opacity: "1", transform: "scale(1)" }, to: { opacity: "0", transform: "scale(0.96)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-out": { from: { opacity: "1" }, to: { opacity: "0" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "toast-in": { from: { opacity: "0", transform: "translateY(-12px) scale(0.98)" }, to: { opacity: "1", transform: "translateY(0) scale(1)" } },
        "check-pop": { "0%": { transform: "scale(0.6)", opacity: "0" }, "60%": { transform: "scale(1.08)", opacity: "1" }, "100%": { transform: "scale(1)" } },
      },
      animation: {
        "sheet-up": "sheet-up 420ms cubic-bezier(0.32, 0.72, 0, 1) both",
        "sheet-down": "sheet-down 260ms cubic-bezier(0.32, 0.72, 0, 1) both",
        "pop-in": "pop-in 260ms cubic-bezier(0.32, 0.72, 0, 1) both",
        "pop-out": "pop-out 180ms ease-in both",
        "fade-in": "fade-in 260ms ease-out both",
        "fade-out": "fade-out 200ms ease-in both",
        "fade-up": "fade-up 520ms cubic-bezier(0.32, 0.72, 0, 1) both",
        "toast-in": "toast-in 320ms cubic-bezier(0.32, 0.72, 0, 1) both",
        "check-pop": "check-pop 520ms cubic-bezier(0.32, 0.72, 0, 1) both",
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
