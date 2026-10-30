import { useSyncExternalStore } from "react";
import { getToastMessage, subscribeToast } from "@/lib/toast";

export function ToastHost() {
  const message = useSyncExternalStore(subscribeToast, getToastMessage);
  if (message === null) return null;
  return (
    <div role="status" className="fixed bottom-24 left-1/2 z-[1200] w-[min(92vw,420px)] -translate-x-1/2 rounded-md bg-fg-primary px-4 py-3 text-sm font-semibold text-white shadow-popover">
      {message}
    </div>
  );
}
