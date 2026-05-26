import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export function Settings() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/", replace: true });
  }, [navigate]);
  return null;
}
