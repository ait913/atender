import { useEffect, useState } from "react";
import { useMe, usePatchMe } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, NumberStepper } from "@/components/ui";

type Props = { open: boolean; onClose: () => void };

export function RequiredRateSheet({ open, onClose }: Props) {
  const me = useMe();
  const patch = usePatchMe();
  const [value, setValue] = useState(70);
  const current = me.data?.user.requiredAttendanceRate ?? 70;

  useEffect(() => {
    if (open) setValue(current);
  }, [current, open]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="必要出席率"
      stackLevel={1}
      footer={(
        <Button
          type="button"
          variant="primary"
          className="w-full"
          disabled={patch.isPending}
          onClick={() => patch.mutate({ requiredAttendanceRate: value }, { onSuccess: onClose })}
        >
          保存
        </Button>
      )}
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-bold text-fg-secondary">必要出席率</p>
          <div className="flex items-center gap-3">
            <NumberStepper value={value} onChange={setValue} min={1} max={100} label="必要出席率" />
            <span className="text-lg font-black">%</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[60, 66, 70, 80].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setValue(option)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                value === option ? "bg-accent-500 text-fg-on-accent" : "bg-bg-muted text-fg-secondary hover:text-fg-primary"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <p className="text-sm leading-relaxed text-fg-tertiary">
          全科目共通。出席率の色分けと「あと何限休めるか」の基準になります
        </p>
      </div>
    </BottomSheet>
  );
}
