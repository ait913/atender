# 日付 input のモバイルはみ出し修正 + 「あと何日休める」の追加

## 目的 (1-3行)

(1) モバイル (iOS Safari 17 系) で `<input type="date">` が intrinsic 幅でコンテナをはみ出す WebKit Bug を、`styles.css` のグローバル 1 ルールで全 date input 一括修正する。
(2) 既存の「あとN限休める」(コマ単位) に加え、科目別に「あとN日休める」(`floor(allowedAbsences / maxDayPeriods)`、複数曜日で時限数が違う場合は保守的に**多い日基準**で割る) を併記する。

---

## スコープと前提

- 前提: `20260611-occurrence-based-denominator.md` が main マージ済。`totalSessions` は Course/TemplateCourse から**既に物理削除済**で、`denominator = max(0, course.occurrences.length − denominatorReduction)` (`attendanceStats.ts:145`)、`allowedAbsences = denominator === 0 ? null : floor((1−r)×denominator − consumedAbsence + 1e-9)` (`:150,173`)。本設計はこの `allowedAbsences` (コマ単位) を**一切変えない**。日数はそこから派生する純粋な後段計算として足す。
- `Meeting` モデルは `{ courseId, dayOfWeek:Int, startPeriodIndex:Int, periodCount:Int (@default 1) }` (`schema.prisma` 確認済)。Course → Meeting は 1:N。
- stats / overview サービスは現状 `courses.include` に `occurrences` + `suspensions` のみ含め、**`meetings` を include していない** (`attendanceStats.ts:54-64`)。本設計で `meetings: true` を追加する。
- 修正1と修正2は独立。1ブランチで両方やるが、テスト・実装は別物として扱う。

---

## 修正1: 日付 input のモバイルはみ出し (共通 CSS fix)

### 原因 (Researcher 確定)

共通 `Input` (`apps/web/src/components/ui/Input.tsx`) は `controlClass` に `w-full px-5 py-3` を持つが `min-width`/`max-width` を持たない。iOS Safari 17 系は `<input type="date">` を `inline-flex` 扱いし `width:100%` を無視、intrinsic 幅 (内部の `::-webkit-datetime-edit` の幅) でコンテナをはみ出す (WebKit Bug 136041、iOS18+ は修正済)。`type="date"` を使う全箇所 (CourseSuspensionSection / PersonalEventEditModal / SemesterListSheet×4 / Setup) が同一 `Input` 経由なので、グローバル CSS 1 ルールで全部直る。

### 確定方針: `styles.css` にグローバルルール 1 ブロックを追加

`apps/web/src/styles.css` の既存 date 系ルール (`:root[data-theme="dark"] input[type="date"]::-webkit-calendar-picker-indicator` = line 280) の**直前**に、以下を 1 ブロック追加する。個別 className は追加しない (`Input.tsx` も `CourseSuspensionSection.tsx` も触らない)。

```css
/* iOS Safari 17 系の date input intrinsic 幅はみ出し対策 (WebKit Bug 136041) */
input[type="date"],
input[type="time"] {
  display: block;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
input[type="date"]::-webkit-date-and-time-value,
input[type="time"]::-webkit-date-and-time-value {
  text-align: left;
}
```

設計上の確定事項:
- **対象は `type="date"` と `type="time"` の両方**。同 PJ では time input も同一 `Input` 経由 (MeetingEditModal 等) で、同じ WebKit の inline-flex 扱いに該当するため一緒に直す。Researcher 指定の「date のみ」より広いが、time も同根の不具合を持つので予防的に含める (リスクは無い: `max-width:100%` はコンテナ内に収めるだけで、収まっている input には影響しない)。
- `display:block` は `inline-flex` を上書きし、`w-full` (= `width:100%`) を効かせる。
- `box-sizing:border-box` は `controlClass` の `px-5` (左右 padding) が `width:100%` に加算されてはみ出すのを防ぐ。Tailwind preflight が全要素に `box-sizing:border-box` を当てている場合は冗長になるが、明示しても害はない (二重指定は同値)。
- `::-webkit-date-and-time-value` の `text-align:left` は、`display:block` 化で value テキストが中央寄せになる WebKit 既知の副作用を打ち消す (左寄せ維持で見た目を変えない)。
- **ダークテーマを壊さない**: 追加ブロックは色・背景・filter を一切触らない。既存の `:root[data-theme="dark"] ... ::-webkit-calendar-picker-indicator { filter: invert(1) }` (line 280-284) はそのまま残り、本ルールと競合しない (セレクタが別: 一方は input 本体の box、一方は picker indicator の filter)。`box-sizing`/`display`/`max-width` は色に無関係。
- **既存の収まっている表示を壊さない**: PC (Chrome/Firefox) では date input は元から `width:100%` が効くので `display:block` 化しても見た目不変。`min-width:0` は flex/grid 子要素のはみ出しを許容するだけで、通常フローでは無影響。

### 修正1の挙動仕様 (Reviewer 根拠)

- M1. モバイル幅 (iOS Safari 17 想定) でも、`<input type="date">` は親コンテナの幅を超えない (`max-width:100%` でクリップされ、水平スクロールを発生させない)。
- M2. `<input type="date">` は `display:block` で、`controlClass` の `w-full` が効く (幅 100%)。
- M3. PC 幅では date input の表示 (幅・色・picker アイコン) が修正前後で変わらない。
- M4. ダークテーマでも picker indicator の `filter: invert(1)` が維持される。

### 修正1のテスト方針 (★Reviewer 向けに明記)

**この CSS fix は自動テストでは検証しない (テストを書かない)**。理由:
- jsdom は `::-webkit-*` 疑似要素も `display:inline-flex` の WebKit 固有挙動も評価しない。`getComputedStyle` で `max-width` を取っても、jsdom はスタイルシートの cascade を完全実装しないため `100%` が返る保証がなく、実機の WebKit Bug を再現できない。`color-mix`/`calc` を生文字列でしか扱えないのと同根 (既知ベースライン: `Muraki/knowledge/gotcha/jsdom-no-localstorage-in-vitest.md`)。
- グローバル CSS の 1 ルール追加であり、コンポーネントの prop / 描画ロジックには一切触らない。RTL の render では `Input` の className 文字列が変わらない以上、検証できる差分が無い。

→ Reviewer は修正1について **テストを書かず、判定対象から除外する**。実機確認 (iOS Safari でのはみ出し解消) は実装後に Leader が Chrome DevTools MCP のモバイルエミュレーション or 実機目視で行う。Reviewer は report に「修正1は CSS のため自動テスト対象外、目視確認は Leader」と 1 行記載するだけでよい。

---

## 修正2: 「あと何日休める」を追加

### データモデル / 計算定義

**`maxDayPeriods`** = その科目の各 `dayOfWeek` ごとの `periodCount` 合計の**最大値**。

```
perDay[dayOfWeek] = Σ (その曜日に属する Meeting の periodCount)
maxDayPeriods     = max( perDay の各値 )   // Meeting が無ければ 0
```

例 (1 科目):
- 水曜2限のみ → `perDay = {3: 2}` → `maxDayPeriods = 2`
- 水4限 + 金4限 → `perDay = {3: 4, 5: 4}` → `maxDayPeriods = 4`
- 水2限 + 金4限 → `perDay = {3: 2, 5: 4}` → `maxDayPeriods = 4` (多い日基準)
- 水曜に periodCount=2 の Meeting が 2 つ (分割登録) → `perDay = {3: 4}` → `maxDayPeriods = 4` (同曜日は合算)

**`allowedAbsenceDays`** (新 DTO フィールド、`Int | null`):

```
if (allowedAbsences == null) allowedAbsenceDays = null          // 母数 0 等で限自体が null
else if (maxDayPeriods === 0) allowedAbsenceDays = null         // Meeting 無し → ゼロ除算回避
else if (allowedAbsences < 0) allowedAbsenceDays = null         // 下回る見込み。日数は出さない (表示は限側の負値文言に従属)
else allowedAbsenceDays = Math.floor(allowedAbsences / maxDayPeriods)
```

- `allowedAbsences === 0` → `0 / maxDayPeriods = 0` → `allowedAbsenceDays = 0` (「あと0日」)。
- 「保守的 = 多い日で割る」= 異時限なら最低保証日数。水2金4であと8限なら、最悪 4限の日を 2 日休むと 8 限消費 → あと2日。`floor(8/4)=2`。2限の日なら 4 日休めるが、保守側 (どの曜日を休んでも保証される最低日数) を採る。

### maxDayPeriods を DTO に持たせるか → **持たせる (`Int`、非 null)**

理由: 表示で「1日◯限」を出すかは現状の文言では使わないが、`maxDayPeriods` を DTO に載せておくと (a) Reviewer が `allowedAbsenceDays` の導出を `allowedAbsences` と `maxDayPeriods` から独立検算でき、(b) 将来「水4金4の科目です」等の表示拡張が server 改修なしで可能になる。コストは Int 1 個。Meeting 無しは `0`。
→ **DTO に `maxDayPeriods: Int` (非 null、Meeting 無しは 0) と `allowedAbsenceDays: Int | null` の 2 つを追加**。

### overall (全体) の「あと何日」→ **出さない**

科目ごとに 1 日の時限数 (`maxDayPeriods`) が違うため、全体で「あと何日」を出すと「どの科目を休む日か」で意味が変わり、合算する基準が無い。`AttendanceRateHero` の overall は**「あとN限休める」のまま、日数は併記しない**。
→ `SemesterOverviewDto.overall` に `allowedAbsenceDays` / `maxDayPeriods` は**追加しない**。`semesterOverview.service.ts` の overall 構築ロジックは**触らない** (courses 配列の各要素には新フィールドが入るが、overall サマリには入れない)。

---

## API / 関数シグネチャ

### `computeCourseStatsWithProjection` (apps/api/src/services/attendanceStats.ts)

シグネチャ不変。変更点は 2 つ:

**(1) include に meetings を追加** (`:56-63`):

```ts
courses: {
  include: {
    occurrences: { include: { attendanceRecord: true } },
    suspensions: true,
    meetings: true,          // ★追加 (periodCount / dayOfWeek を読むため)
  },
},
```

**(2) course.map 内で maxDayPeriods を集計し、allowedAbsenceDays を算出** (`:157-174` の return オブジェクトに 2 フィールド追加):

```ts
// course.map のループ冒頭付近 (occurrence ループの外、course 単位で 1 回)
const perDay = new Map<number, number>();
for (const m of course.meetings) {
  perDay.set(m.dayOfWeek, (perDay.get(m.dayOfWeek) ?? 0) + m.periodCount);
}
const maxDayPeriods = perDay.size === 0 ? 0 : Math.max(...perDay.values());

// allowedAbsences は既存の算出値 (denominator === 0 ? null : floor(...))
const allowedAbsenceDays =
  allowedAbsences == null ? null
  : maxDayPeriods === 0 ? null
  : allowedAbsences < 0 ? null
  : Math.floor(allowedAbsences / maxDayPeriods);
```

return オブジェクト (`:157-174`) に追加:

```ts
return {
  // ... 既存フィールド全て不変 ...
  allowedAbsences: denominator === 0 ? null : Math.floor(allowanceRaw + 1e-9),
  maxDayPeriods,                 // ★追加 (Int、Meeting 無しは 0)
  allowedAbsenceDays,            // ★追加 (Int | null)
};
```

> Developer 注意: `allowedAbsences` は return 内でインライン (`denominator === 0 ? null : ...`) で計算されている。`allowedAbsenceDays` の分岐で `allowedAbsences` を参照するため、return より**前**に `const allowedAbsences = denominator === 0 ? null : Math.floor(allowanceRaw + 1e-9);` として一度束縛し、return では `allowedAbsences,` と `allowedAbsenceDays,` の両方をそのプロパティで返すこと。値は不変、束縛位置だけ変わる。

`overallAllowance` / `overallProjection` の戻り値は不変 (日数は overall に出さない)。

### `getSemesterOverview` (apps/api/src/services/semesterOverview.service.ts)

**触らない**。`overall.*` に日数は出さない (上記判断)。`courses` 配列は `computeCourseStatsWithProjection` の戻りをそのまま入れるので、各 course に `maxDayPeriods` / `allowedAbsenceDays` が自動的に含まれる (overview の courses 経由でも科目別日数が web に届く)。

> `buildDaySummaries` の `include` には meetings 追加不要 (日数計算は computeCourseStats 側だけで完結。day summary は occurrence ベースのまま)。

---

## shared schema 変更 (`packages/shared/src/schemas/stats.ts`)

`CourseStatsDto` に 2 フィールド追加 (他は不変):

```ts
export const CourseStatsDto = z.object({
  // ... 既存フィールド全て不変 ...
  remainingCount: z.number().int(),
  allowedAbsences: z.number().int().nullable(),
  maxDayPeriods: z.number().int(),            // ★追加 (Meeting 無しは 0)
  allowedAbsenceDays: z.number().int().nullable(), // ★追加
});
```

`semester.ts` の `SemesterOverviewDto.overall` は**変更しない**。`SemesterOverviewDto.courses` は `CourseStatsDto` 配列なので新フィールドが自動的に伝播する (semester.ts のコード変更は不要、`CourseStatsDto` を import している既存の形のまま)。

---

## UI / Web 変更

### CourseListItem.tsx — 「あとN限 (M日) 休める」併記

現状 (`:51-57`) は `shortActionText(stats.allowedAbsences, stats.remainingCount)` で「あと{n}限休める」を出している。これを日数併記に拡張する。

レイアウト (ASCII、行は変えず同一行に括弧併記):

```
出12 欠1 ・ あと8限 (2日) 休める
                  ^^^^^ allowedAbsences=8, allowedAbsenceDays=2

allowedAbsenceDays が null (Meeting 無し等) のとき → 限のみ:
出12 欠1 ・ あと8限 休める

下回る見込み / 残り全休OK / — のとき → 従来文言のまま (日数併記しない):
出0 欠20 ・ 下回る見込み
```

`shortActionText` を以下に置換 (`allowedAbsenceDays` 引数追加):

```ts
function shortActionText(
  allowedAbsences: number | null,
  remainingCount: number,
  allowedAbsenceDays: number | null,
) {
  if (allowedAbsences == null) return "—";
  if (allowedAbsences < 0) return "下回る見込み";
  if (allowedAbsences >= remainingCount) return "残り全休OK";
  if (allowedAbsenceDays == null) return `あと${allowedAbsences}限休める`;
  return `あと${allowedAbsences}限 (${allowedAbsenceDays}日) 休める`;
}
```

呼び出し (`:55`) を `shortActionText(stats.allowedAbsences, stats.remainingCount, stats.allowedAbsenceDays)` に変更。`actionColor` は不変。

> 「残り全休OK」「下回る見込み」のとき日数を出さないのは、これらは枠の境界状態 (満杯/不足) で「あとM日」という残量表現がそもそも噛み合わないため。ユーザー要望「限の他に日も」は通常の「あとN限休める」ケースの併記を指す。

### AttendanceRateHero.tsx — **変更しない**

overall に日数を出さない判断のため、`AttendanceRateHero` は現状のまま。`overall` に `allowedAbsenceDays` は来ない。props 契約も不変。

### render テスト対象の props 契約 (★Reviewer 根拠、gotcha 準拠)

> `Muraki/knowledge/gotcha/design-must-specify-component-prop-contract-for-render-tests.md` 準拠。Reviewer は src を見ずにこの契約でテストを書く。

| コンポーネント | props 契約 |
|---|---|
| **CourseListItem** | props 不変 `{ stats: CourseStatsDto, requiredRate: number, onClick: () => void }`。**`stats` (CourseStatsDto) に `maxDayPeriods: number` と `allowedAbsenceDays: number \| null` が追加される**。テスト fixture の `stats` にこの 2 フィールドを必ず含める。表示文言の検証根拠は上記 `shortActionText` のとおり。`CourseStatsDto` の他フィールド (`courseName`, `counts.{present,absent,unrecorded,...}`, `toDate.attendanceRate`, `allowedAbsences`, `remainingCount` 等) は occurrence-based-denominator 設計の契約のまま。 |
| **AttendanceRateHero** | props 不変 `{ overall: SemesterOverviewDto["overall"], requiredRate, onJumpToCalendar? }`。**変更なし** (overall に日数フィールドは追加しない)。fixture も従来どおり。 |

CourseListItem の最小 fixture 例 (Reviewer が組む値、`now`/occurrence 非依存・直接 stats を渡す):

```ts
const baseStats: CourseStatsDto = {
  courseId: "c1", courseName: "OS", teacher: null,
  generatedOccurrences: 30,
  counts: { present:12, absent:1, excused:0, tardy:0, earlyLeave:0, cancelled:0, suspended:0, unrecorded:0 },
  effectiveNumerator: 12, effectiveDenominator: 13, attendanceRate: 12/13,
  toDate: { effectiveNumerator: 12, effectiveDenominator: 13, attendanceRate: 12/13 },
  remainingCount: 17,
  allowedAbsences: 8,
  maxDayPeriods: 4,
  allowedAbsenceDays: 2,
};
```

---

## 挙動仕様 (Reviewer テスト根拠)

「今日」は `computeCourseStats` の `now` 引数で固定。`requiredAttendanceRate` は明示で渡す。Meeting は `prisma.meeting.create` (helper の `createUserTimetable` が既に dayOfWeek=3/periodCount=2 の meeting を 1 つ作る、`auth.ts:127-136`)、occurrence は `createOccurrence` で作る。**`allowedAbsences` の値は occurrence 構成で決まり、本設計では変えない**。`maxDayPeriods` は Meeting 構成で決まる。

### (a) maxDayPeriods 集計 (API ユニット — computeCourseStats)

1. **単一曜日・週1回2限 (★ユーザー例)**: Meeting 1 つ (dayOfWeek=3, periodCount=2) → `perDay={3:2}` → `maxDayPeriods=2`。occurrence を組んで `allowedAbsences=4` になる構成にすると `allowedAbsenceDays = floor(4/2) = 2` (「あと4限→2日」)。
2. **複数曜日・同時限 (水4限+金4限)**: Meeting 2 つ (dayOfWeek=3 periodCount=4 / dayOfWeek=5 periodCount=4) → `perDay={3:4,5:4}` → `maxDayPeriods=4`。`allowedAbsences=8` の構成 → `allowedAbsenceDays = floor(8/4) = 2` (「あと8限→2日」)。
3. **★複数曜日・異時限 (水2限+金4限)**: Meeting 2 つ (dayOfWeek=3 periodCount=2 / dayOfWeek=5 periodCount=4) → `perDay={3:2,5:4}` → `maxDayPeriods=4` (多い日)。`allowedAbsences=8` → `allowedAbsenceDays = floor(8/4) = 2` (保守的に 2日。2限の日なら 4 日休めるが最低保証 2日)。
4. **同曜日に Meeting 複数 (分割)**: dayOfWeek=3 の Meeting が periodCount=2 と periodCount=1 の 2 つ → `perDay={3:3}` → `maxDayPeriods=3` (同曜日は合算)。

### (b) allowedAbsenceDays のエッジ (API ユニット)

5. **`allowedAbsences = 0`**: 上記 maxDayPeriods=4 の科目で枠ちょうど 0 になる occurrence 構成 → `allowedAbsenceDays = floor(0/4) = 0` (「あと0日」)。
6. **`allowedAbsences < 0` (下回る見込み)**: 欠席過多で `allowedAbsences = -3` 等 → `allowedAbsenceDays = null` (日数非表示)。
7. **`allowedAbsences = null` (母数 0、occurrence 0 件 or 全休講)**: → `allowedAbsenceDays = null`、かつ `maxDayPeriods` は Meeting があれば >0 のまま (occurrence 0 でも Meeting は残るので例えば 2)。日数は限が null なので null。
8. **`maxDayPeriods = 0` (Meeting 無し科目)**: course に Meeting を作らず occurrence も無い → `maxDayPeriods = 0`、`allowedAbsences = null` (母数0) → `allowedAbsenceDays = null`。Meeting 無しでゼロ除算しない。
9. **`maxDayPeriods = 0` だが allowedAbsences > 0 は起きないことの確認**: Meeting が無ければ occurrence も生成されない (occurrence は Meeting 経由生成) → denominator 0 → allowedAbsences null。よって「maxDayPeriods=0 かつ allowedAbsences>0」は構造的に発生しない (テストでは #8 で maxDayPeriods=0 → days=null を確認すれば足り、敢えて作る必要なし)。

### (c) overall に日数を出さない (API — overview)

10. `GET /api/semesters/:id/overview` の `overall` に `allowedAbsenceDays` / `maxDayPeriods` フィールドが**含まれない** (SemesterOverviewDto.overall のスキーマに無い)。`overall.allowedAbsences` (限) は従来どおり存在。
11. `overview.courses[]` の各要素には `maxDayPeriods` / `allowedAbsenceDays` が**含まれる** (科目別は日数を持つ。stats と同じ DTO のため)。
12. **回帰**: `overall.allowedAbsences` / `attendanceRate` / `toDate` / `remainingCount` / `unrecordedCount` は本変更前後で不変 (overview 構築ロジック未変更)。

### (d) DTO / レスポンス (API)

13. `GET /api/stats` の各 course レスポンスに `maxDayPeriods` (number) と `allowedAbsenceDays` (number | null) が含まれる。
14. **回帰**: occurrence-based-denominator のテスト群 (`stats.test.ts` の denominator/allowedAbsences/attendanceRate) が、新フィールド追加後も同じ値で通る (allowedAbsences の式は不変)。

### (e) CourseListItem (RTL Web)

15. `stats.allowedAbsences=8, allowedAbsenceDays=2, remainingCount=17` → 「あと8限 (2日) 休める」が描画される。
16. `stats.allowedAbsences=8, allowedAbsenceDays=null` (Meeting 無し相当)、`remainingCount=17` → 「あと8限休める」(日数括弧なし) が描画される。
17. `stats.allowedAbsences=0, allowedAbsenceDays=0`、`remainingCount=17` → 「あと0限 (0日) 休める」が描画される。
18. `stats.allowedAbsences=-3, allowedAbsenceDays=null` → 「下回る見込み」(日数なし、従来文言)。
19. `stats.allowedAbsences >= remainingCount` (例 allowedAbsences=20, remainingCount=17, allowedAbsenceDays=5) → 「残り全休OK」(日数併記しない、境界状態)。
20. `stats.allowedAbsences=null, allowedAbsenceDays=null` → 「—」(従来)。
21. **回帰**: 出席率・counts (出N欠M)・プログレスバー・未記録バッジの描画が従来どおり (allowedAbsenceDays 追加で他表示は変わらない)。

---

## テスト基盤

- **API**: Vitest + 実 SQLite。配置 `apps/api/tests/`。ヘルパ `tests/helpers/auth.ts` (`setupCompleteUser` / `createOccurrence` / `prisma.meeting.create`)。`computeCourseStats` は `now` 固定。
  - `tests/stats.test.ts` (追加) — (a) 1-4、(b) 5-9、(d) 13-14。Meeting を追加生成して maxDayPeriods を変える (helper は dayOfWeek=3/periodCount=2 の Meeting を 1 つ作るので、複数曜日テストは `prisma.meeting.create` を追加で呼ぶ)。allowedAbsences の目標値は occurrence 構成で作る (occurrence-based-denominator の既存パターンを流用)。
  - `tests/semesters.test.ts` or overview 系 (追加) — (c) 10-12。overall に日数フィールドが無いこと、courses[] には有ることを確認。
  - 既存 `occurrence-denominator.review.test.ts` / `stats-unrecorded.review.test.ts` は allowedAbsences 不変なので回帰 (新フィールドが増えるだけ、既存アサートはそのまま通る)。
- **Web**: Vitest 2 + jsdom + RTL。配置 `apps/web/tests/components/`。
  - `tests/components/CourseListItem.test.tsx` / `CourseListItem.review.test.tsx` (追加) — (e) 15-21。fixture の `stats` に `maxDayPeriods` / `allowedAbsenceDays` を追加 (既存 fixture は新フィールド欠落で型エラーになるので必ず追加する)。
  - `tests/components/AttendanceRateHero.test.tsx` — **変更不要** (overall 不変)。
  - msw handlers (`tests/msw/handlers.ts`) の stats / overview stub に `maxDayPeriods` / `allowedAbsenceDays` を course レスポンスへ追加 (Stats route テスト等が DTO 検証する場合)。
- jsdom の罠 (既知ベースライン、判定除外): `localStorage` 不在、`color-mix`/`calc` 非評価。
- **既知ベースライン失敗は判定除外**: api 16 件 (auth/friendship/room 系)、web routes 系 27 件。Reviewer はこれらを GREEN 判定対象外とする。
- **修正1 (CSS) は自動テスト対象外** (上記「修正1のテスト方針」)。Reviewer は修正2のみテストし、修正1は report に目視確認である旨を記載。
- E2E (chrome-devtools MCP) は本設計のテスト範囲外。修正1の実機はみ出し確認と修正2の数値目視は実装後に Leader が行う。

---

## 不採用案

### 修正2: 異時限のときの maxDayPeriods 以外の集計方法

- **平均で割る (`allowedAbsences / avgDayPeriods`)**: 水2金4 (平均3) であと8限 → `floor(8/3)=2`。たまたま 2 になるが、平均は「どの曜日を休むか」で実際に消費される限数とズレ、保証にならない (4限の日を 2 日休むと 8 限で枠切れだが、平均基準だと「あと2日」と出て 3 日目に超過する可能性を示唆できない)。Touri は保守的を選択。
- **min で割る (`allowedAbsences / minDayPeriods`)**: 少ない日基準。水2金4であと8限 → `floor(8/2)=4` で**楽観的すぎる** (4限の日を休むと 2 日で枠切れ)。「あと4日休める」と出て実際に超過する。保証日数として誤り。
- **曜日別に「水あとX日・金あとY日」と分けて出す**: 正確だが UI が複雑化し、ユーザー要望「限の他に日も (1 つの数字)」と乖離。1 科目 1 つの保守的日数に集約する。
- **幅で出す (「あと1〜4日」)**: 情報量は最大だが「結局何日休めるの」が一目で分からず、カウントダウン UX (あとN日) の単純さを損なう。保守的な単一値に倒す。

→ **保守的 = max(多い日)で割る**を採用。「どの曜日の授業を休んでも保証される最低日数」を意味し、ユーザーが「あと2日休める」を信じて休んでも下回らない (安全側)。Touri の明示選択。

### overall に日数を出す案

- **overall の maxDayPeriods を全科目の最大で割る**: 「全体であとN限 → 最も時限数の多い科目基準でM日」は、休む日と科目の対応が無く意味が崩壊する (1 日に複数科目があり、休む = その日の全科目を欠席)。overall は限のまま。
- **overall を「1日あたり全科目の合計限数」で割る (1 日まるごと休む基準)**: 「全休した日」概念は時間割全体の suspension に近く、本設計の科目別欠席枠 (allowedAbsences) とモデルが違う。混同を生むため出さない。

### maxDayPeriods を DTO に持たせない案

- days だけ返せば表示には足りるが、Reviewer の独立検算 (allowedAbsences と maxDayPeriods から days を再計算して照合) ができず、将来「1日◯限」表示の拡張に server 改修が要る。Int 1 個のコストで持たせる方が安い。

### 修正1: 個別 className 追加 (`Input.tsx` or CourseSuspensionSection に `max-w-full` 等)

- date input は 4 ファイルで使われ、個別対応は漏れる。`Input` 共通コンポーネントに足すと date/time 以外 (text/number) にも `display:block` が当たり、それらは元から block 相当だが意図しない副作用リスクが出る。`styles.css` のグローバルセレクタ `input[type="date"]` でピンポイントに当てるのが最小・確実。

### 修正1: JS で iOS バージョン判定して条件付き適用

- UA 判定は脆く、CSS で全環境に当てて無害 (収まっている input には影響しない) なので不要。静的 CSS 1 ルールで足りる。
