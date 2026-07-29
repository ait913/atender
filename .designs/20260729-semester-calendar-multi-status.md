# 学期カレンダー — 1 日 N ステータスの可視化 / 公欠の識別 / 未来日の記録表示

> 対象: `apps/api` + `packages/shared` + `apps/web` + `apps/ios` の 4 つ。
> 正典参照: `DESIGN.md` (iOS 視覚言語) / `CLAUDE.md` (機能の正典は Web、iOS は IA/機能を共有し見た目はネイティブ)。

## 目的

学期カレンダー (学期・科目タブの月グリッド) の日セルが、サーバ側 `classifyDay()` で 1 日 N 件の出欠を 1 値に潰しているため、(a) 同じ日の複数ステータスが見えない (b) 公欠が「出席」と同一に落ちる (c) 未来日は記録済みでも全部消される。**日単位の内訳をサーバが返し、セルが内訳をそのまま描く**ことで 3 つとも解消する。

Touri の要望 (2026-07-28 実機 FB、逐語):
1. 「出席と欠席とか、公欠とか、同じ日に複数ステータスがある日もカレンダーでしっかり複数わかるようにして欲しい。現状は一次元でも欠席するとその日自体がバツ表示になる。」
2. 「公欠の日を見分けられない。チェックで緑じゃない色にするとか見分けられるようにして欲しい」
3. 「未来の公欠とかが全く表示されない。」

---

## 0. スコープ境界と前提

### 0.1 やること / やらないこと

| | 内容 |
|---|---|
| **やる** | `AttendanceDaySummary` に**日単位の内訳 (`counts`)** を additive 追加 / 学期カレンダー日セルの複数ステータス描画 / 公欠の色とグリフ / 未来日の記録済みステータス表示 / 凡例更新 / **ホーム個人カレンダーの日ステータスドット**の同規則化 (Web + iOS) |
| **やらない** | 出席率・`allowedAbsences`・`toDate` 等の**統計計算は一切変更しない** (`attendanceStats.ts:120,142` の `occurrenceDate <= todayIso` は不変。表示の話であって計算の話ではない) / `classifyDay()` の分類ロジック変更 / Prisma schema 変更 / 日別詳細シートへの「まとめ」追加 / 学期カレンダーの外殻・セル形状 (丸セル) の変更 / ルーム詳細カレンダー (日ステータスを持たない、`daySummaries: [:]`) |

### 0.2 Prisma schema 変更は**不要**

新しい内訳はすべて既存の `MeetingOccurrence` / `AttendanceRecord` / `CourseSuspension` / `TimetableSuspension` から**読み方を変えるだけ**で導出できる。migration を書かない。

### 0.3 `MIN_IOS_BUILD` は**上げない**

本設計は wire でも enum 値でも additive (§3.1 の判断)。配布済み build 11 のクライアントは `counts` を無視して**今日と完全に同じ描画**を続けるだけで、壊れない。よって `apps/api/src/lib/clientVersion.ts` の `MIN_IOS_BUILD` は **1 のまま**。
別レーン (個人カレンダー刷新) が独自の理由で 12 に上げるのは本設計と独立であり、本設計はそれに依存も阻害もしない。

出荷時は `apps/ios/project.yml` の `CFBundleVersion` を `"11"` → `"12"` にインクリメントする (通常手順)。

---

## 1. 現状 (file:line は 2026-07-29 時点の `main` = `66b893a` で確認済)

| # | 事実 | 場所 |
|---|---|---|
| F1 | 畳み込みはサーバ側。`classifyDay()` が N 件 → 1 値。優先順位 = 全休講 > 欠席 > 遅刻/早退 > 未記録 > その他 | `apps/api/src/services/semesterOverview.service.ts:122-129` |
| F2 | `EXCUSED` はどの分岐にも無く、最後の `return "ALL_PRESENT"` に落ちる。**公欠だけの日 = 出席だけの日** | 同上 `:128` |
| F3 | DTO は `status` 1 値 + `occurrenceCount` のみ。日単位 enum に公欠の枝が無い | `packages/shared/src/schemas/semester.ts:26-37` |
| F4 | occurrence 単位は 6 値 `PRESENT/ABSENT/EXCUSED/TARDY/EARLY_LEAVE/CANCELLED`。iOS ミラーは `Enums.swift:20-42` | `packages/shared/src/enums.ts` |
| F5 | 未来日の抑制は**クライアント側 1 行**。iOS `isFuture && status != .allSuspended` で visual 全消し。Web も逐語同一 | `apps/ios/.../SemesterLogic.swift:21-24` / `apps/web/src/lib/dayStatusVisual.ts:16-18` |
| F6 | iOS 描画決定関数 `AttendanceDayVisual.of(status:isFuture:)` は入力が 1 status のみ。実描画は `dayCell` (`SemesterOverviewComponents.swift:136-204`)、アイコンは 1 マス 1 個 (`:158`)。右上バッジ枠は選択チェック / 予定ドットが占有 (`:163-176`) | 同上 |
| F7 | `Color.statusExcused` (light `#4C82F5` / dark `#6BA3FF`) は定義済みだが日カレンダーで未使用。Web の `--color-status-excused` と**値が 1:1 一致**することを実測確認済 (`styles.css:42,183`) | `Color+Atender.swift:48` / `apps/web/src/styles.css:42,183` |
| F8 | 凡例は 4 項目 + 補足。公欠なし | `SemesterOverviewComponents.swift:246-259` / `AttendanceCalendar.tsx:167-178` |
| F9 | 未来日への公欠登録は**既にできる** (日別詳細のチップ / 一括編集 / API に未来日拒否なし)。**登録できるが見えないだけ** | `DayDetailSheet.swift:305-307` |
| F10 | ホーム個人カレンダーは同じ `AttendanceDayStatus` を 6pt ドット 1 個で消費 | iOS `PersonalCalendar.swift:354-356` / web `CalendarMonth.tsx:48-49,78-80` |
| F11 | `AttendanceDaySummary.occurrenceCount` は Web/iOS の**どこからも読まれていない** (同名の別物が `DayDetailDto` 側にある) | grep 済 |
| F12 | 学期カレンダーの丸セル + 薄枠 + grid spacing 3 は build 11 で意図的に確定した見た目 (`c0b8ad2` / `f2bad99` / `f916451`) | git log |

---

## 2. UI/UX

### 2.1 中心となる決定 — 「代表 1 値」をやめ「内訳をそのまま描く」

日セルは次の 3 レイヤで内訳を表現する。**ステータスが 1 種類の日は今日と完全に同じ見た目になる** (build 11 で Touri が承認した見た目からの退行ゼロ) ことが設計の制約。

```
学期カレンダー 日セル (iOS 44×44pt / Web aspect-square)

  ステータス 1 種 (今日と同一)        ステータス 2 種 (4 コマ中 1 欠席)
  ┌──────────────┐                  ┌──────────────┐
  │ ▓▓▓▓▓▓▓▓▓▓▓▓ │ ← 背景 tint 全面 │ ▒▒▒│▓▓▓▓▓▓▓▓▓ │ ← 件数比の縦セグメント
  │ ▓▓▓  12  ▓▓▓ │                  │ ▒▒▒│▓  12 ▓▓▓ │   (赤 25% / 緑 75%)
  │ ▓▓▓  ✓   ▓▓▓ │ ← グリフ 1 個16pt│ ▒▒▒│ ✗ ✓ ▓▓▓▓ │ ← グリフ 2 個 12pt
  └──────────────┘                  └──────────────┘
       ↑ 円形にクリップ (既存の丸セルを維持)

  ステータス 5 種 (欠1 公1 遅1 休1 出1)     未来日・公欠 1 件 + 未記録 1 件
  ┌──────────────┐                        ┌──────────────┐
  │ ▒│░│▚│▩│▓ │ ← 5 セグメント          │ ░░░░░░░░░░░░ │ ← 公欠のみ (未記録は無視)
  │ ▒│░│ 24 ▩│▓ │                        │ ░░░  21  ░░░ │
  │ ▒│░│✗ 公 ▩│▓│ ← グリフは上位 2 種    │ ░░░  公  ░░░ │
  └──────────────┘                        └──────────────┘
```

- **背景**: その日の occurrence 1 件 = 1 スライス。severity 順に左から並べ、幅は等分 (= 件数比)。同じ種類のスライスは隣接するので、見た目は「件数比の色帯」になる。
- **グリフ**: severity 順の上位 **2 種**。1 種のときだけ 16pt (今日と同一)、2 種以上は 12pt。
- **破線枠**: 未記録が 1 件以上ある過去日 (今日と同一)。

### 2.2 severity (表示順) — 全プラットフォーム共通・不変

```
absent > excused > tardy > suspended > present > unrecorded
```

理由: 「例外・要対応を先に見せ、既定状態 (出席) を後に置く」。`unrecorded` は破線枠でも冗長に伝わるので最後。この順は背景セグメントの左→右順であり、グリフ 2 個の選択順でもある。

- `TARDY` と `EARLY_LEAVE` は **`tardy` 1 マークに合算**する (既存凡例「遅刻・早退」と同じ粒度。日単位で両者を色分けしない)。
- occurrence の `CANCELLED` 記録・科目休講・時間割休講は **`suspended` 1 マークに合算**する (UI 上どちらも「休講」で色もアイコンも同一)。

### 2.3 マークの視覚定義

| kind | ラベル (凡例) | グリフ (iOS) | グリフ (Web) | グリフ色 | 背景 tint 色 | tint 比 (iOS) | tint 比 (Web) |
|---|---|---|---|---|---|---|---|
| `absent` | 欠席 | SF `xmark` | lucide `X` | `statusAbsent` | `statusAbsent` | `Color.surfaceTintRatio` (0.42) | 26% |
| `excused` | 公欠 | `Text("公")` | `<span>公</span>` | `statusExcused` | `statusExcused` | 0.42 | **22%** |
| `tardy` | 遅刻・早退 | SF `clock` | lucide `Clock` | `statusTardy` | `statusTardy` | 0.42 | 24% |
| `suspended` | 休講 | SF `nosign` | lucide `Ban` | `statusSuspended` | `statusSuspended` | 0.42 | 20% |
| `present` | 出席 | SF `checkmark` | lucide `Check` | `statusPresent` | `statusPresent` | 0.42 | 20% |
| `unrecorded` | (凡例は補足行) | SF `minus` | lucide `Minus` | `textTertiary` / `--color-fg-tertiary` | `statusNone` | **0.12** | **12%** |

- **公欠のグリフは SF Symbol / lucide アイコンではなく文字「公」**。理由: (a) `checkmark.shield` 系は 12pt では `checkmark` (出席) と紛らわしく、Touri の要望「公欠を見分けられるように」に逆行する (b) 日別詳細シートのチップが既に `出/欠/公/遅/早/休` の語彙を使っており (`DayDetailSheet.swift:305`)、アプリ内で一貫する (c) **新規シンボル名を 1 つも導入しないので、シンボル実在リスクがゼロ** (既存の `checkmark`/`xmark`/`clock`/`nosign`/`minus` 以外を使わない)。
- **公欠の色は `statusExcused`** (light `#4C82F5` / dark `#6BA3FF`)。Web `--color-status-excused` と値が 1:1 一致することを実測済 (F7)。`statusTardy` (橙) とは色相が離れており混同しない。accent azure (`#1E96E6`) とは近縁だが、accent は「今日リング / 選択リング / 予定ドット」= **セル外周と右上バッジ**にしか出ず、公欠は**背景面とグリフ**なので位置が競合しない。
- tint 比が Web (20〜26%) と iOS (0.42) で違うのは**既存の差**であり本設計で揃えない (`Color.surfaceTintRatio` は「3 面カレンダー共通の 1 箇所ノブ」として意図的に置かれている。`Color+Atender.swift:132`)。
- `unrecorded` のみグリフ色と tint 色が異なる (今日の `PARTIAL_UNRECORDED` の見た目を保存するため)。

### 2.4 凡例 (公欠を追加して 5 項目 + 補足)

- **Web** (`AttendanceCalendar.tsx` の `Legend`): 既存の `flex flex-wrap` を維持し項目を差し替える。
  `✓出席 / ✗欠席 / 公公欠 / 🕐遅刻・早退 / 🚫休講 / (破線枠)未記録 / ●予定` の 7 チップ。
  **ラベル変更**: `欠席あり` → `欠席`、`未記録あり` → `未記録`。全マークが「その日に 1 件以上ある」の意味に統一されたので「あり」は不要。
- **iOS** (`SemesterOverviewComponents.swift` の `legend`): 1 本の `HStack` では 7 項目が入らないので **2 行の `VStack(alignment: .leading, spacing: Space.s1)`** にする。
  - 1 行目: `HStack(spacing: Space.s2)` に `出席 / 欠席 / 公欠 / 遅刻・早退 / 休講` の 5 項目 (`legendItem`)。`.lineLimit(1)` + `.minimumScaleFactor(0.75)`。
  - 2 行目: `Text("− / 破線 = 未記録 ・ ● = 予定")`。
  - 全体 `.font(.caption2).fontWeight(.bold).foregroundStyle(Color.textTertiary)`、`.frame(maxWidth: .infinity, alignment: .leading)`。既存の `.lineLimit(2)` は削除。
  - 幅検算 (iPhone 16 = 393pt、page margin 16×2、card padding `Space.s4` 16×2 → 使用可 329pt): アイコン 14pt + ラベル (2〜5 字 × 約 11pt) + gap 8pt × 4 ≒ 267pt < 329pt で 1 行に収まる。Dynamic Type 拡大時は `minimumScaleFactor` で縮む。

### 2.5 未来日 (Touri 決定を実装に落とす)

**「未来日は `unrecorded` を 0 件とみなす」の 1 規則だけ**で全要件を満たす。

- 未来 + 記録が 1 件もない → マーク 0 個 → 完全に無表示 (今日と同じ。学期の残りが未記録マークで埋まるノイズを起こさない)
- 未来 + 公欠 1 件 + 未記録 1 件 → 公欠マークのみ (Touri 要望 #3)
- 未来 + 全休講 → 休講マーク (今日の挙動を維持)
- 未来日に破線枠は出ない (`dashed = unrecorded > 0 && !isFuture`)
- `isFuture = date > today`。**今日 (`date == today`) は未来ではない** (既存と同じ)

### 2.6 ホーム個人カレンダーへの波及 (`CalendarMonth`)

同じ視覚規則を共有部品に流す (DESIGN.md / 汎用層の「全画面共通の視覚規則は全 caller に波及させる」)。ただし**ドットのみ**とし、グリフ・背景セグメントはホームに持ち込まない (ホームのセルは授業 chip が主役で、日ステータスは補助情報のため)。

- 日番号の右のドットを **1 個 → severity 順に最大 3 個**にする。
- ドットの色 = マークの **tint 色を不透明で** (`present`→`statusPresent`、`excused`→`statusExcused`、`unrecorded`→`statusNone` …)。
- サイズ: iOS 6pt 円 × `HStack(spacing: 2)` / Web `h-1.5 w-1.5 rounded-full` × `gap-0.5`。
- マーク 0 個の日 (= `NO_CLASS` / 当月外) はドットなし (今日と同じ)。
- 幅検算 (iOS full-bleed、セル幅 ≒ 393/7 = 56pt、`padding(.horizontal, 3)` で使用可 50pt): 日番号 24pt + ドット 3 個 (6×3 + 2×2 = 22pt) = 46pt ≤ 50pt。Web (セル幅 ≒ 53px、`p-0.5` で使用可 49px): 20 + gap 4 + 22 = 46px ≤ 49px。
- **`suspended` のドット色が `statusCancelled` → `statusSuspended` に変わる** (学期カレンダーと同色に揃える意図的な変更)。
- ルーム詳細 (`RoomDetailView`) は日ステータスを持たない (空マップを渡す) ため見た目に変化なし。

### 2.7 適用しない DESIGN.md 規定

DESIGN.md §3.6.3 の「月カレンダーは full-bleed / 枠なし / 影なし」は **`CalendarMonth` (personal + room)** に対する規定であり、学期出欠カレンダー (`AttendanceCalendar` = カード + 丸セル) は対象外。丸セル + 薄枠 + grid spacing 3 は build 11 の意図的確定 (F12) なので本設計では変えない。→ DESIGN.md §4 の表記揺れは §11 で Leader に報告する。

### 2.8 状態管理

新しい state を一切増やさない。`SemesterOverviewDto.days[]` が唯一の情報源で、描画は純粋関数 1 本 (`dayVisual`) を通す。iOS の `AttendanceCalendar` が持つ `@State anchor` / `@State eventDates`、Web の `useState(anchor)` はいずれも不変。

---

## 3. データモデル

### 3.1 additive にできるか — 結論: **できる。additive にする**

| 層 | additive か | 根拠 |
|---|---|---|
| wire (JSON) | **YES** | `counts` オブジェクトを 1 つ**足すだけ**。既存フィールド (`date` / `status` / `occurrenceCount`) は名前も値も型も変えない。`status` の enum 値も**増やさない**(`HAS_EXCUSED` 等を追加しない) ので、既存クライアントの enum デコードも無傷 |
| TypeScript (web) | **YES** | 新フィールドは必須だが、`AttendanceDaySummary` を**生成する**のは API 1 箇所のみ。消費側は追加フィールドを読むだけ |
| Swift (iOS) | **YES (ただし Optional で宣言する)** | `AttendanceDaySummary` の memberwise init 呼出しは本番・テスト合わせて **0 箇所** (grep 済) なので `gotcha/non-optional-dto-field-is-not-additive-for-callers.md` の 1 つ目の破壊は起きない。残るリスクは**共有 decode fixture** (`Fixtures/semesterOverview.json`) と**旧 API と新アプリの組合せ**。後者は「API デプロイ前に TestFlight が配られる」「ローカル dev で古い API を起動している」で実際に起こり、非 Optional だと `SemesterOverviewDto` 全体の decode が throw して**学期・科目タブが丸ごとエラー表示**になる。よって Optional にする |

**`classifyDay()` は廃止も変更もしない。** `status` は **legacy 互換フィールド**として残し、新しい表示ロジックは一切これを読まない (読むのは `counts` のみ。例外は §4.3 の nil フォールバック)。この判断により:

- 既存 API テスト (`attendance.test.ts` の `expect(hits).toContain("ALL_PRESENT")`、`semesters.test.ts:151,168`、`timetable-suspensions.test.ts:188`) が**すべて緑のまま**になる。
- `meetingExpansion` の `status === "NO_CLASS"` による展開スキップ (`apps/web/src/lib/meetingExpansion.ts:83` / `TimetableLogic.swift:130`) が無傷。
- F2 の「EXCUSED が ALL_PRESENT に落ちる」穴は**塞がない**。塞ぐと enum 値追加または既存値の意味変更になり additive でなくなるため。`status` は表示に使われなくなるので実害ゼロ。
- 実装時は `classifyDay` の直上にコメントを置く: `// legacy 互換フィールド。表示は counts を使う (.designs/20260729-semester-calendar-multi-status.md §3.1)`。

### 3.2 `packages/shared/src/schemas/semester.ts`

```ts
export const AttendanceDayCounts = z.object({
  present: z.number().int(),
  absent: z.number().int(),
  excused: z.number().int(),
  tardy: z.number().int(),
  earlyLeave: z.number().int(),
  suspended: z.number().int(),
  unrecorded: z.number().int(),
});

export const AttendanceDaySummary = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum([              // ← legacy 互換。値も並びも変更しない
    "ALL_PRESENT",
    "HAS_ABSENT",
    "HAS_TARDY",
    "ALL_SUSPENDED",
    "PARTIAL_UNRECORDED",
    "NO_CLASS",
  ]),
  occurrenceCount: z.number().int(),
  counts: AttendanceDayCounts,   // ← 追加 (必須)
});

export type AttendanceDayCounts = z.infer<typeof AttendanceDayCounts>;
```

`SemesterOverviewDto` の他の部分は不変。

### 3.3 `apps/ios/Atender/Core/Models/DTOs.swift`

```swift
struct AttendanceDayCounts: Codable, Equatable {
    let present: Int
    let absent: Int
    let excused: Int
    let tardy: Int
    let earlyLeave: Int
    let suspended: Int
    let unrecorded: Int
}

struct AttendanceDaySummary: Codable, Equatable, Identifiable {
    var id: String { date }
    let date: String
    let status: AttendanceDayStatus   // legacy 互換 (§3.1)
    let occurrenceCount: Int
    let counts: AttendanceDayCounts?  // ★ Optional。nil = counts を返さない旧 API
}
```

- `CodingKeys` は不要 (API が camelCase を返すため既存 DTO と同様に合成 init で通る)。
- `AttendanceDayStatus` enum (`Enums.swift:44-52`) は**変更しない**。
- `Atender/Core/Models/ModelSync.md` のミラー表に `AttendanceDayCounts` の行を追加する (既存 `AttendanceDaySummary` の行と同じ書式)。

---

## 4. API / 関数シグネチャ

### 4.1 サーバ (`apps/api/src/services/semesterOverview.service.ts`)

既存の `buildDaySummaries` が組み立てる `byDate: Map<string, Array<{ status: DayStatus }>>` をそのまま使い、集計関数を 1 本足す。

```ts
function countDay(items: Array<{ status: DayStatus }>): AttendanceDayCounts {
  const counts: AttendanceDayCounts = {
    present: 0, absent: 0, excused: 0, tardy: 0,
    earlyLeave: 0, suspended: 0, unrecorded: 0,
  };
  for (const item of items) {
    switch (item.status) {
      case "PRESENT": counts.present += 1; break;
      case "ABSENT": counts.absent += 1; break;
      case "EXCUSED": counts.excused += 1; break;
      case "TARDY": counts.tardy += 1; break;
      case "EARLY_LEAVE": counts.earlyLeave += 1; break;
      case "CANCELLED":
      case "SUSPENDED": counts.suspended += 1; break;
      case "UNRECORDED": counts.unrecorded += 1; break;
    }
  }
  return counts;
}
```

`days.push` を次に変える (`:113-117`):

```ts
days.push({
  date: iso,
  status: classifyDay(items),   // legacy 互換 (§3.1)
  occurrenceCount: items.length,
  counts: countDay(items),
});
```

**不変条件**: `present + absent + excused + tardy + earlyLeave + suspended + unrecorded === occurrenceCount` (すべての日で)。`byDate` は occurrence 1 件につき 1 要素を push するため自動的に成立する。

### 4.2 共有ロジックの型 (Web / iOS で同型)

**Web — `apps/web/src/lib/dayStatusVisual.ts` (全置換)**

```ts
import type { AttendanceDaySummary } from "@atender/shared";

/** severity 順。この配列の順が背景セグメント順・グリフ選択順の唯一の定義。 */
export const DAY_MARK_ORDER = ["absent", "excused", "tardy", "suspended", "present", "unrecorded"] as const;
export type DayMarkKind = (typeof DAY_MARK_ORDER)[number];

export type DayVisualIcon = "check" | "x" | "excused" | "clock" | "ban" | "minus";

export type DayMark = {
  kind: DayMarkKind;
  count: number;        // 1 以上
  icon: DayVisualIcon;
  iconColor: string;    // "var(--color-status-absent)" 等
  tint: string;         // "color-mix(in srgb, var(--color-status-absent) 26%, var(--color-bg-elevated))"
};

export type DayVisual = {
  marks: DayMark[];     // severity 順。count===0 のものは含まない
  dashed: boolean;
};

export function dayVisual(
  summary: AttendanceDaySummary | undefined,
  opts: { future?: boolean } = {},
): DayVisual;

/** marks から CSS background を 1 文字列で組む。marks が空なら "" */
export function dayBackground(marks: DayMark[]): string;

/** セルに描くグリフ (severity 順に先頭 2 件)。 */
export function dayGlyphs(marks: DayMark[]): DayMark[];
```

**iOS — `apps/ios/Atender/Features/SemesterOverview/SemesterLogic.swift` (`AttendanceDayVisual` を全置換)**

```swift
enum AttendanceDayVisual {
    /// severity 順。CaseIterable の宣言順 = 表示順 (Web の DAY_MARK_ORDER と一致させる)
    enum Kind: String, CaseIterable, Equatable {
        case absent, excused, tardy, suspended, present, unrecorded
    }

    enum Icon: Equatable {
        case check, x, excused, clock, ban, minus, none
    }

    struct Mark: Equatable {
        let kind: Kind
        let count: Int        // 1 以上
        let icon: Icon
        let iconColor: Color
        let tintColor: Color
        let tintFraction: Double
    }

    struct DayVisual: Equatable {
        let marks: [Mark]     // severity 順。count == 0 のものは含まない
        let dashed: Bool
    }

    /// 唯一の描画決定関数。
    static func dayVisual(summary: AttendanceDaySummary?, isFuture: Bool) -> DayVisual

    /// 背景に敷く縦スライス列 (occurrence 1 件 = 1 スライス、等幅)。marks が空なら []
    static func backgroundSlices(_ marks: [Mark]) -> [(color: Color, fraction: Double)]

    /// セルに描くグリフ (severity 順に先頭 2 件)
    static func glyphs(_ marks: [Mark]) -> [Mark]
}
```

- 旧 `AttendanceDayVisual.of(status:isFuture:)` と旧 `Visual` / 旧 `Icon` (`case minus` 等の並び) は**削除**する。
- `backgroundSlices` の戻り値は `(color, fraction)` の配列で、`fraction` は常に `1 / スライス総数` (等幅)。`marks[i].count` 個ずつ同じ色が連続する。SwiftUI 実装は `HStack(spacing: 0)` に `Rectangle().fill(color.opacity(tintFraction)).frame(maxWidth: .infinity)` を並べるだけで良く、**`GeometryReader` を使わない** (`aspectRatio` 制約下で `GeometryReader` が貪欲になるのを避ける)。

### 4.3 `dayVisual` の決定手順 (両プラットフォーム同一)

```
入力: summary (nil/undefined 可)、isFuture: Bool

1. summary が nil        → { marks: [], dashed: false }
2. summary.counts が nil → legacy 経路 (§4.4) へ
3. eff = counts をコピーし、isFuture なら eff.unrecorded = 0 にする
4. marks を severity 順に組み立てる (count が 0 のものは入れない):
     absent      ← eff.absent
     excused     ← eff.excused
     tardy       ← eff.tardy + eff.earlyLeave
     suspended   ← eff.suspended
     present     ← eff.present
     unrecorded  ← eff.unrecorded
5. dashed = (eff.unrecorded > 0)          // isFuture のとき eff.unrecorded は 0 なので常に false
6. 返す
```

- 上限を設けない (最大 6 マーク)。切り捨てはグリフ側 (先頭 2 件) だけで行い、**背景セグメントは全マークを描く**ので情報が消えない。
- `occurrenceCount` は `dayVisual` で使わない (counts の合計が同値なので冗長)。

### 4.4 legacy 経路 (`counts` が無い旧 API)

`status` から 1 マークを導出し、**今日と完全に同じ描画**にする。

| status | isFuture=false | isFuture=true |
|---|---|---|
| `ALL_PRESENT` | `[present×1]`, dashed=false | `[]`, dashed=false |
| `HAS_ABSENT` | `[absent×1]`, dashed=false | `[]`, dashed=false |
| `HAS_TARDY` | `[tardy×1]`, dashed=false | `[]`, dashed=false |
| `ALL_SUSPENDED` | `[suspended×1]`, dashed=false | `[suspended×1]`, dashed=false |
| `PARTIAL_UNRECORDED` | `[unrecorded×1]`, **dashed=true** | `[]`, dashed=false |
| `NO_CLASS` / unknown | `[]`, dashed=false | `[]`, dashed=false |

### 4.5 コンポーネント prop 契約

**Web `AttendanceCalendar`** (`apps/web/src/components/semester/AttendanceCalendar.tsx`): props 不変 (`days: AttendanceDaySummary[]` ほか)。内部だけ差し替える。

- `daysByDate` は `Map<string, AttendanceDaySummary>` のまま (今も summary を持っている)。
- セル: `const visual = dayVisual(summary, { future: iso > today })`。
- `style={{ background: dayBackground(visual.marks) }}` (空文字なら `background` を付けない、今と同じ扱い)。
- 破線: `visual.dashed` で `border-dashed` + `borderColor` (今と同じ)。
- グリフ行: `dayGlyphs(visual.marks)` を `<span className="mt-0.5 flex items-center justify-center gap-0.5">` に並べる。
  - `glyphs.length >= 2` → 各グリフ `h-3 w-3` (12px)、`glyphs.length <= 1` → `h-4 w-4` (16px、今と同じ)。
  - `glyphs.length === 0` → 空の `<span className="mt-0.5 h-4 w-4" aria-hidden="true" />` を置く (日番号の縦位置を今日と同じに保つ)。
  - `excused` グリフは lucide でなく `<span className="font-bold leading-none" style={{ color }}>公</span>` (サイズは `text-[12px]` / `text-[16px]`)。
- **`aria-label` は `date.format("M月D日")` のまま変えない** (§9.2 の理由)。

**Web `CalendarMonth`** (`apps/web/src/components/rooms/calendar/CalendarMonth.tsx`): prop を差し替える。

```ts
// 旧: statusByDate?: Map<string, AttendanceDaySummary["status"]>;
   daySummaries?: Map<string, AttendanceDaySummary>;
```
- `const marks = inMonth ? dayVisual(daySummaries?.get(dateString), { future: false }).marks : []`
- ドット: `marks.slice(0, 3)` を `<span className="flex shrink-0 items-center gap-0.5">` に並べ、各 `<span className="h-1.5 w-1.5 rounded-full" style={{ background: <tint 色の生トークン> }} />`。
  - ドット色は tint 文字列 (`color-mix(...)`) ではなく**素の色トークン** (`var(--color-status-absent)` 等) を使う。そのため `DayMark` に `dotColor: string` を持たせる (= `unrecorded` は `var(--color-status-none)`、他は `iconColor` と同値)。
- 呼び出し元 `apps/web/src/components/home/PersonalCalendar.tsx`:
  - `statusByDate` の `useMemo` (`:28-32`) は **`expandUserTimetable` 用に残す** (`NO_CLASS` 判定に使われている `:54`)。
  - `daySummaries` の `useMemo` を新設し、`:127` の `<CalendarMonth ... statusByDate={statusByDate}>` を `daySummaries={daySummaries}` に変える。

**iOS `AttendanceCalendar`** (`SemesterOverviewComponents.swift`): 公開 init は不変 (`days`/`startDate`/`endDate`/`today`/`semesterId`/`selectionMode`/`selectedDates`/`onSelectDay`/`onToggleSelectionMode`/`onToggleDate`)。

- `dayCell` 内で毎回作っている `let map = Dictionary(...)` (`:137`) を **View の `private var daysByDate: [String: AttendanceDaySummary]`** に持ち上げる (セルごとに O(n) を作り直しているのを潰す。値は status でなく summary 全体)。
- `let visual = AttendanceDayVisual.dayVisual(summary: daysByDate[iso], isFuture: iso > today)`。
- 背景 ZStack (`:148-154`) を差し替え:
  ```swift
  ZStack {
      Color.bgElevated
      HStack(spacing: 0) {
          ForEach(Array(AttendanceDayVisual.backgroundSlices(visual.marks).enumerated()), id: \.offset) { _, slice in
              Rectangle()
                  .fill(slice.color)
                  .frame(maxWidth: .infinity, maxHeight: .infinity)
          }
      }
  }
  .clipShape(Circle())
  ```
  ここで `slice.color` は **`tintColor.opacity(tintFraction)` を解決済みの色**とする (= `backgroundSlices` が `mark.tintColor.opacity(mark.tintFraction)` を返す)。`Color` は `Equatable` なのでテストで直接比較できる。
- グリフ行 (`:158`) を差し替え:
  ```swift
  let glyphs = AttendanceDayVisual.glyphs(visual.marks)
  let glyphSize: CGFloat = glyphs.count >= 2 ? 12 : 16
  HStack(spacing: 2) {
      if glyphs.isEmpty {
          statusIcon(.none, size: glyphSize)     // 透明プレースホルダ (高さ維持)
      } else {
          ForEach(Array(glyphs.enumerated()), id: \.offset) { _, mark in
              statusIcon(mark.icon, size: glyphSize).foregroundStyle(mark.iconColor)
          }
      }
  }
  ```
- `statusIcon` のシグネチャを `private func statusIcon(_ icon: AttendanceDayVisual.Icon, size: CGFloat) -> some View` に変え、`case .excused:` を追加:
  ```swift
  case .excused:
      Text("公")
          .font(.system(size: size, weight: .bold))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
  ```
  他の case は `Image(systemName:)` のまま。`Group` の末尾に付いていた `.font(.system(size: 16, weight: .bold))` は `.font(.system(size: size, weight: .bold))` に、`.frame(height: 16)` は `.frame(height: size)` にする。**`Text` に `.font(.system(size:weight:))` を後付けすると `.excused` ブランチ内の font 指定を上書きするので、`.excused` は `Group` 外側の modifier だけで足りる** — つまり `.excused` ブランチは `Text("公").lineLimit(1).minimumScaleFactor(0.7)` のみとし、font は外側に任せる。
- `hasStateStroke` / 破線 overlay / today リング / 選択リング / 予定ドット (`:143,163-199`) は**すべて不変**。
- 凡例は §2.4 の 2 行構成に置換。`legendItem` は `size: 14` を渡す形に合わせる。

**iOS `CalendarMonth`** (`Features/Calendar/PersonalCalendar.swift:254-262`):

```swift
// 旧: let statusByDate: [String: AttendanceDayStatus]
   let daySummaries: [String: AttendanceDaySummary]
```
- `dayCell` の `:354-356` を、`AttendanceDayVisual.dayVisual(summary: daySummaries[date], isFuture: false).marks.prefix(3)` の色ドット `HStack(spacing: 2)` に置換。ドット色は `mark.dotColor` (新設フィールド、`unrecorded` は `Color.statusNone`、他は `iconColor` と同値)。
- `PersonalCalendarViewModel.statusByDate()` (`:84-86`) は **`MeetingExpansion` 用にそのまま残す** (`:48,58` の用途)。新たに `func daySummaries() -> [String: AttendanceDaySummary]` を足し、`:147` の呼び出しを差し替える。
- `RoomDetailView.swift:167` の `statusByDate: [:]` → `daySummaries: [:]`。

---

## 5. 挙動仕様

Reviewer はここからテストを生成する。`X` は「その kind のマークが count=X で marks に含まれる」の意味。marks の並びは常に §2.2 の severity 順。

### 5.1 サーバ集計 (`GET /api/semesters/:id/overview`)

| # | 条件 | 期待 |
|---|---|---|
| S1 | 1 日に occurrence 2 件・両方 `PRESENT` | その日の `counts = {present:2, absent:0, excused:0, tardy:0, earlyLeave:0, suspended:0, unrecorded:0}`、`occurrenceCount = 2` |
| S2 | 1 日に occurrence 4 件・`PRESENT`×3 + `ABSENT`×1 | `counts.present = 3` かつ `counts.absent = 1`。`status` は従来通り `"HAS_ABSENT"` |
| S3 | 1 日に occurrence 2 件・`EXCUSED`×1 + `PRESENT`×1 | `counts.excused = 1` かつ `counts.present = 1`。`status` は従来通り `"ALL_PRESENT"` (legacy の穴は塞がない) |
| S4 | 1 日に occurrence 1 件・`EXCUSED` のみ | `counts.excused = 1`、他 0。`status === "ALL_PRESENT"` |
| S5 | 1 日に occurrence 2 件・`TARDY`×1 + `EARLY_LEAVE`×1 | `counts.tardy = 1` かつ `counts.earlyLeave = 1` (**サーバは合算しない**。合算はクライアント側) |
| S6 | 時間割休講が設定された日 (occurrence 2 件) | `counts.suspended = 2`、`counts.unrecorded = 0`。`status === "ALL_SUSPENDED"` |
| S7 | 科目休講が設定された科目の occurrence 1 件 + 別科目の `PRESENT` 1 件 | `counts.suspended = 1` かつ `counts.present = 1` |
| S8 | occurrence に `AttendanceRecord` が無い日 (3 件) | `counts.unrecorded = 3`、他 0。`status === "PARTIAL_UNRECORDED"` |
| S9 | occurrence に `CANCELLED` 記録がある 1 件 | `counts.suspended = 1` (`cancelled` という別枠は作らない) |
| S10 | 学期範囲内で occurrence が 0 件の日 | `counts` の全フィールドが 0、`occurrenceCount = 0`、`status === "NO_CLASS"` |
| S11 | **不変条件** — 任意の日 | `present + absent + excused + tardy + earlyLeave + suspended + unrecorded === occurrenceCount` |
| S12 | 未来日 (今日より後) の occurrence に `EXCUSED` 記録がある | サーバは過去日と同じく `counts.excused = 1` を返す (**サーバ側に未来除外は無い**) |
| S13 | overview の他のフィールド | `overall` / `courses` / `toDate` / `allowedAbsences` は本変更の前後で**値が変わらない** |
| S14 | レスポンス schema | `days[]` の各要素が `AttendanceDaySummary` (`counts` 必須) として zod parse を通る |

### 5.2 `dayVisual` — 過去日 (`isFuture = false`、`counts` あり)

| # | counts (p,a,e,t,el,s,u) | 期待 marks (severity 順) | dashed |
|---|---|---|---|
| D1 | 2,0,0,0,0,0,0 | `[present×2]` | false |
| D2 | 3,1,0,0,0,0,0 | `[absent×1, present×3]` | false |
| D3 | 2,0,1,0,0,0,0 | `[excused×1, present×2]` | false |
| D4 | 1,0,0,1,1,0,0 | `[tardy×2, present×1]` (TARDY + EARLY_LEAVE を合算) | false |
| D5 | 0,0,0,0,0,2,0 | `[suspended×2]` | false |
| D6 | 0,0,0,0,0,0,3 | `[unrecorded×3]` | **true** |
| D7 | 1,0,0,0,0,0,2 | `[present×1, unrecorded×2]` | **true** |
| D8 | 0,0,0,0,0,0,0 | `[]` | false |
| D9 | 1,1,1,1,0,1,0 | `[absent×1, excused×1, tardy×1, suspended×1, present×1]` (5 マーク、切り捨てなし) | false |
| D10 | 0,0,2,0,0,0,1 | `[excused×2, unrecorded×1]` | **true** |

### 5.3 `dayVisual` — 未来日 (`isFuture = true`、`counts` あり)

| # | counts (p,a,e,t,el,s,u) | 期待 marks | dashed |
|---|---|---|---|
| D11 | 0,0,0,0,0,0,2 | `[]` (未記録だけの未来日は無表示) | false |
| D12 | 0,0,1,0,0,0,1 | `[excused×1]` (**Touri 要望 #3**) | false |
| D13 | 0,0,0,0,0,1,0 | `[suspended×1]` (今日の挙動を維持) | false |
| D14 | 0,1,0,0,0,0,1 | `[absent×1]` | false |
| D15 | 2,0,0,0,0,0,0 | `[present×2]` (未来に出席を事前記録した日も表示する) | false |
| D16 | 0,0,0,0,0,0,0 | `[]` | false |

### 5.4 `dayVisual` — legacy 経路 (`counts` が nil / undefined)

| # | status | isFuture | 期待 marks | dashed |
|---|---|---|---|---|
| D17 | `ALL_PRESENT` | false | `[present×1]` | false |
| D18 | `HAS_ABSENT` | false | `[absent×1]` | false |
| D19 | `HAS_TARDY` | false | `[tardy×1]` | false |
| D20 | `ALL_SUSPENDED` | false | `[suspended×1]` | false |
| D21 | `PARTIAL_UNRECORDED` | false | `[unrecorded×1]` | **true** |
| D22 | `NO_CLASS` | false | `[]` | false |
| D23 | `ALL_PRESENT` | true | `[]` | false |
| D24 | `HAS_ABSENT` | true | `[]` | false |
| D25 | `PARTIAL_UNRECORDED` | true | `[]` | false |
| D26 | `ALL_SUSPENDED` | true | `[suspended×1]` (未来でも休講だけは表示、旧仕様どおり) | false |
| D27 | iOS のみ: `unknown` | false | `[]` | false |

### 5.5 `dayVisual` — 異常系

| # | 条件 | 期待 |
|---|---|---|
| D28 | summary が nil / undefined | `{ marks: [], dashed: false }` |
| D29 | `counts` の全フィールドが 0 だが `occurrenceCount` が 3 (サーバ不整合) | `{ marks: [], dashed: false }` — **`occurrenceCount` を読まないので落ちない** |
| D30 | `counts` に負値が入っている (あり得ないが) | 負値の kind は marks に**含めない** (条件は `count > 0`) |

### 5.6 マークの属性 (色 / グリフ / tint)

| # | kind | icon | iconColor | tint 色 | tint 比 |
|---|---|---|---|---|---|
| M1 | `absent` | `x` | absent | absent | iOS `surfaceTintRatio` / Web `26%` |
| M2 | `excused` | `excused` (= 文字「公」) | **excused** | excused | iOS `surfaceTintRatio` / Web `22%` |
| M3 | `tardy` | `clock` | tardy | tardy | iOS `surfaceTintRatio` / Web `24%` |
| M4 | `suspended` | `ban` | suspended | suspended | iOS `surfaceTintRatio` / Web `20%` |
| M5 | `present` | `check` | present | present | iOS `surfaceTintRatio` / Web `20%` |
| M6 | `unrecorded` | `minus` | **textTertiary / `--color-fg-tertiary`** | **statusNone / `--color-status-none`** | iOS `0.12` / Web `12%` |
| M7 | `DAY_MARK_ORDER` / `Kind.allCases` の並び | `absent, excused, tardy, suspended, present, unrecorded` (両プラットフォームで完全一致) | | | |

### 5.7 背景 / グリフの導出

| # | 条件 | 期待 |
|---|---|---|
| B1 | marks = `[absent×1, present×3]` | iOS: `backgroundSlices` の要素数 = 4、先頭 1 個が absent tint、残り 3 個が present tint、`fraction` はすべて `0.25` |
| B2 | marks = `[present×2]` | iOS: 要素数 2、両方 present tint、`fraction = 0.5` |
| B3 | marks = `[]` | iOS: `backgroundSlices` = `[]` / Web: `dayBackground([])` === `""` |
| B4 | marks = `[absent×1, present×3]` | Web: `dayBackground` が `linear-gradient(90deg, ` で始まり、`--color-status-absent` と `--color-status-present` を両方含み、境界が `25%` を含む |
| B5 | marks = `[present×2]` | Web: `dayBackground` が `--color-status-present` を含み `--color-status-absent` を含まない |
| B6 | marks が 3 件以上 | `glyphs` / `dayGlyphs` は**先頭 2 件のみ**返す (severity 順) |
| B7 | marks が 1 件 | `glyphs` は 1 件返す |
| B8 | marks が 0 件 | `glyphs` は `[]` を返す |

### 5.8 学期カレンダー セル描画 (Web、RTL で検証可能)

`days` fixture は `counts` を持つ。`today = "2026-06-11"`。

| # | 条件 | 期待 |
|---|---|---|
| C1 | 過去日で `counts.absent=1, present=3` | そのセルの `style` に `--color-status-absent` と `--color-status-present` の**両方**が含まれる (今は absent だけ) |
| C2 | 過去日で `counts.excused=1` のみ | セルの `style` に `--color-status-excused` が含まれ、`--color-status-present` は**含まれない** (Touri 要望 #2) |
| C3 | 未来日 (`2026-06-21`) で `counts.excused=1, unrecorded=1` | セルの `style` に `--color-status-excused` が**含まれる** (Touri 要望 #3。現行は空) |
| C4 | 未来日 (`2026-06-20`) で `counts.unrecorded=2` のみ | セルの `style` に status トークンが**含まれない**、`border-dashed` も付かない |
| C5 | 未来日 (`2026-06-13`) で `counts.suspended=1` | セルの `style` に `--color-status-suspended` が含まれる (回帰防止) |
| C6 | 過去日で `counts.unrecorded > 0` | セルの className に `border-dashed` が含まれる |
| C7 | 任意の日 | セルの `aria-label` は `"M月D日"` のまま (例: `6月3日`)。**変更しない** |
| C8 | セル操作 (通常モードで `onSelectDay` / 選択モードで `onToggleDate` / 範囲外 disabled / 選択リング / 予定ドット / 月ナビ / 「今日」ピル) | **すべて現行と同一挙動** (回帰なし) |
| C9 | 凡例 | `出席` `欠席` `公欠` `遅刻・早退` `休講` の 5 語がすべて描画される |
| C10 | 過去日で 3 種類以上のマーク | グリフ要素は 2 個だけ描画される |

### 5.9 ホーム個人カレンダー (`CalendarMonth`)

| # | 条件 | 期待 |
|---|---|---|
| P1 | 当月セルの `daySummaries` に `counts.absent=1, present=1` | ドットが 2 個、`--color-status-absent` と `--color-status-present` |
| P2 | `counts` 全 0 (= `NO_CLASS`) | ドットが 0 個 |
| P3 | `daySummaries` に該当日が無い | ドットが 0 個 |
| P4 | 当月外のセル | `daySummaries` に値があってもドットを描かない (現行と同じ) |
| P5 | マークが 4 種類以上 | ドットは 3 個まで |
| P6 | `counts.excused=1` のみ | ドット 1 個で `--color-status-excused` (現行は `--color-status-present`) |
| P7 | `daySummaries` を渡さない (ルーム詳細) | ドットが 1 個も描かれない |
| P8 | イベント chip / `+N` / 選択・今日の強調 | **すべて現行と同一** (回帰なし) |

### 5.10 DTO デコード (iOS)

| # | 条件 | 期待 |
|---|---|---|
| T1 | `Fixtures/semesterOverview.json` (`counts` 付きに更新済) を `SemesterOverviewDto` に decode | 成功し、`days[0].counts?.present == 2` 等が読める |
| T2 | `counts` キーを**持たない** inline JSON を `AttendanceDaySummary` に decode | **成功**し `counts == nil` (Optional の担保。既存 fixture を書き換えず inline JSON で検証する) |
| T3 | `counts` を持つ summary から `dayVisual` を呼ぶ | §5.2 の表どおり |

---

## 6. テスト基盤

### 6.1 フレームワーク / 配置

| 対象 | フレームワーク | 配置 | 実行 |
|---|---|---|---|
| API | Vitest | `apps/api/tests/semesters.test.ts` (既存に追記) | `pnpm --filter @atender/api test` |
| Web | Vitest + RTL (jsdom) | `apps/web/tests/lib/dayStatusVisual.test.ts` (全置換) / `apps/web/tests/components/AttendanceCalendar.test.tsx` (置換) / `apps/web/tests/components/CalendarMonth.test.tsx` (置換) | `pnpm --filter @atender/web test` |
| iOS | XCTest | `apps/ios/AtenderTests/SemesterLogicTests.swift` (置換) / `AtenderTests/DTODecodingTests.swift` (追記) / `AtenderTests/Fixtures/semesterOverview.json` (更新) | `xcodebuild test -project Atender.xcodeproj -scheme Atender -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.2'` |

E2E (chrome-devtools MCP) は使わない。最終ゲートは Touri のシミュレータ確認。

### 6.2 ★ Web / iOS の食い違いを防ぐ担保

既存も二重実装 (`dayStatusVisual.ts` ⇄ `SemesterLogic.swift`) なのでそれに倣うが、**ドリフト検出を仕組みで持たせる**:

1. **同一ケース表・同一 ID**: §5.2〜§5.7 の `D1`〜`D30` / `M1`〜`M7` / `B1`〜`B8` を、**Web と iOS の両方に同じ ID・同じ入力・同じ期待値で実装する**。テスト名の先頭に ID を入れる (Web: `it("[D12] future excused stays visible", ...)`、iOS: `func testD12FutureExcusedStaysVisible()`)。ID が片側にしか無ければレビューで即座に分かる。
2. **順序の明示アサート (M7)**: `DAY_MARK_ORDER` (Web) と `AttendanceDayVisual.Kind.allCases` (iOS) が `["absent","excused","tardy","suspended","present","unrecorded"]` と**完全一致**することを、両方で 1 本ずつアサートする。severity 順は「宣言順 = 表示順」なので、この 1 本が順序ドリフトを止める。
3. **tint 比の直接アサート (M1〜M6)**: Web は `%` 文字列、iOS は `Double` を直接比較する (プラットフォーム間で値が違うこと自体は仕様。§2.3 の表が正典)。
4. **配線の検証**: `gotcha/dto-type-literal-decode-tests-bypass-repository-wiring.md` の再発防止として、iOS は **fixture 経由の decode テスト (T1)** を必ず置く。型直書きの decode テストだけで済ませない。

### 6.3 置換対象 (既存テストのうち意図的に壊すもの)

**確認済みの実ファイル名で記載する** (ブリーフの `SemelogicTests.swift` は実在せず、正しくは `SemesterLogicTests.swift`)。

| ファイル | テスト | 扱い |
|---|---|---|
| `apps/ios/AtenderTests/SemesterLogicTests.swift` | `testAttendanceDayVisualForPastStatuses` | **置換** — 旧 `Visual` 構造体 (単一 icon + bgFraction) を固定している。§5.2 の D1〜D10 に置き換える |
| 同上 | `testAttendanceDayVisualForNoClassNilAndUnknown` | **置換** — D8 / D27 / D28 に置き換える |
| 同上 | `testAttendanceDayVisualFuturePriorityKeepsOnlyAllSuspended` | **置換** — 未来抑制の旧仕様を固定している。§5.3 (D11〜D16) + §5.4 (D23〜D26) に置き換える。**旧仕様は legacy 経路 (D23/D24/D26) として意味が残る** |
| 同上 | `assertVisual` / `assertNoBackgroundVisual` ヘルパ (`:170` 以降) | **置換** — 新 `DayVisual` 用のヘルパに書き換える |
| `apps/ios/AtenderTests/Fixtures/semesterOverview.json` | days[] 5 件 | **更新** — 各要素に `counts` を追加。`occurrenceCount` と合計が一致するようにする (S11) |
| `apps/ios/AtenderTests/DTODecodingTests.swift` | `days` の assert 区画 (`:115-118` 付近) | **追記** — `counts` の assert を足す (T1)。既存 assert は残す |
| `apps/web/tests/lib/dayStatusVisual.test.ts` | ファイル全体 (`statusVisual` の 3 describe) | **全置換** — `dayVisual` / `dayBackground` / `dayGlyphs` のケース表に置き換える |
| `apps/web/tests/components/AttendanceCalendar.test.tsx` | `days` fixture (`:9-15`) | **更新** — 各要素に `counts` を追加 |
| 同上 | `"suppresses future non-suspension status but shows future suspension status"` (`:145` 付近) | **置換** — C3 / C4 / C5 に置き換える |
| 同上 | 他の 8 本 (月ナビ / 今日ピル / 選択モード / disabled 等) | **維持** — `aria-label` も props も変えないので緑のまま |
| `apps/web/tests/components/CalendarMonth.test.tsx` | `"does not render chips or status dots for out-of-month cells"` (`:81`) | **置換** — prop が `daySummaries` に変わる。期待値 (当月外はドット無し) は不変 |
| 同上 | `"renders a status dot for HAS_ABSENT and no dot for NO_CLASS or missing status"` (`:108`) | **置換** — P1 / P2 / P3 に置き換える |

### 6.4 意図的に**壊さない**もの (Reviewer が「なぜ緑か」を疑わずに済むように)

| ファイル | 理由 |
|---|---|
| `apps/api/tests/attendance.test.ts` (`expect(hits).toContain("ALL_PRESENT")`) | `classifyDay()` を変えず `status` を維持したため (§3.1)。**ブリーフは壊れると予測していたが、設計判断で壊さずに済ませた** |
| `apps/api/tests/semesters.test.ts:151,168` / `timetable-suspensions.test.ts:188` | 同上 |
| `apps/web/tests/lib/calendarEventDisplay.test.ts` / `apps/ios/AtenderTests/CalendarEventDisplayTests.swift` | `dayStatusColor` / `dayStatusLabel` を**触らない**ため (§11 で孤児化を報告) |
| `apps/web/tests/lib/expandUserTimetable.test.ts` / `apps/ios/AtenderTests/MeetingExpansionTests.swift` | `expandUserTimetable` / `MeetingExpansion` の `statusByDate` 引数を**そのまま残す**ため |
| `apps/api/tests/stats.test.ts` / `occurrence-denominator.review.test.ts` / `allowed-absence-days.review.test.ts` | 統計計算に一切触れないため (S13) |

### 6.5 ベースライン失敗の台帳

`Muraki/projects/atender/.knowledge/known-failures.md` と照合してから「既存破損」を主張すること。本設計で新たに未分類の失敗を残したままマージしない。

---

## 7. 変更ファイル一覧

### `packages/shared`
- `src/schemas/semester.ts` — `AttendanceDayCounts` 追加、`AttendanceDaySummary.counts` 追加、型 export 追加

### `apps/api`
- `src/services/semesterOverview.service.ts` — `countDay()` 追加、`days.push` に `counts` 追加、`classifyDay` の直上に legacy コメント追加 (ロジックは不変)
- `tests/semesters.test.ts` — S1〜S14 を追記
- **Prisma schema / migration: 変更なし**
- `src/lib/clientVersion.ts` — **変更なし** (§0.3)

### `apps/web`
- `src/lib/dayStatusVisual.ts` — 全置換 (`dayVisual` / `dayBackground` / `dayGlyphs` / `DAY_MARK_ORDER` / 型)
- `src/components/semester/AttendanceCalendar.tsx` — セル背景・グリフ行・凡例
- `src/components/rooms/calendar/CalendarMonth.tsx` — prop `statusByDate` → `daySummaries`、ドット 1 個 → 最大 3 個
- `src/components/home/PersonalCalendar.tsx` — `daySummaries` の `useMemo` 追加、`CalendarMonth` 呼び出し差し替え (`statusByDate` の `useMemo` は `expandUserTimetable` 用に残す)
- `tests/lib/dayStatusVisual.test.ts` / `tests/components/AttendanceCalendar.test.tsx` / `tests/components/CalendarMonth.test.tsx` — §6.3

### `apps/ios`
- `Atender/Core/Models/DTOs.swift` — `AttendanceDayCounts` 追加、`AttendanceDaySummary.counts: AttendanceDayCounts?` 追加
- `Atender/Core/Models/ModelSync.md` — ミラー表に 1 行追加
- `Atender/Features/SemesterOverview/SemesterLogic.swift` — `AttendanceDayVisual` 全置換
- `Atender/Features/SemesterOverview/SemesterOverviewComponents.swift` — `daysByDate` 持ち上げ、`dayCell` 背景/グリフ、`statusIcon(_:size:)`、`legend` 2 行化、`legendItem`
- `Atender/Features/Calendar/PersonalCalendar.swift` — `CalendarMonth.daySummaries`、`dayCell` のドット行、`PersonalCalendarViewModel.daySummaries()` 追加
- `Atender/Features/Rooms/RoomDetailView.swift` — `:167` の `statusByDate: [:]` → `daySummaries: [:]`
- `AtenderTests/SemesterLogicTests.swift` / `AtenderTests/DTODecodingTests.swift` / `AtenderTests/Fixtures/semesterOverview.json` — §6.3
- `project.yml` — 出荷時に `CFBundleVersion` `"11"` → `"12"`

### `.designs` (既存 doc の置換 — §12)
- `.designs/20260611-semester-redesign.md`
- `.designs/20260701-ios-port-phase-c-semester.md`

---

## 8. 実装順序

1 コミット / 1 PR で完結させる (shared の型変更が 3 アプリに同時に効くため分割不可)。ただし作業順は:

1. `packages/shared` → `apps/api` (S1〜S14 が緑になることを先に確認)
2. `apps/web` の `dayStatusVisual.ts` (D1〜D30 / B1〜B8 が緑)
3. `apps/web` のコンポーネント (C1〜C10 / P1〜P8)
4. `apps/ios` の DTO + `SemesterLogic.swift` (D1〜D30 / B1〜B8 / T1〜T3)
5. `apps/ios` のビュー (`SemesterOverviewComponents` → `PersonalCalendar` → `RoomDetailView`)

**注意**: `apps/ios` は Developer の sandbox で test target をコンパイルできない可能性がある (`gotcha/non-optional-dto-field-is-not-additive-for-callers.md`)。ビルド不能な場合は「未検証」と明示的に上申すること。Reviewer は sandbox 外で `xcodebuild build-for-testing` を必ず 1 回回し、pass/fail 以前に**コンパイルが通るか**を第一関門にする。

---

## 9. 不採用案

### 9.1 データモデル

- **`classifyDay()` を廃止し `status` を削除する**: 却下。配布済み build 11 クライアントの `SemesterOverviewDto` decode が丸ごと throw し、学期・科目タブがエラー表示になる。additive でなくなり `MIN_IOS_BUILD` を上げる強制アップデートが必要になる。かつ API テスト 4 本と `meetingExpansion` の `NO_CLASS` 判定を巻き込む。
- **`AttendanceDayStatus` enum に `HAS_EXCUSED` を追加する**: 却下。(a) enum 値の追加は wire では additive でも**旧クライアントの表示が変わる** (iOS は `unknown` にフォールバックして無表示、Web の deployed bundle は `undefined` 相当で無表示) — つまり「公欠の日が消える」退行を旧版に注入する (b) 追加しても「1 日 1 値」の構造は変わらず要望 #1 が解けない (c) 6 値を 7 値・8 値と足していくのは組合せ爆発 (欠席+公欠の日は?)。**内訳を持たせるのが唯一のスケールする解**。
- **`counts` でなく `statuses: AttendanceStatus[]` (occurrence ごとの生配列) を返す**: 却下。1 日 8 コマなら 8 要素、学期 180 日で最大 1440 要素になりペイロードが膨らむ。クライアントは件数しか使わないので集計済みで十分。
- **`cancelled` を `suspended` と別枠にする**: 却下。UI 上どちらも「休講」で色もアイコンも凡例も同一なので、分けても誰も使わない。分けた瞬間に「どちらの色か」を決める必要が生じる。
- **iOS の `counts` を非 Optional にする**: 却下。memberwise init の呼出しは 0 箇所なので大半のリスクは無いが、**旧 API × 新アプリ**の組合せで `SemesterOverviewDto` 全体の decode が throw し、学期・科目タブが丸ごと落ちる。Optional + legacy フォールバック (§4.4) なら「古いサーバでは今日と同じ描画」に劣化するだけで済む。

### 9.2 UI

- **セルにグリフを 3 個以上並べる**: 却下。iPhone 16 で日セルは 44×44pt、円形クリップのためグリフ行の使用可幅は約 38pt。3 個並べると 10pt になり「公」の可読性が落ちる。**背景セグメントが全マークを描く**ので、グリフを 2 個に絞っても情報は失われない。
- **4 種類以上のとき `ellipsis` (…) グリフで省略を示す**: 却下。背景セグメント数が種類数を伝えるので冗長。特別分岐を 1 つ増やす価値がない。
- **日セルを丸 → 角丸四角 (`Radius.sm`) に変える**: 却下。DESIGN.md §3.1 の「日セル = Radius.sm」および Web の `rounded-lg` に寄せる根拠はあるが、丸セルは build 11 で意図的に確定した見た目 (`c0b8ad2` 「学期出欠を丸セルに」/ `f2bad99` 薄枠追加 / `f916451` spacing 6→3) で Touri が承認済み。今回の FB に形状の不満は無い。**要望に無い視覚変更を混ぜない**。
- **右上バッジ枠に「2」「3」の件数バッジを出す**: 却下。右上は選択チェック (16pt) と予定ドット (8pt) が既に占有しており (`SemesterOverviewComponents.swift:163-176`)、三つ巴になる。
- **背景セグメントをやめ、単色 tint (代表 1 ステータス) + グリフ複数にする**: 却下。「代表を選ぶ」= Touri が不満を述べた一次元化そのもの。3 コマ中 1 欠席の日が全面赤になる問題が残る。
- **セグメント幅を等分 (件数比でない) にする**: 却下。「4 コマ中 1 欠席」と「4 コマ中 3 欠席」が同じ絵になり、要望 #1 の「しっかり」に届かない。occurrence 1 件 = 1 スライスにすれば等幅レイアウトのまま比率が出る (`GeometryReader` 不要)。
- **公欠グリフに `checkmark.shield` / lucide `ShieldCheck` を使う**: 却下。12pt では `checkmark` (出席) と紛らわしく、要望 #2 (見分けたい) に逆行する。文字「公」は形として完全に別物で、かつ**新規シンボル名を導入しない**ので実在リスクもゼロ。
- **セルの `aria-label` に状態を含める**: 却下。RTL の `getByRole("button", { name })` は完全一致なので、`AttendanceCalendar.test.tsx` の既存 6 本を巻き込む。状態の詳細は日セルをタップして開く日別詳細シートで occurrence ごとに読め、凡例がグリフの意味を文字で説明しているため、色だけに依存しない要件は満たされている。
- **日別詳細シートに「この日のまとめ」行を足す**: 却下。今回の要望に無い。シートは既に occurrence ごとに 1 行ずつ全ステータスを表示しており (`DayDetailSheet.swift`)、潰れているのはカレンダーのマスだけ。
- **ホーム個人カレンダーにも背景セグメント + グリフを持ち込む**: 却下。ホームのセルは授業 chip が主役で、日ステータスは補助情報。セル背景を塗ると chip の tint 面 (`surfaceTintRatio`) と干渉する。ドット最大 3 個で公欠の識別 (要望 #2) は満たせる。
- **ホーム個人カレンダーを変えない**: 却下。同じ「日ステータスの色」規則が 2 画面で食い違い、公欠の日がホームでは緑ドットのままになる。DESIGN.md の「全画面共通の視覚規則は共有部品に流す」に反し、同じ FB が再発する。
- **学期カレンダーを DESIGN.md §4 に従って full-bleed 化する**: 却下 (本設計では)。§3.6.3 の full-bleed 規定は `CalendarMonth` (personal + room) 向けで、`AttendanceCalendar` は対象外。要望と無関係な大きな視覚変更になる。§11 で Leader に報告する。

### 9.3 その他

- **未来日を「今日以降すべて表示」にする**: 却下。Touri 決定どおり「明示的に記録があるものだけ」。全表示にすると学期の残り全部が未記録マークで埋まる。
- **統計側の未来除外 (`occurrenceDate <= todayIso`) も外す**: 却下。表示の話であって出席率計算の話ではない (Touri 決定)。
- **`occurrenceCount` を削除する**: 却下。読者はいない (F11) が、削除は wire の破壊的変更で additive の原則に反する。`counts` の合計と一致する冗長フィールドとして残す。

---

## 10. 検証 (Touri の 3 要望 → 検証可能な帰結)

| # | Touri の言葉 | 対応 | 検証 |
|---|---|---|---|
| 1 | 同じ日に複数ステータスがあると複数わかるように / 1 件欠席でその日がバツになる | §2.1 背景セグメント + グリフ 2 個、§4.3 の marks 組み立て | D2 / D9 / C1 / C10 / B1 |
| 2 | 公欠を見分けられない。緑じゃない色に | §2.3 `statusExcused` (青) + 文字「公」グリフ、凡例に公欠追加 | D3 / M2 / C2 / C9 / P6 |
| 3 | 未来の公欠が全く表示されない | §2.5 「未来日は unrecorded を 0 とみなす」 | D12 / D15 / C3 / C4 (未記録だけの未来日は無表示のまま) |

---

## 11. ★ 報告項目 (Leader / Touri 判断へ — 本設計では実行しない)

1. **`dayStatusColor` / `dayStatusLabel` が孤児化する**: ホーム個人カレンダーを `dayVisual` 経由に変えると、`apps/web/src/lib/calendarEventDisplay.ts:17-31` と `apps/ios/.../TimetableLogic.swift:300-318` の本番参照が 0 になる (`dayStatusLabel` は本設計以前から既に参照 0)。**本設計では削除しない** — 削除するとテストが Web 2 本 + iOS 2 本壊れ、かつ「作った UI/ロジックを捨てるか」の判断は Architect の裁量でないため。次に触るときの棚卸し候補。
2. **DESIGN.md §4 の表記揺れ**: §4「学期・科目 (overview)」の L1 行が「月カレンダーは full-bleed + hairline (§3.6.3)」と書いているが、§3.6.3 の本文は full-bleed 規定の対象を「personal (Home) と room (ルーム詳細)」と明示しており、学期出欠カレンダー (`AttendanceCalendar`) は含まれない。実装 (build 11) もカード + 丸セル。**本設計は実装側を正とした**。DESIGN.md §4 の文言を直すか、学期カレンダーも full-bleed 化するかは Touri のプロダクト判断。
3. **`CLAUDE.md` の版数記述が陳腐化**: 「主要ワークフロー」節が `CFBundleVersion: "8"` / build 8 が ASC 最新と書いているが、実際の `project.yml` は `"11"` で build 11 が出荷済 (`54b718c`)。本設計の対象外だが、次に TestFlight 手順を踏む人が誤る。

---

## 12. 既存設計doc の置換記録

CLAUDE.md「仕様マークダウンの編集規律」に従い、**未来日抑制を仕様として書いていた 2 箇所を追記でなく置換**した。

1. `.designs/20260611-semester-redesign.md` の AttendanceCalendar セル仕様 — 「**未来日** (`iso > today`): `status !== "ALL_SUSPENDED"` なら状態表示なし」を削除し、「未来日でも記録済みステータスは表示する (本 doc §2.5)」に置換。
2. `.designs/20260701-ios-port-phase-c-semester.md` の `statusVisual` マッピング表・純粋ロジック注記・テスト観点 — 「(未来 && status≠ALL_SUSPENDED) 最優先で全消し」「`AttendanceDayVisual.of` の分岐順」「未来分岐 (最優先)」の 3 箇所を、本 doc への置換ポインタに書き換え。
