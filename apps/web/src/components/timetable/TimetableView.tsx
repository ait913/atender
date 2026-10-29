import { Fragment, useMemo } from "react";
import type { DaySlotDto } from "@atender/shared";
import { EventTile } from "@/components/event-tile";
import { coalesceTimetableEvents } from "@/lib/coalesceTimetableEvents";
import { EmptyCell } from "./EmptyCell";
import { PeriodLabel } from "./PeriodLabel";

export type TimetableEventInput = {
  id: string;
  dayOfWeek: number;
  startPeriodIndex: number;
  periodCount: number;
  color: string;
  title: string;
  subtitle?: string;
  mergeKey?: string;
};

export type TimetableViewProps = {
  daySlots: DaySlotDto[];
  events: TimetableEventInput[];
  days?: number[];
  onEventClick?: (eventId: string) => void;
  onEmptyCellClick?: (dayOfWeek: number, periodIndex: number) => void;
  height?: string;
  todayDisplayDay?: number | null;
  currentPeriodIndex?: number | null;
};

const DEFAULT_DAYS = [1, 2, 3, 4, 5];
const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

export function TimetableView({
  daySlots,
  events,
  days = DEFAULT_DAYS,
  onEventClick,
  onEmptyCellClick,
  height,
  todayDisplayDay,
  currentPeriodIndex,
}: TimetableViewProps) {
  const slotByIndex = useMemo(() => new Map(daySlots.map((slot) => [slot.periodIndex, slot])), [daySlots]);
  const periodIndexes = useMemo(() => daySlots.map((s) => s.periodIndex).sort((a, b) => a - b), [daySlots]);
  const coalescedEvents = useMemo(() => coalesceTimetableEvents(events), [events]);

  const eventGroups = useMemo(() => {
    const map = new Map<string, { events: TimetableEventInput[]; maxSpan: number }>();
    for (const event of coalescedEvents) {
      if (!days.includes(event.dayOfWeek)) continue;
      if (!periodIndexes.includes(event.startPeriodIndex)) continue;
      const key = `${event.dayOfWeek}:${event.startPeriodIndex}`;
      const group = map.get(key) ?? { events: [], maxSpan: 1 };
      group.events.push(event);
      group.maxSpan = Math.max(group.maxSpan, event.periodCount);
      map.set(key, group);
    }
    return map;
  }, [coalescedEvents, days, periodIndexes]);

  const occupiedSet = useMemo(() => {
    const set = new Set<string>();
    for (const event of coalescedEvents) {
      if (!days.includes(event.dayOfWeek)) continue;
      const startRowIndex = periodIndexes.indexOf(event.startPeriodIndex);
      if (startRowIndex < 0) continue;
      for (let i = 0; i < event.periodCount; i++) {
        const periodIndex = periodIndexes[startRowIndex + i];
        if (periodIndex == null) continue;
        set.add(`${event.dayOfWeek}:${periodIndex}`);
      }
    }
    return set;
  }, [coalescedEvents, days, periodIndexes]);

  const rowCount = periodIndexes.length;
  const currentRow = currentPeriodIndex == null ? -1 : periodIndexes.indexOf(currentPeriodIndex);
  const todayColumn = todayDisplayDay == null ? -1 : days.indexOf(todayDisplayDay);
  const currentBlock = coalescedEvents.find((event) => {
    const startRow = periodIndexes.indexOf(event.startPeriodIndex);
    return event.dayOfWeek === todayDisplayDay && startRow >= 0 && startRow <= currentRow && currentRow < startRow + event.periodCount;
  });
  const ringRow = currentBlock ? periodIndexes.indexOf(currentBlock.startPeriodIndex) : currentRow;
  const ringSpan = currentBlock ? Math.min(currentBlock.periodCount, rowCount - ringRow) : 1;

  return (
    <div
      className="grid w-full overflow-hidden rounded-md border-l border-t border-border-subtle"
      style={{
        gridTemplateColumns: `44px repeat(${days.length}, minmax(0, 1fr))`,
        gridTemplateRows: `28px repeat(${rowCount}, minmax(0, 1fr))`,
        height: height ?? "calc(100dvh - var(--self-tt-chrome, 352px) - env(safe-area-inset-bottom, 0px))",
        minHeight: "320px",
      }}
    >
      {/* 左上の空白 */}
      <div
        className="border-b border-r border-border-subtle bg-bg-muted"
        style={{ gridColumn: "1", gridRow: "1" }}
      />
      {/* 曜日の見出し */}
      {days.map((dayOfWeek, dayIndex) => (
        <div
          key={`h-${dayOfWeek}`}
          data-today={dayOfWeek === todayDisplayDay ? "true" : undefined}
          className={`border-b border-r border-border-subtle text-center text-[11px] leading-[28px] ${dayOfWeek === todayDisplayDay ? "font-bold text-accent-500" : "bg-bg-muted font-semibold"}`}
          style={{ gridColumn: `${dayIndex + 2}`, gridRow: "1", background: dayOfWeek === todayDisplayDay ? "color-mix(in srgb, var(--color-accent-500) 6%, transparent)" : undefined }}
        >
          {DAY_LABELS[dayOfWeek - 1] ?? ""}
        </div>
      ))}
      {/* 時限の行 */}
      {periodIndexes.map((periodIndex, periodRowIndex) => {
        const slot = slotByIndex.get(periodIndex);
        if (!slot) return null;
        return (
          <Fragment key={periodIndex}>
            <div
              data-current={periodIndex === currentPeriodIndex ? "true" : undefined}
              className={`border-b border-r border-border-subtle ${periodIndex === currentPeriodIndex ? "bg-accent-500 text-fg-on-accent" : "bg-bg-muted"}`}
              style={{ gridColumn: "1", gridRow: `${periodRowIndex + 2}` }}
            >
              <PeriodLabel slot={slot} current={periodIndex === currentPeriodIndex} />
            </div>
            {days.map((dayOfWeek, dayIndex) => {
              const key = `${dayOfWeek}:${periodIndex}`;
              const isOccupied = occupiedSet.has(key);
              return (
                <div
                  key={key}
                  className="border-b border-r border-border-subtle p-0.5"
                  style={{ gridColumn: `${dayIndex + 2}`, gridRow: `${periodRowIndex + 2}` }}
                >
                  {!isOccupied && onEmptyCellClick ? (
                    <EmptyCell onClick={() => onEmptyCellClick(dayOfWeek, periodIndex)} />
                  ) : null}
                </div>
              );
            })}
          </Fragment>
        );
      })}
      {Array.from(eventGroups.entries()).map(([key, group]) => {
        const [dayOfWeekText, startPeriodIndexText] = key.split(":");
        const dayOfWeek = Number(dayOfWeekText);
        const startPeriodIndex = Number(startPeriodIndexText);
        const dayColumnIndex = days.indexOf(dayOfWeek);
        const startRowIndex = periodIndexes.indexOf(startPeriodIndex);
        if (dayColumnIndex < 0 || startRowIndex < 0) return null;
        const span = Math.min(group.maxSpan, rowCount - startRowIndex);
        return (
          <div
            key={`event-${key}`}
            className="z-[1] flex min-h-0 min-w-0 gap-0.5 p-0.5"
            style={{
              gridColumn: `${dayColumnIndex + 2}`,
              gridRow: `${startRowIndex + 2} / span ${span}`,
            }}
          >
            {group.events.map((event) => (
              <EventTile
                key={event.id}
                density="compact"
                align="top"
                color={event.color}
                title={event.title}
                subtitle={event.subtitle}
                className="h-full w-full min-w-0 flex-1"
                radius="var(--radius-timetable-cell)"
                onClick={() => onEventClick?.(event.id)}
                ariaLabel={`${event.title}${event.subtitle ? ` / ${event.subtitle}` : ""}`}
              />
            ))}
          </div>
        );
      })}
      {todayColumn >= 0 && currentRow >= 0 ? (
        <div
          data-testid="timetable-now-ring"
          aria-hidden
          className="pointer-events-none z-[2] border-2 border-accent-500"
          style={{ gridColumn: `${todayColumn + 2}`, gridRow: `${ringRow + 2} / span ${ringSpan}` }}
        />
      ) : null}
    </div>
  );
}
