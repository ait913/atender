import { useMemo, useState } from "react";
import {
  useBulkClearAttendance,
  useBulkCreateTimetableSuspensions,
  useBulkMarkAttendance,
  useBulkRemoveTimetableSuspensions,
} from "@/api/hooks";
import type { BulkMarkAttendanceInput } from "@/api/hooks/types";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Toast } from "@/components/ui";

type Props = {
  open: boolean;
  onClose: () => void;
  dates: string[];
  semesterId?: string | null;
  onDone: () => void;
};

type BulkStatus = BulkMarkAttendanceInput["status"];

const statuses: Array<{ status: BulkStatus; label: string }> = [
  { status: "PRESENT", label: "出" },
  { status: "ABSENT", label: "欠" },
  { status: "EXCUSED", label: "公" },
  { status: "TARDY", label: "遅" },
  { status: "EARLY_LEAVE", label: "早" },
];

export function BulkEditSheet({ open, onClose, dates, semesterId, onDone }: Props) {
  const [status, setStatus] = useState<BulkStatus | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const bulkMark = useBulkMarkAttendance();
  const bulkClear = useBulkClearAttendance();
  const bulkCreateSuspensions = useBulkCreateTimetableSuspensions();
  const bulkRemoveSuspensions = useBulkRemoveTimetableSuspensions();
  const dateLabel = useMemo(() => formatDateList(dates), [dates]);
  const anyPending = bulkMark.isPending || bulkClear.isPending || bulkCreateSuspensions.isPending || bulkRemoveSuspensions.isPending;

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  function finish(message: string) {
    showToast(message);
    onDone();
  }

  function handleError(err: unknown) {
    setError(err instanceof Error ? err.message : "操作に失敗しました");
  }

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={`${dates.length}日に一括適用`} stackLevel={1}>
        <p className="text-sm font-bold text-fg-secondary">{dateLabel} の{dates.length}日に一括適用</p>
        {error ? <p className="rounded-xl bg-status-absent/10 p-3 text-sm font-bold text-status-absent">{error}</p> : null}

        <section className="space-y-3">
          <h3 className="text-sm font-bold">出席を一括登録</h3>
          <div className="flex flex-wrap gap-2">
            {statuses.map((item) => (
              <button
                key={item.status}
                type="button"
                onClick={() => setStatus(item.status)}
                className={`grid h-11 w-11 place-items-center rounded-full text-sm font-black transition ${
                  status === item.status ? "bg-accent-500 text-fg-on-accent" : "bg-bg-muted text-fg-secondary hover:text-fg-primary"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-3 text-sm font-bold text-fg-secondary">
            <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
            記録済みも上書きする
          </label>
          <Button
            type="button"
            variant="primary"
            disabled={!status || anyPending}
            onClick={() => {
              if (!status) return;
              setError(null);
              bulkMark.mutate(
                { dates, status, mode: overwrite ? "OVERWRITE" : "FILL" },
                {
                  onSuccess: (result) => finish(markToast(result.upsertedCount, result.skippedExistingCount, result.skippedSuspendedCount)),
                  onError: handleError,
                },
              );
            }}
          >
            この内容で登録
          </Button>
        </section>

        <section className="space-y-3 border-t border-border-subtle pt-4">
          <h3 className="text-sm font-bold">未記録に戻す</h3>
          <Button
            type="button"
            variant="danger"
            disabled={anyPending}
            onClick={() => {
              setError(null);
              bulkClear.mutate(
                { dates },
                { onSuccess: (result) => finish(`${result.deletedCount}件 削除しました`), onError: handleError },
              );
            }}
          >
            選択日の記録をすべて削除
          </Button>
        </section>

        <section className="space-y-3 border-t border-border-subtle pt-4">
          <h3 className="text-sm font-bold">休講</h3>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={100}
            placeholder="理由 (任意)"
            className="min-h-12 w-full rounded-xl border border-border-default bg-bg-muted px-3 text-sm outline-none focus:border-accent-500"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={anyPending}
              onClick={() => {
                setError(null);
                bulkCreateSuspensions.mutate(
                  { dates, reason: reason.trim() || undefined },
                  {
                    onSuccess: (result) => finish(`${result.createdCount}日 休講登録${result.skippedCount > 0 ? ` (${result.skippedCount}日 登録済み)` : ""}`),
                    onError: handleError,
                  },
                );
              }}
            >
              休講にする
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={anyPending}
              onClick={() => {
                setError(null);
                bulkRemoveSuspensions.mutate(
                  { dates },
                  { onSuccess: (result) => finish(`${result.removedCount}日 解除しました`), onError: handleError },
                );
              }}
            >
              休講を解除
            </Button>
          </div>
        </section>
      </BottomSheet>
      <Toast message={toast} />
    </>
  );
}

function markToast(upsertedCount: number, skippedExistingCount: number, skippedSuspendedCount: number) {
  return `${upsertedCount}件 記録しました${skippedExistingCount > 0 ? ` (記録済み ${skippedExistingCount}件 スキップ)` : ""}${skippedSuspendedCount > 0 ? ` (休講日 ${skippedSuspendedCount}件 スキップ)` : ""}`;
}

function formatDateList(dates: string[]) {
  return dates.map((date) => {
    const [, month, day] = date.split("-");
    return `${Number(month)}/${Number(day)}`;
  }).join(", ");
}
