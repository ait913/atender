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

type Sheet = "profile" | "school" | "rules" | "semesters" | null;

export function AvatarMenu() {
  const me = useMe();
  const pending = usePendingFriendshipCount();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const { matches: mobile, mounted } = useMediaQuery("(max-width: 767px)");
  const user = me.data?.user;
  const initial = (user?.name ?? user?.email ?? "A").slice(0, 1).toUpperCase();

  async function signOut() {
    await api("/api/auth/sign-out", { method: "POST" }).catch(() => undefined);
    queryClient.clear();
    await navigate({ to: "/signin" });
  }

  function openSheet(next: Sheet) {
    setMenuOpen(false);
    setSheet(next);
  }

  const trigger = (
    <button
      type="button"
      className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-accent-500 text-base font-black text-fg-on-accent shadow-glow-soft active:scale-95 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      onClick={() => {
        if (!mounted) return;
        setMenuOpen((v) => !v);
      }}
      aria-label="アカウントメニュー"
      aria-expanded={menuOpen}
    >
      {user?.image ? <img src={user.image} alt="" className="h-full w-full object-cover" /> : initial}
      {(pending.data ?? 0) > 0 ? <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-bg-base bg-status-tardy" /> : null}
    </button>
  );

  const menu = (
    <div className="w-full space-y-1 rounded-3xl bg-bg-elevated p-3 shadow-popover md:min-w-72">
      <div className="px-4 py-3">
        <p className="text-lg font-bold tracking-tight">{user?.name ?? "No name"}</p>
        <p className="text-xs text-fg-secondary">{user?.email}</p>
      </div>
      <MenuButton onClick={() => openSheet("profile")}>プロフィール</MenuButton>
      <MenuButton onClick={() => openSheet("school")}>学校・学科</MenuButton>
      <MenuButton onClick={() => openSheet("rules")}>出欠ルール</MenuButton>
      <MenuButton onClick={() => openSheet("semesters")}>学期管理</MenuButton>
      <div className="my-1 h-px bg-white/8" />
      <MenuButton onClick={() => { setMenuOpen(false); void navigate({ to: "/stats" }); }}>出席率を見る</MenuButton>
      <div className="my-1 h-px bg-white/8" />
      <MenuButton danger onClick={() => void signOut()}>ログアウト</MenuButton>
    </div>
  );

  return (
    <div className="relative">
      {trigger}
      {/* PC: dropdown */}
      {!mobile && menuOpen ? (
        <>
          <button
            type="button"
            aria-label="閉じる"
            className="fixed inset-0 z-[1100] hidden md:block"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-0 top-12 z-[1120] hidden max-w-[calc(100vw-32px)] md:block">
            {menu}
          </div>
        </>
      ) : null}
      {/* Mobile: BottomSheet (CSS で PC 非表示) */}
      <div className="md:hidden">
        <BottomSheet open={mobile && menuOpen} onClose={() => setMenuOpen(false)} title="アカウント">
          {menu}
        </BottomSheet>
      </div>
      <ProfileEditSheet open={sheet === "profile"} onClose={() => setSheet(null)} />
      <SchoolDeptEditSheet open={sheet === "school"} onClose={() => setSheet(null)} />
      <AttendanceRuleSheet open={sheet === "rules"} onClose={() => setSheet(null)} />
      <SemesterListSheet open={sheet === "semesters"} onClose={() => setSheet(null)} />
    </div>
  );
}

function MenuButton({ children, onClick, danger = false }: { children: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      className={`block w-full rounded-2xl px-4 py-3 text-left text-base font-bold transition active:scale-[0.98] hover:bg-white/6 ${
        danger ? "text-status-absent" : "text-fg-primary"
      }`}
      onClick={onClick}
    >
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
    <BottomSheet
      open={open}
      onClose={onClose}
      title="プロフィール"
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
          <Button type="button" variant="primary" onClick={() => patch.mutate({ name, handle }, { onSuccess: onClose })}>保存</Button>
        </div>
      }
    >
      <Field label="名前"><Input value={name} onChange={(event) => setName(event.currentTarget.value)} /></Field>
      <Field label="ハンドル"><Input value={handle} onChange={(event) => setHandle(event.currentTarget.value.replace(/^@/, ""))} /></Field>
    </BottomSheet>
  );
}
