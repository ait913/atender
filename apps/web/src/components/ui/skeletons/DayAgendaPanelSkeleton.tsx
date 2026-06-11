import type { JSX } from "react";
import { Skeleton } from "../Skeleton";

export function DayAgendaPanelSkeleton(): JSX.Element {
  return (
    <section role="status" aria-busy="true" aria-label="読み込み中" className="space-y-2 rounded-2xl bg-bg-elevated p-3 shadow-card">
      <Skeleton width="5rem" height="1rem" radius="9999px" />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex min-w-0 items-center gap-2">
          <Skeleton circle height="0.5rem" />
          <Skeleton className="flex-1" width="auto" height="1rem" radius="9999px" />
          <Skeleton width="4rem" height="0.75rem" radius="9999px" />
        </div>
      ))}
    </section>
  );
}
