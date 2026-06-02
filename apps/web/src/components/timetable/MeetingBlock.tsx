import type { CourseDto } from "@atender/shared";
import { EventTile } from "@/components/event-tile";

export function MeetingBlock({ course, onClick }: { course: CourseDto; onClick?: () => void }) {
  const color = course.color ?? "#F97316";
  return (
    <EventTile
      density="compact"
      color={color}
      title={course.name}
      subtitle={course.room ?? course.teacher}
      onClick={onClick}
      className="h-full"
      radius="var(--radius-timetable-cell)"
    />
  );
}
