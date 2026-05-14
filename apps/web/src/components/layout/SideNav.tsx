import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { api } from "@/api/client";
import { useMe } from "@/api/hooks";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { navItems } from "./navItems";

export function SideNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const me = useMe();

  async function signOut() {
    await api("/api/auth/sign-out", { method: "POST" }).catch(() => null);
    await navigate({ to: "/signin" });
  }

  const initial = (me.data?.user.name ?? me.data?.user.email ?? "A").slice(0, 1).toUpperCase();

  return (
    <aside className="hidden min-h-dvh w-60 shrink-0 border-r border-border-subtle bg-bg-muted p-4 md:flex md:flex-col">
      <div className="mb-6 text-xl font-bold text-fg-primary">Atender</div>
      <nav className="grid gap-1">
        {navItems.map((item) => {
          const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cx("relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm", active ? "bg-accent-50 font-semibold text-accent-700" : "text-fg-secondary hover:bg-bg-elevated")}
            >
              <span className={cx("absolute bottom-2 left-0 top-2 w-0.5 rounded-full", active && "bg-accent-500")} />
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center gap-3 border-t border-border-subtle pt-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-100 font-semibold text-accent-700">{initial}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{me.data?.user.name ?? "Atender"}</p>
          <p className="truncate text-xs text-fg-secondary">{me.data?.user.email}</p>
        </div>
        <Button variant="ghost" size="sm" aria-label="ログアウト" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}
