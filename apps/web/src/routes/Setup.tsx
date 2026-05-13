import { useNavigate } from "@tanstack/react-router";
import { FormEvent, useMemo, useState } from "react";
import type { DepartmentDto, SchoolDto } from "@atender/shared";
import { useCreateDepartment, useCreateSchool, useCreateSemester, useDepartments, usePatchMe, useSchools } from "@/api/hooks";
import { Button, Field, PageTitle, Panel, Select } from "@/components/ui";

const prefectures = ["", "北海道", "東京都", "千葉県", "神奈川県", "埼玉県", "大阪府", "京都府", "愛知県", "福岡県"];

export function Setup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [schoolQuery, setSchoolQuery] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [departmentQuery, setDepartmentQuery] = useState("");
  const [school, setSchool] = useState<SchoolDto | null>(null);
  const [department, setDepartment] = useState<DepartmentDto | null>(null);
  const [semester, setSemester] = useState({ name: "2026 前期", startDate: "2026-04-01", endDate: "2026-09-30" });
  const schools = useSchools({ q: schoolQuery || undefined, prefecture: prefecture || undefined, limit: 20 });
  const departments = useDepartments(school?.id, departmentQuery || undefined);
  const createSchool = useCreateSchool();
  const createDepartment = useCreateDepartment(school?.id);
  const createSemester = useCreateSemester();
  const patchMe = usePatchMe();
  const busy = createSchool.isPending || createDepartment.isPending || createSemester.isPending || patchMe.isPending;
  const title = useMemo(() => `Step ${step}/3: ${step === 1 ? "学校を選ぶ" : step === 2 ? "学科を選ぶ" : "学期を作る"}`, [step]);

  async function addSchool() {
    if (!schoolQuery) return;
    const result = await createSchool.mutateAsync({ name: schoolQuery, kind: "OTHER", prefecture: prefecture || undefined });
    setSchool(result.school);
    setStep(2);
  }

  async function addDepartment() {
    if (!departmentQuery || !school) return;
    const result = await createDepartment.mutateAsync({ name: departmentQuery });
    setDepartment(result.department);
  }

  async function submitDepartment() {
    if (!school || !department) return;
    await patchMe.mutateAsync({ schoolId: school.id, departmentId: department.id });
    setStep(3);
  }

  async function submitSemester(event: FormEvent) {
    event.preventDefault();
    if (!school || !department) return;
    const result = await createSemester.mutateAsync(semester);
    await patchMe.mutateAsync({ defaultSemesterId: result.semester.id });
    navigate({ to: "/timetable" });
  }

  return (
    <div className="mx-auto max-w-3xl py-6">
      <PageTitle title="Setup::">{title}</PageTitle>
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
                <button key={item.id} className="block w-full rounded-lg border border-white/12 px-3 py-3 text-left hover:bg-white/8" onClick={() => { setSchool(item); setStep(2); }}>
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
                <button key={item.id} className={`block w-full rounded-lg border px-3 py-3 text-left ${department?.id === item.id ? "border-emerald-400 bg-emerald-500/10" : "border-white/12 hover:bg-white/8"}`} onClick={() => setDepartment(item)}>
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
