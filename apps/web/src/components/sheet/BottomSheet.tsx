import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1100] bg-black/70 backdrop-blur-md overlay-fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="
            fixed left-1/2 -translate-x-1/2 z-[1110]
            bottom-2 w-[calc(100%-12px)] max-w-none rounded-2xl overflow-hidden
            md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:w-[min(560px,calc(100vw-32px))] md:rounded-3xl
            flex flex-col bg-bg-elevated shadow-sheet sheet-slide-up
            focus:outline-none
          "
          style={{
            maxHeight: "min(92dvh, 760px)",
            marginBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <div className="flex flex-shrink-0 justify-center pt-3 pb-2 md:hidden">
            <span className="h-1 w-9 rounded-full bg-fg-primary/20" />
          </div>
          <div className="flex min-h-14 flex-shrink-0 items-center justify-between gap-3 px-5 pt-2 pb-3 md:pt-5">
            <Dialog.Title className="text-lg font-bold tracking-tight">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-full bg-bg-muted text-fg-secondary transition hover:bg-fg-primary/10 active:scale-95"
                aria-label="閉じる"
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">
            {children}
          </div>
          {footer ? (
            <div
              className="flex-shrink-0 border-t border-border-subtle bg-bg-elevated px-5 py-3"
              style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
            >
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
