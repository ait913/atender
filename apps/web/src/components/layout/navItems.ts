import { BarChart3, CalendarCheck, LayoutGrid, Search, UserCircle } from "lucide-react";

export const navItems = [
  { to: "/", label: "今日", icon: CalendarCheck },
  { to: "/timetable", label: "時間割", icon: LayoutGrid },
  { to: "/templates", label: "みんなの時間割", icon: Search },
  { to: "/stats", label: "出席率", icon: BarChart3 },
  { to: "/me", label: "マイページ", icon: UserCircle },
] as const;
