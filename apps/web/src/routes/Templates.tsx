import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DepartmentDto, SchoolDto, TemplateDto } from "@atender/shared";
import { useDepartments, useInfiniteTemplates, useMe, useSemesters, useUserTimetable } from "@/api/hooks";
import { TemplateCard } from "@/components/templates/TemplateCard";
import { TemplateCopySheet } from "@/components/templates/TemplateCopySheet";
import { TemplatePublishSheet } from "@/components/templates/TemplatePublishSheet";
import { SchoolSearch } from "@/components/templates/SchoolSearch";
import { Button, EmptyState, Field, IconButton, Page, Select, Skeleton } from "@/components/ui";

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
    <Page className="grid gap-4">
      <div className="flex justify-end">
        <IconButton label="公開" icon={<Plus className="h-5 w-5" />} variant="filled" onClick={() => setPublishOpen(true)} />
      </div>
      <SchoolSearch value={school} onChange={(value) => { setSchool(value); setDepartmentId(""); }} />
      <Field label="学科">
        <Select value={departmentId} disabled={!school} onChange={(event) => setDepartmentId(event.target.value)}>
          <option value="">選択してください</option>
          {departments.data?.departments.map((department: DepartmentDto) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </Select>
      </Field>
      {templates.isLoading ? <Skeleton className="h-36" /> : null}
      {!templates.isLoading && result.length === 0 ? (
        <EmptyState title="該当の時間割が見つかりません" action={<Button>自分で作る</Button>} />
      ) : (
        <div className="grid gap-3">
          <p className="text-sm font-semibold text-fg-secondary">{result.length} 件</p>
          {result.map((template) => <TemplateCard key={template.id} template={template} onCopy={() => setCopyTarget(template)} />)}
        </div>
      )}
      <TemplateCopySheet open={copyTarget != null} onClose={() => setCopyTarget(null)} template={copyTarget} semesters={semesters.data?.semesters ?? []} />
      <TemplatePublishSheet open={publishOpen} onClose={() => setPublishOpen(false)} userTimetableId={defaultTimetable.data?.userTimetable?.id} />
    </Page>
  );
}
