/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#FAFAF8",
        ink: "#1A1A1A",
        muted: "#6B7280",
        line: "#E8E5E1",
        chip: "#D1FAE5",
        brand: { 50: "#ECFDF5", 100: "#D1FAE5", 500: "#10B981", 600: "#059669", 700: "#047857" },
        danger: { 500: "#EF4444", 600: "#DC2626" },
        warn: { 500: "#F59E0B" },
        info: { 500: "#3B82F6" },
      },
      borderRadius: { btn: "6px", card: "10px" },
      boxShadow: {
        card: "0 1px 0 rgba(26,26,26,0.02), 0 0 0 1px #E8E5E1",
        pill: "0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px #E8E5E1",
      },
    },
  },
  plugins: [],
};