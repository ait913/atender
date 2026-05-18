import { Minus, Plus } from "lucide-react";
import { IconButton } from "./IconButton";

export function NumberStepper({
  value,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  onChange,
  disabled = false,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const normalized = Number.isFinite(value) ? value : min;
  const decrease = Math.max(min, normalized - step);
  const increase = Math.min(max, normalized + step);

  return (
    <div className="grid min-h-11 grid-cols-[44px_minmax(64px,1fr)_44px] overflow-hidden rounded-md border border-border-default bg-bg-elevated">
      <IconButton label="減らす" icon={<Minus className="h-4 w-4" />} className="rounded-none" disabled={disabled || normalized <= min} onClick={() => onChange(decrease)} />
      <output className="flex min-w-0 items-center justify-center px-3 text-base font-semibold text-fg-primary">{normalized}</output>
      <IconButton label="増やす" icon={<Plus className="h-4 w-4" />} className="rounded-none" disabled={disabled || normalized >= max} onClick={() => onChange(increase)} />
    </div>
  );
}
