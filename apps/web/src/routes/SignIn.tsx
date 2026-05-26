import { FormEvent, useEffect, useState } from "react";
import { API_URL, APP_URL, api } from "@/api/client";
import { Mascot } from "@/components/mascot/Mascot";
import { Button, Field, Input } from "@/components/ui";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cooldown) return;
    const id = window.setTimeout(() => {
      setCooldown(false);
    }, 60_000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      await api("/api/auth/sign-in/magic-link", { method: "POST", body: { email, callbackURL: `${APP_URL}/` } });
      setMessage("メールを送信しました");
    } catch {
      setError("メールを送信できませんでした");
    } finally {
      setLoading(false);
    }
  }

  async function googleSignIn() {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/sign-in/social`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: `${APP_URL}/` }),
      });
      if (!res.ok) throw new Error("social sign-in failed");
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("no redirect url");
      }
    } catch {
      setError("Google ログインを開始できませんでした");
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-110px)] max-w-md flex-col justify-center">
      <PageTitle title="Atender">Attendance for students</PageTitle>
      <Panel>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-fg-secondary" htmlFor="email">
            メールアドレス
          </label>
          <Field id="email" type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} required autoComplete="email" />
          <Button
            className="w-full"
            type="submit"
            variant="primary"
            disabled={cooldown || !email}
          >
            {sent ? "再送する" : "ログインリンクを送る"}
          </Button>
          {sent ? <p className="text-sm text-accent-700">メールを送信しました。15 分以内にリンクを開いてください</p> : null}
          {error ? <p className="text-sm text-status-absent">{error}</p> : null}
        </form>
        <div className="my-6 flex items-center gap-3 text-xs text-fg-tertiary">
          <span className="h-px flex-1 bg-border-subtle" />
          または
          <span className="h-px flex-1 bg-border-subtle" />
        </div>
        <Button
          type="button"
          className="w-full"
          onClick={() => { void googleSignIn(); }}
        >
          G　Google でサインイン
        </Button>
        <p className="mt-8 text-center text-xs font-semibold text-fg-tertiary">based in tokyo/chiba</p>
      </Panel>
    </div>
  );
}
