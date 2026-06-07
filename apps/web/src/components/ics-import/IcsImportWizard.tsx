import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useCommitIcsImport, useIcsImportPreview, useUploadIcsImport } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, ListSkeleton, TextLineSkeleton } from "@/components/ui";

type Step = "upload" | "preview" | "committing" | "done" | "error";

export function IcsImportWizard({ roomId, open, onClose }: { roomId: string; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const upload = useUploadIcsImport(roomId);
  const [step, setStep] = useState<Step>("upload");
  const [importId, setImportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = useIcsImportPreview(roomId, importId ?? undefined);
  const commit = useCommitIcsImport(roomId, importId ?? undefined);

  useEffect(() => {
    if (!open) {
      setStep("upload");
      setImportId(null);
      setError(null);
    }
  }, [open]);

  function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    upload.mutate(file, {
      onSuccess: (data) => {
        setImportId(data.import.id);
        setStep("preview");
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : "アップロードに失敗しました");
        setStep("error");
      },
    });
  }

  function handleCommit() {
    setStep("committing");
    commit.mutate(undefined, {
      onSuccess: () => setStep("done"),
      onError: (err) => {
        setError(err instanceof Error ? err.message : "取り込みに失敗しました");
        setStep("error");
      },
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="カレンダーを取り込む">
      {step === "upload" ? (
        <div className="space-y-4">
          <label className="block rounded-2xl border border-dashed border-border-default bg-bg-muted px-5 py-6 text-center">
            <span className="block text-sm font-black text-fg-primary">ファイルを選択</span>
            <span className="mt-1 block text-xs text-fg-tertiary">.ics, 5MB まで</span>
            <input className="sr-only" type="file" accept=".ics,text/calendar" onChange={(event) => handleFile(event.currentTarget.files?.[0] ?? null)} />
          </label>
          {upload.isPending ? <TextLineSkeleton /> : null}
        </div>
      ) : null}

      {step === "preview" ? (
        <div className="space-y-4">
          {preview.isLoading ? (
            <ListSkeleton rows={4} />
          ) : (
            <>
              <div className="rounded-2xl bg-bg-muted px-4 py-3 text-sm font-bold">
                {preview.data?.events.length ?? 0} 件のイベントが見つかりました
              </div>
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {(preview.data?.events ?? []).slice(0, 10).map((event) => (
                  <li key={`${event.uid}:${event.start}`} className="rounded-2xl bg-bg-muted px-4 py-3">
                    <p className="text-xs font-bold text-fg-tertiary">{new Date(event.start).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    <p className="truncate text-sm font-bold text-fg-primary">"{event.rawTitle}" → "{event.mappedTitle}"</p>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setStep("upload")}>もう一度</Button>
            <Button type="button" variant="primary" disabled={!preview.data || commit.isPending} onClick={handleCommit}>取り込む</Button>
          </div>
        </div>
      ) : null}

      {step === "committing" ? <TextLineSkeleton /> : null}

      {step === "done" ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-bg-muted px-4 py-3 text-sm font-bold">
            {commit.data?.committed ?? 0} 件取り込み、{commit.data?.skipped ?? 0} 件スキップ
          </div>
          {(commit.data?.errors ?? []).length > 0 ? (
            <ul className="space-y-1 text-xs font-semibold text-status-absent">
              {commit.data?.errors.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => void navigate({ to: "/settings/calendar" })}>ルールを編集</Button>
            <Button type="button" variant="primary" onClick={onClose}>閉じる</Button>
          </div>
        </div>
      ) : null}

      {step === "error" ? (
        <div className="space-y-4">
          <p className="rounded-2xl bg-status-absent/15 px-4 py-3 text-sm font-bold text-status-absent">{error}</p>
          <Button type="button" variant="primary" onClick={() => setStep("upload")}>戻る</Button>
        </div>
      ) : null}
    </BottomSheet>
  );
}
