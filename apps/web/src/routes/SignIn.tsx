import { useState } from "react";
import type { FormEvent } from "react";
import { API_URL, APP_URL, api } from "@/api/client";
import { Mascot } from "@/components/mascot/Mascot";
import { Button, Field, Input } from "@/components/ui";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
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
        {error ? <p className="text-sm font-semibold text-red-500">{error}</p> : null}
      </form>
      <div className="flex items-center gap-3 text-xs text-fg-tertiary"><span className="h-px flex-1 bg-border-subtle" />または<span className="h-px flex-1 bg-border-subtle" /></div>
      <button
        type="button"
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-default px-4 text-sm font-semibold"
        onClick={() => { void googleSignIn(); }}
      >
        Google で続ける
      </button>
    </div>
  );
}
