import { useEffect, useRef, useState } from "react";
import type { DepartmentDto, SchoolDto } from "@atender/shared";
import { api } from "@/api/client";
import { useCreateDepartment, useCreateSchool } from "@/api/hooks";
import type { DepartmentsResponse, SchoolsResponse } from "@/api/hooks/types";
import { Button, Input, Select } from "@/components/ui";

type Props = {
  allowsCreate: boolean;
  value: { school: SchoolDto | null; department: DepartmentDto | null };
  onChange: (next: { school: SchoolDto | null; department: DepartmentDto | null }) => void;
  disabled?: boolean;
};

const prefectures = ["", "北海道", "東京都", "千葉県", "神奈川県", "埼玉県", "大阪府", "京都府", "愛知県", "福岡県"];

export function SchoolDepartmentPicker({ allowsCreate, value, onChange, disabled = false }: Props) {
  const { school, department } = value;
  const [schoolQuery, setSchoolQuery] = useState("");
  const [departmentQuery, setDepartmentQuery] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [schools, setSchools] = useState<SchoolDto[]>([]);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const createSchool = useCreateSchool();
  const createDepartment = useCreateDepartment(school?.id);
  const busy = disabled || createSchool.isPending || createDepartment.isPending;

  useEffect(() => {
    const current = ++revision.current;
    let active = true;
    setSchools([]);
    setDepartments([]);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        if (school == null) {
          const result = await api<SchoolsResponse>("/api/schools", { query: { q: schoolQuery || undefined, prefecture: prefecture || undefined, limit: 20 } });
          if (active && current === revision.current) setSchools(result.schools);
        } else {
          const result = await api<DepartmentsResponse>(`/api/schools/${school.id}/departments`, { query: { q: departmentQuery || undefined } });
          if (active && current === revision.current) setDepartments(result.departments);
        }
      } catch (cause) {
        if (active && current === revision.current) setError((cause as Error).message);
      }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [school?.id, schoolQuery, departmentQuery, prefecture]);

  function change(next: Props["value"]) {
    revision.current++;
    setError(null);
    if (next.school?.id !== school?.id) setDepartmentQuery("");
    onChange(next);
  }

  async function addSchool() {
    if (!schoolQuery || busy) return;
    setError(null);
    try {
      const result = await createSchool.mutateAsync({ name: schoolQuery, kind: "OTHER", ...(prefecture ? { prefecture } : {}) });
      change({ school: result.school, department: null });
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function addDepartment() {
    if (!school || !departmentQuery || busy) return;
    setError(null);
    try {
      const result = await createDepartment.mutateAsync({ name: departmentQuery });
      change({ school, department: result.department });
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p role="alert" className="text-sm text-status-absent">{error}</p> : null}
      {school == null ? (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <Input placeholder="学校名で検索" value={schoolQuery} disabled={busy} onChange={(event) => { revision.current++; setSchoolQuery(event.currentTarget.value); }} />
            <Select value={prefecture} disabled={busy} onChange={(event) => { revision.current++; setPrefecture(event.currentTarget.value); }}>
              {prefectures.map((item) => <option key={item} value={item}>{item || "都道府県"}</option>)}
            </Select>
          </div>
          <div className="space-y-2">
            {schools.map((item) => (
              <button type="button" key={item.id} disabled={busy} className="block w-full rounded-md border border-border-subtle px-3 py-3 text-left hover:bg-bg-muted" onClick={() => change({ school: item, department: null })}>○ {item.name}</button>
            ))}
          </div>
          {allowsCreate ? <Button type="button" disabled={!schoolQuery || busy} onClick={addSchool}>＋ リストに無い学校を追加</Button> : null}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <span>{school.name}</span>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => change({ school: null, department: null })}>変更</Button>
          </div>
          <Input placeholder={`${school.name} の学科名で検索`} value={departmentQuery} disabled={busy} onChange={(event) => { revision.current++; setDepartmentQuery(event.currentTarget.value); }} />
          <div className="space-y-2">
            {departments.map((item) => (
              <button type="button" key={item.id} disabled={busy} className={`block w-full rounded-md border px-3 py-3 text-left ${department?.id === item.id ? "border-accent-500 bg-accent-50" : "border-border-subtle hover:bg-bg-muted"}`} onClick={() => onChange({ school, department: item })}>○ {item.name}</button>
            ))}
          </div>
          {allowsCreate ? <Button type="button" variant="secondary" disabled={!departmentQuery || busy} onClick={addDepartment}>＋ 学科を追加</Button> : null}
        </>
      )}
    </div>
  );
}
