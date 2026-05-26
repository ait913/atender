import { useEffect, type ReactNode } from "react";

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeight = "85dvh",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
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
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="閉じる" className="absolute inset-0 bg-bg-overlay" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 rounded-t-lg bg-bg-elevated shadow-sheet" style={{ maxHeight }}>
        <div className="flex justify-center py-3">
          <span className="h-1 w-8 rounded-full bg-border-default" />
        </div>
        <header className="flex min-h-14 items-center justify-between border-b border-border-subtle px-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-full text-xl text-fg-secondary hover:bg-bg-muted" onClick={onClose}>
            x
          </button>
        </header>
        <div className="max-h-[calc(85dvh-88px)] space-y-5 overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-4 overscroll-contain">
          {children}
        </div>
      </section>
    </div>
  );
}
