import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "var(--color-bg-base)",
          muted: "var(--color-bg-muted)",
          elevated: "var(--color-bg-elevated)",
          overlay: "var(--color-bg-overlay)",
        },
        fg: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          tertiary: "var(--color-text-tertiary)",
          "on-accent": "var(--color-text-on-accent)",
        },
        border: {
          subtle: "var(--color-border-subtle)",
          default: "var(--color-border-default)",
          emphasis: "var(--color-border-emphasis)",
        },
        status: {
          present: "var(--color-status-present)",
          absent: "var(--color-status-absent)",
          excused: "var(--color-status-excused)",
          tardy: "var(--color-status-tardy)",
          early: "var(--color-status-early)",
          cancelled: "var(--color-status-cancelled)",
          none: "var(--color-status-none)",
        },
        friendship: {
          pending: "var(--color-friendship-pending)",
          accepted: "var(--color-friendship-accepted)",
          blocked: "var(--color-friendship-blocked)",
        },
        room: {
          event: "var(--color-room-event)",
          "availability-empty": "var(--color-room-availability-empty)",
        },
        accent: {
          50: "var(--color-accent-50)",
          100: "var(--color-accent-100)",
          500: "var(--color-accent-500)",
          600: "var(--color-accent-600)",
          700: "var(--color-accent-700)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        sheet: "var(--shadow-sheet)",
        popover: "var(--shadow-popover)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
      },
    },
  },
} satisfies Config;
