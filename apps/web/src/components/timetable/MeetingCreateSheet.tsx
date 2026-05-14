import { useState } from "react";
import type { UserTimetableDto } from "@atender/shared";
import { useCreateCourse, useCreateMeeting } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input, Select } from "@/components/ui";
import { MeetingEditForm } from "./MeetingEditForm";
import { coursePalette } from "./helpers";

export function MeetingCreateSheet({
  open,
  onClose,
  userTimetable,
  dayOfWeek,
  periodIndex,
}: {
  open: boolean;
  onClose: () => void;
  userTimetable: UserTimetableDto | null;
  dayOfWeek: number;
  periodIndex: number;
}) {
  const [createCourse, setCreateCourse] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [room, setRoom] = useState("");
  const [color, setColor] = useState(coursePalette[0]);
  const courseMutation = useCreateCourse(userTimetable?.id);
  const meetingMutation = useCreateMeeting(userTimetable?.id, userTimetable?.semesterId);

  if (!userTimetable) return null;

  return (
    <BottomSheet open={open} onClose={onClose} title="授業を追加">
      <div className="grid gap-4">
        <Button variant="secondary" onClick={() => setCreateCourse((value) => !value)}>{createCourse ? "既存科目を選ぶ" : "新規 Course を作成"}</Button>
        {createCourse ? (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              courseMutation.mutate(
                { userTimetableId: userTimetable.id, name: courseName, teacher: teacher || undefined, room: room || undefined, color, totalSessions: 15 },
                {
                  onSuccess: ({ course }) => {
                    meetingMutation.mutate({ userTimetableId: userTimetable.id, courseId: course.id, dayOfWeek, startPeriodIndex: periodIndex, periodCount: 1 }, { onSuccess: onClose });
                  },
                },
              );
            }}
          >
            <Field label="科目名"><Input value={courseName} onChange={(event) => setCourseName(event.target.value)} required /></Field>
            <Field label="教師"><Input value={teacher} onChange={(event) => setTeacher(event.target.value)} /></Field>
            <Field label="教室"><Input value={room} onChange={(event) => setRoom(event.target.value)} /></Field>
            <Field label="色">
              <Select value={color} onChange={(event) => setColor(event.target.value)}>
                {coursePalette.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </Field>
            <Button type="submit">保存</Button>
          </form>
        ) : (
          <MeetingEditForm
            userTimetable={userTimetable}
            initial={{ dayOfWeek, startPeriodIndex: periodIndex, periodCount: 1 }}
            onSubmit={(value) => meetingMutation.mutate({ userTimetableId: userTimetable.id, ...value }, { onSuccess: onClose })}
          />
        )}
      </div>
    </BottomSheet>
  );
}
