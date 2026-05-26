import { useRouterState } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthLayout } from "@/components/layout/AuthLayout";

export function RootLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isAuth = pathname === "/signin" || pathname === "/login" || pathname === "/verify" || pathname === "/setup";
  return isAuth ? <AuthLayout /> : <AppLayout />;
}
