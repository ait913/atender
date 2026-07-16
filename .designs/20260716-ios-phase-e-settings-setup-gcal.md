# Atender iOS 忠実移植 Phase E — 設定 / Setup / Google Calendar / 掃除

> 親設計: `.designs/20260701-ios-faithful-port-architecture.md` (データ層/DTO/コンポーネント規約) / 移植正典: `.designs/20260701-web-to-ios-port-bible.md` (§3.7〜3.9 / §4.2) / 直前 Phase: `.designs/20260701-ios-port-phase-d-rooms-friends.md` (Phase D が Phase E に送った項目を本書で回収する)。
> 方針: **Web (`apps/web`) と完全一致**。スマホ独自の簡略化・IA 改変・新 UX をしない。迷ったら `apps/web/src/components/settings/*`・`routes/Setup.tsx`・`routes/SettingsCalendar.tsx`・`components/avatar/*`・`components/sheet/*` を正典とする。
> Swift 型はすべて確定形で書く (gotcha `design-doc-must-specify-swift-type-signatures`)。
> ★ 1 View 内の複数シートは兄弟に並べず**単一 `activeSheet` enum + `.sheet(item:)` + 共有 Binding** に集約する (gotcha `swiftui-multiple-sibling-sheets-only-one-fires`)。Phase B / C / D で 3 回踏んだ。設定タブは Web 時点で 6 シートを持つ **本 Phase 最大のマルチシート画面**なので、最初から集約形で書く。

## スコープ境界 (並列 Architect との分界。両 doc 冒頭に明記する規約に従う)

| 領域 | 担当 |
|---|---|
| `apps/ios/Atender/Features/Auth/*`, `Core/Auth/AuthStore.swift`, `Core/Auth/AppleSignIn.swift`, `Core/Auth/KeychainStore.swift`, サインイン画面 / magic link / Apple・Google **サインイン** | **`.designs/20260716-login-unify.md` (別 Architect) 専属。本 Phase は読むだけで一切変更しない** |
| `Core/Auth/GoogleSignIn.swift` | **読み取り専用で再利用**。`GoogleSignIn.start(url:) async throws -> URL` を**シグネチャも実装も変えずに**呼ぶだけ (§E6)。変更が要ると分かった時点で Leader にエスカレーション |
| 上記以外の `Features/Settings/*`, `Features/Setup/*`, `Features/Home/HomeCore.swift`, `App/*`, `Core/Data/*`, `Core/Models/*`, `Core/Networking/*`, `apps/api/src/routes/auth.ts` の **native link 中継のみ**, `apps/web` | 本 Phase 専属 |

`apps/api/src/auth.ts` (better-auth 設定本体) は**両 Phase とも変更しない** — 本 Phase の API 追加は `src/routes/auth.ts` への**エンドポイント追加**と Prisma の**新規モデル追加**のみで、better-auth の config には触れない (§E6)。

---

## 目的

Web にあって iOS に無い残り全機能 — **設定タブ全体 (現状プレースホルダ)**・**初期セットアップ 3 ステップ (現状スタブ)**・**Google Calendar 連携 (現状ゼロ)**・**出欠ルール (API クライアント層から不在)**・**Home のルームコンテキスト (到達不能)** — を Web と 1:1 で移植し、併せて Web/iOS 双方の死にコードと `.xcodeproj` 複製事故の温床を掃除する。これで Phase A〜E の「Web 忠実移植」が閉じる。

---

## 内部フェーズ分割と依存順 (★論点 1 の回答)

1 doc に収めるが、**各フェーズが独立に実装・レビュー可能な単位**に切る。各フェーズは「1 worktree = 1 ブランチ = 1 developer + 1 reviewer」で回せる。

| # | フェーズ | 依存 | 主な成果物 | 規模 |
|---|---|---|---|---|
| **E0** | 掃除 (死にコード削除 / xcodeproj 追跡 / Web `/templates` リンク) | **なし** | 削除 + `.gitignore` + Web 1 ファイル | 小 |
| **E1** | Home ルームコンテキスト | **なし** | `HomeCore.swift` の chips + HomeBody 実配線 | 小 |
| **E2** | Settings シェル + アカウント + 表示 + その他 | E0 (掃除後の木で作業) — **実質独立** | `SettingsView` 全面新規 / `SettingsSection`/`SettingsRow` / `ProfileEditSheet` / `SchoolDeptEditSheet` / `RequiredRateSheet` / テーマ / ログアウト / `MeRepository.updateMe` / `SheetScaffold`・`LabeledInput` の Core 移設 | 中 |
| **E3** | 出欠ルール + 学期管理 | **E2** (シェルの行に生える) | `AttendanceRuleSheet` (**Endpoints から新規**) / `SemesterListSheet` / `RuleRepository` 新規 / `SemesterRepository` に CRUD 追加 | 中 |
| **E4** | Setup 3 ステップ | **E3** (`SchoolRepository` = E2, semester create = E3 を再利用) | `SetupFlowView` 実装 (RootView のスタブ置換) / `SetupViewModel` | 中 |
| **E5** | SettingsCalendar 画面 + TitleRuleEditor | **E2** (設定行から push) | `SettingsCalendarView` (push) / `TitleRuleEditor` / `IcsTitleRuleRepository` 新規 | 中 |
| **E6** | Google Calendar 連携 | **E5** (SettingsCalendar が着地先)、**E2** (設定シート) | API: link 中継 2 エンドポイント + `NativeOAuthLinkTicket` モデル / iOS: `GoogleLinkService` / `GoogleCalendarSection` / `GoogleCalendarConnectSheet` / `GoogleCalendarSelectorSheet` / `RoomGoogleSyncSection` / `GoogleRepository` 新規 | **大** |

依存グラフ:

```
E0 ─┐
E1 ─┤ (独立。E2 と同時召集可)
    └→ E2 ─┬→ E3 ─→ E4
            └→ E5 ─→ E6
```

- **同時召集可**: (E0, E1, E2) / E3 完了後の (E4, E5) / — E6 は E5 の後。
- **E6 だけは API + Prisma migration + 認証経路に触れる**。CLAUDE.md「エスカレーション」の「設計が認証・課金・破壊的 migration に触れる」に該当するため、**E6 着手前に Touri 承認ゲートを再度置く**ことを Leader に要請する (本設計の承認 ≠ E6 実装の承認)。migration は**追加のみ (新テーブル 1 つ)** で破壊的変更なし。

---

## Web 正典 ↔ iOS 1:1 対応表

| Web (`apps/web/src/`) | iOS (`apps/ios/Atender/`) | フェーズ |
|---|---|---|
| `components/settings/Settings.tsx` | `Features/Settings/SettingsView.swift` (**全面書き直し**) | E2 |
| `components/settings/SettingsSection.tsx` (`SettingsSection` / `SettingsRow`) | `Features/Settings/SettingsSection.swift` (新規) | E2 |
| `components/settings/ProfileEditSheet.tsx` | `Features/Settings/ProfileEditSheet.swift` (新規) | E2 |
| `components/sheet/SchoolDeptEditSheet.tsx` | `Features/Settings/SchoolDeptEditSheet.swift` (新規) | E2 |
| `components/settings/RequiredRateSheet.tsx` | `Features/Settings/RequiredRateSheet.swift` (新規) | E2 |
| `Settings.tsx` の `ThemeRow` | `SettingsView.swift` の `ThemeRow` (private) | E2 |
| `Settings.tsx` の `signOut()` | `SettingsView.swift` の `signOut()` | E2 |
| `components/sheet/AttendanceRuleSheet.tsx` | `Features/Settings/AttendanceRuleSheet.swift` (新規) | E3 |
| `components/sheet/SemesterListSheet.tsx` | `Features/Settings/SemesterListSheet.swift` (新規) | E3 |
| `routes/Setup.tsx` | `Features/Setup/SetupFlowView.swift` (`App/RootView.swift` の暫定 `SetupFlowView` を**置換**) | E4 |
| `routes/SettingsCalendar.tsx` | `Features/Settings/SettingsCalendarView.swift` (新規, push) | E5 |
| `components/ics-import/TitleRuleEditor.tsx` | `Features/Settings/TitleRuleEditor.swift` (新規) | E5 |
| `components/avatar/GoogleCalendarSection.tsx` | `Features/Google/GoogleCalendarSection.swift` (新規) | E6 |
| `components/avatar/GoogleCalendarConnectSheet.tsx` (= 解除シート) | `Features/Google/GoogleCalendarConnectSheet.swift` (新規) | E6 |
| `components/avatar/GoogleCalendarSelectorSheet.tsx` | `Features/Google/GoogleCalendarSelectorSheet.swift` (新規) | E6 |
| `components/rooms/RoomGoogleSyncSection.tsx` | `Features/Google/RoomGoogleSyncSection.swift` (新規)。`Features/Rooms/RoomSheets.swift` の `RoomSettingsSheet` に差し込む | E6 |
| `api/hooks/useGoogleCalendar.ts` の `useLinkGoogleCalendar` (= `authClient.linkSocial`) | `Features/Google/GoogleLinkService.swift` (新規) + **API 中継 2 本** | E6 |
| `components/home/Home.tsx` の `chips` (useRooms) | `Features/Home/HomeCore.swift` の `HomeView` + `ContextChips` | E1 |
| `components/home/HomeBody.tsx` の room 分岐 | `Features/Home/HomeCore.swift` の `HomeBody` (Placeholder を**置換**) | E1 |
| `components/rooms/Rooms.tsx` (**`/templates` リンク欠落バグ**) | (iOS `RoomsView.swift:85` が正) → **Web を iOS に合わせる** | E0 |

---

## Web が持たない = iOS も作らない (誤検知の排除。根拠つき)

忠実移植は「無いものを作らない」。以下は **Web 側に UI 導線が無い** ことを import 元の grep で確認済み。**Developer は作らないこと**。

| endpoint / 部品 | Web 側の実態 (確認済) |
|---|---|
| `GET /api/rooms/:id/ics-imports` (`useIcsImports`) | **importer 0**。ICS インポート履歴 UI は Web に存在しない |
| `DELETE /api/rooms/:id/ics-imports/:importId` (`useDeleteIcsImport`) | **importer 0** |
| `DELETE /api/user-timetables/:id` (`useDeleteUserTimetable`) | **importer 0**。時間割削除 UI は Web に存在しない |
| `PATCH/DELETE /api/rooms/:id/events/:eventId` (`useUpdateRoomEvent`/`useDeleteRoomEvent`) | 唯一の呼び元 `components/rooms/RoomEventDetailSheet.tsx` が**孤児 (importer 0)**。Phase D で不採用確定済、本 Phase でも据え置き |
| `GET /api/stats` (`useStats`) | 唯一の呼び元 `routes/Stats.tsx` が**死にファイル (E0 で削除)**。削除後は Web も呼ばない |
| `GET /api/room/:id/events`, `GET /api/timetable-suspensions` (単体取得) | 対応 hook に importer 無し |
| ICS インポート本体 | **iOS 実装済** (`Features/Rooms/RoomSheets.swift:320` `IcsImportWizard`)。E6 で「ルールを編集」ボタンを有効化するのみ |
| 招待コード deep link | **iOS 実装済・穴なし** (`Core/DeepLink.swift` + `RootView` の `onOpenURL`/`onContinueUserActivity`)。触らない |
| ボトムタブ構成 | `navItems.ts` と一致済。**CLAUDE.md 違反なし**。触らない |

---

## ★論点 2 の回答: `Atender.xcodeproj` は追跡をやめ生成に一本化する

### 確認結果 (推測でなく実測)

| 確認項目 | コマンド | 結果 |
|---|---|---|
| CI の有無 | `ls .github/workflows` | **`.github` 自体が存在しない** → CI 依存ゼロ |
| tracked ファイル | `git ls-files apps/ios \| grep -i xcodeproj` | 4 件: `Atender.xcodeproj/project.pbxproj` / `project.xcworkspace/contents.xcworkspacedata` / `xcshareddata/xcschemes/Atender.xcscheme` / `xcshareddata/xcschemes/AtenderUITests.xcscheme` |
| scheme の出所 | `apps/ios/project.yml:81-103` | `schemes:` に `Atender` / `AtenderUITests` を**宣言済** → `xcodegen generate` が両 scheme を再生成する。手書き scheme 資産は無い |
| 複製の追跡状態 | `git ls-files` | `Atender 2.xcodeproj` / `Atender 3.xcodeproj` は**未追跡**かつ `.gitignore` に無い |
| ビルド手順 | `CLAUDE.md`「主要ワークフロー」 | シミュレータ確認・TestFlight 配布とも **先頭で `xcodegen generate` を実行**済 |

### 決定

**`.gitignore` に入れて生成に一本化する。** 根拠: (a) CI が存在せず生成物追跡の利用者がゼロ、(b) scheme が project.yml で宣言済なので追跡をやめても失うものが無い、(c) 全ビルド手順が既に `xcodegen generate` 前提、(d) 追跡し続ける限り「Xcode GUI が生成した `Atender 2.xcodeproj`」が再発する。

E0 の作業内容:

```gitignore
# apps/ios/.gitignore に追記 (既存の "# Xcode" ブロックの直後)
# xcodegen 生成物。project.yml が正典。`xcodegen generate` で再生成する。
*.xcodeproj/
```

```sh
# 追跡解除 (作業ツリーからは消さない)
git -C apps/ios rm -r --cached Atender.xcodeproj
# 複製の物理削除 (untracked・古い・参照ゼロ)
rm -rf "apps/ios/Atender 2.xcodeproj" "apps/ios/Atender 3.xcodeproj"
```

`apps/ios/README.md` に **「ビルド前に `xcodegen generate` が必須。`.xcodeproj` は生成物なので直接編集しても project.yml に反映されず次回生成で消える」** の 2 行を追記する (追跡をやめる以上、手順の明記が代替の担保)。

**検証 (Reviewer)**: クリーン clone 相当 (`git stash -u` 後でなく、`git clean -n` で `.xcodeproj` が ignore 判定になること) → `xcodegen generate` → `xcodebuild test -scheme Atender` が **157 GREEN** を再現し、`xcodebuild test -scheme AtenderUITests` の scheme が解決すること。

---

## ★論点 3 の回答: Google Calendar 連携の iOS OAuth 経路

### 前提 (実装ソースを読んで確認した事実。推測でない)

1. **Web の経路**: `useLinkGoogleCalendar` (`api/hooks/useGoogleCalendar.ts:38-48`) が `authClient.linkSocial({provider:"google", scopes:["…/auth/calendar.readonly"], callbackURL:"${APP_URL}/settings/integrations/google?linked=1"})` を呼ぶ → ブラウザが Google 同意画面へ → 戻ってきた `?linked=1` を `SettingsCalendar.tsx:12-21` が拾い `useCompleteGoogleLink` (= `POST /api/me/google-calendar/link/complete`) を叩く。
2. **better-auth 1.6.11 の `/link-social`** (`node_modules/.../api/routes/account.mjs:67-197`): `use: [sessionMiddleware]`、body に `provider` / `scopes` / `callbackURL` / `errorCallbackURL` / `disableRedirect` を取り、`{ url, redirect }` を JSON で返す。
3. **bearer plugin** (`node_modules/.../plugins/bearer/index.mjs`) は `before` hook で `Authorization: Bearer <token>` を **session cookie ヘッダに変換**する。`request` が無く `headers` だけでも matcher が成立する → **`/link-social` は Bearer で叩ける**。`apps/api/src/auth.ts:100` で `bearer()` は有効。
4. **★ 落とし穴 (これが最難関の正体)**: `generateState` (`node_modules/.../oauth2/state.mjs`) → `generateGenericState` (`node_modules/.../state.mjs:28-62`)。DB を持つ構成では `storeStateStrategy` の既定が **`"database"`** (`context/create-context.mjs:133`) で、state 本体は verification テーブルに入るが、**同時に署名付き `state` cookie も発行**される。callback 側 `parseGenericState` (`state.mjs:92-108`) は `skipStateCookieCheck`(既定 `false`, `create-context.mjs:134`) でない限り **その cookie の一致を必須**とする。
   → iOS が `POST /link-social` を **URLSession** から叩くと、`Set-Cookie: better-auth.state` は `HTTPCookieStorage` に入る。一方 Google からの `/api/auth/callback/google` は **ASWebAuthenticationSession のブラウザ**が発行するので cookie を持たない → `state_security_mismatch` で失敗する。**「iOS から link-social を直接叩く」案は成立しない。**

### 決定: API 側に「ブラウザに実行させる」link 中継を新設する (E6)

`state` cookie を**発行させる HTTP 要求そのものをブラウザに行わせれば**、cookie はブラウザの jar に入り callback で一致する。既存の `GET /api/auth/native/callback` (`apps/api/src/routes/auth.ts:54-68`, session token を fragment でネイティブへ返す中継) と同じ発想の逆向き。

```
iOS                        API                          Google
 │ ①POST /api/auth/native/link-ticket  (Bearer)
 │   → { ticket, url, expiresAt }
 │
 │ ②ASWebAuthenticationSession(url, callbackURLScheme:"atender")
 │        └─ GET /api/auth/native/link-google?ticket=…
 │              ├ ticket 検証 & 単回消費
 │              ├ auth.api.linkSocialAccount({headers: Bearer <sessionToken>, asResponse:true})
 │              └ 302 Location=<Google 同意 URL> + Set-Cookie(state) を**そのまま転送**
 │                                                        ↓ 同意
 │        ┌─ GET /api/auth/callback/google?code&state   (browser: state cookie あり → 一致)
 │        │     └ better-auth が Account.scope を更新 → 302 atender://google-linked
 │ ③ASWebAuthenticationSession completion(atender://google-linked)
 │
 │ ④POST /api/me/google-calendar/link/complete (Bearer)  ← Web の ?linked=1 と等価
 │   → { connection }
```

**なぜ ticket が要るか**: ②はブラウザ発の GET なので `Authorization` ヘッダを付けられない。session token を直接クエリに置くと **30 日有効の token が Nginx/Coolify のアクセスログに平文で残る**。単回・120 秒の ticket なら露出が有界。

**なぜ ④ が要るか**: 連携完了の判定は Web と同じく `Account.scope` を読む `completeGoogleLink` (`apps/api/src/services/googleCalendarSync.service.ts:13-39`) が単一の真実。iOS 独自判定を作らない。

#### API 追加 (E6)

**Prisma** (`apps/api/prisma/schema.prisma`、**追加のみ**):

```prisma
model NativeOAuthLinkTicket {
  id           String   @id @default(cuid())
  ticket       String   @unique
  userId       String
  sessionToken String
  expiresAt    DateTime
  createdAt    DateTime @default(now())

  @@index([expiresAt])
}
```

**`apps/api/src/routes/auth.ts` に 2 本追加** (既存 `registerAuthRoutes` 内。`app.on(["GET","POST"], "/api/auth/*", …)` の**前**に登録する — 後ろだとワイルドカードに食われる):

```ts
// ① チケット発行 (ネイティブが Bearer で叩く)
app.post("/api/auth/native/link-ticket", async (c) => {
  const token = await resolveSessionToken(c.req.raw.headers);   // 既存ヘルパを再利用
  if (!token) throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  const session = await getPrisma().session.findUnique({ where: { token } });
  if (!session) throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  const ticket = randomUUID();
  const expiresAt = new Date(Date.now() + 120_000);             // 120 秒
  await getPrisma().nativeOAuthLinkTicket.deleteMany({ where: { OR: [{ userId: session.userId }, { expiresAt: { lt: new Date() } }] } });
  await getPrisma().nativeOAuthLinkTicket.create({ data: { ticket, userId: session.userId, sessionToken: token, expiresAt } });
  const url = new URL("/api/auth/native/link-google", env.BETTER_AUTH_URL);
  url.searchParams.set("ticket", ticket);
  return c.json({ ticket, url: url.toString(), expiresAt: expiresAt.toISOString() }, 201);
});

// ② ブラウザ (ASWebAuthenticationSession) が開く中継
app.get("/api/auth/native/link-google", async (c) => {
  const ticket = c.req.query("ticket");
  if (!ticket) throw new AppError(400, "VALIDATION_ERROR", "ticket required");
  const row = await getPrisma().nativeOAuthLinkTicket.findUnique({ where: { ticket } });
  if (row) await getPrisma().nativeOAuthLinkTicket.delete({ where: { id: row.id } });   // 単回消費
  if (!row || row.expiresAt < new Date()) throw new AppError(401, "UNAUTHORIZED", "Invalid or expired ticket");

  const res = await getAuth().api.linkSocialAccount({
    body: {
      provider: "google",
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      callbackURL: NATIVE_LINK_CALLBACK,        // "atender://google-linked"
      errorCallbackURL: NATIVE_LINK_ERROR,      // "atender://google-linked?error=link_failed"
    },
    headers: new Headers({ Authorization: `Bearer ${row.sessionToken}` }),
    asResponse: true,
  });
  const location = res.headers.get("Location");
  if (!location) throw new AppError(502, "GOOGLE_LINK_FAILED", "Authorization URL was not returned");
  const headers = new Headers({ Location: location });
  for (const [k, v] of res.headers.entries()) if (k.toLowerCase() === "set-cookie") headers.append("Set-Cookie", v);
  return new Response(null, { status: 302, headers });
});
```

- `NATIVE_LINK_CALLBACK = "atender://google-linked"` / `NATIVE_LINK_ERROR = "atender://google-linked?error=link_failed"` は `src/routes/auth.ts` の module 定数。
- **`BETTER_AUTH_TRUSTED_ORIGINS` に `atender://google-linked` を追加**する (dev `.env` / `.env.test` / Coolify PROD の 3 か所)。★ known-failures.md に記録済の事故 —「`atender://auth` を `atender://` に truncate して投入すると本番で無効化」— と同型の罠。**投入値は厳密に `atender://auth,atender://google-linked` (末尾まで)** であること。
- `linkSocialAccount` を `request` 無し (`headers` のみ) で呼ぶため `originCheckMiddleware` は `!ctx.request` で早期 return する (`api/middlewares/origin-check.mjs:39-41`) が、callback 後の最終 redirect 先として trustedOrigins への追加は必要。
- `res.headers.entries()` は同名ヘッダを結合して返す実装があり得るため、**Set-Cookie は `res.headers.getSetCookie()` が使えるならそちらを優先**し、無ければ `entries()` フォールバック。Developer は Node 20 の undici Headers で `getSetCookie()` の可否を確認して分岐を 1 か所に閉じる。

#### iOS 側 (E6)

```swift
// Features/Google/GoogleLinkService.swift (新規)
@MainActor
final class GoogleLinkService {
    struct TicketResponse: Codable, Equatable {
        let ticket: String
        let url: URL
        let expiresAt: String
    }
    enum LinkError: Error, Equatable { case cancelled, failed(String) }

    private let authStore: AuthStore
    private let webAuth: GoogleSignIn          // Core/Auth/GoogleSignIn.swift を**そのまま**再利用 (変更しない)
    init(authStore: AuthStore, webAuth: GoogleSignIn = GoogleSignIn())

    /// ①→②→③ を実行し、成功時に何も返さない (④ は呼び出し側 = GoogleRepository.completeLink)。
    /// ASWebAuthenticationSession のユーザーキャンセルは LinkError.cancelled、
    /// 戻り URL に `error` クエリがあれば LinkError.failed(<値>)。
    func startLink() async throws
}
```

- ① は `URLSession` + `Authorization: Bearer <authStore.token>` で `POST /api/auth/native/link-ticket` → `TicketResponse`。`AuthStore.token` は既存の public `var token: String? { storedToken }` を読むだけ (**AuthStore は変更しない**)。
- ② は `try await webAuth.start(url: ticket.url)` → 戻り `URL`。
- ③ 判定: `URLComponents(url:resolvingAgainstBaseURL:false)?.queryItems?.first(where: { $0.name == "error" })` が非 nil → `LinkError.failed(値)`。`ASWebAuthenticationSessionError.canceledLogin` → `LinkError.cancelled`。
- `AppEnvironment` に `let googleLinkService: GoogleLinkService` を追加し `init` で `GoogleLinkService(authStore: authStore)` を配線。

**Info.plist は変更不要**: `project.yml:41-44` の `CFBundleURLSchemes: [atender]` が既にあり、`ASWebAuthenticationSession(callbackURLScheme: "atender")` はリダイレクトを**内部で捕捉**するので `RootView.onOpenURL` には流れない (= 既存の deep link 分岐と衝突しない)。

---

# フェーズ別 詳細設計

## E0 — 掃除

### E0-1 iOS 死にコード削除

```
apps/ios/Atender/Features/Today/TodayView.swift        削除
apps/ios/Atender/Features/Today/TodayViewModel.swift   削除
apps/ios/Atender/Features/Today/OccurrenceRow.swift    削除
apps/ios/AtenderTests/TodayViewModelTests.swift        削除 (上記の唯一の参照元)
```
`Features/Today/` ディレクトリごと消える。`project.yml` は `sources: [Atender]` のディレクトリ指定なので**変更不要**。削除後 `xcodegen generate` → `xcodebuild test` の GREEN 件数が **157 から `TodayViewModelTests` の件数分だけ減る**。Reviewer は「減った分がすべて `TodayViewModelTests` 由来であること」を確認し、**新しいベースライン件数を `.knowledge/known-failures.md` の iOS 節に記録して置換**する (追記でなく置換)。

### E0-2 Web 死にファイル削除 (11 個)

`git status --porcelain apps/web/src` で `??` (未追跡) かつ import 元ゼロを確認済の 11 個:

```
apps/web/src/routes/Today.tsx
apps/web/src/routes/Timetable.tsx
apps/web/src/routes/Stats.tsx
apps/web/src/components/today/Today.tsx
apps/web/src/components/today/TodayGreeting.tsx
apps/web/src/components/timetable/DayList.tsx
apps/web/src/components/timetable/MeetingCreateSheet.tsx
apps/web/src/components/semester/OverallRateCard.tsx
apps/web/src/components/avatar/AvatarMenu.tsx
apps/web/src/lib/timetableCluster.ts
apps/web/src/lib/timetableNormalize.ts
```

★ **`components/today/*` を丸ごと消してはいけない**。同ディレクトリの `MainAttendanceCTA.tsx` は `components/home/SelfTodayCTA.tsx:8` が **import している生きたファイル**。消すのは上表の 2 つだけ。

★ **副作用の申告 (勝手に消さない)**: `components/today/Today.tsx` を消すと、tracked な `TimetableScroll.tsx` / `OccurrenceLyricCard.tsx` / `ReturnToNowFAB.tsx` (= Port Bible §4.5 の Spotify 歌詞風 UI) が**孤児になる**。これらの廃棄は「作った UI を捨てるか」というプロダクト判断なので**本 Phase では削除しない**。E0 完了報告で Leader に「歌詞 UI 3 ファイルが孤児化した。廃棄/復活は別途 Touri 判断」と明示すること。

`router.tsx` は既に Today/Timetable/Stats の component 参照を持たない (`/timetable`→`/`, `/stats`→`/semester` の redirect のみ、`router.tsx:67,69`) ので**変更不要**。削除後 `pnpm --filter @atender/web build` (tsc) が通ることが受け入れ条件。

### E0-3 `.xcodeproj` の追跡解除 — §論点 2 の決定どおり

### E0-4 Web に `/templates` リンクを追加 (Touri 決定: iOS の導線が正)

`apps/web/src/components/rooms/Rooms.tsx` の header を iOS `RoomsView.swift:74-90` に合わせる。iOS は「ルーム見出し行の下に、右寄せの小さいテキストボタン」。

```tsx
// Rooms.tsx  — 現状の header (17-23 行) を置換
<div className="space-y-2">
  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
    <h1 className="text-2xl font-bold">ルーム</h1>
    <div className="flex gap-3">
      <Button type="button" onClick={() => setJoinOpen(true)}>リンクで参加</Button>
      <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>作成</Button>
    </div>
  </div>
  <div className="flex justify-end">
    <button type="button" className="text-xs text-fg-tertiary hover:text-fg-secondary" onClick={() => void navigate({ to: "/templates" })}>
      みんなの時間割
    </button>
  </div>
</div>
```

- 文言・配置・トーン (`text-xs` / `text-fg-tertiary` / 右寄せ) は iOS の `.atenderXs` + `.textTertiary` + `VStack(alignment:.trailing)` と 1:1。
- **タブは増やさない**。`navItems.ts` は変更しない。
- **iOS 側は一切変更しない** (`RoomsView.swift` は正)。

---

## E1 — Home ルームコンテキスト

Web `components/home/Home.tsx:22-26` が `useRooms()` から chips を組み、`HomeBody.tsx:15-21` が room 分岐で `RoomTimetable`/`RoomCalendar` を返す。iOS は `HomeCore.swift:37` が `items: [.selfChip(label: "自分")]` **ハードコード**、`HomeCore.swift:262-265` が Placeholder。型・分岐 (`HomeContext.room`) は既にあるので**配線するだけ**。Phase D が実装済の `RoomTimetable(roomId:)` / `RoomCalendar(roomId:)` (`Features/Rooms/RoomDetailView.swift:122,367`) をそのまま使う。

```swift
// Features/Home/HomeCore.swift — HomeView に追加する State
@State private var rooms: [RoomSummaryDto] = []

// chips 生成 (純粋関数。Reviewer のテスト対象)
enum HomeChips {
    /// Web Home.tsx:22-26 忠実。先頭は必ず .selfChip(label:"自分")、以降 rooms を配列順のまま room chip 化。
    static func items(rooms: [RoomSummaryDto]) -> [ContextChipItem]
}
```

- `HomeView.body`: `ContextChips(items: HomeChips.items(rooms: rooms), selected: context, onChange: { context = $0 }, onAddRoom: { environment.appRouter.selectedTab = .rooms })`。`ContextChips` 自体のシグネチャは**変更しない**。
- `HomeView.task`: 既存の me 取得に続けて `rooms = (try? await environment.roomRepository.rooms()) ?? []`。キャッシュ優先は `roomRepository.rooms(force:false)` が内部で行うので追加コード不要。
- `HomeBody`: `case (.room(let roomId), .timetable): RoomTimetable(roomId: roomId)` / `case (.room(let roomId), .calendar): RoomCalendar(roomId: roomId)` に**置換**。
- **`RoomTimetablePlaceholder` / `RoomCalendarPlaceholder` (`HomeCore.swift:270-276`) は削除**する (置換であって併存させない)。
- Web は room コンテキストで `HomeSemesterPicker` を出さない (`Home.tsx:32` は `context.kind === "self" && mode !== "timetable"`)。iOS の既存条件 `context == .self && mode == .calendar` と一致 → **変更不要**。
- Web は room コンテキストで `SelfTodayCTA` を出さない (`Home.tsx:34`)。iOS の `context == .self && mode == .timetable` と一致 → **変更不要**。

---

## E2 — Settings シェル + アカウント + 表示 + その他

### E2-0 共通部品の Core 移設 (新規作成でなく移動)

`SheetScaffold` (`Features/Rooms/RoomsView.swift:305`) と `LabeledInput` (同 `:354`) は設定シート群でも使う。**`Features/Rooms/` に置いたまま Settings から呼ぶのは層が逆**なので移設する (コピーして二重定義しない = CLAUDE.md「追記でなく置換」):

```
Core/DesignSystem/Components/SheetScaffold.swift  ← RoomsView.swift:305-352 を無改変で移動
Core/DesignSystem/Components/LabeledInput.swift   ← RoomsView.swift:354-374 を無改変で移動
```
本体は 1 文字も変えない。Swift は同モジュール内なので import 追加も不要。既存呼び出しは全て無影響。

### E2-1 SettingsView (Web `Settings.tsx` 忠実、**孤児 SettingsView は全面書き直し**)

`App/MainTabView.swift:74` の `SettingsPlaceholderView()` を `SettingsView()` に**置換**。`App/PlaceholderViews.swift:19-21` の `SettingsPlaceholderView` は**削除**。既存 `Features/Settings/SettingsView.swift` の中身 (メール/サインアウト/テーマの 3 つ、`List` ベース) は**全部捨てて**下記で置き換える (テーマとログアウトの挙動だけ引き継ぐ)。

```swift
// Features/Settings/SettingsView.swift (全面書き直し)
struct SettingsView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @AppStorage("atender.theme") private var themePreference = ThemePreference.light.rawValue
    @State private var user: UserDto?
    @State private var activeSheet: SettingsSheet?

    enum SettingsSheet: String, Identifiable {
        case profile, school, rules, semesters, google, requiredRate
        var id: String { rawValue }
    }
}
```

- ★ `activeSheet` は Web `Settings.tsx:16` の `type Sheet = "profile"|"school"|"rules"|"semesters"|"google"|"requiredRate"|null` と**同一の 6 値**。`.sheet(item: $activeSheet)` を **1 つだけ**張り `switch` で出し分ける (gotcha 回避)。共有 Binding は `RoomsView.swift:70-72` の `activeSheetBinding` と同型。
- `@AppStorage` の既定値は現行コードのまま `ThemePreference.light.rawValue` (2026-07 リブランドで Light 既定。**Port Bible §1 の "dark 既定" は現行 PJ に対して陳腐化しており、PJ の現物が正典**)。
- レイアウト: `ScrollView` + `VStack(alignment:.leading, spacing: Space.s4)` + `.padding(Space.pagePxMobile)` + `.padding(.bottom, Space.tabBarHeight)`。Web は `mx-auto max-w-2xl space-y-4 pb-8`。`.navigationBarHidden(true)`、`.accessibilityIdentifier("settings-view")`。
- **プロフィールカード** (Web `Settings.tsx:33-51`): `Color.bgElevated` + `Radius.sm`(=10, Web `rounded-lg`) + `.overlay(RoundedRectangle.stroke(Color.borderSettings, lineWidth: 1))` + `.atenderShadow(.settingsPanel)`。中身 `HStack(spacing: Space.s4)`:
  - 44x44 (`h-11 w-11`) 円。`user.image` があれば `AsyncImage(url:)` を `.scaledToFill()` + `.clipShape(Circle())`、無ければ `Text(SettingsLogic.avatarInitial(user))` を `.atenderBase`/`.black`/`.textOnAccent` で `Color.accent500` + `.atenderShadow(.glowSoft)` 上に。
  - `VStack(alignment:.leading, spacing:2)`: `Text(user?.name ?? "No name")` (`.atenderSm`/`.bold`/`.textPrimary`/`lineLimit(1)`) / `Text(user?.email ?? "")` (`.atenderSm`/`.textSecondary`/`lineLimit(1)`) / `user?.handle` があれば `Text("@\(handle)")` (`.atenderXs`/`.textTertiary`)。
- **セクション** (Web `Settings.tsx:53-79` と 1:1、順序も同一):

| セクション見出し | 行 | trailing | アクション |
|---|---|---|---|
| アカウント | プロフィール編集 | `>` | `activeSheet = .profile` |
| | 学校・学科 | `>` | `activeSheet = .school` |
| 出席 | 必要出席率 | `Text("\(user?.requiredAttendanceRate ?? 70)%")` (`.atenderSm`/`.bold`/`.textTertiary`) | `activeSheet = .requiredRate` |
| | 出欠ルール | `>` | `activeSheet = .rules` (**E3**) |
| | 学期管理 | `>` | `activeSheet = .semesters` (**E3**) |
| カレンダー連携 | Google Calendar 連携 | `>` | `activeSheet = .google` (**E6**) |
| | カレンダー設定 (ICS 等) | `>` | `router.settingsPath.append(SettingsRoute.calendar)` (**E5**) |
| 表示 | (`ThemeRow`) | — | — |
| その他 | ログアウト | `>` | `signOut()` (danger) |

  - **E2 の時点では `.rules` / `.semesters` / `.google` の行を出し、シートは `EmptyView()` を返す** ように書かない。**行そのものを E2 では出さず、E3/E6 で行 + シートを同時に足す**。半端に押せて何も起きない行を残さないため。「カレンダー設定 (ICS 等)」も同様に **E5 で足す**。E2 が出すのは アカウント 2 行 / 出席 1 行 (必要出席率) / 表示 / その他。
- **ThemeRow** (Web `Settings.tsx:93-118` 忠実): `HStack(spacing: Space.s1)` を `Color.bgMuted` の Capsule (`padding(4)`) で包み、`ThemePreference.allCases` の 3 ボタン (`自動`/`ライト`/`ダーク`)。選択中 = `Color.accent500` + `.textOnAccent` + `.atenderShadow(.glowSoft)`、非選択 = `.textSecondary`。各ボタン `.atenderXs`/`.bold`/`frame(maxWidth:.infinity)`/高さ 34。Web の `px-4 py-3` に相当する外側 padding を持つ行として `SettingsSection` 内に置く。
- **signOut** (Web `Settings.tsx:25-29` = `POST /api/auth/sign-out` → `queryClient.clear()` → `/signin`):
  ```swift
  private func signOut() async {
      await environment.authStore.signOut()   // 内部で POST /api/auth/sign-out → keychain 破棄 → state=.signedOut
      environment.queryClient.removeAll()     // Web の queryClient.clear() 相当
      router.settingsPath = NavigationPath()
  }
  ```
  ★ `AuthStore.signOut()` は**既存のまま呼ぶだけ** (Auth スコープ変更なし)。`AppEnvironment.init` の `authStore.onLocalSignOut = { queryClient.removeAll() }` は `handleUnauthorized()` 経路のみで発火するため、明示 signOut では `removeAll()` を自分で呼ぶ。`/signin` への遷移は `RootView` の `state == .signedOut` 分岐が担う (画面遷移コードを書かない)。
- `.task`: `user = (try? await environment.meRepository.me())?.user`。`.onChange(of: activeSheet)` で `nil` になったら `user` を再取得 (シート内 patch の反映。Web は TanStack が `setQueryData(QK.me())` で自動反映するのに対し iOS は明示 reload 方針 = Phase B/C/D 踏襲)。

### E2-2 SettingsSection / SettingsRow (Web `SettingsSection.tsx` 忠実)

```swift
// Features/Settings/SettingsSection.swift (新規)
struct SettingsSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content
}

struct SettingsRow: View {
    let label: String
    var danger: Bool = false
    var trailing: AnyView? = nil          // nil のとき chevron.right を出す (Web の `trailing ?? <ChevronRight/>`)
    let action: () -> Void
}
```

- `SettingsSection`: 見出し `Text(title)` を `.atender(11, .semibold)` + `.textTertiary` + `.textCase(.uppercase)` + `.tracking(0.5)` + `.padding(.horizontal, Space.s1)` + `.padding(.bottom, 6)` (Web `mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide`)。本体 `VStack(spacing:0)` を `Color.bgElevated` + `Radius.sm` + `.overlay(stroke(Color.borderSettings))` + `.atenderShadow(.settingsPanel)` + `.clipShape`。**行間に `Rectangle().fill(Color.borderSubtle).frame(height:1)`** (Web `divide-y divide-border-subtle) — `content` の各行の間にのみ引く。実装は `content` を `VStack(spacing:0)` に入れ、各 `SettingsRow` が `.overlay(alignment:.top){ divider }` を持つ形にし、**先頭行だけ divider を消す**ために `SettingsRow` に `var isFirst: Bool = false` を持たせず、`SettingsSection` 側で `_VariadicView` を使わずに **呼び出し側が明示的に divider を挟む**。→ 複雑化を避けるため **`SettingsSection` は `rows: [SettingsRowSpec]` を受ける形にする**:

```swift
// 最終形 (Reviewer はこの契約でテストする)
struct SettingsRowSpec: Identifiable {
    let id: String              // accessibilityIdentifier に使う (例 "settings-row-profile")
    let label: String
    var danger: Bool = false
    var trailingText: String? = nil     // 非 nil なら chevron でなくこのテキストを出す
    let action: () -> Void
}

struct SettingsSection: View {
    let title: String
    let rows: [SettingsRowSpec]
}
```
`SettingsSection` が `rows` を `ForEach` で回し、**index > 0 の行の上にだけ** `Rectangle().fill(Color.borderSubtle).frame(height:1)` を置く。ThemeRow だけは行でなく任意 View なので `SettingsSection` の**もう 1 つのイニシャライザ**を用意する:

```swift
extension SettingsSection {
    init<C: View>(title: String, @ViewBuilder content: () -> C)   // rows を使わない任意コンテンツ版 (表示セクション用)
}
```
→ 実装は `enum SettingsSectionBody { case rows([SettingsRowSpec]); case custom(AnyView) }` を内部に持つ 1 型で両立させる。

- `SettingsRow` (内部 View): `Button(action:)` で `HStack` — 左 `Text(label)` (`.atenderSm`/`.bold`/ `danger ? .statusAbsent : .textPrimary`)、`Spacer()`、右 `trailingText` があれば `Text(trailingText)` (`.atenderSm`/`.bold`/`.textTertiary`)、無ければ `Image(systemName:"chevron.right")` (`.atenderSm`/`.textTertiary`)。`.padding(.horizontal, Space.s4)` + `.padding(.vertical, Space.s3)` (Web `px-4 py-3`)。`.buttonStyle(.plain)` + 押下 `scaleEffect(0.99)`。`.accessibilityIdentifier(spec.id)`。

### E2-3 ProfileEditSheet (Web `settings/ProfileEditSheet.tsx` 忠実)

```swift
struct ProfileEditSheet: View {
    @Binding var isPresented: Bool
    let onSaved: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var name = ""
    @State private var handle = ""
    @State private var errorText: String?
    @State private var isPending = false
    @State private var initialName = ""      // 差分判定用 (Web の me.data?.user.name)
    @State private var initialHandle = ""
}
```

- `SheetScaffold(title: "プロフィール", isPresented: $isPresented)`。`.task` で `me` から `name`/`handle` と `initial*` を埋める。
- `LabeledInput(label: "名前", text: $name)`。
- ハンドル: `LabeledInput(label: "ハンドル", text: $handle, placeholder: "your_handle")` + 下に hint `Text("半角英数字 + _ のみ (空のままで設定なし)")` (`.atenderXs`/`.textTertiary`)。**入力時に先頭 `@` を除去** (Web `value.replace(/^@/, "")`): `.onChange(of: handle) { _, v in if v.hasPrefix("@") { handle = String(v.dropFirst()) } }`。
- `errorText` があれば `Text(errorText)` を `Color.statusAbsent.opacity(0.15)` 背景 + `Radius.lg` + `.atenderSm`/`.bold`/`.statusAbsent`。
- footer: `HStack` 右寄せ — 「キャンセル」(`.ghost` → `isPresented = false`) / 「保存」(`.primary`, `isEnabled: !isPending`)。
- 保存ロジックは**純粋関数に出す** (Reviewer のテスト対象):

```swift
enum ProfileEditLogic {
    /// Web ProfileEditSheet.tsx:12-33 忠実。
    /// - handle が空でなく /^[a-zA-Z0-9_]{1,30}$/ に不一致 → .invalidHandle
    /// - trim 後 name/handle が現在値と同じ (= 送る項目ゼロ) → .noChange
    /// - それ以外 → .patch(MeUpdateInput)  (変化した項目だけ非 nil。空文字は送らない)
    enum Outcome: Equatable { case invalidHandle, noChange, patch(MeUpdateInput) }
    static func plan(name: String, handle: String, currentName: String?, currentHandle: String?) -> Outcome
    static let invalidHandleMessage = "ハンドルは半角英数字とアンダースコア (_) のみ、30 文字以内です"
}
```
View は `plan(...)` の結果で分岐: `.invalidHandle` → `errorText = ProfileEditLogic.invalidHandleMessage` (**API を叩かない**)、`.noChange` → `isPresented = false` (**API を叩かない**)、`.patch(let body)` → `try await environment.meRepository.updateMe(body)` → 成功で `onSaved()` + close / 失敗で `errorText = error.userFacingMessage` (`Core/Networking/Error+UserFacing.swift` の既存拡張)。

### E2-4 SchoolDeptEditSheet (Web `sheet/SchoolDeptEditSheet.tsx` 忠実)

```swift
struct SchoolDeptEditSheet: View {
    @Binding var isPresented: Bool
    let onSaved: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var schoolId = ""
    @State private var departmentId = ""
    @State private var isPending = false
}
```
- `SheetScaffold(title: "学校・学科")`。`.task` で `me.user.schoolId ?? ""` / `departmentId ?? ""` を埋める。
- `LabeledInput(label: "学校 ID", text: $schoolId)` / `LabeledInput(label: "学科 ID", text: $departmentId)`。
- ★ **Web は生の ID 入力欄**である (`SchoolDeptEditSheet.tsx:27-28`)。iOS で学校検索 UI に「改善」しない (忠実移植。改善は §不採用案)。
- footer: 「キャンセル」(`.ghost`) / 「保存」(`.primary`, `isEnabled: !schoolId.isEmpty && !departmentId.isEmpty && !isPending`) → `updateMe(MeUpdateInput(schoolId: schoolId, departmentId: departmentId))` → 成功で `onSaved()` + close。

### E2-5 RequiredRateSheet (Web `settings/RequiredRateSheet.tsx` 忠実)

```swift
struct RequiredRateSheet: View {
    @Binding var isPresented: Bool
    let onSaved: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var value = 70
    @State private var isPending = false
    static let presets = [60, 66, 70, 80]      // Web と同一・同順
}
```
- `SheetScaffold(title: "必要出席率")` + `stackLevel` 相当は不要 (Web の `stackLevel={1}` は既定値)。
- `.task` / `.onChange(of: isPresented)` で開いたとき `value = me.user.requiredAttendanceRate ?? 70` (Web `useEffect(open)`)。
- 本体 `VStack(alignment:.leading, spacing: Space.s4)`:
  1. `Text("必要出席率")` (`.atenderSm`/`.bold`/`.textSecondary`) + `HStack(spacing: Space.s3)` に **NumberStepper 相当** + `Text("%")` (`.atenderLg`/`.black`)。iOS に `NumberStepper` が無いので `Features/Settings/NumberStepper.swift` を新規:
     ```swift
     struct NumberStepper: View {
         @Binding var value: Int
         let min: Int          // 1
         let max: Int          // 100
         let label: String     // accessibilityLabel = "必要出席率"
     }
     ```
     `HStack` で `−` ボタン (44x44 丸, `Color.bgMuted`, `isEnabled: value > min`) / `Text("\(value)")` (`.atenderXl`/`.black`/`.monospacedDigit()`/最小幅 44) / `＋` ボタン (`isEnabled: value < max`)。クランプは純粋関数:
     ```swift
     enum NumberStepperLogic { static func clamp(_ v: Int, min: Int, max: Int) -> Int }
     ```
  2. プリセット `HStack(spacing: Space.s2)` に 4 ボタン。選択中 = `Color.accent500` + `.textOnAccent`、非選択 = `Color.bgMuted` + `.textSecondary`。Capsule、`.atenderSm`/`.bold`、`padding(.horizontal, Space.s4)`/`.vertical, Space.s2)`。
  3. `Text("全科目共通。出席率の色分けと「あと何限休めるか」の基準になります")` (`.atenderSm`/`.textTertiary`/`lineSpacing` は `Leading.relaxed`)。
- footer: 「保存」(`.primary`, **幅いっぱい** = Web `className="w-full"`, `isEnabled: !isPending`) → `updateMe(MeUpdateInput(requiredAttendanceRate: value))` → 成功で `onSaved()` + close。

### E2-6 データ層 (E2)

```swift
// Core/Data/MeRepository.swift に追加
func updateMe(_ input: MeUpdateInput) async throws -> MeResponse
// PATCH /api/me → MeResponse。
// Web usePatchMe (useMe.ts:16-27) 忠実: setData(response, for: .me()) の**後**
// cache.invalidate(prefixes: invalidationTargets(for: .meUpdate))  == [usersSearch, semesters, ["stats"]]
// ★ me 自体は setData で新値に差し替えるので invalidate しない (Web と一致)。
// ★ 成功後に await authStore.refreshMe() を**呼ばない** (呼ぶと /api/me を二度叩く)。
//    RootView の setupStatus 依存が絡む Setup (E4) だけが明示 refreshMe する。
```
`Endpoints.updateMe(_:)` は既存 (`APIEndpoint.swift:20`)。`.meUpdate` は既存 (`InvalidationMatrix.swift:63-64`)。**新規追加ゼロ**。

---

## E3 — 出欠ルール + 学期管理

### E3-1 API クライアント層 (★ここだけ層をまたぐ)

`GET/PATCH /api/attendance-rules[/:type]` は **`Endpoints` に定義ゼロ**。DTO (`AttendanceRuleDto` / `AttendanceRuleUpsertInput` / `EffectiveRuleResponse`) と `QueryKey.rules()` は実装済 (`DTOs.swift:683-707`, `QueryKey.swift:34`)。追加するのは endpoint / response wrapper / repository / mutation の 4 点。

```swift
// Core/Networking/APIEndpoint.swift の Endpoints に追加
static func attendanceRules(schoolId: String?, departmentId: String?) -> APIEndpoint {
    .init(path: "/api/attendance-rules", method: .get,
          query: compactQuery(["schoolId": schoolId, "departmentId": departmentId]))
}
static func upsertAttendanceRule(type: String, _ body: AttendanceRuleUpsertBody) -> APIEndpoint {
    .init(path: "/api/attendance-rules/\(type)", method: .patch, body: body)
}
```
★ Web `useUpsertAttendanceRule` (`useAttendanceRules.ts:20`) は body を **`{ ...ruleBody, ...scope }`** で送る (= strategy 3 つ + schoolId + departmentId が同一 body)。`AttendanceRuleUpsertInput` (strategy のみ) では足りないので**送信専用の新 DTO** を足す (既存 DTO は shared 準拠なので変えない):

```swift
// Core/Models/DTOs.swift に追加
struct AttendanceRuleUpsertBody: Codable, Equatable {
    let excusedStrategy: RuleStrategy
    let tardyStrategy: RuleStrategy
    let earlyLeaveStrategy: RuleStrategy
    let schoolId: String?
    let departmentId: String?
}
struct AttendanceRuleResponse: Codable, Equatable {   // PATCH の応答 (Web RuleResponse)
    let rule: AttendanceRuleDto
}
```

```swift
// Core/Data/RuleRepository.swift (新規)
@MainActor @Observable
final class RuleRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient
    init(client: APIClient, cache: QueryClient)

    /// GET /api/attendance-rules?schoolId&departmentId
    /// ★ Web は enabled: Boolean(schoolId && departmentId) — どちらか nil なら**叩かない**。
    ///   iOS も schoolId/departmentId のいずれかが nil/空なら nil を返し送信しない。
    func attendanceRules(schoolId: String?, departmentId: String?, force: Bool = false) async throws -> EffectiveRuleResponse?
    /// PATCH /api/attendance-rules/user  (Settings からは常に type="user"。Web Settings.tsx:11 が "user" 固定)
    func upsertUserRule(_ input: AttendanceRuleUpsertInput, schoolId: String?, departmentId: String?) async throws -> AttendanceRuleDto
}
```
- GET のキャッシュキーは `QueryKey(["attendance-rules", schoolId ?? "none", departmentId ?? "none"])`。`.rules()` = `["attendance-rules"]` は **prefix** として invalidate に使う。
- upsert 成功後 `cache.invalidate(prefixes: invalidationTargets(for: .attendanceRuleUpsert))`。

```swift
// Core/Data/InvalidationMatrix.swift
enum Mutation {  … case attendanceRuleUpsert   // ★追加
}
case .attendanceRuleUpsert:
    return [.rules()]      // Web useAttendanceRules.ts:21 = invalidateQueries({queryKey:["attendance-rules"]}) と一致
```
`AppEnvironment` に `let ruleRepository: RuleRepository` を追加・配線。

### E3-2 AttendanceRuleSheet (Web `sheet/AttendanceRuleSheet.tsx` 忠実)

```swift
struct AttendanceRuleSheet: View {
    @Binding var isPresented: Bool
    let onSaved: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var excused: RuleStrategy = .reduceDenominator   // Web の初期値と一致
    @State private var tardy: RuleStrategy = .halfPresent
    @State private var earlyLeave: RuleStrategy = .halfPresent
    @State private var isPending = false
}
```
- `SheetScaffold(title: "出欠ルール")`。`.task` / `.onChange(of: isPresented)`: `me.user.schoolId`/`departmentId` で `attendanceRules(...)` → `effective` の 3 値を反映 (Web `useEffect([rules.data?.effective, open])`)。**取得できないとき (nil) は上記初期値のまま**。
- 3 フィールド (Web と同順・同ラベル): 「公欠」→`excused` / 「遅刻」→`tardy` / 「早退」→`earlyLeave`。各 `Picker(selection:)` (`.menu` スタイル) の選択肢は **`RuleStrategy.allCases` から `.unknown` を除いた 5 件を Web `RULE_STRATEGY` と同順で**:
  ```swift
  enum RuleStrategyOptions {
      /// Web packages/shared の RULE_STRATEGY 配列順と一致させる。unknown は含めない。
      static let all: [RuleStrategy] = [.countAsPresent, .countAsAbsent, .halfPresent, .reduceDenominator, .separateCount]
      /// Web components/ui の ruleLabels と一致
      static func label(_ s: RuleStrategy) -> String
  }
  ```
  ★ `RuleStrategy` は `UnknownFallbackRawRepresentable` で `.unknown` を持つ (`Enums.swift:73-80`)。**`.unknown` を Picker に出さない**こと。ラベル文言は Developer が `apps/web/src/components/ui` の `ruleLabels` を読んで 1:1 で写す (本 doc で手書きすると errata 化するため写像規則のみ規定 — architect ノート「導出値の手計算を doc に書かない」)。
- footer: 「キャンセル」(`.ghost`) / 「保存」(`.primary`) → `upsertUserRule(AttendanceRuleUpsertInput(excusedStrategy:tardyStrategy:earlyLeaveStrategy:), schoolId:, departmentId:)` → 成功で `onSaved()` + close。
- ★ Web の保存ボタンは `disabled` を持たない (`AttendanceRuleSheet.tsx:33`)。iOS も `isEnabled` を付けない (忠実)。

### E3-3 SemesterListSheet (Web `sheet/SemesterListSheet.tsx` 忠実)

```swift
struct SemesterListSheet: View {
    @Binding var isPresented: Bool
    let onChanged: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var semesters: [SemesterDto] = []
    @State private var defaultSemesterId: String?
    @State private var editingId: String?
    @State private var editForm = SemesterForm()
    @State private var newForm = SemesterForm()
    @State private var isPending = false

    struct SemesterForm: Equatable { var name = ""; var startDate = ""; var endDate = "" }
}
```
- `SheetScaffold(title: "学期管理")`、footer は**無し** (Web は footer prop 未使用 = 追加フォームが本文内)。`SheetScaffold` の footer に `EmptyView()` を渡す。
- 各学期行 = `Color.clear` + `Radius.sm` + `.overlay(stroke(Color.borderSubtle))` + `padding(Space.s3)`:
  - **非編集時**: 左に tap 可能な `VStack(alignment:.leading)` — `Text(semester.name)` (`.atenderBase`/`.semibold`) / `Text(SemesterListLogic.subtitle(semester, defaultSemesterId:))` (`.atenderXs`/`.textSecondary`)。tap → `updateMe(MeUpdateInput(defaultSemesterId: semester.id))` (Web `patchMe.mutate({defaultSemesterId})`)。右に `AtenderButton("編集", variant:.ghost, size:.sm)` → `startEditing(semester)` / `AtenderButton("削除", variant:.ghost, size:.sm)` → `deleteSemester(id:)`。
    ★ Web は削除に確認ダイアログを**出さない** (`SemesterListSheet.tsx:59` が直接 `remove.mutate`)。iOS も確認を足さない (忠実移植)。
  - **編集時** (`editingId == semester.id`): `LabeledInput(label:"学期名", text:$editForm.name)` / 「開始日」「終了日」の `DatePicker(selection:, displayedComponents: .date)` (`.compact`)。`HStack` 右寄せに `AtenderButton("保存", variant:.primary, size:.sm, isEnabled: !SemesterListLogic.saveDisabled(editForm) && !isPending)` / `AtenderButton("キャンセル", variant:.ghost, size:.sm)` → `editingId = nil`。
- 下部 (Web `border-t border-border-subtle pt-5` の追加フォーム): 区切り線 + `LabeledInput(label:"学期名", text:$newForm.name)` + 開始日/終了日 DatePicker + `AtenderButton("学期を追加", variant:.primary, isEnabled: SemesterListLogic.createEnabled(newForm))` → 成功で `newForm = SemesterForm()` + reload。
- 純粋ロジック:
```swift
enum SemesterListLogic {
    /// Web SemesterListSheet.tsx:55 = "{start} - {end}" + (default 一致なら " / 現在")
    static func subtitle(_ s: SemesterDto, defaultSemesterId: String?) -> String
    /// Web :36 = !name.trim() || startDate > endDate  (isPending は View 側で OR)
    static func saveDisabled(_ f: SemesterForm) -> Bool
    /// Web :73 = name && startDate && endDate が全て非空
    static func createEnabled(_ f: SemesterForm) -> Bool
    /// Web :24-28 = 現在値と異なる項目だけを詰めた SemesterUpdateInput
    /// (name は trim 後非空のときのみ。startDate/endDate は != のとき)
    static func updateBody(form: SemesterForm, current: SemesterDto) -> SemesterUpdateInput
}
```
★ 日付は `DatePicker` の `Date` と API の `"yyyy-MM-dd"` 文字列を跨ぐ。**`CalendarRange` (UTC 固定, `Core/Timetable/TimetableLogic.swift`) の既存 `yyyyMMdd`/`parse` を使う** (端末 tz で日付がずれる非決定性を持ち込まない。Phase D の `RoomEventTiming` 決定と同じ理由)。`SemesterForm` は `String` (`"yyyy-MM-dd"`) を保持し、View で `CalendarRange.parse` / `CalendarRange.yyyyMMdd` を挟む。

### E3-4 SemesterRepository に CRUD 追加

```swift
// Core/Data/Repositories.swift の SemesterRepository に追加
func createSemester(_ input: SemesterCreateInput) async throws -> SemesterDto
    // POST /api/semesters → SemesterResponse。inv: invalidationTargets(for: .semesterCreate) == [semesters]
func updateSemester(id: String, _ input: SemesterUpdateInput) async throws -> SemesterDto
    // PATCH /api/semesters/:id → SemesterResponse。inv: .semesterUpdate == [semesters]
func deleteSemester(id: String) async throws
    // DELETE /api/semesters/:id。inv: .semesterDelete == [semesters, stats, day, today, user-timetables]
```
`Endpoints.createSemester/updateSemester/deleteSemester` は既存 (`APIEndpoint.swift:32,34,35`)。`Mutation.semesterCreate/.semesterUpdate/.semesterDelete` も既存。**新規追加ゼロ**。

### E3-5 SettingsView に 2 行追加

「出席」セクションに `出欠ルール` / `学期管理` の行を追加し、`activeSheet` の `.rules` / `.semesters` に対応するシートを sheet host の `switch` に足す (**兄弟 `.sheet` を増やさない**)。

---

## E4 — Setup 3 ステップ

`App/RootView.swift:67-95` の暫定 `SetupFlowView` (「初期設定 (実装予定)」) を**削除**し、`Features/Setup/SetupFlowView.swift` の実体に**置換**する。`RootView` の分岐 (`me?.setupStatus.isComplete == false → SetupFlowView()`) は**そのまま**。

```swift
// Features/Setup/SetupFlowView.swift (新規)
struct SetupFlowView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var model: SetupViewModel?
}

@MainActor @Observable
final class SetupViewModel {
    @ObservationIgnored private let env: AppEnvironment
    init(env: AppEnvironment)

    var step: Int = 1                      // 1...3
    var schoolQuery = ""
    var prefecture = ""                    // "" = 未選択
    var departmentQuery = ""
    private(set) var schools: [SchoolDto] = []
    private(set) var departments: [DepartmentDto] = []
    var school: SchoolDto?
    var department: DepartmentDto?
    var semester = SemesterDraft(name: "2026 前期", startDate: "2026-04-01", endDate: "2026-09-30")   // Web と同一既定値
    private(set) var busy = false
    var errorText: String?

    struct SemesterDraft: Equatable { var name: String; var startDate: String; var endDate: String }

    func searchSchools() async                     // GET /api/schools?q&prefecture&limit=20
    func loadDepartments() async                   // school != nil のときのみ GET /api/schools/:id/departments?q&limit=50
    func addSchool() async                         // schoolQuery 非空のみ。POST /api/schools → school = 結果; step = 2
    func addDepartment() async                     // departmentQuery 非空 && school != nil のみ。POST → department = 結果 (step は進めない)
    func submitDepartment() async                  // school && department 必須。PATCH /api/me {schoolId, departmentId}; step = 3
    func submitSemester() async                    // school && department 必須。POST /api/semesters → PATCH /api/me {defaultSemesterId}
                                                   //   → await env.authStore.refreshMe()  ← ★ Web の navigate({to:"/timetable"}) 相当
    static let prefectures: [String]               // Web Setup.tsx:7 の固定 10 件 + 先頭 "" を同順で
    var title: String { "Step \(step)/3: " + (step == 1 ? "学校を選ぶ" : step == 2 ? "学科を選ぶ" : "学期を作る") }
}
```

- ★ **Web の `navigate({to:"/timetable"})` → `/timetable` は `/` へ redirect** (`router.tsx:67`)。iOS に画面遷移コードは**書かない**: `refreshMe()` で `me.setupStatus.isComplete` が true になると `RootView` が `MainTabView` に切り替わる。`.designs/20260612-setup-deadlock-fix.md` の確定どおり完了条件は `schoolId && departmentId && defaultSemesterId` (時間割不問) なので、step3 完了で必ず true になる。
- レイアウト: `ScrollView` + `PageTitle` 相当 (`Text("セットアップ")` `.atender3xl`/`.black` + `Text(model.title)` `.atenderSm`/`.textSecondary`) + `Panel { … }`。Web `mx-auto max-w-3xl py-6`。`.accessibilityIdentifier("setup-flow")`。
- **Step1**: `LabeledInput(label:"", text:$model.schoolQuery, placeholder:"学校名で検索")` + 都道府県 `Picker` (`SetupViewModel.prefectures`、`""` の表示は "都道府県")。検索は **`.task(id: "\(schoolQuery)|\(prefecture)")` + 300ms デバウンス** (Phase D の TemplatesView と同型)。結果は各行 `Button("○ \(school.name)")` (左寄せ、`Radius.sm` + `stroke(Color.borderSubtle)` + `padding(Space.s3)`) → `school = item; step = 2`。下部に `AtenderButton("＋ リストに無い学校を追加", isEnabled: !schoolQuery.isEmpty && !busy)` → `addSchool()`。
  - `addSchool` の body は Web と同一: `SchoolCreateInput(name: schoolQuery, nameKana: nil, kind: .other, prefecture: prefecture.isEmpty ? nil : prefecture)`。
- **Step2** (`school != nil` のとき): `LabeledInput(placeholder: "\(school.name) の学科名で検索", text: $model.departmentQuery)`。結果行は選択中なら `stroke(Color.accent500)` + `Color.accent50` 背景、それ以外 `stroke(Color.borderSubtle)`。tap → `department = item` (**step は進めない**)。下部 `HStack`: `AtenderButton("戻る", variant:.ghost)` → `step = 1` / `AtenderButton("＋ 学科を追加", isEnabled: !departmentQuery.isEmpty && !busy)` → `addDepartment()` / `AtenderButton("次へ", variant:.primary, isEnabled: department != nil && !busy)` → `submitDepartment()`。
- **Step3**: `LabeledInput(label:"名前", text:$model.semester.name)` / 「開始日」「終了日」の `DatePicker` (E3-3 と同じ `CalendarRange` 経由の String 変換)。`HStack`: `AtenderButton("戻る", variant:.ghost)` → `step = 2` / `AtenderButton("完了して時間割を作る", variant:.primary, isEnabled: !busy)` → `submitSemester()`。
- `errorText` があれば Panel 内先頭に赤バナー (E2-3 と同スタイル)。Web は Setup にエラー表示を持たないが、**iOS には URL バーが無く失敗が無言だと詰む**ため追加する — これは唯一の意図的な additive。理由: 忠実移植の対象は「機能と IA」であり、Web ではネットワーク失敗が devtools で見えるのに対し iOS では観測不能になるため。
- `SchoolRepository` (新規, `Core/Data/SchoolRepository.swift`):
```swift
@MainActor @Observable
final class SchoolRepository {
    init(client: APIClient, cache: QueryClient)
    func schools(_ query: SchoolSearchQuery, force: Bool = false) async throws -> [SchoolDto]
        // GET /api/schools → SchoolsResponse。key QueryKey(["schools", <q>, <prefecture>, <kind>])
    func createSchool(_ input: SchoolCreateInput) async throws -> SchoolDto
        // POST /api/schools → SchoolResponse。inv [.schools()]   (Web useCreateSchool: ["schools"])
    func departments(schoolId: String, q: String?, force: Bool = false) async throws -> [DepartmentDto]
        // GET /api/schools/:id/departments?q&limit=50 → DepartmentsResponse。key .departments(schoolId) + q
    func createDepartment(schoolId: String, _ input: DepartmentCreateInput) async throws -> DepartmentDto
        // POST → DepartmentResponse。inv [.departments(schoolId)]  (Web: ["departments", schoolId])
}
```
`Endpoints.schools/createSchool/departments/createDepartment` は既存 (`APIEndpoint.swift:22-29`)。`QueryKey.schools()/.departments(_:)` も既存。**追加が要る response wrapper**:
```swift
// Core/Models/DTOs.swift に追加 (SchoolsResponse/DepartmentsResponse は既存、単数形が無い)
struct SchoolResponse: Codable, Equatable { let school: SchoolDto }
struct DepartmentResponse: Codable, Equatable { let department: DepartmentDto }
```
`Mutation` に `.schoolCreate` / `.departmentCreate(schoolId: String)` を追加し `invalidationTargets` を拡張:
| Mutation | invalidate | 出典 |
|---|---|---|
| `.schoolCreate` | `.schools()` | `useSchools.ts:18` |
| `.departmentCreate(schoolId)` | `.departments(schoolId)` | `useSchools.ts:34` |

`AppEnvironment` に `let schoolRepository: SchoolRepository` を追加・配線 (E2 で `SchoolDeptEditSheet` は ID 直入力なので School 検索は使わない → **E4 で初導入**)。

---

## E5 — SettingsCalendar + TitleRuleEditor

### E5-1 ナビゲーション (push。Bible §2.3 `/settings/calendar`)

```swift
// App/AppRouter.swift に追加
enum SettingsRoute: Hashable { case calendar }
```
```swift
// App/MainTabView.swift  case .settings を置換
case .settings:
    NavigationStack(path: $bindableRouter.settingsPath) {
        SettingsView()
            .navigationDestination(for: SettingsRoute.self) { route in
                switch route {
                case .calendar: SettingsCalendarView()
                }
            }
    }
```
- Web は `/settings/calendar` の「戻る」で `/` (ホーム) へ行く (`SettingsCalendar.tsx:25`) が、**iOS は NavigationStack の自然な pop (= 設定タブへ戻る) を採る**。これはマスターアーキ §1.2.2 で既に確定済の決定 (「親タブ = 設定なので忠実」) — 本 Phase で覆さない。
- Web の `/settings/integrations/google` も同じ `SettingsCalendar` component (`router.tsx:64`)。iOS では **linkSocial の callbackURL が `atender://google-linked` になるので route を増やさない** (§E6)。

### E5-2 SettingsCalendarView (Web `routes/SettingsCalendar.tsx` 忠実)

```swift
struct SettingsCalendarView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
}
```
- レイアウト `ScrollView` + `VStack(alignment:.leading, spacing: Space.s4)` + `.padding(Space.s4)` + `.padding(.bottom, Space.tabBarHeight)`。`.navigationBarHidden(true)`、`.accessibilityIdentifier("settings-calendar")`。
- 先頭に `BackHeaderButton` (`Core/DesignSystem/Components/BackHeaderButton.swift` 既存) → `dismiss()`。Web の `<Button variant="ghost">戻る</Button>` に対応。
- 中身 (Web の順序どおり):
  1. `Panel { GoogleCalendarSection() }` (Web `rounded-3xl bg-bg-elevated p-5 shadow-card`)。**E5 時点では `GoogleCalendarSection` が未実装なので、E5 ではこのブロックを置かない**。E6 で挿入する。
  2. `TitleRuleEditor()`
- Web の `?linked=1` → `useCompleteGoogleLink` 相当は **iOS には存在しない** (link 完了は `GoogleLinkService.startLink()` の戻りで同期的に分かる → E6 で `GoogleCalendarSection` 内で `completeLink()` を呼ぶ)。`SettingsCalendarView` に URL パラメータ解釈を持ち込まない。

### E5-3 TitleRuleEditor (Web `ics-import/TitleRuleEditor.tsx` 忠実)

```swift
struct TitleRuleEditor: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var rules: [IcsTitleRuleDto] = []
    @State private var editing: Editing?
    @State private var form = TitleRuleForm.empty
    @State private var isPending = false

    enum Editing: Equatable, Identifiable {
        case new
        case existing(IcsTitleRuleDto)
        var id: String { if case .existing(let r) = self { return r.id } else { return "new" } }
    }
}

struct TitleRuleForm: Equatable {
    var matchType: IcsMatchType = .contains
    var pattern: String = ""
    var replaceWith: String? = "予定"
    var visibilityMode: VisibilityMode = .titleMapped
    var priority: Int = 100
    /// Web TitleRuleEditor.tsx:7-13 の emptyRule と同一
    static let empty = TitleRuleForm()
    static func from(_ rule: IcsTitleRuleDto) -> TitleRuleForm
}
```
- ★ **編集フォームはインライン**である (Web は `editing` があれば一覧の**下にカードを出す**、シートでない)。iOS もシート化しない (忠実)。→ **本 Phase で唯一シートを使わない編集 UI**。
- header `HStack`: 左 `VStack(alignment:.leading)` — `Text("カレンダー設定")` (`.atender2xl`/`.black`) + `Text("import した予定のタイトルを置き換えます。")` (`.atenderSm`/`.semibold`/`.textSecondary`)。右 `AtenderButton("新規ルール", variant:.primary)` → `editing = .new; form = .empty`。
- ルール行 (`Color.bgElevated` + `Radius.lg` + `.atenderShadow(.card)` + `padding(Space.s4)`):
  - `Text("\(rule.pattern) → \(rule.replaceWith ?? "予定")")` (`.atenderSm`/`.black`/`lineLimit(1)`)
  - `Text("\(rule.matchType.rawValue) / \(rule.visibilityMode.rawValue) / 優先度 \(rule.priority)")` (`.atenderXs`/`.semibold`/`.textTertiary`)。★ Web はここで**生の enum 値**を出す (`{rule.matchType} / {rule.visibilityMode}`)。日本語化しない (忠実)。`.unknown` の rawValue が `"unknown"` になる点も許容。
  - 右に `AtenderButton("編集", variant:.secondary, size:.sm, isEnabled: !rule.isDefault)` → `editing = .existing(rule); form = .from(rule)` / `AtenderButton("削除", variant:.ghost, size:.sm)` → `delete(rule.id)` (**確認なし**。Web `:65` 準拠)。
- 編集カード (`editing != nil` のとき、一覧の下):
  - 見出し `Text(editing == .new ? "ルールを追加" : "ルールを編集")` (`.atenderLg`/`.black`)
  - 「種別」`Picker`: 完全一致=`.equals` / 部分一致=`.contains` / 正規表現=`.regex` (Web と同順・同文言。`.unknown` は出さない)
  - 「パターン」`LabeledInput` (required)
  - 「置換後」`LabeledInput`。**空文字は `nil` として送る** (Web `event.currentTarget.value || null`)
  - 「表示モード」`Picker`: 通常=`.normal` / タイトル隠す=`.titleMapped` / 予定ありのみ=`.busyOnly`
  - 「優先度」`NumberStepper(value: $form.priority, min: 0, max: 9998, label: "優先度")` (E2-5 で作った部品を再利用。Web は `type="number" min=0 max=9998`)
  - `HStack` 右寄せ: 「キャンセル」(`.ghost` → `editing = nil`) / 「保存」(`.primary`, `isEnabled: !form.pattern.trimmed.isEmpty`) → save
- save (Web `:34-41` 忠実): `form.pattern` が trim 後空なら**何もしない** (早期 return)。`.new` → `createIcsTitleRule(form)` / `.existing(let r)` → `patchIcsTitleRule(id: r.id, form)`。成功で `editing = nil` + reload。

### E5-4 IcsTitleRuleRepository (新規)

```swift
// Core/Data/IcsTitleRuleRepository.swift
@MainActor @Observable
final class IcsTitleRuleRepository {
    init(client: APIClient, cache: QueryClient)
    func rules(force: Bool = false) async throws -> [IcsTitleRuleDto]           // GET  key .icsTitleRules()
    func create(_ input: IcsTitleRuleInput) async throws -> IcsTitleRuleDto     // POST   inv [.icsTitleRules()]
    func patch(id: String, _ input: IcsTitleRuleInput) async throws -> IcsTitleRuleDto  // PATCH inv [.icsTitleRules()]
    func delete(id: String) async throws                                        // DELETE inv [.icsTitleRules()]
}
```
```swift
// Core/Models/DTOs.swift に追加 (Web useIcsTitleRules.ts:6-12 の TitleRuleInput)
struct IcsTitleRuleInput: Codable, Equatable {
    let matchType: IcsMatchType
    let pattern: String
    var replaceWith: String?       // null 送信あり (nil を JSON null で送るため encodeIfPresent でなく明示 encode)
    var visibilityMode: VisibilityMode?
    var priority: Int?
}
```
★ `replaceWith` は **`nil` を「キー省略」でなく `null` として送る**必要がある (Web は `replaceWith: null` を明示送信)。Swift の既定 `Encodable` は Optional nil を**キーごと省略**するので、`IcsTitleRuleInput` に `encode(to:)` を手書きし `try container.encode(replaceWith, forKey: .replaceWith)` (encodeIfPresent でない) とする。`visibilityMode`/`priority` は `encodeIfPresent` で可 (Web も optional)。

```swift
// Core/Networking/APIEndpoint.swift の Endpoints に追加 (既存は GET のみ)
static func createIcsTitleRule(_ body: IcsTitleRuleInput) -> APIEndpoint { .init(path: "/api/me/ics-title-rules", method: .post, body: body) }
static func patchIcsTitleRule(id: String, _ body: IcsTitleRuleInput) -> APIEndpoint { .init(path: "/api/me/ics-title-rules/\(id)", method: .patch, body: body) }
static func deleteIcsTitleRule(id: String) -> APIEndpoint { .init(path: "/api/me/ics-title-rules/\(id)", method: .delete) }
```
`Mutation` に `.icsTitleRule` を追加 → `invalidationTargets` は `[.icsTitleRules()]` (Web `useIcsTitleRules.ts:25,33,41` の 3 mutation とも同一)。`AppEnvironment` に配線。

### E5-5 SettingsView に「カレンダー設定 (ICS 等)」行を追加

「カレンダー連携」セクションを新設し、**E5 では 1 行だけ** (`カレンダー設定 (ICS 等)` → push)。`Google Calendar 連携` 行は E6 で足す (Web の順序では Google が上なので、E6 で**先頭に挿入**する)。

---

## E6 — Google Calendar 連携

API 側は §論点 3 の設計どおり。以下は iOS 側。

### E6-1 GoogleRepository (新規)

```swift
// Core/Data/GoogleRepository.swift
@MainActor @Observable
final class GoogleRepository {
    init(client: APIClient, cache: QueryClient)

    func connection(force: Bool = false) async throws -> GoogleCalendarConnectionDto?
        // GET /api/me/google-calendar/connection → GoogleConnectionResponse。key .googleConnection()
        // ★ connection は null あり得る (Web `connection.data?.connection ?? null`)
    func completeLink() async throws -> GoogleCalendarConnectionDto
        // POST /api/me/google-calendar/link/complete → GoogleConnectionRequiredResponse
        // inv: [.googleConnection(), .googleCalendars()]        (Web useCompleteGoogleLink)
    func unlink(deleteEvents: Bool) async throws -> GoogleUnlinkResult
        // DELETE /api/me/google-calendar/connection?deleteEvents=true|false
        // inv: [.googleConnection(), .googleCalendars(), .rooms()]   (Web useUnlinkGoogleCalendar)
    func calendars(force: Bool = false) async throws -> [GoogleListedCalendarDto]
        // GET /api/me/google-calendar/calendars → GoogleCalendarsResponse。key .googleCalendars()
        // ★ Web は enabled: connection.status === "ACTIVE" — 呼び出し側が status を確認してから呼ぶ
    func syncAll() async throws -> GoogleSyncAllResult
        // POST /api/me/google-calendar/sync-all
        // inv: [.googleConnection(), .rooms()]                  (Web useRunAllGoogleSyncs)
    func syncs(roomId: String, force: Bool = false) async throws -> [GoogleCalendarSyncDto]
        // GET /api/rooms/:id/google-calendar-syncs → GoogleSyncsResponse。key .googleSyncs(roomId)
    func createSync(roomId: String, _ input: CreateGoogleSyncInput) async throws -> GoogleCalendarSyncDto
        // inv: [.googleSyncs(roomId), .room(roomId)]            (Web useCreateGoogleSync)
    func updateSync(roomId: String, syncId: String, _ input: UpdateGoogleSyncInput) async throws -> GoogleCalendarSyncDto
        // inv: [.googleSyncs(roomId), .room(roomId)]
    func deleteSync(roomId: String, syncId: String, deleteEvents: Bool) async throws
        // DELETE /api/rooms/:id/google-calendar-syncs/:syncId?deleteEvents=…  inv: [.googleSyncs(roomId), .room(roomId)]
    func runSync(roomId: String, syncId: String) async throws -> GoogleRunSyncResult
        // inv: [.googleSyncs(roomId), .room(roomId)]
}
```
★ Web の `["rooms", roomId]` invalidate は `.room(roomId)` = `["rooms", roomId]` と一致し、prefix 一致で `roomWeek`/`roomMembers`/`googleSyncs` も stale 化する。**これは Web の TanStack と同一挙動** (TanStack も prefix 一致) なので忠実。

**追加 DTO / response wrapper** (`Core/Models/DTOs.swift`):
```swift
struct GoogleConnectionResponse: Codable, Equatable { let connection: GoogleCalendarConnectionDto? }   // nullable
struct GoogleConnectionRequiredResponse: Codable, Equatable { let connection: GoogleCalendarConnectionDto }  // link/complete の 201
struct GoogleCalendarsResponse: Codable, Equatable { let calendars: [GoogleListedCalendarDto] }
struct GoogleSyncsResponse: Codable, Equatable { let syncs: [GoogleCalendarSyncDto] }
struct GoogleSyncResponse: Codable, Equatable { let sync: GoogleCalendarSyncDto }
struct GoogleUnlinkResult: Codable, Equatable { let ok: Bool; let deletedEvents: Int }
struct GoogleRunSyncResult: Codable, Equatable { let ok: Bool; let upserted: Int?; let deleted: Int?; let error: String? }
struct GoogleSyncAllResult: Codable, Equatable {
    let count: Int
    let results: [Item]
    struct Item: Codable, Equatable { let syncId: String; let ok: Bool; let error: String? }
}
```
**追加 Endpoints**:
```swift
static func unlinkGoogleConnection(deleteEvents: Bool) -> APIEndpoint {
    .init(path: "/api/me/google-calendar/connection", method: .delete, query: ["deleteEvents": deleteEvents ? "true" : "false"])
}
static func deleteGoogleSync(roomId: String, syncId: String, deleteEvents: Bool) -> APIEndpoint {
    .init(path: "/api/rooms/\(roomId)/google-calendar-syncs/\(syncId)", method: .delete, query: ["deleteEvents": deleteEvents ? "true" : "false"])
}
```
他 (`googleConnection`/`googleCalendars`/`completeGoogleLink`/`googleSyncAll`/`googleSyncs`/`createGoogleSync`/`updateGoogleSync`/`runGoogleSync`) は**既存定義をそのまま使う** (`APIEndpoint.swift:132-146`)。
**追加 Mutation**: `.googleLinkComplete` / `.googleUnlink` / `.googleSyncAll` / `.googleSync(roomId: String)` — targets は上記 repository のコメントどおり。

### E6-2 GoogleCalendarSection (Web `avatar/GoogleCalendarSection.tsx` 忠実)

```swift
struct GoogleCalendarSection: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var connection: GoogleCalendarConnectionDto?
    @State private var isLoading = true
    @State private var isLinking = false
    @State private var isRunningAll = false
    @State private var errorText: String?
    @State private var unlinkOpen = false
}
```
3 状態を Web と同一分岐で出す:

| 条件 | 表示 (Web 対応行) |
|---|---|
| `isLoading` | `ListSkeleton(rows: 2)` 相当 = `VStack(spacing: Space.s3){ Skeleton(width:nil, height:56, radius: Radius.md) ×2 }` (`:14-16`) |
| `connection == nil` | 48x48 角丸 (`Radius.md`) `Color.accent500.opacity(0.15)` に `Image(systemName:"calendar")` (`.accent500`) / `Text("Google Calendar 連携")` (`.atenderLg`/`.black`) / `Text("読み取り専用で Google Calendar の予定を取り込み、ルームごとに表示範囲を選べます。")` (`.atenderSm`/`.textSecondary`) / `AtenderButton("Google Calendar と連携する", variant:.primary, isEnabled: !isLinking)` → `link()` (`:18-33`) |
| `connection.status == .revoked` | 48x48 `Color.statusAbsent.opacity(0.15)` に `Image(systemName:"exclamationmark.triangle.fill")` (`.statusAbsent`) / `Text("認可が無効になりました")` (`.atenderLg`/`.black`) / `Text("Google アカウント側の認可を確認し、もう一度連携してください。")` / `AtenderButton("もう一度連携する", variant:.primary, isEnabled: !isLinking)` → `link()` (`:36-51`) |
| それ以外 (= ACTIVE / ERROR) | 下記 (`:53-76`) |

- 連携中ブロック: `HStack(alignment:.top, spacing: Space.s3)` を `Color.bgMuted` + `Radius.md` + `padding(Space.s4)` — `Image(systemName:"checkmark.shield.fill")` (`.accent500`) + `VStack(alignment:.leading)` に `Text("連携中")` (`.atenderSm`/`.black`) / `Text(connection.googleEmail)` (`.atenderXs`/`.textSecondary`/`lineLimit(1)`) / `Text("最後の同期: \(GoogleFormat.lastSynced(connection.lastSyncedAt))")` (`.atenderXs`/`.textTertiary`)。
- 説明ブロック: `Color.bgMuted` + `Radius.md` に `Text("ルームごとに、どの Google カレンダーをどの表示モードで取り込むかを選びます。")` (`.atenderSm`/`.bold`/`.textSecondary`)。
- ボタン行: `AtenderButton("今すぐ同期", systemImage:"arrow.clockwise", variant:.secondary, isEnabled: !isRunningAll)` → `syncAll()` / `AtenderButton("連携を解除する", variant:.ghost)` → `unlinkOpen = true`。
- `errorText` (link / syncAll の失敗) は赤バナー。
- 純粋関数:
```swift
enum GoogleFormat {
    /// Web GoogleCalendarSection.tsx:79-82 / RoomGoogleSyncSection.tsx:146-149 の formatDate 忠実。
    /// nil → "未同期"。それ以外は ISO8601 を **JST 固定**で "M/d HH:mm" 相当に整形。
    /// ★ Web は toLocaleString("ja-JP", {month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})
    ///   = 端末ロケール依存。iOS は JP 前提で JST/ja_JP 固定にしテスト決定性を確保 (Phase D RoomEventTiming と同じ判断)。
    static func lastSynced(_ iso: String?) -> String
    /// Web RoomGoogleSyncSection.tsx:132-136
    static func visibilityLabel(_ v: VisibilityMode) -> String   // NORMAL→"そのまま表示" / BUSY_ONLY→"予定ありのみ" / それ以外→"タイトル正規化"
    /// Web RoomGoogleSyncSection.tsx:138-144
    static func syncStatusLabel(_ s: GoogleSyncStatus) -> String // OK→"同期済み" / FAILED→"失敗" / SYNCING→"同期中" / REVOKED→"認可切れ" / それ以外→"待機中"
}
```
- `link()`:
```swift
private func link() async {
    isLinking = true; errorText = nil
    defer { isLinking = false }
    do {
        try await environment.googleLinkService.startLink()          // ①②③
        connection = try await environment.googleRepository.completeLink()   // ④ (Web の ?linked=1 と等価)
    } catch GoogleLinkService.LinkError.cancelled {
        // ユーザーキャンセルは無言 (Web も consent 画面を閉じたら何も出ない)
    } catch {
        errorText = error.userFacingMessage
    }
}
```
- `.task` で `connection = try? await environment.googleRepository.connection()`; `isLoading = false`。
- `.sheet(isPresented: $unlinkOpen) { GoogleCalendarConnectSheet(isPresented: $unlinkOpen, onUnlinked: { connection = nil }) }` — **本 View 内で唯一の sheet** なので単独 `.sheet(isPresented:)` で可。ただし `GoogleCalendarSection` は「設定タブの `.google` シートの中身」としても使われる = **シートの中のシート**になる。`stackLevel: 2` 相当を `SheetScaffold` に渡す必要はないが (SheetScaffold は stackLevel を持たない)、**入れ子 sheet が SwiftUI で 1 段しか出ないという gotcha はネストでは起きない** (親子関係で階層が分かれるため。Phase D の `RoomSettingsSheet` → `IcsImportWizard` が実証済)。

### E6-3 GoogleCalendarConnectSheet (Web `avatar/GoogleCalendarConnectSheet.tsx` = 解除シート)

```swift
struct GoogleCalendarConnectSheet: View {
    @Binding var isPresented: Bool
    let onUnlinked: () -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var deleteEvents = true          // Web 既定 true
    @State private var isPending = false
    @State private var errorText: String?
}
```
- `SheetScaffold(title: "Google Calendar の連携を解除")`。
- `Text("解除すると以降の同期が止まります。")` (`.atenderSm`/`.textSecondary`)。
- `Text("取り込んだ予定の扱い")` (`.atenderXs`/`.bold`/`.textTertiary`/`.textCase(.uppercase)`/`tracking`)。
- 2 択ラジオ (`Color.bgMuted` + `Radius.lg` + `padding(Space.s4)` の `Button`。選択中に `Image(systemName:"largecircle.fill.circle")`、非選択に `"circle"`):
  - `deleteEvents = true`: 「取り込んだ予定も削除する」(`.atenderSm`/`.black`) + 「ルーム上の Google 由来予定を削除します。」(`.atenderXs`/`.textSecondary`)
  - `deleteEvents = false`: 「ルームに残す」+ 「解除後も表示されますが、Google 側の変更は反映されません。」
- footer: 「キャンセル」(`.ghost`) / 「解除する」(`.destructive`, `isEnabled: !isPending`) → `unlink(deleteEvents:)` → 成功で `onUnlinked()` + close / 失敗で `errorText`。
- ★ Web は確認ダイアログを重ねない (このシート自体が確認)。iOS も足さない。

### E6-4 GoogleCalendarSelectorSheet (Web `avatar/GoogleCalendarSelectorSheet.tsx`)

```swift
struct GoogleCalendarSelectorSheet: View {
    let roomId: String
    @Binding var isPresented: Bool
    let onAdded: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var calendars: [GoogleListedCalendarDto] = []
    @State private var syncedIds: Set<String> = []
    @State private var selected: String?
    @State private var visibilityMode: VisibilityMode = .titleMapped    // Web 既定
    @State private var isLoading = true
    @State private var isPending = false
    @State private var errorText: String?
}
```
- `SheetScaffold(title: "どのカレンダーを同期しますか")`。
- `.task`: `calendars = (try? await googleRepository.calendars()) ?? []`; `syncedIds = Set((try? await googleRepository.syncs(roomId: roomId))?.map(\.googleCalendarId) ?? [])`; `isLoading = false`。
- セクション1「あなたの Google カレンダー」(`.atenderXs`/`.bold`/`.textTertiary`/uppercase)。`isLoading` → Skeleton ×3。各カレンダー行 = `Button` (`Color.bgMuted` + `Radius.lg` + `padding(Space.s4)`): ラジオ + `VStack` に `Text(calendar.summary)` (`.atenderSm`/`.black`/`lineLimit(1)`) / `Text(calendar.primary ? "primary" : calendar.timeZone)` (`.atenderXs`/`.textSecondary`)。`syncedIds.contains(calendar.id)` なら `.opacity(0.5)` + `.disabled(true)` + 右端に「同期中」pill (`Color.textPrimary.opacity(0.08)`, `.atender(11,.bold)`)。
- セクション2「表示モード」: 3 択ラジオ (E6-3 と同型)。文言は Web `:60-62` 忠実 — `.titleMapped`「タイトルを伏せる」/「タイトルルールで正規化して表示します。」、`.normal`「そのまま表示」/「Google の予定タイトルを表示します。」、`.busyOnly`「予定ありのみ」/「本人以外には時間枠だけ見せます。」
- footer: 「キャンセル」(`.ghost`) / 「追加する」(`.primary`, `isEnabled: selected != nil && !isPending`) → `createSync(roomId:, CreateGoogleSyncInput(googleCalendarId: selected!, visibilityMode: visibilityMode))` → 成功で `onAdded()` + close。

### E6-5 RoomGoogleSyncSection (Web `rooms/RoomGoogleSyncSection.tsx`)

```swift
struct RoomGoogleSyncSection: View {
    let roomId: String
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @Binding var activeSheet: RoomSettingsSheetKind?     // ★ 親の単一 activeSheet を共有する (下記)
    @State private var connection: GoogleCalendarConnectionDto?
    @State private var syncs: [GoogleCalendarSyncDto] = []
    @State private var isPending = false
}
```
- 上部区切り `Rectangle().fill(Color.textPrimary.opacity(0.08)).frame(height:1)` + `padding(.top, Space.s5)` (Web `border-t border-fg-primary/8 pt-5`)。見出し `Text("Google Calendar から同期")` (`.atenderSm`/`.black`)。
- `connection == nil`: `Text("まず Google アカウントを連携してください。")` (`.atenderXs`/`.textSecondary`) + `AtenderButton("連携設定を開く", variant:.secondary)` → **シートを閉じてから** `router.settingsPath.append(SettingsRoute.calendar)` + `router.selectedTab = .settings` (Web は `navigate({to:"/settings/calendar"})`)。
- `connection.status != .active`: 赤バナー「Google の認可が無効です。連携設定から再連携してください。」
- sync 一覧 (各行 `Color.bgMuted` + `Radius.lg` + `padding(Space.s4)`):
  - `Text(sync.calendarSummary)` (`.atenderSm`/`.black`/`lineLimit(1)`)
  - `Text("\(GoogleFormat.visibilityLabel(sync.visibilityMode)) · \(sync.enabled ? GoogleFormat.syncStatusLabel(sync.status) : "一時停止中") · \(GoogleFormat.lastSynced(sync.lastSyncedAt))")` (`.atenderXs`/`.textSecondary`)
  - `sync.lastError` があれば `Text(lastError)` (`.atenderXs`/`.bold`/`.statusAbsent`/`lineLimit(2)`)
  - ボタン行: 「同期」(`.secondary`,`.sm`, `systemImage:"arrow.clockwise"`, `isEnabled: !isPending && sync.enabled`) → `runSync` / 「停止」or「再開」(`.ghost`,`.sm`, `systemImage: sync.enabled ? "pause.fill" : "play.fill"`, `isEnabled: !isPending`) → `updateSync(UpdateGoogleSyncInput(enabled: !sync.enabled))` / 表示モード `Picker` (`.menu`, 3 択。**選択肢の順序は Web `:125-127` = TITLE_MAPPED, NORMAL, BUSY_ONLY**) → `updateSync(UpdateGoogleSyncInput(visibilityMode:))` / 「切断」(`.ghost`,`.sm`, `systemImage:"trash"`) → `activeSheet = .googleSyncDelete(sync.id)`
- `syncs.isEmpty` → `Text("同期中の同期カレンダーはありません。")` … ★ Web 文言は **「同期中のカレンダーはありません。」** (`:75`)。`Color.bgMuted` の pill 内、`.atenderSm`/`.bold`/`.textSecondary`。
- `AtenderButton("カレンダーを追加", systemImage:"calendar.badge.plus", isEnabled: connection?.status == .active)` → `activeSheet = .googleSelector`

**★ 親シートとの sheet 集約 (gotcha 回避の要点)**: `RoomSettingsSheet` (`Features/Rooms/RoomSheets.swift:39-`) は現在 `.sheet(isPresented: $importOpen)` を 1 つだけ持つ。E6 で **selector シート**と**切断確認シート**が増える = **兄弟 3 枚**になり必ず壊れる。よって `RoomSettingsSheet` を単一 `activeSheet` に**リファクタする**:

```swift
// Features/Rooms/RoomSheets.swift
enum RoomSettingsSheetKind: Identifiable {
    case icsImport
    case googleSelector
    case googleSyncDelete(String)      // syncId
    var id: String {
        switch self {
        case .icsImport: return "ics"
        case .googleSelector: return "google-selector"
        case .googleSyncDelete(let id): return "google-sync-delete-\(id)"
        }
    }
}
```
`RoomSettingsSheet` の `@State private var importOpen = false` を **`@State private var activeSheet: RoomSettingsSheetKind?` に置換**し、`.sheet(isPresented: $importOpen){…}` を `.sheet(item: $activeSheet){ sheet in switch sheet { … } }` に置換。`icsSection` の「取り込み画面を開く」は `activeSheet = .icsImport`。`RoomGoogleSyncSection` には `$activeSheet` を Binding で渡す。`IcsImportWizard(isPresented:)` には共有 Binding (`activeSheetBinding`) を渡す。**これは既存挙動を変えない機械的置換**であり、既存の ICS ウィザードのテストは全て通るはず。

- `RoomSettingsSheet` の本体に `RoomGoogleSyncSection(roomId: roomId, activeSheet: $activeSheet)` を **`icsSection` の直後・`inviteSection` の前**に挿入 (Web `RoomSettingsSheet.tsx` の並びに合わせる。Developer は Web の現物で順序を最終確認)。
- 切断確認シート (Web `:81-112`): `SheetScaffold(title: "このカレンダーを切断")` + 2 択ラジオ (「取り込んだ予定も削除する」/「ルームに残す」、既定 `deleteEvents = true`) + footer 「キャンセル」/「切断する」(`.destructive`) → `deleteSync(roomId:syncId:deleteEvents:)`。

### E6-6 IcsImportWizard の「ルールを編集」を有効化

Phase D で「本 Phase では出さない」とした `done` ステップの「ルールを編集」ボタン (Web は `/settings/calendar` へ) を E6 で有効化する。`Features/Rooms/RoomSheets.swift` の done footer に `AtenderButton("ルールを編集", variant:.ghost)` を追加 → `isPresented = false` (ウィザードを閉じる) → `router.selectedTab = .settings; router.settingsPath.append(SettingsRoute.calendar)`。既存の「閉じる」(`:409`) は残す。

### E6-7 SettingsView に「Google Calendar 連携」行を追加

「カレンダー連携」セクションの**先頭**に挿入 (Web `Settings.tsx:69-70` の順序)。sheet host の `switch` に `.google` を追加:
```swift
case .google:
    SheetScaffold(title: "Google Calendar 連携", isPresented: activeSheetBinding) {
        GoogleCalendarSection()
    } footer: { EmptyView() }
```
Web `Settings.tsx:86-88` の `<BottomSheet title="Google Calendar 連携"><GoogleCalendarSection /></BottomSheet>` と 1:1。

### E6-8 SettingsCalendarView に GoogleCalendarSection を挿入

E5-2 の 1. を有効化: `TitleRuleEditor` の**上**に `Panel { GoogleCalendarSection() }`。

---

## データ層追加サマリ (フェーズ横断・重複防止)

### 新規 Repository (すべて `@MainActor @Observable final class`, `init(client: APIClient, cache: QueryClient)`)

| クラス | ファイル | フェーズ |
|---|---|---|
| `RuleRepository` | `Core/Data/RuleRepository.swift` | E3 |
| `SchoolRepository` | `Core/Data/SchoolRepository.swift` | E4 |
| `IcsTitleRuleRepository` | `Core/Data/IcsTitleRuleRepository.swift` | E5 |
| `GoogleRepository` | `Core/Data/GoogleRepository.swift` | E6 |

`GoogleLinkService` は Repository でなく `init(authStore: AuthStore, webAuth: GoogleSignIn)` (E6)。全て `AppEnvironment` に `let` で追加・`init` で配線。

### 既存 Repository への追加メソッド

| クラス | メソッド | フェーズ |
|---|---|---|
| `MeRepository` | `updateMe(_:)` | E2 |
| `SemesterRepository` | `createSemester(_:)` / `updateSemester(id:_:)` / `deleteSemester(id:)` | E3 |

### `Mutation` enum への追加 (`Core/Data/InvalidationMatrix.swift`)

| case | invalidate prefixes | Web hook 根拠 |
|---|---|---|
| `.attendanceRuleUpsert` | `.rules()` | `useAttendanceRules.ts:21` |
| `.schoolCreate` | `.schools()` | `useSchools.ts:18` |
| `.departmentCreate(schoolId:)` | `.departments(schoolId)` | `useSchools.ts:34` |
| `.icsTitleRule` | `.icsTitleRules()` | `useIcsTitleRules.ts:25,33,41` |
| `.googleLinkComplete` | `.googleConnection()`, `.googleCalendars()` | `useGoogleCalendar.ts:54-57` |
| `.googleUnlink` | `.googleConnection()`, `.googleCalendars()`, `.rooms()` | 同 `:69-73` |
| `.googleSyncAll` | `.googleConnection()`, `.rooms()` | 同 `:146-149` |
| `.googleSync(roomId:)` | `.googleSyncs(roomId)`, `.room(roomId)` | 同 `:83-86, 99-102, 115-118, 131-134` |

既存 `.meUpdate` / `.semesterCreate` / `.semesterUpdate` / `.semesterDelete` は**変更しない**。

### `Endpoints` への追加 (`Core/Networking/APIEndpoint.swift`)

`attendanceRules(schoolId:departmentId:)` / `upsertAttendanceRule(type:_:)` (E3) / `createIcsTitleRule(_:)` / `patchIcsTitleRule(id:_:)` / `deleteIcsTitleRule(id:)` (E5) / `unlinkGoogleConnection(deleteEvents:)` / `deleteGoogleSync(roomId:syncId:deleteEvents:)` (E6)。**他は全て既存定義を使う。**

### `QueryKey` への追加

無し (`.rules()` / `.schools()` / `.departments(_:)` / `.icsTitleRules()` / `.googleConnection()` / `.googleCalendars()` / `.googleSyncs(_:)` は全て実装済 = `QueryKey.swift:19-47`)。**保存キーは `.rules()` 等の prefix より 1 段深い実キー** (例 `["attendance-rules", schoolId, departmentId]`) を使い、invalidate は prefix で効かせる (Phase D `roomWeek` と同じ形)。

### DTO 追加

`AttendanceRuleUpsertBody` / `AttendanceRuleResponse` (E3) / `SchoolResponse` / `DepartmentResponse` (E4) / `IcsTitleRuleInput` (E5) / `GoogleConnectionResponse` / `GoogleConnectionRequiredResponse` / `GoogleCalendarsResponse` / `GoogleSyncsResponse` / `GoogleSyncResponse` / `GoogleUnlinkResult` / `GoogleRunSyncResult` / `GoogleSyncAllResult` (E6)。**既存 DTO は 1 つも変更しない。**

---

## 挙動仕様 (Reviewer がここからテストを生成する)

### ProfileEditLogic.plan

- `plan(name:"太郎", handle:"", currentName:nil, currentHandle:nil)` → `.patch(MeUpdateInput(name:"太郎"))` (handle は含まれない)。
- `plan(name:"", handle:"", currentName:"太郎", currentHandle:nil)` → `.noChange` (trim 後空の name は送らない)。
- `plan(name:"太郎", handle:"", currentName:"太郎", currentHandle:nil)` → `.noChange`。
- `plan(name:" 太郎 ", handle:" foo ", currentName:"太郎", currentHandle:"foo")` → `.noChange` (trim して比較)。
- `plan(name:"太郎", handle:"foo bar", …)` → `.invalidHandle` (空白は不許可)。
- `plan(name:"太郎", handle:"foo-bar", …)` → `.invalidHandle` (ハイフン不許可)。
- `plan(name:"太郎", handle:"foo_BAR9", currentName:"太郎", currentHandle:nil)` → `.patch(MeUpdateInput(handle:"foo_BAR9"))`。
- handle 31 文字 → `.invalidHandle`。30 文字 → `.patch`。1 文字 → `.patch`。
- `plan(name:"次郎", handle:"jiro", currentName:"太郎", currentHandle:"taro")` → `.patch(MeUpdateInput(name:"次郎", handle:"jiro"))` (両方入る)。

### NumberStepperLogic.clamp

- `clamp(0, min:1, max:100) == 1` / `clamp(101, min:1, max:100) == 100` / `clamp(70, min:1, max:100) == 70` / `clamp(9999, min:0, max:9998) == 9998`。

### SemesterListLogic

- `subtitle(SemesterDto(id:"s1", name:"前期", startDate:"2026-04-01", endDate:"2026-09-30"), defaultSemesterId:"s1")` → `"2026-04-01 - 2026-09-30 / 現在"`。`defaultSemesterId:"s2"` → `"2026-04-01 - 2026-09-30"`。`defaultSemesterId:nil` → 同上 (" / 現在" なし)。
- `saveDisabled(SemesterForm(name:"", startDate:"2026-04-01", endDate:"2026-09-30")) == true`。
- `saveDisabled(SemesterForm(name:"  ", …)) == true` (trim 後空)。
- `saveDisabled(SemesterForm(name:"前期", startDate:"2026-10-01", endDate:"2026-09-30")) == true` (start > end)。
- `saveDisabled(SemesterForm(name:"前期", startDate:"2026-04-01", endDate:"2026-04-01")) == false` (同日は許可 = Web は `>` 比較)。
- `createEnabled(SemesterForm(name:"前期", startDate:"2026-04-01", endDate:"2026-09-30")) == true`。いずれか空 → `false`。
- `updateBody(form: .init(name:"前期", startDate:"2026-04-01", endDate:"2026-09-30"), current: 同値)` → 全 nil の `SemesterUpdateInput`。
- `updateBody(form: .init(name:"後期", …同), current:)` → `name` のみ非 nil。
- `updateBody(form: .init(name:"", startDate:"2026-05-01", endDate:"2026-09-30"), current: name:"前期", start:"2026-04-01")` → `name` は nil (空は送らない)、`startDate` のみ非 nil。

### HomeChips.items

- `items(rooms: [])` → 1 要素、`.selfChip(label: "自分")`。
- `items(rooms: [A, B])` → 3 要素、`[0] == .selfChip(label:"自分")`, `[1] == .room(roomId: A.id, roomName: A.name)`, `[2] == .room(roomId: B.id, roomName: B.name)` (**入力順を保つ。ソートしない**)。
- `items(rooms:).map(\.id)` の先頭が `"self"`、以降が room.id と一致。

### GoogleFormat

- `lastSynced(nil) == "未同期"`。
- `lastSynced("2026-07-16T00:30:00.000Z")` → JST で 7/16 09:30 → `"7/16 09:30"` (月日は非ゼロ埋め、時分はゼロ埋め 2 桁 = Web の `month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit"` に対応)。
- `lastSynced("2026-07-16T09:30:00+09:00")` → 同じ `"7/16 09:30"` (オフセット付き ISO も同一壁時計)。
- `lastSynced("not-a-date")` → `"未同期"` (パース不能はフォールバック)。
- `visibilityLabel(.normal) == "そのまま表示"` / `.busyOnly == "予定ありのみ"` / `.titleMapped == "タイトル正規化"` / **`.unknown == "タイトル正規化"`** (Web は else 分岐 = TITLE_MAPPED 扱い)。
- `syncStatusLabel(.ok) == "同期済み"` / `.failed == "失敗"` / `.syncing == "同期中"` / `.revoked == "認可切れ"` / `.idle == "待機中"` / **`.unknown == "待機中"`** (Web の else 分岐)。

### RuleStrategyOptions

- `all.count == 5` かつ `all.contains(.unknown) == false`。
- `all == [.countAsPresent, .countAsAbsent, .halfPresent, .reduceDenominator, .separateCount]` (Web `RULE_STRATEGY` と同順)。

### invalidationTargets (追加 case)

- `.attendanceRuleUpsert` → `Set == [QueryKey(["attendance-rules"])]`。
- `.schoolCreate` → `[QueryKey(["schools"])]`。
- `.departmentCreate(schoolId:"s1")` → `[QueryKey(["departments","s1"])]`。
- `.icsTitleRule` → `[QueryKey(["me","ics-title-rules"])]`。
- `.googleLinkComplete` → `[["me","google-calendar","connection"], ["me","google-calendar","calendars"]]`。
- `.googleUnlink` → 上記 2 つ + `["rooms"]`。
- `.googleSyncAll` → `[["me","google-calendar","connection"], ["rooms"]]`。
- `.googleSync(roomId:"r1")` → `[["rooms","r1","google-calendar-syncs"], ["rooms","r1"]]`。
- **既存 case の targets が本 Phase で変わっていないこと** (回帰。既存 `InvalidationMatrixTests` がそのまま通る)。

### IcsTitleRuleInput のエンコード

- `IcsTitleRuleInput(matchType:.contains, pattern:"会議", replaceWith:nil, visibilityMode:nil, priority:nil)` を `JSONEncoder` で符号化 → **`replaceWith` キーが `null` として存在する**。`visibilityMode` / `priority` キーは**存在しない**。
- `replaceWith:"予定"` → `"replaceWith":"予定"`。

### API (E6, Vitest。`apps/api/tests/`)

`POST /api/auth/native/link-ticket`:
- 有効 Bearer → **201**、body に `ticket` (非空) / `url` (`/api/auth/native/link-google?ticket=<ticket>` を含む) / `expiresAt` (ISO)。DB に `NativeOAuthLinkTicket` が 1 行、`sessionToken` が呼び出しに使った token と一致、`expiresAt - createdAt` が 120 秒前後。
- Bearer 無し → **401**。不正 Bearer → **401**。
- 同一ユーザーが 2 回叩く → 行は **1 行のみ** (前の ticket は削除される)。1 回目の ticket は以降 401。

`GET /api/auth/native/link-google`:
- `ticket` 省略 → **400 VALIDATION_ERROR**。
- 存在しない ticket → **401**。
- **期限切れ ticket → 401**、かつ行は削除されている。
- 有効 ticket → **302**、`Location` が `https://accounts.google.com/` で始まる、クエリに `state` / `code_challenge` / `scope=…calendar.readonly` を含む。レスポンスに **`Set-Cookie` が 1 つ以上**あり、うち 1 つが better-auth の state cookie 名を持つ (cookie が転送されていること = 本設計の肝)。
- **同一 ticket の 2 回目 → 401** (単回消費)。
- 302 後に DB から該当 ticket 行が消えている。

`atender://google-linked` の trustedOrigins:
- `BETTER_AUTH_TRUSTED_ORIGINS` に `atender://google-linked` を含めた `.env.test` で上記が通ること。
- ★ known-failures.md §環境依存 の再発防止: `.env` が漏れて `.env.test` を上書きする harness 事故が既知。テスト実行前に `trustedOrigins` の実値をログ出力する probe を 1 本置き、`atender://auth` と `atender://google-linked` の**両方が truncate されず**含まれることを assert する。

### 画面操作 (XCUITest / シミュレータ観点)

- **設定タブ**: タップ → プレースホルダでなく `settings-view` が出る。プロフィールカードに名前/メール/@handle。5 セクション (アカウント/出席/カレンダー連携/表示/その他) が Web と同順。
- **プロフィール編集**: 行タップ → シート → 名前変更 → 保存 → 閉じてプロフィールカードの名前が更新。`@` 始まりの handle を入力すると先頭 `@` が消える。不正 handle → 赤バナー + シートが**閉じない** + ネットワーク要求なし。
- **必要出席率**: 行の trailing が `70%`。シート → プリセット `80` タップ → 保存 → 行の trailing が `80%`。`−`連打で `1` 未満にならない。
- **学校・学科**: 学校 ID / 学科 ID が現在値で埋まる。どちらか空で保存が `disabled`。
- **出欠ルール**: シートに 公欠/遅刻/早退 の 3 Picker。既存 effective 値が初期選択。保存 → 閉じる。
- **学期管理**: 一覧 + 各行「編集」「削除」。行タップで既定学期が切替 → subtitle に「/ 現在」が移動。追加フォームで学期追加 → 一覧に出現 + フォームがクリア。開始日 > 終了日で編集保存が `disabled`。
- **Setup**: 未セットアップ token で起動 → `setup-flow` が出る (「実装予定」が出ない)。Step1 で学校検索 → 選択 → Step2 → 学科選択 → 次へ → Step3 → 完了 → **`MainTabView` に切り替わる** (`/setup` に戻らない = 20260612 デッドロックの回帰確認)。
- **SettingsCalendar**: 設定 → 「カレンダー設定 (ICS 等)」→ push。戻るで設定に戻る (ホームに飛ばない)。TitleRuleEditor で新規ルール → 保存 → 一覧に出現。`isDefault` のルールは「編集」が `disabled`。
- **Google (未連携)**: 設定 → 「Google Calendar 連携」→ シートに「Google Calendar と連携する」。タップ → ASWebAuthenticationSession が開く (**自動化はここまで。同意画面以降は実機手動**)。
- **Google (連携済 seed)**: 「連携中」+ メール + 最後の同期。「今すぐ同期」/「連携を解除する」。解除シートで既定が「取り込んだ予定も削除する」。
- **Google (REVOKED seed)**: 「認可が無効になりました」+「もう一度連携する」。
- **RoomSettings**: 歯車 → 設定シート → Google セクション。未連携なら「連携設定を開く」→ 設定タブの SettingsCalendar へ。連携済なら sync 一覧 + 「カレンダーを追加」。**ICS ウィザードが従来どおり開く** (activeSheet リファクタの回帰)。
- **Home**: ルーム 0 件 seed → chip は「自分」のみ。ルーム 2 件 seed → chip 3 つ。ルーム chip タップ → 「ルーム表示は準備中」が**出ず** RoomTimetable が描画。カレンダーに切替 → RoomCalendar。ルーム選択中は SelfTodayCTA と HomeSemesterPicker が出ない。
- **異常系**: 各 mutation 失敗 → シートは閉じず赤バナー or `toastCenter` に「保存できませんでした、もう一度試してください」。状態は変えない。

---

## テスト基盤

- **iOS ユニット**: XCTest。既存ターゲット `AtenderTests` (`project.yml:57-67`)。`@MainActor` 型のテストクラスには `@MainActor` を付ける (gotcha `swiftui-final-mainactor-store-not-mockable-in-xctest`)。Repository は `final class` なのでサブクラスモック不可 — **HTTP は `URLProtocol` スタブで `URLSession` ごと差し替える**か、純粋ロジックのみを直接テストする。本 Phase の Reviewer は**純粋ロジック直テスト**を主軸にする (上記 §挙動仕様の前半すべて)。
  - `AtenderTests/SettingsLogicTests.swift`: `ProfileEditLogic.plan` / `NumberStepperLogic.clamp` / `SemesterListLogic` 4 関数 / `RuleStrategyOptions.all`
  - `AtenderTests/HomeChipsTests.swift`: `HomeChips.items`
  - `AtenderTests/GoogleFormatTests.swift`: `GoogleFormat` 3 関数 (**JST 固定なので期待値も JST**。gotcha `api-test-date-fixtures-must-match-production-normalization`)
  - `AtenderTests/InvalidationMatrixTests.swift`: **既存ファイルに追記** — 新 8 case + 既存 case の回帰
  - `AtenderTests/IcsTitleRuleInputTests.swift`: `JSONEncoder` 出力の `replaceWith: null` 検証
  - `AtenderTests/TodayViewModelTests.swift`: **E0 で削除**
- **ベースライン**: 現行 **157 GREEN** (CLAUDE.md)。E0 で `TodayViewModelTests` 分だけ減る → **新ベースラインを `.knowledge/known-failures.md` の iOS 節に置換記載**。以降のフェーズは (新ベースライン + 追加分) が全 GREEN であることが受け入れ条件。**未分類の失敗を残したままマージ不可** (CLAUDE.md)。
- **API (E6)**: Vitest。`apps/api/tests/native-link.test.ts` を新規。既存 `tests/ios-api.test.ts §8.4` (native/callback) と同じ helper (`tests/helpers/`) を使う。★ known-failures.md §環境依存 のとおり **dev `.env` が `.env.test` を上書きする harness 事故**が既知 — Reviewer は実行前に `trustedOrigins` の実値を probe で確認すること。
- **Web (E0)**: `pnpm --filter @atender/web build` (tsc) が通ること。削除以外の変更は `Rooms.tsx` の 1 ファイルのみ。
- **XCUITest**: 既存ハーネス `AtenderUITests/ScreenshotFlow.swift` に `testPhaseEFlow()` を追加 (既存 `testPhaseB/C/DFlow` と同型)。`ATENDER_UI_TEST_BEARER_TOKEN` 注入で起動。Setup フローの検証には **setupStatus 未完了のデモユーザー seed が別途要る** (`apps/api/scripts/seed-demo-user.ts` に `--incomplete` 相当のモードを足すか、専用 seed を追加する。Developer は seed スクリプトの現物を読んで最小の追加で済ませる)。
  - `accessibilityIdentifier`: `settings-view` / `settings-row-profile` / `settings-row-school` / `settings-row-requiredRate` / `settings-row-rules` / `settings-row-semesters` / `settings-row-google` / `settings-row-calendar` / `settings-row-signout` / `profile-edit-sheet` / `school-dept-sheet` / `required-rate-sheet` / `attendance-rule-sheet` / `semester-list-sheet` / `setup-flow` / `settings-calendar` / `title-rule-editor` / `google-calendar-section` / `google-connect-sheet` / `google-selector-sheet` / `room-google-sync-section` / `context-chips` (既存)
  - スクショ比較は `xcrun simctl` / XCUITest。**chrome-devtools MCP は使わない** (iOS ネイティブのため)。
  - ASWebAuthenticationSession はシステム UI なので **XCUITest で自動化しない**。E6 の OAuth 経路は「①ticket 発行の API テスト (Vitest)」+「②③の手動 E2E (実機/シミュレータで Touri or Developer が 1 回通す)」+「④link/complete の既存 API テスト」の 3 点で担保する。**Reviewer は ②③ を自動テストできない旨を明示的に報告する** (できないものをできたと言わない)。

---

## 不採用案

- **iOS から `POST /api/auth/link-social` を直接叩く (URLSession + Bearer)**: 却下。better-auth 1.6.11 は `storeStateStrategy="database"` でも **署名付き state cookie の一致を必須**とする (`state.mjs:104-107`, `skipStateCookieCheck` 既定 false)。URLSession が受けた cookie は ASWebAuthenticationSession のブラウザに存在せず、callback が `state_security_mismatch` で必ず失敗する。**動かない案**。
- **`account.skipStateCookieCheck: true` を `auth.ts` に設定して cookie チェックを無効化**: 却下。実装は 1 行で済むが **Web を含む全 OAuth フローの CSRF 防御を弱める**。ネイティブ 1 経路のために全体のセキュリティ前提を下げる取引は割に合わない。加えて `auth.ts` は本 Phase のスコープ外 (§スコープ境界)。
- **中継 URL に session token を直接載せる (`?token=<sessionToken>`)**: 却下。ticket テーブルを省ける代わり、**30 日有効の session token が Nginx / Coolify のアクセスログに平文で残る**。単回・120 秒の ticket なら露出が有界。
- **ticket を better-auth の `verification` テーブルに相乗りさせる**: 却下。migration を回避できるが、他人 (better-auth) のテーブルに独自 identifier prefix で書き込む結合が生まれ、ライブラリ更新でいつ壊れてもおかしくない。専用モデル 1 つの追加 migration の方が安い。
- **GoogleSignIn SDK / 自前 OAuth code flow で calendar scope を取り、Account 行を自前 upsert**: 却下。`completeGoogleLink` (`googleCalendarSync.service.ts:16-21`) は better-auth の `Account.scope` を単一の真実として読む。better-auth を迂回して Account を書くと refresh token のライフサイクル管理 (`auth.api.getAccessToken`) が二重化し、cron 同期 (`pattern/better-auth-incremental-scope-and-cron-token`) との整合が崩れる。
- **`Atender.xcodeproj` の追跡を維持し `.gitignore` に "Atender [0-9]*.xcodeproj" だけ足す**: 却下。複製の症状だけ隠して原因 (生成物を追跡していること) が残る。CI ゼロ・scheme は project.yml 宣言済という実測から、追跡をやめても失うものが無い。
- **`components/today/` を丸ごと削除**: 却下。`MainAttendanceCTA.tsx` は `components/home/SelfTodayCTA.tsx:8` が import している**生きたファイル**。指示の「components/today/*」を字面どおり実行するとホームの出欠 CTA が壊れる。削除は `Today.tsx` / `TodayGreeting.tsx` の 2 つのみ。
- **孤児化する歌詞 UI (`TimetableScroll` / `OccurrenceLyricCard` / `ReturnToNowFAB`) も削除**: 却下 (本 Phase では)。tracked かつ「作った UI を捨てるか」というプロダクト判断であり、Architect の裁量でない。E0 で孤児化する事実を Leader に申告し Touri 判断に上げる。
- **`SchoolDeptEditSheet` を学校名検索 UI に改善**: 却下。Web は生の ID 入力 (`SchoolDeptEditSheet.tsx:27-28`)。忠実移植の契約に反する。E4 の Setup が持つ検索 UI を流用すれば作れるが、**Web が改善されるまで iOS も改善しない** (両者を Web 側で直すなら別 feature)。
- **学期削除 / ルール保存 / タイトルルール削除に確認ダイアログを足す**: 却下。Web はいずれも確認なしで即実行 (`SemesterListSheet.tsx:59`, `AttendanceRuleSheet.tsx:33`, `TitleRuleEditor.tsx:65`)。iOS 独自の安全策を足さない。危険だと思うなら Web を先に直す。
- **設定タブに `/templates` への導線を足す**: 却下。Phase D は「Phase E で設定画面が出来たら設定側にも導線を足す」と書いたが、**Touri 決定で「Web にリンクを足して iOS に合わせる」に確定**した。導線は Web/iOS とも**ルーム画面の 1 か所のみ**。二重導線を作らない。
- **`SettingsCalendar` の「戻る」を Web と同じ `/` (ホーム) にする**: 却下。マスターアーキ §1.2.2 で「iOS は NavigationStack の自然な pop = 設定タブへ戻る」と確定済。本 Phase で覆さない。
- **`GET /api/stats` / ICS インポート履歴 / 時間割削除 / ルーム予定の編集削除を iOS に実装**: 却下。**Web に UI 導線が無い** (§Web が持たない = iOS も作らない、grep 済)。忠実移植は無いものを作らない。
- **`SettingsView` の 6 シートを兄弟 `.sheet` で並べる**: 却下。gotcha `swiftui-multiple-sibling-sheets-only-one-fires` を Phase B/C/D で 3 回踏んでいる。単一 `activeSheet` + `.sheet(item:)` に集約する。
- **`Settings` の me 反映を TanStack 風の自動 refetch にする**: 却下。iOS は Phase B〜D を通じて「invalidate = stale フラグ、自動 refetch しない、View が明示 reload」で統一済 (`pattern/swiftui-tanstack-query-port-invalidation-cache`)。本 Phase だけ機構を変えない。
- **`GoogleFormat.lastSynced` を端末ロケール/tz で整形 (Web `toLocaleString` 忠実)**: 却下。端末依存でテストが非決定になる。JP 前提で **JST + ja_JP 固定** (Phase D `RoomEventTiming` の JST 固定と同じ判断)。

---

## 参考 knowledge

`pattern/better-auth-incremental-scope-and-cron-token` (linkSocial / getAccessToken の前提), `pattern/google-calendar-incremental-sync-room-scoped` (Connection × Sync の 2 段モデル・visibility 階層), `pattern/better-auth-bearer-native-token-relay` (bearer 併存 + native callback 中継。本 Phase の link 中継はこの**逆向きの応用**), `pattern/swiftui-tanstack-query-port-invalidation-cache` (invalidation 移植), `pattern/modal-sheet-base-component-3way-close`, `pattern/theme-auto-resolve-data-theme-matchmedia`, `gotcha/swiftui-multiple-sibling-sheets-only-one-fires` (**本 Phase の最重要**), `gotcha/design-doc-must-specify-swift-type-signatures`, `gotcha/swiftui-final-mainactor-store-not-mockable-in-xctest`, `gotcha/env-module-import-time-parse-defeats-runtime-env-swap` (API テストの env 罠), `gotcha/api-test-date-fixtures-must-match-production-normalization`, `projects/atender/.knowledge/07-google-calendar-oauth-integration`, `projects/atender/.knowledge/known-failures`。

### 本 Phase で knowledge に書き足す候補 (Architect が実装後に確定させる)

- `gotcha/better-auth-link-social-state-cookie-blocks-native-oauth.md` — 「DB state 戦略でも署名付き state cookie の一致が必須。ネイティブが URLSession で link-social を叩くと callback で必ず state_mismatch。中継エンドポイントでブラウザに叩かせて Set-Cookie を転送するのが解」。**better-auth × ネイティブの再利用性が高い一次知見**なので、E6 の実装が本番で通ったことを確認してから global pattern/gotcha として書く。
