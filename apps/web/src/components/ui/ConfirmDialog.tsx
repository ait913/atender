import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button } from "./Button";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "キャンセル",
  stackLevel = 1,
  confirmVariant = "destructive",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  cancelLabel?: string;
  stackLevel?: 1 | 2 | 3;
  confirmLabel: string;
  confirmVariant?: "primary" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onCancel}
      title={title}
      stackLevel={stackLevel}
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
          <Button type="button" variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      }
    >
      {body !== undefined ? <p className="text-sm leading-6 text-fg-secondary">{body}</p> : null}
    </BottomSheet>
  );
}
