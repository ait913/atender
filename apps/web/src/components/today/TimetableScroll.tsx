import { useEffect, useMemo, useRef, useState } from "react";
import type { OccurrenceDto } from "@atender/shared";
import { useNow } from "@/lib/useNow";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { OccurrenceLyricCard } from "./OccurrenceLyricCard";
import { ReturnToNowFAB } from "./ReturnToNowFAB";

export function TimetableScroll({ occurrences }: { occurrences: OccurrenceDto[] }) {
  const now = useNow(60_000);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [manual, setManual] = useState(false);
  const ref = useRef<HTMLUListElement>(null);
  const activeIndex = useMemo(() => {
    if (occurrences.length === 0) return -1;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const current = occurrences.findIndex((o) => o.startMinute <= nowMin && nowMin <= o.endMinute + 5);
    if (current >= 0) return current;
    const next = occurrences.findIndex((o) => o.startMinute > nowMin);
    return next >= 0 ? next : occurrences.length - 1;
  }, [now, occurrences]);

  useEffect(() => {
    if (manual || activeIndex < 0) return;
    const el = ref.current?.children[activeIndex] as HTMLElement | undefined;
    if (typeof el?.scrollIntoView !== "function") return;
    el.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
  }, [activeIndex, manual, prefersReducedMotion]);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  return (
    <>
      <ul
        ref={ref}
        className="h-[calc(100dvh-260px)] min-h-80 overflow-y-auto overscroll-contain scroll-py-[40%] snap-y snap-mandatory pr-1"
        onWheel={(event) => event.deltaY !== 0 && setManual(true)}
        onTouchMove={() => setManual(true)}
      >
        {occurrences.map((occurrence, index) => {
          const isBetweenBeforeNext = index === activeIndex && nowMin < occurrence.startMinute;
          const state = index < activeIndex ? "past" : index === activeIndex ? (isBetweenBeforeNext ? "next" : "current") : "future";
          return <OccurrenceLyricCard key={occurrence.id} occurrence={occurrence} state={state} />;
        })}
      </ul>
      {manual ? <ReturnToNowFAB onClick={() => setManual(false)} /> : null}
    </>
  );
}
