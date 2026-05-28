import { Calendar, GraduationCap, Settings as SettingsIcon, UserCircle, Users } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export const navItems: readonly NavItem[] = [
  { to: "/", label: "ホーム", icon: Calendar },
  { to: "/semester", label: "学期・科目", icon: GraduationCap },
  { to: "/rooms", label: "ルーム", icon: Users },
  { to: "/friends", label: "友達", icon: UserCircle },
  { to: "/settings", label: "設定", icon: SettingsIcon },
] as const;

export function isActivePath(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}
