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
| ~~A6~~ | ~~`semesters [§8 #22]`~~ | **2026-07-30 解消 → 緑** (`fix/eventkit-sync-400` で zValidator の封筒を統一) | 期待は `{error:{code:"VALIDATION_ERROR"}}`。旧: zValidator が raw ZodError を素通ししていた |
| A7 | `roomEvent > validates ranges...` | **2026-07-30 実測更新**: `expected 'VALIDATION_ERROR' to be 'INVALID_RANGE'` (旧: `code` が undefined) | **#411**「start >= end は `400 { code: "INVALID_RANGE" }`」。**封筒統一だけでは緑にならない** — refine に `params:{code:"INVALID_RANGE"}` を付け、ラッパーが `issue.params.code` を優先する等のコード付与機構が要る (request スキーマへの追加変更)。**Leader 裁定でスコープ外に据え置き** |
| A8 | `room > regenerates invites...` | 再発行コードが 32 hex | 設計 §23「招待は `Room.inviteCode` 直書き (**cuid**)」+ schema `@default(cuid())`。`room.service.ts:190` の `randomUUID().replaceAll("-","")` のみ逸脱。**機能影響なし・軽微** — cuid に寄せるかテストを緩めるかは裁定事項 |

→ **A6 は 2026-07-30 に解消** (`fix/eventkit-sync-400`)。zValidator の error envelope を `{error:{code:"VALIDATION_ERROR",message,details}}` に統一する `apps/api/src/lib/validator.ts` を新設し、17 route の import を差し替えた。

> **★ この封筒バグは実機で噴き出した。** iOS の `ErrorResponse` (`code`/`message` が非 Optional) が raw ZodError を decode できず、実機に「サーバーエラー (HTTP 400)」という**中身ゼロの文字列**として出ていた。原因特定にサーバーの再現が必要になり、画面からもログからも辿れなかった。台帳に「全バリデーションエラーの UX を劣化させている実バグ」と書かれてから約 2 週間放置されていた実例。
>
> **A7 は封筒統一だけでは緑にならない** (設計 #411 が要求するのは `INVALID_RANGE` で、汎用の `VALIDATION_ERROR` とは別)。失敗理由は「`code` が undefined」→「`code` が `VALIDATION_ERROR`」に変化した。

#### A9. ICS の `rrule` に DTSTART 行が混入する (2026-07-17 発見)

**分類: 実装バグ。★ 終日 + RRULE で `expandBetween` / `validateRRule` が throw する (機能が死ぬ)。**
テストは無い (この経路は今まで到達不能だった)。

> **★ 訂正 (2026-07-17)**: 初版で Leader が「実害は美観と将来の脆さのみ。日付は壊れない」と分類したのは**誤り**。
> Leader は `DTSTART;TZID=...` 形式**だけ**を測って「壊れない」と結論し、その範囲を明示せずに断言していた。
> Developer の指摘を受けて形式別に再測定した結果、**終日イベント由来の `DTSTART:...Z` 形式では throw する**ことが判明。
> 教訓: **範囲を区切って測った主張は、その外側全部に対する否定的主張になる**。範囲を明示せず断言しない
> (`knowledge/role/developer.md` に同旨のノートあり)。

`apps/api/src/lib/icsParse.ts:87` が `rrule.toString()` の戻りを `replace(/^RRULE:/i, "")` で処理しているが、
実際の戻りは 2 行:

```
"DTSTART;TZID=Asia/Tokyo:20260707T130000\nRRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10"
```

先頭が `DTSTART` なので **replace が空振り**し、bare な `FREQ=...` にならない。この値がそのまま
`recurrenceRule` として DB に保存され、preview レスポンスにも露出する。

**なぜ今まで露見しなかったか**: `parseICS` 自体が CJS/ESM interop で undefined だったため、
**この経路は一度も実行されたことがなかった** (`fix/ics-esm-import` で parseICS が動くようになり初めて到達可能に)。

**実測した影響範囲** (2026-07-17、`expandBetween` / `validateRRule` を実経路で計測)。**混入する DTSTART の形式で結果が割れる**:

| 混入形式 | 由来 | `validateRRule` | `expandBetween` |
|---|---|---|---|
| `DTSTART;TZID=Asia/Tokyo:...` | TZID 付きの通常イベント | 通過 | **正常な rrule と完全一致** (3 件 → 同一日付)。埋め込み DTSTART は外側に負け、ゴミ行は無視される |
| **`DTSTART:...Z`** | **終日イベント** | **THROW** `Unknown RRULE property 'DTSTART:20260709T000000Z'` | **THROW** (同上) |

rrulestr は `DTSTART;TZID=...` 形式なら食えるが `DTSTART:...Z` 形式は食えない、という非対称が原因。

→ **終日 + 繰り返しの ICS は commit 経路 (`icsImport.service.ts:124`) で死ぬ。** 終日の繰り返し
(毎週の休講、定例の終日予定) は実 ICS で一般的なので、**ICS 機能を出すなら A9 の修正が前提**。
`fix/ics-esm-import` に含めてスコープに戻した (2026-07-17)。

**HEAD でも同一 throw = 本修正による regression ではない** (もともと parseICS が動いていなかったので誰も到達していなかっただけ)。

修正は `toString()` から `RRULE:` 行だけを
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

### ★ 実測ベースライン更新 (2026-07-29, commit `fcfdc4d`, Researcher / カレンダー3レーン着手時)

`cd apps/api ; pnpm exec vitest run` → **Test Files 12 failed | 23 passed (35) / Tests 28 failed | 339 passed | 1 skipped (368)**

内訳: `28 = 17 (2026-07-16 の既存台帳) + 6 (下記 C 群 = 新規) + 5 (dev .env 漏れ)`。
`.env.test` 相当を当てた場合は **23 failed**。**未分類 0**。

### C. テスト陳腐化 — ハードコード日付の腐敗 (`personal-calendar-share.test.ts` 6 件)

**分類: テスト陳腐化 (実装・設計とも正しい)。原因コミット `2d6fece` (2026-07-23、main へは `7583538` build 10)。ただし「コミットで壊れた」のではなく、テスト内のリテラル日付が実行日より過去に滑ったことで 2026-07-26 (M9 のみ 07-27) から自動的に落ち始めた。**

台帳のベースライン実測 `f30391f` (2026-07-16) 時点ではファイル自体が存在しない (`git ls-tree` で確認) ので、台帳に無いのは当然。

`projectShare` (`personalCalendarShare.service.ts:100-105`) は投影範囲を `today().startOfDay 〜 +3ヶ月` で取る。これは設計 `.designs/20260723-calendar-eventkit-sync-and-redesign.md:230` の仕様どおり。一方テストは執筆日 (07-23) の 2〜3 日後である `2026-07-25` / `2026-07-26` を「未来の日付」としてリテラルで埋めていた。

| # | テスト (file:line) | 期待 → 実測 | 設計の根拠 |
|---|---|---|---|
| C1 | `[M2] POST creates a share and projects…` (`:63`) | `length 1` → **0** | `:506` M1 + `:230` 範囲 |
| C2 | `[M3] projects only events in the today-to-three-month range` (`:104`) | `["range later","range start"]` → **`["range later"]`** | `:230` 範囲 |
| C3 | `[M3/M4] TITLE_MAPPED applies matching rule…` (`:150`) | `"予定"` → **`undefined`** | `:508` M3 + `:509` M4 |
| C4 | `[M5] BUSY_ONLY projects busy titles…` (`:187`) | `length 1` → **0** | `:507` M2 |
| C5 | `[M6] updating a share replaces stale projections` (`:222`) | `length 1` → **0** | `:510` M5 |
| C6 | `[M9] each room member's share projects only that member's…` (`:327`) | `length 1` → **0** | `:225-236` (userId スコープ) |

**決定的プローブ (2026-07-29 実測、後始末済)**:
1. 全日付を +1ヶ月 (`07-25→08-25`, `07-26→08-26`) にしたコピーを実行 → **9 tests passed (9)**。6 件全 PASS。
2. M2 のみ `date` を「今日 (07-29)」/「昨日 (07-28)」で実行 → 今日 **PASS** / 昨日 **FAIL**。`date >= today().startOfDay` の境界そのもの。

→ **実装バグではない。修正不要** (下記のとおり進行中レーンで消える)。

**対応方針**: `.designs/20260729-personal-calendar-rebuild.md:1423` が「`tests/personal-calendar-share.test.ts` — P1〜P10 へ書き換え (既存 9 件は単発前提)」と明記しており、本ファイルは `feature/personal-calendar-rebuild` で**丸ごと置換される**。今直すのは二重手間。§5.5 (`:549-564`) は範囲仕様・マスク規則・`externalUid` を据え置くので、C1-C6 が守る仕様は新設計でも生きる。

> **★ 次に触る人への警告**: 新設計の §P テスト仕様 `:1344` (P4 = 7/23-24) / `:1345` (P5 = 7/27) は**既に過去日**。投影窓が `today()〜+3ヶ月` のままなので、逐語実装すると **P4/P5 は生成直後に RED** になる。日付は実行時計算 (相対) で書くこと。関連: `Muraki/knowledge/gotcha/hardcoded-future-dates-decay-into-baseline-failures.md`

**なお `eventkit-sync.test.ts` は同じ `2026-07-25` を使っているが全 PASS** — `reconcileEventKit` は `range` を明示引数で受けるため `today()` に依存しない。時限爆弾は「`today()` アンカーの窓を持つ機能」に限る。

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

### iOS 26.5 の「iPhone 16」は既定で存在しない (2026-07-17)

UI 刷新の設計 §10.1 は Liquid Glass の目視検証に `-destination 'platform=iOS Simulator,name=iPhone 16,OS=26.5'` を指定するが、**iOS 26.x ランタイムに既定で入っているデバイスは iPhone 17 Pro / 17 Pro Max / 17e だけ**で、この destination は解決しない。

ただし **26.5 ランタイムは iPhone 16 を「デバイス型として」対応している** (対応 65 種に含まれる)。インスタンスが無いだけなので、作れば設計のコマンドがそのまま動く:

```sh
xcrun simctl create "iPhone 16" \
  "com.apple.CoreSimulator.SimDeviceType.iPhone-16" \
  "com.apple.CoreSimulator.SimRuntime.iOS-26-5"
```

**iPhone 17 Pro で代用しない** — 画面寸法が変わると §10.1 が要求する「P2 前後の同一スクショ比較」が成立しなくなる (18.2 側は iPhone 16 のため)。名前が同じでも OS が違えば destination は一意に解決する。

### ★ 統合後の実測 (2026-07-29, commit `3939509` = レーンA+B+409修正マージ後, Leader)

3 パッケージをマージ後のツリーで実測。**未分類 0。本作業による新規ベースライン失敗 0。**

| | 実測 | 内訳 |
|---|---|---|
| **apps/api** | **17 failed / 449 passed / 1 skipped (467)** | A1-A8 + B1-B5 + Magic Link 4 と集合完全一致。`.env` を退避して測定 |
| **apps/web** | **26 failed / 349 passed (375)** | ベースライン 27 − W7-3 (409 修正) = 26 |
| **apps/ios** | **398 passed / 0 failed** | `** TEST SUCCEEDED **` |

iOS の推移: 317 (2026-07-23) − 8 (設計 §10 が「削除して置換」と指定した分) + 40 (個人カレンダー reviewer 生成) + 46 (学期カレンダー reviewer 生成) + 3 = **398**。

---

## Web (apps/web, Vitest + RTL + MSW)

### ★ 実測ベースライン (2026-07-29, commit `fcfdc4d`, Researcher / カレンダー3レーン着手時)

`cd apps/web ; pnpm exec vitest run` → **Test Files 7 failed | 37 passed (44) / Tests 27 failed | 231 passed (258)**
(Node v25.9.0 / vitest 2.1.9。2 回走らせて同一集合)

**`apps/web` には `test` script が無い。`pnpm --filter @atender/web test` は `ERR_PNPM_NO_SCRIPT`。`pnpm exec vitest run` を使う。**

失敗 27 件は**全て `tests/routes/*` の `renderApp` 経由**。`tests/components/*` `tests/lib/*` は全 GREEN。
**未分類 0**。内訳: テスト陳腐化 23 / テストのバグ 1 / 実装ギャップ 3 (うち 1 件は本番実害)。

**API 側と違い dev `.env` 汚染は起きていない。** `apps/web/.env` は `VITE_API_URL=http://localhost:8787` を持つが、`vitest.config.ts` の `define: { "import.meta.env.VITE_API_URL": "http://localhost:3000" }` が transform 時に上書きし MSW の `API_URL` と一致させている。**この define 1 行が汚染を防いでいる。消すと全崩壊する。**

### 根本原因: ルートテストと MSW フィクスチャが 2 ヶ月間刷新に置き去り

`git log -- apps/web/tests/routes/*.test.tsx`: Home / Setup / SignIn / Templates / Verify は **`d016daf` (2026-05-13 MVP) の 1 コミットのみ**で以降無変更。Settings は +1、Stats は +2 (いずれも 2026-06-11 まで)。`tests/msw/handlers.ts` も最終更新 2026-06-11。その後の v9 全面再構築 / login-unify / home-collapsible / semester 再設計を**一度も取り込んでいない**。

| # | グループ | 件数 | 分類 | 原因コミット |
|---|---|---|---|---|
| W1 | Home 画面の全面刷新 (挨拶/マスコット/今日のコマカード/mark-all/空日文言がすべて消え、`ContextChips + HomeViewModeTabs + HomeBody + SelfTodayCTA` に置換) | 9 | テスト陳腐化 | `4efb93c` (2026-05-28 v9) + build 9 折りたたみ CTA |
| W2 | ボトムナビが 5 タブ IA (ホーム/学期・科目/ルーム/友達/設定) になり Timetable/Templates/Stats リンクが消滅 | 1 | テスト陳腐化 | `4efb93c` |
| W3 | `/stats` が `/semester` への redirect route になり、画面は `/api/stats` でなく `/api/semesters/:id/overview` を叩く (MSW にハンドラ無し) | 3 | テスト陳腐化 | `4efb93c` |
| W4 | Setup 完了後の `/timetable` が redirect route (`→ /`) になった。テストの `/api/me` が `isComplete:false` を返し続けるので `requireCompleteSetup` が `/setup` に戻す | 1 | テスト陳腐化 | `4efb93c` |
| W5 | `/login`→`/signin` 統合 + `redirectIfSignedIn` guard。MSW の `/api/me` が常に 200 を返すため `/` に弾かれる。加えてログイン画面は Apple/Google/メール の 3 ボタン選択式に統一済でメール入力欄は初期表示に無い | 6 | テスト陳腐化 (二重) | `17bf694` (2026-05-27) + `20260716-login-unify.md` |
| W6 | Settings がメニュー行 + sheet 構成に再設計 (名前は text 表示、`出欠ルール` は sheet の先) | 3 | テスト陳腐化 | `4efb93c` (`20260528-v9-timetree-rework.md:1830,1879`) |
| W7 | **Web `/templates` が `20260515-redesign.md` §4.3 の full rewrite を未実装** | ~~3~~ → **2** | **実装ギャップ (据え置き決定済)**。W7-3 のみ 2026-07-29 に修正済 | 未実装 (下記) |
| W8 | `Verify` の `findByText(/学校選択\|学校/)` が Setup 画面の複数要素に多重ヒット。`path()` の `/setup` アサートは pass、画面も正しい | 1 | テストのバグ (クエリが緩い) | — |

**27 件中 24 件は 2026-05-27〜28 の 2 コミットで死んでおり、以降約 2 ヶ月間ベースラインとして無分類で放置されていた。**

#### 実装が正しいことの決定的プローブ (2026-07-29 実測、プローブファイルは削除済)

- **W5**: `/api/me` を 401 に差し替えて `/signin` を render → 逐語で `下記のアカウントを使用してログイン / Appleで続ける / Google で続ける / メールで続ける`。設計どおり。
- **W5 (sign-out)**: sign-out 成功後に `/api/me` を 401 に切り替えるプローブ → **`signedOut=true path=/signin`**。実装 (`components/settings/Settings.tsx:42`) は完全に正しい。既存テストは「セッションが終わること」をモデル化していないだけ。
- **W2**: `/` の実ナビ href は `/|ホーム ;; /semester|学期・科目 ;; /rooms|ルーム ;; /friends|友達 ;; /settings|設定`。CLAUDE.md の「ボトムタブ = 5項目」と完全一致。

#### W7. Web `/templates` — ★ 409 コピー衝突が UI に一切出ない (本番実害)

**分類: 実装ギャップ。ただし `20260721-public-timetable-search.md:22` が「Web UI (`apps/web`) は今回いじらない (「Web いったん放置」方針)」と明記しており、意図的な据え置き。**

`apps/web/src/routes/Templates.tsx` は MVP 相当の dev グレードのまま (`学校 ID` / `学科 ID` を生入力、placeholder 無し、詳細ビュー無し、`useCopyTemplate` に `onError` 無し、エラー表示 JSX ゼロ)。`20260515-redesign.md` §4.3 が指示した `components/templates/{TemplateCard,TemplateCopySheet,TemplatePublishSheet}.tsx` は**ディレクトリごと存在しない**。

| # | テスト | 期待 → 実測 | 仕様の根拠 |
|---|---|---|---|
| W7-1 | `renders school, department, and q filters` | placeholder `/検索\|q/i` → **placeholder 属性が無い** | `20260515-redesign.md` §4.3 |
| W7-2 | `shows template cards with ... actions` | `button /詳細を見る/` → **存在しない** | `20260513-mvp.md:1368` |
| ~~W7-3~~ | ~~`shows the 409 copy conflict message`~~ | **2026-07-29 修正済 → 緑** | `20260515-redesign.md:1047` 仕様 #125 |

**W7-3 は本番で壊れていた挙動 — 2026-07-29 に修正済 (`fix/templates-copy-409`)**:
- 画面: https://atender.appily.run `/templates` (「みんなの時間割」)
- 症状: 既に UserTimetable がある学期を選んだ状態でテンプレの `コピー` を押すと、API は 409 を返しているのに **UI が完全に無反応**。決定的プローブで click → `409_HITS: 1` (リクエストは飛んでいる) → 1.5 秒後の `document.body.textContent` が click 前と **byte 一致** (`DOM_CHANGED: false`) を確認していた。ユーザーからは「コピーを押しても何も起きない」
- 原因: 表示側の JSX が無かっただけ。TanStack Query v5 は `onError` の有無に関わらず `mutation.error` を保持するので hook 側は元から正しい
- 修正: `Templates.tsx` に inline エラーを追加 (409 は仕様 #125 の逐語文言、それ以外は汎用)。17 行・1 ファイル
- **★ 教訓**: この 1 件は「Web の 27 件はどうせベースライン失敗」という扱いのまま**約 2 ヶ月間、本番でボタンが無反応のまま放置されていた**。台帳の存在理由 (「ベースラインの山に本物のバグが隠れる」) が Web でも再現した実例

> **★ 同型の未修正バグ**: 同じ画面の `自分の時間割を公開` (`usePublishTimetable`) も**エラー表示が皆無**で、失敗すると同様に無反応になる。今回のスコープ外として手を付けていない。次に `/templates` を触るときに合わせて直すこと。

### 環境依存 / ハーネスの癖 (現時点で失敗数には出ていないが、次に触る人が踏む)

1. **Node v25.9.0 + jsdom 29 では `window.localStorage.getItem is not a function`。** `src/lib/useTheme.ts:10` を通る画面 (= `/settings`) を素で render すると ErrorBoundary に落ちる。`tests/routes/Settings.test.tsx` は `beforeAll` で自前 polyfill を入れて回避済。**新規に `/settings` 系を render するテストを書くなら同じ polyfill が要る。**
2. **MSW ハンドラ集合が 2026-06-11 で凍結。** `tests/setup.ts:6` が `onUnhandledRequest: "error"` なので、以降に増えた `GET /api/rooms` / `GET /api/user-timetables` / `GET /api/semesters/:id/overview` などは全て落ちる。**W1/W3 は設計の前提を直しただけでは通らず、ハンドラ追加が必須。**
3. **`tests/setup.ts:50` が `console.error` を throw に変えている。** React 19 の `act(...)` 警告を踏むと、テストの合否とは別枠の "Unhandled Errors" としてラン全体に出る。
4. **`git log` / `git blame` の pathspec は、本体リポジトリ (`projects/atender`) では正常に動く。** 台帳の API 節にある「pathspec でハングする」は **worktree (`Muraki/worktrees/*`) 固有**。

### 未分類の失敗

- **なし** (0 件)。

---

## iOS (apps/ios, XCTest)

**ベースライン: 512 GREEN / 0 RED** (main = `86c6b9d` = build 15 出荷後、2026-07-30 Reviewer 実測 / build 16 P1 レビュー時)。`Executed 512 tests, with 0 failures` / `** TEST SUCCEEDED **`。**未分類の失敗 0**。測り方: worktree で `-derivedDataPath <scratchpad>/dd-p1` 隔離 + 本レーンの新規 3 クラスを `-skip-testing` して純ベースラインを直接測った。

旧記載: 398 GREEN / 0 RED (main = `3939509` = カレンダー3レーン マージ後、2026-07-29 Leader 実測)。`TEST_RUNNER_TZ=UTC` でも緑 (JST 導出が端末 TZ に依存しないことの証明、Reviewer 実測)。**398 → 512 の +114 は build 14 / build 15 の 2 レーン (カレンダー UI 修正 5 点 / タップ判定修正) が台帳に記録されずに積み上がった分**で、失敗ではない。件数を記録せずにレーンをマージすると次の Reviewer が「+114 は何か」を毎回調べ直すことになる (role note 41)。

旧記載: 268 GREEN / 0 RED (main = `0368155` = UI 刷新 P3 マージ後、2026-07-18 Leader 実測)。
`Executed 268 tests, with 0 failures (0 unexpected)` / `** TEST SUCCEEDED **`。264 + ColorTintTests 4 = 268。**未分類の失敗 0**。

### ★ このスイートは「壊れた画面」を検出しない (2026-07-17 の教訓)

UI 刷新 P2 で `RoomDetailView` のタブピッカーがタップ不能に壊れていた状態でも、UI テストハーネスは **`Executed 6 tests, 0 failures` / `TEST SUCCEEDED`** を返した。**合否は無情報だった。**

- 設計 §9.4 自身が「本設計の中心的主張 (native 部品にすると Liquid Glass が出る) をユニットテストは 1 ミリも検証しない」と明記している
- 見た目・可達性の判定は**ピクセルと目視**でしか行えない。`0 failures` を根拠にしない
- 有効だった手法: 連続スクショの **byte 一致 = その間の tap が no-op だった証拠**。ただし「ハーネスが別画面で迷子」でも byte 一致するので、**先に画面が正しいことを示してから**主張する (`Muraki/knowledge/gotcha/screenshot-byte-identity-conflates-noop-tap-with-lost-harness.md`)

件数の追跡 (件数だけの台帳は failure を隠す — 下記「この台帳自体が失敗を隠していた」参照):

| 時点 | 件数 | 増減の内訳 |
|---|---|---|
| feature/phase-e-p1 (2026-07-16) | 174 | — |
| `eb96e8a` fix/room-week-contract | 183 | +9 (`RoomWeekContractTests`) |
| `3c9e85b` feature/version-management | 201 | +18 (`VersionGateTests` = Codex 生成 16 + Reviewer 追記 2) |
| **`4dfd3a9` main (UI 刷新 P1)** | **263** | **+62** — −1 (`DayConventionTests.testTodayDayOfWeekJsRoundsWeekendToMonday` を §9.2 で削除) / +3 (`TypographyRegistrationTests` 2→5、#S4-#S8 に全面書き換え) / +2 (`NavigationTests` 2→4、#S10 + 負の対照) / +58 (新規 7 ファイル: SchoolClock 7 / TodayTimeline 17 / NowNextText 6 / TimetableGridLayout 12 / CalendarLayout 10 / Localization 3 / ScreenMetrics 3) |

実行: `xcodegen generate` → `xcodebuild test -project Atender.xcodeproj -scheme Atender -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.2'`

### ★ 資源を削除した後は `-derivedDataPath` で隔離して測る (2026-07-17 の教訓)

UI 刷新 P1 でバンドル済フォントを削除した後、**共有 DerivedData の増分ビルドが古い登録状態のまま走り、`TypographyRegistrationTests.testGoogleSansRemainsRegistered` が偽の RED を出した** (Leader が Reviewer の GREEN を疑い、危うく Developer に差し戻すところだった)。

- 静的検査 6 つ (フォント実体 / PostScript 名 / `project.yml` / 生成 `Info.plist` / `.app` 内 `.ttf` / `.app` 内 `Info.plist`) が**全て正しい**のに実行時だけ落ちる = 環境の徴候
- 副次的徴候: `25 tests skipped` が偽 RED の run にだけ現れた
- `-derivedDataPath <scratchpad>/dd-clean` を付けて隔離すれば即 GREEN。既存の DerivedData を壊さないので `rm -rf` より安全

詳細: `Muraki/knowledge/gotcha/stale-deriveddata-false-red-after-resource-deletion.md`

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
