import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          deep: "#02040a",
          fg: "#f0f0f0",
          muted: "#a9b4c7",
          line: "rgba(240, 240, 240, 0.16)",
          accent: "#f4f1e8",
          cta: "#10b981",
        },
      },
    },
  },
} satisfies Config;
