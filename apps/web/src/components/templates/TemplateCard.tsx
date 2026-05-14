import type { TemplateDto } from "@atender/shared";
import { Button } from "@/components/ui/Button";

export function TemplateCard({ template, onCopy }: { template: TemplateDto; onCopy: () => void }) {
  return (
    <article className="rounded-md border border-border-subtle bg-bg-elevated p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{template.title}</h2>
          <p className="mt-1 text-sm text-fg-secondary">公開: {template.createdAt.slice(0, 10)}</p>
          <p className="mt-1 text-sm text-fg-secondary">{template.daySlots.length}限 / 月-金 / {template.meetings.length}コマ</p>
          <p className="mt-1 text-sm text-fg-secondary">コピー数: {template.copyCount}</p>
        </div>
        <Button size="sm" onClick={onCopy}>この時間割</Button>
      </div>
    </article>
  );
}
