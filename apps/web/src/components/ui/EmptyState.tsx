import type { ReactNode } from "react";
import { Mascot } from "@/components/mascot/Mascot";

export function EmptyState({ title, action, children }: { title: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center text-center">
      <Mascot size="lg" />
      <h2 className="mt-4 text-lg font-semibold text-fg-primary">{title}</h2>
      {children ? <p className="mt-2 max-w-sm text-sm text-fg-secondary">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
