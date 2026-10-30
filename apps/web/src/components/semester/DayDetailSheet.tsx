import dayjs from "dayjs";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import type { AttendanceStatus, CourseSuspensionDto, OccurrenceDto } from "@atender/shared";
import {
  useCreateCourseSuspension,
  useCreateTimetableSuspension,
  useDayDetail,
  useDeleteAttendance,
  useDeleteCourseSuspension,
  useDeleteTimetableSuspension,
  useDeleteClassTransfer,
  useBulkMarkAttendance,
  usePatchAttendance,
} from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, ConfirmDialog, Input, ListSkeleton, statusLongLabels } from "@/components/ui";
import * as ClassTransferLogic from "@/lib/ClassTransferLogic";
import { ClassTransferSheet } from "./ClassTransferSheet";

type Props = {
  date: string | null;
  semesterId?: string | null;
  onClose: () => void;
};

const statuses = [
  { status: "PRESENT", label: "出" },
  { status: "ABSENT", label: "欠" },
  { status: "EXCUSED", label: "公" },
  { status: "TARDY", label: "遅" },
  { status: "EARLY_LEAVE", label: "早" },
  { status: "CANCELLED", label: "休" },
] as const;

const BULK_STATUSES = ["ABSENT", "EXCUSED", "TARDY", "EARLY_LEAVE"] as const;

export function DayDetailSheet({ date, semesterId, onClose }: Props) {
  const detail = useDayDetail(date);
  const createTimetableSuspension = useCreateTimetableSuspension(date);
  const deleteTimetableSuspension = useDeleteTimetableSuspension(date);
  const [reason, setReason] = useState("");
  const deleteTransfer = useDeleteClassTransfer();
  const [transferDate, setTransferDate] = useState<string | null>(null);
  const [transferConfirmation, setTransferConfirmation] = useState<{ id: string; date: string; count: number } | null>(null);
  const resetDeleteTransfer = deleteTransfer.reset;
  useEffect(() => {
    setTransferDate(null);
    setTransferConfirmation(null);
    resetDeleteTransfer();
  }, [date, resetDeleteTransfer]);
  const data = detail.data;
  const title = date ? dayjs(date).format("YYYY年M月D日 (ddd)") : "";
  const timetableSuspension = data?.timetableSuspension ?? null;
  const courseSuspendedIds = new Set(data?.courseSuspensions.map((suspension) => suspension.courseId) ?? []);
  const unrecordedCount = data?.occurrences.filter((occurrence) => occurrence.status == null && !courseSuspendedIds.has(occurrence.courseId)).length ?? 0;
  const occurrenceCount = data?.occurrences.filter((occurrence) => !courseSuspendedIds.has(occurrence.courseId)).length ?? 0;

  async function handleSuspend() {
    if (!date) return;
    await createTimetableSuspension.mutateAsync({ date, reason: reason.trim() || undefined });
    setReason("");
  }

  async function handleUnsuspend() {
    if (!timetableSuspension) return;
    await deleteTimetableSuspension.mutateAsync(timetableSuspension.id);
  }

  function removeTransfer(id: string) {
    setTransferConfirmation(null);
    deleteTransfer.mutate(id);
  }

  return (
    <BottomSheet open={date != null} onClose={onClose} title={title} stackLevel={1}>
      {detail.isLoading ? <ListSkeleton rows={3} /> : null}
      {data ? (
        <>
          <section className="rounded-2xl bg-bg-muted/50 p-4">
            {timetableSuspension ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-bold text-status-cancelled">休講中{timetableSuspension.reason ? `: ${timetableSuspension.reason}` : ""}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={deleteTimetableSuspension.isPending}
                  onClick={() => void handleUnsuspend()}
                >
                  休講を解除
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-bold">この日を休講にする (時間割全体)</p>
                <Input
                  value={reason}
                  onChange={(event) => setReason(event.currentTarget.value)}
                  placeholder="理由 (任意)"
                  maxLength={100}
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    disabled={createTimetableSuspension.isPending}
                    onClick={() => void handleSuspend()}
                  >
                    この日を休講にする
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-2 rounded-2xl bg-bg-muted/50 p-4">
            <h3 className="text-sm font-bold text-fg-secondary">授業変更</h3>
            {(data.transfers ?? []).map((transfer) => (
              <div key={transfer.id} className="flex items-center justify-between gap-3">
                <p className="text-sm">{ClassTransferLogic.summary(transfer, data.occurrences.filter((occurrence) => occurrence.transferId === transfer.id))}</p>
                <Button type="button" variant="ghost" size="sm" disabled={deleteTransfer.isPending} onClick={() => {
                  const count = ClassTransferLogic.needsDeleteConfirmation(transfer, data.occurrences);
                  if (count > 0) setTransferConfirmation({ id: transfer.id, date: data.date, count });
                  else removeTransfer(transfer.id);
                }}>取り消す</Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => setTransferDate(data.date)}>授業変更</Button>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-bold">授業 ({data.occurrences.length})</h3>
            <div className="space-y-2">
              {data.occurrences.length > 0 && timetableSuspension == null ? (
                <DayBulkAttendanceControl date={data.date} occurrenceCount={occurrenceCount} unrecordedCount={unrecordedCount} disabled={false} />
              ) : null}
              {data.occurrences.map((occurrence) => (
                <OccurrenceRow
                  key={occurrence.id}
                  occurrence={occurrence}
                  date={data.date}
                  timetableSuspended={timetableSuspension != null}
                  courseSuspension={data.courseSuspensions.find((suspension) => suspension.courseId === occurrence.courseId) ?? null}
                />
              ))}
              {data.occurrences.length === 0 ? (
                <p className="rounded-2xl bg-bg-muted/50 px-3 py-3 text-xs text-fg-tertiary">授業はありません</p>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
      {detail.error ? <p className="rounded-2xl bg-status-absent/15 px-3 py-2 text-xs font-bold text-status-absent">{detail.error.message}</p> : null}
      {deleteTransfer.error ? <p className="text-sm text-status-absent">{deleteTransfer.error.message}</p> : null}
      {date && data && transferDate === date ? (
        <ClassTransferSheet
          open
          date={date}
          semesterId={semesterId ?? null}
          existingOccurrences={data.occurrences}
          targetIsSuspended={timetableSuspension != null}
          onClose={() => setTransferDate(null)}
          onSaved={() => setTransferDate(null)}
        />
      ) : null}
      <ConfirmDialog
        open={transferConfirmation != null && transferConfirmation.date === date}
        stackLevel={2}
        title={`出欠記録 ${transferConfirmation?.count ?? 0} 件も削除されます`}
        confirmLabel="取り消す"
        onCancel={() => setTransferConfirmation(null)}
        onConfirm={() => { if (transferConfirmation && !deleteTransfer.isPending) removeTransfer(transferConfirmation.id); }}
      />
    </BottomSheet>
  );
}

function DayBulkAttendanceControl({
  date,
  occurrenceCount,
  unrecordedCount,
  disabled,
}: {
  date: string;
  occurrenceCount: number;
  unrecordedCount: number;
  disabled: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const bulk = useBulkMarkAttendance();
  const isDisabled = disabled || bulk.isPending;
  const allRecorded = unrecordedCount === 0;
  const mode = allRecorded ? "OVERWRITE" : "FILL";

  function mark(status: Exclude<AttendanceStatus, "CANCELLED">) {
    bulk.mutate({ dates: [date], status, mode });
    setMenuOpen(false);
  }

  return (
    <div className="relative">
      <div className="flex overflow-hidden rounded-full shadow-card">
        <Button
          type="button"
          variant={allRecorded ? "secondary" : "primary"}
          size="sm"
          disabled={isDisabled}
          onClick={() => mark("PRESENT")}
          className="flex-1 rounded-r-none"
        >
          {allRecorded ? "全部 出席に上書き" : `全部出席にする (${unrecordedCount})`}
        </Button>
        <button
          type="button"
          aria-label="一括記録のステータスを選ぶ"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={isDisabled}
          onClick={() => setMenuOpen((open) => !open)}
          className="grid min-h-10 w-12 place-items-center bg-accent-600 text-fg-on-accent transition hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-2 w-56 rounded-2xl bg-bg-elevated p-2 shadow-card ring-1 ring-fg-primary/8"
        >
          <p className="px-2 pb-2 text-[10px] text-fg-tertiary">
            {allRecorded ? `記録済み ${occurrenceCount} 件をすべて上書きします` : `未記録の ${unrecordedCount} 件のみ。記録済みは変わりません`}
          </p>
          {BULK_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              role="menuitem"
              onClick={() => mark(status)}
              className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-bold text-fg-primary hover:bg-fg-primary/8"
            >
              {allRecorded ? `全部 ${statusLongLabels[status]} に上書き` : `全部 ${statusLongLabels[status]} (${unrecordedCount})`}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OccurrenceRow({
  occurrence,
  date,
  timetableSuspended,
  courseSuspension,
}: {
  occurrence: OccurrenceDto;
  date: string;
  timetableSuspended: boolean;
  courseSuspension: CourseSuspensionDto | null;
}) {
  const patchAttendance = usePatchAttendance(() => {});
  const deleteAttendance = useDeleteAttendance(() => {});
  const createCourseSuspension = useCreateCourseSuspension(occurrence.courseId);
  const deleteCourseSuspension = useDeleteCourseSuspension(occurrence.courseId);
  const disabled = timetableSuspended || courseSuspension != null;
  const badge = timetableSuspended ? "休講中 (時間割全体)" : courseSuspension ? "科目休講中" : null;

  return (
    <div className="rounded-2xl bg-bg-muted/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{occurrence.periodIndex}限 {occurrence.courseName}</p>
          <p className="text-xs text-fg-tertiary">{minuteLabel(occurrence.startMinute)} - {minuteLabel(occurrence.endMinute)}</p>
        </div>
        {badge ? <span className="rounded-full bg-status-cancelled/15 px-3 py-1 text-xs font-bold text-status-cancelled">{badge}</span> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <StatusButton
          label="未"
          active={occurrence.status == null}
          disabled={disabled}
          onClick={() => deleteAttendance.mutate(occurrence.id)}
        />
        {statuses.map((item) => (
          <StatusButton
            key={item.status}
            label={item.label}
            active={occurrence.status === item.status}
            disabled={disabled}
            onClick={() => patchAttendance.mutate({ occurrenceId: occurrence.id, input: { status: item.status } })}
          />
        ))}
        {courseSuspension ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={timetableSuspended || deleteCourseSuspension.isPending}
            onClick={() => deleteCourseSuspension.mutate(courseSuspension.id)}
          >
            科目休講解除
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={timetableSuspended || createCourseSuspension.isPending}
            onClick={() => createCourseSuspension.mutate({ date })}
          >
            科目休講
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusButton({ label, active, disabled, onClick }: { label: string; active: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-9 min-w-9 rounded-full px-3 text-xs font-bold transition disabled:opacity-40 ${
        active ? "bg-accent-500 text-fg-on-accent" : "bg-bg-elevated text-fg-secondary hover:bg-fg-primary/10"
      }`}
    >
      {label}
    </button>
  );
}

function minuteLabel(value: number | null) {
  if (value == null) return "";
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${hour}:${String(minute).padStart(2, "0")}`;
}
