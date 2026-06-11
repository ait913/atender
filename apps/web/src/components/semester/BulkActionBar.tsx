import { Button } from "@/components/ui";

type Props = {
  count: number;
  onOpenSheet: () => void;
  onCancel: () => void;
};

export function BulkActionBar({ count, onOpenSheet, onCancel }: Props) {
  return (
    <div className="fixed inset-x-3 bottom-20 z-50 flex items-center justify-between gap-3 rounded-2xl bg-bg-elevated p-3 shadow-card md:inset-x-auto md:left-1/2 md:w-[480px] md:-translate-x-1/2">
      <p className="text-sm font-bold">{count}日選択中</p>
      <div className="flex gap-2">
        <Button type="button" variant="primary" size="sm" onClick={onOpenSheet} disabled={count === 0}>
          一括操作
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          キャンセル
        </Button>
      </div>
    </div>
  );
}
