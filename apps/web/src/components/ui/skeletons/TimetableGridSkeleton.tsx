import type { JSX } from "react";
import { Skeleton } from "../Skeleton";

export function TimetableGridSkeleton({
  days = 5,
  rows = 5,
  height,
}: {
  days?: number;
  rows?: number;
  height?: string;
}): JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-label="読み込み中">
      <div
        className="grid w-full overflow-hidden rounded-md border-l border-t border-border-subtle"
        style={{
          gridTemplateColumns: `44px repeat(${days}, minmax(0, 1fr))`,
          gridTemplateRows: `28px repeat(${rows}, minmax(0, 1fr))`,
          height: height ?? "calc(100dvh - var(--self-tt-chrome, 352px) - env(safe-area-inset-bottom, 0px))",
          minHeight: "320px",
        }}
      >
        {Array.from({ length: (days + 1) * (rows + 1) }, (_, index) => (
          <div key={index} className="border-b border-r border-border-subtle p-0.5">
            <Skeleton height="100%" />
          </div>
        ))}
      </div>
    </div>
  );
}
