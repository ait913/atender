import type { RoomWeekDto } from "@atender/shared";
import { computeAvailabilityMatrix } from "@/lib/availabilityMatrix";

const periods = [
  { periodIndex: 1, startMinute: 540, endMinute: 630 },
  { periodIndex: 2, startMinute: 640, endMinute: 730 },
  { periodIndex: 3, startMinute: 780, endMinute: 870 },
  { periodIndex: 4, startMinute: 880, endMinute: 970 },
  { periodIndex: 5, startMinute: 980, endMinute: 1070 },
];

export function RoomAvailabilityHeatmap({ week }: { week: RoomWeekDto }) {
  const { matrix } = computeAvailabilityMatrix(week, periods);
  const total = Math.max(week.members.length, 1);
  return (
    <div className="grid grid-cols-[56px_repeat(7,1fr)] overflow-hidden rounded-md border-l border-t border-border-subtle text-xs">
      <div className="border-b border-r border-border-subtle bg-bg-muted" />
      {["月", "火", "水", "木", "金", "土", "日"].map((day) => <div key={day} className="border-b border-r border-border-subtle bg-bg-muted p-2 text-center font-semibold">{day}</div>)}
      {periods.map((period, pIndex) => (
        <>
          <div key={`label-${period.periodIndex}`} className="border-b border-r border-border-subtle bg-bg-muted p-2 text-center font-semibold">{period.periodIndex}</div>
          {matrix.map((day, dIndex) => {
            const cell = day[pIndex];
            const allFree = cell.freeCount === total;
            return (
              <button
                key={`${dIndex}-${pIndex}`}
                type="button"
                title={`空き: ${cell.freeMembers.join(", ")} / 埋まり: ${cell.busyMembers.join(", ")}`}
                className={`min-h-12 border-b border-r border-border-subtle text-center font-semibold ${allFree ? "border-accent-500 bg-room-availability-empty text-accent-700" : "text-fg-primary"}`}
                style={allFree ? undefined : { backgroundColor: `color-mix(in srgb, var(--color-accent-500) ${(cell.freeCount / total) * 45}%, white)` }}
              >
                {cell.freeCount}/{total}
              </button>
            );
          })}
        </>
      ))}
    </div>
  );
}
