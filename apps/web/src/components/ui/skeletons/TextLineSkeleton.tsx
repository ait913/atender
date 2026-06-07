import type { JSX } from "react";
import { Skeleton } from "../Skeleton";

export function TextLineSkeleton({ width }: { width?: string }): JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-label="読み込み中">
      <Skeleton width={width} height="1rem" />
    </div>
  );
}
