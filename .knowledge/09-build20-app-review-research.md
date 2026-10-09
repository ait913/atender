---
title: build 20 (App Store 初回提出) 設計前リサーチ — アカウント削除 / SIWA revoke / 法務ページ / 収集データ棚卸し
category: library
project: atender
tags: [app-review, account-deletion, sign-in-with-apple, better-auth, prisma, privacy, nginx]
created: 2026-10-09
sources:
  - https://developer.apple.com/support/offering-account-deletion-in-your-app/
  - https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple
  - https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens
  - https://developers.google.com/identity/protocols/oauth2/web-server
  - https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
  - Muraki/knowledge/library/account-deletion-siwa-betterauth-2026.md
---

## Context

2026-10-09、Atender を App Store 審査に初めて出すための Researcher (Sonnet) 調査。Leader が結論部を整理して保存。実測 (node_modules の実コード / dev.db コピーでの cascade 実験 / nginx:alpine での配信実験 / ASC API) に基づく。汎用部分は `Muraki/knowledge/library/account-deletion-siwa-betterauth-2026.md`。

## What

### Touri 裁定 (2026-10-09)
- 退会者が作ったルーム → 最古の残メンバーに OWNER 移譲 (居なければ削除)。公開テンプレ → author を null 化して残す (匿名化)
- Apple / Google のトークン失効を退会時に best-effort で入れる (失敗しても削除は完遂)
- UGC の通報 / ブロック UI は今回入れない (審査で指摘されたら追加)
- サポート / プライバシー窓口: touri.development@gmail.com

### A. Apple 審査要件
- 5.1.1(v): アカウント作成があるアプリは**アプリ内で削除を開始**できること。確認ダイアログ・再認証は可。問い合わせ誘導のみは不可。無効化/停止だけは不十分。保持するデータがあるなら明示
- SIWA の token revoke は Apple 文書で「should」(必須ではない)。revoke には refresh/access token が必要。**現状 iOS は identityToken だけ送っており、better-auth の idToken 経路は refresh を保存しない → prod DB の apple account は access/refresh/id 全部 NULL**。revoke するなら iOS が `credential.authorizationCode` (5 分有効・1 回限り) を送り、サーバーが `POST https://appleid.apple.com/auth/token` (grant_type=authorization_code) で交換して refresh token を保存する必要がある
- client_secret: 既存 `buildAppleClientSecret(clientId)` (`apps/api/src/auth.ts:25-44`) を `sub = APPLE_APP_BUNDLE_ID` (net.appily.atender) で呼べばネイティブ用になる。本番 Coolify env に `APPLE_CLIENT_ID` / `APPLE_APP_BUNDLE_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` (base64 .p8) / `GOOGLE_*` が揃っている。実測で Bundle ID / Services ID どちらの `sub` でも `/auth/token` の client 認証は通る (`invalid_grant` が返る = client は OK)
- Google revoke: `POST https://oauth2.googleapis.com/revoke` (form `token=`、access/refresh どちらでも可、200/400)。Google account は 4 件中 3 件が refresh token を保持 (web の calendar.readonly 由来)。既存 `unlinkGoogle` (`googleCalendarSync.service.ts:45-59`) は revoke を呼んでいない
- プライバシーポリシー URL (iOS 必須) / サポート URL (必須、実際の連絡先に繋がること) / EULA は任意 (Apple 標準)

### B. better-auth 1.6.11 の `/delete-user`
- `user.deleteUser.{enabled, sendDeleteAccountVerification, beforeDelete, afterDelete, deleteTokenExpiresIn}`。`POST /delete-user` body `{}` 可。Bearer plugin が Bearer→cookie 変換するので iOS からも呼べる
- **OAuth のみユーザーは password 経路不可、かつ `session.createdAt` から `freshAge` (既定 86400 秒) 超で 400 SESSION_EXPIRED** → iOS セッション 30 日では翌日以降ほぼ確実に踏む。回避は `session.freshAge: 0` か メール確認フロー か 自前エンドポイント
- 削除順 sessions → accounts → user。`beforeDelete` 時点で account はまだ残る (revoke 用トークンを読める)
- `sessionMiddleware` (`middleware/session.ts:27-52`) は Session が User に Cascade なので削除後は自然に 401。iOS 側は `AuthStore.swift:138` の `handleUnauthorized`

### B2. Prisma User 削除の波及 (dev.db コピーで実測、FK は有効)
- 自分のデータは全部 Cascade で消える (Account / Session / Semester→UserTimetable→DaySlot/Course/Meeting/Occurrence/Attendance/ClassTransfer/Suspension、PersonalEvent、IcsImport、IcsTitleRule、GoogleCalendarConnection、PersonalCalendarShare、RoomMembership、Friendship 両側、AttendanceRule 個人分)
- **他人に影響する Cascade**: `Room.createdBy` (`schema.prisma:478`) → ルーム丸ごと (他メンバーの Membership / RoomEvent / Import / Share も)。`RoomEvent.author` → 他人のルームに作った予定。`TimetableTemplate.author` (`:181`) → 公開テンプレ丸ごと (コピー済 UserTimetable の `sourceTemplate` は SetNull で残る)
- SetNull: `School.createdBy` / `Department.createdBy` / `UserTimetable.sourceTemplate`。`Verification` は FK 無し (15 分トークン残置のみ)
- `RoomRole` は OWNER / MEMBER。所有権移譲ロジックは現状無し

### C. iOS / Web の既存部品
- iOS 設定: `SettingsSection(title:rows:)` + `SettingsRowSpec(id:label:danger:trailingText:action)` (`Features/Settings/SettingsSection.swift:3-24`、danger は `Color.statusAbsent`)。ログアウトは「その他」セクション (`SettingsView.swift:35-39`、`id: "settings-row-signout"`)。`signOut()` (`:138-146`): `isSigningOut` ガード → `calendarSyncCoordinator.wipeExport()` → `authStore.signOut()` (`/api/auth/sign-out`、失敗しても Keychain 削除と `.signedOut` 続行) → `queryClient.removeAll()` → `router.settingsPath = NavigationPath()`
- 確認ダイアログの既存例: `CalendarSyncSettingsSheet.swift:30-40` (`confirmationDialog` + `Button("削除する", role: .destructive)`)
- DELETE の定石: `APIEndpoint.swift:35` `deleteSemester(id:)` / `DayRepository.swift:29-32`。認証系 POST は `AuthStore.authRequestWithData(path:body:requiresAuth:)` (sign-out が `EmptyBody` で使用)
- SIWA: `AppleSignIn.swift:12-18` で identityToken のみ取り出し、`AuthStore.swift:57-58` で送信。`authorizationCode` は未使用
- Web 設定: 実体 `components/settings/Settings.tsx`。ログアウトは「その他」(`:91-96`) `<SettingsRow label="ログアウト" danger onClick>`、エラーは直下 `<p className="px-3 pb-2 text-sm text-status-absent">`。`api("/api/auth/sign-out", { method: "POST", body: {} })` (**`body: {}` 必須**: Content-Type 無しで 415、body 無しで 500)
- 静的法務ページ: `apps/web/nginx.conf` は `location / { try_files $uri /index.html; }` のみ。**`public/privacy/index.html` を置いても `/privacy` `/privacy/` は SPA に落ちる** (nginx:alpine 実測)。`/privacy.html` のような拡張子付きなら無変更で配信。`/privacy` にしたいなら nginx の try_files に `$uri.html` を足す。Dockerfile は `vite build` → `dist` を nginx にコピー、`public/` はそのまま出る。TanStack Router に notFound 設定無し
- **`PrivacyInfo.xcprivacy` が無い** (UserDefaults を `CalendarSyncCoordinator.swift:27-47`、`AtenderApp.swift:6` `@AppStorage` で使用)。build 19 は VALID で通っているが、審査時の扱いは未確認。追加が無難
- 解析 / 広告 / クラッシュ SDK は iOS (packages = GoogleSignIn のみ) / web / api のどこにも無い

### C5. 収集データ棚卸し (プライバシーポリシー / App Privacy 用)
| 項目 | 保存先 | 目的 |
|---|---|---|
| email / name / image URL / emailVerified / handle / inviteCode | User | 認証・表示 |
| provider accountId / accessToken / refreshToken / idToken / scope | Account (Google は保持、Apple は現状 NULL) | 認証・Google Calendar 読取 |
| session token / 期限 / **ipAddress / userAgent** | Session | セッション管理 |
| 学校・学科・必要出席率 | User | 機能 |
| 時間割・科目・出欠 (note 含む)・ルール・振替・休講 | 各テーブル | 機能 |
| 個人予定 (title / start / end / location / note / 繰り返し) | PersonalEvent | 機能 |
| **iPhone カレンダーから読み込んだ予定 (title / location / 開始終了 / EK 外部 ID)** | PersonalEvent (`POST /api/personal-events/eventkit-sync`、`CalendarSyncCoordinator.swift:186-192`、`DTOs.swift:564-574`) | 機能 — **端末内に閉じていない** |
| ICS 取り込み本文全体 (`IcsImport.rawText`) / タイトル規則 | IcsImport / IcsTitleRule | 機能 |
| 友達 / ルーム / ルーム予定 / カレンダー共有 | Friendship / Room* / PersonalCalendarShare | 機能 |
| 公開テンプレ (title / description / 学年 / 学期) | TimetableTemplate | 機能 (他ユーザーに公開) |
| Google Calendar: scope `calendar.readonly`、web のみ (iOS に導線無し)、`accessType: offline` / `prompt: consent` | GoogleCalendarConnection + Account | 機能 |
| Magic Link 宛先メール | Resend 経由送信 | 認証 |
| カメラ (QR) | 端末内のみ | 機能 |
- サーバー: Coolify 自宅サーバー (日本)、SQLite。バックアップは Touri ローカル
- トラッキング / 第三者 SDK: 無し

### D. ASC 実値
- カテゴリ id `EDUCATION` / `PRODUCTIVITY` 実在 (`GET /v1/appCategories?filter[platforms]=IOS&limit=200`、57 件)
- 無料 price point (USA): id `eyJzIjoiNjc5MDYwNDM3MSIsInQiOiJVU0EiLCJwIjoiMTAwMDAifQ`、`customerPrice: "0.0"` (**"0.00" ではない**)
- territories 175 件
- ageRatingDeclaration id = appInfo id `61051b12-8921-48c6-8b7c-f37650bc0bce`。boolean: advertising / gambling / healthOrWellnessTopics / lootBox / messagingAndChat / parentalControls / ageAssurance / socialMedia / socialMediaAgeRestricted / unrestrictedWebAccess / userGeneratedContent。3 値 enum (NONE / INFREQUENT_OR_MILD / FREQUENT_OR_INTENSE): alcoholTobaccoOrDrugUseOrReferences / contests / gamblingSimulated / gunsOrOtherWeapons / medicalOrTreatmentInformation / profanityOrCrudeHumor / sexualContentGraphicAndNudity / sexualContentOrNudity / horrorOrFearThemes / matureOrSuggestiveThemes / violenceCartoonOrFantasy / violenceRealisticProlongedGraphicOrSadistic / violenceRealistic
- **スクショ 1320×2868 (iPhone 17 Pro Max 実寸) は `APP_IPHONE_67` にそのまま上がる** (実測 COMPLETE、縮小不要)

## Why

「設定に削除ボタン + DELETE /api/me」では済まない: Cascade が他人の資産を巻き込む / better-auth 既定の delete-user は OAuth ユーザーの freshAge で死ぬ / SIWA revoke 用トークンをそもそも持っていない / 法務ページは SPA の nginx 設定に阻まれる、の 4 点が設計の論点。

## How to apply

build 20 の設計 doc (`.designs/20261009-build20-account-deletion-legal.md`) はこの 4 点を裁定込みで固定する。App Privacy (ASC Web UI) の入力は C5 の表から起こす。
