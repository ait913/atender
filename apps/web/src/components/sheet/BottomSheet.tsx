import { X } from "lucide-react";
import type { PointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeight = "85dvh",
  closeDisabled = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxHeight?: string;
  closeDisabled?: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const startY = useRef<number | null>(null);
  const close = useCallback(() => {
    if (!closeDisabled) onClose();
  }, [closeDisabled, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  if (!open) return null;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    startY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (startY.current == null) return;
    setOffset(Math.max(0, event.clientY - startY.current));
  }

  function onPointerUp() {
    if (offset > 80) close();
    startY.current = null;
    setOffset(0);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={close} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-lg bg-bg-elevated shadow-sheet"
        style={{ maxHeight, transform: `translateY(${offset}px)` }}
      >
        <div className="cursor-grab touch-none px-4 pt-3" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <div className="mx-auto h-1 w-6 rounded-full bg-border-emphasis" />
        </div>
        <header className="flex min-h-12 items-center justify-between px-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton label="閉じる" icon={<X className="h-5 w-5" />} onClick={close} disabled={closeDisabled} />
        </header>
        <div className="safe-pb max-h-[calc(85dvh-4rem)] overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
      </section>
    </>
  );
}
