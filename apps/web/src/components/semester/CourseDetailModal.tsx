import { useMemo, useState } from "react";
import type { CourseDto, UserTimetableDto } from "@atender/shared";
import { useMe, useUserTimetables } from "@/api/hooks";
import { Button, FullScreenModal, Panel } from "@/components/ui";
import { CourseEditModal } from "./CourseEditModal";
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
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-3xl bg-bg-elevated p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-bold">{course.name}</h3>
          <p className="mt-1 text-sm text-fg-secondary">{course.teacher ?? "先生未設定"}</p>
          {course.note ? <p className="mt-3 whitespace-pre-wrap text-sm text-fg-secondary">{course.note}</p> : null}
        </div>
        <Button type="button" variant="primary" onClick={() => setOpen(true)}>編集</Button>
      </div>
      <CourseEditModal open={open} onClose={() => setOpen(false)} timetableId={timetable.id} course={course} />
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
