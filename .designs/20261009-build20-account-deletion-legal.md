# atender build 20 — アカウント削除 / Sign in with Apple のトークン保存と失効 / 法務ページ / Privacy Manifest

> 対象: `apps/api` (削除 API・Apple 認可コード交換・トークン失効・migration 1 本) + `apps/ios` (設定の行 5 つ・SIWA の認可コード・xcprivacy・版数) + `apps/web` (設定の削除行・法務ページ 3 枚・nginx)
> 前提 main: build 19 出荷状態 (`CFBundleVersion: "19"`、iOS ユニット **700 / 0 fail**、API Vitest = 台帳 `.knowledge/known-failures.md` の既知 16 failed、Web = 既知 26 failed)
> 版数: `CFBundleVersion` を **"20"**。API 変更は additive (新規エンドポイント 2 本 + DTO の型契約不変) なので **`MIN_IOS_BUILD` は 12 のまま** (§12)
> デプロイ順序: **API → Web → iOS** (§16.2)
> Researcher: `.knowledge/09-build20-app-review-research.md` (Touri 裁定 4 件・Apple 要件・実測)。汎用: `Muraki/knowledge/library/account-deletion-siwa-betterauth-2026.md`、本 doc で作った `Muraki/knowledge/pattern/account-deletion-shared-resources.md`
> デザイン正典: `DESIGN.md` (本 doc で置換が要る記述は無い。§8.6)

---

## 0. スコープ

| | 触る | 触らない |
|---|---|---|
| API | `prisma/schema.prisma` (2 列を nullable + SetNull)、migration 1 本、新規 `services/accountDeletion.service.ts` / `services/appleAuthorization.service.ts` / `services/tokenRevocation.service.ts` / `routes/authApple.ts`、`routes/me.ts` (`DELETE /api/me`)、`index.ts` (route 登録 1 行)、DTO の番兵 3 箇所 (`lib/dto.ts` / `services/room.service.ts` / `services/recurrence.service.ts`)、`scripts/seed-demo-user.ts` (削除検証用ユーザー) | better-auth の設定 (`auth.ts` の `user.deleteUser` は有効化しない)、`sessionMiddleware` / `setupGuard`、`unlinkGoogle` (revoke を足さない。§17)、`packages/shared` (型の変更なし) |
| iOS | `AppleSignIn.swift` (認可コードの取り出し)、`AuthStore.swift` (認可コード送信・`completeAccountDeletion`)、`AuthView.swift` (呼び出し 1 箇所)、`APIEndpoint.swift` (`deleteMe`)、`MeRepository.swift` (`deleteAccount`)、`SettingsView.swift` (行 4 つ + 確認ダイアログ + 進行表示 + 失敗 alert)、新規 `LegalLinks.swift`、新規 `PrivacyInfo.xcprivacy`、`project.yml` / `Info.plist` (版数) | `SettingsSection` / `SettingsRowSpec` (既存の部品のまま使う)、`RoomLogic` / `TemplateLogic` (番兵 `""` はそのまま流れる。§7.3) |
| Web | `components/settings/Settings.tsx` (削除行 + `ConfirmDialog`)、`routes/Templates.tsx` (作成者表示 1 行)、新規 `public/privacy.html` / `public/terms.html` / `public/support.html`、`nginx.conf` | `ConfirmDialog` / `SettingsRow` 本体、SPA のルーティング (法務ページは静的 HTML) |

**用語**:
- **退会者**: `DELETE /api/me` を呼んだ本人
- **写し (projection)**: 本人の私的データを共有先へ機械的にコピーした行。`RoomEvent.source` が `PERSONAL` (個人カレンダーのルーム共有) と `GOOGLE_OAUTH` (Google カレンダーのルーム同期) のもの
- **番兵 (sentinel)**: DB の `NULL` を API では `""` (空文字) で返す値。定数名 `DELETED_AUTHOR_ID`

---

## 1. 目的

1. App Store Guideline 5.1.1(v) を満たす — アカウントを作れるアプリは**アプリ内で削除を開始できる**こと。削除は即時に完了し、他のユーザーが使っているルーム・予定・公開テンプレは壊さない (Touri 裁定)
2. Sign in with Apple / Google のトークンを退会時に失効させる (best-effort)。そのために iOS の Apple サインインで**認可コードを送り、サーバーで refresh token に交換して保存**する経路を新設する (現状 Apple の Account 行はトークンが全部 NULL)
3. App Store Connect に登録するプライバシーポリシー / 利用規約 / サポートの URL を用意し、iOS の設定から開けるようにする。Privacy Manifest を同梱する

---

## 2. 現状の実測 (設計の根拠。すべて build 19 の main で確認)

| 事実 | 場所 |
|---|---|
| User から張られた FK のうち、**他人のデータを巻き込む Cascade** は `Room.createdBy` (ルーム丸ごと = 他メンバーの Membership / RoomEvent / IcsImport / GoogleCalendarSync / PersonalCalendarShare も)、`RoomEvent.author` (他人のルームに作った予定)、`TimetableTemplate.author` (公開テンプレ丸ごと) の 3 本。他は本人のデータで Cascade、`School.createdBy` / `Department.createdBy` / `UserTimetable.sourceTemplate` は既に SetNull | `apps/api/prisma/schema.prisma:181, 478, 510` |
| `RoomMembership` の参加日時列は **`joinedAt`** (`createdAt` は無い)。ブリーフの「`RoomMembership.createdAt` 昇順」は `joinedAt` 昇順と読む | `schema.prisma:491-503` |
| OWNER は作成時に作成者へ付くだけで、移譲・昇格の API は無い (OWNER は leave も remove もできない) | `services/room.service.ts:110-125, 155-184` |
| `RoomEvent.authorId` は DTO にそのまま出る (`eventDto` / `expandRoomEvents` / `visibleOccurrenceDto`)。`TimetableTemplate.authorUserId` も `templateDto` に出る | `room.service.ts:41, 382`、`recurrence.service.ts:86`、`lib/dto.ts:75` |
| **iOS の DTO は両方とも非 Optional** (`RoomEventDto.authorId: String` / `TemplateDto.authorUserId: String`)。shared の zod も `z.string()`。→ API が `null` を返すと **build 19 以前の iOS は decode に失敗**してルームのカレンダー全体が出なくなる | `apps/ios/Atender/Core/Models/DTOs.swift:252, 697`、`packages/shared/src/schemas/room.ts:39`、`template.ts:30` |
| 写しの行は `authorId = 共有した本人` で作られる: 個人カレンダー共有 (`source: "PERSONAL"`、`externalUid: "pe:<id>"`) と Google 同期 (`source: "GOOGLE_OAUTH"`) | `services/personalCalendarShare.service.ts:96, 128-145`、`services/googleCalendarSync.service.ts:205` |
| better-auth 1.6.11 の `sign-in/social` idToken 経路は Apple の認可コードを**使わない** (`verifyIdToken` は JWT 署名と aud だけを見る)。Account には `accessToken: body.idToken.accessToken` だけを渡し、2 回目以降のサインインでは `undefined` の値を**更新対象から除外**する (= 後から保存した refresh token は上書きされない) | `node_modules/@better-auth/core/dist/social-providers/apple.mjs` `verifyIdToken`、`better-auth/dist/api/routes/sign-in.mjs:93-118`、`better-auth/dist/oauth2/link-account.mjs` (`freshTokens` の `filter(value !== void 0)`) |
| idToken 経路では Account の更新が起きない (`freshTokens` が空) ので、`databaseHooks.account.update` は**既存の Apple ユーザーの再サインインで発火しない** | 同上 |
| OAuth トークンは平文で Account に入る (`encryptOAuthTokens` 未設定。既存 `refreshGoogleTokenManually` が `account.refreshToken` を直接使っている) | `services/googleAccessToken.service.ts:60-70` |
| `env` は import 時に 1 回だけ `process.env` を parse する定数。Apple の設定をテストごとに出し入れするには呼び出し時に `process.env` を読む関数が要る | `src/env.ts:28` |
| `sessionMiddleware` は better-auth の `getSession` → 失敗時に Bearer / cookie の生トークンで Session 行を直接引く。Session は User に Cascade なので、User 削除後は同じトークンが 401 | `middleware/session.ts:27-52` |
| iOS の Apple サインインは `identityToken` だけを取り出し、`AuthStore.signInWithApple(idToken:)` が `POST /api/auth/sign-in/social` に送る | `Core/Auth/AppleSignIn.swift:13-20, 34-41`、`Core/Auth/AuthStore.swift:57-68`、`Features/Auth/AuthView.swift:27-38` |
| 設定「その他」はログアウト行 1 つ。`signOut()` は `isSigningOut` ガード → `wipeExport()` (EventKit のみ・API 不使用) → `authStore.signOut()` → `queryClient.removeAll()` → `router.settingsPath = NavigationPath()` | `Features/Settings/SettingsView.swift:35-39, 138-146`、`Core/Sync/CalendarSyncCoordinator.swift:286-300` |
| `APIClient.send(_:)` (戻り値なし) は 2xx なら body を読まない (204 可)、401 なら `authStore.handleUnauthorized()` | `Core/Networking/APIClient.swift:48-64` |
| Web には確認用の `ConfirmDialog` (`BottomSheet` + キャンセル / 確認) がある | `apps/web/src/components/ui/ConfirmDialog.tsx` |
| Web の `nginx.conf` は `try_files $uri /index.html;` のみ → `/privacy` は SPA に落ちる (Researcher 実測) | `apps/web/nginx.conf` |
| UserDefaults の使用は `CalendarSyncCoordinator` / `SemesterRolloverStore` / `@AppStorage("atender.theme")` のみ。他の required reason API (ファイル時刻・起動時刻・空き容量・キーボード) の使用は 0 | grep 済 |
| XcodeGen 2.45.4 は `sources: - Atender` 配下の `.xcprivacy` を自動で **Resources** build phase に入れる (scratchpad の複製で `xcodegen generate` → pbxproj に `PrivacyInfo.xcprivacy in Resources` を確認) | `apps/ios/project.yml:36-37` |
| 版数 `"19"` を assert するテストは `BuildVersionTests` / `B17BuildVersionTests` / `B18HomeAndVersionTests` の 3 ファイル | §15.3 |

---

## 3. 退会時のデータの扱い (裁定)

退会者が関わる行を 4 種に分ける (`Muraki/knowledge/pattern/account-deletion-shared-resources.md`)。

| 種類 | 行 | 扱い | 根拠 |
|---|---|---|---|
| 本人だけのデータ | Account / Session / Semester 以下全部 / PersonalEvent / IcsImport / IcsTitleRule / GoogleCalendarConnection (→ Sync) / PersonalCalendarShare / RoomMembership / Friendship (両側) / AttendanceRule (本人分) / AttendanceRecord | **Cascade のまま** (既存) | 本人のデータ |
| 本人が所有する共有資源 | 退会者が OWNER (または `createdByUserId`) のルーム | **最古の残メンバーへ移譲** (`joinedAt` 昇順 → `id` 昇順の先頭)。`role = OWNER` と `Room.createdByUserId` の両方を付け替える。残メンバー 0 ならルームを削除 | Touri 裁定。`createdByUserId` が Cascade の起点なので role だけ変えても消える |
| 本人が寄稿した共有コンテンツ | 他人のルーム (または移譲されたルーム) の `RoomEvent` のうち `source ∈ {MANUAL, ICS_FILE, ICS_URL}` | **`authorId` を NULL にして残す** (migration で SetNull 化) | §3.1 |
| 〃 | `TimetableTemplate` で `isPublic = true` | **`authorUserId` を NULL にして残す** (migration で SetNull 化) | Touri 裁定 (匿名化) |
| 〃 | `School` / `Department` の `createdByUserId` | NULL にして残す (既存の SetNull) | 学校名・学科名は他ユーザーも選んでいる |
| 本人の私的データの写し | `RoomEvent` で `authorId = 退会者` かつ `source ∈ {PERSONAL, GOOGLE_OAUTH}` | **tx 内で明示削除** | SetNull にすると個人予定・Google カレンダーの中身が匿名で残り、「すべて削除」に反する |
| 本人の非公開データ | `TimetableTemplate` で `authorUserId = 退会者` かつ `isPublic = false` | **tx 内で明示削除** | 他人に見えていないので残す理由が無い |
| 残置 (削除しない) | `Verification` (Magic Link の 15 分トークン。FK なし) | そのまま (最長 15 分で失効) | 消すにはメールアドレスで value を走査する必要があり、15 分で無効になる |

### 3.1 `RoomEvent.author` を SetNull にする理由 (Cascade のままにしない)

- ルームの予定は「そのルームのメンバー全員の予定」(部活の練習日・飲み会)。作った 1 人が退会すると他メンバーの予定が無言で消えるのは、Touri 裁定「ルームは移譲して残す」と同じ理由で避ける
- 匿名化した予定は誰も編集・削除できなくなる (既存の `exists.authorId !== userId → 403 NOT_AUTHOR`、`room.service.ts:244, 271`)。ルームのオーナーがルームを消せば消える。編集権の拡張は本 doc ではしない (台帳 A3 の「メンバーなら誰でも編集可」は別件)
- 写し (`PERSONAL` / `GOOGLE_OAUTH`) は明示削除するので、私的データは残らない
- 番兵 `""` で返すので旧 iOS クライアントは壊れない (§7.3)

---

## 4. API — `DELETE /api/me`

### 4.1 契約

| 項目 | 値 |
|---|---|
| Method / Path | `DELETE /api/me` |
| 認可 | `sessionMiddleware` のみ (**`setupGuard` を付けない** — セットアップ未完了のユーザーも消せる)。cookie / Bearer どちらも可 |
| Request body | なし (送られても読まない) |
| 成功 | **204 No Content**、body 空 |
| 401 | セッションなし / 失効 / 既に削除済みのユーザーのトークン → `{ error: { code: "UNAUTHORIZED", ... } }` (既存の封筒) |
| 500 | DB の tx が失敗 → `{ error: { code: "INTERNAL", ... } }` (既存 `registerErrorHandler`)。**ユーザーは削除されない** (rollback)、revoke は行わない |

```ts
// apps/api/src/routes/me.ts (registerMeRoutes 内に追加)
app.delete("/api/me", sessionMiddleware, async (c) => {
  await deleteAccount(c.get("user").id);
  return c.body(null, 204);
});
```

### 4.2 処理順 (`deleteAccount`)

```
1. single-flight: inFlight.get(userId) があればそれを await して同じ結果を返す (§4.4)
2. tokens = await collectRevocableTokens(userId)          ← User 削除前に Account を読む (§6.2)
3. summary = await deleteUserData(userId)                 ← 1 つの prisma.$transaction (§4.3)
4. revocations = await revokeTokens(tokens, { apple: readAppleCredentialsConfig() })   ← commit 後。失敗はログのみ
5. return { ...summary, revocations }
```

- revoke を commit **後**に置く: 先に revoke して tx が失敗すると、アカウントが残ったまま Apple 連携だけ切れる。後に置くと、プロセスが 3 と 4 の間で落ちた場合だけ revoke が漏れる (best-effort の範囲)
- ネットワークを tx の中に入れない (SQLite の書き込みロックを外部 API の待ち時間だけ握らない)

### 4.3 `deleteUserData(userId)` — tx の中身 (この順で)

```ts
await prisma.$transaction(async (tx) => {
  // (a) 退会者が所有するルーム
  const owned = await tx.room.findMany({
    where: { OR: [{ createdByUserId: userId }, { memberships: { some: { userId, role: "OWNER" } } }] },
    select: { id: true },
  });
  for (const room of owned) {
    const successor = await tx.roomMembership.findFirst({
      where: { roomId: room.id, userId: { not: userId } },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    });
    if (!successor) {
      await tx.room.delete({ where: { id: room.id } });            // Cascade で Membership / RoomEvent / IcsImport / Sync / Share も消える
      deletedRoomIds.push(room.id);
      continue;
    }
    if (successor.role !== "OWNER") {
      await tx.roomMembership.update({ where: { id: successor.id }, data: { role: "OWNER" } });
    }
    await tx.room.update({ where: { id: room.id }, data: { createdByUserId: successor.userId } });
    transferredRoomIds.push(room.id);
  }
  // (b) 写しを明示削除
  await tx.roomEvent.deleteMany({ where: { authorId: userId, source: { in: ["PERSONAL", "GOOGLE_OAUTH"] } } });
  // (c) 非公開テンプレを明示削除
  await tx.timetableTemplate.deleteMany({ where: { authorUserId: userId, isPublic: false } });
  // (d) 本体。残りは FK の Cascade / SetNull に任せる
  const { count } = await tx.user.deleteMany({ where: { id: userId } });
  deleted = count === 1;
});
```

- `user.deleteMany` (`delete` でなく): 既に消えていても例外にしない (§4.4)
- 移譲先は「退会者以外のメンバー」の中の最古。退会者以外に OWNER がいる場合 (現行データでは発生しない) も同じ規則で、選ばれた人が既に OWNER なら role は触らない
- `deletedRoomIds` / `transferredRoomIds` は id 昇順に並べて返す (テストで比較しやすくする)

### 4.4 二重送信

- モジュール内 `const inFlight = new Map<string, Promise<AccountDeletionSummary>>()`。`deleteAccount(userId)` は、同じ `userId` の Promise があればそれを返す。無ければ作って登録し、`finally` で `delete`
- 2 本目が `sessionMiddleware` を通過するのが 1 本目の commit 後なら 401 になる。どちらの順でも **500 にならない**、User は 0 行、revoke は 1 回 (同じ Promise を共有するので `fetch` は 1 本目の分だけ)
- 同一プロセス前提 (atender-api は 1 コンテナ)。複数プロセス化は本 doc の外

---

## 5. API — Sign in with Apple の認可コード交換

### 5.1 方式の裁定: **自前の後続エンドポイント** `POST /api/auth-apple/exchange`

iOS はサインイン成功 (Bearer 取得 + `GET /api/me` 成功) の後に、取得したばかりの Bearer で認可コードをこのエンドポイントへ送る。better-auth の外で完結させる。

| 候補 | 判定 | 理由 (node_modules の better-auth 1.6.11 実コード) |
|---|---|---|
| `databaseHooks.account.create/update.after` | ✗ | idToken 経路で既存アカウントにサインインすると `freshTokens` が空になり `updateAccount` 自体が呼ばれない (§2)。**現存する Apple ユーザー全員の再サインインで発火しない** |
| `hooks.after` (`createAuthMiddleware`、path `/sign-in/social`) | ✗ | `socialSignInBodySchema` は `z.object` なので未知キー `authorizationCode` は検証後の body から落ちる。hook で拾うには検証前の生 body (`internalContext.body`) に依存する — better-call の内部挙動で、版が上がると黙って壊れる。さらに Apple への交換 (数百 ms) がサインイン応答の中に入る |
| `idToken.refreshToken` に入れて送る | ✗ | better-auth は保存前に検証しない (クライアントが任意の文字列を refresh token として保存させられる)。iOS はそもそも refresh token を持っていない |
| **自前エンドポイント** | ○ | better-auth の内部に依存しない。交換は認証済みのユーザーの Apple Account にだけ書く。交換結果の `id_token.sub` を Account の `accountId` と照合できる。失敗はサインインに影響しない |

認可コードは 5 分有効・1 回限り。サインイン → `GET /api/me` → 交換は 1〜2 秒で終わるので期限に余裕がある。

### 5.2 契約

| 項目 | 値 |
|---|---|
| Method / Path | `POST /api/auth-apple/exchange` (`/api/auth/*` の better-auth catch-all には一致しない: セグメントが `auth-apple`) |
| 認可 | `sessionMiddleware` のみ (`setupGuard` なし — 新規ユーザーはセットアップ前にここを呼ぶ) |
| Request body | `{ authorizationCode: string }` (zod: `z.object({ authorizationCode: z.string().min(1).max(4096) })`、`lib/validator.ts` の `zValidator`) |
| 200 | `{ stored: true }` または `{ stored: false, reason: AppleExchangeFailureReason }` — **Apple 側の失敗は 200 で返す** (クライアントは結果を見ない。テストが観測できるように理由を返す) |
| 400 | body 不正 → `VALIDATION_ERROR` (既存の封筒) |
| 401 | 未認証 |

```ts
// apps/api/src/routes/authApple.ts
const ExchangeBody = z.object({ authorizationCode: z.string().min(1).max(4096) });
export function registerAuthAppleRoutes(app: Hono) {
  app.post("/api/auth-apple/exchange", sessionMiddleware, zValidator("json", ExchangeBody), async (c) => {
    const result = await exchangeAppleAuthorizationCode({
      userId: c.get("user").id,
      authorizationCode: c.req.valid("json").authorizationCode,
    });
    return c.json(result);
  });
}
// apps/api/src/index.ts: registerAuthRoutes(app); の直後に registerAuthAppleRoutes(app);
```

### 5.3 `exchangeAppleAuthorizationCode` の処理

```
1. config = readAppleCredentialsConfig()             → null なら { stored:false, reason:"NOT_CONFIGURED" } (fetch しない)
2. account = prisma.account.findFirst({ where: { userId, providerId: "apple" } })
                                                      → null なら "NO_APPLE_ACCOUNT" (fetch しない)
3. POST https://appleid.apple.com/auth/token
     Content-Type: application/x-www-form-urlencoded
     client_id=<config.bundleId>&client_secret=<appleClientSecretFor(config, config.bundleId, now)>
     &code=<authorizationCode>&grant_type=authorization_code
     (redirect_uri は送らない — ネイティブの認可コード)
     signal: AbortSignal.timeout(APPLE_HTTP_TIMEOUT_MS = 5000)
   → fetch が throw / status が 2xx でない / JSON でない → "EXCHANGE_FAILED"
4. body.refresh_token が非空文字列でない → "NO_REFRESH_TOKEN" (保存しない)
5. decodeJwtSubject(body.id_token) !== account.accountId → "SUBJECT_MISMATCH" (保存しない)
6. prisma.account.update({ where: { id: account.id }, data: {
     refreshToken: body.refresh_token,
     accessToken: typeof body.access_token === "string" ? body.access_token : null,
     accessTokenExpiresAt: typeof body.expires_in === "number" ? new Date(now + expires_in * 1000) : null,
   } })                                                 → { stored: true }
```

- `idToken` 列には保存しない (メールアドレスを含む JWT を余計に持たない)
- `decodeJwtSubject`: `.` で 3 分割し、2 番目を base64url → JSON → `sub` が文字列ならそれ、それ以外は `null`。**署名は検証しない** (TLS で Apple のトークンエンドポイントから直接受け取った値なので)
- ログ: 失敗時に `console.warn("[apple-exchange] failed", { userId, reason, status })` (`status` は HTTP status か `null`)。**認可コード・トークン・client_secret をログに出さない**

### 5.4 Apple の設定 (呼び出し時に読む)

```ts
// apps/api/src/services/appleAuthorization.service.ts
export type AppleCredentialsConfig = {
  teamId: string;
  keyId: string;
  privateKeyPem: string;     // APPLE_PRIVATE_KEY の生値 (base64 の .p8 も PEM も可。buildAppleClientSecret が normalizeApplePem する)
  bundleId: string;          // APPLE_APP_BUNDLE_ID (net.appily.atender)
  servicesId: string | null; // APPLE_CLIENT_ID (Web の Services ID)。未設定なら null
};
/** APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY / APPLE_APP_BUNDLE_ID のどれかが未設定 or 空文字なら null。
 *  env.ts の定数でなく呼び出し時の source を読む (テストで出し入れするため。§2) */
export function readAppleCredentialsConfig(source: NodeJS.ProcessEnv = process.env): AppleCredentialsConfig | null;
/** = buildAppleClientSecret({ teamId, keyId, privateKeyPem, clientId }, now) (auth.ts の既存関数) */
export function appleClientSecretFor(config: AppleCredentialsConfig, clientId: string, now?: Date): string;
export function decodeJwtSubject(idToken: unknown): string | null;
export const APPLE_HTTP_TIMEOUT_MS = 5000;
export type AppleExchangeFailureReason = "NOT_CONFIGURED" | "NO_APPLE_ACCOUNT" | "EXCHANGE_FAILED" | "NO_REFRESH_TOKEN" | "SUBJECT_MISMATCH";
export type AppleExchangeResult = { stored: true } | { stored: false; reason: AppleExchangeFailureReason };
export async function exchangeAppleAuthorizationCode(args: { userId: string; authorizationCode: string; now?: Date }): Promise<AppleExchangeResult>;
```

`APPLE_CLIENT_SECRET` (静的な secret) だけの構成は非対応 (= `NOT_CONFIGURED`)。本番 Coolify には Team / Key / p8 が揃っている (Researcher 実測)。

---

## 6. API — トークン失効 (revoke)

### 6.1 シグネチャ

```ts
// apps/api/src/services/tokenRevocation.service.ts
export type RevocableToken = { provider: "apple" | "google"; token: string; tokenTypeHint: "refresh_token" | "access_token" };
export type RevokeOutcome = { provider: "apple" | "google"; clientId: string | null; ok: boolean; status: number | null };
export const REVOKE_TIMEOUT_MS = 5000;
/** Account (providerId "apple" | "google") を読み、1 行につき最大 1 トークン: refreshToken が非空ならそれ (hint refresh_token)、
 *  無ければ accessToken が非空ならそれ (hint access_token)、どちらも無ければその行は出さない */
export async function collectRevocableTokens(userId: string): Promise<RevocableToken[]>;
/** 全部 Promise.allSettled で並行。throw しない */
export async function revokeTokens(tokens: RevocableToken[], options?: { apple?: AppleCredentialsConfig | null; now?: Date }): Promise<RevokeOutcome[]>;
```

### 6.2 リクエスト

| provider | 送り先 | form body | `ok` |
|---|---|---|---|
| google | `POST https://oauth2.googleapis.com/revoke` | `token=<token>` | `res.ok` (200) |
| apple | `POST https://appleid.apple.com/auth/revoke` | `client_id=<id>&client_secret=<appleClientSecretFor(config, id, now)>&token=<token>&token_type_hint=<hint>` | `res.status === 200` |

- 共通: `Content-Type: application/x-www-form-urlencoded`、`signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS)`。throw は `{ ok: false, status: null }`
- **Apple は client_id を 2 つ試す**: `[config.bundleId, config.servicesId]` の重複と null を除いた順 (Bundle ID → Services ID)。ネイティブで交換したトークンは Bundle ID、Web の Apple ログイン (better-auth のリダイレクト経路) で得たトークンは Services ID に発行されており、Account 行からはどちらか判別できない。違う client_id での revoke は無害 (Apple は失効しないだけ)。1 トークンにつき `RevokeOutcome` が client_id の数だけ出る
- `options.apple` が `null` / 未指定 → Apple の行は fetch せず `{ provider: "apple", clientId: null, ok: false, status: null }` を 1 つ返し、`console.warn("[account-deletion] apple revoke skipped: not configured")`
- 失敗 (`ok: false`) ごとに `console.warn("[account-deletion] token revoke failed", { provider, clientId, status })`。**トークン・client_secret をログに出さない**
- Google の revoke は同一 GCP プロジェクトの全スコープを失効させる (Researcher)。退会なので意図どおり

---

## 7. データモデル

### 7.1 Prisma schema の差分 (2 箇所だけ)

```prisma
model TimetableTemplate {
  authorUserId String?                                                                          // ← String から
  author       User?      @relation("AuthoredTemplates", fields: [authorUserId], references: [id], onDelete: SetNull)   // ← User / Cascade から
  ...
}
model RoomEvent {
  authorId    String?                                                                           // ← String から
  author      User?    @relation("RoomEventAuthor", fields: [authorId], references: [id], onDelete: SetNull)          // ← User / Cascade から
  ...
}
```

### 7.2 migration (1 本)

- フォルダ: `apps/api/prisma/migrations/<YYYYMMDDHHMMSS>_b20_author_set_null/migration.sql` (タイムスタンプは作成時刻。既存の最新 `20260908050000_shared_transfer_displacement` より後)
- 中身は下の SQL と**完全一致** (`prisma migrate diff --from-schema-datamodel <旧> --to-schema-datamodel <新> --script` を Architect が実行して得た出力そのもの。`prisma migrate dev --create-only` でも同じものが出る)。**手で編集しない**

```sql
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TimetableTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorUserId" TEXT,
    "schoolId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "year" INTEGER,
    "term" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "copyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimetableTemplate_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimetableTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimetableTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TimetableTemplate" ("authorUserId", "copyCount", "createdAt", "departmentId", "description", "id", "isPublic", "schoolId", "term", "title", "updatedAt", "year") SELECT "authorUserId", "copyCount", "createdAt", "departmentId", "description", "id", "isPublic", "schoolId", "term", "title", "updatedAt", "year" FROM "TimetableTemplate";
DROP TABLE "TimetableTemplate";
ALTER TABLE "new_TimetableTemplate" RENAME TO "TimetableTemplate";
CREATE INDEX "TimetableTemplate_schoolId_departmentId_updatedAt_idx" ON "TimetableTemplate"("schoolId", "departmentId", "updatedAt" DESC);
CREATE INDEX "TimetableTemplate_authorUserId_idx" ON "TimetableTemplate"("authorUserId");
CREATE TABLE "new_RoomEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "rawTitle" TEXT,
    "recurrenceRule" TEXT,
    "exDates" TEXT,
    "rDates" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalUid" TEXT,
    "externalSeq" INTEGER,
    "externalLastModified" DATETIME,
    "importId" TEXT,
    "visibilityMode" TEXT NOT NULL DEFAULT 'NORMAL',
    "googleSyncId" TEXT,
    "googleEventId" TEXT,
    "googleRecurringEventId" TEXT,
    CONSTRAINT "RoomEvent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomEvent_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RoomEvent_importId_fkey" FOREIGN KEY ("importId") REFERENCES "IcsImport" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RoomEvent_googleSyncId_fkey" FOREIGN KEY ("googleSyncId") REFERENCES "GoogleCalendarSync" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RoomEvent" ("authorId", "color", "createdAt", "description", "end", "exDates", "externalLastModified", "externalSeq", "externalUid", "googleEventId", "googleRecurringEventId", "googleSyncId", "id", "importId", "isAllDay", "rDates", "rawTitle", "recurrenceRule", "roomId", "source", "start", "title", "updatedAt", "visibilityMode") SELECT "authorId", "color", "createdAt", "description", "end", "exDates", "externalLastModified", "externalSeq", "externalUid", "googleEventId", "googleRecurringEventId", "googleSyncId", "id", "importId", "isAllDay", "rDates", "rawTitle", "recurrenceRule", "roomId", "source", "start", "title", "updatedAt", "visibilityMode" FROM "RoomEvent";
DROP TABLE "RoomEvent";
ALTER TABLE "new_RoomEvent" RENAME TO "RoomEvent";
CREATE INDEX "RoomEvent_roomId_start_idx" ON "RoomEvent"("roomId", "start");
CREATE INDEX "RoomEvent_authorId_idx" ON "RoomEvent"("authorId");
CREATE INDEX "RoomEvent_googleSyncId_idx" ON "RoomEvent"("googleSyncId");
CREATE UNIQUE INDEX "RoomEvent_roomId_externalUid_key" ON "RoomEvent"("roomId", "externalUid");
CREATE UNIQUE INDEX "RoomEvent_googleSyncId_googleEventId_key" ON "RoomEvent"("googleSyncId", "googleEventId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
```

**既存 FK への影響 (Architect 実測、`apps/api/prisma/dev.db` のコピーに `prisma migrate deploy` で適用)**:

| 子テーブル / 列 | 参照先 | 適用前 → 後の行数 |
|---|---|---|
| `TemplateDaySlot` / `TemplateCourse` / `TemplateMeeting` (Cascade) | `TimetableTemplate` | 1 / 1 / 1 → 1 / 1 / 1 |
| `UserTimetable.sourceTemplateId IS NOT NULL` (SetNull) | `TimetableTemplate` | 1 → 1 |
| `RoomEventOverride` (Cascade) | `RoomEvent` | 1 → 1 |

`PRAGMA foreign_key_check` は 0 行。子テーブルの FK 定義は表名 (`"TimetableTemplate"` / `"RoomEvent"`) で参照しているので、新表の RENAME 後にそのまま新表を指す。
**負のコントロール**: 同じ SQL から `PRAGMA foreign_keys=OFF;` を除き FK ON のまま `sqlite3` で流すと、`DROP TABLE` の暗黙 DELETE が発火して上の子行が **1/1/1/1/1 → 0/0/0/0/0** になる (実測)。→ この migration は `prisma migrate deploy` (本番 `entrypoint.sh`・テストの `ensureTemplateDb`) 以外の経路で流さない。

### 7.3 DTO の番兵

```ts
// apps/api/src/lib/dto.ts
/** 退会したユーザーが作者だった行の authorId / authorUserId。DB は NULL、API は空文字で返す。
 *  iOS build ≤ 19 の Codable は非 Optional String なので null を返すと decode が落ちる (§2) */
export const DELETED_AUTHOR_ID = "";
```

| 場所 | 変更 |
|---|---|
| `lib/dto.ts` `templateDto` | `authorUserId: template.authorUserId ?? DELETED_AUTHOR_ID` |
| `services/room.service.ts` `eventDto` | 引数型の `authorId: string` → `string \| null`、出力 `authorId: event.authorId ?? DELETED_AUTHOR_ID` |
| `services/recurrence.service.ts` `ExpandedOccurrence` 生成 (`:86`) | `authorId: event.authorId ?? DELETED_AUTHOR_ID` (`ExpandedOccurrence.authorId` の型は `string` のまま) |
| `services/recurrence.service.ts:155` (`scope=future` の新系列作成) | 変更なし (`series.authorId` が null でも Prisma の create は通る。null の系列は `NOT_AUTHOR` で到達しない) |

その他の型エラーは `pnpm exec tsc --noEmit -p tsconfig.json` (apps/api) で全部潰す。`packages/shared` の zod (`z.string()`) と iOS / Web の型は**変えない**。

クライアント側の帰結 (変更不要の確認): iOS `RoomLogic` は `members[""]` が nil → `MemberColor.memberColor("")` の色で描く。`visibleOccurrenceDto` の `isAuthor` は `"" === viewerId` にならない → BUSY_ONLY は「予定あり」表示のまま。Web `meetingExpansion` / `AvailabilityBar` も同様。

### 7.4 Swift の型

```swift
// Core/Auth/AppleSignIn.swift
struct AppleSignInCredential: Equatable, Sendable {
    let identityToken: String
    let authorizationCode: String?          // ASAuthorizationAppleIDCredential.authorizationCode を UTF-8 で。無い / 空 / UTF-8 でない → nil
}
```

DB の他のテーブル・永続化 (UserDefaults / Keychain のキー) は変更しない。

---

## 8. iOS

### 8.1 Apple サインイン (`AppleSignIn` / `AuthStore` / `AuthView`)

```swift
// Core/Auth/AppleSignIn.swift
@MainActor final class AppleSignIn: NSObject, ... {
    private var continuation: CheckedContinuation<AppleSignInCredential, Error>?     // ← String から
    nonisolated static func makeRequest(_ request: ASAuthorizationAppleIDRequest)  // 不変
    nonisolated static func identityToken(from authorization: ASAuthorization) throws -> String   // 不変
    /// nil → nil / 空 Data → nil / UTF-8 として不正 → nil / それ以外は UTF-8 文字列 (空文字なら nil)
    nonisolated static func authorizationCodeString(from data: Data?) -> String?    // 新規 (純関数)
    func signIn() async throws -> AppleSignInCredential                             // ← 戻り値型を変更
    // didCompleteWithAuthorization: identityToken(from:) + authorizationCodeString(from: credential.authorizationCode)
}

// Core/Auth/AuthStore.swift
func signInWithApple(idToken: String, authorizationCode: String? = nil) async throws   // 既定値 nil で既存呼び出し・既存テストを壊さない
func completeAccountDeletion()                                                          // 新規 (§8.3)
// 内部 (private):
// private func exchangeAppleAuthorizationCode(_ code: String) async   // エラーは握り潰す
// private struct AppleAuthorizationCodeBody: Encodable { let authorizationCode: String }

// Features/Auth/AuthView.swift の signInApple クロージャ
let credential: AppleSignInCredential
do { credential = try await appleSignIn.signIn() } catch { /* 既存の canceled 判定のまま */ }
try await authStore.signInWithApple(idToken: credential.identityToken, authorizationCode: credential.authorizationCode)
```

`signInWithApple` の手順 (既存 + 1 段):

1. `POST /api/auth/sign-in/social` (既存。body は `{provider:"apple", idToken:{token}}` のまま — **認可コードはここに入れない**)
2. `set-auth-token` を Keychain に保存 (既存)
3. `me = try await fetchMe(token:)` (既存。失敗すれば throw、以降は行わない)
4. **新規**: `authorizationCode` が非 nil かつ非空なら `await exchangeAppleAuthorizationCode(code)` — `authRequestWithData(path: "/api/auth-apple/exchange", body: AppleAuthorizationCodeBody(authorizationCode: code), requiresAuth: true)` を 1 回。**応答の status・body・throw をすべて無視**する (`do { _ = try await ... } catch {}`)
5. `state = .signedIn` (既存)

交換を `APIClient` でなく `authRequestWithData` で送る理由: `APIClient` は 401 で `handleUnauthorized()` を呼び、サインイン途中のトークンを消してしまう。交換の失敗はサインインに影響させない。

### 8.2 設定「その他」(`SettingsView`)

```
その他
┌──────────────────────────────────┐
│ プライバシーポリシー           ›  │  settings-row-privacy        → openURL(LegalLinks.privacy)
│ 利用規約                       ›  │  settings-row-terms          → openURL(LegalLinks.terms)
│ サポート                       ›  │  settings-row-support        → openURL(LegalLinks.support)
│ ログアウト                     ›  │  settings-row-signout (danger、既存)
│ アカウントを削除               ›  │  settings-row-delete-account (danger) → 確認ダイアログ
└──────────────────────────────────┘
```

```swift
SettingsSection(title: "その他", rows: [
    SettingsRowSpec(id: "settings-row-privacy", label: "プライバシーポリシー") { openURL(LegalLinks.privacy) },
    SettingsRowSpec(id: "settings-row-terms", label: "利用規約") { openURL(LegalLinks.terms) },
    SettingsRowSpec(id: "settings-row-support", label: "サポート") { openURL(LegalLinks.support) },
    SettingsRowSpec(id: "settings-row-signout", label: "ログアウト", danger: true) { Task { await signOut() } },
    SettingsRowSpec(id: "settings-row-delete-account", label: "アカウントを削除", danger: true) {
        if !isDeletingAccount { isConfirmingAccountDeletion = true }
    },
])
```

- 部品は既存の `SettingsSection` / `SettingsRowSpec` のみ (行の見た目は既存のまま。外部リンクの行も chevron)。`openURL` は `@Environment(\.openURL)` — Safari (既定ブラウザ) で開く
- `LegalLinks` (新規 `Features/Settings/LegalLinks.swift`):

```swift
enum LegalLinks {
    static let privacy = URL(string: "https://atender.appily.run/privacy")!
    static let terms = URL(string: "https://atender.appily.run/terms")!
    static let support = URL(string: "https://atender.appily.run/support")!
}
```

Debug ビルドでも本番の URL (静的ページで環境差が無い)。

### 8.3 アカウント削除の UI と状態

**確認ダイアログ** (標準 `confirmationDialog`。既存 `CalendarSyncSettingsSheet.swift:30-40` と同じ形):

```swift
.confirmationDialog(SettingsLogic.deleteAccountTitle, isPresented: $isConfirmingAccountDeletion, titleVisibility: .visible) {
    Button("削除する", role: .destructive) { Task { await deleteAccount() } }
    Button("キャンセル", role: .cancel) {}
} message: {
    Text(SettingsLogic.deleteAccountMessage)
}
```

**文言** (iOS と Web で同一。DESIGN.md のトーン = 平叙・丁寧・短文、記号は既存 alert と同じ半角 `?`):

| 定数 (`SettingsLogic`) | 値 |
|---|---|
| `deleteAccountTitle` | `アカウントを削除しますか?` |
| `deleteAccountMessage` | `時間割・出欠・予定・友達などのデータはすべて直ちに削除され、元に戻せません。作成したルームは他のメンバーに引き継がれます。ルームに追加した予定と公開した時間割テンプレートは、作成者を伏せて残ります。` |
| `deletingAccountLabel` | `アカウントを削除しています` |
| `deleteAccountFailedTitle` | `アカウントを削除できませんでした` |
| `deleteAccountFailedMessage` | `通信状況を確認して、もう一度お試しください。` |

**進行表示** (実行中):

```swift
ScrollView { ... }
    .disabled(isDeletingAccount)                    // 全行の二重押下防止
    .overlay {
        if isDeletingAccount {
            ProgressView(SettingsLogic.deletingAccountLabel)
                .padding(Space.s4)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                .accessibilityIdentifier("settings-deleting-account")
        }
    }
```

**失敗 alert**:

```swift
.alert(SettingsLogic.deleteAccountFailedTitle, isPresented: $accountDeletionFailed) {
    Button("OK", role: .cancel) {}
} message: { Text(SettingsLogic.deleteAccountFailedMessage) }
```

**State / 関数** (`SettingsView` に追加):

```swift
@Environment(\.openURL) private var openURL
@State private var isConfirmingAccountDeletion = false
@State private var isDeletingAccount = false
@State private var accountDeletionFailed = false

private func deleteAccount() async {
    guard !isDeletingAccount, !isSigningOut else { return }
    isDeletingAccount = true
    defer { isDeletingAccount = false }
    do {
        try await environment.meRepository.deleteAccount()
    } catch APIError.unauthorized {
        return            // APIClient が handleUnauthorized() 済み (= ログイン画面)。アカウントは消えていない可能性がある
    } catch {
        accountDeletionFailed = true
        return            // 何も消さない (カレンダーの書き出しも残す)
    }
    // サーバーで削除できた後だけ、signOut() と同じ後始末
    await environment.calendarSyncCoordinator.wipeExport()
    environment.authStore.completeAccountDeletion()
    environment.queryClient.removeAll()
    router.settingsPath = NavigationPath()
}
```

```swift
// Core/Networking/APIEndpoint.swift (Endpoints に追加)
static func deleteMe() -> APIEndpoint { .init(path: "/api/me", method: .delete) }

// Core/Data/MeRepository.swift
func deleteAccount() async throws { try await client.send(Endpoints.deleteMe()) }   // キャッシュは触らない (呼び出し側が removeAll)

// Core/Auth/AuthStore.swift
/// サーバー側の削除が成功した後のローカル後始末。サーバーには何も送らない (signOut と違い /api/auth/sign-out を呼ばない)
func completeAccountDeletion() {
    try? keychain.delete()
    storedToken = nil
    me = nil
    state = .signedOut
}
```

`state = .signedOut` で `RootView` がログイン画面 (`AuthView`) に切り替わる (既存の分岐)。

### 8.4 画面遷移

```
設定 ─tap「アカウントを削除」→ confirmationDialog ─「キャンセル」→ 設定 (何も起きない)
                                                 └「削除する」→ 設定 + 進行表示 ─204→ ログイン画面
                                                                          ├─401→ ログイン画面 (APIClient の既存処理)
                                                                          └─その他→ 失敗 alert →「OK」→ 設定
```

### 8.5 UI/UX チェック (汎用層 §7 の該当項目)

- **視覚階層**: 削除は「その他」の末尾 (最下段) に置き、ログアウトと同じ danger 色 (`Color.statusAbsent`)。確認は OS 標準の action sheet で、破壊ボタンは `.destructive` (赤) かつ非 primary (HIG §4)。新しい色・余白・書体は導入しない
- **タスク頻度 → 動線**: 削除は一生に 1 回のタスク → 設定の二次階層で十分 (設定タブ → スクロール → 1 タップ → 確認)。Apple 要件「見つけやすい場所」= 設定の中のアカウント関連の場所に該当
- **状態の網羅**: 確認中 / 実行中 (進行表示 + 全行 disabled) / 成功 (ログイン画面) / 401 (ログイン画面) / 失敗 (alert、データはそのまま)
- **アクセシビリティ**: 行は既存の 44pt 以上。dialog / alert / ProgressView は標準部品で Dynamic Type・VoiceOver 対応
- **dark**: 標準部品と既存トークンのみ (追加なし)
- **数値の逸脱**: なし

### 8.6 DESIGN.md / CLAUDE.md の置換

DESIGN.md に矛盾する記述は無い (設定の行は既存部品、dialog / alert / ProgressView は標準部品)。`projects/atender/CLAUDE.md` の版数履歴は**出荷時**に Leader が「build 20 = …」に置換する (本 doc は触らない)。

---

## 9. Web

### 9.1 設定「その他」(`components/settings/Settings.tsx`)

```tsx
<SettingsSection title="その他">
  <SettingsRow label="ログアウト" danger onClick={() => void signOut()} />
  {signOutError ? (/* 既存 */) : null}
  <SettingsRow
    label={deleting ? "アカウントを削除しています" : "アカウントを削除"}
    danger
    onClick={() => { if (!deleting) setConfirmDeleteOpen(true); }}
  />
  {deleteError ? (
    <p className="px-3 pb-2 text-sm text-status-absent">アカウントを削除できませんでした。通信状況を確認して、もう一度お試しください。</p>
  ) : null}
</SettingsSection>

<ConfirmDialog
  open={confirmDeleteOpen}
  title="アカウントを削除しますか?"
  body="時間割・出欠・予定・友達などのデータはすべて直ちに削除され、元に戻せません。作成したルームは他のメンバーに引き継がれます。ルームに追加した予定と公開した時間割テンプレートは、作成者を伏せて残ります。"
  confirmLabel="削除する"
  onConfirm={() => void deleteAccount()}
  onCancel={() => setConfirmDeleteOpen(false)}
/>
```

```ts
const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
const [deleting, setDeleting] = useState(false);
const [deleteError, setDeleteError] = useState(false);

async function deleteAccount() {
  if (deleting) return;
  setConfirmDeleteOpen(false);
  setDeleteError(false);
  setDeleting(true);
  try {
    await api("/api/me", { method: "DELETE" });     // body なし (Content-Type も付かない。DELETE /api/me は body を読まない)
  } catch {
    setDeleting(false);
    setDeleteError(true);
    return;
  }
  queryClient.clear();
  await navigate({ to: "/signin" });
}
```

- `window.confirm` は使わない (既存 `ConfirmDialog` = `BottomSheet`)
- 削除成功で cookie のセッションはサーバー側で消えている (HttpOnly cookie が残っても次の API は 401)。サインアウトの「失敗を握り潰さない」規約 (`Settings.tsx:31-36`) と同じく、失敗時は遷移しない

### 9.2 公開テンプレの作成者表示 (`routes/Templates.tsx`)

`by @{authorHandle(template)}` を、`authorHandle(template)` が空文字のとき **`by 退会したユーザー`** (`@` なし) にする。それ以外は不変。iOS の `TemplateLogic.authorHandle` は画面から参照されていない (grep 済) ので触らない。

---

## 10. 法務ページ (静的 HTML 3 枚) + nginx

### 10.1 配置と URL

| ファイル | URL | Content-Type |
|---|---|---|
| `apps/web/public/privacy.html` | `https://atender.appily.run/privacy` | `text/html; charset=utf-8` |
| `apps/web/public/terms.html` | `https://atender.appily.run/terms` | 〃 |
| `apps/web/public/support.html` | `https://atender.appily.run/support` | 〃 |

Vite は `public/` をそのまま `dist/` に出し、Dockerfile がそれを nginx に載せる (既存)。

### 10.2 `apps/web/nginx.conf` の差分

```diff
 server {
   listen 80;
   server_name _;
   root /usr/share/nginx/html;
   index index.html;
+  charset utf-8;
+  absolute_redirect off;

   gzip on;
   gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss image/svg+xml;

+  location ~ ^/(privacy|terms|support)/$ {
+    return 301 /$1;
+  }
+
   location / {
-    try_files $uri /index.html;
+    try_files $uri $uri.html /index.html;
   }
 }
```

Architect 実測 (`nginx:alpine` に上の設定 + ダミー `index.html` / `privacy.html` / `terms.html`): `/privacy` → 200 `text/html` で privacy.html、`/privacy.html` → 200 同、`/privacy/` → 301 `Location: /privacy`、`/templates` `/settings` `/` → SPA の index.html。
- `absolute_redirect off` が無いと `Location: http://localhost/privacy` (コンテナ内の http・ポートで絶対 URL を作る) になった → Cloudflare 経由で http に飛ばされるので付ける
- `$uri.html` は SPA のルート名と `public/*.html` の名前が衝突しない前提。現状の `public/` に `.html` は無く、TanStack のルート (`/templates` `/settings` 等) に `privacy` `terms` `support` は無い (grep 済)

### 10.3 共通テンプレート (3 枚とも同じ head / header / footer、外部依存なし)

`{{TITLE}}` `{{H1}}` `{{CURRENT}}` (privacy | terms | support) `{{BODY}}` を §10.4〜10.6 で置換する。`2026-10-XX` は **Developer が実装日 (JST) を入れ、Leader がデプロイ日と違えばデプロイ時に置換**する (§16.2)。

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>{{TITLE}} | Atender</title>
  <link rel="icon" href="/favicon.ico">
  <style>
    :root { color-scheme: light dark; --bg: #F7F8FA; --surface: #FFFFFF; --text: #0F172A; --text-2: rgba(15, 23, 42, 0.72); --border: rgba(15, 23, 42, 0.08); --link: #0F6399; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #0B0E14; --surface: #1A1F2A; --text: #F5F6F8; --text-2: rgba(245, 246, 248, 0.72); --border: rgba(255, 255, 255, 0.12); --link: #63BEF5; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif; line-height: 1.85; overflow-wrap: anywhere; }
    main { max-width: 760px; margin: 0 auto; padding: 32px 20px 56px; }
    .brand { display: inline-block; margin-bottom: 8px; }
    .brand img { display: block; width: 140px; height: auto; }
    h1 { font-size: clamp(1.5rem, 5vw, 1.875rem); line-height: 1.4; margin: 16px 0 4px; }
    h2 { font-size: 1.15rem; margin: 2rem 0 0.5rem; }
    h3 { font-size: 1rem; margin: 1.25rem 0 0.25rem; }
    p, li { font-size: 1rem; }
    ul, ol { padding-left: 1.4rem; }
    li + li { margin-top: 0.4rem; }
    a { color: var(--link); text-underline-offset: 0.2em; }
    a:focus-visible { outline: 2px solid var(--link); outline-offset: 3px; border-radius: 4px; }
    .date, footer { color: var(--text-2); font-size: 0.9rem; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 16px 20px; margin: 1rem 0; }
    footer { border-top: 1px solid var(--border); margin-top: 2.5rem; padding-top: 1.25rem; }
    footer nav { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; }
  </style>
</head>
<body>
<main>
<header>
  <a class="brand" href="https://atender.appily.run/" aria-label="Atender">
    <picture>
      <source srcset="/wordmark-white.png" media="(prefers-color-scheme: dark)">
      <img src="/wordmark-navy.png" alt="Atender" width="140" height="31">
    </picture>
  </a>
  <h1>{{H1}}</h1>
  <p class="date">制定日：<time datetime="2026-10-XX">2026-10-XX</time></p>
</header>
{{BODY}}
<footer>
  <nav aria-label="関連ページ">
    <a href="/privacy"{{privacy なら aria-current="page"}}>プライバシーポリシー</a>
    <a href="/terms"{{terms なら aria-current="page"}}>利用規約</a>
    <a href="/support"{{support なら aria-current="page"}}>サポート</a>
  </nav>
  <p>Atender 運営者</p>
</footer>
</main>
</body>
</html>
```

- 色は `styles.css` のトークン値 (light: `--color-bg-base` / `--color-bg-elevated` / `--color-text-primary` / `--color-text-secondary` / `--color-border-subtle`、dark: 同名の dark 値 + `--color-border-default`)。外部フォントは読まない (Web 本体の Inter / Noto Sans JP は Google Fonts 依存なので、法務ページは system font)
- **逸脱 1 件**: リンク色はブリーフ「dark は中立色のみ」から外れて dark でも差し替える。light の `--color-accent-700` `#0F6399` は light 背景で 6.05:1 だが dark 背景では 3.00:1 (本文 4.5:1 未達)。dark は `--color-accent-600` の dark 値 `#63BEF5` (9.40:1)。本文 / 副次文字は light 16.8:1 / 6.92:1、dark 17.9:1 / 9.40:1 (Architect が WCAG 式で計算)
- ワードマークは 877×196 の PNG を 140×31 で表示

### 10.4 プライバシーポリシー本文 (`{{TITLE}}` = `{{H1}}` = `プライバシーポリシー`)

```html
<p>Atender 運営者（個人。以下「運営者」）は、時間割・出欠管理サービス「Atender」（iOSアプリおよびWeb版 <a href="https://atender.appily.run/">atender.appily.run</a>。以下「本サービス」）で取り扱う個人情報について、個人情報の保護に関する法律その他の関係法令を遵守し、以下のとおり取り扱います。</p>

<h2>1. 事業者・お問い合わせ先</h2>
<p>事業者：Atender 運営者（個人）<br>お問い合わせ：<a href="mailto:touri.development@gmail.com">touri.development@gmail.com</a></p>

<h2>2. 取得する情報</h2>
<ul>
<li><strong>アカウント情報：</strong>メールアドレス、名前（表示名）、プロフィール画像のURL、ユーザーID、ハンドル（@から始まるID）、友達招待用のコード、登録日時。AppleまたはGoogleでサインインした場合は、各サービスのユーザー識別子を保存します。</li>
<li><strong>認証情報：</strong>ログインを維持するためのセッショントークンと有効期限、ログイン時のIPアドレスとユーザーエージェント（端末・ブラウザの種類）。Appleでサインインした場合はApple連携の解除に使うトークンを保存します。Web版でGoogleを使ってサインインした場合やGoogleカレンダーと連携した場合は、Googleから受け取るアクセストークンとリフレッシュトークンを保存します。</li>
<li><strong>学校と学習の情報：</strong>学校、学科、必要出席率、学期、時間割（時限、科目、教員名、教室、メモ）、出欠の記録（メモを含む）、出欠ルール、休講、授業変更。</li>
<li><strong>予定：</strong>本サービスで登録した個人の予定（タイトル、日時、場所、メモ、繰り返し）。</li>
<li><strong>iPhoneのカレンダーから読み込んだ予定：</strong>iOSアプリでカレンダーへのアクセスを許可し、読み込むカレンダーを選んだ場合、そのカレンダーにある予定のタイトル、場所、開始・終了日時、予定の識別子をサーバーに送信して保存します。読み込むカレンダーはiOSアプリの設定から変更できます。授業や予定をiPhoneの「Atender」カレンダーへ書き出す機能は端末内で動作します。</li>
<li><strong>取り込んだカレンダー：</strong>ICSファイルまたはURLから取り込んだカレンダーの本文、取り込み元のファイル名・URL、予定タイトルの置き換えルール。</li>
<li><strong>Googleカレンダー連携（Web版で連携した場合のみ）：</strong>連携したGoogleアカウントのメールアドレス、選んだカレンダーの名前とタイムゾーン、そのカレンダーから読み取った予定。Googleカレンダーへのアクセスは読み取り専用です。</li>
<li><strong>友達とルーム：</strong>友達申請・承認の状態、参加しているルーム、ルームに追加した予定、ルームへの個人カレンダーの共有設定。</li>
<li><strong>公開した時間割テンプレート：</strong>タイトル、説明、学年、学期、時限・科目・授業の構成。</li>
<li><strong>お問い合わせ：</strong>メールアドレスとお問い合わせの内容。</li>
<li><strong>カメラ：</strong>招待用QRコードの読み取りに使います。映像は端末内で処理し、保存も送信もしません。</li>
</ul>

<h2>3. 利用目的</h2>
<p>本人認証とアカウントの管理、時間割・出欠・出席率・予定の表示と端末間の同期、友達やルームでの共有、時間割テンプレートの検索とコピー、ログイン用メールの送信、お問い合わせへの対応、不正利用の防止、障害の調査とサービスの安定運用のために利用します。広告やマーケティングには利用しません。</p>

<h2>4. 他の利用者への表示</h2>
<ul>
<li>友達やルームのメンバーには、あなたの名前、ハンドル、プロフィール画像が表示されます。</li>
<li>ルームで「メンバーの時間割を表示」が有効な場合、そのルームのメンバーにあなたの時間割が表示されます。ルームに個人カレンダーを共有した場合は、選んだ表示方法（そのまま表示する、タイトルを置き換える、「予定あり」とだけ表示する）で予定が表示されます。</li>
<li>公開した時間割テンプレートは、同じ学校・学科を選んだ本サービスのすべての利用者が検索・閲覧・コピーできます。</li>
</ul>

<h2>5. 第三者提供と外部サービス</h2>
<p>次の外部サービスの利用と法令に基づく場合を除き、個人情報を第三者に提供しません。個人情報の販売は行いません。広告SDKやアクセス解析SDKは使用せず、広告を目的とした追跡や、他社のアプリ・Webサイトを横断するトラッキングは行いません。</p>
<ul>
<li><strong>Apple：</strong>Sign in with Appleによる認証と連携の解除に利用します。</li>
<li><strong>Google：</strong>Googleでのサインインと、Web版で連携した場合のGoogleカレンダーの読み取りに利用します。プロフィール画像がGoogleのサーバーにある場合、画像を表示するときに端末からGoogleのサーバーへ取得のリクエストが送られます。Web版は表示用の書体をGoogle Fontsから読み込みます。</li>
<li><strong>Resend：</strong>ログイン用メール（メールアドレスでのログイン）の送信に利用し、宛先のメールアドレスを送信します。</li>
<li><strong>Cloudflare：</strong>本サービスへの通信を中継するため、接続元のIPアドレスなど通信に関する情報を取り扱います。</li>
<li><strong>カレンダーの取り込み元：</strong>ICSのURLを登録した場合、カレンダーを取得するために本サービスのサーバーからそのURLへアクセスします。</li>
</ul>
<p>これらの外部サービスは、米国その他の日本国外の設備で情報を処理する場合があります。</p>

<h2>6. 保存場所と保存期間</h2>
<p>データは日本国内で運営者が管理するサーバーに保存し、アカウントがある間保存します。障害復旧のためのバックアップには、削除後も一定期間データが残ることがあります。お問い合わせの記録は、対応が終わった後、必要な確認が済むまで保存します。</p>

<h2>7. アカウントの削除</h2>
<p>iOSアプリまたはWeb版の「設定 → その他 → アカウントを削除」から、いつでもアカウントを削除できます。削除はすぐに完了し、元に戻すことはできません。アプリを削除（アンインストール）しただけでは、アカウントは削除されません。</p>
<ul>
<li>削除すると、アカウント、時間割、出欠の記録、予定、iPhoneから読み込んだ予定、取り込んだカレンダー、Googleカレンダー連携、友達関係、ルームへの参加情報、ログイン情報を直ちに削除します。</li>
<li>保存しているAppleとGoogleのトークンについては、各社に連携の解除（トークンの失効）を依頼します。</li>
<li>あなたが作成したルームは、最も早く参加したメンバーに管理者を引き継ぎます。ほかにメンバーがいない場合は、ルームごと削除します。</li>
<li>他の利用者が引き続き使う次の情報は、作成者との紐付けを外して残します：ルームに追加した予定（自分で入力したもの、ICSから取り込んだもの）、公開した時間割テンプレート、あなたが追加した学校名・学科名。ルームに共有していた個人の予定とGoogleカレンダーの予定は削除します。</li>
<li>障害復旧のためのバックアップには、6のとおり一定期間データが残ることがあります。</li>
</ul>
<p>アプリ内で削除できない場合は、お問い合わせ先までご連絡ください。</p>

<h2>8. 利用者の権利</h2>
<p>名前、ハンドル、時間割などはアプリ内でいつでも変更・削除できます。保有個人データの開示、訂正・追加・削除、利用停止・消去、第三者提供の停止を希望される場合は、お問い合わせ先までご連絡ください。ご本人であることを確認したうえで、法令に従って対応します。</p>

<h2>9. Cookieと端末内の保存</h2>
<p>Web版はログインを維持するためにCookieを使用します。広告や解析を目的としたCookieは使用しません。Web版は表示テーマなどの設定をブラウザ内に保存します。iOSアプリはログイン用のトークンを端末のキーチェーンに、表示やカレンダー同期の設定を端末内に保存します。</p>

<h2>10. 安全管理</h2>
<p>通信の暗号化（HTTPS）、ログイン状態とルームの参加状況に基づくアクセス制御、認証に使う秘密情報の管理を行い、必要に応じて見直します。</p>

<h2>11. 未成年の方の利用</h2>
<p>本サービスは学生を主な対象としています。未成年の方は、保護者の同意を得たうえでご利用ください。</p>

<h2>12. 改定</h2>
<p>サービスの内容や法令の変更に応じて本ポリシーを改定することがあります。改定した場合は、改定内容と適用日を本ページでお知らせし、重要な変更はアプリ内でもお知らせします。</p>
```

### 10.5 利用規約本文 (`{{TITLE}}` = `{{H1}}` = `利用規約`)

```html
<p>この利用規約（以下「本規約」）は、Atender 運営者（個人。以下「運営者」）が提供する時間割・出欠管理サービス「Atender」（iOSアプリおよびWeb版。以下「本サービス」）の利用条件を定めるものです。利用者は、本規約に同意したうえで本サービスを利用するものとします。</p>

<h2>1. 利用資格とアカウント</h2>
<p>本サービスは13歳以上の方の利用を想定しています。未成年の方は、保護者の同意を得たうえでご利用ください。利用者は、Apple、Google、またはメールアドレスでサインインし、ご自身のアカウントを適切に管理するものとします。アカウントの貸与・譲渡や、他人のアカウントの利用はできません。</p>

<h2>2. 本サービスの内容</h2>
<p>本サービスは、時間割の登録、出欠の記録と出席率の計算、予定とカレンダーの管理、友達やルームでの予定の共有、時間割テンプレートの公開とコピーの機能を無料で提供します。</p>

<h2>3. 出席率の表示について</h2>
<p>本サービスが表示する出席率、残りの欠席できる回数などは、利用者が入力した時間割・出欠・設定に基づく目安です。学校の公式な記録や判定に代わるものではありません。単位や進級に関わる判断は、必ず学校の公式な情報で確認してください。</p>

<h2>4. 禁止事項</h2>
<ul>
<li>他の利用者の時間割、予定、その他の情報を、本人の許可なく公開・転載すること</li>
<li>なりすまし、虚偽の情報の登録、他人の認証情報の使用</li>
<li>不正アクセス、アクセス制御の回避、本サービスの運営や設備を妨げる行為</li>
<li>自動化ツールなどによる大量のアクセスや、大量の情報収集</li>
<li>他者の著作権、プライバシーその他の権利を侵害する内容、違法な内容、嫌がらせや差別的な内容を、時間割テンプレートやルームの予定などに登録すること</li>
<li>法令または公序良俗に反する行為</li>
</ul>

<h2>5. 利用者が登録する内容</h2>
<p>利用者が公開した時間割テンプレートやルームに追加した予定について、利用者は必要な権利を持っていることを保証するものとします。利用者は、保存、表示、他の利用者によるコピーなど、本サービスの提供に必要な範囲で運営者がこれらを利用することを認めます。公開した時間割テンプレートとルームに追加した予定は、退会後も作成者との紐付けを外して残ります。運営者は、本規約に違反する内容を削除し、またはアカウントの利用を制限することがあります。</p>

<h2>6. 個人情報と退会</h2>
<p>個人情報は<a href="/privacy">プライバシーポリシー</a>に従って取り扱います。利用者は、iOSアプリまたはWeb版の「設定 → その他 → アカウントを削除」からいつでも退会できます。退会すると、アカウントとそれに紐付くデータは直ちに削除され、元に戻すことはできません。</p>

<h2>7. 免責</h2>
<p>運営者は、本サービスの完全性、正確性、継続的な利用可能性を保証するものではありません。通信環境や外部サービスの状況により、データの同期や表示に遅れや誤りが生じることがあります。利用者間または利用者と第三者との間の紛争は、当事者間で解決するものとします。ただし、本規約は、運営者の故意または重大な過失による責任や、消費者契約法その他の法令により免除できない責任を免除するものではありません。</p>

<h2>8. サービスの変更・中断・終了</h2>
<p>運営者は、保守、障害、外部サービスの停止、その他の運営上の事情により、本サービスの内容を変更し、または提供を中断・終了することがあります。重要な変更や終了は、可能な限り事前に本サービス内でお知らせします。</p>

<h2>9. 本規約の変更</h2>
<p>運営者は、必要に応じて本規約を変更することがあります。変更する場合は、変更内容と適用日を本ページでお知らせします。</p>

<h2>10. 準拠法</h2>
<p>本規約は日本法に準拠します。</p>

<h2>11. お問い合わせ</h2>
<p>運営者：Atender 運営者（個人）<br>メール：<a href="mailto:touri.development@gmail.com">touri.development@gmail.com</a></p>
```

### 10.6 サポート本文 (`{{TITLE}}` = `{{H1}}` = `サポート`)

```html
<p>Atenderの使い方、不具合、プライバシーについてのお問い合わせを受け付けています。</p>

<div class="card">
<h2 style="margin-top:0">お問い合わせ</h2>
<p><a href="mailto:touri.development@gmail.com">touri.development@gmail.com</a><br>運営者：Atender 運営者（個人）</p>
<p>通常、数日以内に返信します。不具合のご連絡には、機種、iOSとアプリのバージョン、起きた日時、操作の手順を添えてください。パスワードやログイン用のリンクを送る必要はありません。</p>
</div>

<h2>使い方</h2>
<ol>
<li>Apple、Google、またはメールアドレスでログインし、学校・学科と学期を設定します。</li>
<li>ホームの時間割の空いているマスをタップして授業を登録します。同じ学校・学科の公開テンプレートから時間割をコピーすることもできます。</li>
<li>授業のある日は、ホームで出欠をタップして記録します。</li>
<li>「学期・科目」タブで、科目ごとの出席率と、あと何回休めるかを確認できます。</li>
</ol>
<p>Web版：<a href="https://atender.appily.run/">https://atender.appily.run/</a>（iOSアプリと同じアカウントで使えます）</p>

<h2>よくある質問</h2>
<h3>ログインの方法は？</h3>
<p>Appleでサインイン、Googleでログイン、メールアドレス（届いたリンクを開いてログイン）の3つから選べます。機種変更をしても、同じ方法でログインすればデータはそのまま使えます。</p>
<h3>iPhoneのカレンダーへのアクセスはどこで変更できますか？</h3>
<p>iPhoneの「設定」アプリで「プライバシーとセキュリティ」→「カレンダー」→「Atender」を開いて変更できます。アクセスを許可すると、授業と予定を「Atender」カレンダーに書き出し、選んだカレンダーの予定をAtenderに読み込めます。iOSのバージョンによって表示が異なる場合があります。</p>
<h3>アカウントを削除するには？</h3>
<p>iOSアプリまたはWeb版の「設定」→「その他」→「アカウントを削除」から削除できます。時間割・出欠・予定・友達などのデータはすべて直ちに削除され、元に戻すことはできません。作成したルームは他のメンバーに引き継がれ、ルームに追加した予定と公開した時間割テンプレートは作成者を伏せて残ります。アプリを削除（アンインストール）しただけでは、アカウントは削除されません。詳しくは<a href="/privacy">プライバシーポリシー</a>をご覧ください。</p>
```

---

## 11. Privacy Manifest (`apps/ios/Atender/PrivacyInfo.xcprivacy`)

`project.yml` の変更は不要 (§2: XcodeGen が Resources に入れる)。中身:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSPrivacyTracking</key>
	<false/>
	<key>NSPrivacyTrackingDomains</key>
	<array/>
	<key>NSPrivacyCollectedDataTypes</key>
	<array>
		<dict>
			<key>NSPrivacyCollectedDataType</key>
			<string>NSPrivacyCollectedDataTypeEmailAddress</string>
			<key>NSPrivacyCollectedDataTypeLinked</key>
			<true/>
			<key>NSPrivacyCollectedDataTypeTracking</key>
			<false/>
			<key>NSPrivacyCollectedDataTypePurposes</key>
			<array>
				<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
			</array>
		</dict>
		<dict>
			<key>NSPrivacyCollectedDataType</key>
			<string>NSPrivacyCollectedDataTypeName</string>
			<key>NSPrivacyCollectedDataTypeLinked</key>
			<true/>
			<key>NSPrivacyCollectedDataTypeTracking</key>
			<false/>
			<key>NSPrivacyCollectedDataTypePurposes</key>
			<array>
				<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
			</array>
		</dict>
		<dict>
			<key>NSPrivacyCollectedDataType</key>
			<string>NSPrivacyCollectedDataTypeUserID</string>
			<key>NSPrivacyCollectedDataTypeLinked</key>
			<true/>
			<key>NSPrivacyCollectedDataTypeTracking</key>
			<false/>
			<key>NSPrivacyCollectedDataTypePurposes</key>
			<array>
				<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
			</array>
		</dict>
		<dict>
			<key>NSPrivacyCollectedDataType</key>
			<string>NSPrivacyCollectedDataTypeOtherUserContent</string>
			<key>NSPrivacyCollectedDataTypeLinked</key>
			<true/>
			<key>NSPrivacyCollectedDataTypeTracking</key>
			<false/>
			<key>NSPrivacyCollectedDataTypePurposes</key>
			<array>
				<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
			</array>
		</dict>
	</array>
	<key>NSPrivacyAccessedAPITypes</key>
	<array>
		<dict>
			<key>NSPrivacyAccessedAPIType</key>
			<string>NSPrivacyAccessedAPICategoryUserDefaults</string>
			<key>NSPrivacyAccessedAPITypeReasons</key>
			<array>
				<string>CA92.1</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
```

- 識別子は Apple 公式 docs の JSON エンドポイント (`developer.apple.com/tutorials/data/documentation/bundleresources/...`) から取得して照合済: 4 つの data type と `PurposeAppFunctionality`・`NSPrivacyAccessedAPICategoryUserDefaults` は実在。`CA92.1` は「アプリ自身だけがアクセスできる情報を読み書きする」(App Group 用の `1C8F.1` ではない)
- ASC の App Privacy (Web UI) はこの 4 種 (すべて「ユーザーに紐付く」「トラッキングに使わない」「アプリの機能」) と一致させる (Leader 作業、§16.2)
- GoogleSignIn 9.x は SDK 側の manifest を同梱している (SDK の分は本ファイルに書かない)

---

## 12. 版数

- `apps/ios/project.yml`: `CFBundleVersion: "20"` (`CFBundleShortVersionString: "1.0"` 不変)。`Atender/Info.plist` は `xcodegen generate` の出力をコミット (手編集禁止)
- `MIN_IOS_BUILD = 12` 据え置き: 新規エンドポイント 2 本と DTO の値 (`""`) だけで、既存クライアントが受け取る型は不変 (§7.3)。build ≤ 19 は `/api/auth-apple/exchange` を呼ばない (= Apple トークンが保存されない) だけ

---

## 13. 挙動仕様

Reviewer はここだけを根拠にテストを書く。#番号をテスト名に含める。

### 13.1 `DELETE /api/me` (#D、Vitest `apps/api/tests/b20-account-deletion.test.ts`)

共通の標本: 退会者 U (setup 完了: `createSchoolDepartment` + `createSemester` + `createTestUser({ schoolId, departmentId, defaultSemesterId })`)、他ユーザー A / B / C。cookie は `createSessionCookie(prisma, U.id)`、Bearer はその cookie 値の `=` 以降を `Authorization: Bearer <token>` で送る。fetch は `vi.spyOn(globalThis, "fetch")` で全テスト既定 `mockResolvedValue(new Response("", { status: 200 }))`、`afterEach` で restore。

- **#D1** U が Semester / UserTimetable (DaySlot・Course・Meeting・Occurrence・AttendanceRecord 込み) / PersonalEvent / IcsTitleRule / A との Friendship (U が sender) / B との Friendship (U が receiver) / Account (`providerId: "google"`、トークンなし) を持つ状態で `DELETE /api/me` (cookie) → **204、body の長さ 0**。以下が 0 行: `user{id:U}` / `session{userId:U}` / `account{userId:U}` / `semester{userId:U}` / `userTimetable{userId:U}` / `attendanceRecord{userId:U}` / `personalEvent{userId:U}` / `icsTitleRule{userId:U}` / `friendship{OR:[{senderId:U},{receiverId:U}]}`。A / B の `user` 行と A / B 自身の Semester は残る
- **#D2** (未セットアップ) `createTestUser()` だけ (school / department / defaultSemester なし) の U → 204、`user{id:U}` 0 行
- **#D3** 認証なし → 401 `UNAUTHORIZED`。`user` 行数は不変
- **#D4** (削除後の旧トークン) #D1 の後、同じ cookie で `GET /api/me` → 401。同じトークンを Bearer で `GET /api/me` → 401。同じ cookie で `DELETE /api/me` → 401
- **#D5** (Bearer で削除) Bearer だけで `DELETE /api/me` → 204
- **#D6** (OWNER 移譲) ルーム R: `createRoom({ ownerId: U })` (U の joinedAt = 2026-05-01)、`addRoomMember(A, joinedAt 2026-05-02)`、`addRoomMember(B, joinedAt 2026-05-03)`。A の MANUAL 予定 1 件 → 削除後: R が存在、`R.createdByUserId == A`、A の membership `role == OWNER`、B は `MEMBER`、R の membership は 2 行 (A, B)、A の予定は不変 (authorId == A)
- **#D7** (同時刻の移譲) R の残メンバー A / B の `joinedAt` が同じ (2026-05-02T00:00:00Z) で、membership の `id` を明示して `"m-a"` (A) / `"m-b"` (B) にする → 移譲先は A (`id` 昇順)。`id` を `"m-b"` (A) / `"m-a"` (B) に入れ替えると移譲先は B
- **#D8** (残メンバー 0) U だけのルーム R2 (R2 に U の MANUAL 予定・ICS_FILE 予定・RoomEventOverride を付ける) → R2 が消え、R2 の RoomEvent / RoomEventOverride / RoomMembership が 0 行
- **#D9** (他人のルームでの寄稿) A のルーム RA に U が MEMBER で参加、U が RA に `source: "MANUAL"` の予定 E1 と `source: "ICS_FILE"` の予定 E2 (`importId` = U の IcsImport) を作成 → 削除後: RA の U の membership は消え RA は不変 (createdByUserId == A)。E1 / E2 は存在し `authorId == null`、E2 の `importId == null` (IcsImport は U と Cascade で消える)
- **#D10** (DTO の番兵) #D9 の後、A が `GET /api/rooms/RA/events` → E1 / E2 が含まれ、`authorId === ""` (null ではない)。A が `GET /api/rooms/RA/week?weekStart=<E1 を含む週の月曜>` の `roomEvents` でも E1 の `authorId === ""`
- **#D11** (写しの削除) RA に U の `source: "PERSONAL"` (externalUid `pe:x`) の予定 E3 と `source: "GOOGLE_OAUTH"` の予定 E4 → 削除後 E3 / E4 は 0 行 (残るのは #D9 の E1 / E2 のみ)
- **#D12** (匿名化した予定は編集不可) #D9 の後、RA のオーナー A が `PATCH /api/rooms/RA/events/E1` (タイトル変更) → 403 `NOT_AUTHOR` (既存の作者限定の挙動のまま)
- **#D13** (公開テンプレの匿名化) U の公開テンプレ T1 (`isPublic: true`、DaySlot / Course / Meeting 各 1、`copyCount: 3`)、C がそれをコピーした UserTimetable (`sourceTemplateId: T1`) → 削除後: T1 が存在、`authorUserId == null`、`copyCount == 3`、TemplateDaySlot / TemplateCourse / TemplateMeeting が各 1 行、C の UserTimetable の `sourceTemplateId == T1`
- **#D14** (テンプレ DTO の番兵) #D13 の後、C が `GET /api/timetable-templates?schoolId=<T1 の school>&departmentId=<T1 の dept>` → T1 が含まれ `authorUserId === ""`。C が T1 を `PATCH` / `DELETE` → 403 `FORBIDDEN` (既存の作者限定の挙動のまま)
- **#D15** (非公開テンプレ) U の `isPublic: false` のテンプレ T2 → 削除後 T2 は 0 行 (TemplateDaySlot 等も 0)
- **#D16** (学校・学科) U が作った School / Department (`createdByUserId: U`) → 削除後も存在し `createdByUserId == null`
- **#D17** (Google revoke) U の Account `{providerId:"google", refreshToken:"g-refresh", accessToken:"g-access"}` → fetch がちょうど 1 回、URL `https://oauth2.googleapis.com/revoke`、method `POST`、`Content-Type: application/x-www-form-urlencoded`、body を `URLSearchParams` で読むと `token == "g-refresh"`。refreshToken が null で accessToken `"g-access"` だけなら `token == "g-access"`
- **#D18** (Apple revoke) Apple 設定あり (`process.env` に `APPLE_TEAM_ID="TEAM123456"`, `APPLE_KEY_ID="KEY1234567"`, `APPLE_PRIVATE_KEY=<テストで生成した P-256 の PKCS8 PEM>`, `APPLE_APP_BUNDLE_ID="net.appily.atender"`, `APPLE_CLIENT_ID="net.appily.atender.web"`)、U の Account `{providerId:"apple", accountId:"apple-sub-u", refreshToken:"a-refresh"}` → fetch が 2 回、どちらも URL `https://appleid.apple.com/auth/revoke`。form の `client_id` が 1 回目 `"net.appily.atender"`・2 回目 `"net.appily.atender.web"`、`token == "a-refresh"`、`token_type_hint == "refresh_token"`、`client_secret` は 3 セグメントの JWT で payload の `sub` がその回の `client_id`、`iss == "TEAM123456"`、`aud == "https://appleid.apple.com"`。`APPLE_CLIENT_ID` を消すと fetch は 1 回 (Bundle ID のみ)
- **#D19** (トークンなし) Apple Account のトークンが全部 null → Apple への fetch 0 回。Account が無い (Magic Link だけ) → fetch 0 回
- **#D20** (Apple 未設定) `APPLE_TEAM_ID` を消した状態で `refreshToken` のある Apple Account → Apple への fetch 0 回、204、User 0 行
- **#D21** (revoke 失敗でも完遂) fetch が `new Response("", { status: 400 })` → 204、User 0 行。fetch が `mockRejectedValue(new Error("network"))` → 204、User 0 行。いずれも `console.warn` (spy) が 1 回以上呼ばれ、その全引数を `JSON.stringify` した文字列に `"g-refresh"` / `"a-refresh"` / client_secret の JWT が**含まれない**
- **#D22** (revoke は commit 後) fetch の mock 実装の中で `prisma.user.findUnique({ where: { id: U } })` を await して記録 → 記録は `null` (revoke の時点で User は消えている)
- **#D23** (二重送信) 同じ cookie で `Promise.all([DELETE, DELETE])` → status はそれぞれ 204 か 401、少なくとも 1 つは 204、500 は無い。User 0 行。#D17 の Google Account を付けた場合、revoke の fetch は 1 回だけ
- **#D24** (tx 失敗) `vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("db"))` (`tests/helpers/app.ts` の `prisma()` が返す client) → 500 `INTERNAL`、User は残る、fetch 0 回 (revoke しない)

### 13.2 `POST /api/auth-apple/exchange` (#X、Vitest `apps/api/tests/b20-apple-authorization.test.ts`)

Apple 設定は #D18 と同じ env。U は Apple Account `{providerId:"apple", accountId:"apple-sub-u"}` (トークン null)。`jwt(payload)` = `base64url(JSON {alg:"none"})` + `.` + `base64url(JSON payload)` + `.sig`。成功応答 = `new Response(JSON.stringify({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600, id_token: jwt({ sub: "apple-sub-u" }), token_type: "Bearer" }), { status: 200, headers: { "Content-Type": "application/json" } })`。

- **#X1** body `{ authorizationCode: "code-1" }` (cookie) → 200 `{ stored: true }`。fetch 1 回: URL `https://appleid.apple.com/auth/token`、`POST`、form `client_id == "net.appily.atender"`、`grant_type == "authorization_code"`、`code == "code-1"`、`redirect_uri` キーが無い、`client_secret` の JWT payload `sub == "net.appily.atender"`。DB の Account: `refreshToken == "rt-1"`、`accessToken == "at-1"`、`accessTokenExpiresAt` が「リクエスト直前の時刻 + 3600 秒」から ±60 秒以内、`idToken == null`
- **#X2** Bearer でも #X1 と同じ結果
- **#X3** id_token の `sub` が `"someone-else"` → 200 `{ stored: false, reason: "SUBJECT_MISMATCH" }`、Account のトークンは null のまま
- **#X4** Apple が `400 {"error":"invalid_grant"}` → 200 `{ stored: false, reason: "EXCHANGE_FAILED" }`。fetch が reject → 同じ。Apple が 200 で本文が `"not json"` → 同じ
- **#X5** 応答に `refresh_token` が無い → 200 `{ stored: false, reason: "NO_REFRESH_TOKEN" }`、Account 不変
- **#X6** U が Apple Account を持たない (Google Account のみ) → 200 `{ stored: false, reason: "NO_APPLE_ACCOUNT" }`、fetch 0 回
- **#X7** `APPLE_PRIVATE_KEY` を消す → 200 `{ stored: false, reason: "NOT_CONFIGURED" }`、fetch 0 回
- **#X8** body `{}` / `{ authorizationCode: "" }` → 400 `VALIDATION_ERROR`、fetch 0 回。認証なし → 401。(非 JSON body は共有 `zValidator` の既存挙動で全ルート 500 `INTERNAL` になる — Reviewer 実測 2026-10-09。本 doc の対象外、iOS クライアントは常に JSON を送る)
- **#X9** (未セットアップでも可) school / department / defaultSemester の無い U → #X1 と同じく `{ stored: true }`
- **#X10** (2 回目の交換で上書き) #X1 の後に `refresh_token: "rt-2"` を返す mock で再度 → `{ stored: true }`、`refreshToken == "rt-2"`
- (番号なし・テストしない) better-auth の idToken 再サインインで保存済みの refresh token が上書きされないことは、§2 の実コード確認 (`freshTokens` の `undefined` 除外) で担保し、実機ゲート #G4 で確認する
- **#X12** (ログ) #X4 のとき `console.warn` の全引数の `JSON.stringify` に `"code-1"` / client_secret が含まれない
- **#X13** (ルーティング) `POST /api/auth-apple/exchange` の応答が better-auth のハンドラでない (JSON に `stored` キーがある)

### 13.3 純関数 (#U、同じ `b20-apple-authorization.test.ts`)

- **#U1** `decodeJwtSubject(jwt({ sub: "abc" })) === "abc"`。`"a.b"` (2 セグメント) → null。payload が JSON でない → null。`sub` が数値 → null。`undefined` / `123` → null
- **#U2** `readAppleCredentialsConfig({ APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: "P", APPLE_APP_BUNDLE_ID: "B" })` → `{ teamId: "T", keyId: "K", privateKeyPem: "P", bundleId: "B", servicesId: null }`。`APPLE_CLIENT_ID: "S"` を足すと `servicesId: "S"`。4 つのどれかが無い or `""` → null
- **#U3** `collectRevocableTokens(U)`: google `{refresh:"r", access:"a"}` → `[{provider:"google", token:"r", tokenTypeHint:"refresh_token"}]`。google `{refresh:null, access:"a"}` → `access_token` で `"a"`。apple 全 null → 出さない。`providerId: "magic-link"` の行 → 出さない。refresh が `""` → access にフォールバック

### 13.4 migration (#M、Vitest `apps/api/tests/b20-author-set-null-migration.test.ts`)

- **#M1** テスト DB (= 全 migration 適用済み) で `PRAGMA table_info("TimetableTemplate")` の `authorUserId` が `notnull = 0`、`PRAGMA table_info("RoomEvent")` の `authorId` が `notnull = 0`
- **#M2** `PRAGMA foreign_key_list("TimetableTemplate")` の `authorUserId` 行の `on_delete == "SET NULL"`、`RoomEvent` の `authorId` 行も `"SET NULL"`。`RoomEvent.roomId` は `"CASCADE"` のまま、`TimetableTemplate.schoolId` / `departmentId` も `"CASCADE"` のまま
- **#M3** (既存データの保全) 一時ディレクトリに `prisma/schema.prisma` と、`prisma/migrations` から本 migration **以外**を複製 → `npx prisma migrate deploy --schema=<tmp>/schema.prisma` (env `DATABASE_URL=file:<tmp>/m.db`) → better-sqlite3 で User 2 / School 1 / Department 1 / TimetableTemplate 1 (+ TemplateDaySlot・TemplateCourse・TemplateMeeting 各 1) / UserTimetable 1 (`sourceTemplateId` = そのテンプレ、Semester 込み) / Room 1 / RoomEvent 1 (+ RoomEventOverride 1) を INSERT → 本 migration のフォルダも複製して再度 `migrate deploy` → 上記の全行数が不変、`UserTimetable.sourceTemplateId` が不変、`PRAGMA foreign_key_check` が 0 行。**負のコントロール (Reviewer の自己確認)**: 同じ手順で 2 回目を `migrate deploy` でなく、migration.sql から `PRAGMA foreign_keys=OFF;` の行を除いたものを `PRAGMA foreign_keys=ON` の better-sqlite3 で `exec` すると TemplateDaySlot / TemplateCourse / TemplateMeeting / RoomEventOverride が 0 行・`sourceTemplateId` が null になる (Architect 実測で確認済み。テストとしては残さない)

### 13.5 iOS ユニット (#I、XCTest `apps/ios/AtenderTests/B20AccountDeletionTests.swift`)

AuthStore / APIClient は既存の `StubURLProtocol` (`APIClientTests.swift`) + `StubURLProtocol.makeSession()`。リクエストを全部記録するときは `handler` の中で配列に append する。

- **#I1** `AppleSignIn.authorizationCodeString(from: "abc".data(using: .utf8))` == `"abc"`。`nil` → nil。`Data()` → nil。`Data([0xFF, 0xFE])` → nil
- **#I2** `AppleSignInCredential(identityToken: "t", authorizationCode: nil)` が `Equatable` で同値比較できる
- **#I3** `signInWithApple(idToken: "apple_id_token", authorizationCode: "code-1")`: stub は path で分岐 (`/api/auth/sign-in/social` → 200 + `set-auth-token: apple_session_token`、`/api/me` → 既存テストと同じ MeResponse、`/api/auth-apple/exchange` → 200 `{"stored":true}`) → 記録されたリクエストの path の並びが `["/api/auth/sign-in/social", "/api/me", "/api/auth-apple/exchange"]`。exchange は `POST`、`Authorization: Bearer apple_session_token`、`Content-Type: application/json`、body JSON `{"authorizationCode":"code-1"}` (キーはこの 1 つだけ)。sign-in の body に `authorizationCode` キーが**無い**。`state == .signedIn`
- **#I4** exchange だけ 500 を返す → `signInWithApple` は throw しない、`state == .signedIn`、Keychain に `apple_session_token`。exchange だけ 401 → 同じ (トークンは消えない)
- **#I5** `authorizationCode: nil` (既定値) / `""` → exchange のリクエストが記録されない。既存 `AuthStoreCallbackTests` の Apple 2 件は無変更で緑
- **#I6** `Endpoints.deleteMe()` の `path == "/api/me"`、`method == .delete`、`body == nil`、`requiresAuth == true`
- **#I7** `MeRepository.deleteAccount()` (APIClient + 実 AuthStore、Keychain に token): stub 204 → throw しない、リクエストは `DELETE`、path `/api/me`、`Authorization: Bearer <token>`、`httpBody == nil`。stub 500 `{"error":{"code":"INTERNAL","message":"x"}}` → `APIError.api(status: 500, code: "INTERNAL", message: "x")` を throw。stub 401 → `APIError.unauthorized` を throw し `authStore.state == .signedOut` (既存の APIClient の挙動)
- **#I8** `AuthStore.completeAccountDeletion()`: Keychain に token がある状態で呼ぶ → `state == .signedOut`、`token == nil`、`me == nil`、`try keychain.load()` が nil。リクエストは 1 本も記録されない (サインアウト API を呼ばない)
- **#I9** `LegalLinks.privacy.absoluteString == "https://atender.appily.run/privacy"`、`terms` → `.../terms`、`support` → `.../support`
- **#I10** `SettingsLogic.deleteAccountTitle` / `deleteAccountMessage` / `deletingAccountLabel` / `deleteAccountFailedTitle` / `deleteAccountFailedMessage` が §8.3 の表の文字列と完全一致

### 13.6 Privacy Manifest (#P、XCTest `apps/ios/AtenderTests/B20PrivacyManifestTests.swift`)

- **#P1** リポジトリの `apps/ios/Atender/PrivacyInfo.xcprivacy` を `PropertyListSerialization` で読める (dict)。`NSPrivacyTracking == false`、`NSPrivacyTrackingDomains` は空配列
- **#P2** `NSPrivacyCollectedDataTypes` の `NSPrivacyCollectedDataType` の集合 == `{EmailAddress, Name, UserID, OtherUserContent}` (完全一致、接頭辞 `NSPrivacyCollectedDataType` 付き)。4 件とも `Linked == true`、`Tracking == false`、`Purposes == ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]`
- **#P3** `NSPrivacyAccessedAPITypes` が 1 件で、`NSPrivacyAccessedAPIType == "NSPrivacyAccessedAPICategoryUserDefaults"`、`NSPrivacyAccessedAPITypeReasons == ["CA92.1"]`
- **#P4** ビルドされたアプリに同梱されている: ホストアプリの `Bundle.main.url(forResource: "PrivacyInfo", withExtension: "xcprivacy")` が nil でない

### 13.7 版数 (#V)

- **#V1** `apps/ios/project.yml` が `CFBundleVersion: "20"` を含み `"19"` を含まない。`CFBundleShortVersionString: "1.0"` 不変
- **#V2** `MIN_IOS_BUILD (= 12) <= 20` (既存テストの維持)
- **#V3** `Atender/Info.plist` の `CFBundleVersion == "20"` (`xcodegen generate` の出力)

### 13.8 iOS UI (#S、XCUITest `apps/ios/AtenderUITests/B20AccountDeletionUITests.swift`。API `localhost:8787` + **毎回 seed 直後**)

seed (§15.4) の削除検証ユーザー: token `demo-bearer-token-ios-delete-0003`。

- **#S1** (キャンセル) token 注入で起動 → タブ `設定` → `settings-row-delete-account` までスクロールしてタップ → `app.buttons["削除する"]` と `app.buttons["キャンセル"]` が 5 秒以内に出る、staticText `アカウントを削除しますか?` がある → `キャンセル` → `settings-row-delete-account` が存在し、staticText `下記のアカウントを使用してログイン` は無い
- **#S2** (削除) 同じ手順 → `削除する` → staticText `下記のアカウントを使用してログイン` が 15 秒以内に出る → `app.terminate()` → **同じ token を注入して**再起動 → 15 秒以内にログイン画面 (`下記のアカウントを使用してログイン`) が出て、タブバーが出ない (トークンが 401 になった)
- **#S3** (リンク) `settings-row-privacy` をタップ → `XCUIApplication(bundleIdentifier: "com.apple.mobilesafari").wait(for: .runningForeground, timeout: 15)` が true
- **#S4** (既存の不変) `B18HomeRoomsUITests` 9 本 / `B19SemesterRolloverUITests` 4 本は緑のまま (seed の追加ユーザーは他ユーザーのルーム・友達に関与しない)

### 13.9 Web (#W、Vitest + RTL + msw。`apps/web/tests/routes/SettingsDeleteAccount.test.tsx`)

`renderApp({ initialPath: "/settings" })` (`tests/utils/render`)、msw (`tests/msw/server`) に `http.delete(\`${API_URL}/api/me\`, ...)` を足す。

- **#W1** ボタン (role `button`) `アカウントを削除` がある
- **#W2** タップ → 見出し `アカウントを削除しますか?` と §9.1 の本文、ボタン `削除する` / `キャンセル` → `キャンセル` → ダイアログが消え、DELETE は 0 回
- **#W3** `削除する` → DELETE `/api/me` が 1 回 (request body なし) → 204 → サインイン画面 (`/signin` のルート) に遷移する
- **#W4** DELETE が 500 → `アカウントを削除できませんでした。通信状況を確認して、もう一度お試しください。` が表示され、`/settings` に留まる
- **#W5** (`tests/routes/Templates.test.tsx` 等、既存の Templates テストの流儀) `authorUserId: ""` のテンプレは `by 退会したユーザー`、`authorUserId: "u1"` は従来どおり `by @u1`

### 13.10 法務ページ (#L)

Vitest (`apps/web/tests/legal/legal-pages.test.ts`、`node:fs` で `apps/web/public/*.html` を読む):

- **#L1** 3 ファイルとも存在し、`<html lang="ja">`、`<meta charset="utf-8">`、`<meta name="viewport" content="width=device-width, initial-scale=1">`、`<title>` がそれぞれ `プライバシーポリシー | Atender` / `利用規約 | Atender` / `サポート | Atender`
- **#L2** 外部依存なし: `src=` / `href=` / `srcset=` の値はすべて `/` 始まり・`https://atender.appily.run/` 始まり・`mailto:` 始まりのいずれか (`<link rel="stylesheet">` と `<script` が無い)
- **#L3** 3 ファイルとも `touri.development@gmail.com` への `mailto:` リンクを含む。footer に `/privacy` `/terms` `/support` の 3 リンクがあり、自分のページのリンクだけ `aria-current="page"`
- **#L4** privacy.html が次の文字列をすべて含む: `Atender 運営者` / `iPhoneのカレンダーから読み込んだ予定` / `サーバーに送信して保存します` / `IPアドレス` / `Resend` / `Cloudflare` / `Google Fonts` / `日本国内` / `一定期間データが残ることがあります` / `設定 → その他 → アカウントを削除` / `作成者との紐付けを外して残します` / `トラッキングは行いません` / `Cookie`
- **#L5** terms.html が `日本法` / `学校の公式な記録や判定に代わるものではありません` / `/privacy` を含む。support.html が `アカウントを削除` / `プライバシーとセキュリティ` / `https://atender.appily.run/` を含む
- **#L6** `制定日` の `<time datetime="...">` が `YYYY-MM-DD` 形式 (`2026-10-XX` のまま残っていない。Developer が日付を入れる)

nginx (シェル。Reviewer が実行、Docker の `nginx:alpine`)。`public/` には SPA の `index.html` が無い (vite build が作る) ので、一時ディレクトリに `public/` を複製し、目印入りのダミー `index.html` を足して載せる:

```sh
T=$(mktemp -d) ; cp -R apps/web/public/. "$T/" ; echo '<html>SPA-MARKER</html>' > "$T/index.html"
docker run -d --rm --name atender-b20-ngx -p 18089:80 \
  -v "$T:/usr/share/nginx/html:ro" \
  -v "$PWD/apps/web/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine
```

- **#L7** `/privacy` `/terms` `/support` → 200、`Content-Type` が `text/html; charset=utf-8`、本文がそれぞれのファイル (`<title>` で判定)
- **#L8** `/privacy/` `/terms/` `/support/` → 301、`Location` がそれぞれ `/privacy` `/terms` `/support` (相対。`http://` で始まらない)
- **#L9** `/settings` `/templates` `/` → 200 で本文が `SPA-MARKER` (SPA のルートを壊していない)。`/privacy.html` → 200 で privacy.html。本番デプロイ後に Leader が `curl https://atender.appily.run/settings` で SPA の HTML が返ることも確認する (§16.2)

---

## 14. テスト基盤

### 14.1 API (Vitest)

- 実行: `cd apps/api ; pnpm exec vitest run` (失敗集合は台帳の既知 16 と**集合一致**)。新規 3 ファイル (`b20-account-deletion.test.ts` / `b20-apple-authorization.test.ts` / `b20-author-set-null-migration.test.ts`)
- **app の export path**: `tests/helpers/app.ts` が `export { app } from "../../src/index"` (`src/index.ts` の `export const app = new Hono()`。`serve()` は `invokedDirectly` のときだけ呼ばれるのでテストからの import では listen しない)。テストは `app.request(path, init)` か `tests/helpers/http.ts` の `requestJson(app, path, init)`
- **DB**: `tests/setup.ts` が `beforeEach` で `createTestDb()` (`tests/helpers/db.ts`: `npx prisma migrate deploy` で作った template.db を毎回コピー = **本 migration も自動で入る**) + `enableForeignKeys()`。Prisma client は `tests/helpers/app.ts` の `prisma()` (= `getPrisma()`)
- helpers: `tests/helpers/auth.ts` (`createTestUser` / `createSessionCookie` / `createSchoolDepartment` / `createSemester` / `createUserTimetable` / `setupCompleteUser` / `createOccurrence`)、`tests/helpers/seedRoom.ts` (`createRoom` / `addRoomMember` / `createRoomEvent` — `source` / `importId` / membership の `id` を指定するときは `prisma().roomEvent.create` / `prisma().roomMembership.create` を直接使う)
- fetch: `vi.spyOn(globalThis, "fetch")`。`afterEach(() => vi.restoreAllMocks())`。Apple env は `auth-apple.test.ts` と同じく `process.env` を保存 → テスト内で設定 → `afterEach` で戻す (`readAppleCredentialsConfig` は呼び出し時に読むので `resetAuth` は不要)。P-256 鍵は `generateKeyPairSync("ec", { namedCurve: "P-256" })` → `privateKey.export({ type: "pkcs8", format: "pem" })`
- 型: `cd apps/api ; pnpm exec tsc --noEmit -p tsconfig.json` が 0 エラー (Developer の完了条件)

### 14.2 iOS (XCTest / XCUITest)

- ユニット: `AtenderTests`。ベースライン **700 / 0 fail** (台帳 iOS 節、build 19)。実行は `/opt/homebrew/bin/xcodegen generate` → `xcodebuild test -project Atender.xcodeproj -scheme Atender -destination 'platform=iOS Simulator,id=<UDID>'` (`name=...,OS=18.2` が解決できない環境あり — CLAUDE.md)。`StubURLProtocol` は `APIClientTests.swift` 定義を再利用。`AuthStore(keychain: KeychainStore(), session: StubURLProtocol.makeSession())`、`APIClient(session: StubURLProtocol.makeSession(), authStore:)`、`MeRepository(client:cache: QueryClient())`
- UI: `AtenderUITests` (scheme `AtenderUITests`)。`localhost:8787` の API (`pnpm exec tsx watch --env-file=.env src/index.ts`) + **直前に `pnpm exec tsx --env-file=.env scripts/seed-demo-user.ts`** (#S2 が削除検証ユーザーを消すので、再実行前に seed し直す)。`launchEnvironment["ATENDER_UI_TEST_BEARER_TOKEN"]`
- chrome-devtools MCP は使わない

### 14.3 Web (Vitest + RTL + msw)

- 実行: `cd apps/web ; pnpm exec vitest run` (失敗集合は台帳の既知 26 と集合一致)。新規 `tests/routes/SettingsDeleteAccount.test.tsx` / `tests/legal/legal-pages.test.ts` (+ #W5 は既存 Templates テストに追加 or 新規 `tests/routes/TemplatesAuthor.test.tsx`)
- `renderApp` (`tests/utils/render`)、msw `server.use(...)` (`tests/msw/server`)、`API_URL` (`tests/msw/handlers`)

---

## 15. 実装ファイル一覧

### 15.1 新規

| ファイル | 内容 |
|---|---|
| `apps/api/prisma/migrations/<ts>_b20_author_set_null/migration.sql` | §7.2 |
| `apps/api/src/services/accountDeletion.service.ts` | `deleteAccount` / `deleteUserData` / `AccountDeletionSummary` (§4) |
| `apps/api/src/services/appleAuthorization.service.ts` | §5.4 の全 export |
| `apps/api/src/services/tokenRevocation.service.ts` | §6.1 の全 export |
| `apps/api/src/routes/authApple.ts` | `registerAuthAppleRoutes` (§5.2) |
| `apps/ios/Atender/Features/Settings/LegalLinks.swift` | §8.2 |
| `apps/ios/Atender/PrivacyInfo.xcprivacy` | §11 |
| `apps/web/public/privacy.html` / `terms.html` / `support.html` | §10.3〜10.6 |
| テスト 9 ファイル | §13 (Reviewer) |

```ts
// apps/api/src/services/accountDeletion.service.ts
export type AccountDeletionSummary = {
  deleted: boolean;              // User 行を消したら true (二重送信の 2 本目が先に消していたら false)
  transferredRoomIds: string[];  // id 昇順
  deletedRoomIds: string[];      // id 昇順
  revocations: RevokeOutcome[];
};
export async function deleteUserData(userId: string): Promise<Omit<AccountDeletionSummary, "revocations">>;
export async function deleteAccount(userId: string): Promise<AccountDeletionSummary>;
```

### 15.2 変更

| ファイル | 変更 |
|---|---|
| `apps/api/prisma/schema.prisma` | §7.1 の 2 箇所 |
| `apps/api/src/routes/me.ts` | `DELETE /api/me` (§4.1) |
| `apps/api/src/index.ts` | `registerAuthAppleRoutes(app)` を `registerAuthRoutes(app)` の直後に |
| `apps/api/src/lib/dto.ts` | `DELETED_AUTHOR_ID` + `templateDto` (§7.3) |
| `apps/api/src/services/room.service.ts` | `eventDto` (§7.3) |
| `apps/api/src/services/recurrence.service.ts` | `:86` (§7.3) |
| `apps/api/scripts/seed-demo-user.ts` | §15.4 |
| `apps/ios/Atender/Core/Auth/AppleSignIn.swift` | §8.1 |
| `apps/ios/Atender/Core/Auth/AuthStore.swift` | `signInWithApple(idToken:authorizationCode:)` / `completeAccountDeletion()` / private exchange (§8.1, §8.3) |
| `apps/ios/Atender/Features/Auth/AuthView.swift` | `signInApple` クロージャ (§8.1) |
| `apps/ios/Atender/Core/Networking/APIEndpoint.swift` | `Endpoints.deleteMe()` |
| `apps/ios/Atender/Core/Data/MeRepository.swift` | `deleteAccount()` |
| `apps/ios/Atender/Features/Settings/SettingsView.swift` | 行 4 つ・dialog・overlay・alert・state・`deleteAccount()`・`SettingsLogic` の文言 5 定数 (§8.2, §8.3) |
| `apps/ios/project.yml` / `apps/ios/Atender/Info.plist` | `"20"` |
| `apps/web/src/components/settings/Settings.tsx` | §9.1 |
| `apps/web/src/routes/Templates.tsx` | §9.2 |
| `apps/web/nginx.conf` | §10.2 |
| 既存テスト 3 ファイル (版数) | §15.3 |

### 15.3 意図的に壊れる既存テスト (版数。メソッド名も揃える)

| テスト | 処置 |
|---|---|
| `BuildVersionTests.testV1BundleVersionIs19` | `"20"`、メソッド名 `…Is20` |
| `B17BuildVersionTests.testB61ProjectYmlBundleVersionIs19` / `testB61bInfoPlistMatchesProjectYml` | `"20"` を含み `"19"` を含まない / plist `"20"`。メソッド名 `…Is20` |
| `B18HomeAndVersionTests.testV1ProjectYmlBundleVersionIs19` / `testV3InfoPlistMatchesProjectYmlVersion` | `"20"` を含み `"19"` を含まない / plist `"20"`。メソッド名 `…Is20` |

**壊れないことを確認した既存テスト** (grep 済): `AuthStoreCallbackTests` の Apple 2 件 (`signInWithApple(idToken:)` は既定値で通る、code なしなので exchange は飛ばない) / API の `room.test.ts` `roomEvent.test.ts` `roomWeek.test.ts` `personal-calendar-share.test.ts` `timetable-templates.test.ts` `timetable-template-names.test.ts` (作者が生きている行の `authorId` / `authorUserId` は従来どおり実 id) / iOS `RoomLogicTests` `B17RoomFeatureParityTests` と fixture `roomWeek*.json` `template.json` (DTO 型不変) / Web の `meetingExpansion` (型不変)

### 15.4 seed (`seed-demo-user.ts`) の追加

1. 定数 `DEMO_DELETE_USER_ID = "demo-user-ios-delete"`、`DEMO_DELETE_TOKEN = "demo-bearer-token-ios-delete-0003"`。冒頭の掃除 `user.deleteMany({ where: { id: { in: [...] } } })` にこの id を足す
2. ユーザー: `email: "demo-delete@atender.local"`、`name: "デモ削除"`、既存デモと同じ school / department、`requiredAttendanceRate: 80`。学期 `name: "2026 前期"`、`startDate = today-30d 00:00`、`endDate = today+150d 23:59:59`、`defaultSemesterId` = その学期 (= setup 完了。時間割・ルーム・友達は**作らない** — 他のデモユーザーの UI テストに影響させない)。Session `{ id: "demo-session-ios-delete", token: DEMO_DELETE_TOKEN, expiresAt: +365d }`
3. 末尾の JSON 出力に `deleteUserBearerToken` を足す

---

## 16. 開発フロー

### 16.1 Developer の作業順 (1 worktree `feature/build20-account-deletion-legal`)

1. **API: schema + migration** — §7.1 を書く → migration フォルダを作り §7.2 の SQL を置く (または `pnpm exec prisma migrate dev --create-only --name b20_author_set_null` で生成し §7.2 と diff が無いことを確認) → `pnpm exec prisma generate` → drift 確認: `rm -f /tmp/atender-b20-shadow.db ; pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "file:/tmp/atender-b20-shadow.db" --exit-code` が **exit 0** (Architect 実測: migration ありで 0、無しで 2)
2. **API: DTO の番兵** (§7.3) → `pnpm exec tsc --noEmit -p tsconfig.json` 0 エラー
3. **API: services + routes** (§4〜6) → index.ts 登録 → tsc 0 エラー → `pnpm exec vitest run` で既知 16 と集合一致
4. **API: seed** (§15.4)
5. **iOS**: `AppleSignIn` → `AuthStore` → `AuthView` → `Endpoints` / `MeRepository` → `LegalLinks` → `SettingsView` → `PrivacyInfo.xcprivacy` → `project.yml` `"20"` → `xcodegen generate` → 版数テスト 3 ファイル (§15.3) → ユニット全走 700 / 0 fail
6. **Web**: `Settings.tsx` → `Templates.tsx` → `public/*.html` (制定日を実装日に) → `nginx.conf` → `pnpm exec vitest run` で既知 26 と集合一致 → `pnpm exec tsc --noEmit` (apps/web)
7. `git diff --stat` を添えて Leader に報告

### 16.2 Leader の手順 (Reviewer GREEN → リリース前ゲート → デプロイ)

1. 設計 doc を main にコミット → worktree → Developer → Reviewer (ロジック・データ・外部連携を含むので実施)
2. リリース前ゲート: Codex で 2LLM 突合 + 負のコントロール (Muraki/CLAUDE.md §11)。観点: 削除 tx の網羅 (§3 の表と FK の突合)、revoke のログにトークンが出ないこと、番兵、migration
3. main にマージ
4. **本番 DB のバックアップ** (migration が 2 テーブルを作り直すため): atender-api コンテナで `sqlite3 /app/data/prod.db ".backup /app/data/prod-before-b20.db"`。同時に件数を控える: `select count(*) from TemplateDaySlot; ... TemplateCourse; ... TemplateMeeting; ... RoomEventOverride; select count(*) from UserTimetable where sourceTemplateId is not null; select count(*) from RoomEvent; select count(*) from TimetableTemplate;`
5. **atender-api を Coolify デプロイ** (`POST $COOLIFY_API_BASE/deploy?uuid=tq2lgr4eh6t80r3tkqjbpu7o`)。完了後: `GET /healthz` 200 / 手順 4 の件数が一致 / `curl -X DELETE https://atender-api.appily.run/api/me` → **401** (404 でない = ルートがある) / `curl -X POST https://atender-api.appily.run/api/auth-apple/exchange -H 'Content-Type: application/json' -d '{}'` → **401**
6. **atender-web を Coolify デプロイ** (`uuid=y1acaktqgsx66sj81qsxn5m3`)。法務ページの制定日がデプロイ日と違えば、デプロイ前に 3 ファイルの `datetime` と表示を置換してコミット。完了後: `curl -sI https://atender.appily.run/privacy` (terms / support も) → 200 + `text/html; charset=utf-8`、`curl -sI https://atender.appily.run/privacy/` → 301 `Location: /privacy`、`curl -s https://atender.appily.run/settings` → SPA (#L9)
7. **iOS build 20** を archive → export → upload (CLAUDE.md の TestFlight 手順)
8. **Touri の実機ゲート** (§18 #G)
9. ASC: プライバシーポリシー URL `https://atender.appily.run/privacy`、サポート URL `https://atender.appily.run/support`、App Privacy を §11 の 4 種で入力 (本 doc の外。Researcher の §D 実値を使う)
10. 出荷後: `projects/atender/CLAUDE.md` の版数履歴を build 20 に置換、台帳 `.knowledge/known-failures.md` に実測件数、worktree 撤去

---

## 17. 不採用案

- **better-auth 既定の `POST /api/auth/delete-user` (`user.deleteUser.enabled`)**: 却下。OAuth のみのユーザーは password 経路を使えず、`session.createdAt` から `freshAge` (既定 24 時間) を過ぎると **400 SESSION_EXPIRED** — iOS のセッションは 30 日なので翌日以降ほぼ確実に踏む。`freshAge: 0` で回避すると全エンドポイントの fresh 判定が死に、メール確認フローは Apple の「不必要に困難にしない」と Magic Link 未使用ユーザー (Apple の非公開メール) の両方に反する。さらに削除前の移譲・写しの削除は `beforeDelete` に書くことになり、tx の外 (better-auth の adapter が sessions → accounts → user を個別に消す) で整合を取れない
- **`RoomEvent.author` / `TimetableTemplate.author` を Cascade のまま**: 却下。他メンバーのルームの予定と、コピー元として使われている公開テンプレが無言で消える (§3.1)。Touri 裁定 (テンプレは匿名化) にも反する
- **API で `authorId: null` を返し、shared / iOS の型を Optional にする**: 却下。build ≤ 19 の iOS が decode に失敗してルームのカレンダーが出なくなる。避けるには `MIN_IOS_BUILD` を 20 に上げて全員に強制アップデートを課すことになる (初回審査前の今は配布先が TestFlight だけだが、審査中に旧ビルドで確認される可能性を残さない)
- **退会者の作者表示用に「退会したユーザー」という User 行 (墓石) を作って付け替える**: 却下。FK を NOT NULL のまま保てるが、墓石ユーザーがルームのメンバー一覧・友達検索・ハンドル一意制約に紛れ込む経路を全部塞ぐ必要がある。NULL + 番兵の方が触る場所が少ない
- **Web だけの削除ページ (iOS からは Safari で開く)**: 却下。Apple 5.1.1(v) は「アプリ内で削除を開始」を要求する (Web へ誘導するだけは不可)
- **トークンの revoke をしない**: 却下 (Touri 裁定)。Apple は TN3194 で revoke を推奨 (should)。審査で問われたときに説明できない
- **SIWA の認可コード交換を better-auth の hook に入れる**: 却下 (§5.1 の表)
- **Apple の revoke を Bundle ID だけで行う**: 却下。Web の Apple ログインで得たトークンは Services ID に発行されており、Account 行から発行先を判別できない。2 回送るコストは退会 1 回につき 1 リクエスト
- **revoke を DB 削除の前に行う**: 却下 (§4.2)。tx が失敗するとアカウントが残ったまま Apple 連携だけ切れる
- **二重送信を DB の一意制約や行ロックで防ぐ**: 却下。SQLite で 2 つの tx が同時に読み → 書きに上がると片方が即 BUSY (500) になり得る。プロセス内の single-flight の方が単純で確実 (1 コンテナ前提)
- **`/privacy.html` (拡張子付き URL、nginx 無変更)**: 却下。ASC やアプリ内に恒久的に載る URL に実装詳細 (`.html`) を出したくない。nginx の変更は 1 行 + リダイレクト 1 つで、実測で SPA のルートを壊さないことを確認した (§10.2)。拡張子付きでも配信は続く
- **`public/privacy/index.html` (ディレクトリ形式)**: 却下。現行の `try_files` では `/privacy` も `/privacy/` も SPA に落ちる (Researcher 実測)。`$uri/` を足すと `/privacy` → `/privacy/` の 301 が nginx の絶対 URL で出る問題も同じく踏む
- **法務ページを SPA のルート (React) で作る**: 却下。審査担当者・ASC のクローラが JS 無しで読める保証が要る。静的 HTML が最小
- **法務ページで Web と同じ Inter / Noto Sans JP を Google Fonts から読む**: 却下。外部依存なしの要件と、プライバシーポリシーのページ自体が第三者にアクセスを送る矛盾を避ける
- **`unlinkGoogle` (Google カレンダー連携の解除) にも revoke を足す**: 却下 (本 doc では)。Google の revoke は同一プロジェクトの全スコープを失効させるため、連携解除でサインイン用のトークンまで死ぬ。別設計で扱う
- **Web の設定にも法務ページへのリンクを置く**: 却下 (本 doc では)。要件は iOS (ASC の URL + アプリ内リンク)。Web は削除の入口だけ揃える
- **UGC の通報・ブロック UI**: 却下 (Touri 裁定。審査で指摘されたら追加)

---

## 18. 承認ゲートで提示する判断点 / 実機ゲート

### 18.1 迷った判断点 (設計は「採った値」で書いてある)

| # | 論点 | 採った値 | 他の選択肢 |
|---|---|---|---|
| 1 | `RoomEvent.author` | SetNull 化して手入力・ICS の予定は残す。写し (個人カレンダー共有・Google 同期) は削除 (§3) | Cascade のまま (退会者の予定は他人のルームからも消える) |
| 2 | 匿名化した予定・テンプレの編集権 | 誰も編集できない (既存の作者限定のまま)。ルームのオーナーがルームを消せば消える | オーナーに編集権を与える (台帳 A3 と合わせて別設計) |
| 3 | 非公開テンプレ (`isPublic: false`) | 削除 | 公開テンプレと同じく匿名化して残す |
| 4 | 移譲先 | 退会者以外で `joinedAt` 最古 → `id` 昇順 | 最も活動している人など (データが無い) |
| 5 | Apple の認可コード交換 | 自前の後続エンドポイント、サインイン後に iOS が送る (§5.1) | better-auth の hook |
| 6 | DTO の作者 id | 番兵 `""` で返す (型契約不変、`MIN_IOS_BUILD` 12 据え置き) | `null` + Optional 化 + `MIN_IOS_BUILD` 20 |

### 18.2 ★ Touri に事実確認が要る項目 (プライバシーポリシーの記述が事実でなければならない)

- ~~バックアップの保持期間~~ → **Touri 裁定 (2026-10-09): 期間は書かない**。§10.4 の 6 / 7 は「障害復旧のためのバックアップには一定期間データが残ることがあります」に置換済
- ~~事業者名の実名表記~~ → **Touri 裁定 (2026-10-09): 事業者名は「Atender 運営者（個人）」、連絡先は `touri.development@gmail.com`**。§10.3 footer / §10.4 / §10.5 / §10.6 / #L4 を置換済

### 18.3 実機ゲート (Touri、TestFlight build 20)

- **#G1** 新しい Apple ID (審査用のテストアカウントでよい) でサインイン → Leader が本番 DB で `select refreshToken is not null from Account where providerId='apple' and userId=<そのユーザー>` → 1 (認可コードの交換が通った)
- **#G2** 設定 → その他 → 「アカウントを削除」→「削除する」→ ログイン画面。Leader が本番 DB で User 行が無いことを確認
- **#G3** iPhone の「設定 → Apple アカウント → サインインとセキュリティ → Apple でサインイン」から Atender が消えている (revoke が効いた。反映まで数分かかることがある)
- **#G4** 既存アカウント (Touri 本人) で再サインインしても時間割が残っている (削除が他人に波及しない・再サインインで refresh token が保存される)
- **#G5** 「プライバシーポリシー」「利用規約」「サポート」が Safari で開き、ダークモードでも読める

---

## 19. 受け入れ表 (要望 → 挙動仕様 → 確認手段)

| 要望 | 対応する挙動仕様 | 確認手段 |
|---|---|---|
| アプリ内でアカウントを削除できる (5.1.1(v)) | #D1-#D5、#I6-#I8、#S1 #S2、#W1-#W4 | Vitest / XCTest / XCUITest / RTL / 実機 #G2 |
| ルームは最古の残メンバーに移譲、0 人なら削除 | #D6-#D8 | Vitest |
| 公開テンプレは匿名化して残す | #D13-#D15、#M1-#M3、#W5 | Vitest / RTL |
| 他人のルームの予定は残し、写しは消す | #D9-#D12 | Vitest |
| Apple / Google の revoke (best-effort) | #D17-#D24、#U3 | Vitest / 実機 #G3 |
| SIWA の認可コードを送り refresh token を保存 | #X1-#X13、#U1 #U2、#I1-#I5 | Vitest / XCTest / 実機 #G1 |
| 未セットアップでも削除できる | #D2、#X9 | Vitest |
| 法務ページ 3 枚が拡張子無しの URL で出る | #L1-#L9 | Vitest / Docker nginx / 本番 curl |
| iOS の設定から法務ページを開ける | #I9、#S3 | XCTest / XCUITest / 実機 #G5 |
| Privacy Manifest | #P1-#P4 | XCTest |
| build 20 / `MIN_IOS_BUILD` 据え置き | #V1-#V3 | XCTest |
