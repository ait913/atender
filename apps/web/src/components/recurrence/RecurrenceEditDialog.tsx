import { useState } from "react";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button } from "@/components/ui";

export function RecurrenceEditDialog({ open, mode, onClose, onConfirm }: {
  open: boolean;
  mode: "edit" | "delete";
  onClose: () => void;
  onConfirm: (scope: "single" | "future" | "all") => void;
}) {
  const [scope, setScope] = useState<"single" | "future" | "all">("single");
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "この予定を編集" : "この予定を削除"}
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
          <Button type="button" variant={mode === "delete" ? "danger" : "primary"} onClick={() => onConfirm(scope)}>
            {mode === "delete" ? "削除" : "保存"}
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        {[
          ["single", "この予定のみ"],
          ["future", "これ以降のすべての予定"],
          ["all", "すべての予定"],
        ].map(([value, label]) => (
          <label key={value} className="flex items-center gap-3 rounded-2xl bg-bg-muted px-4 py-3 text-sm font-bold">
            <input type="radio" checked={scope === value} onChange={() => setScope(value as typeof scope)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </BottomSheet>
  );
}
