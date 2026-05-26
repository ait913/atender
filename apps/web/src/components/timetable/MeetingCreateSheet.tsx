import { useEffect, useState } from "react";
import type { UserTimetableDto } from "@atender/shared";
import { useCreateCourse, useCreateMeetingsBulk } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input, Select } from "@/components/ui";
import { PeriodChips } from "./PeriodChips";
import { PeriodChipsPreview } from "./PeriodChipsPreview";

const colors = ["#10b981", "#60a5fa", "#f472b6", "#8b5cf6", "#f59e0b"];
const NEW_COURSE_VALUE = "__new_course__";

export function MeetingCreateSheet({
  open,
  onClose,
  timetable,
  initialDayOfWeek,
  initialPeriod,
}: {
  open: boolean;
  onClose: () => void;
  timetable: UserTimetableDto | null;
  initialDayOfWeek: number;
  initialPeriod: number;
}) {
  const bulk = useCreateMeetingsBulk();
  const createCourse = useCreateCourse();
  const [form, setForm] = useState({
    courseId: NEW_COURSE_VALUE,
    name: "",
    teacher: "",
    room: "",
    dayOfWeek: initialDayOfWeek,
    periods: [initialPeriod],
  });
  useEffect(() => {
    setForm((current) => ({ ...current, dayOfWeek: initialDayOfWeek, periods: [initialPeriod] }));
  }, [initialDayOfWeek, initialPeriod, open]);
  const periodCount = timetable?.daySlots.length ?? 5;
  const isNewCourse = form.courseId === NEW_COURSE_VALUE;
  const isPending = createCourse.isPending || bulk.isPending;

  async function handleSubmit() {
    if (!timetable) return;
    const courseId = isNewCourse
      ? (await createCourse.mutateAsync({
        userTimetableId: timetable.id,
        name: form.name,
        teacher: form.teacher || undefined,
        room: form.room || undefined,
        totalSessions: 15,
        color: colors[timetable.courses.length % colors.length],
      })).course.id
      : form.courseId;

    bulk.mutate({
      userTimetableId: timetable.id,
      courseId,
      dayOfWeek: form.dayOfWeek,
      startPeriodIndexes: form.periods,
    }, { onSuccess: onClose });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="授業を追加">
      <Field label="授業">
        <Select value={form.courseId} onChange={(event) => setForm({ ...form, courseId: event.currentTarget.value })}>
          <option value={NEW_COURSE_VALUE}>新規作成</option>
          {timetable?.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
        </Select>
      </Field>
      {isNewCourse && (
        <>
          <Field label="授業名" required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.currentTarget.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="先生"><Input value={form.teacher} onChange={(event) => setForm({ ...form, teacher: event.currentTarget.value })} /></Field>
            <Field label="教室"><Input value={form.room} onChange={(event) => setForm({ ...form, room: event.currentTarget.value })} /></Field>
          </div>
        </>
      )}
      <Field label="曜日">
        <Select value={form.dayOfWeek} onChange={(event) => setForm({ ...form, dayOfWeek: Number(event.currentTarget.value) })}>
          {["日", "月", "火", "水", "木", "金", "土"].map((day, index) => <option key={day} value={index}>{day}</option>)}
        </Select>
      </Field>
      <Field label="時限 (複数選択可)">
        <PeriodChips value={form.periods} onChange={(periods) => setForm({ ...form, periods })} periodCount={periodCount} />
      </Field>
      <PeriodChipsPreview periods={form.periods} />
      <div className="sticky bottom-0 -mx-5 flex justify-end gap-3 border-t border-border-subtle bg-bg-elevated px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
        <Button
          type="button"
          variant="primary"
          disabled={!timetable || (isNewCourse && !form.name) || form.periods.length === 0 || isPending}
          onClick={handleSubmit}
        >
          保存
        </Button>
      </div>
    </BottomSheet>
  );
}
