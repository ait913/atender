import type { JSX } from "react";
import { Skeleton } from "../Skeleton";

export function CalendarMonthSkeleton(): JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-label="読み込み中" className="rounded-2xl bg-bg-elevated p-2 shadow-card">
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={`h-${index}`} className="flex justify-center py-2">
            <Skeleton width="1rem" height="0.75rem" radius="9999px" />
          </div>
        ))}
        {Array.from({ length: 42 }, (_, index) => (
          <div key={`d-${index}`} className="flex min-h-24 flex-col gap-1 p-0.5">
            <Skeleton circle height="1.25rem" />
            {Array.from({ length: [2, 1, 0][index % 3] }, (_, chipIndex) => (
              <Skeleton key={chipIndex} height="1rem" radius="4px" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
