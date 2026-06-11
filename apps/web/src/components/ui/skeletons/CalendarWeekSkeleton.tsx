import type { JSX } from "react";
import { Skeleton } from "../Skeleton";

export function CalendarWeekSkeleton(): JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-label="読み込み中" className="space-y-2">
      {Array.from({ length: 7 }, (_, index) => (
        <section key={index} className="rounded-2xl bg-bg-elevated p-2 shadow-card">
          <header className="mb-2 flex items-center justify-between gap-2">
            <Skeleton width="2.5rem" height="1rem" radius="9999px" />
            <Skeleton width="2rem" height="0.75rem" radius="9999px" />
          </header>
          <div className="space-y-2">
            {Array.from({ length: [2, 1, 0][index % 3] }, (_, tileIndex) => (
              <Skeleton key={tileIndex} height="2.5rem" radius="0.75rem" />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
