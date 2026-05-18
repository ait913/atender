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
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ courseId, dayOfWeek, startPeriodIndex, periodCount });
      }}
    >
      <section className="space-y-4">
        <Field label="科目" required>
          <Select value={courseId} onChange={(event) => setCourseId(event.target.value)} required disabled={submitting}>
            <option value="">選択してください</option>
            {userTimetable.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
          </Select>
        </Field>
      </section>
      <section className="space-y-4 pt-5 border-t border-border-subtle">
        <Field label="曜日" required>
          <Select value={dayOfWeek} onChange={(event) => setDayOfWeek(Number(event.target.value))} disabled={submitting}>
            {weekdays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
          </Select>
        </Field>
        <Field label="開始時限" required>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {userTimetable.daySlots.map((slot) => (
              <button
                key={slot.id}
                type="button"
                className={cx(
                  "min-h-11 shrink-0 rounded-md border px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500",
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
        <Field label="連続コマ数" required>
          <NumberStepper value={periodCount} min={1} max={8} onChange={setPeriodCount} disabled={submitting} />
        </Field>
      </section>
      <footer className="sticky bottom-0 -mx-5 px-5 py-3 border-t border-border-subtle bg-bg-elevated" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
        <div className="flex gap-3">
          <Button className="flex-1" type="submit" disabled={!courseId || submitting}>{submitting ? "保存中..." : submitLabel}</Button>
        </div>
      </footer>
    </form>
  );
}
