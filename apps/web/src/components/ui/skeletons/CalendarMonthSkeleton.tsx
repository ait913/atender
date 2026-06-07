import type { JSX } from "react";
import { Skeleton } from "../Skeleton";

export function CalendarMonthSkeleton(): JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-label="読み込み中" className="rounded-2xl bg-bg-elevated p-3 shadow-card">
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={`h-${index}`} height="1.25rem" radius="9999px" />
        ))}
        {Array.from({ length: 42 }, (_, index) => (
          <Skeleton key={`d-${index}`} className="aspect-square" height="auto" radius="0.75rem" />
        ))}
      </div>
    </div>
  );
}
