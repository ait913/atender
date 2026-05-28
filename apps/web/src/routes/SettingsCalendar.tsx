import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useCompleteGoogleLink } from "@/api/hooks";
import { GoogleCalendarSection } from "@/components/avatar/GoogleCalendarSection";
import { TitleRuleEditor } from "@/components/ics-import/TitleRuleEditor";
import { Button } from "@/components/ui";

export function SettingsCalendar() {
  const navigate = useNavigate();
  const complete = useCompleteGoogleLink();

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("linked") !== "1") return;
    complete.mutate(undefined, {
      onSettled: () => {
        url.searchParams.delete("linked");
        window.history.replaceState(null, "", url.toString());
      },
    });
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <Button type="button" variant="ghost" onClick={() => void navigate({ to: "/" })}>戻る</Button>
      <div className="rounded-3xl bg-bg-elevated p-5 shadow-card">
        <GoogleCalendarSection />
      </div>
      {complete.isError ? <p className="rounded-2xl bg-status-absent/15 px-4 py-3 text-sm font-bold text-status-absent">{complete.error.message}</p> : null}
      <TitleRuleEditor />
    </div>
  );
}
