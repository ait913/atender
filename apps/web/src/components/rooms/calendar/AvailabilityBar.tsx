import dayjs from "dayjs";
import type { CalendarEvent } from "@/lib/meetingExpansion";

type Member = { userId: string; name: string | null; handle: string | null; color: string };

const SLOT_START_MIN = 9 * 60;
const SLOT_END_MIN = 18 * 60;
const SLOT_STEP = 30;

export function AvailabilityBar({
  date,
  members,
  events,
  expanded,
  onToggle,
}: {
  date: string;
  members: Member[];
  events: CalendarEvent[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const slots = Array.from({ length: (SLOT_END_MIN - SLOT_START_MIN) / SLOT_STEP }, (_, index) => ({
    startMinute: SLOT_START_MIN + index * SLOT_STEP,
    endMinute: SLOT_START_MIN + (index + 1) * SLOT_STEP,
  }));

  const busyByMember = new Map<string, boolean[]>();
  for (const member of members) {
    busyByMember.set(
      member.userId,
      slots.map((slot) =>
        events.some((event) => {
          let ownerId: string | null = null;
          if (event.kind === "meeting") ownerId = event.userId;
          if (event.kind === "roomEvent") ownerId = event.authorId;
          if (!ownerId) return false;
          return ownerId === member.userId && event.startMinute < slot.endMinute && event.endMinute > slot.startMinute;
        }),
      ),
    );
  }

  const combined = slots.map((_, index) => {
    let busy = 0;
    for (const member of members) {
      if (busyByMember.get(member.userId)?.[index]) busy += 1;
    }
    return busy;
  });

  return (
    <section className="rounded-3xl bg-bg-elevated p-5 shadow-card">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h3 className="min-w-0 truncate text-base font-black text-fg-primary">{dayjs(date).format("M/D")} の空き時間</h3>
        <button
          type="button"
          aria-label={expanded ? "メンバー別を閉じる" : "メンバー別を開く"}
          aria-expanded={expanded}
          onClick={onToggle}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fg-primary/8 text-fg-primary transition hover:bg-fg-primary/12 active:scale-95"
        >
          {expanded ? "▴" : "▾"}
        </button>
      </header>
      <div className="mb-1 grid grid-cols-[44px_1fr] gap-2 text-[10px] font-bold text-fg-tertiary">
        <span />
        <div className="flex justify-between">
          {Array.from({ length: 10 }, (_, index) => <span key={index}>{9 + index}</span>)}
        </div>
      </div>
      <BarRow label="全員" slots={combined.map((busy) => ({ busy, total: members.length }))} />
      {expanded
        ? members.map((member) => (
          <BarRow
            key={member.userId}
            label={member.name ?? member.handle ?? "No name"}
            color={member.color}
            slots={(busyByMember.get(member.userId) ?? []).map((busy) => ({ busy: busy ? 1 : 0, total: 1 }))}
          />
        ))
        : null}
    </section>
  );
}

function BarRow({
  label,
  color,
  slots,
}: {
  label: string;
  color?: string;
  slots: Array<{ busy: number; total: number }>;
}) {
  return (
    <div className="mb-1 grid grid-cols-[44px_1fr] items-center gap-2 last:mb-0">
      <span className="truncate text-xs font-bold text-fg-secondary">{label}</span>
      <div className="flex h-5 overflow-hidden rounded-full bg-fg-primary/4">
        {slots.map((slot, index) => {
          const ratio = slot.total === 0 ? 0 : slot.busy / slot.total;
          const background = ratio === 0
            ? "transparent"
            : color
              ? `color-mix(in srgb, ${color} ${Math.round(ratio * 100)}%, transparent)`
              : `color-mix(in srgb, var(--color-accent-500) ${Math.round(ratio * 100)}%, transparent)`;
          return (
            <span
              key={index}
              className="flex-1 border-r border-bg-elevated last:border-r-0"
              style={{ background }}
              title={`${slot.busy}/${slot.total}`}
            />
          );
        })}
      </div>
    </div>
  );
}
