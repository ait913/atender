import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/api/client";
import { useMe } from "@/api/hooks";
import { GoogleCalendarSection } from "@/components/avatar/GoogleCalendarSection";
import { AttendanceRuleSheet } from "@/components/sheet/AttendanceRuleSheet";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { SchoolDeptEditSheet } from "@/components/sheet/SchoolDeptEditSheet";
import { SemesterListSheet } from "@/components/sheet/SemesterListSheet";
import { useTheme, type Theme } from "@/lib/useTheme";
import { ProfileEditSheet } from "./ProfileEditSheet";
import { RequiredRateSheet } from "./RequiredRateSheet";
import { SettingsRow, SettingsSection } from "./SettingsSection";

type Sheet = "profile" | "school" | "rules" | "semesters" | "google" | "requiredRate" | null;

export function Settings() {
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<Sheet>(null);
  const user = me.data?.user;

  async function signOut() {
    await api("/api/auth/sign-out", { method: "POST" }).catch(() => undefined);
    queryClient.clear();
    await navigate({ to: "/signin" });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <section
        className="rounded-lg border p-3"
        style={{
          borderColor: "var(--border-settings)",
          boxShadow: "var(--shadow-settings-panel)",
          background: "var(--color-bg-elevated)",
        }}
      >
        <div className="flex items-center gap-4">
          <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-accent-500 text-base font-black text-fg-on-accent shadow-glow-soft">
            {user?.image ? <img src={user.image} alt="" className="h-full w-full object-cover" /> : (user?.name ?? user?.email ?? "A").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-fg-primary">{user?.name ?? "No name"}</p>
            <p className="truncate text-sm text-fg-secondary">{user?.email}</p>
            {user?.handle ? <p className="truncate text-xs text-fg-tertiary">@{user.handle}</p> : null}
          </div>
        </div>
      </section>

      <SettingsSection title="アカウント">
        <SettingsRow label="プロフィール編集" onClick={() => setSheet("profile")} />
        <SettingsRow label="学校・学科" onClick={() => setSheet("school")} />
      </SettingsSection>

      <SettingsSection title="出席">
        <SettingsRow
          label="必要出席率"
          trailing={<span className="text-sm font-bold text-fg-tertiary">{user?.requiredAttendanceRate ?? 70}%</span>}
          onClick={() => setSheet("requiredRate")}
        />
        <SettingsRow label="出欠ルール" onClick={() => setSheet("rules")} />
        <SettingsRow label="学期管理" onClick={() => setSheet("semesters")} />
      </SettingsSection>

      <SettingsSection title="カレンダー連携">
        <SettingsRow label="Google Calendar 連携" onClick={() => setSheet("google")} />
        <SettingsRow label="カレンダー設定 (ICS 等)" onClick={() => void navigate({ to: "/settings/calendar" })} />
      </SettingsSection>

      <SettingsSection title="表示">
        <ThemeRow />
      </SettingsSection>

      <SettingsSection title="その他">
        <SettingsRow label="ログアウト" danger onClick={() => void signOut()} />
      </SettingsSection>

      <ProfileEditSheet open={sheet === "profile"} onClose={() => setSheet(null)} />
      <SchoolDeptEditSheet open={sheet === "school"} onClose={() => setSheet(null)} />
      <AttendanceRuleSheet open={sheet === "rules"} onClose={() => setSheet(null)} />
      <RequiredRateSheet open={sheet === "requiredRate"} onClose={() => setSheet(null)} />
      <SemesterListSheet open={sheet === "semesters"} onClose={() => setSheet(null)} />
      <BottomSheet open={sheet === "google"} onClose={() => setSheet(null)} title="Google Calendar 連携">
        <GoogleCalendarSection />
      </BottomSheet>
    </div>
  );
}

function ThemeRow() {
  const { theme, setTheme } = useTheme();
  const options: { value: Theme; label: string }[] = [
    { value: "auto", label: "自動" },
    { value: "light", label: "ライト" },
    { value: "dark", label: "ダーク" },
  ];
  return (
    <div className="px-4 py-3">
      <div className="flex gap-1 rounded-full bg-bg-muted p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={`flex-1 rounded-full px-3 py-2 text-xs font-bold transition active:scale-[0.97] ${
              theme === option.value ? "bg-accent-500 text-fg-on-accent shadow-glow-soft" : "text-fg-secondary hover:text-fg-primary"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
