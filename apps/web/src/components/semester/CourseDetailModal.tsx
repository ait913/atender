import { useMemo, useState } from "react";
import type { CourseDto, UserTimetableDto } from "@atender/shared";
import { useMe, usePatchUserTimetable, useUserTimetables } from "@/api/hooks";
import { Button, Field, FullScreenModal, Input, Panel, Textarea } from "@/components/ui";
import { CourseOccurrenceHistory } from "./CourseOccurrenceHistory";
import { CourseSuspensionSection } from "./CourseSuspensionSection";
import { DangerZone } from "./DangerZone";

type Props = { courseId: string | null; onClose: () => void };

export function CourseDetailModal({ courseId, onClose }: Props) {
  return (
    <FullScreenModal open={courseId != null} onClose={onClose} title="科目">
      {courseId ? <CourseDetailBody courseId={courseId} onClose={onClose} /> : null}
    </FullScreenModal>
  );
}

function CourseDetailBody({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const me = useMe();
  const timetables = useUserTimetables();
  const found = useMemo(() => findCourse(timetables.data?.userTimetables ?? [], courseId), [courseId, timetables.data?.userTimetables]);
  const semesterId = found?.timetable.semesterId ?? me.data?.user.defaultSemesterId ?? null;

  if (!found) return <Panel>科目が見つかりません</Panel>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <CourseEditSection course={found.course} timetable={found.timetable} />
      <CourseSuspensionSection courseId={courseId} />
      <CourseOccurrenceHistory courseId={courseId} semesterId={semesterId} />
      <DangerZone courseId={courseId} onDeleted={onClose} />
    </div>
  );
}

function CourseEditSection({ course, timetable }: { course: CourseDto; timetable: UserTimetableDto }) {
  const patch = usePatchUserTimetable(timetable.id);
  const [name, setName] = useState(course.name);
  const [teacher, setTeacher] = useState(course.teacher ?? "");
  const [room, setRoom] = useState(course.room ?? "");
  const [color, setColor] = useState(course.color ?? "#F97316");
  const [totalSessions, setTotalSessions] = useState(String(course.totalSessions));
  const [note, setNote] = useState(course.note ?? "");

  async function save() {
    const nextCourses = timetable.courses.map((item) => {
      const base = { ...item, teacher: item.teacher ?? undefined, room: item.room ?? undefined, color: item.color ?? undefined, note: item.note ?? undefined };
      if (item.id !== course.id) return base;
      return {
        ...base,
        name: name.trim() || item.name,
        teacher: teacher.trim() || undefined,
        room: room.trim() || undefined,
        color,
        totalSessions: Math.max(1, Number(totalSessions) || item.totalSessions),
        note: note.trim() || undefined,
      };
    });
    await patch.mutateAsync({ courses: nextCourses, meetings: timetable.meetings });
  }

  return (
    <section className="rounded-3xl bg-bg-elevated p-5 shadow-card">
      <h3 className="mb-3 text-base font-bold">科目編集</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="科目名" className="sm:col-span-2">
          <Input value={name} onChange={(event) => setName(event.currentTarget.value)} maxLength={100} />
        </Field>
        <Field label="先生">
          <Input value={teacher} onChange={(event) => setTeacher(event.currentTarget.value)} maxLength={50} />
        </Field>
        <Field label="教室">
          <Input value={room} onChange={(event) => setRoom(event.currentTarget.value)} maxLength={30} />
        </Field>
        <Field label="色">
          <Input type="color" value={color} onChange={(event) => setColor(event.currentTarget.value)} />
        </Field>
        <Field label="総コマ数">
          <Input type="number" min={1} max={60} value={totalSessions} onChange={(event) => setTotalSessions(event.currentTarget.value)} />
        </Field>
        <Field label="メモ" className="sm:col-span-2">
          <Textarea value={note} onChange={(event) => setNote(event.currentTarget.value)} maxLength={500} />
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="button" variant="primary" disabled={patch.isPending} onClick={() => void save()}>保存</Button>
      </div>
      {patch.error ? <p className="mt-2 rounded-2xl bg-status-absent/15 px-3 py-2 text-xs font-bold text-status-absent">{patch.error.message}</p> : null}
    </section>
  );
}

function findCourse(timetables: UserTimetableDto[], courseId: string) {
  for (const timetable of timetables) {
    const course = timetable.courses.find((item) => item.id === courseId);
    if (course) return { timetable, course };
  }
  return null;
}
