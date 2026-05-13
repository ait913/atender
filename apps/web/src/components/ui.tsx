import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-4xl font-black tracking-normal sm:text-5xl">{title}</h1>
      {children ? <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68">{children}</p> : null}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-white/12 bg-white/[0.035] p-4 ${className}`}>{children}</section>;
}

export function Button({ className = "", variant = "ghost", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "ghost" | "primary" | "danger" }) {
  const variants = {
    ghost: "border-white/24 text-white hover:opacity-70",
    primary: "border-emerald-400 bg-emerald-500 text-black hover:opacity-85",
    danger: "border-red-300/60 text-red-100 hover:opacity-70",
  };
  return (
    <button
      className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-bold transition disabled:opacity-40 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="min-h-11 w-full rounded-lg border border-white/18 bg-black/20 px-3 py-2 text-white outline-none transition placeholder:text-white/35 focus:border-white/55"
      {...props}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="min-h-11 w-full rounded-lg border border-white/18 bg-[#071121] px-3 py-2 text-white outline-none transition focus:border-white/55"
      {...props}
    />
  );
}

export function Mascot({ className = "" }: { className?: string }) {
  return <img src="/character/mascot-hello-1024.png" alt="" className={`object-contain ${className}`} />;
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="fixed bottom-24 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 rounded-lg border border-white/18 bg-[#071121] px-4 py-3 text-sm font-bold text-white shadow-none">{message}</div>;
}

export const statusLabels = {
  PRESENT: "出席",
  ABSENT: "欠席",
  EXCUSED: "公欠",
  TARDY: "遅刻",
  EARLY_LEAVE: "早退",
  CANCELLED: "休講",
} as const;

export const ruleLabels = {
  COUNT_AS_PRESENT: "出席扱い",
  COUNT_AS_ABSENT: "欠席扱い",
  HALF_PRESENT: "半分出席",
  REDUCE_DENOMINATOR: "分母除外",
  SEPARATE_COUNT: "別集計",
} as const;

export function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
