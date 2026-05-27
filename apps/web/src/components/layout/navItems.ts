import { Calendar, Grid3x3, Sparkles, Users } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export const navItems: readonly NavItem[] = [
  { to: "/", label: "今日", icon: Calendar },
  { to: "/timetable", label: "時間割", icon: Grid3x3 },
  { to: "/rooms", label: "ルーム", icon: Users },
  { to: "/friends", label: "友達", icon: Sparkles },
] as const;

export function isActivePath(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}
