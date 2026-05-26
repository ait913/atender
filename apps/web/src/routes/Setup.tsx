import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { SchoolDto, DepartmentDto } from "@atender/shared";
import { useCreateSemester, useCreateUserTimetable, usePatchMe } from "@/api/hooks";
import { DepartmentPickerSheet } from "@/components/me/DepartmentPickerSheet";
import { SchoolSearch } from "@/components/templates/SchoolSearch";
import { Button, Field, Input } from "@/components/ui";
import { defaultDaySlots } from "@/components/timetable/helpers";

export function Setup() {
  const [step, setStep] = useState(1);
  const [school, setSchool] = useState<SchoolDto | null>(null);
  const [department, setDepartment] = useState<DepartmentDto | null>(null);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [semesterName, setSemesterName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const navigate = useNavigate();
  const patchMe = usePatchMe();
  const createSemester = useCreateSemester();
  const createTimetable = useCreateUserTimetable();

  function finish() {
    if (!school || !department) return;
    createSemester.mutate(
      { name: semesterName, startDate, endDate },
      {
        onSuccess: ({ semester }) => {
          patchMe.mutate({ schoolId: school.id, departmentId: department.id, defaultSemesterId: semester.id });
          createTimetable.mutate({
            semesterId: semester.id,
            title: semester.name,
            daySlots: defaultDaySlots(5),
            courses: [],
            meetings: [],
          }, { onSuccess: () => void navigate({ to: "/" }) });
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-3xl py-6">
      <PageTitle title="セットアップ">{title}</PageTitle>
      <Panel>
        {step === 1 ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <Field placeholder="学校名で検索" value={schoolQuery} onChange={(event) => setSchoolQuery(event.currentTarget.value)} />
              <Select value={prefecture} onChange={(event) => setPrefecture(event.currentTarget.value)}>
                {prefectures.map((item) => <option key={item} value={item}>{item || "都道府県"}</option>)}
              </Select>
            </div>
            <div className="space-y-2">
              {(schools.data?.schools ?? []).map((item) => (
                <button key={item.id} className="block w-full rounded-md border border-border-subtle px-3 py-3 text-left hover:bg-bg-muted" onClick={() => { setSchool(item); setStep(2); }}>
                  ○ {item.name}
                </button>
              ))}
            </div>
            <Button type="button" onClick={addSchool} disabled={!schoolQuery || busy}>＋ リストに無い学校を追加</Button>
          </div>
        ) : null}
        {step === 2 && school ? (
          <div className="space-y-4">
            <Field placeholder={`${school.name} の学科名で検索`} value={departmentQuery} onChange={(event) => setDepartmentQuery(event.currentTarget.value)} />
            <div className="space-y-2">
              {(departments.data?.departments ?? []).map((item) => (
                <button key={item.id} className={`block w-full rounded-md border px-3 py-3 text-left ${department?.id === item.id ? "border-accent-500 bg-accent-50" : "border-border-subtle hover:bg-bg-muted"}`} onClick={() => setDepartment(item)}>
                  ○ {item.name}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap justify-between gap-3">
              <Button type="button" onClick={() => setStep(1)}>戻る</Button>
              <Button type="button" onClick={addDepartment} disabled={!departmentQuery || busy}>＋ 学科を追加</Button>
              <Button type="button" variant="primary" onClick={submitDepartment} disabled={!department || busy}>次へ</Button>
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <form className="space-y-4" onSubmit={submitSemester}>
            <label className="block text-sm font-bold">名前<Field value={semester.name} onChange={(event) => setSemester({ ...semester, name: event.currentTarget.value })} /></label>
            <label className="block text-sm font-bold">開始日<Field type="date" value={semester.startDate} onChange={(event) => setSemester({ ...semester, startDate: event.currentTarget.value })} /></label>
            <label className="block text-sm font-bold">終了日<Field type="date" value={semester.endDate} onChange={(event) => setSemester({ ...semester, endDate: event.currentTarget.value })} /></label>
            <div className="flex justify-between gap-3">
              <Button type="button" onClick={() => setStep(2)}>戻る</Button>
              <Button type="submit" variant="primary" disabled={busy}>完了して時間割を作る</Button>
            </div>
          </form>
        ) : null}
      </Panel>
    </div>
  );
}
