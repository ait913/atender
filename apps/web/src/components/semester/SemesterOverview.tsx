import { useEffect, useState } from "react";
import { useMe, useSemesterOverview } from "@/api/hooks";
import { HomeSemesterPicker } from "@/components/home/HomeSemesterPicker";
import { Panel, SemesterOverviewSkeleton } from "@/components/ui";
import { AttendanceCalendar } from "./AttendanceCalendar";
import { AttendanceRateHero } from "./AttendanceRateHero";
import { BulkActionBar } from "./BulkActionBar";
import { BulkEditSheet } from "./BulkEditSheet";
import { CourseDetailModal } from "./CourseDetailModal";
import { CourseListItem } from "./CourseListItem";
import { DayDetailSheet } from "./DayDetailSheet";

export function SemesterOverview() {
  const me = useMe();
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const overview = useSemesterOverview(semesterId);
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  const [dayDetailDate, setDayDetailDate] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set());
  const [bulkSheetOpen, setBulkSheetOpen] = useState(false);

  useEffect(() => {
    if (semesterId == null && me.data?.user.defaultSemesterId) setSemesterId(me.data.user.defaultSemesterId);
  }, [me.data?.user.defaultSemesterId, semesterId]);

  function clearSelection() {
    setSelectionMode(false);
    setSelectedDates(new Set());
    setBulkSheetOpen(false);
  }

  function changeSemester(nextSemesterId: string | null) {
    setSemesterId(nextSemesterId);
    clearSelection();
  }

  function toggleDate(date: string) {
    setSelectedDates((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  if (overview.isLoading) return <SemesterOverviewSkeleton />;
  if (!overview.data) return <Panel>学期を選択してください。</Panel>;

  const { startDate, endDate, today, requiredAttendanceRate, overall, days, courses } = overview.data;
  const sortedDates = [...selectedDates].sort();

  return (
    <div className="space-y-4 pb-6">
      <header className="flex items-baseline justify-between gap-2">
        <HomeSemesterPicker semesterId={semesterId} onChange={changeSemester} />
        <p className="text-xs text-fg-tertiary">期間 {formatJp(startDate)} 〜 {formatJp(endDate)}</p>
      </header>
      <AttendanceRateHero overall={overall} requiredRate={requiredAttendanceRate} />
      <section className="grid gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <AttendanceCalendar
          days={days}
          startDate={startDate}
          endDate={endDate}
          today={today}
          semesterId={semesterId}
          onSelectDay={setDayDetailDate}
          selectionMode={selectionMode}
          selectedDates={selectedDates}
          onToggleSelectionMode={() => {
            setSelectionMode((value) => {
              if (value) setSelectedDates(new Set());
              return !value;
            });
          }}
          onToggleDate={toggleDate}
        />
        <section>
          <h2 className="mb-2 text-sm font-bold">科目一覧</h2>
          <ul className="grid gap-2">
            {courses.map((course) => (
              <li key={course.courseId}>
                <CourseListItem stats={course} requiredRate={requiredAttendanceRate} onClick={() => setOpenCourseId(course.courseId)} />
              </li>
            ))}
          </ul>
          {courses.length === 0 ? <Panel>科目がまだありません</Panel> : null}
        </section>
      </section>
      {selectionMode ? <BulkActionBar count={selectedDates.size} onOpenSheet={() => setBulkSheetOpen(true)} onCancel={clearSelection} /> : null}
      <BulkEditSheet open={bulkSheetOpen} onClose={() => setBulkSheetOpen(false)} dates={sortedDates} semesterId={semesterId} onDone={clearSelection} />
      <CourseDetailModal courseId={openCourseId} onClose={() => setOpenCourseId(null)} />
      <DayDetailSheet date={dayDetailDate} semesterId={semesterId} onClose={() => setDayDetailDate(null)} />
    </div>
  );
}

function formatJp(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}
