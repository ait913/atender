import { Outlet } from "@tanstack/react-router";
import { BottomTab } from "./BottomTab";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

export function AppLayout() {
  return (
    <div className="min-h-dvh bg-bg-base text-fg-primary md:flex">
      <SideNav />
      <div className="min-w-0 flex-1">
        <TopBar />
        <main className="mx-auto w-full max-w-[960px] px-5 pb-24 pt-5 md:px-8 md:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomTab />
    </div>
  );
}
