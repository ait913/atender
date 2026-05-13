import { useState } from "react";
import { useCopyTemplate, useMe, usePublishTimetable, useSemesters, useTemplates, useUserTimetables } from "@/api/hooks";
import { Button, Field, PageTitle, Panel, Select } from "@/components/ui";

function authorHandle(template: { author?: { handle?: string | null } | null; authorName?: string | null; authorUserId: string }) {
  return template.author?.handle ?? template.authorName ?? template.authorUserId;
}

export function Templates() {
  const me = useMe();
  const semesters = useSemesters();
  const timetables = useUserTimetables();
  const [schoolId, setSchoolId] = useState(me.data?.user.schoolId ?? "");
  const [departmentId, setDepartmentId] = useState(me.data?.user.departmentId ?? "");
  const [query, setQuery] = useState("");
  const [semesterId, setSemesterId] = useState(me.data?.user.defaultSemesterId ?? "");
  const templates = useTemplates({ schoolId: schoolId || me.data?.user.schoolId, departmentId: departmentId || me.data?.user.departmentId, q: query || undefined });
  const copy = useCopyTemplate();
  const current = timetables.data?.userTimetables.find((item) => item.semesterId === (semesterId || me.data?.user.defaultSemesterId));
  const publish = usePublishTimetable(current?.id);

  return (
    <div>
      <PageTitle title="Templates::">共有テンプレ検索</PageTitle>
      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <Field placeholder="学校 ID" value={(schoolId || me.data?.user.schoolId) ?? ""} onChange={(event) => setSchoolId(event.currentTarget.value)} />
        <Field placeholder="学科 ID" value={(departmentId || me.data?.user.departmentId) ?? ""} onChange={(event) => setDepartmentId(event.currentTarget.value)} />
        <Field placeholder="検索" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        <Select value={(semesterId || me.data?.user.defaultSemesterId) ?? ""} onChange={(event) => setSemesterId(event.currentTarget.value)}>
          {(semesters.data?.semesters ?? []).map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
        </Select>
      </div>
      <div className="mb-5">
        <Button type="button" disabled={!current || publish.isPending} onClick={() => current && publish.mutate({ title: current.title })}>自分の時間割を公開</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(templates.data?.templates ?? []).map((template) => (
          <Panel key={template.id} className="space-y-3">
            <div>
              <h2 className="text-xl font-black">{template.title}</h2>
              <p className="mt-1 text-sm font-bold text-white/70">by @{authorHandle(template)}</p>
              <p className="mt-1 text-sm text-white/55">copy x {template.copyCount}　更新: {template.updatedAt.slice(0, 10)}</p>
              {template.description ? <p className="mt-3 text-sm text-white/70">{template.description}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-white/58">
              <span>{template.courses.length} courses</span>
              <span>{template.meetings.length} meetings</span>
            </div>
            <div className="flex gap-3">
              <Button type="button">詳細を見る</Button>
              <Button
                type="button"
                variant="primary"
                disabled={!semesterId && !me.data?.user.defaultSemesterId}
                onClick={() => copy.mutate({ templateId: template.id, input: { semesterId: semesterId || me.data!.user.defaultSemesterId! } })}
              >
                コピー
              </Button>
            </div>
            {copy.isError ? <p className="text-sm text-red-100">既に時間割があります。別 semester を選び直すか既存削除してください</p> : null}
          </Panel>
        ))}
      </div>
    </div>
  );
}
