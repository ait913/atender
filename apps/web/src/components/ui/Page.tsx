import type { ReactNode } from "react";
import { cx } from "./cx";

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto w-full max-w-[960px] px-4 py-3 pb-tab-safe md:px-6 md:pb-8", className)}>{children}</div>;
}
