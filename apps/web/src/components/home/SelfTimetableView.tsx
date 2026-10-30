import { useEffect, useMemo, useState } from "react";
import type { MeetingDto, UserTimetableDto } from "@atender/shared";
import { useCreateUserTimetable, useDeleteMeeting, useMe, useSemesters, useUserTimetables } from "@/api/hooks";
import { displayDowToJs, jsDowToDisplay, resolveDisplayDays } from "@/components/timetable/dayConvention";
import * as SchoolClock from "@/lib/SchoolClock";
import { DEFAULT_SLOTS } from "@/lib/RoomTimetableLogic";
import * as TimetableCarryOver from "@/lib/TimetableCarryOver";
import * as TimetableGridLayout from "@/lib/TimetableGridLayout";
import { useNow } from "@/lib/useNow";
import { MeetingDetailSheet } from "@/components/timetable/MeetingDetailSheet";
import { MeetingEditModal } from "@/components/timetable/MeetingEditModal";
import { TimetableView, type TimetableEventInput } from "@/components/timetable/TimetableView";
import { Panel, TimetableGridSkeleton } from "@/components/ui";
import { TimetableSettingsSheet } from "@/components/sheet/TimetableSettingsSheet";

function activeTimetable(timetables: UserTimetableDto[] | undefined, semesterId?: string | null) {
  return timetables?.find((item) => item.semesterId === semesterId) ?? null;
}

export function SelfTimetableView({ semesterId, settingsOpen = false, onCloseSettings = () => {}, onModalOpenChange }: { semesterId: string | null; settingsOpen?: boolean; onCloseSettings?: () => void; onModalOpenChange?: (open: boolean) => void }) {
  const me = useMe();
  const semesters = useSemesters();
  const timetables = useUserTimetables();
  const targetSemesterId = semesterId ?? me.data?.user.defaultSemesterId ?? semesters.data?.semesters[0]?.id;
  const selected = activeTimetable(timetables.data?.userTimetables, targetSemesterId);
  const createTimetable = useCreateUserTimetable();
  const deleteMeeting = useDeleteMeeting();
  const [sheet, setSheet] = useState<{ dayOfWeek: number; period: number } | null>(null);
  const [detailMeeting, setDetailMeeting] = useState<MeetingDto | null>(null);
  const [editMeeting, setEditMeeting] = useState<MeetingDto | null>(null);
  const [createdTimetable, setCreatedTimetable] = useState<UserTimetableDto | null>(null);
  // 授業の追加・詳細・編集シートが開いている間は Home の学期終了提案を抑止させる
  const modalOpen = sheet != null || detailMeeting != null || editMeeting != null;
  useEffect(() => { onModalOpenChange?.(modalOpen); }, [modalOpen, onModalOpenChange]);
  const now = useNow(60_000);
  const today = displayDowToJs(SchoolClock.displayDay(now));
  const emptyTimetable = useMemo<UserTimetableDto | null>(() => {
    const fallbackSemesterId = targetSemesterId;
    if (!fallbackSemesterId) return null;
    const target = semesters.data?.semesters.find((semester) => semester.id === fallbackSemesterId);
    const previous = target ? TimetableCarryOver.previousTimetable(target, semesters.data?.semesters ?? [], timetables.data?.userTimetables ?? []) : null;
    return { id: "", userId: me.data?.user.id ?? "", semesterId: fallbackSemesterId, title: "自分の時間割", sourceTemplateId: null, daysOfWeek: TimetableCarryOver.inheritedDaysOfWeek(previous), daySlots: TimetableCarryOver.inheritedSlots(previous, DEFAULT_SLOTS), courses: [], meetings: [], createdAt: "", updatedAt: "" };
  }, [me.data?.user.id, targetSemesterId, semesters.data?.semesters, timetables.data?.userTimetables]);
  const currentCreatedTimetable = createdTimetable?.semesterId === targetSemesterId ? createdTimetable : null;
  const display = selected ?? currentCreatedTimetable ?? emptyTimetable;

  async function ensureTimetable() {
    if (selected || currentCreatedTimetable || !emptyTimetable) return selected ?? currentCreatedTimetable;
    const created = await createTimetable.mutateAsync({
      semesterId: emptyTimetable.semesterId,
      title: "自分の時間割",
      daySlots: emptyTimetable.daySlots,
      daysOfWeek: emptyTimetable.daysOfWeek,
      courses: [],
      meetings: [],
    });
    setCreatedTimetable(created.userTimetable);
    return created.userTimetable;
  }

  const detailCourse = detailMeeting && display
    ? display.courses.find((course) => course.id === detailMeeting.courseId) ?? null
    : null;
  const detailSlots = detailMeeting && display
    ? display.daySlots.filter((slot) => slot.periodIndex >= detailMeeting.startPeriodIndex && slot.periodIndex < detailMeeting.startPeriodIndex + detailMeeting.periodCount)
    : [];

  async function handleEmptyCellClick(displayDow: number, period: number) {
    const timetable = await ensureTimetable();
    if (timetable) setSheet({ dayOfWeek: displayDowToJs(displayDow), period });
  }

  if (me.isLoading || semesters.isLoading || timetables.isLoading) {
    return (
      <div className="space-y-3">
        <TimetableGridSkeleton days={5} rows={5} />
      </div>
    );
  }
  const settings = <TimetableSettingsSheet open={settingsOpen} onClose={onCloseSettings} timetable={selected ?? currentCreatedTimetable} semesterId={(selected ?? currentCreatedTimetable)?.semesterId ?? targetSemesterId ?? null} onSaved={() => setCreatedTimetable(null)} />;
  if (!display) return <><Panel>先に学期を作成してください。</Panel>{settings}</>;

  return (
    <div className="space-y-3">
      {settings}
      <TimetableView
        todayDisplayDay={SchoolClock.displayDay(now)}
        currentPeriodIndex={TimetableGridLayout.currentPeriodIndex(display.daySlots, SchoolClock.nowMinute(now))}
        daySlots={display.daySlots}
        days={resolveDisplayDays(display)}
        events={display.meetings.map<TimetableEventInput>((m) => {
          const course = display.courses.find((c) => c.id === m.courseId);
          return {
            id: m.id,
            dayOfWeek: jsDowToDisplay(m.dayOfWeek),
            startPeriodIndex: m.startPeriodIndex,
            periodCount: m.periodCount,
            color: course?.color ?? "#F97316",
            title: course?.name ?? "授業",
            subtitle: m.room ?? undefined,
            mergeKey: m.courseId,
          };
        })}
        onEventClick={(id) => {
          const meeting = display.meetings.find((m) => m.id === id);
          if (meeting) setDetailMeeting(meeting);
        }}
        onEmptyCellClick={handleEmptyCellClick}
      />
      {(selected ?? currentCreatedTimetable) ? (
        <MeetingEditModal
          open={sheet != null}
          onClose={() => setSheet(null)}
          timetable={(selected ?? currentCreatedTimetable)!}
          mode="create"
          initialDayOfWeek={sheet?.dayOfWeek ?? today}
          initialPeriod={sheet?.period ?? 1}
        />
      ) : null}
      <MeetingDetailSheet
        open={detailMeeting != null}
        onClose={() => setDetailMeeting(null)}
        meeting={detailMeeting}
        course={detailCourse}
        slots={detailSlots}
        pending={deleteMeeting.isPending}
        onEdit={() => {
          setEditMeeting(detailMeeting);
          setDetailMeeting(null);
        }}
        onDelete={async () => {
          if (!detailMeeting) return;
          await deleteMeeting.mutateAsync(detailMeeting.id);
          setDetailMeeting(null);
        }}
      />
      {display ? (
        <MeetingEditModal
          open={editMeeting != null}
          onClose={() => setEditMeeting(null)}
          timetable={display}
          mode="edit"
          meeting={editMeeting}
        />
      ) : null}
    </div>
  );
}
