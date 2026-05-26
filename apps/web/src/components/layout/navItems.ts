export const navItems = [
  { to: "/", label: "今日", icon: "◐" },
  { to: "/timetable", label: "時間割", icon: "▦" },
  { to: "/rooms", label: "ルーム", icon: "◎" },
  { to: "/friends", label: "友達", icon: "✦" },
] as const;

export function isActivePath(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}
