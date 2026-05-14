import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMe } from "@/api/hooks";

export function SetupGuard({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.data && !me.data.setupStatus.isComplete) return <Navigate to="/setup" />;
  return children;
}
