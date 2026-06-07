import type { JSX } from "react";
import { Skeleton } from "../Skeleton";

export function AttendanceCalendarSkeleton(): JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-label="読み込み中" className="rounded-2xl bg-bg-elevated p-4 shadow-card">
      <Skeleton width="40%" height="1.25rem" className="mb-4" />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }, (_, index) => (
          <Skeleton key={index} className="aspect-square" height="auto" radius="0.625rem" />
        ))}
      </div>
    </div>
  );
}
