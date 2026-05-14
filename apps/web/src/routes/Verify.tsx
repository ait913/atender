import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { API_URL } from "@/api/client";
import { Button } from "@/components/ui";

export function Verify() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setFailed(true);
      return;
    }
    window.location.href = `${API_URL}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(window.location.origin)}`;
  }, [navigate]);

  if (!failed) return <p className="text-center text-sm text-fg-secondary">ログインを確認しています</p>;
  return (
    <div className="grid gap-4 text-center">
      <h1 className="text-xl font-semibold">リンクが無効です</h1>
      <Button onClick={() => void navigate({ to: "/signin" })}>もう一度ログイン</Button>
    </div>
  );
}
