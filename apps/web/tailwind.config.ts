import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        jarvis: {
          bg: "#050a12",
          surface: "#0a1628",
          card: "#0d1f3c",
          border: "#1a3a5c",
          cyan: "#00d4ff",
          blue: "#0088ff",
          glow: "#00d4ff33",
          muted: "#4a7fa0",
          text: "#e2f0ff",
          subtle: "#8ab4d0",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 8s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
