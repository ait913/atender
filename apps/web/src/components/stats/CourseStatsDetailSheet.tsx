import type { CourseStatsDto } from "@atender/shared";
import { BottomSheet } from "@/components/sheet/BottomSheet";

export function CourseStatsDetailSheet({ open, course, onClose }: { open: boolean; course: CourseStatsDto | null; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={course?.courseName ?? "出席履歴"}>
      {course ? (
        <div className="grid gap-3 text-sm">
          <p className="text-fg-secondary">履歴一覧は現在の StatsResponse に含まれていません。</p>
          <div className="rounded-md bg-bg-muted p-3">
            <p>生成済み: {course.generatedOccurrences} 件</p>
            <p>未記録: {course.counts.unrecorded} 件</p>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}
