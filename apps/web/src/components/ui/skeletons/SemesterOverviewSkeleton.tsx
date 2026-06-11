import type { JSX } from "react";
import { Skeleton } from "../Skeleton";

export function SemesterOverviewSkeleton(): JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-label="読み込み中" className="space-y-4">
      <div className="rounded-3xl bg-bg-elevated p-4 shadow-card">
        <Skeleton width="40%" height="1.25rem" className="mb-4" />
        <Skeleton width="100%" height="0.625rem" radius="9999px" />
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="rounded-3xl bg-bg-elevated p-3 shadow-card">
          <Skeleton width="48%" height="1.25rem" className="mx-auto mb-3" />
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 42 }, (_, index) => (
              <Skeleton key={index} className="aspect-square" height="auto" radius="0.5rem" />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} height="4rem" radius="1rem" />
          ))}
        </div>
      </div>
    </div>
  );
}
