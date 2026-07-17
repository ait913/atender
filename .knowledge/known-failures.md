# atender — 既知の失敗テスト台帳 (ベースライン)

CLAUDE.md「ベースライン失敗の台帳」に基づく。分類: テスト陳腐化 / 環境依存 / 未分類。
**未分類を残したままのマージは不可。**

初版: 2026-07-14 (Reviewer、feature/login-auth-revamp レビュー時に棚卸し)

## API (apps/api, Vitest)

### ★ 実測ベースライン (2026-07-16, commit `f30391f`, Developer / fix/web-logout)

`cd apps/api ; pnpm exec vitest run` → **Test Files 9 failed | 22 passed (31) / Tests 17 failed | 273 passed | 1 skipped (291)**

台帳の教訓どおり測った日・commit・失敗数を併記する。fix/web-logout の変更 (手書き sign-out 削除 + テスト追補) 適用前後で**失敗テスト名の集合が完全一致** (`diff` exit 0) = 本 feature による regression は 0。

内訳: 下記「テスト陳腐化 (Magic Link)」4 件 + 以下 13 件。**未分類 0**。

### 旧「未分類 13 件」→ 全件分類済 (2026-07-16, Developer / fix/web-logout)

**「テスト間 DB 状態リーク / seed 重複」仮説は棄却**: 各失敗ファイルを単独実行しても同一に失敗する (`pnpm exec vitest run tests/friendship.test.ts` 等)。`createTestDb` は beforeEach で template.db を copy し直しており分離は健全。**13 件は独立**。ただし A6/A7 は共通原因を持つ。

**★ 過半 (8/13) が「テストが正しく、実装が設計doc の仕様番号に違反している」= 実装バグ。** ベースラインの山に本物のバグが隠れていた (CLAUDE.md がこの規約を持つ理由の実例)。

#### A. 実装バグ (テストが正しい) — 8 件 → **要 Leader/Touri 裁定。fix/web-logout では直していない**

| # | テスト | 実測 | 根拠 (設計doc `20260526-v3-rooms-friends.md`) |
|---|---|---|---|
| A1 | `room > enforces membership...` | 非メンバーの `GET /api/rooms/:id` が **403** | **#383**「メンバーでない user が叩くと `404 NOT_MEMBER` (存在を露呈しない、**403 ではない**)」→ **room の存在露呈。セキュリティ寄り** |
| A2 | `room > orders members...` | OWNER が**末尾** | **#435**「`members` は **OWNER 先頭**、それ以外は joinedAt 昇順」 |
| A3 | `roomEvent > allows any room member...` | member の PATCH が **403** | **#413**「PATCH は **room member なら誰でも編集可** (author 限定でない、TimeTree 方式)」。#414 (DELETE) も同様 |
| A4 | `roomWeek > rejects non-members and invalid weekStart` | 不正 weekStart が **200** | **#431**「weekStart は月曜限定。それ以外は `400 INVALID_WEEK_START`」= **バリデーション不在** |
| A5 | `friendship > handles create idempotency...` | 既存 PENDING への再申請が **201** | **#342**「再申請は**冪等** (新規行を作らず既存行を返す、**200**)」。service は冪等なのに `routes/friendships.ts:31` が **201 ベタ書き**で created/existing を区別できない |
| A6 | `semesters [§8 #22]` | 400 だが body が `{"success":false,"error":{"issues":[...],"name":"ZodError"}}` | 期待は `{error:{code:"VALIDATION_ERROR"}}`。**zValidator が raw ZodError を素通しし、アプリの ErrorResponse 契約を破っている** |
| A7 | `roomEvent > validates ranges...` | 同上 (`code` が undefined) | **#411**「start >= end は `400 { code: "INVALID_RANGE" }`」。**A6 と同一原因** |
| A8 | `room > regenerates invites...` | 再発行コードが 32 hex | 設計 §23「招待は `Room.inviteCode` 直書き (**cuid**)」+ schema `@default(cuid())`。`room.service.ts:190` の `randomUUID().replaceAll("-","")` のみ逸脱。**機能影響なし・軽微** — cuid に寄せるかテストを緩めるかは裁定事項 |

→ **A6/A7 は単一原因** (zValidator の error envelope)。web の `api()` は `ErrorResponse.safeParse` に失敗すると**実メッセージを捨てて generic `HTTP_ERROR` にフォールバック**するため、**全バリデーションエラーの UX を劣化させている実バグ**。

#### A9. ICS の `rrule` に DTSTART 行が混入する (2026-07-17 発見、Leader 実測)

**分類: 実装バグ (実害は美観と将来の脆さのみ。日付は壊れない)**。テストは無い (この経路は今まで到達不能だった)。

`apps/api/src/lib/icsParse.ts:87` が `rrule.toString()` の戻りを `replace(/^RRULE:/i, "")` で処理しているが、
実際の戻りは 2 行:

```
"DTSTART;TZID=Asia/Tokyo:20260707T130000\nRRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10"
```

先頭が `DTSTART` なので **replace が空振り**し、bare な `FREQ=...` にならない。この値がそのまま
`recurrenceRule` として DB に保存され、preview レスポンスにも露出する。

**なぜ今まで露見しなかったか**: `parseICS` 自体が CJS/ESM interop で undefined だったため、
**この経路は一度も実行されたことがなかった** (`fix/ics-esm-import` で parseICS が動くようになり初めて到達可能に)。

**実測した影響範囲** (2026-07-17、`expandBetween` / `validateRRule` を実経路で計測):

| 検証 | 結果 |
|---|---|
| `validateRRule` が弾くか | **弾かない** (rrulestr が寛容) |
| 展開日数・日付 | **正常な rrule と完全一致** (10 件 → UNTIL 追記後 7 件、日付も同一) |
| 埋め込み DTSTART が外側に勝つか | **勝たない**。わざと 1 週間ズラしても展開結果は不変 = **外側の DTSTART が勝ちゴミ行は無視される** |
| `appendOrReplaceUntil` (`;` split) を通した後 | 歪んだまま。ただし展開結果は正常と一致 |

→ **データ破損ではない**ので `fix/ics-esm-import` のデプロイをブロックしない、と Leader が判断 (2026-07-17)。
ただし DB と API に非仕様の値が残るので、**触るときに直す**。修正は `toString()` から `RRULE:` 行だけを
取り出す形にする (`.split("\n")` して `RRULE:` で始まる行を拾う等)。

#### B. テスト側の不備 (実装が正しい) — 5 件

| # | テスト | 分類 / 原因 |
|---|---|---|
| B1 | `friendship > accepts, declines, cancels...` | **テストのバグ**。`friendship.test.ts:192` が `declineTarget` (#312 どおり DECLINED で**行は残る**) を削除せず同じ (senderId,receiverId) を再 create → `@@unique([senderId,receiverId])` (phase4_init から存在) 違反。直前 183 行目は `delete` してから create しており、**192 だけ delete が抜けている** |
| B2 | `user-timetables [§8 #35]` | **陳腐化**。`daySlots: []` が現行 schema の `min(1)` に違反し **400** で弾かれ、409 重複判定に到達しない |
| B3 | `occurrence-gen [§8 #68]` | **陳腐化**。「period 5 の DaySlot が無い」前提だが `createUserTimetable` helper は **periodIndex 1〜12 を seed** するので period 5 は存在し、正常生成される |
| B4 | `auth-apple > normalizeApplePem...` | **陳腐化**。impl は `raw.trim()` する仕様。テストは末尾改行込みの**バイト一致** (`toBe(pem)`) を要求。実契約 (`createPrivateKey` が通る) は別 assert で担保済み |
| B5 | `roomWeek > returns stable member colors...` | **陳腐化 + 設計の矛盾**。テストは v3 §1447 の `hsl(h, 65%, 55%)` を期待、impl は `hsl(h 70% 45%)` (`cuidToHsl.ts:7`)。**後発 v6 設計 §53/§1417 は `hsl(h, 70%, 55%)`** で、impl は**どちらの設計とも不一致**。どれを正とするかは裁定事項 |

#### 原因コミットを特定できない理由

**本 worktree では `git log` / `git blame` に pathspec を付けるとハングする** (iCloud `~/Documents` 配下。pathspec 無しの `git log --oneline` は即返る)。陳腐化の起点コミット特定は断念した。必要なら iCloud 外へ clone して調べること。

### テスト陳腐化 (better-auth 1.6.11 の挙動変化。feature 非依存・親コミットでも同一)

これらは `tests/auth.test.ts` の Magic Link 系。**送信自体は正常** (probe で 200 + Verification 1 行 + Resend 1 回を確認)。旧テストが better-auth の旧挙動を前提にしている。

- `[§8 #2] two Magic Link requests ... create two Verification rows`
  - 期待 `verification.identifier contains "<email>"` → 実際 0。better-auth 1.6.11 は identifier を**不透明ランダムトークン**で保存 (probe 実測 `DZyvoUEUYcVtOOPXiwVYlRyUnOXJuijl`)。email を含まないので `contains email` フィルタが 0 になるだけで、行は生成されている。
  - 直し方: フィルタを identifier でなく件数 (`verification.count()` の差分) か `value`/別カラムで取る。
- `[§8 #3] expired Magic Link token ... returns 400`
  - 期待 400 JSON → 実際 302。better-auth 1.6.11 は verify 失敗時に**エラー callback へ 302 リダイレクト**する (JSON 400 を返さない)。
- `[§8 #4] invalid Magic Link token does not create a Session`
  - 期待 status>=400 → 実際 302。#3 と同根 (verify は常にリダイレクト)。Session 非作成の副次 assert は正しい可能性が高いが status assert が陳腐化。
- `[§8 #76] Resend failure makes Magic Link request return 500`
  - 期待 500 → 実際 200。better-auth 1.6.11 は送信失敗を 5xx に伝播しない。
  - 直し方: 送信失敗時の可観測な契約 (ログ/戻り) を再定義するか、テスト削除。

→ **いずれも本 feature (Apple/native-callback/setup.ts) とは無関係**。親コミット (5343c82, 実装前) で同一 4 件が失敗することを確認済み。設計の「apps/api 全 Vitest GREEN」は better-auth 更新で陳腐化している。**Magic Link の設計要件 D1 (send 200 + Resend 1 回) は既存 `[§8 #1]` が pass、probe でも確認済みで満たされている。**

### 環境依存 — dev `apps/api/.env` が Vitest プロセスに漏れて `.env.test` を上書きする (5 件)

**2026-07-17 再実測 (Reviewer / feature/version-management)**: 旧記載は「`.env` の `BETTER_AUTH_TRUSTED_ORIGINS` を
`atender://auth` に直せば直る」と書いていたが、**これは誤った処方**だったので置換する。

**真の欠陥は「dev `.env` がテストに漏れること」自体**であって `.env` の値ではない。
漏れている 3 変数のうち 2 つは **dev としては正しい値**であり、直すと今度はローカル開発が壊れる:

| 変数 | dev `.env` (正しい) | `.env.test` (テストの期待) | 落ちるテスト |
|---|---|---|---|
| `BETTER_AUTH_COOKIE_DOMAIN` | `localhost` | `.appily.run` | `auth [§8 #7]` Set-Cookie 契約 |
| `PUBLIC_WEB_URL` | `http://localhost:5173` | `https://atender.appily.run` | `cors-cookie [§8 #70]` OPTIONS の Allow-Origin が null |
| `BETTER_AUTH_TRUSTED_ORIGINS` | `...,atender://` ← **これだけは真のバグ** (`auth` 欠落) | `...,atender://auth` | `ios-api §8.4` native/callback 3 件 |

→ **合計 5 件**。3 変数を `.env.test` 相当に揃えると **5 件とも pass** し、
全体が **17 failed / 318 passed / 1 skipped** = 台帳の A1-A8 + B1-B5 + Magic Link 4 = **17 件と完全一致**する
(2026-07-17 実測、`3c9e85b`)。**未分類 0**。

- **実装コードは全て正しい**。`cors-cookie §8 #70` は `clientVersionGuard` 導入前 (`index.ts` を `2ddd1f8` に戻した状態)
  でも同一に失敗するので、version-management feature の regression ではない (negative control 実施済)。
- **恒久対策 (未実施・要判断)**: Vitest 側で dev `.env` を読ませない
  (app が import 時に dotenv で `.env` を読む構成が原因)。`.env` を書き換える運用は
  「テストを通すとローカル開発が壊れる」トレードオフになるので採らない。
- **本番影響の注意**: `BETTER_AUTH_TRUSTED_ORIGINS` の truncate (`atender://` vs `atender://auth`) が
  Coolify PROD に入ると native ログインが本番で無効化される。投入値は厳密に `atender://auth` であること。
- 関連: `Muraki/knowledge/gotcha/env-module-import-time-parse-defeats-runtime-env-swap.md`

### テスト方法論の限界 (実装は正しい。in-process env 差し替えで観測不能)

- `tests/auth-apple.test.ts > registers the Apple provider route when dynamic client secret env is configured` → **it.skip 化済み**。
  - 設計 A6 の「provider 非 null 側 = apple ルート存在 (非404)」は、`src/env.ts` が **import 時に process.env を一度パースして固定**するため、実行時 `process.env.APPLE_* set → resetAuth()` では `getAppleProviderConfig` に届かず in-process 検証不能。
  - **実装は正しい**: APPLE_* をプロセス起動前に export した boot-probe で `POST /sign-in/social {provider:"apple"}` が **401 INVALID_TOKEN (provider 登録済・bogus idToken 拒否)** を返す (404 でない) ことを実証。
  - 詳細 gotcha: `Muraki/knowledge/gotcha/env-module-import-time-parse-defeats-runtime-env-swap.md`。
  - A6 の「未設定側 = 404」は in-process で pass。B1-B5 (buildAppleClientSecret / normalizeApplePem) は 5 件全 pass。

## 実行環境メモ (Reviewer harness)

- この harness では `prisma migrate deploy` / `prisma` CLI が起動時ハングする (schema-engine バイナリ直叩きは即動作)。テスト実行時は `tests/helpers/db.ts ensureTemplateDb` の `npx prisma migrate deploy` をシムで差し替え、既知の正しい `template.db` を復元して回避した (スキーマは本 feature で不変)。
- Vitest 実行は `CHECKPOINT_DISABLE=1` + シム PATH + サンドボックス無効が必要。

## iOS (apps/ios, XCTest)

**ベースライン: 201 GREEN / 0 RED** (`feature/version-management` = `3c9e85b` + Reviewer 追記、実測 2026-07-17)。
内訳: 183 (`fix/room-week-contract` = `eb96e8a`、2026-07-17 実測) + **version-management 18**
(`VersionGateTests` = Codex 生成 16 + Reviewer 追記 2)。
`Executed 201 tests, with 0 failures (0 unexpected)`。**未分類の失敗 0**。
前々回 174 (feature/phase-e-p1、2026-07-16) → +9 (`RoomWeekContractTests`) → 183 → +18 = 201 で件数が繋がる。
実行: `xcodegen generate` → `xcodebuild test -project Atender.xcodeproj -scheme Atender -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.2'`

### ★ この台帳自体が失敗を隠していた (2026-07-16 の教訓)

旧記載「**ベースライン 157 GREEN**」は**二重に誤り**だった。Leader の独立実測で判明:

1. 件数が違う — 実際の HEAD (`d64720c`) は **172 テスト** (157 はいつの時点かも不明な陳腐値)
2. **GREEN ですらなかった** — 172 中 **2 RED** (= 170 GREEN)

「157 GREEN」を信じて `xcodebuild test` の総数だけ見ていれば、2 件の RED は**「ベースラインだから」で素通り**する。
数字を台帳に書くときは**測った日と測ったコミットを併記**し、`Executed N tests, with M failures` の M も必ず記録する。
件数だけの台帳は failure を隠す (CLAUDE.md「未分類の失敗を残したままのマージは不可」が機能しなくなる)。

### 解消済みの失敗 2 件 — 分類: **テスト陳腐化** / 原因コミット `315d542` (atender リブランド) / **P1 で修正済み**

`315d542` が azure 配色へのリブランドで**本番コードの色だけを変え、テストの期待値を置き去りにした**。実装は正しく、テストが現実に追随していなかった。

| テスト | 本番の実値 | テストの旧期待 | 
|---|---|---|
| `MeetingExpansionTests.testOutputWithinPalette` | `TimetableLogic.swift:104` `MemberColor.palette` = `#12B172,#56D8C3,#568CFC,#A978FA,#FC6ABF,#FD728E` (6色) | `#10b981,#60a5fa,#f472b6,#8b5cf6,#f59e0b` (5色) — **重なりゼロ**につき `palette.contains(...)` は原理的に必ず false |
| `SelfTimetableViewModelTests.testEventInputsColorFallbackWhenCourseMissing` | `SelfTimetableView.swift:97` フォールバック = `#1E96E6` | `#F97316` |

対応: **期待値をリブランド後の実値に修正** (Leader 採用判断)。リブランドは本番稼働済みなので、テストを現実に合わせるのが正しい保守。

### P1 (E0+E1) でのテスト数の増減 — 内訳は突合済み

- `-3`: `TodayViewModelTests` 削除 (E0-1 の死にコード削除。減少分が**全て**このファイル由来であることを親コミットの `func test` 数 = 3 で確認)
- `+5`: Reviewer 新規 — `TypographyRegistrationTests` (2) / `HomeChipsTests` (3)
- **172 − 3 + 5 = 174** (完全一致)

### fix/room-week-contract (eb96e8a) で追加した配線テスト — 2026-07-17

`RoomWeekContractTests` 9 件 (Reviewer 生成)。**既存 174 は全て pass のまま、regression 0**。

追加理由: `GET /api/rooms/:id/week` の**幻のラッパー**バグが 174 GREEN の下を通り抜けていた。
既存 `DTODecodingTests:326` が `decode(RoomWeekDto.self, from: fixture)` と**型直書き**で、
repository が `as:` に渡す型を一度も実行していなかったため (DTO 層も APIClient 層も正しく、配線だけが無テスト)。

- **負のコントロール実施済**: 実装を `eb96e8a^` (修正前) に戻すと **week 系 5 件が落ちる**
  (特に `testRoomWeekRepositoryRejectsWrappedResponse` が `members=2` で decode 成功して落ちる
  = 旧コードがラッパーを期待していた直接証拠)。兄弟 4 件は修正前でも pass = スコープが正しい。
- スタブ JSON は実 API (localhost:8787) から採取した `Fixtures/*Live.json` を使用 (手打ち禁止)。
- 詳細: `Muraki/knowledge/gotcha/dto-type-literal-decode-tests-bypass-repository-wiring.md`

### 未分類の失敗

- **なし** (0 件)。
