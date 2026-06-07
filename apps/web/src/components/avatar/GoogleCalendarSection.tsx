import { CalendarDays, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useGoogleConnection, useLinkGoogleCalendar, useRunAllGoogleSyncs } from "@/api/hooks";
import { Button, ListSkeleton } from "@/components/ui";
import { GoogleCalendarConnectSheet } from "./GoogleCalendarConnectSheet";

export function GoogleCalendarSection() {
  const connection = useGoogleConnection();
  const link = useLinkGoogleCalendar();
  const runAll = useRunAllGoogleSyncs();
  const conn = connection.data?.connection ?? null;
  const [unlinkOpen, setUnlinkOpen] = useState(false);

  if (connection.isLoading) {
    return <ListSkeleton rows={2} />;
  }

  if (!conn) {
    return (
      <section className="space-y-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-500/15 text-accent-500">
          <CalendarDays className="h-6 w-6" strokeWidth={2.5} />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-black text-fg-primary">Google Calendar 連携</h2>
          <p className="text-sm leading-6 text-fg-secondary">読み取り専用で Google Calendar の予定を取り込み、ルームごとに表示範囲を選べます。</p>
        </div>
        <Button type="button" variant="primary" disabled={link.isPending} onClick={() => link.mutate()}>
          Google Calendar と連携する
        </Button>
        {link.isError ? <p className="rounded-2xl bg-status-absent/15 px-4 py-3 text-sm font-bold text-status-absent">{link.error.message}</p> : null}
      </section>
    );
  }

  if (conn.status === "REVOKED") {
    return (
      <section className="space-y-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-status-absent/15 text-status-absent">
          <TriangleAlert className="h-6 w-6" strokeWidth={2.5} />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-black text-fg-primary">認可が無効になりました</h2>
          <p className="text-sm leading-6 text-fg-secondary">Google アカウント側の認可を確認し、もう一度連携してください。</p>
        </div>
        <Button type="button" variant="primary" disabled={link.isPending} onClick={() => link.mutate()}>
          もう一度連携する
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl bg-bg-muted p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-500" strokeWidth={2.5} />
        <div className="min-w-0">
          <p className="text-sm font-black text-fg-primary">連携中</p>
          <p className="truncate text-xs text-fg-secondary">{conn.googleEmail}</p>
          <p className="mt-1 text-xs text-fg-tertiary">最後の同期: {formatDate(conn.lastSyncedAt)}</p>
        </div>
      </div>
      <div className="rounded-2xl bg-bg-muted p-4">
        <p className="text-sm font-bold leading-6 text-fg-secondary">ルームごとに、どの Google カレンダーをどの表示モードで取り込むかを選びます。</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={runAll.isPending} onClick={() => runAll.mutate()}>
          <RefreshCw className="h-4 w-4" strokeWidth={2.5} />
          今すぐ同期
        </Button>
        <Button type="button" variant="ghost" onClick={() => setUnlinkOpen(true)}>連携を解除する</Button>
      </div>
      {runAll.isError ? <p className="rounded-2xl bg-status-absent/15 px-4 py-3 text-sm font-bold text-status-absent">{runAll.error.message}</p> : null}
      <GoogleCalendarConnectSheet open={unlinkOpen} onClose={() => setUnlinkOpen(false)} />
    </section>
  );
}

function formatDate(value: string | null) {
  if (!value) return "未同期";
  return new Date(value).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
