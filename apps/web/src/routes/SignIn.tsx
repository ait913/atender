import { FormEvent, useEffect, useState } from "react";
import { API_URL, APP_URL, api } from "@/api/client";
import { AuthProviderButton, Button, Field } from "@/components/ui";

type EmailPhase = "collapsed" | "editing" | "sent";
type SocialProvider = "apple" | "google";

export function SignIn() {
  const [emailPhase, setEmailPhase] = useState<EmailPhase>("collapsed");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSendLink = email !== "" && !sending && !cooldown;

  useEffect(() => {
    if (!cooldown) return;
    const id = window.setTimeout(() => {
      setCooldown(false);
    }, 60_000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSendLink) return;

    setError(null);
    setSending(true);
    try {
      await api<{ ok: boolean }>("/api/auth/sign-in/magic-link", {
        method: "POST",
        body: { email, callbackURL: `${APP_URL}/` },
      });
      setEmailPhase("sent");
      setCooldown(true);
    } catch {
      setError("メールを送信できませんでした");
    } finally {
      setSending(false);
    }
  }

  async function socialSignIn(provider: SocialProvider): Promise<void> {
    setError(null);
    setLoadingProvider(provider);
    try {
      const res = await fetch(`${API_URL}/api/auth/sign-in/social`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, callbackURL: `${APP_URL}/` }),
      });
      if (!res.ok) throw new Error("social sign-in failed");
      const data = (await res.json()) as { url?: string; redirect?: boolean };
      if (!data.url) throw new Error("no redirect url");
      window.location.href = data.url;
    } catch {
      setLoadingProvider(null);
      setError(provider === "apple" ? "Apple ログインを開始できませんでした" : "Google ログインを開始できませんでした");
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-110px)] max-w-md flex-col justify-center px-6 py-6">
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3" aria-label="Atender">
          <img src="/logo-mark.png" srcSet="/logo-mark.png 1x, /logo-mark@2x.png 2x" alt="" width={56} height={56} className="size-14" />
          <div className="relative h-[22px]">
            <img src="/wordmark-navy.png" alt="Atender" className="wordmark-light h-[22px] w-auto" />
            <img src="/wordmark-white.png" alt="Atender" className="wordmark-dark absolute inset-0 h-[22px] w-auto" />
          </div>
        </div>

        <p className="text-center text-sm text-fg-secondary">下記のアカウントを使用してログイン</p>

        <div className="flex w-full flex-col gap-3">
          <AuthProviderButton
            kind="apple"
            label="Appleで続ける"
            loading={loadingProvider === "apple"}
            onClick={() => {
              void socialSignIn("apple");
            }}
          />
          <AuthProviderButton
            kind="google"
            label="Google で続ける"
            loading={loadingProvider === "google"}
            onClick={() => {
              void socialSignIn("google");
            }}
          />
          <AuthProviderButton
            kind="email"
            label="メールで続ける"
            onClick={() => {
              setError(null);
              setEmailPhase("editing");
            }}
          />

          {emailPhase !== "collapsed" ? (
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <Field
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                required
                autoComplete="email"
                placeholder="メールアドレス"
                className="!h-11 !min-h-11 rounded-[10px] px-4 py-0 text-sm"
              />
              <Button
                className="w-full !h-11 !min-h-11 !rounded-[10px]"
                type="submit"
                variant="primary"
                disabled={!canSendLink}
              >
                {sending ? "送信中" : emailPhase === "sent" ? "再送する" : "ログインリンクを送る"}
              </Button>
              {emailPhase === "sent" ? (
                <p className="text-center text-sm text-fg-secondary">メールを送信しました。15 分以内にリンクを開いてください</p>
              ) : null}
            </form>
          ) : null}

          {error ? <p className="text-center text-sm text-status-absent">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
