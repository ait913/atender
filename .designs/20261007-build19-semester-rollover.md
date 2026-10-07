# atender build 19 — 新学期のコマ設定引継ぎ / 学期終了の提案 / 「＋ 科目を追加」が開かないバグ

> 対象: `apps/ios` (F1 / F2 / F3) + `apps/api` / `packages/shared` (F1 の additive 1 フィールドのみ)
> 前提 main: build 18 出荷状態 (`CFBundleVersion: "18"`、iOS ユニット **676 / 0 fail**、API Vitest = 台帳 `.knowledge/known-failures.md` の既知 16 + `class-transfers` 28 GREEN)
> 版数: `project.yml` の `CFBundleVersion` を **"19"** に。API 変更は optional フィールド追加のみなので **`MIN_IOS_BUILD` は 12 のまま** (§8.5)
> デザイン正典: `DESIGN.md` (本 doc で置換が要る記述は無い。§9)

---

## 0. スコープ

| | 触る | 触らない |
|---|---|---|
| iOS (F1) | `SelfTimetableViewModel` (`emptyTimetable` / `ensureTimetable` / `display` + 新 `refreshSemestersIfUnknown`)、`SelfTimetableView` (`.task(id: semesterId)`)、新規 `TimetableCarryOver.swift`、`UserTimetableCreateInput.daysOfWeek` | `TimetableSettingsSheet` (作成後の編集はそのまま)、ルームの `RoomLogic.defaultSlots` (`RoomLogic.swift:151`、別物) |
| iOS (F2) | `HomeView` (alert / 提案の評価 / `HomeSheet.semesterCreate`)、新規 `SemesterRollover.swift`、新規 `SemesterCreateSheet.swift`、新規 `DateStringField` (既存 2 箇所の private `dateField` を置換)、`AppEnvironment` の DEBUG フック 1 行 | `SemesterListSheet` (設定タブの学期管理は不変)、`SemesterOverviewView` の既定学期決定 (不変。§4.6)、`SetupFlowView` |
| iOS (F3) | `MeetingSheets.swift` の `MeetingEditModal.body` (2 枚目シートの置き場所)、`TimetableGridPhaseB.swift` (a11y identifier 2 つ。検証フック) | `BottomSheet` 本体、`CourseEditModal` 本体、`stackLevel` 引数 (§5.3) |
| API (F1) | `packages/shared/src/schemas/userTimetable.ts` (`UserTimetableCreateInput.daysOfWeek` optional)、`apps/api/src/routes/userTimetables.ts` (create が `daysOfWeek` を保存)、`apps/api/scripts/seed-demo-user.ts` (検証用データ 2 点) | `POST /api/semesters` (既定学期の設定規則は不変)、`PATCH /api/me`、Prisma schema (migration **無し**) |
| Web | — | `apps/web/src/components/home/SelfTimetableView.tsx:14-20` の 5 コマ固定 (Web にも同じ欠陥があるが本 doc のスコープ外。§12「今後」) |

**用語**:
- **引継ぎ元 (carry-over source)**: 新学期の時間割を初めて表示・作成するときにコマ設定 (`daySlots`) と表示曜日 (`daysOfWeek`) を写す元の `UserTimetable`。科目・授業は写さない
- **最新学期 (latest)**: `startDate` が最大の学期 (同率は `endDate` 降順 → `id` 昇順)
- **終了した学期**: `endDate < today` (`today` = `SchoolClock.todayString()`、JST、`yyyy-MM-dd` の文字列比較)

---

## 1. 目的

1. 新学期の時間割が 5 コマ既定に戻らず、直前の学期で使っていたコマ設定 (例: 8 コマ) と表示曜日をそのまま引き継ぐ
2. 最新学期が終了した後にホームを開いたら「前回の学期が終了しました」と標準 alert で提案し、作成 → 時間割登録まで途切れずに進める (iOS 先行機能。Web に同等導線は無い)
3. 新学期の空セル → 「授業を追加」→「＋ 科目を追加」で科目追加シートが開かないバグを直す (兄弟 `.sheet` の既知の形)

---

## 2. 現状の実測 (設計の根拠。すべて build 18 の main で確認)

| 事実 | 場所 |
|---|---|
| `defaultSlots` は 5 コマ固定の定数。`emptyTimetable` (未作成時の表示) と `ensureTimetable` (最初のセルタップで `POST /api/user-timetables`) がそれを直接使い、`daysOfWeek` は `[1,2,3,4,5]` 固定 | `Features/Home/SelfTimetableView.swift:17-23, 45-61, 67-87` |
| `display` は `selected ?? createdTimetable ?? emptyTimetable`。`createdTimetable` は学期を見ないので、時間割を作った直後に別の未作成学期へ切り替えると前の学期の時間割が表示される (潜在バグ、F1 で併せて直す) | `SelfTimetableView.swift:63-65` |
| VM は `GET /api/user-timetables` を**全学期分** (daySlots 込み、createdAt desc) 持っている。`semesters` も持つ | `SelfTimetableView.swift:25-35`、`routes/userTimetables.ts:58-62` |
| `UserTimetableCreateInput` (iOS / zod) に `daysOfWeek` が無い。zod は `TemplateCreateInput.omit(...).extend({ semesterId })`。`daySlots` は `.min(1)` | `Core/Models/DTOs.swift:385-394`、`packages/shared/src/schemas/userTimetable.ts:23-29`、`template.ts:64` |
| 作成 route は `daysOfWeek` を書かず Prisma 既定 `"1,2,3,4,5"`。PATCH だけが CSV 正規化 (`[...new Set(a)].sort().join(",")`) を持つ | `routes/userTimetables.ts:34, 85-88`、`prisma/schema.prisma:263` |
| 「現在の学期」の日付判定は API にも iOS にも無い。Home は `me.user.defaultSemesterId` → 無ければ `semesters.first` (startDate desc の先頭) | `Features/Home/HomeCore.swift:132-144, 190-200`、`routes/semesters.ts:22-26` |
| `POST /api/semesters` は `UserTimetable` を 1 つも持たないユーザーだけ `defaultSemesterId` を更新する。既定学期の変更手段は `PATCH /api/me { defaultSemesterId }` (iOS: `MeRepository.updateMe`、先例 `SemesterListSheet.selectDefault` / `SetupViewModel.submitSemester`) | `routes/semesters.ts:42-45`、`routes/me.ts:119-131`、`Core/Data/MeRepository.swift:21-26`、`Features/Settings/SemesterListSheet.swift:135-144`、`Features/Setup/SetupFlowView.swift:257-271` |
| `isSetupComplete` は school / department / defaultSemesterId だけを見る (**時間割の有無を見ない**) → 既定学期を時間割未作成の新学期に切り替えても `RootView` が `SetupFlowView` に落ちない | `apps/api/src/lib/setupStatus.ts`、`App/RootView.swift:19-24` |
| `HomeView` のシートは `.sheet(item: $sheet)` 1 個 (`HomeSheet` enum) + `fullScreenCover` 1 個。`.alert` は無い。`scenePhase` 監視はアプリ全体で 0 箇所 | `HomeCore.swift:31-43, 118-129` |
| 「一度だけ提案 / 却下記憶」の先例は `CalendarSyncCoordinator.promptDismissed` (UserDefaults、キーは `atender.eventkit.*`) | `Core/Sync/CalendarSyncCoordinator.swift:46-48, 364` |
| `SchoolClock.todayString()` は端末 TZ に依らず JST の `yyyy-MM-dd`。`CalendarRange` は UTC 固定の暦で `addDays` / `addMonths` / `parse` / `yyyyMMdd` / `format` を持つ | `Core/Timetable/SchoolClock.swift:21-27`、`Core/Timetable/TimetableLogic.swift:202-270` |
| **F3 の原因**: `MeetingEditModal.body` が `ZStack { BottomSheet(…1 枚目…) ; CourseEditModal(…) }`。`BottomSheet` は `Color.clear.frame(0,0).sheet(isPresented:)` の自己提示型で、`CourseEditModal` も中で `BottomSheet` を作る → **2 枚目の `.sheet` が 1 枚目の外側の兄弟**に居る。1 枚目提示中に兄弟の `.sheet` は提示できない (`gotcha/swiftui-multiple-sibling-sheets-only-one-fires.md` と同形) | `Features/Timetable/MeetingSheets.swift:26-28, 113-118`、`Core/DesignSystem/Components/BottomSheet.swift:29-37`、`Features/Course/CourseEditModal.swift:20` |
| 正しい形の先例: `DayDetailSheet` は BottomSheet の**中身**として描かれ、その中身の `.background { sheetHost }` に 2 枚目の `BottomSheet(stackLevel: 2)` を置いている (個人予定の追加 / 編集シートとして build 16 から出荷・使用中。build 18 の授業変更シートも同じ経路) | `Features/SemesterOverview/DayDetailSheet.swift:41, 61-97` |
| `stackLevel` は `BottomSheet` が受け取って保持するだけで**どこも読まない** (参照 0) | `BottomSheet.swift:8, 132, 154` |
| `EmptyCell` / `PeriodLabelCell` に a11y identifier は無い。`PeriodLabelCell` は `slot.label` でなく `"\(slot.periodIndex)"` を描く | `Features/Timetable/TimetableGridPhaseB.swift:60-72, 224-258` |
| seed は学期 1 件 (今日中央 ±42 日) + 4 コマ (1〜4限) + 科目 4。時間割未作成の学期は無い | `apps/api/scripts/seed-demo-user.ts:30-61` |
| `AppEnvironment.init` の `#if DEBUG` が `ATENDER_UI_TEST_BEARER_TOKEN` を読む (UI テスト用フックの置き場) | `App/AppEnvironment.swift:31-36` |
| 版数 `CFBundleVersion: "18"`、`MIN_IOS_BUILD = 12`。"18" を assert するテストは `BuildVersionTests` / `B17BuildVersionTests` / `B18HomeAndVersionTests` の 3 ファイル | `apps/ios/project.yml:49`、`apps/api/src/lib/clientVersion.ts:15`、§11.1 |

---

## 3. F1 — 新学期へのコマ設定引継ぎ (iOS クライアント側で決定)

### 3.1 「直前の学期」の定義 (一意)

対象学期 `target` に対し、

1. 候補 = `semesters` のうち `startDate < target.startDate` (文字列比較) **かつ** `timetables` にその `semesterId` の `UserTimetable` が存在する学期
2. 候補を `startDate` 降順 → `endDate` 降順 → `id` 昇順で並べた先頭の `UserTimetable` が**引継ぎ元**
3. 候補が無ければ引継ぎ元 **nil** → 既存の `defaultSlots` (5 コマ) と `[1,2,3,4,5]`

`UserTimetable` を持たない学期は候補に入らない (飛ばして、さらに前の学期を見る)。`target` 自身が `semesters` に無い (学期一覧が未取得) ときも nil。`startDate` が同じ学期は候補にならない (`<` は厳密)。

### 3.2 引継ぐもの / 引継がないもの

| | 引継ぐ | 根拠 |
|---|---|---|
| `daySlots` (periodIndex / label / startMinute / endMinute / isBreak) | **全件そのまま** | 要望 1 |
| `daysOfWeek` | **そのまま** (空なら `[1,2,3,4,5]`) | 表示曜日もコマ設定の一部 (土曜授業の学科で毎学期足し直すのを避ける) |
| 引継ぎ元の `daySlots` が空 (PATCH で全削除された時間割) | 引継がず `defaultSlots` | `POST` は `daySlots.min(1)` なので空を送ると 400 になる |
| `title` / `courses` / `meetings` / `sourceTemplateId` | 引継がない | Leader 裁定 (コマ設定のみ)。`title` は従来どおり `"自分の時間割"` |

### 3.3 VM の変更 (`SelfTimetableViewModel`)

- `emptyTimetable(semesterId:)` — `daySlots` / `daysOfWeek` を `carryOverSource` から導く (他は不変。`id: ""`、`title: "自分の時間割"`)
- `ensureTimetable(semesterId:)` — `POST` の body に引継ぎ `daySlots` と **`daysOfWeek`** を入れる。`createdTimetable` は `semesterId` が一致するときだけ返す
- `display(semesterId:)` — `selected ?? (createdTimetable が同じ学期なら createdTimetable) ?? emptyTimetable`
- 新規 `refreshSemestersIfUnknown(semesterId:)` — 渡された id が `semesters` に無ければ `semesterRepository.semesters()` だけ取り直す (`isLoading` は触らない = スケルトンを出さない)。F2 で作った直後の学期は VM の `semesters` に無く、引継ぎ元が決まらないため
- `SelfTimetableView` に `.task(id: semesterId) { await viewModel?.refreshSemestersIfUnknown(semesterId: semesterId) }` を足す

### 3.4 API (additive)

```ts
// packages/shared/src/schemas/userTimetable.ts
export const UserTimetableCreateInput = TemplateCreateInput.omit({ schoolId: true, departmentId: true, isPublic: true })
  .extend({ semesterId: z.string(), daysOfWeek: DaysOfWeek.optional() });   // ← 追加。DaysOfWeek は同ファイルの既存定数 (1..7, min 1, 重複不可)

// apps/api/src/routes/userTimetables.ts
function daysOfWeekCsv(days: number[]): string { return [...new Set(days)].sort((a, b) => a - b).join(","); }  // PATCH の :86 と共用に切り出す
// createTimetableFromInput: tx.userTimetable.create({ data: { userId, semesterId, title, ...(input.daysOfWeek ? { daysOfWeek: daysOfWeekCsv(input.daysOfWeek) } : {}) } })
```

省略時は Prisma 既定 `"1,2,3,4,5"` (従来どおり)。Web の `UserTimetableCreateInput` 型は optional が増えるだけで型チェック不変。

---

## 4. F2 — 学期終了の提案 (iOS 先行機能)

### 4.1 提案の条件 (全部 AND)

1. `semesters` が 1 件以上
2. **全学期**が終了している (`∀ s: s.endDate < today`)
3. 最新学期 (§0 用語) の `id` が UserDefaults の却下記憶と**一致しない**
4. ホームタブが選択中 (`appRouter.selectedTab == .home`)、`sheet == nil`、`scannerPresented == false`、alert 未表示

評価タイミング (3 箇所。すべて同じ `evaluateRolloverPrompt()` を呼ぶ):

| 契機 | 実装 |
|---|---|
| ホーム表示時 (起動 + 学期読込後) | `HomeView` の `.task` 本体を `bootstrap()` に切り出し、両分岐 (me キャッシュあり / なし) の**末尾**で呼ぶ |
| フォアグラウンド復帰 | `@Environment(\.scenePhase)` + `.onChange(of: scenePhase) { _, new in if new == .active { evaluateRolloverPrompt() } }`。アプリが数日 suspend されたまま日付をまたぐケース (「9/30 まで開いたままで 10/1 に戻る」) は `.task` では拾えない |
| ホームタブに戻った | `.onChange(of: environment.appRouter.selectedTab) { _, new in if new == .home { evaluateRolloverPrompt() } }`。他タブで `.alert` を出すと非表示 VC からの提示になり黙って失敗するため、条件 4 と対で置く |

学期一覧の再取得はしない (`semesters` state をそのまま判定に使う。`.task` で読んだ値 + F2 の作成後 `force: true` 再読込)。

### 4.2 alert (標準部品。自前バナー禁止)

```swift
.alert("前回の学期が終了しました", isPresented: rolloverAlertBinding, presenting: rolloverPrompt) { previous in
    Button("作成する") { sheet = .semesterCreate(SemesterRollover.proposal(after: previous, today: SchoolClock.todayString())) }
        .keyboardShortcut(.defaultAction)
    Button("あとで", role: .cancel) { rolloverStore.dismissedSemesterId = previous.id }
} message: { previous in
    Text(SemesterRollover.alertMessage(previous: previous))   // "「2026 前期」は 2026年 9月30日 に終了しました。新しい学期を作成しますか?"
}
// rolloverAlertBinding = Binding(get: { rolloverPrompt != nil }, set: { if !$0 { rolloverPrompt = nil } })
```

- 「あとで」= **その最新学期 id について恒久的に出さない** (`atender.semesterRollover.dismissedSemesterId` に id を保存)。別の学期が最新になれば再び出る
- 「作成する」は却下を記憶しない。シートを閉じて作らなかった場合は次回の契機で再び出る
- alert は `HomeView` の最上位 `VStack` に付ける (既存 `.sheet(item:)` / `.fullScreenCover` と同じ場所。種類が違うので共存可)

### 4.3 学期作成シート (`SemesterCreateSheet`、新規。軽量シート案を採用)

```
   新しい学期                                    ✕      ← SheetScaffold (RoomCreateSheet と同じ chrome)
学期名   [ 2026 後期                ]                   ← LabeledInput
開始日   [ 2026/10/01 ▾ ]                              ← DateStringField (.compact)
終了日   [ 2027/03/31 ▾ ]
時限と表示曜日は前の学期から引き継がれます              ← Text .atenderSm textSecondary (F1 の告知。入力ではない)
                      [ キャンセル ]  [ 学期を作成 ]      ← footer。AtenderButton ghost / primary
```

- `HomeSheet` に `case semesterCreate(SemesterProposal)` (`id == "semester-create"`) を足し、既存の `.sheet(item: $sheet)` に乗せる (兄弟 `.sheet` を増やさない)
- 既定値 = `SemesterRollover.proposal(after:today:)` (§4.4)。3 欄とも編集可
- 「学期を作成」の有効条件 = `SemesterRollover.canCreate(name:startDate:endDate:)` (trim 後の名前が非空 かつ `startDate <= endDate`) かつ `!isPending`
- 送信手順:
  1. `semesterRepository.createSemester(SemesterCreateInput(name: trimmed, startDate:, endDate:))` — 失敗 → `toastCenter.show("保存できませんでした")`、シートは開いたまま、以降は行わない
  2. `meRepository.updateMe(MeUpdateInput(defaultSemesterId: created.id))` — 失敗 → `toastCenter.show("既定の学期を更新できませんでした。設定の学期管理から選べます")` し、**続行** (学期は出来ているので作業は進められる。次回起動は旧既定学期が開くが、新学期は終了していないので alert は出ない = 学期メニューで切り替える)
  3. `await onCreated(created)` → `isPresented = false`
- `onCreated` (HomeView 側): `semesters` を `force: true` で再読込 → `semesterId = created.id` → `didApplyDefaultSemester = true`。`HomeBody` → `SelfTimetableView` が新学期で描き直され、`.task(id: semesterId)` → `refreshSemestersIfUnknown` → `emptyTimetable` が引継ぎコマで出る → 空セルタップで `ensureTimetable` → `MeetingEditModal` (F3 で科目追加まで通る)
- a11y: 中身の `VStack` に `.accessibilityIdentifier("semester-create-sheet")`。内側の欄には identifier を付けない (外側が内側を潰す `gotcha/swiftui-outer-accessibility-identifier-shadows-inner-hook.md`。テストはラベル `学期名` / `学期を作成` / `キャンセル` で掴む)
- `DateStringField(label:date:)` を `Core/DesignSystem/Components/DateStringField.swift` に新設し、`SemesterListSheet.dateField` (`:109-123`) と `SetupFlowView.setupDateField` (`:146-159`) の private 複製 2 つを**これに置換**する (本体は `SemesterListSheet` 版と同一。3 つ目の複製を作らない)

### 4.4 提案の既定値 (`SemesterRollover.proposal(after previous: SemesterDto, today: String) -> SemesterProposal`)

```
start = addDays(previous.endDate, 1)
end   = addDays(addMonths(start, 6), -1)
if end < today {                       // 前学期の終了からだいぶ経っている (半年以上放置)
    start = monthFirst(today)          // 今月 1 日
    end   = addDays(addMonths(start, 6), -1)
}
name  = "\(year(start)) \(month(start) ∈ 4...9 ? "前期" : "後期")"
```

`addDays` / `addMonths` / `monthFirst` は既存 `CalendarRange` (UTC 暦の `yyyy-MM-dd` 演算。日付文字列しか扱わないので TZ の影響なし)。`year` / `month` は `start.prefix(4)` / `start[5..<7]` の Int。前学期の名前は読まない (命名規則を推測しない。入力欄で直せる)。

### 4.5 UserDefaults (`SemesterRolloverStore`)

```swift
struct SemesterRolloverStore {
    static let key = "atender.semesterRollover.dismissedSemesterId"
    var defaults: UserDefaults = .standard
    var dismissedSemesterId: String? {
        get { defaults.string(forKey: Self.key) }
        set { if let newValue { defaults.set(newValue, forKey: Self.key) } else { defaults.removeObject(forKey: Self.key) } }
    }
}
```

DEBUG フック (UI テスト用、`AppEnvironment.init` の既存 `#if DEBUG` ブロックに 1 行): `ProcessInfo.processInfo.environment["ATENDER_UI_TEST_RESET_ROLLOVER"] == "1"` なら `SemesterRolloverStore().dismissedSemesterId = nil`。

### 4.6 触らない既存挙動 (明示)

- `SemesterOverviewView` (学期・科目タブ) は既定学期を初回だけ適用する (`didApplyDefault`、`:168-175`)。F2 で学期を作っても、既に開いていた学期タブは旧学期のまま (メニューで切替)。設定タブの `SemesterListSheet` で既定を変えたときと同じ挙動で、本 doc では変えない
- `SemesterListSheet.createSemester` は既定学期を更新しない (従来どおり)
- `POST /api/semesters` の既定学期規則 (時間割 0 件のユーザーのみ) は不変

---

## 5. F3 — 「＋ 科目を追加」が開かない

### 5.1 変更 (`MeetingEditModal.body`)

外側の `ZStack` を外し、`CourseEditModal` を **1 枚目の `BottomSheet` の content の `.background` に移す** (`DayDetailSheet:41` と同じ形):

```swift
var body: some View {
    BottomSheet(title: mode == .create ? "授業を追加" : "授業を編集", isPresented: $isPresented) {
        VStack(alignment: .leading, spacing: Space.s4) { /* 不変 */ }
            .onAppear { initialize() }                                   // 不変
            .onChange(of: isPresented) { _, open in if open { initialize() } }
            .onChange(of: periods) { enforcePeriodRule(previous: $0, next: $1) }
            .background {                                                // ★ 2 枚目は 1 枚目の内側
                CourseEditModal(isPresented: $courseModalOpen, timetableId: timetable.id, stackLevel: 2) { course in
                    createdCourses.removeAll { $0.id == course.id }
                    createdCourses.append(course)
                    courseId = course.id
                }
            }
    } footer: { /* 不変 */ }
}
```

`CourseEditModal` は `BottomSheet` = `Color.clear.frame(0,0).sheet(...)` なので `.background` でサイズ 0。`.sheet` が提示中のシート階層の内側に付くため、1 枚目の上に 2 枚目が重なる (iOS 標準の sheet-over-sheet)。保存後の `onSaved` → `createdCourses` / `courseId` 更新 → `allCourses` の Menu ラベルが新科目名になる (既存コード不変)。

### 5.2 なぜ `.background` か (`activeSheet` enum 集約を採らない理由)

`MeetingEditModal` が持つシートは常に「自分 (1 枚目) + 科目追加 (2 枚目、1 枚目の上)」の**重ね**で、`DayDetailSheet` と同じ「中身からもう 1 枚出す」形。`activeSheet` enum は「同じ階層で**切り替える**」ための形 (`SelfTimetableView.activeSheetView`) であり、ここでは 1 枚目を閉じずに 2 枚目を出したいので合わない。

### 5.3 `stackLevel`

**無視 (据え置き)**。`BottomSheet` は値を読んでいない (参照 0) ので挙動に影響しない。呼び出し 9 箇所を消す作業は本 MVP に不要で、`DayDetailSheet` の `stackLevel: 2` と同じ値を渡して「2 枚目」の意図だけ残す。削除は別 chore。

### 5.4 検証フック (`TimetableGridPhaseB.swift`)

- `EmptyCell` のインスタンスに `.accessibilityIdentifier("timetable-cell-\(day)-\(period)")` (`day` = 表示曜日 1=月…7=日、`period` = periodIndex) — `TimetableGrid.background` の `ForEach` 内 (`:66-71`) で付ける
- `PeriodLabelCell` のインスタンスに `.accessibilityIdentifier("timetable-period-\(period)")` (`:61-63`)
- `TimetableGrid` 〜 `HomeView` の経路に外側の identifier は無い (grep 済: `HomeCore.swift` は `context-chips` / `home-semester-menu` / `home-room-settings` / `rooms-add` だけで、いずれも兄弟) ので潰れない

---

## 6. データモデル

### 6.1 Swift

```swift
// Core/Models/DTOs.swift — 既存 struct の末尾に追加 (memberwise init の既存呼び出し 2 箇所は無変更でコンパイル可)
struct UserTimetableCreateInput: Codable, Equatable {
    let semesterId: String
    let title: String
    var description: String?
    var year: Int?
    var term: String?
    var daySlots: [TemplateCreateInput.DaySlotCreateInput]
    var courses: [TemplateCreateInput.CourseTemplateInput]
    var meetings: [TemplateCreateInput.MeetingTemplateInput]
    var daysOfWeek: [Int]? = nil                 // ← 追加。nil なら JSON に出ない (JSONEncoder は Optional nil を省略)
}

// Features/Home/SemesterRollover.swift
struct SemesterProposal: Equatable {
    let name: String
    let startDate: String        // yyyy-MM-dd
    let endDate: String
}

// Features/Home/HomeCore.swift
enum HomeSheet: Identifiable, Equatable {
    case roomCreate
    case roomJoin(initialCode: String?)
    case roomSettings(roomId: String)
    case semesterCreate(SemesterProposal)       // ← 追加。id == "semester-create"
}
```

### 6.2 zod (`packages/shared`)

§3.4 のとおり `UserTimetableCreateInput` に `daysOfWeek: DaysOfWeek.optional()`。DTO の出力形 (`UserTimetableDto.daysOfWeek: number[]`) は不変。

### 6.3 永続化

- UserDefaults: `atender.semesterRollover.dismissedSemesterId: String?` (§4.5)
- DB: 変更なし (migration 無し)

---

## 7. API / 関数シグネチャ

### 7.1 F1 — 純関数 (`Features/Home/TimetableCarryOver.swift`)

```swift
enum TimetableCarryOver {
    static let defaultDaysOfWeek: [Int] = [1, 2, 3, 4, 5]

    /// §3.1 の定義。候補が無ければ nil
    static func previousTimetable(target: SemesterDto, semesters: [SemesterDto], timetables: [UserTimetableDto]) -> UserTimetableDto?

    /// previous が nil または daySlots が空なら fallback。それ以外は previous.daySlots をそのまま
    static func inheritedSlots(from previous: UserTimetableDto?, fallback: [DaySlotDto]) -> [DaySlotDto]

    /// previous が nil または daysOfWeek が空なら defaultDaysOfWeek。それ以外は previous.daysOfWeek をそのまま
    static func inheritedDaysOfWeek(from previous: UserTimetableDto?) -> [Int]
}
```

### 7.2 F1 — VM (`SelfTimetableViewModel`、既存 + 追加)

```swift
let defaultSlots: [DaySlotDto]                                         // 不変 (5 コマ)
func emptyTimetable(semesterId: String?) -> UserTimetableDto?          // daySlots / daysOfWeek が引継ぎ結果に
func display(semesterId: String?) -> UserTimetableDto?                 // createdTimetable は同じ学期のときだけ
func ensureTimetable(semesterId: String?) async -> UserTimetableDto?   // body に引継ぎ daySlots + daysOfWeek
func refreshSemestersIfUnknown(semesterId: String?) async              // 新規 (§3.3)
private func resolvedSemesterId(_ semesterId: String?) -> String?      // semesterId ?? me?.user.defaultSemesterId ?? semesters.first?.id (既存ロジックの名前付け)
private func carryOverSource(for semesterId: String) -> UserTimetableDto?   // semesters から target を引き、TimetableCarryOver.previousTimetable
```

### 7.3 F2 — 純関数 / ストア (`Features/Home/SemesterRollover.swift`)

```swift
enum SemesterRollover {
    /// startDate 降順 → endDate 降順 → id 昇順の先頭。空なら nil
    static func latest(_ semesters: [SemesterDto]) -> SemesterDto?
    /// semesters 非空 かつ 全 endDate < today
    static func allEnded(_ semesters: [SemesterDto], today: String) -> Bool
    /// 提案を出すなら根拠学期 (= latest)、出さないなら nil (§4.1 の条件 1-3)
    static func promptTarget(semesters: [SemesterDto], today: String, dismissedSemesterId: String?) -> SemesterDto?
    /// §4.4
    static func proposal(after previous: SemesterDto, today: String) -> SemesterProposal
    /// "「\(previous.name)」は \(CalendarRange.format(previous.endDate, .yearMonthDay)) に終了しました。新しい学期を作成しますか?"
    static func alertMessage(previous: SemesterDto) -> String
    /// name.trim 非空 && startDate <= endDate
    static func canCreate(name: String, startDate: String, endDate: String) -> Bool
}

struct SemesterRolloverStore { ... }   // §4.5
```

### 7.4 F2 — View

```swift
// Features/Home/SemesterCreateSheet.swift
struct SemesterCreateSheet: View {
    @Binding var isPresented: Bool
    let proposal: SemesterProposal
    let onCreated: (SemesterDto) async -> Void
    // @State name / startDate / endDate は init(proposal:) で State(initialValue:) に入れる
}

// Core/DesignSystem/Components/DateStringField.swift
struct DateStringField: View {
    let label: String
    @Binding var date: String        // yyyy-MM-dd。空文字は今日として表示 (既存 dateField と同じ)
}

// Features/Home/HomeCore.swift (HomeView の追加 state / 関数)
@Environment(\.scenePhase) private var scenePhase
@State private var rolloverPrompt: SemesterDto?
private let rolloverStore = SemesterRolloverStore()
private func bootstrap() async          // 既存 .task 本体 + 末尾で evaluateRolloverPrompt()
private func evaluateRolloverPrompt()   // §4.1 条件 4 のガード → SemesterRollover.promptTarget → rolloverPrompt
```

### 7.5 API

| Method | Path | 変更 |
|---|---|---|
| POST | `/api/user-timetables` | body に `daysOfWeek?: number[]` (1..7、1 件以上、重複不可)。保存は昇順 CSV。省略時 `"1,2,3,4,5"`。それ以外 (401 / 404 semester / 403 他人 / 409 重複 / 400 zod) は不変 |

---

## 8. 挙動仕様

Reviewer はここだけを根拠にテストを書く。#番号をテスト名に含める。**時刻依存 (#P) は標本時刻を明記**。

### 8.1 F1 — 引継ぎ (#C、Swift ユニット `B19TimetableCarryOverTests`)

標本: 学期 A `{id:"A", startDate:"2026-04-01", endDate:"2026-09-30"}` / B `{"B", "2026-10-01", "2027-03-31"}` / C `{"C", "2027-04-01", "2027-09-30"}`。時間割 `ttA` = `{semesterId:"A", daysOfWeek:[1,2,3,4,5,6], daySlots: 8 件 (periodIndex 1…8、label "1限"…"8限"、startMinute 540,640,780,880,980,1080,1180,1280、endMinute = start+90、isBreak false)}`。`vm.defaultSlots` = 5 件。

- **#C1** `previousTimetable(target: C, semesters: [A,B,C], timetables: [ttA])` → `ttA` (B は時間割が無いので飛ばす)
- **#C2** `previousTimetable(target: B, semesters: [A,B,C], timetables: [ttA])` → `ttA`
- **#C3** `previousTimetable(target: A, semesters: [A,B,C], timetables: [ttA])` → `nil` (A より前の学期が無い)
- **#C4** `timetables: [ttA, ttB]` (ttB.semesterId = "B") で `target: C` → `ttB` (startDate 最大)。`timetables: []` → `nil`
- **#C5** (同率) A と A' `{"A2", "2026-04-01", "2026-10-15"}` の両方に時間割があり `target: B` → `endDate` が大きい A' の時間割。`endDate` も同じなら `id` 昇順で `"A"` の時間割
- **#C6** `semesters: [A,B]` (target "C" が一覧に無い) に対し VM の `emptyTimetable(semesterId: "C")` → `daySlots == vm.defaultSlots`、`daysOfWeek == [1,2,3,4,5]`
- **#C7** `inheritedSlots(from: ttA, fallback: defaultSlots)` → `ttA.daySlots` と **Equatable 一致** (8 件、label / 時刻 / isBreak 込み)。`from: nil` → `defaultSlots`。`daySlots: []` の時間割 → `defaultSlots`
- **#C8** `inheritedDaysOfWeek(from: ttA)` → `[1,2,3,4,5,6]`。`nil` → `[1,2,3,4,5]`。`daysOfWeek: []` → `[1,2,3,4,5]`
- **#C9** VM: `vm.semesters = [A,B,C]`、`vm.timetables = [ttA]` で `emptyTimetable(semesterId: "C")` → `daySlots.count == 8`、`daysOfWeek == [1,2,3,4,5,6]`、`id == ""`、`title == "自分の時間割"`、`courses` / `meetings` 空。`display(semesterId: "C")?.daySlots.count == 8`
- **#C10** VM: `vm.timetables = [ttA]`、`vm.createdTimetable = tt(id:"created", semesterId:"B")` で `display(semesterId: "C")` → `id == ""` (B の作成済を C に流用しない)。`display(semesterId: "B")?.id == "created"`。`ensureTimetable(semesterId: "B")` → `id == "created"` (ネットワーク不要の分岐。C 側はネットワークに行くのでユニットでは叩かない)
- **#C11** `UserTimetableCreateInput(semesterId:"s", title:"t", daySlots:[1 件], courses:[], meetings:[], daysOfWeek:[1,2,3,4,5,6])` を `JSONEncoder` で encode → キーに `daysOfWeek` を含み値 `[1,2,3,4,5,6]`。`daysOfWeek` 省略 (nil) → キーが**無い**。既存 `DTODecodingPhaseBTests.testUserTimetableCreateInputEncodesWebBodyKeys` は無変更で緑
- **#C12** 既存 `SelfTimetableViewModelTests` 7 件は無変更で緑 (特に `testEmptyTimetableUsesExplicitSemesterFallback`: semesters / timetables が空なら従来どおり `defaultSlots`)

### 8.2 F1 — API (#A、Vitest `apps/api/tests/b19-user-timetable-days-of-week.test.ts`。helpers: `createTestUser` / `createSemester` / `createSessionCookie`。body の `daySlots` は 1 件で良い)

- **#A1** `POST /api/user-timetables { ..., daysOfWeek: [1,2,3,4,5,6] }` → 201、`userTimetable.daysOfWeek == [1,2,3,4,5,6]`。続けて `GET /api/user-timetables` の該当行も `[1,2,3,4,5,6]`
- **#A2** `daysOfWeek` 省略 → 201、`[1,2,3,4,5]` (既存 `user-timetables.test.ts` の「returns default weekday daysOfWeek」が同じ契約。そのまま緑)
- **#A3** `daysOfWeek: [6,1,3]` → 201、`[1,3,6]` (昇順正規化)
- **#A4** `daysOfWeek: [1,1]` / `[]` / `[0]` / `[8]` → それぞれ 400 `VALIDATION_ERROR`、`UserTimetable` 行は増えない
- **#A5** `daysOfWeek: [7]` だけ → 201、`[7]`
- **#A6** (不変) PATCH の既存 3 テスト (`accepts all weekdays and weekends` / `normalizes unordered` / `rejects duplicate`) は緑のまま。Vitest 全体の失敗集合は台帳と**集合一致**

### 8.3 F2 — 提案ロジック (#P、Swift ユニット `B19SemesterRolloverTests`)

標本学期: A `{"A", "2026-04-01", "2026-09-30", name:"2026 前期"}`、B `{"B", "2026-10-01", "2027-03-31", "2026 後期"}`。

- **#P1** `latest([A,B])` → B。`latest([B,A])` → B (順序非依存)。`latest([])` → nil。同 startDate で endDate が長い方、それも同じなら id 昇順 (`"A"` と `{"A0", 同 start, 同 end}` → `"A"`。`"A" < "A0"`)
- **#P2** `allEnded([A], today: "2026-10-01")` → true。`today: "2026-09-30"` (endDate 当日) → **false**。`allEnded([A,B], "2026-10-01")` → false (B が生きている)。`allEnded([], ...)` → false
- **#P3** `promptTarget(semesters: [A], today: "2026-10-01", dismissedSemesterId: nil)` → A。`dismissedSemesterId: "A"` → nil。`dismissedSemesterId: "zzz"` → A。`semesters: [A,B], today: "2026-10-01"` → nil。`semesters: []` → nil。`semesters: [A,B], today: "2027-04-01", dismissed: "A"` → **B** (却下は学期 id 単位。A を却下しても B が終われば出る)
- **#P4** (★ 標本時刻。`SchoolClock.todayString(now)` と組み合わせる) `now = 2026-09-30T14:59:00Z` (= JST 23:59) → `todayString == "2026-09-30"` → `promptTarget([A], …)` は nil。`now = 2026-09-30T15:00:00Z` (= JST 10/1 00:00) → `"2026-10-01"` → A。`TEST_RUNNER_TZ=UTC` でも同じ結果 (JST 固定)
- **#P5** `proposal(after: A, today: "2026-10-01")` → `{name:"2026 後期", startDate:"2026-10-01", endDate:"2027-03-31"}`
- **#P6** `proposal(after: B, today: "2027-04-05")` → `{"2027 前期", "2027-04-01", "2027-09-30"}`
- **#P7** (放置) `proposal(after: {"old", "2025-04-01", "2025-09-30"}, today: "2026-10-07")` → 素直に計算すると end 2026-03-31 < today なので → `{"2026 後期", "2026-10-01", "2027-03-31"}`
- **#P8** (月末) `proposal(after: {"x", "2026-03-01", "2026-08-31"}, today: "2026-09-01")` → `{"2026 前期", "2026-09-01", "2027-02-28"}` (9 月始まりは規則上「前期」。利用者が直す)
- **#P9** `alertMessage(previous: A)` == `"「2026 前期」は 2026年 9月30日 に終了しました。新しい学期を作成しますか?"`
- **#P10** `canCreate(name: " ", startDate: "2026-10-01", endDate: "2027-03-31")` → false。`name: "x", start: "2027-04-01", end: "2027-03-31"` → false。`start == end` → true。`name: " 2026 後期 ", 正常な期間` → true
- **#P11** `SemesterRolloverStore(defaults: UserDefaults(suiteName: "test-\(UUID())")!)`: 初期 nil → `= "A"` → get "A" → `= nil` → get nil。`SemesterRolloverStore.key == "atender.semesterRollover.dismissedSemesterId"`
- **#P12** `HomeSheet.semesterCreate(SemesterProposal(name:"n", startDate:"2026-10-01", endDate:"2027-03-31")).id == "semester-create"`。既存 #R8 の 3 つの id は不変

### 8.4 F3 + 導線の疎通 (#S、XCUITest `B19SemesterRolloverUITests`。API `localhost:8787` + **毎回 seed 直後**が前提。#S2/#S3 は seed を書き換える)

seed (§10.3) の前提: デモユーザー (`demo-bearer-token-ios-resync-0001`) に学期「2026 前期」(時間割 1〜4限) と**「次学期」(時間割なし、未来)** の 2 件。終了ユーザー (`demo-bearer-token-ios-ended-0002`) に昨日終了した「2026 前期」(時間割 8 コマ、表示曜日 月〜土) の 1 件。

- **#S1** (F3 + F1 の引継ぎ表示。デモユーザー) 起動 → `home-semester-menu` をタップ → label `次学期` の項目 (`app.buttons` または `app.menuItems`。SwiftUI `Menu` は OS 版で露出が変わる) をタップ → `timetable-period-4` が存在し `timetable-period-5` が存在しない (「2026 前期」の 4 コマを引継ぐ) → `timetable-cell-1-1` をタップ → staticText `授業を追加` (シートタイトル) → ボタン `＋ 科目を追加` をタップ → **staticText `科目を追加` が 5 秒以内に現れる** (★ バグの再現点。修正前はここで落ちる) → `科目名` の textField に `テスト科目` を入力 → ボタン `保存` → `科目を追加` が消え、label に `テスト科目` を含む要素 (button または staticText) が 1 つ以上ある (Menu ラベルに新科目が入った) → `sheet-close`
- **#S2** (F2 → F1 → F3 の一気通貫。終了ユーザー、`launchEnvironment["ATENDER_UI_TEST_RESET_ROLLOVER"] = "1"`) 起動 → `app.alerts["前回の学期が終了しました"]` が 15 秒以内に出る。message に `2026 前期` を含む → ボタン `作成する` → `semester-create-sheet` が出る → `学期名` の textField の value が規則 §4.4 の値 (today = 実行日の JST、previous.endDate = 昨日 → start = 今日。Reviewer は `Calendar` で同じ規則を計算して比較) → ボタン `学期を作成` (enabled) をタップ → シートが消える → `home-semester-menu` の label がその学期名 → `timetable-period-8` が存在し `timetable-period-9` が存在しない → staticText `土` が存在する (曜日ヘッダ、daysOfWeek 1〜6 の引継ぎ) → `timetable-cell-1-1` → `授業を追加` → `＋ 科目を追加` → `科目を追加` が出る
- **#S3** (却下の記憶。終了ユーザー、RESET あり) alert → ボタン `あとで` → alert が消える → `XCUIDevice.shared.press(.home)` → `app.activate()` → 5 秒待っても alert が出ない → `app.terminate()` → **RESET 無し**で再起動 → 5 秒待っても alert が出ない (UserDefaults に残っている)
- **#S4** (出さない側。デモユーザー) 起動 → 10 秒待っても `app.alerts` が 0 (学期「2026 前期」が終了していない)。既存 `B18HomeRoomsUITests` 9 本が緑のまま (seed に「次学期」を足しても `defaultSemesterId` は「2026 前期」で、Home / 学期タブの既定は変わらない)

### 8.5 版数 (#V)

- **#V1** `apps/ios/project.yml` が `CFBundleVersion: "19"` を含み `"18"` を含まない。`CFBundleShortVersionString: "1.0"` 不変
- **#V2** `MIN_IOS_BUILD (= 12) <= 19` (既存テストの維持)。API は optional フィールド追加のみなので据え置き
- **#V3** `Atender/Info.plist` は `xcodegen generate` の出力をコミット (`CFBundleVersion == "19"`)

---

## 9. UI/UX チェック (汎用層 §7 の該当項目のみ)

- **視覚階層**: alert は OS 標準 (L0 相当、他を遮る)。学期作成シートは `SheetScaffold` 規格 (DESIGN.md §3.7.4、タイトル「新しい学期」5 文字)。新しい色・余白・書体は導入しない (`LabeledInput` / `AtenderButton` / `DatePicker(.compact)` の既存部品のみ)
- **タスク頻度 → 動線**: 「新学期を作って時間割を登録する」は半年に 1 回だが**詰まると全機能が使えない**タスク。現行 = 設定タブ → 学期管理 → 名前と期間を入力 → 追加 → ホーム → 学期メニューで切替 → セルタップ (7 操作、既定学期は変わらない)。F2 後 = alert「作成する」→ (既定値を確認して)「学期を作成」→ セルタップ (3 操作)。既定値は §4.4 で前学期から導出 (認知負荷のオフロード、汎用 §6)
- **状態の網羅**: 学期 0 件 → alert なし (従来の「先に学期を作成してください」のまま) / 学期一覧の取得失敗 → `semesters == []` → alert なし / 作成失敗 → toast、シート据え置き / 既定学期の更新失敗 → toast + 続行 (§4.3) / 引継ぎ元なし → 5 コマ既定 / 引継ぎ元の `daySlots` が空 → 5 コマ既定
- **アクセシビリティ**: alert・シートは標準部品で 44pt / Dynamic Type 対応。`timetable-cell-*` はセル自体 (既存サイズ) に identifier を付けるだけで見た目は不変
- **ナビ構造**: タブも階層も増やさない。alert → 既存の `.sheet(item:)` → 既存のホーム画面に戻る
- **dark**: 既存の theme 設定に従う (本 doc で新設なし)
- **DESIGN.md / CLAUDE.md の置換**: DESIGN.md に矛盾する記述は無い (alert は規定外、シートは §3.7.4 の規格内)。`projects/atender/CLAUDE.md:141` の版数履歴は**出荷時**に Leader が「build 19 = …」を追記する (本 doc は触らない)

---

## 10. 実装ファイル一覧

### 10.1 新規

| ファイル | 内容 |
|---|---|
| `apps/ios/Atender/Features/Home/TimetableCarryOver.swift` | §7.1 |
| `apps/ios/Atender/Features/Home/SemesterRollover.swift` | `SemesterRollover` / `SemesterProposal` / `SemesterRolloverStore` (§7.3) |
| `apps/ios/Atender/Features/Home/SemesterCreateSheet.swift` | §4.3 / §7.4 |
| `apps/ios/Atender/Core/DesignSystem/Components/DateStringField.swift` | §4.3 (既存 private `dateField` 2 箇所の置換先) |
| `apps/ios/AtenderTests/B19TimetableCarryOverTests.swift` | #C1-#C12 (Reviewer) |
| `apps/ios/AtenderTests/B19SemesterRolloverTests.swift` | #P1-#P12 (Reviewer) |
| `apps/ios/AtenderUITests/B19SemesterRolloverUITests.swift` | #S1-#S4 (Reviewer) |
| `apps/api/tests/b19-user-timetable-days-of-week.test.ts` | #A1-#A6 (Reviewer) |

### 10.2 変更

| ファイル | 変更 |
|---|---|
| `apps/ios/Atender/Features/Home/SelfTimetableView.swift` | VM: `emptyTimetable` / `display` / `ensureTimetable` / 新 `refreshSemestersIfUnknown` / `resolvedSemesterId` / `carryOverSource` (§3.3)。View: `.task(id: semesterId)` 1 行 |
| `apps/ios/Atender/Features/Home/HomeCore.swift` | `HomeSheet.semesterCreate`、`homeSheetContent` の case 追加、`.alert`、`scenePhase` / `selectedTab` の `onChange`、`.task` → `bootstrap()`、`evaluateRolloverPrompt()`、`rolloverPrompt` / `rolloverStore` (§4.1-4.3) |
| `apps/ios/Atender/Features/Timetable/MeetingSheets.swift` | `MeetingEditModal.body` の ZStack 除去 + `.background { CourseEditModal(...) }` (§5.1) |
| `apps/ios/Atender/Features/Timetable/TimetableGridPhaseB.swift` | `timetable-cell-<day>-<period>` / `timetable-period-<period>` の identifier (§5.4) |
| `apps/ios/Atender/Core/Models/DTOs.swift` | `UserTimetableCreateInput.daysOfWeek: [Int]? = nil` (§6.1) |
| `apps/ios/Atender/Features/Settings/SemesterListSheet.swift` | private `dateField` → `DateStringField` (挙動不変) |
| `apps/ios/Atender/Features/Setup/SetupFlowView.swift` | private `setupDateField` → `DateStringField` (挙動不変) |
| `apps/ios/Atender/App/AppEnvironment.swift` | `#if DEBUG` に `ATENDER_UI_TEST_RESET_ROLLOVER` 1 行 (§4.5) |
| `apps/ios/project.yml` / `apps/ios/Atender/Info.plist` | `"19"` (Info.plist は `xcodegen generate` の生成物をコミット。手編集禁止) |
| `packages/shared/src/schemas/userTimetable.ts` | `UserTimetableCreateInput` に `daysOfWeek: DaysOfWeek.optional()` (§3.4) |
| `apps/api/src/routes/userTimetables.ts` | `daysOfWeekCsv` 切り出し + create で保存 (§3.4) |
| `apps/api/scripts/seed-demo-user.ts` | §10.3 |
| 既存テスト 3 ファイル | §11.1 |

### 10.3 seed (`seed-demo-user.ts`) の追加仕様

1. **デモユーザー (既存 `demo-user-ios`) に学期「次学期」を追加**: `name: "次学期"`、`startDate = today+43d 00:00`、`endDate = today+227d 23:59:59`。**`UserTimetable` は作らない**。`defaultSemesterId` は従来どおり「2026 前期」(変更しない)。既存の科目・出欠・ルーム等は不変
2. **終了ユーザーを追加**: `id: "demo-user-ios-ended"`、`email: "demo-ended@atender.local"`、`name: "デモ花子"`、同じ school / department、`requiredAttendanceRate: 80`。学期 `name: "2026 前期"`、`startDate = today-182d 00:00`、`endDate = today-1d 23:59:59`、`defaultSemesterId` = その学期。`UserTimetable { title: "2026 前期 時間割", daysOfWeek: "1,2,3,4,5,6" }` + `DaySlot` 8 件 (periodIndex 1…8、label `"N限"`、startMinute `540, 640, 780, 880, 980, 1080, 1180, 1280`、endMinute = start + 90) + 科目 1 件 (`"英語"`, color `"#EF4444"`) + Meeting 1 件 (`dayOfWeek: 1, startPeriodIndex: 1, periodCount: 1`) + `generateOccurrencesForUserTimetable`。Session `{ id: "demo-session-ios-ended", token: "demo-bearer-token-ios-ended-0002", expiresAt: +365d }`。冒頭の掃除は `user.deleteMany({ where: { id: { in: [DEMO_USER_ID, DEMO_ENDED_USER_ID] } } })` (cascade は既存どおり)
3. 末尾の JSON 出力に `endedUserBearerToken` と `nextSemesterId` を足す

---

## 11. テスト基盤

- **iOS ユニット**: `AtenderTests` (XCTest)。ベースライン **676 GREEN / 0 RED** (台帳 iOS 節、build 18 出荷時点)。実行: `/opt/homebrew/bin/xcodegen generate` → `xcodebuild test -project Atender.xcodeproj -scheme Atender -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.2'` (`-derivedDataPath` 隔離、1 本ずつ)。VM テストは既存 `SelfTimetableViewModelTests` の流儀 (`@MainActor`、`SelfTimetableViewModel(environment: AppEnvironment())`、`timetables` / `semesters` を直接代入)。`AppEnvironment()` はネットワークに行かない範囲で使える (既存テストが同じ使い方)
- **iOS UI**: `AtenderUITests` (XCUITest)。`localhost:8787` の API + **直前に `pnpm exec tsx --env-file=.env scripts/seed-demo-user.ts`** が前提 (#S2 / #S3 は終了ユーザーの状態を変えるので、再実行前に seed し直す)。既存の `B18HomeRoomsUITests` の helper 流儀 (`launchEnvironment["ATENDER_UI_TEST_BEARER_TOKEN"]`、`waitForExistence`、`closeSheetIfPresent`)。起動直後の 1〜2 タップが落ちる癖 (`gotcha/xcuitest-first-taps-after-launch-are-lost`) は従来どおり wait で吸収。chrome-devtools MCP は使わない (Web を触らない)
- **API**: `apps/api` の Vitest (`pnpm exec vitest run`)。失敗集合は台帳 (A1-A5, A7, A8 / B1-B5 / Magic Link 4) と**集合一致**。新規は `tests/b19-user-timetable-days-of-week.test.ts` (#A1-#A6)
- **検証手順**: (1) ユニット全走 → 676 + 新規 (#C 12 + #P 12 ≈ 24) ≈ **700 前後 / 0 RED**、件数を台帳に記録 (2) Vitest 集合一致 + 新規 6 件 GREEN (3) seed → XCUITest #S1-#S4 (4) `ScreenshotFlow` の `01-home-timetable` が変わっていないこと (5) TestFlight build 19 + `atender-api` の Coolify デプロイ (shared / route の変更を含む。順序: API を先に出すのが自然。iOS が先でも `daysOfWeek` は zod が未知キーを落とすだけで 400 にならない — `z.object` 既定は strip)

### 11.1 意図的に壊れる既存テスト (版数 3 ファイル、メソッド名も揃える)

| テスト | 処置 |
|---|---|
| `BuildVersionTests.testV1BundleVersionIs18` | `"19"`、メソッド名 `…Is19` |
| `B17BuildVersionTests.testB61ProjectYmlBundleVersionIs17` (中身は "18") / `testB61bInfoPlistMatchesProjectYml` | `"19"` を含み `"18"` を含まない / plist `"19"`。メソッド名 `…Is19` に |
| `B18HomeAndVersionTests.testV1ProjectYmlBundleVersionIs18` / `testV3InfoPlistMatchesProjectYmlVersion` | `"19"` (`"18"` を含まない) / plist `"19"` |

**壊れないことを確認した既存テスト**: `SelfTimetableViewModelTests` (7 件。semesters / timetables 空なら従来値、`display` の優先順は同じ) / `DTODecodingPhaseBTests.testUserTimetableCreateInputEncodesWebBodyKeys` (superset 判定) / `HomeChipsTests` / `B18HomeAndVersionTests.testR8` (既存 3 case の id 不変) / API `user-timetables.test.ts` の daysOfWeek 4 件 (POST 既定・PATCH 3 件、契約不変) / `setup-flow.test.ts` (`POST /api/semesters` 不変) / Web: shared の optional 追加は型チェックを通す (ベースライン 26 failed 不変)

---

## 12. 不採用案 / 今後

- **API 側で `daySlots` 省略時に直前学期から補完する / `POST /api/semesters` に `copyFromSemesterId`**: 却下。iOS は `timetables` を全件持っており、クライアントで決められる。API に「直前の学期」の定義を持ち込むと Web / iOS の 2 箇所で同じ定義を保守することになる (Leader 裁定: API 変更は最小)
- **作成 UI に「前学期の設定を引き継ぐ」トグルを置く**: 却下。引き継がない選択肢は `TimetableSettingsSheet` で後から変えられる。トグルは「なぜ 5 コマに戻るのか」を説明する UI を増やすだけ
- **「直前の学期」を単純に startDate 最大の前学期に固定し、時間割が無ければ 5 コマ既定にする**: 却下。A (8 コマ) → B (触らず) → C の順で作ると C が 5 コマに戻り、要望 1 の再発になる。時間割を持つ学期まで遡る (§3.1)
- **「直前」を見ずに「時間割を持つ最新の学期」から引き継ぐ (target の前後を問わない)**: 却下。過去の学期を後から登録する操作で未来の学期のコマ設定が写るのは直感に反する。target より前に限定し、無ければ既定
- **提案を自前バナー / `ContentUnavailableView` で出す**: 却下 (Leader 裁定: 標準 `.alert`)。半年に 1 回の割り込みで、alert の「作成する / あとで」で十分
- **提案を `SemesterListSheet` (設定タブの学期管理) で受ける**: 却下。一覧 + 編集 / 削除 + 末尾のフォームの画面は「新学期を作る」1 タスクに対して情報が多く、作成後に既定学期を切り替える経路も無い。3 欄 + 1 ボタンの `SemesterCreateSheet` を新設し、`SemesterListSheet` は不変
- **`SemesterCreateSheet` を `SemesterListSheet` と共用化する (フォーム部品を切り出す)**: 却下 (今回は)。共通化できるのは `dateField` だけで、それは `DateStringField` に切り出した。名前欄は `LabeledInput` 1 行
- **提案の既定期間を前学期と同じ日数にする**: 却下。4/1〜9/30 (183 日) を 10/1 から数えると 4/1 で終わり、月末に揃わない。「6 か月 − 1 日」は前期 / 後期の両方で月末に落ちる (#P5 / #P6)
- **学期名を前学期の名前から派生させる (「前期」→「後期」置換等)**: 却下。命名規則の推測は外れると不自然 (「2026年度 前期」「1st」)。開始月だけから決め、欄で直せる
- **却下を「1 回だけ」でなく「N 日後に再提案」にする**: 却下。周期的な再提案は要望に無く、却下した人に半年間しつこく出ることになる。別の学期が最新になれば出る (id 単位)
- **`scenePhase` を見ない (`.task` だけ)**: 却下。suspend したまま日付をまたぐ (9/30 に開いたまま 10/1 に戻る) と `.task` は再実行されず、要望 2 の例そのものを外す。標準の `scenePhase` 1 つで足りる
- **提案の判定を API (`/api/me` に `latestSemesterEnded` 等) に置く**: 却下。判定材料 (学期一覧 + 今日) は iOS が既に持っている。iOS 先行機能なので API を広げない
- **F3 を `activeSheet` enum で解く (`MeetingEditModal` の中でシートを切り替える)**: 却下 (§5.2)。1 枚目を閉じずに 2 枚目を重ねたい
- **`stackLevel` を削除する**: 却下 (今回は)。読まれていない引数で挙動に無関係。9 箇所の機械的削除は別 chore
- **F3 を `SelfTimetableView.activeSheetView` に `.course` case を足して解く (2 枚目も親で管理)**: 却下。`MeetingEditModal` が 1 枚目を閉じないまま 2 枚目を要求する関係は `MeetingEditModal` の内部事情で、親に漏らすと `CourseDetailModal` など他の呼び出し元と形が揃わなくなる
- **今後 (本 doc 外)**: Web `SelfTimetableView.tsx:14-20, 40-55` の 5 コマ固定も同じ欠陥。`useUserTimetables` の全件から同じ規則 (§3.1) で引き継ぐ Web 版は別設計。Web に学期終了の提案は無い (iOS 先行)。`TimetableSettingsSheet` が時間割未作成時に「先に学期を作成してください」と出す文言は実態 (学期はある、時間割が無い) と違うが本 doc では触らない

---

## 13. 迷った判断点 (承認ゲートで Leader が提示。設計は「採った値」で書いてある)

| # | 論点 | 採った値 | 他の選択肢 |
|---|---|---|---|
| 1 | 引継ぎ元に時間割が無い学期が挟まるとき | さらに前の、時間割を持つ学期まで遡る (§3.1) | 直前 1 つだけ見て無ければ 5 コマ既定 |
| 2 | 提案の既定期間 | 前学期終了の翌日から 6 か月 − 1 日。半年以上放置なら今月 1 日から (§4.4) | 前学期と同じ日数 / 今日から 6 か月 |
| 3 | 提案の既定名 | 開始月で「yyyy 前期 / 後期」(4〜9 月 = 前期) | 前学期名から派生 / 空欄 |
| 4 | 既定学期の更新 (`PATCH /api/me`) が失敗したとき | toast して続行 (学期は作成済、ホームは新学期に切替) | 作成ごと失敗扱いにする (学期が残るので整合しない) |
| 5 | 提案の再評価契機 | `.task` + `scenePhase == .active` + ホームタブ復帰 (§4.1) | `.task` のみ |

---

## 14. 受け入れ表 (要望原文 → 挙動仕様 → 確認手段)

| 要望 (原文) | 対応する挙動仕様 | 確認手段 |
|---|---|---|
| 前学期の時間割の時間設定 (8 コマ) が新学期に引き継がれる | #C1-#C9 (引継ぎ元の決定と daySlots / daysOfWeek の導出)、#C11 / #A1 (作成時に `daysOfWeek` も送る・保存される)、#S1 (4 コマの seed で表示)、#S2 (8 コマ + 土曜) | ユニット / API / XCUITest / **実機** (Touri の前期 8 コマ → 新学期) |
| 最新学期の終了後に開いたら「前回の学期が終了しました。新しい学期を作成しますか?」と提案 | #P1-#P4 (判定。当日は出ない、翌日 0:00 JST から出る)、#P9 (文言)、#S2 / #S4 | ユニット / XCUITest / 実機 |
| 学期作成 → 時間割登録と手続きが進む | §4.3 の送信手順、#P5-#P8 / #P10 (既定値・有効条件)、#S2 (作成 → ホームが新学期 → セルタップ → 授業を追加) | XCUITest / 実機 |
| 却下したら繰り返し出ない | #P3 / #P11 / #S3 | ユニット / XCUITest |
| **★ 「＋ 科目を追加」で何も起きない** | §5.1、#S1 (タップ → 「科目を追加」シート → 保存 → Menu に反映)、#S2 の末尾 | XCUITest / 実機 |
| build 19 / `MIN_IOS_BUILD` 据え置き | #V1-#V3 | ユニット |
