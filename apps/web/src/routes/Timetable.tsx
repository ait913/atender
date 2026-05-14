import { Settings } from "lucide-react";
import { useMemo, useState } from "react";
import type { MeetingDto } from "@atender/shared";
import { useMe, useSemesters, useUserTimetable, useUserTimetables } from "@/api/hooks";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import { MeetingCreateSheet } from "@/components/timetable/MeetingCreateSheet";
import { MeetingDetailSheet } from "@/components/timetable/MeetingDetailSheet";
import { TimetableSettingsSheet } from "@/components/timetable/TimetableSettingsSheet";
import { Button, EmptyState, IconButton, Page, Select, Skeleton } from "@/components/ui";

export function Timetable() {
  const params = new URLSearchParams(window.location.search);
  const urlSemesterId = params.get("semesterId");
  const me = useMe();
  const semesters = useSemesters();
  const selectedSemesterId = urlSemesterId ?? me.data?.user.defaultSemesterId ?? semesters.data?.semesters[0]?.id ?? null;
  const userTimetable = useUserTimetable(selectedSemesterId);
  const allTimetables = useUserTimetables();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<{ day: number; periodIndex: number } | null>(null);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const timetable = userTimetable.data?.userTimetable ?? allTimetables.data?.userTimetables.find((item) => item.semesterId === selectedSemesterId) ?? null;
  const meeting: MeetingDto | null = useMemo(() => timetable?.meetings.find((item) => item.id === meetingId) ?? null, [meetingId, timetable]);

  function selectSemester(value: string) {
    const search = new URLSearchParams(window.location.search);
    search.set("semesterId", value);
    window.history.replaceState(null, "", `${window.location.pathname}?${search.toString()}`);
  }

  return (
    <Page className="grid gap-4">
      <div className="flex items-center gap-2">
        <Select value={selectedSemesterId ?? ""} onChange={(event) => selectSemester(event.target.value)}>
          {semesters.data?.semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
        </Select>
        <IconButton label="時間割設定" icon={<Settings className="h-5 w-5" />} onClick={() => setSettingsOpen(true)} />
      </div>
      {userTimetable.isLoading ? <Skeleton className="h-96" /> : null}
      {!userTimetable.isLoading && !timetable ? (
        <EmptyState
          title="この学期の時間割がありません"
          action={<div className="grid grid-cols-2 gap-2"><Button variant="secondary">テンプレから選ぶ</Button><Button>自分で作る</Button></div>}
        />
      ) : null}
      {timetable ? (
        <TimetableGrid
          userTimetable={timetable}
          onCellTap={(day, periodIndex, id) => {
            if (id) setMeetingId(id);
            else setCreateTarget({ day, periodIndex });
          }}
        />
      ) : null}
      <MeetingCreateSheet open={createTarget != null} onClose={() => setCreateTarget(null)} userTimetable={timetable} dayOfWeek={createTarget?.day ?? 1} periodIndex={createTarget?.periodIndex ?? 1} />
      <MeetingDetailSheet open={meetingId != null} onClose={() => setMeetingId(null)} userTimetable={timetable} meeting={meeting} />
      <TimetableSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} userTimetable={timetable} />
    </Page>
  );
}
