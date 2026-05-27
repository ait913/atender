import { useEffect, useState } from "react";
import type { UserTimetableDto } from "@atender/shared";
import { usePatchUserTimetable, usePublishTimetable } from "@/api/hooks";
import { Button, Field, Input, Toggle } from "@/components/ui";
import { BottomSheet } from "./BottomSheet";

export function TimetableSettingsSheet({
  open,
  onClose,
  timetable,
}: {
  open: boolean;
  onClose: () => void;
  timetable: UserTimetableDto | null;
}) {
  const patch = usePatchUserTimetable(timetable?.id);
  const publish = usePublishTimetable(timetable?.id);
  const [name, setName] = useState("");
  const [publishEnabled, setPublishEnabled] = useState(true);
  const [publishTitle, setPublishTitle] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(timetable?.title ?? "");
    setPublishEnabled(true);
    setPublishTitle(timetable?.title ?? "");
    setMessage(null);
  }, [open, timetable?.title]);

  async function handleSave() {
    if (!timetable) return;
    const trimmedName = name.trim();
    const trimmedPublishTitle = publishTitle.trim();
    if (trimmedName.length > 0 && trimmedName !== timetable.title) {
      await patch.mutateAsync({ title: trimmedName });
    }
    if (publishEnabled) {
      if (trimmedPublishTitle.length === 0) {
        setMessage("公開タイトルを入力してください");
        return;
      }
      await publish.mutateAsync({ title: trimmedPublishTitle });
    }
    onClose();
  }

  function handleCancel() {
    setName(timetable?.title ?? "");
    setPublishEnabled(true);
    setPublishTitle(timetable?.title ?? "");
    setMessage(null);
    onClose();
  }

  const disabled = !timetable || patch.isPending || publish.isPending;

  return (
    <BottomSheet open={open} onClose={handleCancel} title="時間割の設定">
      {!timetable ? (
        <p className="rounded-2xl bg-white/6 p-4 text-sm text-fg-secondary">先に学期を作成してください。</p>
      ) : null}
      <Field label="名前">
        <Input value={name} disabled={!timetable} onChange={(event) => setName(event.currentTarget.value)} />
      </Field>
      <div className="border-t border-white/8 pt-5">
        <Toggle checked={publishEnabled} disabled={!timetable} onChange={setPublishEnabled} label="みんなの時間割で公開" />
        {publishEnabled ? (
          <div className="mt-5">
            <Field label="公開タイトル">
              <Input value={publishTitle} disabled={!timetable} onChange={(event) => setPublishTitle(event.currentTarget.value)} />
            </Field>
          </div>
        ) : null}
      </div>
      {message ? <p className="rounded-2xl bg-status-tardy/15 px-4 py-3 text-sm font-bold text-status-tardy">{message}</p> : null}
      <div className="sticky bottom-0 -mx-5 flex justify-end gap-3 border-t border-border-subtle bg-bg-elevated px-5 py-3">
        <Button type="button" variant="ghost" onClick={handleCancel}>キャンセル</Button>
        <Button type="button" variant="primary" disabled={disabled} onClick={() => void handleSave()}>保存</Button>
      </div>
    </BottomSheet>
  );
}
