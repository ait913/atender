import { useEffect, useState } from "react";
import type { CourseDto } from "@atender/shared";
import { useCreateCourse, useUpdateCourse } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { coursePalette } from "@/components/timetable/helpers";

export function CourseEditorSheet({ open, onClose, userTimetableId, semesterId, course }: { open: boolean; onClose: () => void; userTimetableId?: string; semesterId?: string; course?: CourseDto | null }) {
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [room, setRoom] = useState("");
  const [color, setColor] = useState(coursePalette[0]);
  const [totalSessions, setTotalSessions] = useState(15);
  const [note, setNote] = useState("");
  const create = useCreateCourse(userTimetableId);
  const update = useUpdateCourse(course?.id, userTimetableId, semesterId);

  useEffect(() => {
    setName(course?.name ?? "");
    setTeacher(course?.teacher ?? "");
    setRoom(course?.room ?? "");
    setColor(course?.color ?? coursePalette[0]);
    setTotalSessions(course?.totalSessions ?? 15);
    setNote(course?.note ?? "");
  }, [course]);

  return (
    <BottomSheet open={open} onClose={onClose} title={course ? "科目を編集" : "科目を追加"}>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const body = { name, teacher: teacher || undefined, room: room || undefined, color, totalSessions, note: note || undefined };
          if (course) update.mutate(body, { onSuccess: onClose });
          else if (userTimetableId) create.mutate({ userTimetableId, ...body }, { onSuccess: onClose });
        }}
      >
        <Field label="科目名"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label="教師"><Input value={teacher} onChange={(event) => setTeacher(event.target.value)} /></Field>
        <Field label="教室"><Input value={room} onChange={(event) => setRoom(event.target.value)} /></Field>
        <Field label="色"><Select value={color} onChange={(event) => setColor(event.target.value)}>{coursePalette.map((item) => <option key={item} value={item}>{item}</option>)}</Select></Field>
        <Field label="総授業回数"><Input type="number" min={1} max={60} value={totalSessions} onChange={(event) => setTotalSessions(Number(event.target.value))} /></Field>
        <Field label="メモ"><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></Field>
        <Button type="submit">保存</Button>
      </form>
    </BottomSheet>
  );
}
