/** @type {import('tailwindcss').Config} */

// Map a token name to an rgb() expression that still honors Tailwind's
// opacity modifiers (e.g. bg-canvas/85). Tokens are defined in app/globals.css.
const token = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: token("--canvas"),
        surface: token("--surface"),
        ink: token("--ink"),
        muted: token("--muted"),
        line: token("--line"),
        chip: token("--chip"),
        brand: {
          50: token("--brand-50"),
          100: token("--brand-100"),
          500: token("--brand-500"),
          600: token("--brand-600"),
          700: token("--brand-700"),
        },
        danger: { 500: token("--danger-500"), 600: token("--danger-600") },
        warn: { 500: token("--warn-500") },
        info: { 500: token("--info-500") },
      },
      fontFamily: {
        // `font-sans` (Tailwind's default on most elements) now resolves to Inter.
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      // Semantic display sizes layered on top of the default text-* scale.
      // Additive — existing text-sm/text-2xl/etc. are untouched.
      fontSize: {
        display: ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.02em" }],
        title: ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.01em" }],
        heading: ["1.125rem", { lineHeight: "1.5rem", letterSpacing: "-0.01em" }],
      },
      borderRadius: {
        btn: "var(--radius-btn)",
        card: "var(--radius-card)",
      },
      // Elevation scale, all token-driven so it re-themes in dark mode.
      // `card` and `pill` keep their original light-mode appearance.
      boxShadow: {
        xs: "var(--shadow-xs)",
        card: "var(--shadow-card)",
        pill: "var(--shadow-pill)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
    },
  },
  plugins: [],
};
