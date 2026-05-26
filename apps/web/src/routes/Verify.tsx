import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { API_URL, api } from "@/api/client";
import type { MeResponse } from "@/api/hooks/types";
import { PageTitle, Panel } from "@/components/ui";

export function Verify() {
  const search = useSearch({ strict: false }) as { token?: string; error?: string };
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (search.error) {
      setFailed(true);
      return;
    }
    if (!search.token) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    async function verify() {
      const url = new URL(`${API_URL}/api/auth/magic-link/verify`);
      url.searchParams.set("token", search.token!);
      const response = await fetch(url.toString(), { credentials: "include" });
      if (!response.ok) throw new Error("verify failed");
      const me = await api<MeResponse>("/api/me");
      if (!cancelled) await navigate({ to: me.setupStatus.isComplete ? "/" : "/setup" });
    }
    verify().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate, search.error, search.token]);

  return (
    <div className="mx-auto max-w-md py-20">
      <PageTitle title="認証中">ログインリンクを確認しています</PageTitle>
      <Panel>
        {failed ? (
          <div className="space-y-4">
            <p className="text-sm text-status-absent">リンクが無効か期限切れです。</p>
            <Link to="/signin" className="text-sm font-bold underline underline-offset-4">
              もう一度ログイン
            </Link>
          </div>
        ) : (
          <p className="text-sm text-fg-secondary">このまま少し待ってください</p>
        )}
      </Panel>
    </div>
  );
}
