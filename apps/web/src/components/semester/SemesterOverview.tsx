import { useEffect, useState } from "react";
import { useMe, useSemesterOverview } from "@/api/hooks";
import { HomeSemesterPicker } from "@/components/home/HomeSemesterPicker";
import { Panel } from "@/components/ui";
import { AttendanceCalendar } from "./AttendanceCalendar";
import { CourseDetailModal } from "./CourseDetailModal";
import { CourseListItem } from "./CourseListItem";
import { OverallRateCard } from "./OverallRateCard";

export function SemesterOverview() {
  const me = useMe();
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const overview = useSemesterOverview(semesterId);
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);

  useEffect(() => {
    if (semesterId == null && me.data?.user.defaultSemesterId) setSemesterId(me.data.user.defaultSemesterId);
  }, [me.data?.user.defaultSemesterId, semesterId]);

  if (overview.isLoading) return <Panel>読み込み中...</Panel>;
  if (!overview.data) return <Panel>学期を選択してください。</Panel>;

  const { startDate, endDate, overall, days, courses } = overview.data;

  return (
    <div className="space-y-4 pb-6">
      <header className="flex items-baseline justify-between gap-2">
        <HomeSemesterPicker semesterId={semesterId} onChange={setSemesterId} />
        <p className="text-xs text-fg-tertiary">期間 {formatJp(startDate)} 〜 {formatJp(endDate)}</p>
      </header>
      <section className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <OverallRateCard overall={overall} />
        <AttendanceCalendar days={days} startDate={startDate} endDate={endDate} />
      </section>
      <section>
        <h2 className="mb-2 text-sm font-bold">科目一覧</h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {courses.map((course) => (
            <li key={course.courseId}>
              <CourseListItem stats={course} onClick={() => setOpenCourseId(course.courseId)} />
            </li>
          ))}
        </ul>
        {courses.length === 0 ? <Panel>科目がまだありません</Panel> : null}
      </section>
      <CourseDetailModal courseId={openCourseId} onClose={() => setOpenCourseId(null)} />
    </div>
  );
}

function formatJp(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}
