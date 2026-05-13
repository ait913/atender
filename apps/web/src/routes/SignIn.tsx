import { FormEvent, useEffect, useState } from "react";
import { APP_URL, api, authUrl } from "@/api/client";
import { Button, Field, PageTitle, Panel } from "@/components/ui";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    await api<{ ok: boolean }>("/api/auth/sign-in/magic-link", {
      method: "POST",
      body: { email, callbackURL: `${APP_URL}/verify` },
    }).then(
      () => {
        setSent(true);
        setCooldown(60);
      },
      () => setError("メールを送信できませんでした"),
    );
  }

  function googleSignIn() {
    window.location.assign(authUrl("/api/auth/sign-in/social", { provider: "google", callbackURL: `${APP_URL}/` }));
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-110px)] max-w-md flex-col justify-center">
      <PageTitle title="Atender::">Attendance for students</PageTitle>
      <Panel>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm font-bold text-white/78" htmlFor="email">
            メールアドレス
          </label>
          <Field id="email" type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} required autoComplete="email" />
          <Button className="w-full" type="submit" disabled={cooldown > 0 || !email}>
            {cooldown > 0 ? `再送まで ${cooldown} 秒` : "ログインリンクを送る"}
          </Button>
          {sent ? <p className="text-sm text-emerald-200">メールを送信しました。15 分以内にリンクを開いてください</p> : null}
          {error ? <p className="text-sm text-red-200">{error}</p> : null}
        </form>
        <div className="my-6 flex items-center gap-3 text-xs text-white/45">
          <span className="h-px flex-1 bg-white/14" />
          または
          <span className="h-px flex-1 bg-white/14" />
        </div>
        <Button className="w-full" type="button" onClick={googleSignIn}>
          G　Google でサインイン
        </Button>
        <p className="mt-8 text-center text-xs font-bold text-white/45">- based in tokyo/chiba -</p>
      </Panel>
    </div>
  );
}
