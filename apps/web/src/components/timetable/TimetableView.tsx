import { Fragment, useMemo } from "react";
import type { DaySlotDto } from "@atender/shared";
import { EventTile } from "@/components/event-tile";
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
};

export type TimetableViewProps = {
  daySlots: DaySlotDto[];
  events: TimetableEventInput[];
  days?: number[];
  onEventClick?: (eventId: string) => void;
  onEmptyCellClick?: (dayOfWeek: number, periodIndex: number) => void;
  height?: string;
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
}: TimetableViewProps) {
  const slotByIndex = useMemo(() => new Map(daySlots.map((slot) => [slot.periodIndex, slot])), [daySlots]);
  const periodIndexes = useMemo(() => daySlots.map((s) => s.periodIndex).sort((a, b) => a - b), [daySlots]);

  // Group events by (dayOfWeek, startPeriodIndex). Multi-event cells render side-by-side.
  const cellEvents = useMemo(() => {
    const map = new Map<string, TimetableEventInput[]>();
    for (const event of events) {
      const key = `${event.dayOfWeek}:${event.startPeriodIndex}`;
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [events]);

  // Compute which (dayOfWeek, periodIndex) cells are "occupied" by a continuing multi-period event.
  const continuationSet = useMemo(() => {
    const set = new Set<string>();
    for (const event of events) {
      for (let i = 1; i < event.periodCount; i++) {
        set.add(`${event.dayOfWeek}:${event.startPeriodIndex + i}`);
      }
    }
    return set;
  }, [events]);

  const rowCount = periodIndexes.length;

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
      {/* corner */}
      <div className="border-b border-r border-border-subtle bg-bg-muted" />
      {/* day header */}
      {days.map((dayOfWeek) => (
        <div
          key={`h-${dayOfWeek}`}
          className="border-b border-r border-border-subtle bg-bg-muted text-center text-[11px] font-semibold leading-[28px]"
        >
          {DAY_LABELS[dayOfWeek - 1] ?? ""}
        </div>
      ))}
      {/* rows */}
      {periodIndexes.map((periodIndex) => {
        const slot = slotByIndex.get(periodIndex);
        if (!slot) return null;
        return (
          <Fragment key={periodIndex}>
            <div className="border-b border-r border-border-subtle bg-bg-muted">
              <PeriodLabel slot={slot} />
            </div>
            {days.map((dayOfWeek) => {
              const key = `${dayOfWeek}:${periodIndex}`;
              const list = cellEvents.get(key) ?? [];
              const isContinuation = continuationSet.has(key);
              return (
                <div
                  key={key}
                  className="overflow-hidden border-b border-r border-border-subtle"
                  style={{
                    // 連続コマの 2 行目以降は何も描画しない (1 行目の event が grid row span で覆う想定はせず、各 cell に描画)
                    padding: isContinuation ? undefined : 2,
                  }}
                >
                  {isContinuation ? null : list.length > 0 ? (
                    <div className="flex h-full w-full gap-0.5">
                      {list.map((event) => {
                        const span = event.periodCount;
                        const height =
                          span > 1
                            ? `calc(${span * 100}% + ${(span - 1) * 1}px)`
                            : "100%";
                        return (
                          <div
                            key={event.id}
                            className="relative min-w-0 flex-1"
                            style={{ height }}
                          >
                            <EventTile
                              density="compact"
                              color={event.color}
                              title={event.title}
                              subtitle={event.subtitle}
                              className="absolute inset-0"
                              onClick={() => onEventClick?.(event.id)}
                              ariaLabel={`${event.title}${event.subtitle ? ` / ${event.subtitle}` : ""}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : onEmptyCellClick ? (
                    <EmptyCell onClick={() => onEmptyCellClick(dayOfWeek, periodIndex)} />
                  ) : null}
                </div>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}
