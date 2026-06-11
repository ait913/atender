import { Fragment, type JSX } from "react";
import { Skeleton } from "../Skeleton";

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

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
        <div className="border-b border-r border-border-subtle bg-bg-muted" />
        {Array.from({ length: days }, (_, dayIndex) => (
          <div
            key={`day-${dayIndex}`}
            className="border-b border-r border-border-subtle bg-bg-muted text-center text-[11px] font-semibold leading-[28px]"
          >
            {DAY_LABELS[dayIndex]}
          </div>
        ))}
        {Array.from({ length: rows }, (_, rowIndex) => (
          <Fragment key={`row-group-${rowIndex}`}>
            <div
              key={`row-${rowIndex}`}
              className="flex flex-col items-center justify-center gap-1 border-b border-r border-border-subtle bg-bg-muted"
            >
              <Skeleton width="1.25rem" height="0.75rem" radius="9999px" />
            </div>
            {Array.from({ length: days }, (_, dayIndex) => (
              <div key={`cell-${rowIndex}-${dayIndex}`} className="border-b border-r border-border-subtle p-0.5">
                {(dayIndex + rowIndex) % 3 === 0 ? <Skeleton height="100%" radius="0.375rem" /> : null}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
