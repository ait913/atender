import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { API_URL, APP_URL } from "@/api/client";
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
    const url = new URL(`${API_URL}/api/auth/magic-link/verify`);
    url.searchParams.set("token", search.token);
    url.searchParams.set("callbackURL", `${APP_URL}/`);
    window.location.assign(url.toString());
  }, [navigate, search.error, search.token]);

  return (
    <div className="mx-auto max-w-md py-20">
      <PageTitle title="Verify::">ログインリンクを確認しています</PageTitle>
      <Panel>
        {failed ? (
          <div className="space-y-4">
            <p className="text-sm text-red-100">リンクが無効か期限切れです。</p>
            <Link to="/signin" className="text-sm font-bold underline underline-offset-4">
              もう一度ログイン
            </Link>
          </div>
        ) : (
          <p className="text-sm text-white/70">このまま少し待ってください</p>
        )}
      </Panel>
    </div>
  );
}
