import type { JSX } from "react";

type SkeletonProps = {
  width?: string;
  height?: string;
  radius?: string;
  className?: string;
  circle?: boolean;
};

export function Skeleton({ width, height, radius, className = "", circle }: SkeletonProps): JSX.Element {
  const size = circle ? height ?? width ?? "1rem" : undefined;
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-bg-muted ${radius || circle ? "" : "rounded-md"} ${className}`}
      style={{
        width: size ?? width ?? "100%",
        height: size ?? height ?? "1rem",
        borderRadius: circle ? "9999px" : radius,
      }}
    />
  );
}
