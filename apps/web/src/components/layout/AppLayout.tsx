import { Outlet, useLocation } from "@tanstack/react-router";
import { BottomTab } from "./BottomTab";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

const titles: Record<string, string> = {
  "/": "今日",
  "/timetable": "時間割",
  "/templates": "みんなの時間割",
  "/stats": "出席率",
  "/me": "マイページ",
};

export function AppLayout() {
  const location = useLocation();
  const title = titles[location.pathname] ?? "Atender";
  return (
    <div className="min-h-dvh bg-bg-base text-fg-primary md:flex">
      <SideNav />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <TopBar title={title} />
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
        <BottomTab />
      </div>
    </div>
  );
}
