import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button } from "./Button";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  confirmVariant = "destructive",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
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
      maxHeight="60dvh"
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>キャンセル</Button>
          <Button type="button" variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      }
    >
      <p className="text-sm leading-6 text-fg-secondary">{body}</p>
    </BottomSheet>
  );
}
