import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/api/client";
import { useMe, usePatchMe, usePendingFriendshipCount } from "@/api/hooks";
import { AttendanceRuleSheet } from "@/components/sheet/AttendanceRuleSheet";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { SchoolDeptEditSheet } from "@/components/sheet/SchoolDeptEditSheet";
import { SemesterListSheet } from "@/components/sheet/SemesterListSheet";
import { Button, Field, Input } from "@/components/ui";
import { useMediaQuery } from "@/lib/useMediaQuery";

type Sheet = "menu" | "profile" | "school" | "rules" | "semesters" | null;

export function AvatarMenu() {
  const me = useMe();
  const pending = usePendingFriendshipCount();
  const mobile = useMediaQuery("(max-width: 767px)");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const user = me.data?.user;
  const initial = (user?.name ?? user?.email ?? "A").slice(0, 1).toUpperCase();

  async function signOut() {
    await api("/api/auth/sign-out", { method: "POST" }).catch(() => undefined);
    queryClient.clear();
    await navigate({ to: "/signin" });
  }

  const trigger = (
    <button
      type="button"
      className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-accent-100 text-sm font-semibold text-accent-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      onClick={() => (mobile ? setSheet("menu") : setOpen((value) => !value))}
      aria-label="アカウントメニュー"
    >
      {user?.image ? <img src={user.image} alt="" className="h-full w-full object-cover" /> : initial}
      {(pending.data ?? 0) > 0 ? <span className="absolute right-0 top-0 h-4 w-4 rounded-full border-2 border-bg-muted bg-accent-500" /> : null}
    </button>
  );

  const menu = (
    <div className="min-w-72 space-y-1 rounded-md border border-border-subtle bg-bg-elevated p-2 shadow-popover">
      <div className="border-b border-border-subtle px-3 py-3">
        <p className="font-semibold">{user?.name ?? "No name"}</p>
        <p className="text-xs text-fg-secondary">{user?.email}</p>
      </div>
      <MenuButton onClick={() => setSheet("profile")}>プロフィール</MenuButton>
      <MenuButton onClick={() => setSheet("school")}>学校・学科</MenuButton>
      <MenuButton onClick={() => setSheet("rules")}>出欠ルール</MenuButton>
      <MenuButton onClick={() => setSheet("semesters")}>学期管理</MenuButton>
      <div className="border-t border-border-subtle pt-1">
        <MenuButton onClick={() => void navigate({ to: "/stats" })}>出席率を見る</MenuButton>
        <MenuButton onClick={() => void navigate({ to: "/templates" })}>みんなの時間割</MenuButton>
      </div>
      <div className="border-t border-border-subtle pt-1">
        <MenuButton danger onClick={() => void signOut()}>ログアウト</MenuButton>
      </div>
    </div>
  );

  return (
    <div className="relative">
      {trigger}
      {!mobile && open ? <div className="absolute right-0 top-12 z-50">{menu}</div> : null}
      <BottomSheet open={sheet === "menu"} onClose={() => setSheet(null)}>{menu}</BottomSheet>
      <ProfileEditSheet open={sheet === "profile"} onClose={() => setSheet(null)} />
      <SchoolDeptEditSheet open={sheet === "school"} onClose={() => setSheet(null)} />
      <AttendanceRuleSheet open={sheet === "rules"} onClose={() => setSheet(null)} />
      <SemesterListSheet open={sheet === "semesters"} onClose={() => setSheet(null)} />
    </div>
  );
}

function MenuButton({ children, onClick, danger = false }: { children: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className={`block w-full rounded-sm px-3 py-2 text-left text-sm font-medium hover:bg-bg-muted ${danger ? "text-status-absent" : "text-fg-primary"}`} onClick={onClick}>
      {children}
    </button>
  );
}

function ProfileEditSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const patch = usePatchMe();
  const [name, setName] = useState(me.data?.user.name ?? "");
  const [handle, setHandle] = useState(me.data?.user.handle ?? "");
  return (
    <BottomSheet open={open} onClose={onClose} title="プロフィール">
      <Field label="名前"><Input value={name} onChange={(event) => setName(event.currentTarget.value)} /></Field>
      <Field label="ハンドル"><Input value={handle} onChange={(event) => setHandle(event.currentTarget.value.replace(/^@/, ""))} /></Field>
      <div className="sticky bottom-0 -mx-5 flex justify-end gap-3 border-t border-border-subtle bg-bg-elevated px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
        <Button type="button" variant="primary" onClick={() => patch.mutate({ name, handle }, { onSuccess: onClose })}>保存</Button>
      </div>
    </BottomSheet>
  );
}
