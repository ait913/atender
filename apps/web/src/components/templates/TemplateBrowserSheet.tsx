import { useState } from "react";
import type { DepartmentDto, SchoolDto, TemplateDto } from "@atender/shared";
import { useMe, useTemplates } from "@/api/hooks";
import { SchoolDepartmentPicker } from "@/components/setup/SchoolDepartmentPicker";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, EmptyState, Skeleton } from "@/components/ui";
import * as TemplateSuggestionLogic from "@/lib/TemplateSuggestionLogic";

export type TemplateScope = { schoolId: string; departmentId: string; schoolName: string; departmentName: string };
type Props = {
  open: boolean;
  purpose: { kind: "select" };
  showsFoundBanner: boolean;
  initialScope: TemplateScope;
  onSelected?: (template: TemplateDto) => void;
  onBack: () => void;
  onClose: () => void;
};

export function TemplateBrowserSheet({ open, showsFoundBanner, initialScope, onSelected, onBack, onClose }: Props) {
  const me = useMe();
  const [scope, setScope] = useState(initialScope);
  const [screen, setScreen] = useState<"list" | "school" | "preview">("list");
  const [preview, setPreview] = useState<TemplateDto | null>(null);
  const [schoolValue, setSchoolValue] = useState<{ school: SchoolDto | null; department: DepartmentDto | null }>({ school: null, department: null });
  const templates = useTemplates({ schoolId: scope.schoolId, departmentId: scope.departmentId, limit: 20 }, { enabled: open, staleTime: 0 });
  const visible = TemplateSuggestionLogic.visible(templates.data?.templates ?? []);

  return (
    <BottomSheet open={open} onClose={onClose} onBack={() => screen === "list" ? onBack() : setScreen("list")} stackLevel={2} title={screen === "school" ? "学校・学科" : screen === "preview" ? "時間割の中身" : "公開時間割"}>
      {screen === "school" ? (
        <SchoolDepartmentPicker allowsCreate={false} value={schoolValue} onChange={(value) => {
          setSchoolValue(value);
          if (value.school && value.department) {
            setScope({ schoolId: value.school.id, departmentId: value.department.id, schoolName: value.school.name, departmentName: value.department.name });
            setScreen("list");
          }
        }} />
      ) : screen === "preview" && preview ? (
        <div data-testid="template-preview" className="space-y-4">
          <h2 className="text-2xl font-bold">{preview.title}</h2>
          <p className="text-sm text-fg-secondary">{TemplateSuggestionLogic.sizeText(preview)} / {TemplateSuggestionLogic.metaText(preview, me.data?.user.id ?? null)}</p>
          <div className="space-y-3 rounded-md bg-bg-elevated p-4 shadow-card">
            {TemplateSuggestionLogic.previewRows(preview).map((row) => (
              <div key={row.id} className="flex gap-3">
                <span>{row.weekday}</span><span>{row.periodText}</span>
                <div><p>{row.courseName}</p>{row.detail ? <p className="text-sm text-fg-secondary">{row.detail}</p> : null}</div>
              </div>
            ))}
          </div>
          <Button type="button" variant="primary" onClick={() => onSelected?.(preview)}>この時間割を使う</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {showsFoundBanner ? <div className="rounded-md bg-accent-500/15 p-4"><p className="font-bold">✓ 同じ学科の時間割が見つかりました</p><p className="text-sm text-fg-secondary">そのまま自分の学期に取り込めます</p></div> : null}
          <div className="flex items-center justify-between gap-3">
            <span>{scope.schoolName} › {scope.departmentName}</span>
            <Button type="button" variant="secondary" data-testid="template-browse-other" onClick={() => { setSchoolValue({ school: null, department: null }); setScreen("school"); }}>別の学科を探す</Button>
          </div>
          {templates.isFetching ? [0, 1, 2].map((index) => <Skeleton key={index} height="100px" />) : templates.isError ? (
            <div><p>読み込めませんでした</p><Button type="button" variant="secondary" onClick={() => void templates.refetch()}>再読み込み</Button></div>
          ) : visible.length === 0 ? (
            <EmptyState title="この学科の公開時間割はまだありません">時間割を作って「みんなの時間割で公開」をオンにすると、同じ学科の人が使えるようになります</EmptyState>
          ) : visible.map((template) => (
            <button type="button" key={template.id} data-testid={`template-card-${template.id}`} className="block w-full rounded-md bg-bg-elevated p-4 text-left shadow-card" onClick={() => { setPreview(template); setScreen("preview"); }}>
              <p className="line-clamp-2 text-lg font-semibold">{template.title}</p>
              <p className="text-sm text-fg-secondary">{TemplateSuggestionLogic.sizeText(template)}</p>
              <p className="text-xs text-fg-tertiary">{TemplateSuggestionLogic.metaText(template, me.data?.user.id ?? null)}</p>
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
