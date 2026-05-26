import { useState } from "react";
import { useCopyTemplate, useMe, usePublishTimetable, useSemesters, useTemplates, useUserTimetables } from "@/api/hooks";
import { Button, Field, Input, PageTitle, Panel, Select } from "@/components/ui";

function authorHandle(template: { author?: { handle?: string | null } | null; authorName?: string | null; authorUserId: string }) {
  return template.author?.handle ?? template.authorName ?? template.authorUserId;
}

export function Templates() {
  const me = useMe();
  const semesters = useSemesters();
  const defaultTimetable = useUserTimetable(me.data?.user.defaultSemesterId);
  const [school, setSchool] = useState<SchoolDto | null>(null);
  const [departmentId, setDepartmentId] = useState("");
  const [copyTarget, setCopyTarget] = useState<TemplateDto | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const departments = useDepartments(school?.id);
  const templates = useInfiniteTemplates({ schoolId: school?.id, departmentId: departmentId || undefined });
  const result = useMemo(() => templates.data?.pages.flatMap((page) => page.templates) ?? [], [templates.data]);

  useEffect(() => {
    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 120 && templates.hasNextPage && !templates.isFetchingNextPage) void templates.fetchNextPage();
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [templates]);

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
          </Panel>
        ))}
      </div>
    </div>
  );
}
