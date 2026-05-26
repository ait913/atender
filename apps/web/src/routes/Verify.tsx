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
