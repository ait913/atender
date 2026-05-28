import { useMemo, useState } from "react";
import { usePatchUserTimetable, useUserTimetables } from "@/api/hooks";
import { Button, ConfirmDialog } from "@/components/ui";

type Props = { courseId: string; onDeleted: () => void };

export function DangerZone({ courseId, onDeleted }: Props) {
  const timetables = useUserTimetables();
  const owner = useMemo(() => {
    for (const timetable of timetables.data?.userTimetables ?? []) {
      if (timetable.courses.some((course) => course.id === courseId)) return timetable;
    }
    return null;
  }, [courseId, timetables.data?.userTimetables]);
  const patch = usePatchUserTimetable(owner?.id);
  const [confirming, setConfirming] = useState(false);

  async function deleteCourse() {
    if (!owner) return;
    await patch.mutateAsync({
      courses: owner.courses
        .filter((course) => course.id !== courseId)
        .map((course) => ({ ...course, teacher: course.teacher ?? undefined, room: course.room ?? undefined, color: course.color ?? undefined, note: course.note ?? undefined })),
      meetings: owner.meetings.filter((meeting) => meeting.courseId !== courseId),
    });
    setConfirming(false);
    onDeleted();
  }

  return (
    <section className="rounded-3xl border border-status-absent/30 bg-status-absent/5 p-5">
      <h3 className="mb-3 text-base font-bold text-status-absent">この科目を削除</h3>
      <p className="mb-3 text-xs text-fg-secondary">出席記録・休講日も全て削除されます。元に戻せません。</p>
      <Button type="button" variant="ghost" onClick={() => setConfirming(true)} className="text-status-absent">削除する</Button>
      <ConfirmDialog
        open={confirming}
        title="科目を削除"
        body="出席記録・休講日も全て削除されます。元に戻せません。"
        confirmLabel="削除する"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void deleteCourse()}
      />
    </section>
  );
}
