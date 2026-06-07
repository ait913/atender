import dayjs from "dayjs";
import { Edit3, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { CourseSuspensionDto, OccurrenceDto, PersonalEventDto } from "@atender/shared";
import {
  useCreateCourseSuspension,
  useCreateTimetableSuspension,
  useDayDetail,
  useDeleteAttendance,
  useDeleteCourseSuspension,
  useDeletePersonalEvent,
  useDeleteTimetableSuspension,
  usePatchAttendance,
} from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Input, ListSkeleton } from "@/components/ui";
import { PersonalEventEditModal } from "./PersonalEventEditModal";

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

export function DayDetailSheet({ date, semesterId, onClose }: Props) {
  const detail = useDayDetail(date);
  const createTimetableSuspension = useCreateTimetableSuspension(date);
  const deleteTimetableSuspension = useDeleteTimetableSuspension(date);
  const deleteEvent = useDeletePersonalEvent(date);
  const [reason, setReason] = useState("");
  const [editingEvent, setEditingEvent] = useState<PersonalEventDto | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const data = detail.data;
  const title = date ? dayjs(date).format("YYYY年M月D日 (ddd)") : "";
  const timetableSuspension = data?.timetableSuspension ?? null;

  async function handleTimetableToggle() {
    if (!date) return;
    if (timetableSuspension) {
      await deleteTimetableSuspension.mutateAsync(timetableSuspension.id);
      return;
    }
    await createTimetableSuspension.mutateAsync({ date, reason: reason.trim() || undefined });
    setReason("");
  }

  return (
    <BottomSheet open={date != null} onClose={onClose} title={title} stackLevel={1}>
      {detail.isLoading ? <ListSkeleton rows={3} /> : null}
      {data ? (
        <>
          <section className="rounded-2xl bg-bg-muted/50 p-4">
            <label className="flex min-h-12 items-center justify-between gap-3 text-sm font-bold">
              <span>この日を休講にする (時間割全体)</span>
              <input
                type="checkbox"
                checked={timetableSuspension != null}
                onChange={() => void handleTimetableToggle()}
                disabled={createTimetableSuspension.isPending || deleteTimetableSuspension.isPending}
                className="h-5 w-5 accent-accent-500"
              />
            </label>
            {timetableSuspension ? (
              <p className="mt-2 text-xs font-bold text-status-cancelled">休講中{timetableSuspension.reason ? `: ${timetableSuspension.reason}` : ""}</p>
            ) : (
              <Input
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder="理由 (任意)"
                maxLength={100}
                className="mt-2"
              />
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-bold">授業 ({data.occurrences.length})</h3>
            <div className="space-y-2">
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

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold">予定 ({data.personalEvents.length})</h3>
              <Button type="button" size="sm" variant="secondary" onClick={() => setCreatingEvent(true)}>
                <Plus className="h-4 w-4" />追加
              </Button>
            </div>
            <div className="space-y-2">
              {data.personalEvents.map((event) => (
                <div key={event.id} className="flex items-center gap-2 rounded-2xl bg-bg-muted/50 px-3 py-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: event.color ?? "var(--color-accent-500)" }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{event.title}</p>
                    <p className="text-xs text-fg-tertiary">{event.isAllDay ? "終日" : `${minuteLabel(event.startMinute)} - ${minuteLabel(event.endMinute)}`}</p>
                  </div>
                  <IconButton label="編集" onClick={() => setEditingEvent(event)}><Edit3 className="h-4 w-4" /></IconButton>
                  <IconButton label="削除" danger onClick={() => deleteEvent.mutate(event.id)}><Trash2 className="h-4 w-4" /></IconButton>
                </div>
              ))}
              {data.personalEvents.length === 0 ? (
                <p className="rounded-2xl bg-bg-muted/50 px-3 py-3 text-xs text-fg-tertiary">予定はありません</p>
              ) : null}
            </div>
          </section>
          {date ? (
            <>
              <PersonalEventEditModal
                open={creatingEvent}
                onClose={() => setCreatingEvent(false)}
                date={date}
                semesterId={semesterId}
              />
              <PersonalEventEditModal
                open={editingEvent != null}
                onClose={() => setEditingEvent(null)}
                date={date}
                event={editingEvent}
                semesterId={semesterId}
              />
            </>
          ) : null}
        </>
      ) : null}
      {detail.error ? <p className="rounded-2xl bg-status-absent/15 px-3 py-2 text-xs font-bold text-status-absent">{detail.error.message}</p> : null}
    </BottomSheet>
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

function IconButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-full hover:bg-fg-primary/10 ${danger ? "text-status-absent" : "text-fg-secondary"}`}
    >
      {children}
    </button>
  );
}

function minuteLabel(value: number | null) {
  if (value == null) return "";
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${hour}:${String(minute).padStart(2, "0")}`;
}
