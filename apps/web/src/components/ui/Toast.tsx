import { cx } from "./cx";

type ToastVariant = "success" | "error" | "info";

const variants: Record<ToastVariant, string> = {
  success: "border-accent-100 bg-accent-50 text-accent-700",
  error: "border-red-100 bg-red-50 text-status-absent",
  info: "border-border-subtle bg-bg-elevated text-fg-primary",
};

export function Toast({ message, variant = "info" }: { message: string | null; variant?: ToastVariant }) {
  if (!message) return null;
  return (
    <div className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[70] md:left-auto md:right-6 md:w-80">
      <div className={cx("rounded-md border px-4 py-3 text-sm font-semibold shadow-card", variants[variant])}>{message}</div>
    </div>
  );
}
