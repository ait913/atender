import { useNavigate } from "@tanstack/react-router";
import { TitleRuleEditor } from "@/components/ics-import/TitleRuleEditor";
import { Button } from "@/components/ui";

export function SettingsCalendar() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <Button type="button" variant="ghost" onClick={() => void navigate({ to: "/" })}>戻る</Button>
      <TitleRuleEditor />
    </div>
  );
}
