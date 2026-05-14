import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ApiError } from "@/api/client";
import { useMe } from "@/api/hooks";

export function SessionGuard({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/signin" />;
  return children;
}
