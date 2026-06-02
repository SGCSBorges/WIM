/** @type {import('tailwindcss').Config} */

// Design-system bridge: map semantic Tailwind tokens onto the CSS variables
// defined per-theme in src/index.css. This lets components use utilities like
// `bg-surface`, `text-muted`, `border-line`, `bg-primary text-primary-contrast`
// that automatically resolve for light/dark/ocean/cyber — so we get the
// ergonomics of Tailwind without ever hardcoding a theme-specific color.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          muted: "var(--surface-muted)",
        },
        line: "var(--border)",
        fg: "var(--text)",
        muted: "var(--muted)",
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          contrast: "var(--primary-contrast)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          contrast: "var(--accent-contrast)",
        },
        success: "var(--text-success)",
        danger: "var(--text-error)",
        warn: "var(--text-warn)",
      },
      fontFamily: {
        sans: ["Inter Variable", "var(--font-sans)"],
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-md)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
      },
      backgroundImage: {
        "gradient-brand": "var(--gradient-brand)",
        "gradient-surface": "var(--gradient-surface)",
      },
      ringColor: {
        DEFAULT: "var(--focus-ring)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out both",
        "slide-up": "slide-up 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        "scale-in": "scale-in 0.18s ease-out both",
      },
    },
  },
  plugins: [],
};
