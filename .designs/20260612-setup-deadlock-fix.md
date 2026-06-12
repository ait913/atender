# Setup デッドロック修正 — 完了判定の単一真実化 (setupGuard ⇔ me.isComplete)

## 目的 (1-3行)

新規ユーザーが Setup step3「完了して時間割を作る」を終えても Home に入れず `/setup` に送還され続ける本番デッドロックを解消する。原因は「セットアップ完了」の判定が router の `isComplete` (timetable 不問) と `setupGuard` (timetable 必須) で食い違っていること。**両者を単一の完了判定 (timetable 不問) に統一**し、時間割は Home 内の正規フロー (`SelfTimetableView`) で作らせる。

---

## 背景: 確定済みの原因 (Researcher 断定)

| 判定者 | 場所 | 完了条件 | timetable |
|---|---|---|---|
| router `requireCompleteSetup` | `apps/web/src/router.tsx:38` (`me.setupStatus.isComplete`) | `schoolId && departmentId && defaultSemesterId` | **不要** |
| `setupGuard` | `apps/api/src/middleware/setupGuard.ts:15` (`GET /api/today` 等が使用) | 上記 + `hasUserTimetable` | **必須** |

デッドロックの連鎖:
1. Setup step3 = `submitSemester` (`apps/web/src/routes/Setup.tsx:46-52`) は semester 作成 + `defaultSemesterId` PATCH のみ。**UserTimetable を作る mutation を Setup は呼ばない**。
2. `isComplete=true` (timetable 不問) なので router は `/` を通す。step3 後は `navigate({to:"/timetable"})` → `/timetable` は `/` へ redirect (`router.tsx:67`)。
3. Home が `GET /api/today` を発火 → `setupGuard` が `hasUserTimetable=false` で **403 SETUP_REQUIRED**。
4. `SelfTodayCTA.tsx:21` が 403/SETUP_REQUIRED を検知し `navigate({to:"/setup"})` → **Setup に送還 = ループ**。

UserTimetable を作る唯一の導線は Home 配下の `SelfTimetableView` だが、Home 到達前に弾かれるため新規ユーザーは構造的にデッドロック。5/28 v9 (4efb93c) から潜在の既存バグ。6/11 の totalSessions 削除・occurrence 母数化・学期編集・出欠ルール scope は無関係 (`setup-flow.test.ts` 8件 GREEN が裏付け)。`today.ts:18` は既に timetable 無しを空配列で返す実装。

## 確定方針 (案A)

`setupGuard` から `hasUserTimetable` 要件を外し、完了条件を router の `isComplete` と**完全一致**させる。統一後の単一の完了条件:

```
isSetupComplete = schoolId != null && departmentId != null && defaultSemesterId != null
```

これで「学校・学科・学期」が揃えば Home に入れ、時間割は Home の `SelfTimetableView` で作る正規フローに乗る。

---

## 設計

### 1. 完了判定の単一真実 (single source of truth)

`apps/api/src/middleware/setupGuard.ts` と `apps/api/src/routes/me.ts` が**同一の純粋関数**を参照する。新規ヘルパーを `apps/api/src/lib/setupStatus.ts` に新設する。

```ts
// apps/api/src/lib/setupStatus.ts (新規)
export type SetupFields = {
  schoolId: string | null;
  departmentId: string | null;
  defaultSemesterId: string | null;
};

/** セットアップ完了の単一判定。timetable は完了要件に含めない (Home 内で作る)。 */
export function isSetupComplete(user: SetupFields): boolean {
  return user.schoolId != null && user.departmentId != null && user.defaultSemesterId != null;
}
```

#### `setupGuard.ts` — after

```ts
import { isSetupComplete } from "../lib/setupStatus";

export const setupGuard: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const sessionUser = c.get("user");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    select: { id: true, schoolId: true, departmentId: true, defaultSemesterId: true },
  });
  if (!isSetupComplete(user)) {
    throw new AppError(403, "SETUP_REQUIRED", "User must complete setup");
  }
  await next();
};
```

- `hasUserTimetable` の count クエリ (旧 `setupGuard.ts:12-13`) は**削除**する。
- `setupGuard` のシグネチャ・throw する `AppError(403, "SETUP_REQUIRED", ...)` は不変。

#### `me.ts` — `getMeResponse` の `setupStatus` を after

```ts
const setupStatus = {
  hasSchool: user.schoolId != null,
  hasDepartment: user.departmentId != null,
  hasSemester: user.defaultSemesterId != null,
  hasUserTimetable,                  // ← 表示用に残す (下記注記)
  isComplete: isSetupComplete(user), // ← ヘルパー参照に統一
};
```

- `me.ts:40` の `isComplete` インライン式を `isSetupComplete(user)` に置換 (条件式自体は等価。重複定義を消すのが目的)。
- `hasUserTimetable` フィールドは `MeResponseDto` / web 側 `SetupStatus` 型 (`apps/web/src/api/hooks/types.ts:69`) に既存。`isComplete` から外れただけで**フィールドは残す** (DTO 後方互換を壊さない・将来 UI が「時間割未作成バッジ」等で使える)。`getMeResponse` の `hasUserTimetable` count クエリ (`me.ts:32-33`) は残す。

#### `setupGuard` を使う全エンドポイント (timetable 無しで動くか確認)

`setupGuard` は以下のルートで使用 (grep 済、計 60+ 箇所)。`hasUserTimetable` 除去後、**timetable がまだ無い setup-complete ユーザー**がこれらを叩いても 403 にならなくなる。各々が timetable 無し状態で破綻しないことを確認した結論:

| ルート群 | timetable 無し時の挙動 | 判定 |
|---|---|---|
| `GET /api/today` (`today.ts`) | `findActiveUserTimetable` が null → `{date, occurrences: []}` を返す (`today.ts:18`) | OK (既実装) |
| `POST /api/user-timetables` 系・`POST /api/meetings/bulk`・`POST /api/courses` | **これらこそ timetable を作る/育てる導線**。setup-complete で叩けるべき | OK (むしろ目的) |
| `GET /api/user-timetables/:id` | 他人/不存在は別途 404/403。自分の timetable が無ければ呼ばれない (一覧から辿る) | OK |
| `GET /api/stats` (`stats.ts`) | 既存実装が timetable/occurrence 0 件を空集計で返す (occurrence 母数化済) | OK |
| `GET /api/rooms` 系・`/api/friends`・`/api/me/ics-title-rules`・`/api/me/google-calendar/*` | 個人 timetable に非依存 (rooms/friends/連携は別リソース) | OK |
| `POST /api/attendance/*` (`attendance.ts`) | service 層が `findActiveUserTimetable` null で個別に `SETUP_REQUIRED` を投げる (`attendance.service.ts:28,89`, `attendance.ts:32`) | OK (timetable 必須操作は service 層で別途ガード = 二重に守られる。新規ユーザーは出欠を打つ前に timetable を作る) |

**結論**: `setupGuard` から timetable 要件を外しても、timetable が真に必須な操作 (出欠記録・suspension) は `attendance.service.ts` / `timetableSuspension.service.ts` が個別に `SETUP_REQUIRED` を投げる二重ガードが既にある。`setupGuard` の役目は「学校・学科・学期が揃ったか」のオンボーディングゲートに純化される。

### 2. Home / SelfTimetableView の timetable 無し UX (追加実装不要 — 既存導線を確認)

setupGuard 通過後、新規ユーザーは「学期はあるが timetable 無し」で Home (`mode="timetable"`) に入る。既存 `SelfTimetableView` (`apps/web/src/components/home/SelfTimetableView.tsx`) は既にこの状態を扱える:

- `emptyTimetable` (39-43行): timetable が無くても `defaultSemesterId` があれば**デフォルト 5 日 × 5 限の空グリッド**を合成して表示する (`courses: []`, `meetings: []`)。
- `display = selected ?? createdTimetable ?? emptyTimetable` (44行): 実 timetable が無ければ空グリッドを描画。
- `ensureTimetable()` (46-57行): 空セルクリック時に**初回だけ実 UserTimetable を遅延作成** (`useCreateUserTimetable` → `POST /api/user-timetables`)。以降の meeting 追加はその timetable に乗る。
- `if (!display) return <Panel>先に学期を作成してください。</Panel>` (82行): `defaultSemesterId` も `semesters[0]` も無い場合のみ発火 = **setup-complete ユーザーでは起きない** (defaultSemesterId が必ずある)。よって新規ユーザーには空グリッドが出て、空セルタップで timetable 作成に入れる。

**判断: timetable 作成 CTA の追加実装は不要**。空グリッドの各セルが `onEmptyCellClick` の affordance (`+` ボタン) を持ち、タップで `MeetingEditModal` (mode=create) が開く = 時間割作成導線が既に明示されている。デッドロック解消の本質は「Home に到達できること」であり、到達後の UX は既存実装で成立する。

> スコープ外の改善余地 (本修正では**やらない**): 空グリッド上部に「最初の授業を追加しよう」等の説明テキストや、テンプレ選択への明示 CTA を出すこと。これは別 feature。本修正は「Home に入れる + 既存の空グリッドで時間割を作れる」までを保証する。

### 3. `SelfTodayCTA.tsx:21` の `/setup` 送還フォールバックの扱い (残す)

```ts
// apps/web/src/components/home/SelfTodayCTA.tsx:20-22 (現状のまま残す)
useEffect(() => {
  if (today.error instanceof ApiError && today.error.status === 403 && today.error.code === "SETUP_REQUIRED")
    void navigate({ to: "/setup" });
}, [navigate, today.error]);
```

**判断: 残す (変更しない)**。理由:
- setupGuard 統一後、setup-complete ユーザーの `GET /api/today` は 403 を返さなくなる (200 + 空 occurrences)。よってこの effect は**正常ユーザーでは発火しない** = デッドロックの原因にならない。
- 残す価値: セッション中に user の setup 状態が後退する稀ケース (例: 別タブで semester 削除、または router キャッシュと API の一時的不整合) で 403 が来たら `/setup` へ誘導するのは正しい挙動。統一基準 (学期が無い = `isSetupComplete=false`) と矛盾しない: 403 が来るのは API 側で `isSetupComplete=false` のときだけだから、その場合 `/setup` 送還は妥当。
- **誤送還しないことの保証**: 統一後は「学期はあるが timetable 無し」で 403 が出ないので、正常な新規ユーザーがこの effect で `/setup` に戻されることはない。これを web 統合テストで実証する (§挙動仕様 受け入れ条件 A)。

### 4. Setup step3 後の遷移先 (現状維持)

`submitSemester` の `navigate({to:"/timetable"})` (`Setup.tsx:51`) は**変更しない**。`/timetable` → `/` redirect (`router.tsx:67`) で Home に入る。統一後は `requireCompleteSetup` (`router.tsx:38`) が `isComplete=true` で通すため、Home (= 時間割作成を促す空グリッド) に着地する。明示的に時間割作成画面へ送る必要はない (Home の timetable タブが既にそれ)。

### 5. 回帰防止 (完了要件を緩めすぎない)

統一後も完了の最小要件は `schoolId && departmentId && defaultSemesterId` で不変。途中状態のユーザーは引き続き Setup に留まる:
- 何も無い → `isComplete=false` → router が `/setup` へ。
- 学校だけ / 学校+学科だけ → `defaultSemesterId=null` → `isComplete=false` → `/setup` に留まる。
- 学期まで完了 → `isComplete=true` → Home に入れる (timetable 不問)。

---

## データモデル / DTO

スキーマ変更なし。`MeResponseDto.setupStatus` の形も不変 (`hasSchool/hasDepartment/hasSemester/hasUserTimetable/isComplete` の 5 boolean)。`isComplete` の**意味**だけが「timetable を含まない AND」に確定する (実質は元々 router 側がその定義だったので、`me.ts` の値は変わらない。変わるのは `setupGuard` の通過条件)。

---

## API 契約 (before / after)

### `setupGuard` 通過条件

| 状態 | before | after |
|---|---|---|
| 何も無い | 403 | 403 |
| 学校のみ | 403 | 403 |
| 学校+学科 | 403 | 403 |
| 学校+学科+学期 (timetable 無し) | **403** ← バグ | **通過** ← 修正 |
| 学校+学科+学期+timetable | 通過 | 通過 |

### `GET /api/today` レスポンス (timetable 無し・setup-complete)

```
200 OK
{ "date": "2026-05-13", "occurrences": [] }
```
(`today.ts:18` の既存実装。setupGuard 修正で 403 にならず到達する)

### `GET /api/me` レスポンス (学期まで完了・timetable 無し)

```jsonc
{
  "user": { "...": "...", "schoolId": "...", "departmentId": "...", "defaultSemesterId": "..." },
  "setupStatus": {
    "hasSchool": true, "hasDepartment": true, "hasSemester": true,
    "hasUserTimetable": false,   // ← timetable まだ無い
    "isComplete": true           // ← timetable 不問で完了
  }
}
```

---

## 関数シグネチャ (新設)

```ts
// apps/api/src/lib/setupStatus.ts
export type SetupFields = { schoolId: string | null; departmentId: string | null; defaultSemesterId: string | null };
export function isSetupComplete(user: SetupFields): boolean;
```

参照箇所: `setupGuard.ts` (ガード判定)、`me.ts` (`getMeResponse` の `isComplete`)。

---

## 挙動仕様 (Reviewer のテスト根拠)

「○○のとき△△」。`isSetupComplete = schoolId && departmentId && defaultSemesterId` を単一基準とする。

### 受け入れ条件 (最重要)

- **[受入A] Setup step3 完了 → Home に入り `/setup` に戻らない**: 学校・学科を設定済みのユーザーが学期作成 + `defaultSemesterId` PATCH を済ませた後、`/` (Home) に到達し、`GET /api/today` が 403 を返さず (200 + 空 occurrences)、`SelfTodayCTA` の effect が `/setup` へ navigate しないこと。**このデッドロックが解けたことを実証する最重要条件**。

### API (setupGuard / me / today) — `apps/api/tests/`

1. **何も無いユーザーのとき** `GET /api/today` は **403 SETUP_REQUIRED**。
2. **学校のみのユーザーのとき** `GET /api/today` は **403 SETUP_REQUIRED**。
3. **学校+学科のみのユーザーのとき** `GET /api/today` は **403 SETUP_REQUIRED**。
4. **学校+学科+学期が揃い timetable が無いユーザーのとき** `GET /api/today` は **200** を返し、body は `{ date: <JST 日付>, occurrences: [] }`。← 修正の核 (旧実装では 403)。
5. **学校+学科+学期+timetable が揃ったユーザーのとき** `GET /api/today` は **200** を返す (回帰なし)。
6. **学校+学科+学期が揃い timetable が無いユーザーのとき** `POST /api/user-timetables` (timetable 作成) が `setupGuard` で 403 にならず到達する (201 or 該当バリデーション結果)。← 「Home で timetable を作れる」のサーバ側保証。
7. **`GET /api/me`**: 学校+学科+学期完了・timetable 無しのとき `setupStatus` が `{ hasSchool:true, hasDepartment:true, hasSemester:true, hasUserTimetable:false, isComplete:true }`。
8. **`GET /api/me`**: 学校のみのとき `isComplete:false`。
9. **`isSetupComplete` ユニット**: `{school,dept,semester}` 全有 → true。いずれか null → false (3 パターン)。timetable は引数に存在しない (= 判定に無関係)。

### Web (Setup / SelfTodayCTA) — `apps/web/tests/`

10. **`SelfTodayCTA`**: `GET /api/today` が **200 + 空 occurrences** を返すとき、`navigate` が `/setup` に呼ばれない (effect 不発火)。← 受入A の web 側実証。
11. **`SelfTodayCTA`**: `GET /api/today` が **403 SETUP_REQUIRED** を返すとき、`navigate({to:"/setup"})` が呼ばれる (フォールバック保持の回帰確認)。
12. **`SelfTodayCTA`**: occurrences が空のとき (200) コンポーネントは何も描画しない (`occurrences.length === 0 ? null` の既存挙動、回帰確認)。
13. **Setup → Home 遷移 (統合)**: `me.setupStatus.isComplete=true` (timetable 無し fixture) で `/timetable` に navigate したとき、router が `/` (Home) を解決し `/setup` にリダイレクトしないこと。

### 既存テストとの関係

- `setup-flow.test.ts [§8 #14]` (学期+timetable 済ユーザーで `GET /api/user-timetables/:id` が 403) は、その fixture が `createUserTimetable` で timetable を作った上で `defaultSemesterId` を**セットしていない**ため `isComplete=false` 起因の 403。**統一後も 403 のまま** (defaultSemesterId 無し)。テストの意図は維持。Reviewer は既存アサーションが壊れないことを確認。
- `setup-flow.test.ts [§8 #16]` (`hasUserTimetable:true, isComplete:true`) は完全 setup ユーザー (`setupCompleteUser`) なので不変。
- 既存 `Setup.test.tsx` の `creates a semester ... and navigates to timetable` は `navigate({to:"/timetable"})` を検証。遷移先を変えないので**そのまま GREEN**。

### テスト fixture の追加 (Reviewer 向け契約)

API ヘルパー `apps/api/tests/helpers/auth.ts` に「setup-complete だが timetable 無し」を作る手段が必要。既存 `setupCompleteUser` (`auth.ts:141`) は必ず `createUserTimetable` を呼ぶ。**Reviewer は次のいずれかで timetable 無し状態を作る**:
- `setupCompleteUser` を呼んだ後、その timetable を `prisma.userTimetable.delete` で消す、または
- `createSchoolDepartment` + `createTestUser({schoolId, departmentId})` + `createSemester` + `prisma.user.update({defaultSemesterId})` を直に組む (timetable を作らない)。
- ※ヘルパーに `setupCompleteUser(db, { withTimetable: false })` オプションを足すのは Developer の実装範囲ではない (テストは Reviewer)。Reviewer がテスト内で上記手順を組んで良い。

Web 側 msw (`apps/web/tests/msw/handlers.ts`): 既存 `defaultMe` (`hasUserTimetable:true, isComplete:true`) と `setupRequiredMe` (全 false) に加え、**「学校+学科+学期完了・timetable 無し」fixture** が必要:
```ts
// 期待する形 (Reviewer がテスト内 or handlers に定義)
const semesterCompleteMe = {
  user: { ...defaultMe.user },               // schoolId/departmentId/defaultSemesterId は揃っている
  setupStatus: { hasSchool: true, hasDepartment: true, hasSemester: true, hasUserTimetable: false, isComplete: true },
};
```

---

## テスト基盤

- **API**: vitest。配置 `apps/api/tests/`。対象: `setupGuard` (today 経由の 403/200)、`me` の setupStatus、`isSetupComplete` ユニット (`apps/api/tests/setupStatus.test.ts` 新規 or `setup-flow.test.ts` に追記)、`POST /api/user-timetables` の到達性。ヘルパー: `apps/api/tests/helpers/auth.ts`, `helpers/http.ts`, `helpers/app.ts`。
- **Web**: vitest + jsdom + @testing-library/react + msw。配置 `apps/web/tests/`。対象: `SelfTodayCTA` (200/403 での navigate 分岐)、Setup→Home 遷移。`renderApp` (`apps/web/tests/utils/render.ts`)、msw handlers。
- **prop / data 契約 (描画テスト前提、`gotcha/design-must-specify-component-prop-contract-for-render-tests.md`)**:
  - `SelfTodayCTA` は **props 無し**コンポーネント。挙動は `useTodayOccurrences` (= `GET /api/today`) と `useNavigate` に依存。Reviewer は **msw で `/api/today` を制御**して 200(空)/403 を出し分け、`navigate` の発火有無を検証する。`navigate` 検証は `renderApp` の router を使い `path()` を見るか、`@tanstack/react-router` の `useNavigate` を spy する。**`SelfTodayCTA` を render するのに必要な追加 prop 契約は無い** (純粋に query 駆動)。
  - `today` query の data shape (Reviewer mock 契約): `{ date: string, occurrences: TodayOccurrence[] }`。空状態は `occurrences: []`。403 は `ApiError { status: 403, code: "SETUP_REQUIRED" }`。
  - SelfTimetableView 全体の render は本修正のテスト対象外 (timetable 無し UX は既存・既に `SelfTimetableView.test.tsx` が prop 契約欠如で `TimetableView` 単体に切っている。本修正で触らない)。
- **既知ベースライン (判定除外)**: api 16件、web routes 27件。Reviewer はこのベースラインを GREEN 判定から除外。

---

## スコープ境界

- **触る**: `apps/api/src/lib/setupStatus.ts` (新設)、`apps/api/src/middleware/setupGuard.ts` (`hasUserTimetable` 除去・ヘルパー参照)、`apps/api/src/routes/me.ts` (`isComplete` をヘルパー参照に統一)。
- **触らない (重要)**:
  - `apps/web/src/components/home/SelfTodayCTA.tsx` — フォールバックは**現状維持**(残す判断、§3)。コード変更なし。
  - `SelfTimetableView` / Home / 空グリッド導線 — 既存で成立、**追加実装しない**(§2)。
  - `Setup.tsx` の遷移先・学校/学科/学期ステップのロジック — **不変**(§4)。
  - 出席率計算・occurrence・学期編集・bulk・出欠ルール scope (6/11 マージ済の無関係領域)、totalSessions (削除済)。
  - `attendance.service.ts` / `timetableSuspension.service.ts` の個別 `SETUP_REQUIRED` — 二重ガードとして**そのまま残す**。

---

## 不採用案

- **案B: Setup に「UserTimetable 作成ステップ (step4)」を追加し、完了時に timetable も作る**
  却下理由:
  - Setup の大改造になる (テンプレ選択 or 空グリッド作成 UI を Setup 内に複製)。
  - 時間割作成 UI が Home (`SelfTimetableView`) と Setup の 2 箇所に分裂し、**二重メンテ**になる (MeetingEditModal / テンプレ適用 / daySlots 設定を両方で保守)。
  - 導線が重複する: Setup で作っても Home で結局編集する。「学期を作ったら Home で時間割を作る」という既存の正規フローと矛盾。
  - 完了判定の食い違いという**根本原因 (2 基準の不一致) を直さず**、timetable を必ず作ることで症状だけ隠す。案A は根本 (単一真実化) を直す。

- **案C: router 側の `isComplete` に `hasUserTimetable` を足して setupGuard に合わせる (timetable 必須側に統一)**
  却下理由:
  - 「学期を作ったら時間割は Home で作る」という設計意図と逆 (timetable を Setup 完了の前提にすると案B と同じ問題に帰着)。
  - timetable が無いと Home にすら入れず、timetable 作成導線 (Home 内) に永遠に到達できない = デッドロックを別の形で再生産する。
  - 統一の方向は「ゆるい側 (timetable 不問)」が正しい。Home に入れてから時間割を作らせる。
