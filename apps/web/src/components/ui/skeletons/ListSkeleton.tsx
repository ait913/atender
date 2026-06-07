import type { JSX } from "react";
import { Skeleton } from "../Skeleton";

export function ListSkeleton({
  rows = 3,
  itemHeight = "56px",
}: {
  rows?: number;
  itemHeight?: string;
}): JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-label="読み込み中" className="space-y-2">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={itemHeight} radius="1rem" />
      ))}
    </div>
  );
}
