import { useEffect, useMemo, useState } from "react";
import type { CourseDto, MeetingDto, UserTimetableDto } from "@atender/shared";
import { useCreateMeetingsBulk, useUpdateMeeting } from "@/api/hooks";
import { CourseEditModal } from "@/components/semester/CourseEditModal";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input, Select } from "@/components/ui";
import { PeriodChips } from "./PeriodChips";
import { PeriodChipsPreview } from "./PeriodChipsPreview";

const ADD_COURSE_VALUE = "__add_course__";
const dayLabels = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];

type MeetingEditModalProps = {
  open: boolean;
  onClose: () => void;
  timetable: UserTimetableDto;
  mode: "create" | "edit";
  initialDayOfWeek?: number;
  initialPeriod?: number;
  meeting?: MeetingDto | null;
};

function isContiguous(periods: number[]) {
  const sorted = [...new Set(periods)].sort((a, b) => a - b);
  return sorted.every((period, index) => index === 0 || period === sorted[index - 1]! + 1);
}

function toMeetingRange(periods: number[]) {
  const sorted = [...new Set(periods)].sort((a, b) => a - b);
  return {
    startPeriodIndex: sorted[0] ?? 1,
    periodCount: sorted.length,
  };
}

export function MeetingEditModal({ open, onClose, timetable, mode, initialDayOfWeek, initialPeriod, meeting }: MeetingEditModalProps) {
  const bulk = useCreateMeetingsBulk();
  const updateMeeting = useUpdateMeeting(meeting?.id);
  const [courseId, setCourseId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(initialDayOfWeek ?? 1);
  const [periods, setPeriods] = useState<number[]>([initialPeriod ?? 1]);
  const [room, setRoom] = useState("");
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [createdCourses, setCreatedCourses] = useState<CourseDto[]>([]);

  const courses = useMemo(() => {
    const byId = new Map<string, CourseDto>();
    for (const course of timetable.courses) byId.set(course.id, course);
    for (const course of createdCourses) byId.set(course.id, course);
    return [...byId.values()];
  }, [createdCourses, timetable.courses]);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && meeting) {
      setCourseId(meeting.courseId);
      setDayOfWeek(meeting.dayOfWeek);
      setPeriods(Array.from({ length: meeting.periodCount }, (_, index) => meeting.startPeriodIndex + index));
      setRoom(meeting.room ?? "");
      return;
    }
    setCourseId(timetable.courses[0]?.id ?? "");
    setDayOfWeek(initialDayOfWeek ?? 1);
    setPeriods([initialPeriod ?? 1]);
    setRoom("");
  }, [initialDayOfWeek, initialPeriod, meeting, mode, open]);

  const isPending = bulk.isPending || updateMeeting.isPending;
  const canSave = courseId !== "" && courseId !== ADD_COURSE_VALUE && periods.length > 0 && !isPending;
  const periodCount = timetable.daySlots.length;

  function handlePeriodChange(next: number[]) {
    if (mode === "create" || isContiguous(next)) {
      setPeriods(next);
      return;
    }
    const added = next.find((period) => !periods.includes(period));
    setPeriods(added ? [added] : next.slice(-1));
  }

  async function handleSave() {
    if (!canSave) return;
    if (mode === "create") {
      await bulk.mutateAsync({
        userTimetableId: timetable.id,
        courseId,
        dayOfWeek,
        startPeriodIndexes: periods,
        room: room.trim() || undefined,
      });
      onClose();
      return;
    }
    const range = toMeetingRange(periods);
    await updateMeeting.mutateAsync({
      dayOfWeek,
      startPeriodIndex: range.startPeriodIndex,
      periodCount: range.periodCount,
      room: room.trim() ? room.trim() : null,
    });
    onClose();
  }

  const error = bulk.error ?? updateMeeting.error;

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title={mode === "create" ? "授業を追加" : "授業を編集"}
        footer={
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
            <Button type="button" variant="primary" disabled={!canSave} onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <Field label="科目" required>
          <Select
            value={courseId}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === ADD_COURSE_VALUE) {
                setCourseModalOpen(true);
                return;
              }
              setCourseId(value);
            }}
          >
            <option value="" disabled>科目を選択</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            <option value={ADD_COURSE_VALUE}>＋ 科目を追加</option>
          </Select>
        </Field>
        <Field label="曜日">
          {mode === "create" ? (
            <p className="rounded-2xl bg-bg-muted px-4 py-3 text-sm font-bold text-fg-primary">{dayLabels[dayOfWeek]}</p>
          ) : (
            <Select value={dayOfWeek} onChange={(event) => setDayOfWeek(Number(event.currentTarget.value))}>
              {dayLabels.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </Select>
          )}
        </Field>
        <Field label="時限 (複数選択で連続コマ)">
          <PeriodChips value={periods} onChange={handlePeriodChange} periodCount={periodCount} />
        </Field>
        <PeriodChipsPreview periods={periods} />
        <Field label="教室">
          <Input value={room} maxLength={30} onChange={(event) => setRoom(event.currentTarget.value)} />
        </Field>
        {error ? <p className="rounded-2xl bg-status-absent/15 px-3 py-2 text-xs font-bold text-status-absent">{error.message}</p> : null}
      </BottomSheet>
      <CourseEditModal
        open={courseModalOpen}
        onClose={() => setCourseModalOpen(false)}
        timetableId={timetable.id}
        stackLevel={2}
        onSaved={(course) => {
          setCreatedCourses((current) => [...current.filter((item) => item.id !== course.id), course]);
          setCourseId(course.id);
        }}
      />
    </>
  );
}
