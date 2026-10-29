import { useState } from "react";
import type { OccurrenceDto } from "@atender/shared";
import { ApiError } from "@/api/client";
import { useCreateClassTransfer, useSemesters, useUserTimetables } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { PeriodChips } from "@/components/timetable/PeriodChips";
import { Button, Field, Input, Select, Toggle } from "@/components/ui";
import { jsWeekday } from "@/lib/CalendarDate";
import * as ClassTransferLogic from "@/lib/ClassTransferLogic";

type Props = {
  open: boolean;
  onClose: () => void;
  date: string;
  semesterId: string | null;
  existingOccurrences: OccurrenceDto[];
  targetIsSuspended: boolean;
  onSaved: () => void;
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function ClassTransferSheet(props: Props) {
  return props.open ? <ClassTransferForm key={`${props.date}:${props.semesterId}`} {...props} /> : null;
}

function ClassTransferForm({ open, onClose, date, semesterId, existingOccurrences, targetIsSuspended, onSaved }: Props) {
  const timetables = useUserTimetables();
  const semesters = useSemesters();
  const create = useCreateClassTransfer();
  const timetable = timetables.data?.userTimetables.find((item) => item.semesterId === semesterId) ?? timetables.data?.userTimetables[0];
  const semester = semesters.data?.semesters.find((item) => item.id === timetable?.semesterId);
  const [kind, setKind] = useState<"MOVE_DAY" | "SINGLE">("MOVE_DAY");
  const [selectedDay, setSelectedDay] = useState<number | null | undefined>(undefined);
  const [suspendSourceDate, setSuspendSourceDate] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [courseId, setCourseId] = useState("");
  const [periodIndexes, setPeriodIndexes] = useState<number[]>([]);
  const sourceDay = selectedDay === undefined ? ClassTransferLogic.defaultSourceDay(date, timetable?.meetings ?? []) : selectedDay;
  const sourceDate = selectedDate ?? (sourceDay != null && semester ? ClassTransferLogic.defaultSourceDate(date, sourceDay, semester.startDate) : "");
  const sameDay = sourceDay === jsWeekday(date);
  const rows = timetable
    ? kind === "MOVE_DAY"
      ? sourceDay == null ? [] : ClassTransferLogic.previewMoveDay(date, sourceDay, timetable, existingOccurrences)
      : courseId ? ClassTransferLogic.previewSingle(periodIndexes, courseId, timetable, existingOccurrences) : []
    : [];
  const canSubmit = ClassTransferLogic.canSubmit(rows) && (kind === "MOVE_DAY"
    ? sourceDay != null && !sameDay && (!suspendSourceDate || sourceDate !== "")
    : courseId !== "" && periodIndexes.length > 0);
  const courses = timetable?.courses.filter((course) => timetable.meetings.some((meeting) => meeting.courseId === course.id)) ?? [];
  const errorMessage = create.error instanceof ApiError
    ? ({
      PERIOD_CONFLICT: "その時限には既に授業変更があります",
      DISPLACED_HAS_RECORD: "出欠記録がある授業を置き換えることはできません。先に記録を消してください",
      DAY_SUSPENDED: "この日は休講です",
    } as Record<string, string>)[create.error.code] ?? create.error.message
    : create.error?.message;

  function submit() {
    if (!canSubmit || create.isPending) return;
    const common = { date, ...(semesterId != null ? { semesterId } : {}), liftTargetSuspension: targetIsSuspended };
    if (kind === "MOVE_DAY" && sourceDay != null) {
      create.mutate({
        ...common,
        kind: "MOVE_DAY",
        sourceDayOfWeek: sourceDay,
        suspendSourceDate,
        ...(suspendSourceDate ? { sourceDate } : {}),
      }, { onSuccess: () => onSaved() });
    } else if (kind === "SINGLE") {
      create.mutate({ ...common, kind: "SINGLE", courseId, periodIndexes: [...new Set(periodIndexes)].sort((a, b) => a - b) }, { onSuccess: () => onSaved() });
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="授業変更" stackLevel={2}>
      <div data-testid="class-transfer-sheet" className="space-y-4">
        {!timetable ? <p className="text-sm text-fg-secondary">時間割がありません</p> : (
          <>
            <div className="flex gap-2">
              <Button type="button" aria-pressed={kind === "MOVE_DAY"} variant={kind === "MOVE_DAY" ? "primary" : "secondary"} onClick={() => setKind("MOVE_DAY")}>曜日ごと</Button>
              <Button type="button" aria-pressed={kind === "SINGLE"} variant={kind === "SINGLE" ? "primary" : "secondary"} onClick={() => setKind("SINGLE")}>コマごと</Button>
            </div>
            {kind === "MOVE_DAY" ? (
              <>
                <section className="space-y-2">
                  <h3 className="text-sm font-bold text-fg-secondary">曜日</h3>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                      <Button key={day} type="button" size="sm" aria-pressed={sourceDay === day} variant={sourceDay === day ? "primary" : "secondary"} onClick={() => { setSelectedDay(day); setSelectedDate(null); }}>{WEEKDAYS[day]}</Button>
                    ))}
                  </div>
                </section>
                <section className="space-y-2">
                  <h3 className="text-sm font-bold text-fg-secondary">この日に置く授業</h3>
                  {sameDay ? <p className="text-sm text-fg-tertiary">この日と同じ曜日です</p> : rows.length === 0 ? <p className="text-sm text-fg-tertiary">この曜日に授業はありません</p> : <PreviewRows rows={rows} />}
                </section>
                <Toggle label="元の日を休講にする" checked={suspendSourceDate} onChange={setSuspendSourceDate} />
                {suspendSourceDate ? <Input type="date" min={semester?.startDate} max={semester?.endDate} value={sourceDate} onChange={(event) => setSelectedDate(event.currentTarget.value)} /> : null}
              </>
            ) : (
              <>
                <Field label="科目">
                  <Select value={courseId} onChange={(event) => { setCourseId(event.currentTarget.value); setPeriodIndexes([]); }}>
                    <option value="">科目を選択</option>
                    {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                  </Select>
                </Field>
                <section className="space-y-2">
                  <h3 className="text-sm font-bold text-fg-secondary">時限</h3>
                  <PeriodChips periodCount={timetable.daySlots.length} value={periodIndexes} onChange={setPeriodIndexes} />
                </section>
                <PreviewRows rows={rows} />
              </>
            )}
            {targetIsSuspended ? <p className="text-xs text-fg-tertiary">この日の休講は解除されます</p> : null}
          </>
        )}
        {errorMessage ? <p className="text-sm text-status-absent">{errorMessage}</p> : null}
        <Button type="button" variant="primary" data-testid="class-transfer-submit" disabled={!canSubmit || create.isPending} onClick={submit}>{kind === "MOVE_DAY" ? "この日に反映" : "追加"}</Button>
      </div>
    </BottomSheet>
  );
}

function PreviewRows({ rows }: { rows: ClassTransferLogic.ClassTransferPreviewRow[] }) {
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="flex items-center justify-between gap-3 text-sm">
          <span>{row.periodCount > 1 ? `${row.periodIndex}-${row.periodIndex + row.periodCount - 1}限` : `${row.periodIndex}限`} {row.courseName}</span>
          {row.blockedBy ? <span className="text-status-absent">{row.blockedBy}</span> : row.replaces ? <span className="text-fg-tertiary">→ {row.replaces}</span> : null}
        </div>
      ))}
    </div>
  );
}
