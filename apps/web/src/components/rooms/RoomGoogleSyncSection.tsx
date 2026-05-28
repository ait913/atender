import { CalendarPlus, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useDeleteGoogleSync, useGoogleConnection, useGoogleSyncs, useRunGoogleSync, useUpdateGoogleSync } from "@/api/hooks";
import { GoogleCalendarSelectorSheet } from "@/components/avatar/GoogleCalendarSelectorSheet";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button } from "@/components/ui";

type VisibilityMode = "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";

export function RoomGoogleSyncSection({ roomId }: { roomId: string }) {
  const navigate = useNavigate();
  const connection = useGoogleConnection();
  const syncs = useGoogleSyncs(roomId);
  const run = useRunGoogleSync(roomId);
  const update = useUpdateGoogleSync(roomId);
  const del = useDeleteGoogleSync(roomId);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteEvents, setDeleteEvents] = useState(true);
  const conn = connection.data?.connection ?? null;

  if (!conn) {
    return (
      <section className="space-y-3 border-t border-fg-primary/8 pt-5">
        <h3 className="text-sm font-black text-fg-primary">Google Calendar から同期</h3>
        <p className="text-xs leading-5 text-fg-secondary">まず Google アカウントを連携してください。</p>
        <Button type="button" variant="secondary" onClick={() => void navigate({ to: "/settings/calendar" })}>連携設定を開く</Button>
      </section>
    );
  }

  return (
    <section className="space-y-3 border-t border-fg-primary/8 pt-5">
      <h3 className="text-sm font-black text-fg-primary">Google Calendar から同期</h3>
      {conn.status !== "ACTIVE" ? (
        <p className="rounded-2xl bg-status-absent/15 px-4 py-3 text-sm font-bold text-status-absent">Google の認可が無効です。連携設定から再連携してください。</p>
      ) : null}
      <ul className="space-y-2">
        {(syncs.data?.syncs ?? []).map((sync) => (
          <li key={sync.id} className="rounded-2xl bg-bg-muted p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-fg-primary">{sync.calendarSummary}</p>
                <p className="mt-1 text-xs text-fg-secondary">
                  {visibilityLabel(sync.visibilityMode)} · {sync.enabled ? statusLabel(sync.status) : "一時停止中"} · {formatDate(sync.lastSyncedAt)}
                </p>
                {sync.lastError ? <p className="mt-2 line-clamp-2 text-xs font-bold text-status-absent">{sync.lastError}</p> : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={run.isPending || !sync.enabled} onClick={() => run.mutate(sync.id)}>
                <RefreshCw className="h-4 w-4" strokeWidth={2.5} />
                同期
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={update.isPending}
                onClick={() => update.mutate({ syncId: sync.id, input: { enabled: !sync.enabled } })}
              >
                {sync.enabled ? <Pause className="h-4 w-4" strokeWidth={2.5} /> : <Play className="h-4 w-4" strokeWidth={2.5} />}
                {sync.enabled ? "停止" : "再開"}
              </Button>
              <VisibilityButton syncId={sync.id} value={sync.visibilityMode} onChange={(value) => update.mutate({ syncId: sync.id, input: { visibilityMode: value } })} />
              <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteTarget(sync.id)}>
                <Trash2 className="h-4 w-4" strokeWidth={2.5} />
                切断
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {syncs.data?.syncs.length === 0 ? <p className="rounded-2xl bg-bg-muted px-4 py-3 text-sm font-bold text-fg-secondary">同期中のカレンダーはありません。</p> : null}
      <Button type="button" onClick={() => setSelectorOpen(true)} disabled={conn.status !== "ACTIVE"}>
        <CalendarPlus className="h-4 w-4" strokeWidth={2.5} />
        カレンダーを追加
      </Button>
      <GoogleCalendarSelectorSheet open={selectorOpen} onClose={() => setSelectorOpen(false)} roomId={roomId} />
      <BottomSheet
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        title="このカレンダーを切断"
        footer={
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)}>キャンセル</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={del.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                del.mutate({ syncId: deleteTarget, deleteEvents }, { onSuccess: () => setDeleteTarget(null) });
              }}
            >
              切断する
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <label className="flex gap-3 rounded-2xl bg-bg-muted p-4">
            <input type="radio" className="mt-1" checked={deleteEvents} onChange={() => setDeleteEvents(true)} />
            <span className="text-sm font-bold text-fg-primary">取り込んだ予定も削除する</span>
          </label>
          <label className="flex gap-3 rounded-2xl bg-bg-muted p-4">
            <input type="radio" className="mt-1" checked={!deleteEvents} onChange={() => setDeleteEvents(false)} />
            <span className="text-sm font-bold text-fg-primary">ルームに残す</span>
          </label>
        </div>
      </BottomSheet>
    </section>
  );
}

function VisibilityButton({ syncId, value, onChange }: { syncId: string; value: VisibilityMode; onChange: (value: VisibilityMode) => void }) {
  return (
    <select
      aria-label={`${syncId} の表示モード`}
      className="min-h-10 rounded-full bg-fg-primary/8 px-4 text-sm font-bold text-fg-primary"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value as VisibilityMode)}
    >
      <option value="TITLE_MAPPED">タイトル正規化</option>
      <option value="NORMAL">そのまま表示</option>
      <option value="BUSY_ONLY">予定ありのみ</option>
    </select>
  );
}

function visibilityLabel(value: string) {
  if (value === "NORMAL") return "そのまま表示";
  if (value === "BUSY_ONLY") return "予定ありのみ";
  return "タイトル正規化";
}

function statusLabel(value: string) {
  if (value === "OK") return "同期済み";
  if (value === "FAILED") return "失敗";
  if (value === "SYNCING") return "同期中";
  if (value === "REVOKED") return "認可切れ";
  return "待機中";
}

function formatDate(value: string | null) {
  if (!value) return "未同期";
  return new Date(value).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
