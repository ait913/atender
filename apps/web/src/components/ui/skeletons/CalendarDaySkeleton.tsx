import type { JSX } from "react";
import { Skeleton } from "../Skeleton";

const TILE_POSITIONS = [
  { top: "8%", left: "12%", width: "86%", height: "12%" },
  { top: "33%", left: "12%", width: "86%", height: "8%" },
  { top: "58%", left: "12%", width: "86%", height: "12%" },
];

export function CalendarDaySkeleton(): JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-label="読み込み中" className="rounded-2xl bg-bg-elevated p-2 shadow-card">
      <div className="relative" style={{ height: "720px" }}>
        {Array.from({ length: 13 }, (_, index) => {
          const hour = index + 9;
          return (
            <div
              key={hour}
              className="absolute left-0 right-0 border-t border-fg-primary/8"
              style={{ top: `${((hour - 9) / 12) * 100}%` }}
            >
              <Skeleton className="absolute -top-2 left-0" width="1.25rem" height="0.625rem" radius="9999px" />
            </div>
          );
        })}
        {TILE_POSITIONS.map((style, index) => (
          <div key={index} className="absolute" style={style}>
            <Skeleton height="100%" radius="0.75rem" />
          </div>
        ))}
      </div>
    </div>
  );
}
