import { Button } from "@/components/ui/Button";

export function StickyAction({ pendingCount, onClick, disabled }: { pendingCount: number; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="safe-pb fixed inset-x-0 bottom-14 z-30 border-t border-border-subtle bg-bg-base px-4 py-2 md:hidden">
      <Button className="w-full shadow-card" disabled={disabled || pendingCount === 0} onClick={onClick}>
        {pendingCount > 0 ? `全部出席にする (${pendingCount} 件)` : "本日の記録は完了済"}
      </Button>
    </div>
  );
}
