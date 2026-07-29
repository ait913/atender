import { useState } from "react";
import { ApiError } from "@/api/client";
import { useCopyTemplate, useMe, usePublishTimetable, useSemesters, useTemplates, useUserTimetables } from "@/api/hooks";
import { Button, Field, Input, PageTitle, Panel, Select } from "@/components/ui";

function authorHandle(template: { author?: { handle?: string | null } | null; authorName?: string | null; authorUserId: string }) {
  return template.author?.handle ?? template.authorName ?? template.authorUserId;
}

const COPY_CONFLICT_MESSAGE = "この学期には既に時間割があります。別の学期を選ぶか、既存を削除してください";
const COPY_GENERIC_MESSAGE = "コピーに失敗しました。時間をおいて再度お試しください";

function copyErrorMessage(error: Error) {
  if (error instanceof ApiError) {
    if (error.status === 409) return COPY_CONFLICT_MESSAGE;
  }
  return COPY_GENERIC_MESSAGE;
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
  const copyError = copy.error;
  const copyErrorTemplateId = copyError ? copy.variables?.templateId : undefined;
  const copyErrorText = copyError ? copyErrorMessage(copyError) : "";

  return (
    <div>
      <PageTitle title="みんなの時間割">共有テンプレ検索</PageTitle>
      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <Field label="学校 ID"><Input value={(schoolId || me.data?.user.schoolId) ?? ""} onChange={(event) => setSchoolId(event.currentTarget.value)} /></Field>
        <Field label="学科 ID"><Input value={(departmentId || me.data?.user.departmentId) ?? ""} onChange={(event) => setDepartmentId(event.currentTarget.value)} /></Field>
        <Field label="検索"><Input value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></Field>
        <Field label="学期">
          <Select value={(semesterId || me.data?.user.defaultSemesterId) ?? ""} onChange={(event) => setSemesterId(event.currentTarget.value)}>
            {(semesters.data?.semesters ?? []).map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
          </Select>
        </Field>
      </div>
      <div className="mb-5">
        <Button type="button" disabled={!current || publish.isPending} onClick={() => current && publish.mutate({ title: current.title })}>自分の時間割を公開</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(templates.data?.templates ?? []).map((template) => (
          <Panel key={template.id} className="space-y-3">
            <div>
              <h2 className="text-xl font-semibold">{template.title}</h2>
              <p className="mt-1 text-sm text-fg-secondary">by @{authorHandle(template)}</p>
              <p className="mt-1 text-sm text-fg-tertiary">copy x {template.copyCount} / 更新: {template.updatedAt.slice(0, 10)}</p>
            </div>
            <Button type="button" variant="primary" disabled={!semesterId && !me.data?.user.defaultSemesterId} onClick={() => copy.mutate({ templateId: template.id, input: { semesterId: semesterId || me.data!.user.defaultSemesterId! } })}>コピー</Button>
            {copyErrorTemplateId === template.id ? (
              <p className="rounded-2xl bg-status-absent/15 px-4 py-3 text-sm font-bold text-status-absent">{copyErrorText}</p>
            ) : null}
          </Panel>
        ))}
      </div>
    </div>
  );
}
