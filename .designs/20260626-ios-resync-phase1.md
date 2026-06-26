# iOS Phase iOS-1 再同期 — 6/11〜6/12 web/API 変更ミラー

## 目的 (1-3行)

2026-06-08 実装の iOS Phase iOS-1 (Today / Timetable / SemesterOverview / Settings の読み取り + 認証 + 出席ループ) を、6/11〜6/12 に入った web/API 変更へ再同期する。本 doc は新規の設計判断をせず、**web/API の確定挙動をミラーする差分のみ**を扱う。土台設計 (`.designs/20260608-ios-foundation.md`) は上書きせず、その上に差分を当てる位置づけ。

---

## 1. 背景 (再同期が必要な理由)

`20260608-ios-foundation.md` 実装後に以下が main にマージされた:

- `20260611-occurrence-based-denominator.md` — `totalSessions` を Course / TemplateCourse / stats DTO から**物理削除**、出席率の母数を occurrence 実数ベースへ。`toDate` (今日まで実績) と全期間 (楽観射影) を分離。
- `20260611-semester-redesign.md` / `20260611-date-input-and-allowed-days.md` — SemesterOverview を「今日まで率 vs 全期間率併記 + 目標ライン + あとN限/N日休める + 残り/未記録」へ再設計。
- `20260612-setup-deadlock-fix.md` — setup 完了条件を `schoolId && departmentId && defaultSemesterId` に統一 (DTO 形は不変)。

iOS はこれらに追従しておらず、**現状 SemesterOverview と Timetable の courses decode が即死する** (削除済フィールドを非 Optional で要求しているため)。本再同期で decode を通し、新フィールドを read-only 表示まで反映する。

scope 境界は §9 を参照 (一括訂正・カレンダー・CRUD 等は iOS-2 送り)。

---

## 2. 変更対象ファイル一覧 (保全マップ)

### 2.1 修正 (部分変更)

| ファイル | 変更内容 | 根拠節 |
|---|---|---|
| `apps/ios/Atender/Core/Models/DTOs.swift` | `CourseStatsDto`/`CourseDto` から `totalSessions` 除去 + 新フィールド追加、`SemesterOverviewDto`/`Overall`/`MeResponse.User` に新フィールド追加、`AttendanceRateToDate`・`UserTimetableListResponse` 新規追加 | §3 |
| `apps/ios/Atender/Features/Timetable/TimetableViewModel.swift` | エンベロープ `{ userTimetables: [...] }` を剥がす decode へ修正 | §4 |
| `apps/ios/Atender/Features/SemesterOverview/SemesterOverviewView.swift` | 新 read-only 表示 (今日まで率/全期間/目標ライン/あとN限・N日/残り/未記録) | §5 |
| `apps/ios/Atender/Core/DesignSystem/Color+Atender.swift` | `Color.forRate(pct:required:)` ヘルパー追加 (rateColor ミラー) | §5.1 |
| `apps/ios/Atender/Features/Today/TodayView.swift` | setup 未完了時の文言を現実的な内容に置換 (line 62) | §6 |

### 2.2 テスト / Fixtures (更新)

| ファイル | 変更内容 | 根拠節 |
|---|---|---|
| `apps/ios/AtenderTests/Fixtures/semesterOverview.json` | `totalSessions` 除去 + `today`/`requiredAttendanceRate`/`overall.toDate`/`unrecordedCount`/`remainingCount`/`allowedAbsences` + 各 course の `toDate`/`remainingCount`/`allowedAbsences`/`maxDayPeriods`/`allowedAbsenceDays` 追加 | §7 |
| `apps/ios/AtenderTests/Fixtures/userTimetable.json` | course から `totalSessions` 除去 | §7 |
| `apps/ios/AtenderTests/Fixtures/me.json` | `user.requiredAttendanceRate` 追加 | §7 |
| `apps/ios/AtenderTests/Fixtures/userTimetables.json` (新規) | エンベロープ `{ "userTimetables": [ <UserTimetableDto> ] }` 形 | §7 |
| `apps/ios/AtenderTests/DTODecodingTests.swift` | 新フィールド assert 追加、`UserTimetableListResponse`/`me.requiredAttendanceRate` のデコード検証追加 | §7 |

### 2.3 流用 (触らない)

App/* (RootView/MainTabView/AppEnvironment/AtenderApp)、Core/Auth/* 全部、Core/Networking/* 全部、DesignSystem/* (Color+Atender.swift の `forRate` 追加を除く)、Enums.swift、AuthView、SettingsView、Today の `TodayViewModel`/`OccurrenceRow`、Timetable の `TimetableView`/`MeetingBlock`、`SemesterOverviewViewModel`。

> 補足: `SemesterOverviewViewModel` は decode 先 `SemesterOverviewDto` がリッチになるだけで public API (init/var/func) は不変。コード変更なし。`TimetableViewModel` は `load()` シグネチャ不変、内部 decode のみ変更。`TodayViewModel` の `setupRequired` (403 SETUP_REQUIRED) は DTO 形不変のため有効、変更なし。

---

## 3. データモデル (DTO 確定形 — Swift 型シグネチャ)

現行 zod (`packages/shared/src/schemas/`) と 1:1 対応。Optional 性・Int/Double を厳密に確定する (gotcha `design-doc-must-specify-swift-type-signatures` 順守)。

### 3.1 共通 nested 型 (新規)

`toDate` は CourseStatsDto と Overall で同形のため共通化する。

```swift
// mirror of toDate object in stats.ts CourseStatsDto / semester.ts SemesterOverviewDto.overall
struct AttendanceRateToDate: Codable, Equatable {
    let effectiveNumerator: Double      // z.number()
    let effectiveDenominator: Double    // z.number()
    let attendanceRate: Double?         // z.number().nullable() → 0..1 の分数 or nil
}
```

### 3.2 `CourseStatsDto` (修正後・確定形)

出典: `packages/shared/src/schemas/stats.ts CourseStatsDto`。`totalSessions` を**除去**し、末尾に 5 フィールド追加。

```swift
struct CourseStatsDto: Codable, Equatable, Identifiable {
    var id: String { courseId }
    let courseId: String                 // z.string()
    let courseName: String               // z.string()
    let teacher: String?                 // z.string().nullable()
    let generatedOccurrences: Int        // z.number().int()
    let counts: Counts
    let effectiveNumerator: Double        // z.number()
    let effectiveDenominator: Double      // z.number()
    let attendanceRate: Double?           // z.number().nullable() (全期間 = 楽観射影)
    let separateCounts: [String: Int]?    // z.record(...).optional()
    let toDate: AttendanceRateToDate      // 新: 今日まで実績
    let remainingCount: Int               // 新: z.number().int()
    let allowedAbsences: Int?             // 新: z.number().int().nullable()
    let maxDayPeriods: Int                // 新: z.number().int() (非 null、Meeting 無しは 0)
    let allowedAbsenceDays: Int?          // 新: z.number().int().nullable()

    struct Counts: Codable, Equatable {
        let present: Int
        let absent: Int
        let excused: Int
        let tardy: Int
        let earlyLeave: Int
        let cancelled: Int
        let suspended: Int
        let unrecorded: Int
    }
}
```

> ★ `totalSessions: Int` (旧 line 69) を**削除**。これが残ると現 stats.ts に同キーが無く、非 Optional decode が throw して SemesterOverview の courses が全滅する。

### 3.3 `SemesterOverviewDto` / `Overall` (修正後・確定形)

出典: `packages/shared/src/schemas/semester.ts SemesterOverviewDto`。トップに `today`/`requiredAttendanceRate`、`Overall` に `toDate`/`unrecordedCount`/`remainingCount`/`allowedAbsences` を追加。

```swift
struct SemesterOverviewDto: Codable, Equatable {
    let semesterId: String               // z.string()
    let semesterName: String             // z.string()
    let startDate: String                // YYYY-MM-DD 文字列
    let endDate: String                  // YYYY-MM-DD 文字列
    let today: String                    // 新: YYYY-MM-DD 文字列
    let requiredAttendanceRate: Int      // 新: z.number().int() (0..100 のパーセント整数)
    let overall: Overall
    let days: [AttendanceDaySummary]
    let courses: [CourseStatsDto]

    struct Overall: Codable, Equatable {
        let effectiveNumerator: Double    // z.number()
        let effectiveDenominator: Double  // z.number()
        let attendanceRate: Double?       // z.number().nullable() (全期間 = 楽観射影)
        let toDate: AttendanceRateToDate  // 新: 今日まで実績
        let unrecordedCount: Int          // 新: z.number().int()
        let remainingCount: Int           // 新: z.number().int()
        let allowedAbsences: Int?         // 新: z.number().int().nullable()
        // 注: overall には allowedAbsenceDays / maxDayPeriods は無い
        //     (date-input-and-allowed-days §「overall に日数は併記しない」)
    }
}
```

### 3.4 `MeResponse.User` (修正後・確定形)

出典: `packages/shared/src/schemas/me.ts MeResponseDto.user`。`requiredAttendanceRate` を追加。

```swift
struct MeResponse: Codable, Equatable {
    let user: User
    let setupStatus: SetupStatus

    struct User: Codable, Equatable {
        let id: String
        let email: String
        let name: String?
        let image: String?
        let handle: String?
        let inviteCode: String?
        let defaultSemesterId: String?
        let schoolId: String?
        let departmentId: String?
        let requiredAttendanceRate: Int   // 新: z.number().int() (0..100)
    }
}
```

`SetupStatus` は不変 (5 フラグのまま、setup-deadlock-fix で算出ロジックは変わったが DTO 形は同一)。

### 3.5 `CourseDto` (修正後・確定形)

出典: `packages/shared/src/schemas/template.ts CourseDto`。`totalSessions` を**除去**。

```swift
struct CourseDto: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let teacher: String?     // .nullable()
    let color: String?       // .nullable()
    let note: String?        // .nullable()
}
```

> ★ `totalSessions: Int` (旧 line 120) を**削除**。現 template.ts に同キーが無く、UserTimetable の courses decode が throw する。

### 3.6 `UserTimetableListResponse` (新規)

`GET /api/user-timetables` のエンベロープ。出典: `apps/api/src/routes/userTimetables.ts:61` (`c.json({ userTimetables: rows.map(userTimetableDto) })`)。

```swift
// mirror of GET /api/user-timetables response envelope
struct UserTimetableListResponse: Codable, Equatable {
    let userTimetables: [UserTimetableDto]
}
```

### 3.7 変更なしの型 (明示)

`AttendanceDaySummary`、`AttendanceDayStatus` enum、`DaySlotDto`、`MeetingDto`、`UserTimetableDto`、`OccurrenceDto`、`TodayResponse`、`MarkAttendanceInput`、`MarkAllPresentInput`、`MarkAllPresentResponse`、`ErrorResponse`、`AttendanceStatus` enum は現行のまま。

> 確認済: `GET /api/today` は `{ date, occurrences }` を**エンベロープ無し**で返す (`today.ts:18,31`)。`TodayResponse` の decode はそのまま有効、変更不要。

---

## 4. TimetableViewModel の decode 修正

`apps/ios/Atender/Features/Timetable/TimetableViewModel.swift:24` は現状エンベロープを剥がさず `[UserTimetableDto].self` を decode しようとして必ず失敗する (`GET /api/user-timetables` は `{ userTimetables: [...] }` を返す)。TimetableView は iOS-1 着手以来一度も成功していない。

### 修正仕様

`load()` 内の decode target を `[UserTimetableDto].self` → `UserTimetableListResponse.self` に変更し、`.userTimetables` を取り出す。後続の絞り込みロジック (defaultSemesterId 一致優先、無ければ createdAt desc 先頭) は不変。

```swift
func load() async {
    isLoading = true
    defer { isLoading = false }
    do {
        let response = try await apiClient.send(
            APIEndpoint(path: "/api/user-timetables", method: .get),
            as: UserTimetableListResponse.self
        )
        let timetables = response.userTimetables
        if let defaultSemesterId, let match = timetables.first(where: { $0.semesterId == defaultSemesterId }) {
            timetable = match
        } else {
            timetable = timetables.sorted { $0.createdAt > $1.createdAt }.first
        }
    } catch {
        alertMessage = error.userFacingMessage
    }
}
```

- public API (init / `timetable` / `isLoading` / `alertMessage` / `load()`) のシグネチャは不変。
- `timetable` は `UserTimetableDto?` のまま。空配列なら `nil` (既存挙動踏襲)。

---

## 5. SemesterOverviewView の UI/UX (新 read-only 表示)

`SemesterOverviewView.swift` の `content(_:)` を、web `SemesterOverview` / `AttendanceRateHero` / `CourseListItem` のトーンに合わせて再構成する。`SemesterOverviewViewModel` は変更しない (`overview: SemesterOverviewDto?` を読むだけ)。

### 5.0 数値スケールの確定 (重要)

- `attendanceRate` / `toDate.attendanceRate` は **0..1 の分数** (`numerator/denominator`)。表示は `pct = Int((rate * 100).rounded())`。`nil` のときは `"—"`。
- `requiredAttendanceRate` は **0..100 のパーセント整数**。`pct` と直接比較する (`pct >= requiredAttendanceRate` で達成)。
- 出席率の色は `pct` と `requiredAttendanceRate` を比較して決める (§5.1)。

### 5.1 色ヘルパー (Color+Atender.swift に追加)

web `attendanceRateColor.ts` の `rateColor` をミラー。

```swift
// mirror of apps/web/src/lib/attendanceRateColor.ts rateColor
static func forRate(pct: Int?, required: Int) -> Color {
    guard let pct else { return .textTertiary }   // データ無し
    return pct >= required ? .accent : .statusAbsent
}
```

> web は `required-10` の中間分岐があるが両分岐とも absent 色を返すため、iOS では 2 状態 (達成=accent / 未達=statusAbsent) に畳む。挙動同値。

### 5.2 画面レイアウト (ScrollView 縦積み)

```
┌─────────────────────────────────────────┐
│ [Hero カード — bgElevated, Radius.md]     │
│  semesterName               (atenderXl/bold)
│  期間 {startDate} 〜 {endDate}  (atenderSm/secondary)
│                                           │
│  今日までの出席率            (atenderSm/secondary/bold)
│  ┌ pct 数値 (atender5xl/black, forRate 色) ┐ XX/YY限 (atenderXs/tertiary)
│  [=========|====]  ← 進捗バー + 目標ライン  │
│  {あとN限休める...}    残り {remainingCount}限
│  全期間見込み {projectedPct}%  (atenderXs/tertiary)
│                                           │
│  ⚠ 未記録 {unrecordedCount} 件 — 記録して  ← unrecordedCount>0 のみ
└─────────────────────────────────────────┘

[ カレンダー LazyVGrid 7 列 ] ← 既存。今日セルを accent リング強調
                                (overview.today と day.date 一致時)

科目一覧                        (atenderLg/bold)
┌─ CourseRow ──────────────────────────────┐
│ ▏courseName   [⚠ unrecorded]      XX%(forRate)
│ [====|===] ← 進捗バー + 目標ライン          │
│ 出{present} 欠{absent} ・ {あとN限(M日)休める}
└──────────────────────────────────────────┘
  ... courses 分繰り返し
```

### 5.3 Hero カード (新規・`AttendanceRateHero` ミラー)

- 大きい数値 = `overall.toDate.attendanceRate` の pct。色 = `Color.forRate(pct: toDatePct, required: requiredAttendanceRate)`。
- 補助 = `"\(Int(overall.toDate.effectiveNumerator)) / \(Int(overall.toDate.effectiveDenominator))限"`。
  - effectiveNumerator/Denominator は Double だが整数値で来る (occurrence 実数)。表示は `clean` (§5.6) で小数は最大 1 桁。
- 進捗バー: 既存無しのため新規。`GeometryReader` 不要、`ZStack(alignment: .leading)` で背景 (bgMuted) + 前景バー (幅 = `pct` をクランプした割合、色 = forRate) + 目標ライン (幅 2pt の縦線、`requiredAttendanceRate%` 位置)。高さ 10pt、`Capsule()` でクリップ。
- アクション文言 (`overall.allowedAbsences` / `overall.remainingCount`): §5.5 の `overallActionText`。色は §5.5 の `actionColor`。
- 全期間見込み行: `"全期間見込み \(projectedPct)%"`。`projectedPct` = `overall.attendanceRate` の pct (nil なら `"—"`)。`atenderXs` / `textTertiary`。これが「今日まで率 (実績) vs 全期間率 (楽観射影) の併記」要件を満たす。
- 未記録警告行: `overall.unrecordedCount > 0` のときのみ表示。文言 `"未記録 \(unrecordedCount) 件 — 記録して"`、背景 statusTardy 15% 相当 (`Color.statusTardy.opacity(0.15)`)、文字 statusTardy、左 3pt の statusTardy ボーダー。iOS-1 では「カレンダーへ」ボタンは**置かない** (一括訂正・カレンダー遷移は iOS-2)。

### 5.4 カレンダー (既存維持 + 今日強調)

既存 `calendar(days:)` をそのまま使う。1 点だけ追加: `day.date == overview.today` のセルに accent の枠線 (`.overlay(RoundedRectangle(...).stroke(Color.accent, lineWidth: 1.5))`) を付与し「今日」を視認可能にする。それ以外 (status 色ドット・日付下 2 桁) は不変。

### 5.5 アクション文言ロジック (web ミラー)

overall 用 (`AttendanceRateHero.actionText/actionColor` ミラー):

```
overallActionText(allowedAbsences: Int?, remainingCount: Int, required: Int) -> String
  allowedAbsences == nil            → "データなし"
  allowedAbsences < 0               → "\(required)% を下回る見込み"
  allowedAbsences >= remainingCount → "残りを全部休んでも \(required)% を維持"
  else                              → "あと \(allowedAbsences)限 休める"
```

course 用 (`CourseListItem.shortActionText` ミラー):

```
courseActionText(allowedAbsences: Int?, remainingCount: Int, allowedAbsenceDays: Int?) -> String
  allowedAbsences == nil            → "—"
  allowedAbsences < 0               → "下回る見込み"
  allowedAbsences >= remainingCount → "残り全休OK"
  allowedAbsenceDays == nil         → "あと\(allowedAbsences)限休める"
  else                              → "あと\(allowedAbsences)限 (\(allowedAbsenceDays)日) 休める"
```

色 (両者共通、`actionColor`):

```
actionColor(allowedAbsences: Int?, remainingCount: Int) -> Color
  allowedAbsences == nil            → .textTertiary
  allowedAbsences < 0               → .statusAbsent
  allowedAbsences >= remainingCount → .accent
  else                              → .textPrimary (overall) / .textTertiary (course)
```

> `allowedAbsenceDays` の定義は server 確定 (`floor(allowedAbsences / maxDayPeriods)`、`allowedAbsences<0` or `maxDayPeriods==0` なら null)。iOS は server 値を表示するだけで再計算しない。

### 5.6 科目行 (`CourseListItem` ミラー)

- 大きい pct = `course.toDate.attendanceRate` の pct、色 = `forRate(pct:required:)`。
- 左に色バー (幅 1pt 相当): `forRate` 色の Capsule。
- 未記録バッジ: `course.counts.unrecorded > 0` のとき `"⚠ \(unrecorded)"` を statusTardy 系で。
- 進捗バー: hero と同形 (目標ライン付き)。前景バー幅 = `course.toDate.attendanceRate` の pct。
- 補助行: `"出\(counts.present) 欠\(counts.absent) ・ \(courseActionText(...))"`。
- 既存の `clean` 拡張 (Double → 整数 or 小数 1 桁) は維持し effectiveNumerator/Denominator 表示に流用可。

---

## 6. Today の setup 未完了文言 (line 62 置換)

`setup-deadlock-fix` で setup 完了条件は `schoolId && departmentId && defaultSemesterId` に統一され、時間割作成は web の正規フローへ移った。iOS-1 は時間割 CRUD を持たないため、当面 setup は web で行う。`TodayView.swift:62` の文言を、その現実に即した内容へ**置換**する (403 ハンドリング/`setupRequired` ロジック自体は不変)。

- 旧: `description: Text("Web で初期設定を完了してから再読み込みしてください。")`
- 新: `description: Text("学校・学科・学期・時間割の初期設定は現在 Web (atender.appily.run) で行います。設定後にこの画面を再読み込みしてください。")`

タイトル `"初期設定が必要です"` と systemImage は維持。導線ボタン (Safari 起動等) は iOS-1 では追加しない (文言のみ)。

---

## 7. テスト基盤

- フレームワーク: **XCTest** (`AtenderTests` ターゲット)。既存 `DTODecodingTests` は `Fixtures/*.json` を `JSONDecoder(keyDecodingStrategy: .useDefaultKeys)` で各 DTO にデコードして assert する方式 (実 API レスポンスサンプルが正典)。
- ネットワーク層は `URLProtocol` スタブ (`APIClientTests`)。本再同期では APIClient 自体は不変のため新規 APIClient テストは不要。

### 7.1 Fixtures 更新

**`semesterOverview.json`**: 各 course の `totalSessions` を削除。トップに `today`・`requiredAttendanceRate` を追加。`overall` に `toDate`・`unrecordedCount`・`remainingCount`・`allowedAbsences` を追加。各 course に `toDate`・`remainingCount`・`allowedAbsences`・`maxDayPeriods`・`allowedAbsenceDays` を追加。
- null 分岐網羅のため、courses[0] は `allowedAbsences` 正値 + `allowedAbsenceDays` 正値、courses[1] は `allowedAbsences: null` + `allowedAbsenceDays: null` (母数 0 ケース) を含める。`overall.allowedAbsences` も正値で 1 ケース。

**`userTimetable.json`**: 2 つの course から `totalSessions` を削除。

**`me.json`**: `user` に `requiredAttendanceRate: 80` を追加。

**`userTimetables.json`** (新規): `{ "userTimetables": [ <userTimetable.json と同形の 1 件> ] }`。エンベロープ decode 検証用。

### 7.2 DTODecodingTests 追加観点

- `testDecodeSemesterOverview`: 既存 assert に加え `dto.today`、`dto.requiredAttendanceRate == 80`、`dto.overall.toDate.attendanceRate`、`dto.overall.unrecordedCount`、`dto.overall.remainingCount`、`dto.overall.allowedAbsences`、courses[0] の `toDate`/`remainingCount`/`allowedAbsences`/`maxDayPeriods`/`allowedAbsenceDays`、courses[1] の `allowedAbsences == nil`/`allowedAbsenceDays == nil` を検証。
- `testDecodeMeResponse`: `res.user.requiredAttendanceRate == 80` を追加。
- `testDecodeUserTimetableList` (新規): `userTimetables.json` を `UserTimetableListResponse` にデコードし、`response.userTimetables.count == 1`、要素の `id`/`courses.count` を検証。
- 退行確認: `totalSessions` が DTO から消えたので、courses に同キーが**無い** fixture でも decode が throw しないこと (extra/欠落キー両対応) を `testDecodeUserTimetable` / `testDecodeSemesterOverview` の成功自体で担保。

### 7.3 挙動仕様 (Reviewer がテスト生成する根拠)

decode:
- `CourseStatsDto` を `totalSessions` キーの無い JSON でデコードしたとき、throw せず成功する。
- `CourseStatsDto.allowedAbsences` が JSON で `null` のとき `nil` にデコードされる。`allowedAbsenceDays` も同様。
- `SemesterOverviewDto` を `today`/`requiredAttendanceRate`/`overall.toDate`/`overall.unrecordedCount`/`overall.remainingCount`/`overall.allowedAbsences` を含む JSON でデコードしたとき、全フィールドが正しく入る。
- `MeResponse.User` を `requiredAttendanceRate` 含む JSON でデコードしたとき値が入る。
- `UserTimetableListResponse` を `{ "userTimetables": [...] }` でデコードしたとき配列が取れる。素の配列 JSON は対象外 (API はエンベロープを返すため)。
- `CourseDto` を `totalSessions` キーの無い JSON でデコードしたとき throw しない。

表示 (純粋関数として ViewModel/View から切り出し可能なら Reviewer がユニットテスト化):
- `pct(rate:)`: `rate == nil` → `nil` 表示は `"—"`。`rate == 0.95` → `95`。`rate == 0.888...` → `89` (四捨五入)。
- `Color.forRate(pct:required:)`: `pct == nil` → `.textTertiary`。`pct=80, required=80` → `.accent` (>= で達成)。`pct=79, required=80` → `.statusAbsent`。
- `overallActionText`: `allowedAbsences=nil` → `"データなし"`。`allowedAbsences=-1, required=80` → `"80% を下回る見込み"`。`allowedAbsences=5, remainingCount=5` → `"残りを全部休んでも 80% を維持"`。`allowedAbsences=2, remainingCount=10` → `"あと 2限 休める"`。
- `courseActionText`: `allowedAbsences=nil` → `"—"`。`allowedAbsences=-1` → `"下回る見込み"`。`allowedAbsences=5, remainingCount=5` → `"残り全休OK"`。`allowedAbsences=4, allowedAbsenceDays=nil` → `"あと4限休める"`。`allowedAbsences=4, allowedAbsenceDays=2` → `"あと4限 (2日) 休める"`。
- `actionColor`: `allowedAbsences=nil` → `.textTertiary`。`<0` → `.statusAbsent`。`>= remainingCount` → `.accent`。
- 未記録行: `overall.unrecordedCount == 0` のとき hero に未記録行を描画しない。`> 0` のとき文言に件数を含めて描画する。
- カレンダー: `day.date == overview.today` のセルにのみ accent 枠線を描く。

> 表示ロジック (`pct` / `forRate` / `overallActionText` / `courseActionText` / `actionColor`) は SwiftUI View に埋め込むと XCTest から検証しづらい。Reviewer 独立検証のため、これらは `SemesterOverviewView` の `private` メソッドでなく **`internal` な純粋関数 / `static func`** として切り出し、`@testable import Atender` で直接呼べる形にすること (gotcha `swiftui-final-mainactor-store-not-mockable-in-xctest` の教訓: テスト可能な純粋ロジックを View から分離)。

### 7.4 simulator 実機確認 (再同期成功の判定観点)

`xcodebuild ... -scheme Atender -destination 'platform=iOS Simulator,name=iPhone 16' build test` でビルド + ユニット green を確認後、シミュレータ手動で:

1. **SemesterOverview (Timetable タブ → push)**: 画面が ProgressView で止まらず描画される (= courses decode 成功)。Hero に今日まで率の大数値・目標ライン・「あとN限休める」・全期間見込み・(未記録あれば) 警告行が出る。科目一覧が出席率付きで並ぶ。→ これが出れば即死バグ修正成功。
2. **Timetable タブ**: 時間割グリッドが描画される (= エンベロープ decode 修正成功)。iOS-1 以来初めて表示されるはず。空表示 (ProgressView 固着や「エラー」alert) でないこと。
3. **Today タブ**: 従来通り授業コマ・出席ループが動く (退行が無いこと)。setup 未完了アカウントなら新文言が出る。
4. **Settings タブ**: 退行が無いこと (変更していないが念のため)。

---

## 8. UI/UX 状態管理 (どこに何の state が乗るか)

- `SemesterOverviewViewModel.overview: SemesterOverviewDto?` — 唯一の画面データソース。View は派生表示のみ、追加 state を持たない (selection mode 等は iOS-2)。
- `TimetableViewModel.timetable: UserTimetableDto?` — 同上。
- 新フィールドは全て `overview` 内に内包され、View が読むだけ。`@State` 追加は無し。
- 再描画は `@Observable` の自動追跡で発生 (既存方針踏襲)。

---

## 9. 不採用案 / スコープ外 (iOS-2 送り)

本再同期は「decode を通し、6/11 再設計の read-only 表示を反映する」最小差分に限る。以下は **iOS-2 で別設計**とし本 doc では扱わない:

- **複数日一括訂正** (`POST /api/attendance/bulk`, `/bulk-clear`): 選択モード・BulkActionBar・BulkEditSheet 相当の編集 UI が必要で、出席ループの読み取り再同期とは独立した機能。read-only 再同期の検証を先に固める。
- **カレンダー (月/週/日 view)**: SemesterOverview の簡易日グリッドは維持するが、`AttendanceCalendar` 相当の本格カレンダー・日詳細シート (`DayDetailSheet`) は別物。未記録行の「カレンダーへ」導線もこれに依存するため iOS-2 に送る。
- **科目 / 授業 CRUD・休講・個人イベント**: 編集系は土台 (sheet/Form コンポーネント群) の新規投資が必要。read-only 完成後に着手。
- **5 タブ再編**: 現 3 タブ (Today/Timetable/Settings) を維持。タブ再編は CRUD・ルーム・友達が乗る iOS-2 でまとめて行う (foundation §6.2 の拡張余地に従う)。

理由の共通項: いずれも**新規の編集フロー or 新画面**であり、「web の確定挙動をミラーするだけ」という本再同期の性質を超える。先に decode 健全化 + read-only 表示を main に通し、編集系は独立 PR で積む方が検証境界が明確。

---

## 10. foundation doc との関係 (矛盾しないことの確認)

- 本 doc は `20260608-ios-foundation.md` を**上書きしない**。§4 (データモデル) の DTO は foundation の「手動ミラー方針」をそのまま踏襲し、6/11 以降の shared zod 差分を当てるだけ。
- foundation §7 Phase iOS-1 のスコープ (読み取り + 出席ループ) は不変。本 doc はその実装を現行 API に追従させる保守差分。
- `ModelSync.md` (foundation §4.1) の最終同期日と対象 schema を本再同期後に更新すること (実装者タスク、`CourseStatsDto`/`SemesterOverviewDto`/`CourseDto`/`MeResponseDto` を 2026-06-26 同期と記録)。
