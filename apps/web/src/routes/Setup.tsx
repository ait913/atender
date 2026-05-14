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
    <div className="grid gap-6">
      <div className="grid grid-cols-3 gap-1">
        {[1, 2, 3].map((item) => <span key={item} className={`h-1 rounded-full ${item <= step ? "bg-accent-500" : "bg-bg-muted"}`} />)}
      </div>
      {step === 1 ? (
        <section className="grid gap-4">
          <h1 className="text-xl font-semibold">Step 1/3 学校を選ぶ</h1>
          <SchoolSearch value={school} onChange={setSchool} />
          <Button disabled={!school} onClick={() => setStep(2)}>次へ</Button>
        </section>
      ) : null}
      {step === 2 ? (
        <section className="grid gap-4">
          <h1 className="text-xl font-semibold">Step 2/3 学科を選ぶ</h1>
          <Button variant="secondary" disabled={!school} onClick={() => setDepartmentOpen(true)}>{department?.name ?? "学科を選ぶ"}</Button>
          <div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setStep(1)}>戻る</Button><Button disabled={!department} onClick={() => setStep(3)}>次へ</Button></div>
        </section>
      ) : null}
      {step === 3 ? (
        <section className="grid gap-4">
          <h1 className="text-xl font-semibold">Step 3/3 学期を作る</h1>
          <Field label="学期名"><Input value={semesterName} onChange={(event) => setSemesterName(event.target.value)} /></Field>
          <Field label="開始日"><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field>
          <Field label="終了日"><Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setStep(2)}>戻る</Button><Button disabled={!semesterName || !startDate || !endDate} onClick={finish}>完了</Button></div>
        </section>
      ) : null}
      <DepartmentPickerSheet open={departmentOpen} schoolId={school?.id} onClose={() => setDepartmentOpen(false)} onSelect={setDepartment} />
    </div>
  );
}
