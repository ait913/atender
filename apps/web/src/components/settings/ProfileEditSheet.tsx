import { useState } from "react";
import { useMe, usePatchMe } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input } from "@/components/ui";

export function ProfileEditSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const patch = usePatchMe();
  const [name, setName] = useState(me.data?.user.name ?? "");
  const [handle, setHandle] = useState(me.data?.user.handle ?? "");
  const [error, setError] = useState<string | null>(null);
  const trimmedName = name.trim();
  const trimmedHandle = handle.trim();
  const handleValid = trimmedHandle === "" || /^[a-zA-Z0-9_]{1,30}$/.test(trimmedHandle);

  function handleSave() {
    setError(null);
    if (trimmedHandle && !handleValid) {
      setError("ハンドルは半角英数字とアンダースコア (_) のみ、30 文字以内です");
      return;
    }
    const body: { name?: string; handle?: string } = {};
    if (trimmedName && trimmedName !== me.data?.user.name) body.name = trimmedName;
    if (trimmedHandle && trimmedHandle !== me.data?.user.handle) body.handle = trimmedHandle;
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    patch.mutate(body, {
      onSuccess: onClose,
      onError: (err) => setError(err instanceof Error ? err.message : "保存に失敗しました"),
    });
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="プロフィール"
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
          <Button type="button" variant="primary" disabled={patch.isPending} onClick={handleSave}>保存</Button>
        </div>
      }
    >
      <Field label="名前"><Input value={name} onChange={(event) => setName(event.currentTarget.value)} /></Field>
      <Field label="ハンドル" hint="半角英数字 + _ のみ (空のままで設定なし)">
        <Input value={handle} onChange={(event) => setHandle(event.currentTarget.value.replace(/^@/, ""))} placeholder="your_handle" />
      </Field>
      {error ? <p className="rounded-2xl bg-status-absent/15 px-4 py-3 text-sm font-bold text-status-absent">{error}</p> : null}
    </BottomSheet>
  );
}
