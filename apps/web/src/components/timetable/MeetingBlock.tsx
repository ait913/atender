import type { CourseDto, MeetingDto } from "@atender/shared";
import { EventTile } from "@/components/event-tile";

export function MeetingBlock({ course, meeting, onClick }: { course: CourseDto; meeting: MeetingDto; onClick?: () => void }) {
  const color = course.color ?? "#F97316";
  return (
    <EventTile
      density="compact"
      color={color}
      title={course.name}
      subtitle={meeting.room ?? course.teacher}
      onClick={onClick}
      className="h-full"
      radius="var(--radius-timetable-cell)"
    />
  );
}
