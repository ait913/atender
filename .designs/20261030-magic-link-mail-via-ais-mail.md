# Magic Link メールの送信を Resend から AIS Mail (aisaba.net) に移す

- 日付: 2026-10-30 / Architect
- ブランチ: `feature/ais-mail` (1 worktree: `Muraki/worktrees/atender-ais-mail`)
- 実装: Codex (developer sonnet が運転) / Reviewer: **実施** (認証と外部連携に触るので skip しない)
- 正典: AIS Mail の I/F は `Muraki/knowledge/library/ais-mail-service-send-api.md` (コードは `Muraki/projects/ais-mail/src/service-api/routes.ts`, `src/send/enqueue.ts`, `src/send/attempt.ts`)

## 1. 目的

atender API のログイン用メール (Magic Link) を、外部 SaaS の Resend でなく Touri 自前の AIS Mail (Cloudflare Workers、`https://mail.aisaba.net`) から `Atender <no-reply@aisaba.net>` で送る。あわせて、今は送信の失敗を握りつぶして 200 を返している挙動をやめ、送れなかったことをユーザーに返す。

## 2. スコープ

| 対象 | 変更 |
|---|---|
| `apps/api` の Magic Link 送信 (`auth.ts` の `sendMagicLink`、唯一の送信箇所) | Resend SDK → `fetch` で AIS Mail `POST /api/v1/send` |
| `apps/api` の env | `RESEND_API_KEY` / `RESEND_FROM` を消し、`AIS_MAIL_TOKEN` (必須) / `AIS_MAIL_URL` (任意) を入れる |
| `apps/api` のテスト基盤 | `vi.mock("resend")` を消し、AIS Mail 宛の `fetch` だけを横取りする mock に替える |
| `apps/web/public/privacy.html` | 外部サービスの「Resend」行を消し、Cloudflare の行にログイン用メールの送信を足す (§8.3)。**ブリーフに無い追加** (理由は §8.3) |
| メールの文言・テンプレート・有効期限 15 分 | **変えない** (1 文字も変えずに移す) |
| iOS / Web のログイン画面 | **変えない** (iOS は既存のエラー表示経路で新しいメッセージを出せる。§6.3) |
| Resend アカウント・appily.run の DNS | **触らない** (meishilink と共有。atender 用キーの失効だけを後続で Touri が行う) |

データモデル: **変更なし** (Prisma schema・migration なし。Magic Link のトークンは既存の `Verification` 表のまま)。

## 3. 現状の確認 (2026-10-30 main `2e2ebe0` で grep 済み)

- `resend` の参照は `apps/api` の 9 箇所だけ: `src/auth.ts:5,9,127-133` / `src/env.ts:11-12` / `package.json:29` / `tests/setup.ts:8,30-31,38-50,58` / `tests/helpers/auth.ts:204` / `tests/auth.test.ts:174-199` (#75/#76) / `.env.example:6-7` / `.env.test:6-7`。`apps/api/src` の外で送信は無い
- 文字列「Resend」はほかに `apps/web/public/privacy.html:77` と `apps/web/tests/legal/legal-pages.test.ts:62` (#L4 が含有を要求)、`README.md:11`、`CLAUDE.md:24,28,163` にある (`apps/web/tests/routes/SignIn.test.tsx` の `resend` は「再送」ボタンの変数名で無関係)
- `signInViaMagicLink` (mock から URL を抜く helper) を使うテスト: `auth.test.ts` / `cors-cookie.test.ts` / `ios-api.test.ts` / `version.test.ts` / `a2-review.test.ts` / `tests-secure/sign-out.test.ts`。helper の差し替えだけで全部追従する
- `globalThis.fetch` を spy しているテスト: `b20-apple-authorization.test.ts` (`vi.spyOn(globalThis, "fetch")` + `afterEach(vi.restoreAllMocks)`) と `b20-account-deletion.test.ts` (`restoreAllMocks`)。§7.2 の mock はこの 2 本と共存する形にしてある
- **better-auth 1.6.33 の実測 (scratchpad で `betterAuth` + `memoryAdapter` + `magicLink` を実走)**:
  - `sendMagicLink` が素の `Error` を投げる → **500、body は空** (Content-Type なし)。iOS はこれを「サーバーエラー (HTTP 500)」と表示する
  - `throw new APIError("INTERNAL_SERVER_ERROR", { error: { code, message } })` → **500、body は `{"error":{"code":…,"message":…}}` がそのまま出る** (application/json)
  - どちらの場合も `Verification` 行は作られた後に残る (15 分で失効するだけで害はない)
  - better-auth は `email` を小文字化しない。`sendMagicLink` に渡る `email` は入力そのまま
  - magic-link plugin は `/sign-in/magic-link` に既定で 60 秒 5 回の rate limit を持つ (本番のみ有効。今回触らない)
- **AIS Mail の 202 は `status: "failed"` を返し得る** (`routes.ts:14` のコメント「§6-2 に failed が無いが、S7 と同じ初回結果を返す」、`attempt.ts:8,39,51`)。初回試行で恒久エラー (`E_RECIPIENT_SUPPRESSED` 等の再試行しない失敗、差出人の再検査失敗) になった時で、そのメールは二度と送られない。knowledge の「`sent`|`queued`|`sending`」は不足だったので同ファイルを置換済み
- AIS Mail はサービス送信の本文 (ログイン URL を含む) を、終端 (`sent` / `failed`) になった時点で R2 から消す (`attempt.ts` 末尾 `BUCKET.delete(row.payload_key)`)。ログイン URL が Mail 側に残り続けることはない
- AIS Mail の同期待ちは **15 秒** (`enqueue.ts:27` の `setTimeout(…, 15000)` で `sending` を返す)。その前に D1 / R2 への書き込みがある

## 4. 設計の要点

1. 送信は `apps/api/src/lib/mail.ts` の `sendMail()` 1 関数に閉じ込める。グローバルの `fetch` を呼び出し時に引く (モジュール読み込み時に `const f = fetch` と捕まえない — テストの mock が効かなくなる)
2. 成功は「HTTP 200/202 かつ `status` が `sent` / `queued` / `sending`」。`queued` / `sending` は「AIS Mail が預かった」なので成功 (再試行は AIS Mail の outbox が最大 6 回行う)。**`failed` は失敗** (二度と送られない)
3. それ以外 (4xx/5xx・不正な応答・ネットワーク失敗・タイムアウト) は `MailSendError` を throw する。atender 側では再試行しない
4. `sendMagicLink` は `MailSendError` を含むすべての例外を捕まえ、`APIError("INTERNAL_SERVER_ERROR", { error: { code: "MAIL_SEND_FAILED", message: <日本語> } })` に詰め替えて投げる。これで API 全体のエラー封筒 `{error:{code,message}}` (`middleware/error.ts` と同じ形) が better-auth の経路でも出て、**配布済みの iOS (build 21〜23) がそのまま日本語メッセージを表示できる** (§6.3)
5. 冪等キーは付けない。ユーザーが「再送」したら別のメール・別のリンクであるべき (better-auth は要求ごとに新しいトークンを作る)
6. タイムアウトは **20 秒** (ブリーフは 15 秒)。理由: AIS Mail 自身が最大 15 秒待ってから 202 を返すので、15 秒で切ると「Mail は預かって後で届くのに atender はエラーを返す」窓がちょうど一番起きやすい所に来る。15 秒 + D1/R2 書き込み + 往復で 20 秒

## 5. 関数シグネチャ

### 5.1 `apps/api/src/lib/mail.ts` (新規)

```ts
import { env } from "../env";

export const AIS_MAIL_SEND_PATH = "/api/v1/send";
export const AIS_MAIL_TIMEOUT_MS = 20_000;

export type MailMessage = {
  to: string;              // 単一アドレス。加工しない (trim も小文字化もしない)
  subject: string;
  text: string;
  html: string;
  idempotencyKey?: string; // 指定時だけ body.idempotency_key に入れる。Magic Link では使わない
};

export type MailSendStatus = "sent" | "queued" | "sending";
export type MailSendResult = { id: string; status: MailSendStatus };

export type SendMailOptions = {
  baseUrl?: string;   // 既定 env.AIS_MAIL_URL
  token?: string;     // 既定 env.AIS_MAIL_TOKEN
  timeoutMs?: number; // 既定 AIS_MAIL_TIMEOUT_MS
};

/** AIS Mail の error.code (例: "unauthorized", "rate_limited") か、atender 側で付ける下の 5 つ */
export type MailSendErrorCode =
  | "http_error"        // 200/202 以外で、body に有効な error.code が無い
  | "invalid_response"  // 200/202 以外の 2xx、または 200/202 で body が契約どおりでない
  | "send_failed"       // 200/202 で status が "failed"
  | "network_error"     // fetch か body の読み込みが timeout 以外の理由で reject
  | "timeout"           // timeoutMs 以内に応答 (body まで) が揃わない
  | (string & {});      // AIS Mail の error.code (/^[a-z][a-z0-9_]{0,63}$/ に合うものだけ採る)

export class MailSendError extends Error {
  readonly name = "MailSendError";
  constructor(
    readonly code: MailSendErrorCode,
    readonly status: number | null, // HTTP status。network_error / timeout は null
  ) {
    super(`AIS Mail send failed: ${code}${status === null ? "" : ` (HTTP ${status})`}`);
  }
}

export async function sendMail(message: MailMessage, options?: SendMailOptions): Promise<MailSendResult>;
```

`sendMail` の処理 (この順):

1. `url = baseUrl から末尾の "/" をすべて除いたもの + "/api/v1/send"` (例: `https://mail.aisaba.net/` → `https://mail.aisaba.net/api/v1/send`)
2. `body = { to, subject, text, html }`、`idempotencyKey !== undefined` のときだけ `idempotency_key` を足す。**`from` / `reply_to` / `cc` / `bcc` / `headers` / `attachments` は入れない**
3. `fetch(url, { method: "POST", headers: { Authorization: \`Bearer ${token}\`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })` — **第 1 引数は文字列、第 2 引数に init** (Request オブジェクトで呼ばない。テストの mock が init を読む)
4. `res.text()` で body を読み、`JSON.parse` を試す (失敗したら「parse できない」扱い)。body の読み込みも同じ signal の内側
5. 判定:
   - `res.status` が 200 または 202 で、parse した値が `{ id: 空でない string, status: "sent"|"queued"|"sending" }` → `{ id, status }` を返す (`duplicate` 等ほかのキーは捨てる)
   - 200/202 で `status === "failed"` → `MailSendError("send_failed", res.status)`
   - 200/202 でそれ以外の形、または 200/202 以外の 2xx → `MailSendError("invalid_response", res.status)`
   - 2xx 以外 → body の `error.code` が `/^[a-z][a-z0-9_]{0,63}$/` に合えばそれを code に、合わなければ `"http_error"`。`MailSendError(code, res.status)`
6. 3〜4 で例外: `error.name` が `"TimeoutError"` または `"AbortError"` → `MailSendError("timeout", null)`、それ以外 → `MailSendError("network_error", null)`

`MailSendError` の message と property に**宛先・件名・本文・トークン・AIS Mail の error.message / details を入れない** (details は `invalid_address` で宛先を含み得る。ログに個人情報とログイン URL を出さないため)。

### 5.2 `apps/api/src/lib/magicLinkMail.ts` (新規)

```ts
export const MAGIC_LINK_SUBJECT = "Atender にログインする";
export function buildMagicLinkMail(url: string): { subject: string; html: string; text: string };
```

`html` と `text` は現行 `src/auth.ts:104-126` のテンプレート文字列を**そのまま移す** (`${url}` の埋め込み 3 箇所 — html の `href` 2 つと表示テキスト 1 つ、text の 1 つ — も、HTML エスケープしない現行のまま)。`subject` は `MAGIC_LINK_SUBJECT`。

### 5.3 `apps/api/src/auth.ts` (変更)

- `import { Resend } from "resend"` と `const resend = new Resend(env.RESEND_API_KEY)` を削除
- `import { APIError } from "better-auth/api"`、`import { sendMail, MailSendError } from "./lib/mail"`、`import { buildMagicLinkMail } from "./lib/magicLinkMail"` を足す
- `magicLink({ expiresIn: 60 * 15, ... })` の `expiresIn` は不変。`sendMagicLink` を次に置換:

```ts
export const MAGIC_LINK_SEND_FAILED_MESSAGE =
  "ログイン用のメールを送れませんでした。しばらくしてからもう一度お試しください。";

sendMagicLink: async ({ email, url }) => {
  const mail = buildMagicLinkMail(url);
  try {
    await sendMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (error) {
    console.error("[mail] magic link send failed", error instanceof MailSendError
      ? { code: error.code, status: error.status }
      : { code: "unexpected", name: error instanceof Error ? error.name : typeof error });
    throw new APIError("INTERNAL_SERVER_ERROR", {
      error: { code: "MAIL_SEND_FAILED", message: MAGIC_LINK_SEND_FAILED_MESSAGE },
    });
  }
},
```

`MAGIC_LINK_SEND_FAILED_MESSAGE` は `auth.ts` から export する (テストが文字列を import して比較できるように)。ログには `email` / `url` / トークンを渡さない。

### 5.4 `apps/api/src/env.ts` (変更)

- `const EnvSchema` を `export const EnvSchema` にする (env の挙動をテストで `safeParse` するため。`env` / `trustedOrigins` の export は不変)
- `RESEND_API_KEY` / `RESEND_FROM` の 2 行を削除し、同じ位置に:

```ts
// AIS Mail のサービストークン。形式は AIS Mail 側の検査 (service-api/token.ts) と同じ。
// 貼り付けの崩れ (引用符・改行の混入) を起動時に落とすために形式まで見る。
AIS_MAIL_TOKEN: z.string().trim().regex(/^aism_svc_[a-z0-9]{10}\.[A-Za-z0-9_-]{43}$/i),
AIS_MAIL_URL: z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().url().default("https://mail.aisaba.net"),
),
```

## 6. 挙動仕様

テストの値は §7.3 の固定値を使う。`TOKEN` = `process.env.AIS_MAIL_TOKEN`、`MAIL_URL` = `process.env.AIS_MAIL_URL`、`SEND_URL` = `` `${MAIL_URL}/api/v1/send` ``。sign-in の要求は `POST /api/auth/sign-in/magic-link`、body `{ email, callbackURL: "https://atender.appily.run/verify" }`、`Content-Type: application/json`。

### 6.1 `sendMail` 単体 (MS)

| # | 条件 | 期待 |
|---|---|---|
| MS1 | 既定の mock (202 `{id:"test-mail-id",status:"sent"}`) で `sendMail({to:"a@example.test",subject:"s",text:"t",html:"<p>h</p>"})` | `{ id: "test-mail-id", status: "sent" }` で resolve。mock の呼び出しは 1 回 |
| MS2 | MS1 の要求 | URL が `SEND_URL` と完全一致。`init.method === "POST"` |
| MS3 | MS1 の要求ヘッダ (`new Headers(init.headers)` で読む) | `Authorization` が `` `Bearer ${TOKEN}` `` と完全一致、`Content-Type` が `application/json` |
| MS4 | MS1 の要求 body (`JSON.parse(init.body)`) | キー集合がちょうど `{to, subject, text, html}`。値は入力と完全一致。`from` / `reply_to` / `idempotency_key` を含まない |
| MS5 | `idempotencyKey: "k-1"` を付けて呼ぶ | body のキー集合が `{to, subject, text, html, idempotency_key}`、`idempotency_key === "k-1"` |
| MS6 | `to: "Mail.User+tag@Example.Test "` (大文字・末尾空白入り) | body.to がその文字列と完全一致 (加工しない) |
| MS7 | options `{ baseUrl: "https://m.example.test/", token: "aism_svc_other00000.<43 文字>" }` | URL が `https://m.example.test/api/v1/send` (二重スラッシュなし)、Authorization が渡した token |
| MS8 | options `{ baseUrl: "https://m.example.test///" }` | URL が `https://m.example.test/api/v1/send` |
| MS9 | mock が 202 `{id:"x",status:"queued"}` | `{ id:"x", status:"queued" }` で resolve |
| MS10 | mock が 202 `{id:"x",status:"sending"}` | `{ id:"x", status:"sending" }` で resolve |
| MS11 | mock が 200 `{id:"x",status:"sent",duplicate:true}` | `{ id:"x", status:"sent" }` で resolve (返り値に `duplicate` キーが無い) |
| MS12 | mock が 202 `{id:"x",status:"failed"}` | `MailSendError` で reject、`code === "send_failed"`、`status === 202` |
| MS13 | mock が 202 で body `not json` / `{}` / `{"id":"","status":"sent"}` / `{"id":"x","status":"done"}` (4 通り) | すべて `code === "invalid_response"`、`status === 202` |
| MS14 | mock が 201 `{id:"x",status:"sent"}` | `code === "invalid_response"`、`status === 201` |
| MS15 | mock が 401 `{error:{code:"unauthorized",message:"…"}}` | `code === "unauthorized"`、`status === 401` |
| MS16 | mock が 403 `{error:{code:"service_disabled"}}` | `code === "service_disabled"`、`status === 403` |
| MS17 | mock が 429 `{error:{code:"rate_limited"}}` + `Retry-After: 30` | `code === "rate_limited"`、`status === 429`。mock の呼び出しは 1 回 (再試行しない) |
| MS18 | mock が 400 `{error:{code:"invalid_address",message:"bad a@example.test",details:{to:["a@example.test"]}}}` | `code === "invalid_address"`、`status === 400`。`error.message` に `a@example.test` を含まない |
| MS19 | mock が 500 で body `oops` (非 JSON) | `code === "http_error"`、`status === 500` |
| MS20 | mock が 502 `{error:{code:"Bad Code!"}}` (正規表現に合わない) | `code === "http_error"`、`status === 502` |
| MS21 | mock が `new TypeError("fetch failed")` で reject | `code === "network_error"`、`status === null` |
| MS22 | options `{ timeoutMs: 50 }`、mock は `init.signal` の abort まで resolve せず、abort されたら `init.signal.reason` で reject する | 2 秒以内に reject、`code === "timeout"`、`status === null` |
| MS23 | MS1 の要求 | `init.signal` が `AbortSignal` のインスタンス |
| MS24 | MS12〜MS22 の reject 値 | `instanceof MailSendError` かつ `instanceof Error`、`name === "MailSendError"`。`message` に `TOKEN`・入力の `to`・`subject`・`html` の文字列を含まない |
| MS25 | options なしで呼ぶ | URL は `MAIL_URL` 始まり、Authorization は `TOKEN` (env の値を既定に使う) |

### 6.2 Magic Link sign-in (ML)

| # | 条件 | 期待 |
|---|---|---|
| ML1 | 既定の mock (202 sent) で `email: "mail@example.test"` | 200、body `{ status: true }`。AIS Mail 宛の呼び出しはちょうど 1 回、URL は `SEND_URL` |
| ML2 | ML1 の要求 | `Authorization` が `` `Bearer ${TOKEN}` ``、`Content-Type` が `application/json` |
| ML3 | ML1 の要求 body | `to === "mail@example.test"`、`subject === "Atender にログインする"`、キー集合がちょうど `{to, subject, text, html}` (`from` / `reply_to` / `idempotency_key` なし) |
| ML4 | `email: "Mixed.Case+tag@Example.Test"` | body.to がその文字列と完全一致 |
| ML5 | ML1 の body.html | `/href="([^"]*\/api\/auth\/magic-link\/verify\?token=[^"]+)"/` に一致する。抜いた URL は `` `${process.env.BETTER_AUTH_URL}/api/auth/magic-link/verify?token=` `` で始まり、`callbackURL=` を含む |
| ML6 | ML1 の body.html / body.text | html は `ログインリンクが届いています`・`15 分`・`ログインする` を含む。text は `"Atender にログインする\n\n下記のリンクを開くとログインできます (有効期限 15 分):\n"` で始まり、ML5 で抜いた URL (`&amp;` を `&` に戻したもの) を含む |
| ML7 | ML5 で抜いた URL を `app.request` で GET (redirect: "manual") | Set-Cookie に `session_token=` を含む (= 今の `signInViaMagicLink` が通る。cookie 名は better-auth の prefix 付きでよい) |
| ML8 | 同じ email で 2 回要求 | AIS Mail 宛の呼び出しが 2 回。2 回の body.html から抜いた `token=` の値が異なる。どちらの body にも `idempotency_key` が無い |
| ML9 | mock が 202 `{id:"x",status:"queued"}` | 200 `{ status: true }` |
| ML10 | mock が 202 `{id:"x",status:"sending"}` | 200 `{ status: true }` |
| ML11 | mock が 401 `{error:{code:"unauthorized"}}` | **500**、Content-Type が `application/json` で始まる、body が `{ error: { code: "MAIL_SEND_FAILED", message: MAGIC_LINK_SEND_FAILED_MESSAGE } }` と深く等しい |
| ML12 | mock が 429 `{error:{code:"rate_limited"}}` + `Retry-After: 30` | ML11 と同じ (status は 429 でなく **500**)。AIS Mail 宛の呼び出しは 1 回 |
| ML13 | mock が 403 / 400 / 500 (JSON) / 502 (非 JSON) | どれも ML11 と同じ |
| ML14 | mock が 202 `{id:"x",status:"failed"}` | ML11 と同じ |
| ML15 | mock が `TypeError` で reject | ML11 と同じ |
| ML16 | ML11 / ML15 の要求中の `console.error` / `console.warn` / `console.log` (vi.spyOn) | どの呼び出しの引数を `JSON.stringify` / `String` しても、入力の email・`TOKEN`・`token=` を含まない。`console.error` の呼び出しのうち 1 つは第 1 引数が `"[mail] magic link send failed"` で、第 2 引数が ML11 なら `{ code: "unauthorized", status: 401 }`、ML15 なら `{ code: "network_error", status: null }` |
| ML17 | ML11 の後 (mock を既定に戻して) 同じ email でもう一度要求 | 200 (失敗が後の要求に残らない) |

### 6.3 クライアントへの見え方 (テストしない。確認用)

- iOS (build 21〜23 配布済み): `AuthStore.startMagicLink` → `decodeHTTPError` が `{error:{code,message}}` を `ErrorResponse` で読み、`userFacingMessage` が message をそのまま出す → **「ログイン用のメールを送れませんでした。しばらくしてからもう一度お試しください。」**。素の 500 (body 空) だと「サーバーエラー (HTTP 500)」になるので、§5.3 の詰め替えが iOS 側の変更なしでこの表示を出す唯一の手段
- Web: `SignIn.tsx` は status を見ず固定文言「メールを送信できませんでした」を出す (不変)

### 6.4 env (EV) — `EnvSchema.safeParse(base)`。`base` = 現行の必須キーを `.env.test` の値で埋め、`AIS_MAIL_TOKEN` に §7.3 の値を入れたオブジェクト (`RESEND_*` は入れない)

| # | 条件 | 期待 |
|---|---|---|
| EV1 | `base` | success。`data.AIS_MAIL_URL === "https://mail.aisaba.net"` |
| EV2 | `base` に `AIS_MAIL_URL: ""` | success、`AIS_MAIL_URL === "https://mail.aisaba.net"` |
| EV3 | `base` に `AIS_MAIL_URL: "https://mail.example.test"` | success、その値 |
| EV4 | `base` に `AIS_MAIL_URL: "not a url"` | failure |
| EV5 | `base` から `AIS_MAIL_TOKEN` を除く / `""` | failure |
| EV6 | `AIS_MAIL_TOKEN` が `"re_xxx"` / `` `"${TOKEN}"` `` (引用符込み) / 後半 42 文字 / 前半 9 文字 | すべて failure |
| EV7 | `AIS_MAIL_TOKEN` が `` ` ${TOKEN}\n` `` | success、`data.AIS_MAIL_TOKEN === TOKEN` (trim される) |
| EV8 | `base` に `RESEND_API_KEY` / `RESEND_FROM` を足す | success、`data` に `RESEND_API_KEY` キーが無い (旧 env が残っていても起動できる = §9 の (c)〜(e) の間の状態) |

### 6.5 撤去 (RM)

| # | 条件 | 期待 |
|---|---|---|
| RM1 | `apps/api/package.json` | `dependencies` / `devDependencies` に `resend` が無い |
| RM2 | `apps/api/src` 配下の全 `.ts` | 文字列 `resend` / `RESEND_` を (大文字小文字を無視して) 含まない |
| RM3 | `apps/api/.env.example` / `apps/api/.env.test` | `RESEND_` を含まない。`AIS_MAIL_TOKEN=` を含む |

### 6.6 プライバシーポリシー (LG、`apps/web/tests/legal/legal-pages.test.ts` で見る)

| # | 条件 | 期待 |
|---|---|---|
| LG1 | `privacy.html` | `Resend` を含まない |
| LG2 | `privacy.html` の「5. 第三者提供と外部サービス」の Cloudflare の `<li>` | `ログイン用メール` と `宛先のメールアドレス` を含む |
| LG3 | 既存 #L4 の必須語リスト | `"Resend"` を `"ログイン用メール（メールアドレスでのログイン）の送信"` に置換し、ほかの語は不変 |
| LG4 | 改定日 | `<time datetime="YYYY-MM-DD">` の改定日が web のデプロイ日 (JST)。2026-10-30 にデプロイするなら現状の値のまま |

## 7. テスト基盤

### 7.1 フレームワークと配置

- Vitest 2 (`apps/api/vitest.config.ts`、`pool: forks` + `singleFork`、setup は `tests/setup.ts`)。`pnpm test` = 既定 + `vitest.secure-cookie.config.ts` (`tests-secure/`、setup は `tests-secure/env.ts` → `tests/setup.ts`)。両方とも §7.2 の mock が効く
- 実行: `cd apps/api ; pnpm exec prisma generate ; rm -rf tests/.tmp ; pnpm exec vitest run` (+ `pnpm exec vitest run --config vitest.secure-cookie.config.ts`)
- Developer が直す既存テスト: `tests/setup.ts` / `tests/helpers/auth.ts` / `tests/helpers/mail.ts` (新規) / `tests/auth.test.ts` #75・#76 / `apps/web/tests/legal/legal-pages.test.ts` #L4 (いずれも §6 の契約に合わせる機械的な移行。新しい観点のテストは書かない)
- Reviewer が書く: `apps/api/tests/ais-mail.review.test.ts` (MS / ML / EV / RM、§6 から独立に) と、LG は `apps/web/tests/legal/legal-pages.test.ts` に足すか `apps/web/tests/legal/ais-mail.review.test.ts` を新設。E2E (chrome-devtools MCP) は使わない (外部送信を本番で確かめるのは §9 の (b)(d))

### 7.2 AIS Mail の fetch mock (`tests/setup.ts`)

`vi.mock("resend")` / `__resendSendMock` を消し、次に置換する:

```ts
import { afterEach, beforeAll, beforeEach, vi, type Mock } from "vitest";
import { aisMailOk } from "./helpers/mail";

declare global {
  // eslint-disable-next-line no-var
  var __aisMailFetchMock: Mock<(url: string, init: RequestInit) => Promise<Response>>;
}

// (既存の .env.test 読み込みと process.env の ??= 群の中で、RESEND_* の 2 行をこの 2 行に置換)
process.env.AIS_MAIL_TOKEN ??= "aism_svc_test000000.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
process.env.AIS_MAIL_URL ??= "https://mail.ais-test.invalid";

const realFetch = globalThis.fetch;
globalThis.__aisMailFetchMock = vi.fn(async () => aisMailOk());
vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(process.env.AIS_MAIL_URL!)) return globalThis.__aisMailFetchMock(url, init ?? {});
  return realFetch(input, init);
});

beforeEach(() => {
  globalThis.__aisMailFetchMock.mockReset();
  globalThis.__aisMailFetchMock.mockImplementation(async () => aisMailOk());
});
```

- **AIS_MAIL_URL で始まる要求だけ**を横取りし、ほかは本物の `fetch` に流す (今の振る舞いを変えない)。`b20-*` の `vi.spyOn(globalThis, "fetch")` はこの stub の上に重なり、`vi.restoreAllMocks()` でこの stub に戻る (`restoreAllMocks` は `stubGlobal` を戻さない)
- `beforeEach` で毎回 `mockReset` + 既定実装を入れ直す (`mockResolvedValueOnce` の残りや、`restoreAllMocks` 後の状態に依存しない)
- 既存の `beforeEach` (DB 作成) はそのまま。上の `beforeEach` は `__resendSendMock.mockClear()` の行を置き換える形で同じ `beforeEach` に入れてよい
- `aisMailOk` は `tests/helpers/mail.ts` に置き、setup はそれを import する (setup から export しない)。`aisMailOk()` は呼ぶたびに新しい `Response` を作る (body は 1 回しか読めない): 202、`{"id":"test-mail-id","status":"sent"}`、`Content-Type: application/json`。`tests/helpers/mail.ts` (新規) の export:

```ts
export type AisMailCall = { url: string; init: RequestInit; headers: Headers; body: Record<string, unknown> };
export function aisMailOk(): Response;
export function aisMailResponse(status: number, body: unknown, headers?: Record<string, string>): Response; // body が string ならそのまま、それ以外は JSON.stringify
export function aisMailCalls(): AisMailCall[];        // __aisMailFetchMock.mock.calls を変換。body は JSON.parse(init.body as string)
export function lastAisMailCall(): AisMailCall | undefined;
```

- `tests/helpers/auth.ts` の `signInViaMagicLink`: `globalThis.__resendSendMock.mock.calls` の 2 行を `const html = lastAisMailCall()?.body.html as string | undefined;` に置換。以降 (href の抽出・`&amp;` の復元・verify) は不変
- `tests/auth.test.ts`:
  - #75 → `"[§8 #75] sendMagicLink sends one AIS Mail request with the better-auth url as-is and no from field"`: ML1・ML3・ML5 の assert (呼び出し 1 回、`SEND_URL`、`to`、`from` 無し、html に `href=` と `token`)
  - #76 → `"[§8 #76] AIS Mail failure makes Magic Link request return 500 MAIL_SEND_FAILED"`: `__aisMailFetchMock.mockResolvedValueOnce(aisMailResponse(500, { error: { code: "internal", message: "x" } }))` → 500、`expectError(body, "MAIL_SEND_FAILED")`
  - `RESEND_FROM` を参照する行は残さない

### 7.3 固定値 (`.env.test` と `tests/setup.ts` の両方に同じ値)

| キー | 値 |
|---|---|
| `AIS_MAIL_TOKEN` | `aism_svc_test000000.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ` (後半 43 文字、`token.ts` の正規表現に合う。実走確認済み) |
| `AIS_MAIL_URL` | `https://mail.ais-test.invalid` (`.invalid` は DNS で解決されない予約 TLD。mock を外しても外へ出ない) |

- `.env.test` の `RESEND_API_KEY` / `RESEND_FROM` の 2 行を上の 2 行に置換。`tests/setup.ts` の `RESEND_*` の `??=` 2 行も置換
- テストの assert は値を直書きせず `process.env.AIS_MAIL_URL` / `process.env.AIS_MAIL_TOKEN` から組む (台帳の「dev `.env` が Vitest に漏れる」環境依存があるため。漏れても mock は同じ `process.env` で横取りするので外へは出ない)

### 7.4 ベースライン台帳の期待値

- 今: API 14 failed (うち Magic Link 4 = `[§8 #2]` `#3` `#4` `#76`)。変更後の期待: **13 failed**、失敗名の集合 = 今の 14 から `[§8 #76] Resend failure…` を除いたもの。`#2` `#3` `#4` は better-auth の挙動変化によるテスト陳腐化で本件と無関係なので触らない
- 新規の失敗が出たら未分類として扱い、マージしない
- Web: 既知 26 failed は不変 (#L4 は今も緑、移行後も緑)
- `.knowledge/known-failures.md` の「テスト陳腐化 (better-auth 1.6.11…)」節の `[§8 #76]` の項を「2026-10-30 `feature/ais-mail` で解消 (送信失敗を `MAIL_SEND_FAILED` 500 で返す契約に変更)」に置換し、末尾の A2 節の次に「AIS Mail 移行の実測 (日付・commit・failed/passed/skipped)」を足す — Reviewer の GREEN 後に Leader か Developer が行う

## 8. 変更・新規ファイル (全列挙)

### 8.1 atender リポジトリ (`feature/ais-mail`)

| ファイル | 種別 | 内容 |
|---|---|---|
| `apps/api/src/lib/mail.ts` | 新規 | §5.1 |
| `apps/api/src/lib/magicLinkMail.ts` | 新規 | §5.2 (テンプレートは `auth.ts` から移動) |
| `apps/api/src/auth.ts` | 変更 | §5.3 |
| `apps/api/src/env.ts` | 変更 | §5.4 |
| `apps/api/package.json` | 変更 | `resend` を削除 (`pnpm --filter @atender/api remove resend`) |
| `pnpm-lock.yaml` | 変更 | 上のコマンドの結果。`resend` / `svix` / `postal-mime` / `standardwebhooks` が消える以外に差分が無いこと、`@rollup/rollup-linux-x64-musl` が残っていること (今 3 行) を `git diff pnpm-lock.yaml` と `grep -c` で確かめる (`Muraki/knowledge/gotcha/pnpm-lockfile-lost-platform-optional-deps.md`。A2 で web の Docker build が落ちた実績) |
| `apps/api/.env.example` | 変更 | `RESEND_*` 2 行 → `AIS_MAIL_TOKEN=aism_svc_xxxxxxxxxx.<43 文字> # AIS Mail service token (Mail 画面 → 設定 → サービス送信で発行)` と `AIS_MAIL_URL= # Optional. Default https://mail.aisaba.net` |
| `apps/api/.env.test` | 変更 | §7.3 |
| `apps/api/tests/setup.ts` | 変更 | §7.2 |
| `apps/api/tests/helpers/mail.ts` | 新規 | §7.2 |
| `apps/api/tests/helpers/auth.ts` | 変更 | §7.2 (2 行) |
| `apps/api/tests/auth.test.ts` | 変更 | #75 / #76 (§7.2) |
| `apps/api/tests/ais-mail.review.test.ts` | 新規 (Reviewer) | §6.1・6.2・6.4・6.5 |
| `apps/web/public/privacy.html` | 変更 | §8.3 |
| `apps/web/tests/legal/legal-pages.test.ts` | 変更 | #L4 (§6.6 LG3) |
| `apps/web/tests/legal/ais-mail.review.test.ts` | 新規 (Reviewer、任意) | LG1・LG2 |
| `.knowledge/known-failures.md` | 変更 | §7.4 (GREEN 後) |
| `CLAUDE.md` / `README.md` | 変更 | §10 |

触らない: `apps/api/Dockerfile` (env は Coolify から注入、ARG 宣言なし)、`apps/ios`、`apps/web/src`、Prisma、`.designs/` の過去 doc (当時の記録として残す)。

ローカル開発の注意 (コミットしない): Touri の `apps/api/.env` は `RESEND_*` を持ち `AIS_MAIL_TOKEN` を持たないので、マージ後は起動時に zod で落ちる。`AIS_MAIL_TOKEN=aism_svc_devdummy00.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ` を足す (ダミーなので dev の Magic Link 送信は 401 → 500 になる。dev は CLAUDE.md の seed + bearer 注入で入る)。`RESEND_*` 行は消してよい。

### 8.2 Muraki 側 (Leader が行う。atender の PR には入らない)

| ファイル | 内容 | 時期 |
|---|---|---|
| `Muraki/knowledge/library/signin-button-branding-google-apple-2026.md:106` | 「atender は `resend.emails.send` が…」→「atender は AIS Mail の `sendMail` が `magicLink.sendMagicLink` 内の 1 箇所のみ (2026-10-30 移行)。envelope sender は `bounces@cf-bounce.aisaba.net` なので、登録するなら完全一致で `cf-bounce.aisaba.net`」に置換 | マージ時 |
| `Muraki/knowledge/library/ais-mail-service-send-api.md` | `status` に `failed` があることは本 doc 執筆時に置換済み。「`/api/v1/send` の本番利用者はまだ無い」系の記述があれば「atender が最初の利用者 (2026-10-30〜、サービス名 `atender`)」に置換 | (d) の後 |

### 8.3 プライバシーポリシーの文案 (`apps/web/public/privacy.html` §5)

ブリーフに無いが入れる理由: 今のページは「Resend：…宛先のメールアドレスを送信します」と書いており、移行後は Resend に宛先が渡らない一方、Cloudflare (AIS Mail と Email Sending) には宛先とメール本文が渡る。外部提供先の記載が実態とずれるので、送信先を切り替える同じ変更で直す。

- 削除: `<li><strong>Resend：</strong>ログイン用メール（メールアドレスでのログイン）の送信に利用し、宛先のメールアドレスを送信します。</li>`
- Cloudflare の行を置換:
  `<li><strong>Cloudflare：</strong>本サービスへの通信の中継と、ログイン用メール（メールアドレスでのログイン）の送信に利用します。接続元のIPアドレスなど通信に関する情報と、ログイン用メールの宛先のメールアドレスを取り扱います。</li>`
- 直後の「これらの外部サービスは、米国その他の日本国外の設備で情報を処理する場合があります。」は不変
- 改定日: §6.6 LG4

## 9. デプロイ順序 (Coolify への書き込みは Leader)

前提: Reviewer GREEN・台帳照合済み (未分類 0)・リリース前ゲート (Codex 2LLM 突合 + 負のコントロール。例: `sendMail` の `status === "failed"` 判定を消すと MS12 / ML14 が赤、`APIError` の詰め替えを素の `throw error` に戻すと ML11 が赤) を通過していること。

**(a) Touri: AIS Mail にサービスを登録**
1. `https://mail.aisaba.net` → 設定 → サービス送信 → サービスを追加
2. name `atender` / fromLocal `no-reply` / 差出人ドメイン `aisaba.net` (選ぶ欄がある場合) / fromName `Atender`
3. レート: **1 分 60 通 / 1 日 500 通** に変更 (既定 30 / 500)。理由: 授業開始時に 1 クラス (〜40 人) が同時にログインする場面で 30/分を超えると、一部の学生が 500 になる。拒否された要求も枠を消費する。1 日 500 は既定のまま (Cloudflare の月 3,000 通込みの範囲)
4. 表示されたトークン (1 回だけ) をチャットに貼らず、エディタで `Muraki/.tmp/atender/secrets.env` の末尾に `AIS_MAIL_TOKEN=aism_svc_…` の 1 行として追記して保存 (このファイルは gitignore 済み。既存の `RESEND_API_KEY` 行はまだ消さない — ロールバック用)
5. Leader に「追記した」とだけ伝える。Leader は値を表示せずに確かめる: `grep -c '^AIS_MAIL_TOKEN=aism_svc_[a-z0-9]\{10\}\.[A-Za-z0-9_-]\{43\}$' Muraki/.tmp/atender/secrets.env` が `1`

**(b) Leader: 本番 AIS Mail に smoke 1 通 (自分宛)**

```sh
( set -a ; . Muraki/.tmp/atender/secrets.env ; set +a ; curl -sS -o Muraki/.tmp/atender/ais-mail-smoke.json -w '%{http_code}\n' -X POST https://mail.aisaba.net/api/v1/send -H "Authorization: Bearer $AIS_MAIL_TOKEN" -H 'Content-Type: application/json' --data '{"to":"<Touri の Gmail アドレス>","subject":"Atender AIS Mail smoke","text":"smoke from atender service token"}' )
```

- 期待: `202`、`ais-mail-smoke.json` が `{"id":"…","status":"sent"}` (`queued` / `sending` なら 1〜5 分待って受信を見る)
- Gmail で受信を確認: From が `Atender <no-reply@aisaba.net>`、「メッセージのソースを表示」で SPF / DKIM / DMARC が `PASS`
- 401 → トークンの写し間違い (a) に戻る。403 → サービスが無効。400 `from_not_allowed` → (a) の fromLocal / ドメイン
- 終わったら `ais-mail-smoke.json` を消す

**(c) Leader: env 追加 → マージ → デプロイ**
1. Coolify atender-api (`vrdxzvmakcxieyhfhayz5r8r`) の env に `AIS_MAIL_TOKEN` を追加 (値は secrets.env から)。`AIS_MAIL_URL` は入れない (既定を使う)。`RESEND_*` はこの時点では残す (新コードは無視する = EV8)
2. `feature/ais-mail` を main にマージ
3. atender-api をデプロイ (`POST $COOLIFY_API_BASE/deploy?uuid=vrdxzvmakcxieyhfhayz5r8r`)。`status` が `finished` で、`GET https://atender-api.appily.run/healthz` が 200 (env の形式誤りなら起動で落ちて healthz が返らない → (a)4 の値を見直す)
4. atender-web (`xxg31wshj6rhjmnffju1bg5r`) をデプロイ (privacy の更新)。`https://atender.appily.run/privacy` に `Resend` が無いことを確認

**(d) 本番で Magic Link を 1 回 (Touri か Leader)**
1. `https://atender.appily.run` のログインで自分の Gmail を入れて送る → 1〜2 分以内に `Atender <no-reply@aisaba.net>` から「Atender にログインする」が届く → ボタンでログインできる
2. Outlook / Microsoft 365 のアドレス (学校のメールを含む) を持っていれば同じことをして、迷惑メールフォルダに入るかを見る (AIS Mail は Outlook 初回 SCL 5 の実績あり。入っても失敗ではなく「後続」の観察項目)
3. AIS Mail の管理画面でサービス `atender` の最終利用時刻が更新され、failed24h が 0
4. 届かない / ログインできない → 下の「ロールバック」

**(e) Leader: Resend の env を消す**
- (d) の成功後、Coolify atender-api の env から `RESEND_API_KEY` と `RESEND_FROM` を削除する (env ごとの DELETE)。**再デプロイは不要** (動いているコンテナは使っていない。次のビルドから注入されなくなる)
- `Muraki/.tmp/atender/secrets.env` の `RESEND_API_KEY` 行は (f)1 のキー失効まで残す

**(f) 後続**
1. Touri: (d) から 7 日間、ログインメールの不達報告と AIS Mail の failed が無ければ、Resend ダッシュボードで **atender 用の API キーだけ**を失効 (meishilink の Supabase SMTP 用キーとドメイン `appily.run` は残す)。失効したら Leader が secrets.env の `RESEND_API_KEY` 行を消す
2. Apple Private Relay: 現状 atender から relay 宛に送る経路は実質無い (SIWA ユーザーは relay アドレスを知らずメール欄に打てない — `signin-button-branding-google-apple-2026.md` の判断)。Leader は AIS Mail の events に `@privaterelay.appleid.com` 宛の `send.failed` が出ていないかを (f)1 の 7 日の間に 1 回見る。出ていたら Apple Developer → Sign in with Apple for Email Communication に `cf-bounce.aisaba.net` (envelope sender のドメインと完全一致) を登録する
3. Outlook で迷惑メール行きが続くなら、ログイン画面の送信後の文言に「迷惑メールフォルダも確認してください」を足すかを別 doc で検討 (本件では UI を変えない)

### ロールバック

- **(e) より前**: main で `git revert -m 1 <マージ commit>` → push → atender-api と atender-web をデプロイ。Coolify に `RESEND_*` が残っているので、そのまま Resend 送信に戻る。`AIS_MAIL_TOKEN` env は残してよい (旧コードは無視する)
- **(e) より後、(f)1 より前**: Coolify atender-api の env に `RESEND_API_KEY` (secrets.env の値) と `RESEND_FROM=Atender <no-reply@appily.run>` を足し直してから、上と同じ revert → デプロイ。env を足す前にデプロイすると旧コードが zod で起動に失敗する
- **(f)1 より後**: Resend に新しいキーを発行しないと戻れない。この時点のロールバックは「AIS Mail 側を直す」前進修正を基本にする
- いずれもデータの巻き戻しは無い (DB 変更なし。Magic Link の未使用トークンは切替をまたいで有効なまま)

## 10. 正典の置換 (atender `CLAUDE.md` / `README.md`、マージ前に同じブランチで)

| 場所 | 旧 | 新 |
|---|---|---|
| `CLAUDE.md:24` 技術スタック | `… + better-sqlite3 + Resend 4.12.x + Zod 3.23.x + dayjs` | `… + better-sqlite3 + Zod 3.23.x + dayjs。メール送信は AIS Mail (`https://mail.aisaba.net/api/v1/send`、`src/lib/mail.ts` の fetch。SDK なし)` |
| `CLAUDE.md:28` 認証 | `(better-auth + Resend 送信、…` | `(better-auth + AIS Mail 送信 (`Atender <no-reply@aisaba.net>`、送信失敗は 500 `MAIL_SEND_FAILED`)、…` |
| `CLAUDE.md:163` デプロイ / 外部リソース | `- Resend: API key は `.tmp/atender/secrets.env` (gitignore 済) 参照` | `- AIS Mail: サービス `atender` (from `Atender <no-reply@aisaba.net>`、1 分 60 / 1 日 500)。トークンは `.tmp/atender/secrets.env` の `AIS_MAIL_TOKEN` (Coolify atender-api env と同値)。再発行は Mail 画面 → 設定 → サービス送信 (再発行で旧トークンは即無効 → Coolify env 更新 + 再デプロイ)。設計 = `.designs/20261030-magic-link-mail-via-ais-mail.md`` |
| `README.md:11` | `… + SQLite + Resend` | `… + SQLite + AIS Mail (メール送信)` |

置換後に `grep -n -i "resend" CLAUDE.md README.md` が 0 件であること (CLAUDE.md は (f)1 の後に Resend のキー失効済みの事実を書く必要はない)。

## 11. 不採用案

| 案 | 却下理由 |
|---|---|
| 併存フラグ (`MAIL_PROVIDER=resend|ais`) で切替 | 切替は git revert + env で戻せ (§9)、フラグは両経路のテストと env の組み合わせを恒久的に増やす。Leader 裁定どおり完全撤去 |
| Resend を AIS Mail 失敗時のフォールバックに残す | 202 `queued` で Mail が後から送ると二重送信になる。失敗の種類 (送ったか不明) を atender 側で判定できない。Resend 依存も残る |
| 冪等キーを付ける (例: Verification の id) | better-auth は要求ごとに新トークンを作るので、再送で同じキーにする理由が無い。キーを固定すると本文違いで 409 になるだけ |
| `from` を `atender@aisaba.net` / `atender.aisaba.net` (サブドメイン) / `appily.run` にする | AIS Mail が受けない (`from_local` は noreply / no-reply / notify / svc-* のみ、`MAIL_DOMAINS` にサブドメインと appily.run が無い)。`svc-atender@aisaba.net` は可能だが、現行 `no-reply@` と同形の方がユーザーに違和感が無い |
| `reply_to` を付ける | 返信先の受け口を用意していない (Leader 裁定)。問い合わせ先は privacy / support ページの mailto |
| タイムアウト 15 秒 (ブリーフ) | AIS Mail 自身が 15 秒待ってから `sending` を返すので、15 秒で切ると「後で届くのにエラー表示」が最も起きやすい点に当たる。20 秒にした (§4-6) |
| 素の `Error` を投げて better-auth に 500 を出させる | 実測で body が空。配布済み iOS が「サーバーエラー (HTTP 500)」しか出せない。`APIError` に `{error:{code,message}}` を詰めると iOS 無改修で日本語が出る |
| better-auth の `onAPIError: { throw: true }` で Hono の `onError` に流す | 全 auth エンドポイントの 4xx (APIError) まで throw され、Hono 側で 500 INTERNAL に化ける。影響が Magic Link の外に広がる |
| 429 を 429 / 503 でクライアントに返す | AIS Mail の枠は atender 全体で共有で、ユーザー個人の要求過多ではない。iOS は status で分岐しておらず、文言は同じ「しばらくしてから」で足りる。Leader 裁定の 500 に揃えた |
| atender 側で再試行する | 再試行は AIS Mail の outbox が行う。atender で重ねると 202 の後の二重送信や、429 の枠をさらに食う |
| 202 `failed` を成功扱いにする | そのメールは二度と送られない (恒久エラー)。成功を返すとユーザーは届かないメールを待ち続ける = 今の握りつぶしと同じ |
| テストで `vi.mock("../src/lib/mail")` (モジュール mock) にする | HTTP 契約 (URL・ヘッダ・body のキー・status の解釈) が一切テストされず、Reviewer の MS 系が書けない |
| `fetch` を全部 mock する (URL で振り分けない) | 他の `fetch` 利用 (Apple / Google の token 失効) のテストの前提を変え、`b20-*` の spy と衝突する。AIS_MAIL_URL 宛だけを横取りすれば既存の振る舞いは不変 |
| `sendMail` に `fetchImpl` 引数で依存注入する | 呼び出し側 (`auth.ts`) は常に既定を使い、注入は テスト専用の口になる。ブリーフの `globalThis.fetch` mock で足り、b20 の既存作法とも揃う |
| メール文面を刷新する (送信元が変わる機会に) | 本件は経路の移行。文面を同時に変えると不達時の切り分けが難しくなる。変えるなら別 doc |
| `AIS_MAIL_TOKEN` の形式を検査しない (`min(1)` だけ) | Coolify の env 貼り付けは崩れる実績がある (Apple 鍵の base64 化の経緯)。形式違いはデプロイ時の起動失敗で止まる方が、本番で全ログインが 500 になるより早く気付ける |
