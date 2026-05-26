import { cx } from "./cx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-bg-muted", className)} />;
}
