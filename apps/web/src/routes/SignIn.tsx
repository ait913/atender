import { FormEvent, useEffect, useRef, useState } from "react";
import { API_URL, APP_URL, api } from "@/api/client";
import { Button, Field, PageTitle, Panel } from "@/components/ui";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!cooldown) return;
    const id = window.setTimeout(() => {
      if (submitRef.current) submitRef.current.disabled = false;
    }, 60_000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCooldown(true);
    await api<{ ok: boolean }>("/api/auth/sign-in/magic-link", {
      method: "POST",
      body: { email, callbackURL: `${APP_URL}/` },
    }).then(
      () => {
        setSent(true);
      },
      () => {
        setCooldown(false);
        setError("メールを送信できませんでした");
      },
    );
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
      const data = (await res.json()) as { url?: string; redirect?: boolean };
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
      <PageTitle title="Atender::">Attendance for students</PageTitle>
      <Panel>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm font-bold text-white/78" htmlFor="email">
            メールアドレス
          </label>
          <Field id="email" type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} required autoComplete="email" />
          <button
            ref={submitRef}
            className="min-h-11 w-full rounded-lg border border-white/24 px-4 py-2 text-sm font-bold text-white transition hover:opacity-70 disabled:opacity-40"
            type="submit"
            disabled={cooldown || !email}
          >
            {sent ? "再送する" : "ログインリンクを送る"}
          </button>
          {sent ? <p className="text-sm text-emerald-200">メールを送信しました。15 分以内にリンクを開いてください</p> : null}
          {error ? <p className="text-sm text-red-200">{error}</p> : null}
        </form>
        <div className="my-6 flex items-center gap-3 text-xs text-white/45">
          <span className="h-px flex-1 bg-white/14" />
          または
          <span className="h-px flex-1 bg-white/14" />
        </div>
        <button
          type="button"
          className="block min-h-11 w-full rounded-lg border border-white/24 px-4 py-2 text-center text-sm font-bold text-white transition hover:opacity-70"
          onClick={() => { void googleSignIn(); }}
        >
          G　Google でサインイン
        </button>
        <p className="mt-8 text-center text-xs font-bold text-white/45">- based in tokyo/chiba -</p>
      </Panel>
    </div>
  );
}
