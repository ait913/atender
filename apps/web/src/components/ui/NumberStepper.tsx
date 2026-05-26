import { Button } from "./Button";

export function NumberStepper({
  value,
  onChange,
  min = 1,
  max = 12,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border-default bg-bg-elevated p-1">
      <Button type="button" variant="ghost" size="sm" aria-label={`${label ?? "number"} decrease`} onClick={() => onChange(Math.max(min, value - 1))}>
        -
      </Button>
      <output className="min-w-10 text-center text-sm font-semibold">{value}</output>
      <Button type="button" variant="ghost" size="sm" aria-label={`${label ?? "number"} increase`} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </Button>
    </div>
  );
}
