import { useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);
  const courseMutation = useCreateCourse(userTimetable?.id);
  const meetingMutation = useCreateMeeting(userTimetable?.id, userTimetable?.semesterId);
  const pending = courseMutation.isPending || meetingMutation.isPending;

  if (!userTimetable) return null;

  return (
    <BottomSheet open={open} onClose={onClose} title="授業を追加" closeDisabled={pending}>
      <div className="grid gap-4">
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-status-absent">{error}</p> : null}
        <Button variant={createCourse ? "secondary" : "primary"} icon={!createCourse ? <Plus className="h-4 w-4" /> : undefined} disabled={pending} onClick={() => setCreateCourse((value) => !value)}>
          {createCourse ? "既存科目を選ぶ" : "新規 Course を作成"}
        </Button>
        {createCourse ? (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              courseMutation.mutate(
                { userTimetableId: userTimetable.id, name: courseName, teacher: teacher || undefined, room: room || undefined, color, totalSessions: 15 },
                {
                  onSuccess: ({ course }) => {
                    meetingMutation.mutate(
                      { userTimetableId: userTimetable.id, courseId: course.id, dayOfWeek, startPeriodIndex: periodIndex, periodCount: 1 },
                      { onSuccess: onClose, onError: () => setError("授業を追加できませんでした") },
                    );
                  },
                  onError: () => setError("科目を作成できませんでした"),
                },
              );
            }}
          >
            <Field label="科目名"><Input value={courseName} onChange={(event) => setCourseName(event.target.value)} required disabled={pending} /></Field>
            <Field label="教師"><Input value={teacher} onChange={(event) => setTeacher(event.target.value)} disabled={pending} /></Field>
            <Field label="教室"><Input value={room} onChange={(event) => setRoom(event.target.value)} disabled={pending} /></Field>
            <Field label="色">
              <Select value={color} onChange={(event) => setColor(event.target.value)} disabled={pending}>
                {coursePalette.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </Field>
            <Button type="submit" disabled={pending} icon={pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : undefined}>{pending ? "保存中..." : "保存"}</Button>
          </form>
        ) : (
          <MeetingEditForm
            userTimetable={userTimetable}
            initial={{ dayOfWeek, startPeriodIndex: periodIndex, periodCount: 1 }}
            submitting={pending}
            onSubmit={(value) => {
              setError(null);
              meetingMutation.mutate({ userTimetableId: userTimetable.id, ...value }, { onSuccess: onClose, onError: () => setError("授業を追加できませんでした") });
            }}
          />
        )}
      </div>
    </BottomSheet>
  );
}
