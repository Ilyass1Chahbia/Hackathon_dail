import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F5F6FA",
        // primary indigo
        ink: "#27166F",
        // proposal violet / observed blue / success / warning / danger
        violet: "#5B3DF5",
        blue: "#2563EB",
        success: "#07866F",
        warning: "#D97706",
        danger: "#D62F53",
        tint: {
          blue: "#EDF5FF",
          violet: "#F1EEFF",
          success: "#E9F8F3",
          warning: "#FFF4D8",
          danger: "#FFF0F3",
        },
        // Trast reference palette — used by the stage navigation and quantity strip.
        trast: {
          violet: "#4324D4",
          ultra: "#5526FF",
          blue: "#1E6FE0",
          coral: "#FF6762",
          pink: "#F04E9C",
          canvas: "#E2E2E5",
          white: "#F8F8FA",
          ink: "#24135F",
        },
      },
      fontFamily: {
        sans: ["var(--font-geometric)", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        // Crisp borders carry the structure; elevation stays barely there.
        card: "0 1px 2px rgba(36,19,95,0.05), 0 6px 16px -14px rgba(36,19,95,0.28)",
      },
      borderRadius: {
        card: "16px",
      },
    },
  },
  plugins: [],
} satisfies Config;
