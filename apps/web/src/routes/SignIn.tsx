import { useState } from "react";
import type { FormEvent } from "react";
import { authUrl, api, APP_URL } from "@/api/client";
import { Mascot } from "@/components/mascot/Mascot";
import { Button, Field, Input } from "@/components/ui";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      await api("/api/auth/sign-in/magic-link", { method: "POST", body: { email, callbackURL: `${APP_URL}/verify` } });
      setMessage("メールを送信しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="text-center">
        <Mascot size="md" className="mx-auto" />
        <h1 className="mt-3 text-2xl font-bold">Atender</h1>
        <p className="mt-2 text-sm text-fg-secondary">学生のための出欠管理</p>
      </div>
      <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
        <Field label="メールアドレス"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
        <Button type="submit" disabled={loading}>{loading ? "送信中" : "ログインリンクを送る"}</Button>
        {message ? <p className="text-sm font-semibold text-accent-700">{message}</p> : null}
      </form>
      <div className="flex items-center gap-3 text-xs text-fg-tertiary"><span className="h-px flex-1 bg-border-subtle" />または<span className="h-px flex-1 bg-border-subtle" /></div>
      <a className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-default px-4 text-sm font-semibold" href={authUrl("/api/auth/sign-in/social/google", { callbackURL: APP_URL })}>
        Google で続ける
      </a>
    </div>
  );
}
