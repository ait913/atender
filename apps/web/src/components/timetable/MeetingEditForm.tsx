import { useState } from "react";
import type { CourseDto, MeetingDto, UserTimetableDto } from "@atender/shared";
import { Button, Field, NumberStepper, Select, cx } from "@/components/ui";
import { weekdays } from "./helpers";

export type MeetingFormValue = {
  courseId: string;
  dayOfWeek: number;
  startPeriodIndex: number;
  periodCount: number;
};

export function MeetingEditForm({
  userTimetable,
  initial,
  onSubmit,
  submitLabel = "保存",
  submitting = false,
}: {
  userTimetable: UserTimetableDto;
  initial?: Partial<MeetingDto> & { courseId?: string };
  onSubmit: (value: MeetingFormValue) => void;
  submitLabel?: string;
  submitting?: boolean;
}) {
  const firstCourse: CourseDto | undefined = userTimetable.courses[0];
  const [courseId, setCourseId] = useState(initial?.courseId ?? firstCourse?.id ?? "");
  const [dayOfWeek, setDayOfWeek] = useState(initial?.dayOfWeek ?? 1);
  const [startPeriodIndex, setStartPeriodIndex] = useState(initial?.startPeriodIndex ?? 1);
  const [periodCount, setPeriodCount] = useState(initial?.periodCount ?? 1);

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ courseId, dayOfWeek, startPeriodIndex, periodCount });
      }}
    >
      <Field label="科目">
        <Select value={courseId} onChange={(event) => setCourseId(event.target.value)} required disabled={submitting}>
          <option value="">選択してください</option>
          {userTimetable.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="曜日">
          <Select value={dayOfWeek} onChange={(event) => setDayOfWeek(Number(event.target.value))} disabled={submitting}>
            {weekdays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="開始時限">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {userTimetable.daySlots.map((slot) => (
            <button
              key={slot.id}
              type="button"
              className={cx(
                "min-h-11 shrink-0 rounded-md border px-4 text-sm font-semibold transition",
                startPeriodIndex === slot.periodIndex ? "border-accent-500 bg-accent-50 text-accent-700" : "border-border-default bg-bg-elevated text-fg-primary",
              )}
              disabled={submitting}
              onClick={() => setStartPeriodIndex(slot.periodIndex)}
            >
              {slot.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="連続コマ数">
        <NumberStepper value={periodCount} min={1} max={8} onChange={setPeriodCount} disabled={submitting} />
      </Field>
      <Button type="submit" disabled={!courseId || submitting}>{submitting ? "保存中..." : submitLabel}</Button>
    </form>
  );
}
