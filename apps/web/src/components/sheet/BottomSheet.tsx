import { useEffect, type ReactNode } from "react";

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  maxHeight = "92dvh",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxHeight?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center">
      <button
        type="button"
        aria-label="閉じる"
        className="absolute inset-0 overlay-fade-in bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />
      <section
        className="relative z-[1110] flex w-full flex-col sheet-slide-up rounded-t-[28px] bg-bg-elevated shadow-sheet md:mx-auto md:max-w-xl md:rounded-3xl md:mb-6"
        style={{ maxHeight }}
      >
        <div className="flex flex-shrink-0 justify-center pt-3 pb-2">
          <span className="h-1 w-9 rounded-full bg-white/20" />
        </div>
        <header className="flex min-h-14 flex-shrink-0 items-center justify-between px-5 pt-2 pb-3">
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full bg-bg-muted text-lg text-fg-secondary hover:bg-white/10 active:scale-95 transition"
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">
          {children}
        </div>
        {footer ? (
          <div className="flex-shrink-0 border-t border-border-subtle bg-bg-elevated px-5 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </section>
    </div>
  );
}
