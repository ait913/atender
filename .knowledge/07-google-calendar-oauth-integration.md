---
title: Atender — Google Calendar OAuth 連携 (better-auth incremental scope + Calendar v3 sync) BP
category: pattern
project: atender
tags: [google-calendar, oauth, better-auth, incremental-authorization, sync-token, calendar-api-v3, refresh-token, scope, privacy, prisma, sqlite]
created: 2026-05-28
sources:
  - https://www.better-auth.com/docs/authentication/social-providers
  - https://www.better-auth.com/docs/concepts/oauth
  - https://developers.google.com/identity/protocols/oauth2/web-server
  - https://developers.google.com/identity/protocols/oauth2/web-server#incremental-auth
  - https://developers.google.com/identity/protocols/oauth2/web-server#offline
  - https://developers.google.com/calendar/api/v3/reference/events/list
  - https://developers.google.com/calendar/api/v3/reference/events#resource
  - https://developers.google.com/calendar/api/v3/reference/calendarList/list
  - https://developers.google.com/calendar/api/guides/sync
  - https://developers.google.com/calendar/api/v3/push
  - https://developers.google.com/calendar/api/guides/auth
  - https://support.google.com/cloud/answer/10311615
  - Calendly Security https://calendly.com/security
  - Reclaim.ai Security https://reclaim.ai/security
related_knowledge:
  - projects/atender/.knowledge/06-calendar-rrule-ics-import.md
  - knowledge/library/better-auth-2026.md
  - knowledge/pattern/rrule-string-onfly-expand-with-overrides.md
  - knowledge/pattern/ics-import-hash-dedup-preview-commit.md
---

## Context

Atender は better-auth 1.6.11 で Google Sign-In を既に持つ (apps/api/src/auth.ts の socialProviders.google)。現状の scope は openid email profile のみで、Account.accessToken / refreshToken / scope は better-auth が自動で保存している。

Touri の要望は「ユーザーが自分の Google Calendar をルームに連携して、予定をルームメンバーに見せる (タイトル匿名化付き)」。既存 06 ナレッジで .ics import と RRULE は確立済。本ドキュメントは生きた OAuth 連携で継続的に sync する設計に絞る。

MVP 範囲:
- 1 ユーザー × 1 Google アカウント × N カレンダー
- ルーム単位ではなくユーザー単位の連携
- 同期は polling (Watch API webhook は Phase 2)
- 取り込み方向は read-only

---

## Part A. better-auth 1.6.x で Google scope を追加する正しい方法

### A-1. 初期設定での scope 追加

socialProviders.google.scope は string[] で渡す。better-auth がプロバイダ呼び出し時に space-join する。
出典: https://www.better-auth.com/docs/authentication/social-providers

```ts
socialProviders: {
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    scope: [
      "openid", "email", "profile",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
    accessType: "offline",
    prompt: "consent",
  },
},
```

重要な仕様 (出典: https://developers.google.com/identity/protocols/oauth2/web-server#offline):

- access_type=offline を付けないと refresh_token が返らない
- 一度 refresh_token を取得済の同一ユーザーが再認可しても、prompt=consent がないと refresh_token は再発行されない (access_token のみ更新)
- 連携解除から再連携時に refresh_token が無く困るケースあり。初期化時は prompt: consent 推奨

### A-2. 既存ユーザーへの追加 scope 要求 (linkSocial)

Atender の現状は scope なしで sign-in 済 -> calendar scope を後から要求する必要あり:

```ts
import { authClient } from "@/lib/auth-client";

await authClient.linkSocial({
  provider: "google",
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  callbackURL: "/settings/integrations?google_linked=1",
});
```

仕様 (出典: https://www.better-auth.com/docs/concepts/oauth):

- scopes: string[] — 追加 scope のみ列挙
- v1.2.7+ では既存連携済プロバイダに対しても linkSocial 可
- better-auth は内部で Google の include_granted_scopes=true をデフォルト ON
- 認可完了後、/api/auth/callback/google を経由して callbackURL にリダイレクト
- Account.scope カラムは最新のトークンに紐づく scope で上書きされる (space-separated string)

★ Gemini は PR #9326 を示唆したが直接 URL なし。実装前に npm view better-auth の docs と source を 1 回確認すべき。

### A-3. include_granted_scopes の詳細 (Google 側の仕様)

出典: https://developers.google.com/identity/protocols/oauth2/web-server#incremental-auth

- include_granted_scopes=true を付けて authorization URL を生成すると、過去にユーザーがそのプロジェクトに付与した scope を全部引き継いだ access_token が発行される
- consent screen には新規 scope のみ表示される (UX 良い)
- これにより「sign-in 時は最小 scope」「Calendar 連携時に追加 scope」という段階的 UX が成立

### A-4. Account テーブルのスキーマ確認

better-auth Prisma adapter の Account モデル:

```prisma
model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime
  updatedAt             DateTime
  user                  User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([providerId, accountId])
}
```

- scope の format は space-separated string (例: openid email https://www.googleapis.com/auth/calendar.readonly)
- accessTokenExpiresAt は DateTime? (TS では Date | null)
- 連携解除は Account row を削除する

---

## Part B. Access Token の自動 refresh (auth.api.getAccessToken)

### B-1. server side シグネチャ

出典: https://www.better-auth.com/docs/authentication/social-providers

```ts
const { accessToken } = await auth.api.getAccessToken({
  body: {
    providerId: "google",
    userId: "...",      // optional: headers で session 取れていれば不要
    accountId: "...",   // optional: 同一 provider に複数アカウントある場合のみ
  },
  headers: c.req.raw.headers,
});
```

戻り値: { accessToken: string } (accessTokenExpiresAt は公開戻り値に含まれない。必要なら別途 Account row を読む)

### B-2. 自動 refresh の挙動

- accessTokenExpiresAt が現在時刻より過去 (or 数十秒以内) なら、自動で refresh_token を使って Google token endpoint を叩く
- 成功時: DB の accessToken / accessTokenExpiresAt / scope を更新して新 accessToken を返す
- 失敗時 (refresh_token revoked / expired): APIError { code: FAILED_TO_GET_ACCESS_TOKEN, status: 400 } を throw

### B-3. refresh 失敗時の catch pattern

出典: https://developers.google.com/identity/protocols/oauth2/web-server#handling-errors

```ts
try {
  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: "google" },
    headers: c.req.raw.headers,
  });
  // use accessToken
} catch (e) {
  if (e instanceof APIError) {
    if (e.body?.code === "FAILED_TO_GET_ACCESS_TOKEN") {
      // ユーザーが myaccount.google.com/permissions で連携解除した可能性が高い
      await prisma.googleCalendarConnection.updateMany({
        where: { userId },
        data: { status: "REVOKED", lastError: "invalid_grant" },
      });
      return c.json({ code: "GOOGLE_REVOKED", needsRelink: true }, 401);
    }
  }
  throw e;
}
```

Atender 実装では FAILED_TO_GET_ACCESS_TOKEN を見るだけで「再認可必要」とみなすのが堅実。

---

## Part C. Google Calendar API v3 — 取り込みに必要な仕様

### C-1. scope 選択 — calendar.readonly が MVP 妥当

出典: https://developers.google.com/calendar/api/guides/auth

| Scope | 範囲 |
|---|---|
| auth/calendar.readonly | 全カレンダー (settings + events) read-only |
| auth/calendar.events.readonly | events のみ |
| auth/calendar.calendarlist.readonly | カレンダー一覧のみ |

理由: Atender は (1) calendarList.list で選ばせる (2) 選択 cal の events.list を取得 の両方が必要。calendar.readonly 1 つで完結。

### C-2. calendarList.list の主要フィールド

出典: https://developers.google.com/calendar/api/v3/reference/calendarList/list

```json
{
  "items": [
    {
      "id": "primary",
      "summary": "Touri Aida",
      "timeZone": "Asia/Tokyo",
      "accessRole": "owner",
      "primary": true,
      "selected": true,
      "backgroundColor": "#9fe1e7"
    }
  ],
  "nextPageToken": null
}
```

Atender 実装方針:
- primary cal と accessRole=owner のカレンダーをデフォルト候補に
- 祝日 cal は除外推奨
- ユーザーに multi-select させ、ID を GoogleCalendarSync 行として保存

### C-3. events.list — 取り込みコア

出典: https://developers.google.com/calendar/api/v3/reference/events/list

```
GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
  ?timeMin=2026-05-28T00:00:00Z
  ?timeMax=2027-05-28T00:00:00Z
  ?singleEvents=true
  ?orderBy=startTime
  ?maxResults=2500
  ?pageToken=<next>
```

(実 URL では各パラメータ間は ampersand 1 個で連結する。markdown 表記ではエスケープのため ? を並べた)

重要な仕様:
- singleEvents=true で RRULE 展開済の instance だけ返る -> Atender は親イベント展開を自前で持たなくて良い
- orderBy=startTime は singleEvents=true 必須
- maxResults default 250、最大 2500
- pageToken でページング、最終ページに nextSyncToken が含まれる (保存する)

### C-4. event resource — dedup と timezone の罠

出典: https://developers.google.com/calendar/api/v3/reference/events#resource

```json
{
  "id": "abc123_20260601T010000Z",
  "iCalUID": "abc123@google.com",
  "summary": "デート",
  "start": { "dateTime": "2026-06-01T10:00:00+09:00", "timeZone": "Asia/Tokyo" },
  "end":   { "dateTime": "2026-06-01T12:00:00+09:00", "timeZone": "Asia/Tokyo" },
  "recurringEventId": "abc123",
  "status": "confirmed",
  "visibility": "default",
  "updated": "2026-05-28T01:23:45.000Z"
}
```

★ dedup には iCalUID ではなく (googleSyncId, googleEventId) を使う (06 ナレッジと方針修正):

- iCalUID は親イベント単位で 1 つ。singleEvents=true で展開された instance は同じ iCalUID を共有する
- id は instance ごとにユニーク
- exception (個別編集された instance) は recurringEventId を持ちつつ id が独立する

all-day vs timed:
- start.date (YYYY-MM-DD) があれば all-day
- start.dateTime (ISO 8601 + offset) + start.timeZone (IANA tz) があれば timed
- 保存時は startUtc: Date, endUtc: Date, timeZone: string, allDay: boolean の 4 カラムが安全

cancelled instance:
- status: cancelled の instance が syncToken 経由で返ってくる場合あり (繰り返しの 1 個だけ削除)
- -> Atender 側で対応行を soft-delete or hard-delete

### C-5. Incremental Sync (syncToken)

出典: https://developers.google.com/calendar/api/guides/sync

flow:
1. 初回: events.list?timeMin=<now>?timeMax=<now+1y>?singleEvents=true?maxResults=2500 で full fetch、ページング完了時に nextSyncToken を取得
2. 保存: GoogleCalendarSync.syncToken に保存 (cal ごとに別)
3. 次回: events.list?syncToken=<saved> (timeMin/timeMax 等は付けられない、付けると 400)
4. 410 GONE: syncToken 失効 (約 1 週間以上未使用で expire) -> ローカルの該当 cal events を全削除して full re-sync
5. cancelled events も差分に含まれる

★ Quota は Cloud Console で実測確認が確実 (Gemini 調査の「1 unit/list, 10 QPS/user」は公式数字未確認)。

### C-6. Rate limit

出典: Cloud Console Quotas (Calendar API)

- Project: 1,000,000 queries/day (デフォルト)
- Per-user: 10 QPS/user 程度を超えると 403 userRateLimitExceeded
- polling 間隔は user x cal 数で乗算されることに注意

### C-7. Push notifications (Watch API) — MVP 不採用

出典: https://developers.google.com/calendar/api/v3/push

- events.watch で HTTPS endpoint を登録、変更時に Google から POST が来る
- Channel expiration 最長 1 ヶ月 (events) -> 期限切れ前に再購読が必要
- ★ MVP では採用しない。polling で十分。Phase 2 で検討

---

## Part D. 同期戦略 — Polling 設計

### D-1. polling 間隔と trigger

| Trigger | 間隔 | 用途 |
|---|---|---|
| ユーザー操作 (今すぐ同期ボタン) | on-demand | UX 最優先 |
| アプリ起動 / ルーム画面表示 | last sync > 10 分 なら自動 | キャッシュフレッシュ |
| バックグラウンド cron | 1 時間 に 1 回 | デフォルト |
| 深夜 batch | 1 日 1 回 (全 user) | safety net |

学生用途では 1 時間 cron で十分。15 分は過剰。

### D-2. job runner 選択

- MVP: node-cron (or setInterval) でシングルプロセス内 cron
- 拡張時: BullMQ + Redis (ユーザー数 1000 超 / リトライ多発時)
- Atender Coolify 1 container 構成では node-cron で素直に行く

### D-3. 同期 1 回の擬似コード

```ts
async function syncOneCalendar(userId, calendarId, syncRowId) {
  const sync = await prisma.googleCalendarSync.findUniqueOrThrow({
    where: { id: syncRowId },
  });

  const accessToken = await getGoogleAccessTokenForUser(userId);

  let pageToken;
  let nextSyncToken;
  const events = [];

  do {
    const url = new URL(
      "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(calendarId) + "/events"
    );
    if (sync.syncToken) {
      url.searchParams.set("syncToken", sync.syncToken);
    } else {
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("timeMin", new Date().toISOString());
      url.searchParams.set("timeMax", oneYearFromNow().toISOString());
      url.searchParams.set("maxResults", "2500");
    }
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + accessToken },
    });

    if (res.status === 410) {
      await prisma.googleCalendarSync.update({
        where: { id: sync.id },
        data: { syncToken: null },
      });
      await prisma.roomEvent.deleteMany({
        where: { source: "GOOGLE", googleSyncId: sync.id },
      });
      return syncOneCalendar(userId, calendarId, syncRowId);
    }
    if (res.status === 401) throw new GoogleAuthError("token_invalid_after_refresh");
    if (res.ok === false) throw new GoogleApiError(res.status, await res.text());

    const data = await res.json();
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken;
  } while (pageToken);

  await applyGoogleEvents(userId, sync.id, events, sync.visibility);

  await prisma.googleCalendarSync.update({
    where: { id: sync.id },
    data: { syncToken: nextSyncToken, lastSyncedAt: new Date(), status: "OK" },
  });
}
```

---

## Part E. Privacy — タイトルマッピング適用

Atender 06 ナレッジで確立済の 3 段階 visibility をそのまま転用:

| Visibility | 動作 |
|---|---|
| NORMAL | 生タイトルそのまま保存・他人に表示 |
| TITLE_MAPPED | デフォルト推奨 — マッピングルール (デート -> 予定, 就活 -> 用事) 通過 |
| BUSY_ONLY | タイトル捨てて 予定あり 固定 (Calendly default 相当) |

### E-1. SaaS 動向

出典: Calendly Security, Reclaim Security

| SaaS | タイトル扱い |
|---|---|
| Calendly | デフォルト Busy のみ |
| Reclaim.ai | 自分用は raw、共有時は Personal Event 置換 |
| Motion | 似た方針 |
| Notion Calendar | フル同期 (全許可) |

Atender はプライバシー懸念が UI 動機の中心なので TITLE_MAPPED をデフォにする。

### E-2. DB 保存方針

生タイトルは保存しない (Touri 方針):
- import 時点でマッピングルール適用 -> 加工済タイトルだけ RoomEvent.title に
- 元タイトルは log にも出さない
- Phase 2 でユーザー自身用に titleForOwner を別カラム検討

### E-3. 連携解除時のデータ削除

| Option | 説明 |
|---|---|
| A. 全削除 | RoomEvent where source=GOOGLE を全削除 |
| B. 残す | history として保持 |
| C. ユーザー選択 | 解除モーダルで radio 選択 (推奨) |

Atender はプライバシー優先なので C を出して default = A が誠実。

---

## Part F. OAuth verification (Google 審査)

出典: https://support.google.com/cloud/answer/10311615

- calendar.readonly は sensitive scope 区分
- Testing ステータスのままなら 100 ユーザーまで OK (MVP 段階は審査不要)
- 100 ユーザー超 / Production 移行時に審査必要

Atender MVP は Testing ステータスのまま運用で OK。

---

## Part G. Architect 向け推奨設計サマリ

### G-1. 新 Prisma table 案

```prisma
model GoogleCalendarConnection {
  id              String   @id @default(cuid())
  userId          String
  accountId       String
  googleEmail     String
  status          GoogleConnStatus  @default(ACTIVE)
  lastError       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  user            User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  account         Account @relation(fields: [accountId], references: [id], onDelete: Cascade)
  calendarSyncs   GoogleCalendarSync[]
  @@unique([userId, accountId])
}

enum GoogleConnStatus { ACTIVE  REVOKED  ERROR }

model GoogleCalendarSync {
  id                  String   @id @default(cuid())
  connectionId        String
  googleCalendarId    String
  summary             String
  timeZone            String
  visibility          EventVisibility @default(TITLE_MAPPED)
  syncToken           String?
  lastSyncedAt        DateTime?
  enabled             Boolean  @default(true)
  status              SyncStatus @default(IDLE)
  lastError           String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  connection          GoogleCalendarConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  events              RoomEvent[]
  @@unique([connectionId, googleCalendarId])
}

enum EventVisibility { NORMAL TITLE_MAPPED BUSY_ONLY }
enum SyncStatus      { IDLE SYNCING OK FAILED REVOKED }

model RoomEvent {
  // ... 既存 ...
  source            EventSource   @default(MANUAL)
  googleSyncId      String?
  googleEventId     String?
  googleICalUID     String?
  googleUpdated     DateTime?
  googleSync        GoogleCalendarSync? @relation(fields: [googleSyncId], references: [id], onDelete: Cascade)
  @@unique([googleSyncId, googleEventId])
}

enum EventSource { MANUAL ICS GOOGLE }
```

設計判断:
- GoogleCalendarConnection を better-auth Account とは別 table に分離 (理由: better-auth Account は内部管理、Atender 固有 status/lastError を持ちたい)
- GoogleCalendarSync.connectionId 経由で Account.accessToken にアクセス
- RoomEvent.source で MANUAL/ICS/GOOGLE を区別 (既存 .ics import と共存)

### G-2. 新 API endpoints

```
GET    /api/me/google/connection                  -> 連携状態
DELETE /api/me/google/connection?deleteEvents=A|B -> 連携解除 (A=all delete, B=keep)

GET    /api/me/google/calendars                   -> Google から fetch して返す (保存はしない)

POST   /api/me/google/calendars/:calendarId/enable
  body: { visibility: "TITLE_MAPPED" }
DELETE /api/me/google/calendars/:calendarId

POST   /api/me/google/calendars/:calendarId/sync  -> 手動 1 cal 同期
POST   /api/me/google/sync-all                    -> 全 enabled cal 同期 (cron + 手動)
```

ルーム単位ではなくユーザー単位の連携。RoomEvent への流入は ルーム x User 関係で自動。

### G-3. better-auth 拡張コード断片

```ts
// apps/api/src/auth.ts diff
socialProviders: {
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    // デフォルトは Calendar scope なし — sign-in は最小権限
    accessType: "offline",
    prompt: "consent",
  },
},
```

```ts
// apps/web 側 — ルーム設定 or アカウントメニュー
async function connectGoogleCalendar() {
  await authClient.linkSocial({
    provider: "google",
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    callbackURL: "/settings/integrations/google?linked=1",
  });
}
```

### G-4. token refresh と sync の擬似コード

```ts
export async function getGoogleAccessTokenForUser(userId: string) {
  try {
    // background job 文脈なので headers なし — 要 better-auth source 確認 (Part H-5)
    const { accessToken } = await auth.api.getAccessToken({
      body: { providerId: "google", userId },
    });
    return accessToken;
  } catch (e) {
    if (e instanceof APIError) {
      if (e.body?.code === "FAILED_TO_GET_ACCESS_TOKEN") {
        await prisma.googleCalendarConnection.updateMany({
          where: { userId },
          data: { status: "REVOKED", lastError: "invalid_grant" },
        });
        throw new GoogleRelinkRequiredError();
      }
    }
    throw e;
  }
}
```

### G-5. UI 配置案

アカウントメニュー (グローバル設定):
- /settings/integrations/google に専用画面
- 「Google Calendar と連携」ボタン -> authClient.linkSocial(...)
- 連携後: Google アカウント email + 「カレンダー選択」 + 「同期するカレンダー一覧」 + 「最終同期日時」 + 「今すぐ同期」 + 「連携解除」

ルーム設定モーダル (ルーム個別):
- 「グローバル連携を ON/OFF」スイッチのみ
- 連携本体はアカウント menu、ルーム側は表示制御のみ
- MVP では「ユーザー単位の連携 = 全ルームで使う」、ルーム個別細設定は Phase 2

ホーム or Today 画面:
- 連携済かつ未同期が 1 日以上経っていたら、上部にバナー「Google Calendar を同期しますか?」 (オプション)

---

## Part H. 不確定事項 / 実装前に確認すべき点

1. better-auth linkSocial の v1.6.11 挙動詳細 — 実装前に実機で 1 度 flow を流し、Account.scope が space-separated で更新されることを確認すべき
2. include_granted_scopes のデフォルト値 — 実装時は明示するのが安全 (includeGrantedScopes: true を試す)
3. Per-user QPS — Cloud Console 実測必須。MVP の同期スパイクが問題なるかは要監視
4. all-day event の timezone 扱い — start.date 形式の場合、ローカル DB に保存する時刻をどの tz で UTC 化するか (カレンダー tz を使う方針推奨)
5. auth.api.getAccessToken を cron (背景 job) から呼ぶ場合 — session cookie がない。User ID 直渡しで動くか、ダミー session を立てる必要があるか。better-auth source 確認 or 実機検証必須 (一番厄介な未確認項目)

---

## How to apply

- Architect は本 BP を読み、Atender の .designs/20260X-google-calendar-oauth.md を書く
- 不確定事項 5 件は設計 doc で明示的に「実装中に確認」と書く (Developer に丸投げしない)
- 既存 06 ナレッジ (.ics import + RRULE + タイトルマッピング) と統合して RoomEvent.source を 3 値 enum (MANUAL/ICS/GOOGLE) に拡張
- Reviewer 向けに「Google API のレスポンスを stub する pattern」を設計 doc に追加 (vi.spyOn(globalThis, fetch) で events.list のレスポンスを差し替え)
