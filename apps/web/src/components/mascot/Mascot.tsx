import { cx } from "@/components/ui/cx";

const sizes = {
  sm: "h-14 w-14",
  md: "h-24 w-24",
  lg: "h-44 w-44",
};

export function Mascot({ size = "md", className }: { size?: keyof typeof sizes; variant?: "hello"; className?: string }) {
  return <img src="/character/mascot-hello-1024.png" alt="" className={cx("object-contain drop-shadow-sm", sizes[size], className)} />;
}
