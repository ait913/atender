import { ChevronLeft, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

export function FullScreenModal({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[1100] flex flex-col bg-bg-base">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border-subtle bg-bg-base/85 px-5 backdrop-blur-xl">
        <button type="button" onClick={onClose} aria-label="戻る" className="grid h-10 w-10 place-items-center rounded-full hover:bg-fg-primary/6 md:hidden">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="flex-1 truncate text-lg font-bold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="閉じる" className="grid h-10 w-10 place-items-center rounded-full hover:bg-fg-primary/6">
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
    </div>,
    document.body,
  );
}
