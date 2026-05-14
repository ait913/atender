import { useState } from "react";
import type { CourseDto, MeetingDto, UserTimetableDto } from "@atender/shared";
import { Button, Field, Input, Select } from "@/components/ui";
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
}: {
  userTimetable: UserTimetableDto;
  initial?: Partial<MeetingDto> & { courseId?: string };
  onSubmit: (value: MeetingFormValue) => void;
  submitLabel?: string;
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
        <Select value={courseId} onChange={(event) => setCourseId(event.target.value)} required>
          <option value="">選択してください</option>
          {userTimetable.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="曜日">
          <Select value={dayOfWeek} onChange={(event) => setDayOfWeek(Number(event.target.value))}>
            {weekdays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
          </Select>
        </Field>
        <Field label="開始時限">
          <Select value={startPeriodIndex} onChange={(event) => setStartPeriodIndex(Number(event.target.value))}>
            {userTimetable.daySlots.map((slot) => <option key={slot.id} value={slot.periodIndex}>{slot.label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="連続コマ数">
        <Input type="number" min={1} max={8} value={periodCount} onChange={(event) => setPeriodCount(Number(event.target.value))} />
      </Field>
      <Button type="submit" disabled={!courseId}>{submitLabel}</Button>
    </form>
  );
}
