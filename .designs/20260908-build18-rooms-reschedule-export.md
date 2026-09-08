# atender build 18 — ルームタブ廃止 (ホーム集約) / 授業変更 (振替) / 公欠の EventKit 除外

> 対象: `apps/ios` (F1 / F3 / F4) + `apps/api` + `packages/shared` (F3 のみ)
> 前提 main: **build 17 レーン (`.designs/20260730-ios-unify-calendar-build17.md`) がマージ済**。実体は `Muraki/worktrees/atender-unify-build17/` (`CalendarScreen` / `RoomTimetable` / `RoomCalendar` / `CalendarModePicker` / `HomeBody` の `semesterId` 配線が入った状態)。iOS ユニット **643 GREEN / 0 RED**、API Vitest は台帳 (`.knowledge/known-failures.md`) の失敗集合と一致
> Researcher 成果: `.knowledge/08-build18-research.md` (file:line はそこを起点に本 doc で再確認済)
> デザイン正典: `DESIGN.md`。本 doc で古くなる記述は §11 のとおり **置換** する (追記でない)

---

## 0. スコープ

| | 触る | 触らない |
|---|---|---|
| iOS (F1) | `MainTab` / `AppRouter` / `MainTabView` / `HomeCore` (`HomeView` `ContextChips` `HomeBody`) / `RoomSheets` (`RoomSettingsSheet` の退出・削除後) / `RoomsView.swift` の分解 (作成・参加シートは残す) / `RoomDetailView.swift` `TemplatesView.swift` の削除 | Web の `/rooms` `/rooms/:id` ルート (据え置き。§3.6 で IA 共有原則からの逸脱を明示)、ルーム API、`QRScannerScreen` の中身、友達タブ |
| iOS (F3) | `DayDetailSheet` (授業変更セクション + シート)、新規 `ClassTransferSheet`、`AttendanceCalendar` の日セル (振替バッジ)、`PersonalCalendar` の loader、`MeetingExpansion` (除外セット引数の追加)、DTO / Endpoints / Repository / `InvalidationMatrix` | ホームの週間時間割 (`SelfTimetableView` = 曜日パターン。日付を持たないので振替は載せない)、`AttendanceCalendar` の罫線・円形格子そのもの、Web (別設計) |
| iOS (F4) | `CourseExportMapping.items` の除外条件 1 箇所 + テスト | 同期の配線 (`CalendarSyncTrigger` / `Coordinator`) — **変更なし** (§5.2) |
| API (F3) | Prisma **additive** migration (新テーブル 2 + nullable 列 2)、新 route `/api/class-transfers`、`occurrenceGen.ts` (生成スキップ)、`meeting.service.ts` (再生成の除外)、`occurrence.service.ts` / `today.ts` (`periodIndex` の読み方)、`dayDetail.service.ts` / `semesterOverview.service.ts` (additive フィールド)、`courses.ts` (削除後の掃除) | 出席率の計算式、`getRoomWeek`、認証、`MIN_IOS_BUILD` (12 のまま。§8.5) |
| 例外的に触る | `MeetingExpansion.expandUserTimetable` に `excluding:` 引数 (default 付き) — 振替で置き換えられた通常授業を個人カレンダーから消すため。既存呼び出し・既存テストは無変更でコンパイルできる | — |

**用語**:
- **振替 (transfer)**: ある日付に、その曜日の時間割には無い授業を置くこと。`ClassTransfer` 1 行 + `MeetingOccurrence` N 行 (`transferId` 付き) で表す
- **置き換え (displacement)**: 振替を置いた時限に元からあった通常授業が、その日だけ開催されなくなること。`ClassTransferDisplacement` 行 = (meetingId, date) 単位
- **曜日ごと (MOVE_DAY)** / **コマごと (SINGLE)**: Touri 要望の (a) / (b)

---

## 1. 目的

1. ルームタブを廃止し、ルームの入口 (作成 / リンク参加 / **QR 参加**) をホームのコンテキスト chip の「+」に集約する。ルームの設定はホームでそのルームを選んでいるときの nav bar 右上 (歯車) から開く
2. 「台風で金曜の授業が月曜に振替」「学期末に振替授業」を **学期カレンダーの日 → 授業変更** から登録できるようにする。曜日の時間割を丸ごと写す / 科目を 1 コマずつ置く、の 2 モード。集計・日別・カレンダー・EventKit 書き出しに **occurrence として自動で乗る**
3. 公欠 (EXCUSED) にした授業を iPhone カレンダーから消す (休講は既に消えている)

---

## 2. 現状の実測 (設計の根拠。すべて build 17 worktree で確認)

| 事実 | 場所 |
|---|---|
| `MainTab` は 5 case、`.rooms` のタブは `RoomsView` を `NavigationStack(path: roomsPath)` に載せ `RoomsRoute` (`.detail/.join/.templates`) を解決 | `App/MainTabView.swift:3-8, 49-63` |
| `.templates` を push する呼び出し元は 0 (`grep RoomsRoute.templates` ヒットなし)。`TemplatesView` は到達不能 | `App/AppRouter.swift:4-8` |
| deep link `rooms/join/<code>` は `selectedTab = .rooms; roomsPath.append(.join(code))` | `App/AppRouter.swift:40-49` |
| ホームの「+」は `selectedTab = .rooms` に飛ばすだけ。**`ContextChips` は `rooms.isEmpty` で丸ごと非表示** = ルーム 0 件のユーザーに「+」が出ない | `Features/Home/HomeCore.swift:30-32, 47-54` |
| ホームの toolbar は `context == .self && mode == .timetable` の歯車 (時間割設定) のみ。ルーム文脈の分岐なし | `HomeCore.swift:78-95` |
| `RoomSettingsSheet(roomId:isPresented:onChanged:)` は退出・削除後に `router.roomsPath = NavigationPath()` を叩く (2 箇所) | `Features/Rooms/RoomSheets.swift:359, 369` |
| `RoomCreateSheet.onCreated: () async -> Void` は作った room を捨てる (`_ = try await createRoom`)。`JoinByCodeSheet.onJoined: (String) -> Void` は room.id を返す。QR は `JoinByCodeSheet` 内の `fullScreenCover` → `router.handleDeepLink(url)` | `Features/Rooms/RoomsView.swift:190-275` |
| `MeetingOccurrence.meetingId` は必須 FK、`@@unique([meetingId, date, periodOffset])` | `prisma/schema.prisma:406-422` |
| 生成は `cursor.day() !== meeting.dayOfWeek` で曜日一致のみ、範囲は学期全体、重複は P2002 でスキップ | `services/occurrenceGen.ts:33-34, 47, 55-70` |
| `updateMeeting` はスケジュール変更時に `meetingOccurrence.deleteMany({ where: { meetingId } })` → 全再生成 | `services/meeting.service.ts:114-116` |
| `reconcileOccurrencesForSemesterDateChange` は範囲外 occurrence を「AttendanceRecord が無ければ削除」 | `services/occurrenceGen.ts:118-133` |
| 読み取り側は全部 `date` 範囲フィルタのみ (曜日を再検証しない): `attendanceStats.ts:106-107` / `semesterOverview.service.ts:88-91` / `dayDetail.service.ts:29-33` / `occurrence.service.ts:56-60` / `routes/today.ts:19-23` / `room.service.ts:293-300` | 同左 |
| ただし **`periodIndex` は読む側で `meeting.startPeriodIndex + periodOffset` から導出**している (2 箇所) | `occurrence.service.ts:29` / `routes/today.ts:42` |
| 個人カレンダー (ホーム×カレンダー) の授業イベントは **occurrence でなく週パターンからクライアント展開** (`MeetingExpansion.expandUserTimetable`) | `Core/Timetable/TimetableLogic.swift:111-155`, `Features/Calendar/PersonalCalendar.swift:39-43` |
| EventKit 書き出しは `occurrenceRange` → `CourseExportMapping.items` で desired を作る。除外は一括休講日 / 科目休講 / `status == .cancelled` / 壊れた行 | `Core/Sync/CalendarSyncCoordinator.swift:206-207`, `Core/Sync/CourseExportMapping.swift:10-18` |
| `.dataChanged` は 15 秒 throttle。`.appLaunch` はバイパス。起動時に `sync(trigger: .appLaunch)` | `Core/Sync/CalendarSyncTrigger.swift:6, 21, 37-39`, `App/RootView.swift:37-40` |
| 版数 `CFBundleVersion: "17"`、`MIN_IOS_BUILD = 12` | `apps/ios/project.yml:49`, `apps/api/src/lib/clientVersion.ts:16` |

---

## 3. F1 — ルームタブ廃止 / ホーム集約

### 3.1 IA (4 タブ)

```
[ホーム] [学期・科目] [友達] [設定]       ← MainTab は 4 case。.rooms は削除
```

- `MainTab`: `case rooms` と `label`/`symbol` の分岐を削除。`allCases.count == 4`
- `AppRouter`: `RoomsRoute` enum と `roomsPath` を削除。deep link の着地は §3.5
- `MainTabView`: ルームの `NavigationStack` ブロック (`:49-63`) を削除

**ナビ構造の選択理由** (汎用層 §5 表): ルームは「対等なコンテキストを数個往復」する対象で、既にホームの **context chip** がその役を担っている。タブと chip の二重入口を chip 一本にする。ルーム一覧画面 (`RoomsView`) が持っていた情報 (メンバー数 / 次の予定) は chip 選択後の時間割・カレンダーで読めるので、一覧カードは持ち越さない (§9)。

### 3.2 ホーム画面

```
nav bar : [2026 前期 ▾]              ホーム              [⚙]   ← ⚙ は §3.4 の条件で出る
chips   : (👤 自分) (👥 情報処理科) (👥 ゼミ) ( + )            ← ★ 常時表示 (ルーム 0 件でも 自分 + 「+」)
seg     : [ 時間割 | カレンダー ]
body    : HomeBody (4 経路、build 17 のまま)
```

- **`ContextChips` を常時表示にする**: `HomeChips.isVisible(rooms:)` を削除し、`HomeView.body` の `if HomeChips.isVisible(rooms: rooms)` を外す。`HomeChips.items(rooms: [])` は `[自分]` を返すので、ルーム 0 件では「自分」chip と「+」だけが並ぶ (テスト `HomeChipsTests.testItemsWithNoRoomsContainsOnlySelfChip` は無変更で緑)
- **「+」を `Menu` にする** (標準部品。`RoomsView` の `rooms-add` と同じ形):

```swift
Menu {
    Button { onAddRoom(.create) } label: { Label("ルームを作成", systemImage: "plus.circle") }
    Button { onAddRoom(.join) }   label: { Label("リンクで参加", systemImage: "link") }
    Button { onAddRoom(.scanQR) } label: { Label("QR で参加", systemImage: "qrcode.viewfinder") }
} label: { /* 既存の 44pt 丸「+」 */ }
.accessibilityLabel("ルームを追加")
.accessibilityIdentifier("rooms-add")      // ← RoomsView の識別子を引き継ぐ (UI テストの書き換え量を減らす)
```

- **タスク頻度 → 動線**: 最頻タスク「ルームの時間割を見る」= chip 1 タップ (旧: タブ 1 + カード 1 = 2 タップ)。「作成 / 参加」= 「+」1 + 項目 1 = 2 タップ (旧と同数)。「ルーム設定」= chip 1 + 歯車 1 = 2 タップ (旧: タブ + カード + 歯車 = 3)
- 視覚階層は build 17 と同じ (L1 グリッド / L2 chips・セグメント / L3 学期ピッカー)。chip 行が常時表示になることで L2 が 1 行増えるが、`Space.s3` 間隔・44pt 高は現行どおり

### 3.3 シートと状態 (`HomeView`)

`.sheet` は **1 個** (`item:`) に束ね、`fullScreenCover` は 1 個。兄弟 `.sheet` を複数並べない (`Muraki/knowledge/gotcha/swiftui-multiple-sibling-sheets-only-one-fires.md`)。

```swift
enum HomeSheet: Identifiable, Equatable {
    case roomCreate
    case roomJoin(initialCode: String?)      // nil = 手入力、非 nil = deep link / QR 由来 (自動で参加を試みる)
    case roomSettings(roomId: String)
    var id: String { ... }                   // "create" / "join" / "settings:<roomId>"
}
enum RoomAddAction: Equatable { case create, join, scanQR }

// HomeView の @State に追加
@State private var sheet: HomeSheet?
@State private var scannerPresented = false
```

| 操作 | 遷移 |
|---|---|
| 「+」→ ルームを作成 | `sheet = .roomCreate` → `RoomCreateSheet(isPresented:onCreated:)`。成功: `rooms` を `force: true` で再読込 → `context = .room(roomId: created.id)` → シート閉 |
| 「+」→ リンクで参加 | `sheet = .roomJoin(initialCode: nil)` → `JoinByCodeSheet`。成功: 再読込 → `context = .room(roomId:)` → 閉 |
| 「+」→ QR で参加 | `scannerPresented = true` → `QRScannerScreen(onResult:onCancel:)` (既存部品)。`onResult(url)` → `scannerPresented = false; environment.appRouter.handleDeepLink(url)` → §3.5 の経路でこの画面に戻ってくる。友達招待の QR を読んだ場合は既存どおり友達タブへ飛ぶ (deep link の種別で分岐、`AppRouter.apply`) |
| 歯車 (ルーム選択中) | `sheet = .roomSettings(roomId:)` → `RoomSettingsSheet(roomId:isPresented:onChanged:onRemoved:)`。`onChanged` = rooms 再読込 (名前変更を chip に反映)。`onRemoved` (退出 / 削除成功) = `context = .self` + rooms 再読込 |

`RoomCreateSheet` / `JoinByCodeSheet` は `Features/Rooms/RoomJoinSheets.swift` へ移す (中身は下記の差分のみ)。

```swift
struct RoomCreateSheet: View {
    @Binding var isPresented: Bool
    let onCreated: (RoomDto) async -> Void        // ← 変更: 作った room を渡す (旧 () async -> Void)
}

struct JoinByCodeSheet: View {
    @Binding var isPresented: Bool
    var initialCode: String? = nil                // ← 追加。非 nil なら code に入れて表示直後に join を 1 回試みる
    let onJoined: (String) -> Void                 // 不変 (room.id)
    // 中の「QR コードで参加」ボタンと fullScreenCover は残す (Menu からの QR と同じ経路に合流する)
}

struct RoomSettingsSheet: View {
    let roomId: String
    @Binding var isPresented: Bool
    let onChanged: () async -> Void
    var onRemoved: (() -> Void)? = nil            // ← 追加。退出 / 削除成功時に呼ぶ。`router.roomsPath = NavigationPath()` の 2 行を置換し、`@Environment(AppRouter.self)` を外す
}
```

`initialCode` 付きの `JoinByCodeSheet` は、表示 (`.task`) で `joinRoom(inviteCode: RoomInviteCode.parse(initialCode))` を **1 回**試みる。成功 → `isPresented = false; onJoined(id)`。失敗 → シートは開いたまま `errorMessage = error.userFacingMessage` を出し、code 欄は編集可能 (ユーザーが直して再送できる)。旧 `JoinRoomView` (フル画面の「参加しています…/無効です」) はこれで置き換わるので削除する。

### 3.4 nav bar 右上の歯車 (2 条件は排反)

```swift
.toolbar {
    ToolbarItem(placement: .topBarLeading) { SemesterMenu(...) }.atenderPlainToolbarBackground()   // 不変
    if context == .self && mode == .timetable {                    // 不変: 時間割の設定
        ToolbarItem(placement: .topBarTrailing) { Button { showTimetableSettings = true } label: { Image(systemName: "gearshape") }
            .accessibilityLabel("時間割の設定") }
    }
    if case .room(let roomId) = context {                          // ★ 新設: ルームの設定 (時間割 / カレンダー両モード)
        ToolbarItem(placement: .topBarTrailing) { Button { sheet = .roomSettings(roomId: roomId) } label: { Image(systemName: "gearshape") }
            .accessibilityLabel("ルームの設定").accessibilityIdentifier("home-room-settings") }
    }
}
```

- 同時に出る条件は無い (`.self` と `.room` は排反)。`.self × .calendar` は従来どおり歯車なし
- シンボルは両方 `gearshape` (outline)。DESIGN.md §3.7.1「画面固有アクションは toolbar trailing」に従う。旧 `RoomDetailView` の本文中の浮遊歯車 (`gearshape.fill` + 自前丸背景) は画面ごと消える
- `RoomSettingsSheet` の機能 9 項目は §9 のとおり全て残る (シート自体は無変更)

### 3.5 deep link / QR の着地

```swift
// AppRouter
var pendingRoomJoinCode: String?                     // ← 追加 (roomsPath / RoomsRoute の代替)

private func apply(_ link: DeepLink) {
    switch link {
    case .roomJoin(let code):
        selectedTab = .home
        homePath = NavigationPath()                   // ホームの root に戻す
        pendingRoomJoinCode = code
    case .friendAdd(let code):                        // 不変
        selectedTab = .friends
        friendsPath.append(FriendsRoute.addByInvite(code))
    }
}
```

`HomeView` は `pendingRoomJoinCode` を **2 経路**で拾う (deep link が HomeView マウント前に届くと `onChange` が発火しないため):

```swift
.task { consumePendingRoomJoin() }
.onChange(of: environment.appRouter.pendingRoomJoinCode) { _, _ in consumePendingRoomJoin() }

private func consumePendingRoomJoin() {
    guard let code = environment.appRouter.pendingRoomJoinCode else { return }
    environment.appRouter.pendingRoomJoinCode = nil
    sheet = .roomJoin(initialCode: code)
}
```

`canNavigate` (設定未完了 / 未ログイン時に保留する) の仕組みは `AppRouter.handleDeepLink(_:canNavigate:)` のまま (`RootView.swift:41-61`)。

### 3.6 Web との IA 差 (明示的逸脱)

`CLAUDE.md` の「IA と機能は Web と共有 (ボトムタブ = 5 項目)」から **iOS だけ** 逸脱する。Web の `/rooms` `/rooms/:id` (`apps/web/src/routes/Rooms.tsx` `RoomDetail.tsx`) は据え置き。機能は 1 つも減らない (§9) — 変わるのは入口の位置だけ。Web の後追い (Rooms タブをホームに畳む) は別設計。CLAUDE.md / DESIGN.md の記述は §11 で置換する。

### 3.7 状態の網羅 (F1)

| 状態 | 表示 |
|---|---|
| ルーム 0 件 | chips = 「自分」+「+」。body は `.self` 経路。空状態の特別な面は作らない (「+」が Create 導線) |
| rooms 読み込み失敗 | chips = 「自分」+「+」(rooms は `[]` 扱い、現行 `(try? …) ?? []` のまま)。次の `.task` / `onChanged` で再取得 |
| 参加コードが無効 | `JoinByCodeSheet` 内に `errorMessage` (現行文言 `error.userFacingMessage`)。シートは閉じない |
| 退出 / 削除後 | `context = .self`、chip から消える |
| 選択中ルームが他端末で消えた | 既存の `RoomTimetable` / `RoomCalendar` のエラー表示に任せる (本設計で変えない) |

---

## 4. F3 — 授業変更 (振替)

### 4.1 データモデルの選択 (岐路の結論。詳細な比較は §15)

**採る形 = D'**: `MeetingOccurrence` は必須 FK `meetingId` を保ったまま、**nullable の `transferId` と `periodIndex` を足す**。振替 occurrence は「元の Meeting (写した曜日の授業) を指す、日付が曜日と一致しない occurrence」として通常の読み取り経路に **そのまま乗る**。生成・再生成・再調整の 3 箇所だけが `transferId` を見て振替を除外する。置き換えは `ClassTransferDisplacement` (meetingId, date) に記録し、**生成関数がその (meeting, date) をスキップ**することで安定させる (読み取り側は触らない)。

自動反映される根拠 (全部 `date` 範囲フィルタ):

| 読み取り | file:line | 振替 (追加) | 置き換え (削除) |
|---|---|---|---|
| 出席率 分母・分子 | `attendanceStats.ts:106-107` (`course.occurrences` を全走査) | 乗る | 消える |
| 学期カレンダーの日サマリー | `semesterOverview.service.ts:88-91` | 乗る (+ §4.7 `transferCount`) | 消える |
| 日別詳細 | `dayDetail.service.ts:29-33` | 乗る | 消える |
| 今日の出欠 CTA | `routes/today.ts:19-23` | 乗る | 消える |
| EventKit 書き出し | `occurrence.service.ts:56-60` → `CourseExportMapping.items` | 乗る | 消える |
| ルーム週 (カレンダー) | `room.service.ts:293-300` (`meetings` = occurrence) | 乗る | 消える |
| ルーム週 (時間割) | `room.service.ts:328-347` (`recurringMeetings` = 週パターン) | 乗らない (**意図どおり**。週パターンの表) | 変わらない |
| ホーム 個人カレンダー | `PersonalCalendar.swift:39-43` (**週パターンからクライアント展開**) | **乗らない → §4.6 で loader に足す** | **消えない → §4.6 で除外する** |
| ホーム 週間時間割 | `SelfTimetableView.swift:136-140` (週パターン) | 乗らない (意図どおり) | 変わらない |

`periodIndex` の導出 2 箇所 (`occurrence.service.ts:29`, `today.ts:42`) は `occurrence.periodIndex ?? (meeting.startPeriodIndex + periodOffset)` に変える (振替は写し先の時限を snapshot で持つため)。

### 4.2 Prisma (additive migration `20260908120000_class_transfer`)

```prisma
enum ClassTransferKind {
  MOVE_DAY   // ある曜日の時間割を丸ごとこの日に
  SINGLE     // 科目を 1 コマずつ
}

model ClassTransfer {
  id              String            @id @default(cuid())
  userTimetableId String
  userTimetable   UserTimetable     @relation(fields: [userTimetableId], references: [id], onDelete: Cascade)
  date            DateTime          // 振替先 (JST 00:00)
  kind            ClassTransferKind
  sourceDayOfWeek Int?              // MOVE_DAY のみ (0=日 … 6=土、Meeting.dayOfWeek と同じ JS 規約)
  sourceDate      DateTime?         // MOVE_DAY で「元の日を休講にする」を ON にした日 (表示用。休講の実体は TimetableSuspension)
  note            String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  occurrences   MeetingOccurrence[]
  displacements ClassTransferDisplacement[]

  @@index([userTimetableId, date])
}

/// 振替のせいでその日だけ開催されない通常授業。生成関数がこの (meetingId, date) をスキップする
model ClassTransferDisplacement {
  id         String        @id @default(cuid())
  transferId String
  transfer   ClassTransfer @relation(fields: [transferId], references: [id], onDelete: Cascade)
  meetingId  String
  meeting    Meeting       @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  date       DateTime

  @@unique([meetingId, date])
  @@index([transferId])
}

model MeetingOccurrence {
  // 既存列は不変
  transferId  String?
  transfer    ClassTransfer? @relation(fields: [transferId], references: [id], onDelete: Cascade)
  periodIndex Int?           // 振替のみ非 null (写し先の絶対時限)。通常 occurrence は null = 従来どおり meeting から導出
  @@index([transferId])
}
// Meeting に displacements ClassTransferDisplacement[]、UserTimetable に classTransfers ClassTransfer[] を追加
```

- **`periodOffset` の値 (振替行)** = `TRANSFER_PERIOD_OFFSET_BASE (= 1000) + periodIndex`。`@@unique([meetingId, date, periodOffset])` の中で通常行 (0 … periodCount−1 ≤ 11) と決して衝突しない。これにより「同じ科目が同じ日に通常 3限 + 振替 5限」(学期末の追加授業) も表現できる。定数は `occurrenceGen.ts` に export し、コメントで理由を書く
- Prisma の SQLite は FK 列追加を **テーブル再定義 SQL** (`CREATE TABLE new_… / INSERT INTO new_ SELECT … / DROP / RENAME`) で出す。データは保持される (破壊的変更ではない) が、Developer は生成された `migration.sql` を目視し、`INSERT INTO "new_MeetingOccurrence" … SELECT … FROM "MeetingOccurrence"` が `DROP` より前にあることを確認して報告に書く。本番 DB は build 12 の手順どおりデプロイ前に `/app/data/prod.db` をコピーしておく

### 4.3 生成・再生成・再調整の変更 (`apps/api`)

| 関数 | 変更 |
|---|---|
| `generateOccurrencesForMeetings` (`occurrenceGen.ts:15`) | 冒頭で `client.classTransferDisplacement.findMany({ where: { meeting: { userTimetableId } }, select: { meetingId, date } })` を読み、`Set("<meetingId>|<isoDate>")` を作る。日付ループ内で `skip.has(key)` なら `continue` (P2002 スキップと同じ場所) |
| `updateMeeting` (`meeting.service.ts:114`) | `deleteMany({ where: { meetingId, transferId: null } })`。振替行は残る (時限・時刻は snapshot なので週パターンの変更に追従しない = 意図どおり) |
| `reconcileOccurrencesForSemesterDateChange` (`occurrenceGen.ts:118`) | `outOfRange` の where に `transferId: null` を足す。**振替は学期日付の変更で消えない** |
| `deleteMeeting` (`meeting.service.ts:137`) / `DELETE /api/courses/:courseId` (`routes/courses.ts:54`) | 削除後に `pruneEmptyClassTransfers(userTimetableId)` を呼ぶ: `classTransfer.deleteMany({ where: { userTimetableId, occurrences: { none: {} }, displacements: { none: {} } } })`。FK cascade で occurrence / displacement が消えた後に空になった `ClassTransfer` を掃除する |

### 4.4 API (`routes/classTransfers.ts` / `services/classTransfer.service.ts` / `packages/shared/src/schemas/classTransfer.ts`)

```ts
// packages/shared/src/schemas/classTransfer.ts  (index.ts でバレル export)
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ClassTransferCreateInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("MOVE_DAY"),
    date: IsoDate,                                   // 振替先
    semesterId: z.string().optional(),               // 省略 = 既定学期 (findActiveUserTimetable と同じ規則)
    sourceDayOfWeek: z.number().int().min(0).max(6),
    suspendSourceDate: z.boolean().default(false),   // 元の日を休講にする
    sourceDate: IsoDate.optional(),                  // suspendSourceDate=true のとき必須
    liftTargetSuspension: z.boolean().default(false),// 振替先が休講日なら休講を解除して置く
    note: z.string().max(100).optional(),
  }),
  z.object({
    kind: z.literal("SINGLE"),
    date: IsoDate,
    semesterId: z.string().optional(),
    courseId: z.string(),
    periodIndexes: z.array(z.number().int().min(1).max(12)).min(1).max(12),
    liftTargetSuspension: z.boolean().default(false),
    note: z.string().max(100).optional(),
  }),
]);

export const ClassTransferDisplacedDto = z.object({
  meetingId: z.string(), courseId: z.string(), courseName: z.string(),
  startPeriodIndex: z.number().int(), periodCount: z.number().int(),
});

export const ClassTransferDto = z.object({
  id: z.string(),
  userTimetableId: z.string(),
  date: IsoDate,
  kind: z.enum(["MOVE_DAY", "SINGLE"]),
  sourceDayOfWeek: z.number().int().nullable(),
  sourceDate: IsoDate.nullable(),
  note: z.string().nullable(),
  occurrenceIds: z.array(z.string()),
  displaced: z.array(ClassTransferDisplacedDto),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ClassTransferDeleteResponse = z.object({
  removedOccurrences: z.number().int(),
  removedAttendanceRecords: z.number().int(),
  restoredOccurrences: z.number().int(),          // 置き換えられていた通常授業の再生成数
});
```

additive な既存 DTO 拡張 (`.optional()` で Web のフィクスチャ (`apps/web/tests/msw/handlers.ts` 等の `OccurrenceDto` リテラル) を壊さない):

```ts
// attendance.ts OccurrenceDto
transferId: z.string().nullable().optional(),
// day.ts DayDetailDto
transfers: z.array(ClassTransferDto).optional(),
// attendance.ts OccurrenceRangeDto
transfers: z.array(ClassTransferDto).optional(),
// semester.ts AttendanceDaySummary
transferCount: z.number().int().optional(),
```

ルート (`sessionMiddleware` + `setupGuard`、既存 `meetings.ts` と同じ並び):

| Method | Path | Body / Query | 成功 | 失敗 (AppError code) |
|---|---|---|---|---|
| POST | `/api/class-transfers` | `ClassTransferCreateInput` | 201 `{ transfer: ClassTransferDto }` | 400 `VALIDATION_ERROR` (zod) / 400 `OUT_OF_SEMESTER` / 400 `SAME_WEEKDAY` / 400 `NO_MEETINGS_ON_SOURCE_DAY` / 400 `COURSE_HAS_NO_MEETING` / 400 `DAY_SLOT_NOT_FOUND` / 400 `SOURCE_DATE_REQUIRED` / 403 `SETUP_REQUIRED` / 404 `NOT_FOUND` (course) / 409 `DAY_SUSPENDED` / 409 `PERIOD_CONFLICT` `{ conflictPeriod }` / 409 `DISPLACED_HAS_RECORD` `{ meetingId, courseName }` |
| DELETE | `/api/class-transfers/:id` | — | 200 `ClassTransferDeleteResponse` | 404 `NOT_FOUND` (他人のもの / 存在しない) |

**サービスの手順** (`createClassTransfer(userId, input)`、全部 1 トランザクション):

1. `timetable = findActiveUserTimetable(userId, input.semesterId)` (`activeTimetable.ts:3`、`include` に `semester` を足した版を使う)。無ければ 403 `SETUP_REQUIRED`
2. `date` が `semester.startDate…endDate` の外 → 400 `OUT_OF_SEMESTER`
3. 振替先に `TimetableSuspension` がある: `liftTargetSuspension` なら削除、でなければ 409 `DAY_SUSPENDED`
4. 置く時限の集合 `placed: Map<periodIndex, {meeting, offsetSource}>` を作る
   - MOVE_DAY: `targetDow = dayjs(date).tz(APP_TZ).day()`。`sourceDayOfWeek === targetDow` → 400 `SAME_WEEKDAY`。`sourceMeetings = timetable.meetings.filter(dayOfWeek === sourceDayOfWeek)`、空 → 400 `NO_MEETINGS_ON_SOURCE_DAY`。各 meeting の `startPeriodIndex … +periodCount−1` を placed に入れる (同じ曜日内で時限は重複しない = `createMeetingsBulk` の `PERIOD_CONFLICT` が保証)
   - SINGLE: course が timetable のものでなければ 404。`course.meetings` が空 → 400 `COURSE_HAS_NO_MEETING`。参照 Meeting = `meetings` を `(dayOfWeek, startPeriodIndex, id)` 昇順で並べた先頭。`periodIndexes` を placed に入れる
   - placed の各時限に `DaySlot` が無ければ 400 `DAY_SLOT_NOT_FOUND`
5. その日の既存 occurrence を読む (`where: { date, meeting: { userTimetableId } }, include: { meeting, attendanceRecord }`)
   - `transferId != null` の行で `periodIndex ∈ placed` → 409 `PERIOD_CONFLICT { conflictPeriod }` (振替同士は重ねない)
   - `transferId == null` の行で `meeting.startPeriodIndex + periodOffset ∈ placed` → その `meetingId` を **置き換え対象**に入れる (Meeting 単位。連続 2 コマの片方だけ重なっても Meeting 丸ごと)
   - 同じ日・時間割で既に押し出されている Meeting も、時限範囲が placed と重なるなら新しい振替の displacement に含め、最後の振替を取り消すまで復元しない。
   - 置き換え対象の meeting のその日の occurrence のどれかに `attendanceRecord` がある → 409 `DISPLACED_HAS_RECORD { meetingId, courseName }`
6. `ClassTransfer` を作る。置き換え対象ごとに `ClassTransferDisplacement` を作り、その meeting の通常 occurrence (`transferId: null`, その日) を `deleteMany`
7. placed の各時限に occurrence を作る: `{ meetingId, courseId: meeting.courseId, date, periodOffset: 1000 + p, periodIndex: p, startMinute: slot.startMinute, endMinute: slot.endMinute, transferId }`
8. MOVE_DAY かつ `suspendSourceDate`: `sourceDate` 無し → 400 `SOURCE_DATE_REQUIRED`。`TimetableSuspension` を `upsert` (`userTimetableId_date`、既にあれば触らない)、`reason` = `"M/D に授業変更"` (M/D = 振替先)。`ClassTransfer.sourceDate` に保存
9. DTO を返す

**削除** (`deleteClassTransfer(userId, id)`、1 トランザクション): 所有チェック (404) → occurrence と record の件数を数える → `classTransfer.delete` (cascade: occurrence → AttendanceRecord、displacement) → 置き換えていた meeting を `generateOccurrencesForMeetings(tx, { userTimetableId, meetings: displacedMeetings, fromDate: date, toDate: date })` で再生成 → 件数を返す。**元の日の `TimetableSuspension` は消さない** (休講は休講のまま。解除は日別シートの「休講を解除」)。

### 4.5 iOS — 入口と シート

入口は `DayDetailSheet` (学期・科目タブの日別シート) の **休講カードの直下に「授業変更」カード**を足す。カードの見た目は既存 `suspensionSection` と同じ (`bgMuted.opacity(0.5)` + `Radius.timetableCell`)。

```
┌ この日を休講にする (時間割全体) ── 既存 ────────────┐
│ [理由]  [この日を休講にする]                          │
└──────────────────────────────────────────────┘
┌ 授業変更 ────────────────────────────────────┐
│ 金曜日の時間割 (4コマ) · 9/11(金) を休講    [取り消す] │  ← detail.transfers を 1 行ずつ (kind で文言)
│ 情報数学 5限                              [取り消す] │
│ [ 授業変更 ]                                          │  ← AtenderButton .secondary .sm → ClassTransferSheet
└──────────────────────────────────────────────┘
授業 (5)  … 既存。振替の行には [振替] バッジ (§4.8)
```

- `detail.timetableSuspension != nil` のときもボタンは出す。シート側で「この日の休講は解除されます」を 1 行表示し、送信時 `liftTargetSuspension: true` を付ける (API が原子的に解除する。iOS で 2 回叩かない)
- 「取り消す」: その transfer の occurrence (= `detail.occurrences.filter { $0.transferId == transfer.id }`) に `status != nil` が 1 件でもあれば `confirmationDialog("出欠記録 N 件も削除されます")` → 確認後 `DELETE`。無ければ即 `DELETE`。成功後 `model.load()` + `onChanged()` (既存 `mutate` と同じ)

**シート** (`Features/SemesterOverview/ClassTransferSheet.swift`)。`DayDetailSheetKind` に `case transfer` を足し、既存の `.create/.edit` と同じ `BottomSheet(title: "授業変更", isPresented:, stackLevel: 2)` で出す (タイトル 4 文字、§3.7.4 規格内)。**シートは 1 枚、段階は 1**。インライン展開なし。

```
< 授業変更 ✕
[ 曜日ごと | コマごと ]                         ← Picker(.segmented)、ClassTransferMode

── 曜日ごと ──────────────────────────────
曜日   [ 月 | 火 | 水 | 木 | 金 | 土 | 日 ]       ← Picker(.segmented)。表示順は DayConvention (月始まり)
この日に置く授業                                 ← プレビュー (読み取り専用リスト)
  1限 情報数学
  2限 英語          → 月曜 2限 体育 を置き換え     ← 衝突は行末に赤字でなく textSecondary の注記
  3-4限 演習
[●] 元の日を休講にする   [ 9/11 (金) ▾ ]          ← Toggle (既定 ON) + DatePicker(.compact, .date)。範囲 = 学期
(休講日なら) この日の休講は解除されます
                              [ この日に反映 ]   ← footer primary

── コマごと ──────────────────────────────
科目   [ 情報数学 ▾ ]                            ← Menu (MeetingEditModal の create と同じ体裁)。meetings を持つ科目のみ
時限   (1)(2)(3)(4)(5)(6)                        ← PeriodChips(value:periodCount:) 再利用
  5限 → 空き
  3限 → 月曜 3限 体育 を置き換え
                                    [ 追加 ]      ← footer primary
```

- 送信成功 → シートを閉じ、`DayDetailSheet` を `load()` → `onChanged()` (学期カレンダーの再取得)。連続で 2 つ置く場合は「授業変更」をもう一度押す (時間割登録の `MeetingEditModal` と同じ 1 件 1 往復)
- 送信失敗 → `errorText` にサーバの code を日本語化して出す (`PERIOD_CONFLICT` →「N限は既に授業変更があります」/ `DISPLACED_HAS_RECORD` →「○○ (M/D) に出欠記録があるため置き換えられません。先に記録を消してください」/ `DAY_SUSPENDED` →「この日は休講です」/ 他は `error.userFacingMessage`)。シートは閉じない
- 曜日 Picker の既定値 = `ClassTransferLogic.defaultSourceDay(...)`: 表示順で最初の「meetings を 1 つ以上持ち、かつ振替先と違う曜日」。該当なし (授業が振替先の曜日にしか無い) → プレビューに「この曜日に授業はありません」/「この日と同じ曜日です」を出し footer 無効
- 元の日の既定値 = `ClassTransferLogic.defaultSourceDate(target:, sourceDayOfWeek:)`: 振替先より **前**で最も近いその曜日の日 (台風の金曜 → 翌月曜、祝日の月曜 → その週の木曜、の両方に合う)。学期開始より前になるなら学期開始以後で最初のその曜日
- 時間割データ: シートの `.task` で `timetableRepository.userTimetables()` から `semesterId` 一致の `UserTimetableDto` を取る (`meetings` / `courses` / `daySlots`)。無ければ「時間割がありません」+ footer 無効

**衝突プレビューの材料** = `DayDetailSheet` が既に持つ `detail.occurrences` (その日の通常 + 振替)。純関数 `ClassTransferLogic.preview(...)` に渡す (§7.3)。

### 4.6 iOS — 個人カレンダー (ホーム×カレンダー) への反映

`PersonalCalendarViewModel` の loader (`PersonalCalendar.swift:20-48`) に **`occurrenceRange`** を足す (`environment.calendarExportRepository.occurrenceRange(from: request.rangeStart, to: request.rangeEnd)`、42 日 ≤ 366 の上限内。失敗は overview と同様 `try?` で握り潰す = 授業の週パターン表示は生き残る):

```swift
let range = try? await environment.calendarExportRepository.occurrenceRange(from: request.rangeStart, to: request.rangeEnd)
let excluding = TransferDisplay.displacedKeys(range?.transfers ?? [])          // Set<"meetingId|date">
events += MeetingExpansion.expandUserTimetable(..., statusByDate: ..., excluding: excluding)
events += TransferDisplay.calendarEvents(occurrences: range?.occurrences ?? [], courses: timetable.courses)
```

- `MeetingExpansion.expandUserTimetable(... , excluding: Set<String> = [])`: ループ内 `for meeting in meetings where meeting.dayOfWeek == jsDay` に `guard !excluding.contains("\(meeting.id)|\(cursor)") else { continue }` を足す。default 引数なので既存 6 呼び出し・`MeetingExpansionTests` は無変更
- `TransferDisplay.calendarEvents` は `transferId != nil` の occurrence を (transferId, meetingId, date) で束ね、`PeriodGrouping.groupPeriods` で連続時限を 1 イベントにする。`CalendarEvent(kind: .meeting, id: "t:\(transferId):\(meetingId):\(date):\(run.start)", date:, title: "振替 \(courseName)", startMinute: run 内 min, endMinute: run 内 max, color: course.color ?? MemberColor.memberColor(courseId), subtitle: "振替", courseId:)`
- 日別シート (`CalendarDaySheetLogic.personalSections`) は `.meeting` を全部並べるので、振替行も「授業 (N)」に **タイトル「振替 ○○」のまま**出る (ロジック無変更)

### 4.7 iOS — 学期カレンダー (`AttendanceCalendar`) の振替バッジ

`AttendanceDaySummary.transferCount: Int?` (nil = 旧 API) が `> 0` の日セルに、選択チェック (`topTrailing` 16pt 丸) と **対称の `topLeading`** に 16pt の丸バッジを描く: `Text("振")` 8pt bold `textOnAccent` / 背景 `Color.accent500` / `offset(x: 4, y: 4)`。凡例に `振 = 授業変更` を 1 項目追加。円形格子・罫線規定 (§3.6.4) は不変。accent の用途は「選択状態 / primary action」(DESIGN §3.5) だが、選択チェックと同じ部品体系なので accent を採る (status 色は出欠の意味に予約)。

### 4.8 iOS — 日別シート (`DayOccurrenceRow`) の振替バッジ

`occurrence.transferId != nil` のとき、既存 `badge("科目休講中")` と同じ形で `badge("振替", color: .accent500)` を出す (優先: 休講中 > 科目休講中 > 振替。休講日には振替は存在しないので実際に同居するのは科目休講中と振替のみ)。

### 4.9 状態の網羅 (F3)

| 状態 | 表示 |
|---|---|
| 時間割が無い (`userTimetables` に semesterId 一致なし) | シート本文「時間割がありません」、footer 無効 |
| 振替先の曜日にしか授業が無い (MOVE_DAY) | 全曜日が無効相当。プレビュー「この日と同じ曜日です」/「この曜日に授業はありません」、footer 無効 |
| meetings を持つ科目が 0 (SINGLE) | 科目 Menu が空 →「先に時間割に科目を置いてください」、footer 無効 |
| 通信失敗 | `errorText` = `userFacingMessage`、シートは開いたまま |
| 振替先が休講日 | 注記 1 行 + `liftTargetSuspension: true` |
| 既に振替がある日 | 「授業変更」カードに一覧 + 各行「取り消す」。追加も可 |

---

## 5. F4 — 公欠を EventKit 書き出しから除外

### 5.1 変更 (`Core/Sync/CourseExportMapping.swift`)

```swift
enum CourseExportMapping {
    /// 端末カレンダーに出さない出欠ステータス。休講 (CANCELLED) は従来から、公欠 (EXCUSED) は build 18 で追加
    static let excludedStatuses: Set<AttendanceStatus> = [.cancelled, .excused]

    static func items(...) -> [ExportItem] {
        let kept = occurrences.filter { occurrence in
            if suspendedDates.contains(occurrence.date) { return false }                       // 不変
            if suspendedCourseDays.contains("\(occurrence.courseId)|\(occurrence.date)") { return false }  // 不変
            if let status = occurrence.status, excludedStatuses.contains(status) { return false }          // ← :16 を置換
            if occurrence.endMinute <= occurrence.startMinute { return false }                 // 不変
            return true
        }
        ...
```

ABSENT / TARDY / EARLY_LEAVE は残す (Leader 推奨: 欠席は「出るべきだった授業」、遅刻・早退は出席している)。裁定は §14。

### 5.2 「反映されない」と感じる原因 (仕様として明文化。実装変更なし)

| 経路 | 事実 (file:line) | 帰結 |
|---|---|---|
| 出欠を変えた直後 | `patchAttendance` → invalidate に `.semesters()` (`InvalidationMatrix.swift:43`) → `watchedPrefixes` に `semesters` (`CalendarSyncTrigger.swift:43-49`) → `sync(.dataChanged)` (`CalendarSyncCoordinator.swift:69-72`) | 書き出しは走る。ただし `.dataChanged` は **15 秒 throttle** (`CalendarSyncTrigger.swift:21, 37-39`): 直前 15 秒以内に sync が走っていたら**この変更は次の sync まで待つ** |
| アプリを閉じている間に他端末 / Web で変えた | sync はアプリプロセス内でだけ動く | 次回起動 (`sync(.appLaunch)`、`RootView.swift:37-40`、throttle バイパス) または foreground 復帰で反映 |
| 端末カレンダー側の表示 | `EventKitReconciler` が desired に無い自分の書き出しを削除 (既存契約) | 除外 = 削除。数秒〜15 秒後に消える |

→ 休講が「反映されない」と見えたのは、(a) 15 秒窓、(b) 非起動時は同期しない、のどちらか。Touri 実機で再現しなければ据え置き。

---

## 6. データモデル (Swift)

```swift
// Core/Models/Enums.swift
enum ClassTransferKind: String, UnknownFallbackRawRepresentable {
    case moveDay = "MOVE_DAY"
    case single  = "SINGLE"
    case unknown
}

// Core/Models/DTOs.swift  (★ 既存 DTO への追加は全部 `var … = nil` = memberwise init の既存呼び出し (テスト 15+ 箇所) を壊さない。Codable は Optional なので旧 API の欠落キーも decode できる)
struct OccurrenceDto {  /* 既存 13 プロパティ不変 */  var transferId: String? = nil }
struct DayDetailDto {   /* 既存 5 プロパティ不変 */   var transfers: [ClassTransferDto]? = nil }
struct OccurrenceRangeResponse { /* 既存 6 不変 */    var transfers: [ClassTransferDto]? = nil }
struct AttendanceDaySummary {    /* 既存 4 不変 */    var transferCount: Int? = nil }

struct ClassTransferDisplacedDto: Codable, Equatable, Identifiable {
    var id: String { meetingId }
    let meetingId: String
    let courseId: String
    let courseName: String
    let startPeriodIndex: Int
    let periodCount: Int
}

struct ClassTransferDto: Codable, Equatable, Identifiable {
    let id: String
    let userTimetableId: String
    let date: String
    let kind: ClassTransferKind
    let sourceDayOfWeek: Int?
    let sourceDate: String?
    let note: String?
    let occurrenceIds: [String]
    let displaced: [ClassTransferDisplacedDto]
    let createdAt: String
    let updatedAt: String
}

/// 送信用。nil のキーは JSONEncoder が省略するので zod の discriminatedUnion にそのまま通る
struct ClassTransferCreateInput: Codable, Equatable {
    let kind: ClassTransferKind
    let date: String
    var semesterId: String? = nil
    var sourceDayOfWeek: Int? = nil
    var suspendSourceDate: Bool? = nil
    var sourceDate: String? = nil
    var courseId: String? = nil
    var periodIndexes: [Int]? = nil
    var liftTargetSuspension: Bool? = nil
    var note: String? = nil
}

struct ClassTransferResponse: Codable, Equatable { let transfer: ClassTransferDto }
struct ClassTransferDeleteResponse: Codable, Equatable {
    let removedOccurrences: Int
    let removedAttendanceRecords: Int
    let restoredOccurrences: Int
}
```

---

## 7. API / 関数シグネチャ (iOS)

### 7.1 Endpoints / Repository / Invalidation

```swift
// Core/Networking/APIEndpoint.swift
static func createClassTransfer(_ body: ClassTransferCreateInput) -> APIEndpoint { .init(path: "/api/class-transfers", method: .post, body: body) }
static func deleteClassTransfer(id: String) -> APIEndpoint { .init(path: "/api/class-transfers/\(id)", method: .delete) }

// Core/Data/DayRepository.swift
func createClassTransfer(_ input: ClassTransferCreateInput) async throws -> ClassTransferDto
    // send → cache.invalidate(prefixes: invalidationTargets(for: .classTransfer(date: input.date)))
func deleteClassTransfer(id: String, date: String) async throws -> ClassTransferDeleteResponse
    // send → 同上

// Core/Data/InvalidationMatrix.swift
case classTransfer(date: String?)
// targets: compactKeys([.dayPrefix(), .semesters(), QueryKey(["stats"]), QueryKey(["today"]), .timetableSuspensions(), date.map { .dayDetail($0) }])
//   `.semesters()` が含まれる → CalendarSyncTrigger.isDataChange が true → EventKit 書き出しが走る (§4.1 の EventKit 行の実体)
```

### 7.2 Home (F1)

```swift
// App/AppRouter.swift
@MainActor @Observable final class AppRouter {
    var selectedTab: MainTab = .home
    var homePath = NavigationPath()
    var semesterPath = NavigationPath()
    var friendsPath = NavigationPath()          // roomsPath は削除
    var settingsPath = NavigationPath()
    var pendingDeepLink: DeepLink?
    var pendingRoomJoinCode: String?            // ← 追加
    func handleDeepLink(_ url: URL, canNavigate: Bool = true)          // 不変
    func applyPendingDeepLinkIfPossible(canNavigate: Bool)             // 不変
}
// RoomsRoute は削除。FriendsRoute は不変

// Features/Home/HomeCore.swift
enum HomeChips {
    static func items(rooms: [RoomSummaryDto]) -> [ContextChipItem]    // 不変
    // isVisible(rooms:) は削除
}
struct ContextChips: View {
    let items: [ContextChipItem]
    let selected: HomeContext
    let onChange: (HomeContext) -> Void
    let onAddRoom: (RoomAddAction) -> Void       // ← 変更 (旧 () -> Void)
}
```

### 7.3 授業変更の純関数 (`Features/SemesterOverview/ClassTransferLogic.swift`)

```swift
enum ClassTransferMode: String, CaseIterable, Equatable { case moveDay, single }   // segmented ラベル "曜日ごと" / "コマごと"

struct ClassTransferPreviewRow: Equatable, Identifiable {
    var id: Int { periodIndex }
    let periodIndex: Int
    let periodCount: Int              // 連続コマは 1 行 ("3-4限")
    let courseName: String
    let replaces: String?             // "月曜 3限 体育 を置き換え" / nil = 空き
    let blockedBy: String?            // "既に授業変更があります" (振替同士の衝突) / nil
}

enum ClassTransferLogic {
    /// 表示順 (月始まり) で最初の「meetings を持ち、target と違う曜日」。無ければ nil
    static func defaultSourceDay(targetDate: String, meetings: [MeetingDto]) -> Int?
    /// target より前で最も近い dow の日。semesterStart より前なら semesterStart 以後で最初の dow の日
    static func defaultSourceDate(targetDate: String, sourceDayOfWeek: Int, semesterStart: String) -> String
    /// MOVE_DAY のプレビュー。同日の既存 occurrence から置き換え / 衝突を求める
    static func previewMoveDay(targetDate: String, sourceDayOfWeek: Int, timetable: UserTimetableDto, existing: [OccurrenceDto]) -> [ClassTransferPreviewRow]
    /// SINGLE のプレビュー
    static func previewSingle(periodIndexes: [Int], courseId: String, timetable: UserTimetableDto, existing: [OccurrenceDto]) -> [ClassTransferPreviewRow]
    /// footer を押せるか: rows が空でなく、blockedBy が 1 つも無い
    static func canSubmit(_ rows: [ClassTransferPreviewRow]) -> Bool
    /// 「授業変更」カードの 1 行文言
    static func summary(_ transfer: ClassTransferDto) -> String
        // MOVE_DAY: "金曜日の時間割 (4コマ)" + (sourceDate != nil ? " · 9/11(金) を休講" : "")
        // SINGLE  : "\(courseName) 5限" / 連続は "3-4限" (courseName は displaced ではなく occurrence 側から。引数に occurrences: [OccurrenceDto] を足す)
    /// 削除確認が要るか (= その transfer の occurrence に status != nil がある)
    static func needsDeleteConfirmation(transfer: ClassTransferDto, occurrences: [OccurrenceDto]) -> Int   // 記録件数。0 なら確認不要
}

enum TransferDisplay {
    static func displacedKeys(_ transfers: [ClassTransferDto]) -> Set<String>            // "meetingId|date"
    static func calendarEvents(occurrences: [OccurrenceDto], courses: [CourseDto]) -> [CalendarEvent]
}

// Core/Timetable/TimetableLogic.swift
enum MeetingExpansion {
    static func expandUserTimetable(meetings:courses:daySlots:rangeStart:rangeEnd:semesterStart:semesterEnd:statusByDate:,
                                    excluding: Set<String> = []) -> [CalendarEvent]        // ← 引数追加 (default 付き)
}
```

---

## 8. 挙動仕様

Reviewer はここだけを根拠にテストを書く。#番号をテスト名に含める。**時刻依存の項目は標本を明記**。

### 8.1 F1 — ルームタブ廃止 (#R)

Swift ユニット:

- **#R1** `MainTab.allCases.count == 4`、順序は `[.home, .semester, .friends, .settings]`。`MainTab.rooms` はシンボルとして存在しない (参照した瞬間コンパイル不能なので、これは `NavigationTests` の書き換えで担保。新規テストは書かない)
- **#R2** `MainTab.friends.label == "友達"` / `.symbol == "person.crop.circle"`、`.settings` は `"設定"` / `"gearshape"` (既存の値が動いていないこと)。全 case の symbol が `UIImage(systemName:)` で非 nil (既存 #S10 の維持)
- **#R3** `AppRouter()` 初期値: `selectedTab == .home`、`pendingRoomJoinCode == nil`、`homePath.isEmpty`
- **#R4** `router.handleDeepLink(URL("atender://rooms/join/ABC"), canNavigate: true)` 後: `selectedTab == .home`、`pendingRoomJoinCode == "ABC"`、`homePath.isEmpty` (ホームの root に戻す)。`homePath` に 1 要素 push しておいてから叩いても空になる
- **#R5** 同じ deep link を `canNavigate: false` で叩くと `pendingDeepLink == .roomJoin(code: "ABC")`、`pendingRoomJoinCode == nil`、`selectedTab` は不変。その後 `applyPendingDeepLinkIfPossible(canNavigate: true)` で #R4 の状態になり `pendingDeepLink == nil`
- **#R6** `handleDeepLink(URL("https://atender.appily.run/friends/add/XYZ"))` は従来どおり `selectedTab == .friends`、`friendsPath.count == 1`、`pendingRoomJoinCode == nil` (ルーム経路に漏れない)
- **#R7** `HomeChips.items(rooms: [])` は `[.selfChip(label: "自分")]` (既存維持)。`HomeChips` に `isVisible` は無い (削除の担保はテストの書き換え。新規テストは書かない)
- **#R8** `HomeSheet.roomJoin(initialCode: nil).id == HomeSheet.roomJoin(initialCode: "ABC").id` (同一 identity。両方 "join") / `.roomSettings(roomId: "r1").id == "settings:r1"` / `.roomCreate.id == "create"`

XCUITest (`AtenderUITests`、API `localhost:8787` + seed 前提):

- **#R9** 起動直後、`app.tabBars.buttons` のラベル集合は `{"ホーム","学期・科目","友達","設定"}` で「ルーム」は存在しない
- **#R10** ホームに `context-chips` が存在し、その中に `rooms-add` が **1 個**ある。`rooms-add.frame.width > 20`。(seed ユーザーはルーム 1 件以上を持つので 0 件時の可視性は #R11 で別途)
- **#R11** (ルーム 0 件の可視性) `HomeChips.items(rooms: []).count == 1` かつ `HomeView` の `body` に `isVisible` ゲートが無いことを **ソース走査**で担保する: `Atender/Features/Home/HomeCore.swift` に文字列 `isVisible(rooms:` が含まれない (`B17RoomFeatureParityTests.testF9` と同じ手法)
- **#R12** `rooms-add` をタップすると `ルームを作成` / `リンクで参加` / `QR で参加` の 3 ボタンが現れる。`ルームを作成` → `room-create-sheet` が出る。`sheet-close` で閉じる
- **#R13** `rooms-add` → `リンクで参加` → `join-by-code-sheet` が出る。`参加` ボタンは code 空で disabled
- **#R14** seed のルーム名 (`情報処理科` を含む chip ボタン) をタップすると、nav bar に `home-room-settings` が出る。「自分」chip をタップすると消える。「自分」× `時間割` では `時間割の設定` ラベルのボタンが出、`カレンダー` では出ない
- **#R15** `home-room-settings` をタップすると `room-settings-sheet` が出る。中に `メンバー` を含む staticText と `ルーム名` 入力がある (機能 9 項目の存在は §9 で列挙。UI テストは代表 2 つ)
- **#R16** ルーム chip 選択中に `home-mode-picker` の `カレンダー` をタップすると月グリッドが出、`room-ics-import` がヘッダーに存在する (build 17 #B47 の Home 経路版)。`room-detail-tabs` はどこにも存在しない
- **#R17** (deep link 着地) `xcrun simctl openurl <udid> "atender://rooms/join/<seed の inviteCode>"` を送ると、選択タブが `ホーム` になり `join-by-code-sheet` が現れる (seed の inviteCode は `scripts/seed-demo-user.ts` の出力か API で取る。自分が既に居るルームの code なので、参加結果は成功 or 409 のどちらでもよく **シートが出ること**だけを見る)

### 8.2 F4 — 公欠の除外 (#E)

`CourseExportMappingTests` に追記 (既存 MC1-MC15 は無変更で緑):

- **#E1** `CourseExportMapping.excludedStatuses == [.cancelled, .excused]`
- **#E2** `status: .excused` の occurrence 1 件 → `items(...)` は空
- **#E3** 同日同 meeting の 2 コマ (offset 0 が `.excused`、offset 1 が `.present`) → item は **1 件**で `notes` の時限は offset 1 の時限だけ (`"4限"`、run が分割される)。start は offset 1 の startMinute
- **#E4** `status: .absent` / `.tardy` / `.earlyLeave` / `nil` はそれぞれ残る (4 件入れて 4 件出る)。既存 MC9「cancelled は消え absent は残る」も緑のまま
- **#E5** (負のコントロール) `excludedStatuses` を `[.cancelled]` に戻すと #E2 が赤くなること — Reviewer は #E2 を「status を `.cancelled` にした版でも空」の対で書き、両方の除外が同じ 1 箇所で決まっていることを示す
- **#E6** 配線の不変 (回帰防止): `CalendarSyncTrigger.isDataChange([QueryKey(["semesters"])]) == true`、`invalidationTargets(for: .patchAttendance).contains(.semesters())`、`CalendarSyncTrigger.throttle == 15`。**標本時刻**: `shouldRun(trigger: .dataChanged, now: T, lastRunAt: T−14s, …) == false` / `lastRunAt: T−15s` → `true` / `trigger: .appLaunch, lastRunAt: T−1s` → `true`

### 8.3 F3 — API (#T、`apps/api/tests/class-transfers.test.ts`。helpers の `setupCompleteUser` (periodIndex 1〜12 の DaySlot を seed) を使う)

標本: 学期 2026-04-06 〜 2026-09-30。金曜 Meeting M_F1 = 1限、M_F2 = 3-4限 (periodCount 2)。月曜 Meeting M_M1 = 1限、M_M2 = 5限。振替先 = **2026-09-14 (月)**、元の日 = 2026-09-11 (金)。

- **#T1** `POST { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 5 }` → 201。`transfer.kind == "MOVE_DAY"`、`occurrenceIds.length == 3` (1限 + 3限 + 4限)。`displaced` は `[M_M1]` (1限が重なる。5限の M_M2 は残る)。DB: 9/14 の occurrence は `M_F1(p=1) M_F2(p=3) M_F2(p=4) M_M2(p=5)` の 4 行、`M_M1` の 9/14 行は無い。振替行は `transferId == transfer.id`、`periodIndex == p`、`periodOffset == 1000 + p`、`startMinute/endMinute` はその DaySlot の値
- **#T2** #T1 の後 `GET /api/day/2026-09-14` → `occurrences` は 4 件で `periodIndex` が `[1,3,4,5]` (振替の `periodIndex` が **写し先**の値で返る = `occurrence.service.ts:29` の置換が効いている)、3 件は `transferId != null`、`transfers.length == 1`
- **#T3** #T1 の後 `GET /api/today?date=2026-09-14` の `periodIndex` も `[1,3,4,5]` (`today.ts:42` の置換)
- **#T4** #T1 の後 `GET /api/occurrences?from=2026-09-14&to=2026-09-14` → `occurrences` 4 件、`transfers[0].displaced[0].meetingId == M_M1`
- **#T5** #T1 の後 `GET /api/semesters/:id/overview` の `days` で `2026-09-14` の `occurrenceCount == 4`、`transferCount == 3`、`counts.unrecorded == 4` (今日より過去の標本なら) / 他の日の `transferCount == 0`
- **#T6** #T1 の後 `GET /api/stats?semesterId=` で M_F1 の科目の `generatedOccurrences` が **+1** (振替が分母に乗る)、M_M1 の科目は **−1** (置き換えで消える)。振替 occurrence に `PATCH /api/occurrences/:id/attendance {status: PRESENT}` すると `counts.present` が +1
- **#T7** `suspendSourceDate: true, sourceDate: "2026-09-11"` を付けた MOVE_DAY → 201 かつ `GET /api/day/2026-09-11` の `timetableSuspension != null`、`reason == "9/14 に授業変更"`。同じ日に既に休講があっても 201 (upsert、reason は上書きしない)。`suspendSourceDate: true` で `sourceDate` 省略 → 400 `SOURCE_DATE_REQUIRED`
- **#T8** `sourceDayOfWeek: 1` (振替先と同じ月曜) → 400 `SAME_WEEKDAY`。授業の無い曜日 (`sourceDayOfWeek: 0`) → 400 `NO_MEETINGS_ON_SOURCE_DAY`
- **#T9** `date: "2026-10-01"` (学期外) → 400 `OUT_OF_SEMESTER`
- **#T10** 振替先 9/14 に `TimetableSuspension` を先に作ってから MOVE_DAY → 409 `DAY_SUSPENDED`。`liftTargetSuspension: true` なら 201 で、`GET /api/day/2026-09-14` の `timetableSuspension == null`
- **#T11** M_M1 の 9/14 occurrence に出欠記録を付けてから MOVE_DAY (1限が重なる) → 409 `DISPLACED_HAS_RECORD`、`details.meetingId == M_M1`。DB に `ClassTransfer` 行は増えていない (トランザクションが巻き戻る)
- **#T12** `POST { kind: "SINGLE", date: "2026-09-14", courseId: <M_F1 の科目>, periodIndexes: [5] }` → 201、`occurrenceIds.length == 1`、その行の `meetingId == M_F1`、`periodIndex == 5`、`periodOffset == 1005`。`displaced == [M_M2]` (5限が重なる)
- **#T13** SINGLE `periodIndexes: [2, 6]` (どちらも空き) → 201、`displaced == []`、`occurrenceIds.length == 2`
- **#T14** #T1 (MOVE_DAY が 1限 を使用) の後に SINGLE `periodIndexes: [1]` → 409 `PERIOD_CONFLICT`、`details.conflictPeriod == 1`
- **#T15** SINGLE で meetings を持たない科目 → 400 `COURSE_HAS_NO_MEETING`。他人の科目 → 404 `NOT_FOUND`。`periodIndexes: [12]` で DaySlot 12 が無い時間割 → 400 `DAY_SLOT_NOT_FOUND` (helper は 1〜12 を seed するので、このケースは DaySlot を 1〜5 だけ持つ時間割を別途作る)
- **#T16** (同じ科目・同じ日に通常 + 振替) M_F1 の科目を **金曜 2026-09-18** に SINGLE `periodIndexes: [5]` → 201。9/18 の occurrence は `M_F1(p=1, offset 0)` と `M_F1(p=5, offset 1005)` の 2 行 (unique 衝突しない)
- **#T17** `DELETE /api/class-transfers/:id` (#T1 のもの) → 200 `{ removedOccurrences: 3, removedAttendanceRecords: 0, restoredOccurrences: 1 }`。9/14 の occurrence は `M_M1(p=1) M_M2(p=5)` の 2 行に戻る。`ClassTransfer` / `ClassTransferDisplacement` 行は無い。**9/11 の TimetableSuspension は残っている** (#T7 と組み合わせた版)
- **#T18** 振替 occurrence に出欠記録を付けてから DELETE → 200 `removedAttendanceRecords == 1`、`AttendanceRecord` 行が消えている
- **#T19** 他人の transfer を DELETE → 404 `NOT_FOUND`、行は残る
- **#T20** (`updateMeeting` の巻き添え防止) #T1 の後 `PATCH /api/meetings/M_F1 { room: "302" }` (スケジュール不変) → 振替行は残る。`PATCH /api/meetings/M_F1 { startPeriodIndex: 2 }` (スケジュール変更) → 金曜の通常 occurrence は 2限で再生成されるが、**9/14 の振替行は `periodIndex == 1` のまま残る** (snapshot)
- **#T21** (置き換えの安定) #T1 の後 `PATCH /api/meetings/M_M1 { room: "x", startPeriodIndex: 1 }` (同値だが scheduleChanged は false) と `PATCH { startPeriodIndex: 2 }` (true) のどちらでも、再生成後に **M_M1 の 9/14 行は作られない** (displacement をスキップ)
- **#T22** (`reconcile` が振替を消さない) #T1 の後 `PATCH /api/semesters/:id { endDate: "2026-09-10" }` (振替先が範囲外になる) → 9/14 の振替行 3 件は残る。通常の 9/14 `M_M2` 行 (記録なし) は消える
- **#T23** (`deleteMeeting` の掃除) #T12 (SINGLE、参照 M_F1、displaced M_M2) の後 `DELETE /api/meetings/M_F1` → 振替行は cascade で消え、displacement は残る (M_M2 は生きている) ので `ClassTransfer` 行は **残る** (`displaced` が非空)。続けて `DELETE /api/meetings/M_M2` → displacement も消え、`ClassTransfer` 行が **消える** (`pruneEmptyClassTransfers`)
- **#T24** `DELETE /api/courses/:courseId` (M_F1 の科目) でも #T23 と同じ掃除が走る
- **#T25** (additive の互換) `GET /api/day/:date` / `GET /api/occurrences` / overview の既存フィールドは全て従来どおりの型で返り、振替が 0 件の日は `transfers == []`、`transferCount == 0`。既存 `tests/day-detail.test.ts` `occurrence-range.test.ts` `semester-day-counts.review.test.ts` は無変更で緑 (ベースライン集合が変わらない)
- **#T26** 未知の `kind` → 400 `VALIDATION_ERROR` (zod の discriminatedUnion)。`periodIndexes: []` → 400
- **#T27** `GET /api/occurrences?from&to&semesterId=<非既定学期>` はその学期の時間割の transfers / displaced を返す。`semesterId` 省略時は従来どおり既定学期 (EventKit 書き出しも既定学期)。個人カレンダーは表示中の学期を渡す
- **#T28** 9/14 の同じ Meeting (1–2限) を 2 つの振替 (1限 / 2限) が押し出しているとき、片方の取り消しでは `restoredOccurrences: 0`、その日の行に当該 Meeting は無い。両方取り消すと通常授業 2 コマが復元される

### 8.4 F3 — iOS (#U)

Swift ユニット (`ClassTransferLogic` / `TransferDisplay` / `MeetingExpansion`):

- **#U1** `defaultSourceDay(targetDate: "2026-09-14"(月), meetings: [M_F1(金), M_M1(月)])` → `5` (金)。`meetings: [M_M1(月)]` のみ → `nil`。`meetings: [M_W(水), M_F(金)]` → `3` (水。表示順で先)
- **#U2** `defaultSourceDate(targetDate: "2026-09-14", sourceDayOfWeek: 5, semesterStart: "2026-04-06")` → `"2026-09-11"`。`targetDate: "2026-04-07"(火), sourceDayOfWeek: 5` (直前の金曜 4/3 は学期前) → `"2026-04-10"`
- **#U3** `previewMoveDay(target: "2026-09-14", source: 5, timetable: {M_F1=1限, M_F2=3-4限}, existing: [M_M1 通常 p=1, M_M2 通常 p=5])` → 2 行: `{p:1, count:1, courseName: F1科目, replaces: "月曜 1限 M1科目 を置き換え", blockedBy: nil}`, `{p:3, count:2, courseName: F2科目, replaces: nil, blockedBy: nil}`。`canSubmit == true`
- **#U4** `existing` に振替 occurrence (`transferId != nil`, p=1) がある → 1 行目の `blockedBy == "既に授業変更があります"`、`canSubmit == false`
- **#U5** `previewSingle(periodIndexes: [3,4,6], courseId: C, timetable:, existing: [M_M2 通常 p=5])` → 2 行 (`3-4限` と `6限`)、`replaces` は両方 nil。`periodIndexes: []` → 空、`canSubmit == false`
- **#U6** `summary(MOVE_DAY, sourceDayOfWeek: 5, sourceDate: "2026-09-11", occurrences: 3 件)` → `"金曜日の時間割 (3コマ) · 9/11(金) を休講"`。`sourceDate: nil` → `"金曜日の時間割 (3コマ)"`。`summary(SINGLE, occurrences: [p=3, p=4] 情報数学)` → `"情報数学 3-4限"`
- **#U7** `needsDeleteConfirmation(transfer, occurrences: [{transferId: t, status: .present}, {transferId: t, status: nil}, {transferId: "other", status: .absent}])` → `1`
- **#U8** `TransferDisplay.displacedKeys([transfer{date: "2026-09-14", displaced: [M_M1]}])` == `["M_M1|2026-09-14"]`
- **#U9** `TransferDisplay.calendarEvents(occurrences: [t/M_F2 p=3 540-630, t/M_F2 p=4 640-730, t/M_F1 p=1 …], courses:)` → 2 イベント。M_F2 のものは `startMinute 540 / endMinute 730 / title "振替 F2科目" / subtitle "振替" / kind .meeting / courseId F2`。`transferId == nil` の occurrence は無視される (0 件)
- **#U10** `MeetingExpansion.expandUserTimetable(..., excluding: ["M_M1|2026-09-14"])` は 9/14 の M_M1 イベントを含まず、9/7 と 9/21 の M_M1 は含む。`excluding` 省略時は従来と同一の配列 (既存 `MeetingExpansionTests` 全件が無変更で緑)
- **#U11** DTO decode: `{"...OccurrenceDto の 13 キー..."}` (transferId 無し) が decode でき `transferId == nil`。`"transferId": "t1"` 付きも decode できる。`DayDetailDto` の `transfers` 欠落 → nil、`AttendanceDaySummary` の `transferCount` 欠落 → nil。`ClassTransferKind` の未知値 `"FOO"` → `.unknown`
- **#U12** `ClassTransferCreateInput(kind: .moveDay, date: "2026-09-14", sourceDayOfWeek: 5, suspendSourceDate: true, sourceDate: "2026-09-11")` を `JSONEncoder` で encode すると、キーは `kind date sourceDayOfWeek suspendSourceDate sourceDate` の 5 個だけ (nil は省略される)
- **#U13** `invalidationTargets(for: .classTransfer(date: "2026-09-14"))` は `.dayPrefix()` `.semesters()` `["stats"]` `["today"]` `.timetableSuspensions()` `.dayDetail("2026-09-14")` を全て含む。`CalendarSyncTrigger.isDataChange(それ) == true`
- **#U14** `Endpoints.createClassTransfer(...)` は `POST /api/class-transfers`、`deleteClassTransfer(id: "t1")` は `DELETE /api/class-transfers/t1`

XCUITest:

- **#U15** 学期・科目 → 出席カレンダーの日セル (今日以降で学期内の平日) をタップ → `day-detail-sheet` に `授業変更` ボタンがある。タップ → タイトル `授業変更` の staticText が **中央** (frame.midX が画面幅の 0.5 ± 0.08) に出、`曜日ごと` `コマごと` のセグメントがある
- **#U16** `コマごと` → 科目 Menu を開いて先頭を選び、時限チップ `6` をタップ → `追加` が enabled になりタップ → シートが閉じ、`day-detail-sheet` の `授業 (N)` の N が +1、`振替` バッジの staticText が 1 個以上ある。同シートの「授業変更」カードに `取り消す` が 1 個ある
- **#U17** #U16 の続き: `取り消す` をタップ → (記録なしなので確認なし) `授業 (N)` が元の値に戻り `振替` が消える
- **#U18** #U16 の状態でホーム → カレンダー → その月に移動 → その日セルのラベルに `振替` を含む chip テキストがある (`app.staticTexts` で `BEGINSWITH "振替 "`)。日セルをタップした日別シートの「授業」節にも同じタイトルの行がある
- **#U19** #U16 の状態で学期・科目の出席カレンダーのその日セルに `振` の staticText がある (バッジ)

### 8.5 版数 (#V)

- **#V1** `apps/ios/project.yml` が `CFBundleVersion: "18"` を含み、`"17"` を含まない。`CFBundleShortVersionString: "1.0"` は不変
- **#V2** `MIN_IOS_BUILD (= 12) <= 18` (既存 `testV2` の維持)。API のレスポンス形は additive のみなので `MIN_IOS_BUILD` は **据え置き**
- **#V3** `Atender/Info.plist` は手編集せず `xcodegen generate` の出力をコミットする (`CFBundleVersion == "18"`)

---

## 9. 機能対応表 — ルームタブが持っていた機能の行き先 (捨てていない証明)

| # | 機能 (旧 場所) | build 18 での行き先 |
|---|---|---|
| 1 | ルーム一覧カード (`RoomsView` / `RoomCard`) | **廃止** (§3.1)。一覧の情報 (名前 / メンバー数 / 次の予定) のうち名前は chip、他はルーム選択後の時間割・カレンダーで読む。`RoomCard` `RoomTint` `RoomsViewModel` は削除 |
| 2 | 作成 (`RoomCreateSheet`) | ホーム「+」→「ルームを作成」。シートは移動のみ (§3.3) |
| 3 | リンク / コードで参加 (`JoinByCodeSheet`) | ホーム「+」→「リンクで参加」。`initialCode` が付いた |
| 4 | QR で参加 (`JoinByCodeSheet` 内のボタン → `QRScannerScreen`) | ホーム「+」→「QR で参加」で **直接**スキャナー。シート内のボタンも残る (2 経路が同じ deep link に合流) |
| 5 | 招待コード着地 (`JoinRoomView`、push 画面) | `JoinByCodeSheet(initialCode:)` の自動参加 (§3.3, §3.5)。`JoinRoomView` は削除 |
| 6 | ルーム詳細 (`RoomDetailView`: 名前 + 説明ヘッダー / セグメント / 時間割 / カレンダー / 歯車) | ホームの `.room` 文脈 (build 17 で既に同じ `RoomTimetable` / `RoomCalendar` / `CalendarModePicker` を使っている)。名前 = chip、説明 = `RoomSettingsSheet` 内。**`RoomDetailView.swift` は削除** → Researcher R4 の「`semesterId` 未配線」は消滅する |
| 7-15 | 設定シート 9 項目 (名前・説明編集 / showMemberTimetables / メンバー + 追放 / 招待リンク + QR 表示・コピー・共有・再発行 / 自分のカレンダー共有 3 モード / マスクルール / ICS 取込 / 退出 / 削除) | `RoomSettingsSheet` を nav bar 歯車から開く (§3.4)。シート本体は **無変更** (`onRemoved` 追加と `router.roomsPath` 2 行の置換のみ) |
| 16 | 「みんなの時間割」(`TemplatesView`、`.templates` ルート) | 到達不能な死ルート (build 16 #N6 で導線を消した)。**削除** (§10、裁定 #4) |

---

## 10. 削除対象 (`git ls-files` で tracked 判定、import 元を grep 済)

| 対象 | tracked | 最後の本番参照 | 処置 |
|---|---|---|---|
| `Atender/Features/Rooms/RoomsView.swift` の `RoomsViewModel` `RoomsView` `RoomCard` `RoomTint` `JoinRoomView` | yes | `MainTabView.swift:50,56` | 削除。`RoomCreateSheet` `JoinByCodeSheet` は `RoomJoinSheets.swift` へ移してファイルを消す |
| `Atender/Features/Rooms/RoomDetailView.swift` (`RoomDetailViewModel` `RoomDetailView`) | yes | `MainTabView.swift:54` | 削除 |
| `Atender/Features/Rooms/TemplatesView.swift` (`TemplatesView` `TemplatesViewModel`) | yes | `MainTabView.swift:58` (到達不能) | 削除 (裁定 #4。`TemplateLogic` は `RoomLogic.swift` に残す — 純関数 + テストあり) |
| `App/AppRouter.swift` の `RoomsRoute` / `roomsPath` | yes | `MainTabView.swift:49-63`, `RoomSheets.swift:359,369`, `RoomsView.swift` | 削除 (§3.5, §3.3) |
| `App/MainTabView.swift` の `.rooms` case + タブブロック | yes | — | 削除 |
| `HomeCore.swift` の `HomeChips.isVisible` | yes | `HomeCore.swift:47` | 削除 |
| `AtenderTests/TemplatesViewModelTests.swift` (9 メソッド) | yes | `TemplatesViewModel` | 削除 (VM と同時) |

**孤児化の報告** (削除しない): `RoomCardLogic.upcomingLabel` (`RoomLogic.swift:263`、`RoomLogicTests:537` にテスト) — `RoomCard` が消えて本番参照 0 になる。純関数なので残す (build 17 の `AvailabilityBar` と同じ扱い)。

---

## 11. DESIGN.md / CLAUDE.md への置換 (P1 と同時に実施)

| ファイル・節 | 旧 | 新 |
|---|---|---|
| `projects/atender/CLAUDE.md:36` | 「ボトムタブ = 5項目 (ホーム/学期・科目/ルーム/友達/設定)」 | 「Web のボトムナビは 5 項目、**iOS は 4 タブ (ホーム/学期・科目/友達/設定)** — ルームは iOS ではホームの context chip に集約 (2026-09 build 18、`.designs/20260908-…`)。機能は Web と共有、入口だけが違う」 |
| `DESIGN.md §3.7.1` 見出しと本文 | 「トップレベル 5 タブ (ホーム / 学期・科目 / ルーム / 友達 / 設定)」「タイトル = そのタブの日本語名 (「ホーム」「学期・科目」「ルーム」「友達」「設定」)」 | 4 タブに置換。ルームの語を消す |
| `DESIGN.md §3.7.1` 裁定注 (:206) / §8 (:316) / §9-2 (:332) の「5 タブ全部」 | 「5 タブ」 | 「全タブ」 (数を書かない) |
| `DESIGN.md §3.7.2` | 「詳細画面 (ルーム詳細 / テンプレート / 科目詳細)」「現状 `RoomDetailView` は…」 | ルーム詳細・テンプレートの例示を消し、「プロミネントな content header を持つ詳細画面」のパターン規定だけ残す (適用例: 科目詳細)。`RoomDetailView` への言及を削除 |
| `DESIGN.md §2` 診断表のヘッダー行 | 「ルーム詳細 = カスタム丸 back + …」 | 行を削除 (画面が無くなる) |
| `DESIGN.md §3.6.4` (学期の出席カレンダー) | — | 「振替バッジ: `transferCount > 0` の日は topLeading に 16pt の accent 丸 + 「振」8pt bold」を追記 (新領域なので追記) |
| `DESIGN.md §3.6.3` イベント行 | — | 「振替の chip はタイトル先頭に「振替 」を付ける (chip は 14pt でバッジを置く余地が無い)」を追記 |

`.designs/20260730-ios-unify-calendar-build17.md` は履歴なので触らない (§0 に「ルームタブの廃止は別設計」と書いてあり、それが本 doc)。

---

## 12. テスト基盤

- **iOS ユニット**: `AtenderTests` (XCTest)。ベースライン **643 GREEN / 0 RED** (`.knowledge/known-failures.md` iOS 節、build 17 合流後)。実行: `/opt/homebrew/bin/xcodegen generate` → `xcodebuild test -project Atender.xcodeproj -scheme Atender -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.2'`
- **iOS UI**: `AtenderUITests` (XCUITest)。`localhost:8787` の API + `scripts/seed-demo-user.ts` が前提 (停止時の失敗は「環境依存」)。deep link は `xcrun simctl openurl`
- **API**: `apps/api` の Vitest (`pnpm exec vitest run`)。ベースライン失敗集合は台帳 (A1-A5, A7, A8 / B1-B5 / Magic Link 4 / C1-C6 / .env 漏れ 5) と **集合一致**であること。新規テストは `tests/class-transfers.test.ts` (#T1-#T26)、既存 helper `setupCompleteUser` / `createOccurrence` (`tests/helpers/auth.ts:142,164`) を使う。振替行を直接 seed するときは `createOccurrence` に `periodOffset: 1000 + p` を渡し、`periodIndex` / `transferId` は `prisma.meetingOccurrence.update` で足す (helper 自体は触らない)
- **新規テストの置き場**:
  - `AtenderTests/B18RoomsHomeTests.swift` — #R1-#R8
  - `AtenderTests/CourseExportMappingTests.swift` に追記 — #E1-#E6 (#E6 は `CalendarSyncTriggerTests` / `InvalidationMatrixPhaseDTests` への追記でもよい)
  - `AtenderTests/B18ClassTransferLogicTests.swift` — #U1-#U10
  - `AtenderTests/B18ClassTransferDTOTests.swift` — #U11-#U14
  - `AtenderTests/B18BuildVersionTests.swift` — #V1-#V3 (B17 版の書き換えでもよい。§12.1)
  - `AtenderUITests/B18RoomsHomeUITests.swift` — #R9-#R17
  - `AtenderUITests/B18ClassTransferUITests.swift` — #U15-#U19
  - `apps/api/tests/class-transfers.test.ts` — #T1-#T26

### 12.1 意図的に壊れる既存テスト (ユニット 7 メソッド + UI 7 メソッド。他に 1 ファイル 9 メソッドを削除)

| テスト | フェーズ | 処置 |
|---|---|---|
| `NavigationTests.testMainTabMetadataMatchesWebNavigation` | P1 | `allCases.count == 4`、`.rooms` の 2 assert を削除。メソッド名を `…MatchesDesignedTabs` に (Web と一致しなくなるため) |
| `NavigationTests.testAppRouterInitialAndChangedSelectedTab` | P1 | `router.selectedTab = .rooms` → `.friends` に置換 |
| `B17RoomFeatureParityTests.testF8DesignedFileLayoutExists` | P1 | 期待リストから `Atender/Features/Rooms/RoomDetailView.swift` を削除 |
| `B17RoomFeatureParityTests.testF9DeletedSymbolsAreGone` | P1 | `RoomDetailView.swift` を読む先頭 4 行 (read + 3 assert) を削除。全ソース走査の `banned` に `"RoomDetailTab"` `"RoomsRoute"` `"roomsPath"` `"isVisible(rooms:"` を追加 (走査部分がそのまま担保になる) |
| `BuildVersionTests.testV1BundleVersionIs17` | P1 | `18` に更新 (メソッド名も `…Is18`) |
| `B17BuildVersionTests.testB61ProjectYmlBundleVersionIs17` | P1 | `"18"` を含み `"17"` を含まない、に更新 |
| `B17BuildVersionTests.testB61bInfoPlistMatchesProjectYml` | P1 | `"18"` に更新 |
| `TemplatesViewModelTests` (ファイル、9 メソッド) | P1 | **削除** (`TemplatesViewModel` と同時。裁定 #4) |
| `B16NavTrailingUITests.testN4N5N6N7RoomsTrailingMenu` | P1 | `openTab("ルーム")` → ホームのまま `rooms-add` を探す。`frame.minY < 160` (nav bar 位置) の assert は **削除** (chip 行に移るため) → 代わりに `context-chips` の子であることを確認。#N6 (`rooms-templates` 不在) と #N7 (2 項目 → **3 項目**、`QR で参加` を追加) は維持。`assertNoBodyHeading("ルーム")` は削除 |
| `B16NavTrailingUITests.testD21RoomDayCellOpensDaySheet` | P1 | `openTab("ルーム")` + カードタップ → ホームで `情報処理科` を含む chip をタップ、`home-mode-picker` の `カレンダー` へ。以降は不変 |
| `B17CalendarUITests.openRoomDetail()` (helper) と依存 5 本 `testB47RoomFabsAreGoneAndIcsMovedToHeader` / `testB48RoomDetailTabsDefaultToTimetable` / `testB49RoomLongPressOpensEditor` / `testR2RoomTapOpensDaySheetWithAddAction` / `testB54RoomIcsModalTitleIsFullyVisible` | P1 | helper をホーム経路 (chip タップ → `home-mode-picker` 存在) に書き換える。#B48 の `room-detail-tabs` → `home-mode-picker`、「既定で時間割」は Home のセグメント既定 (`.timetable`) をそのまま見る |

**失敗はしないが意味を失うので書き換える**: `ScreenshotFlow.testPhaseBFlow` のタブループ `["学期・科目", "ルーム", "友達", "設定"]` から `"ルーム"` を外す。`testPhaseDFlow` の「ルームタブ → カード」をホームの chip 経路に変え、スクショ名 `E01-rooms-list` を `E01-home-room-chip` に (`tapButton` は soft なので現状でも赤くはならない)。

**壊れないことを確認した既存テスト**:
- `HomeChipsTests` (3 メソッド): `items` のみを見る。`isVisible` は参照なし
- `DeepLinkTests`: `DeepLink.parse` は不変
- `RoomLogicTests` (`RoomCardLogic` / `TemplateLogic` / `resolveDaySlots`): シンボルは残す
- `RoomWeekContractTests`: コメントに `RoomDetailView` があるだけ (`:86,95`)。コードは `RoomWeekDto` の decode
- `CourseExportMappingTests` MC1-MC15: `.excused` を使う既存ケースは無い (grep 済)。MC9 は `.cancelled` 除外 + `.absent` 残存で不変
- `MeetingExpansionTests` / `PersonalCalendarLogicTests` / `B17CalendarMonthStoreTests`: `excluding` は default 引数、loader の追加 fetch は fake loader の外
- `DTODecodingTests` / `DTODecodingPhaseBTests` / `ExportDTODecodingTests`: 追加プロパティは全て Optional + default
- API: `meetings.test.ts` `meeting.bulk.test.ts` `occurrence-gen.test.ts` (B3 は既知失敗のまま) `day-detail.test.ts` `occurrence-range.test.ts` `today.test.ts` `semester-day-counts.review.test.ts` `roomWeek.test.ts` — additive のみ。`periodIndex ?? 導出` は通常行 (`periodIndex == null`) で従来値
- Web (`apps/web`): 触らない。shared の追加は `.optional()` なので型チェックも通る (ベースライン 26 failed は不変)

### 12.2 検証手順

1. `xcodegen generate` → iOS ユニット全走 → **643 − 9 (Templates) + 新規 (#R1-8, #E1-6, #U1-14, #V1-3 ≈ 31) ≈ 665 前後 GREEN / 0 RED**。件数を台帳に記録
2. `apps/api` Vitest → 失敗集合がベースラインと `diff` exit 0。`class-transfers.test.ts` 26 件 GREEN
3. `prisma migrate dev` の出力 SQL を目視 (§4.2 の再定義順序)。`pnpm exec prisma migrate deploy` をローカル `dev.db` のコピーに当てて既存 occurrence 件数が前後で一致することを確認
4. XCUITest (API 起動済) → #R9-#R17, #U15-#U19。`ScreenshotFlow` で `01-home-timetable` (chip 行が常時表示)、`E01-home-room-chip`、`C01-semester-overview` (振替バッジ) を目視
5. TestFlight build 18 + `atender-api` の Coolify デプロイ (P2 は API を含む) — **最終ゲート**

---

## 13. フェーズ (2 本。各フェーズ単独でマージ可)

### P1 — `feature/b18-home-rooms-and-export` (iOS のみ。F1 + F4 + 版数)

内容: §3 全部 / §5.1 / §8.5 / §10 の削除 / §11 の置換 / §12.1 の書き換え。
- 単独マージ可の条件: API 変更なし。`MIN_IOS_BUILD` 不変。build 17 の `RoomTimetable(roomId:semesterId:available:)` / `RoomCalendar(...)` / `CalendarModePicker` をホームから呼ぶだけで、ルーム機能の実体は動かさない
- テスト: #R1-#R17, #E1-#E6, #V1-#V3
- 成果物: TestFlight build 18 に出せる状態 (F3 が無くても出荷可)

### P2 — `feature/b18-class-transfer` (API + iOS。F3)

内容: §4 全部 / §6 / §7.1 / §7.3 / §8.3 / §8.4。
- 単独マージ可の条件: API は additive (新 route + nullable 列 + optional フィールド)。**旧 iOS (build ≤ 17) は新フィールドを無視して従来どおり動く** (`OccurrenceDto` の `periodIndex` は振替行でも正しい値が返るので、旧クライアントにも振替は「その日のコマ」として正しく見える。displaced は単に無い)。→ `MIN_IOS_BUILD` 据え置き
- **API を含むので main に入ったら `atender-api` を Coolify にデプロイ** (uuid `tq2lgr4eh6t80r3tkqjbpu7o`)。iOS が先に配られても `/api/class-transfers` が 404 なら「授業変更」の送信が失敗表示になるだけ (他機能は無傷)。順序の制約は無いが、API を先に出すのが自然
- テスト: #T1-#T26, #U1-#U19
- P1 に依存しない (`DayDetailSheet` は学期・科目タブ。P1 が触るのはホームとルーム)。並列に developer を召集できる。ただし版数 `"18"` は P1 側で上げる (P2 単独で先に出すなら P2 で上げ、P1 の #V1 を合わせる)

---

## 14. ★ Touri 裁定待ち (承認ゲートで提示。設計は各行の「Leader 推奨」で書いてある)

| # | 論点 | 設計で採った値 (Leader 推奨) | 他の選択肢 |
|---|---|---|---|
| 1 | ボトムタブを 4 に減らし、Web の `/rooms` は据え置く (IA 共有原則からの iOS 限定逸脱) | 4 タブ / Web 据え置き (§3.6) | Web も追随 (別設計) / 逸脱しない (タブを残し「+」だけ足す) |
| 2 | ルーム 0 件でも chip 行 (「自分」+「+」) を常時表示 | 常時表示 (§3.2)。「+」が唯一の入口になるため必須 | 0 件時は `ContentUnavailableView` で「ルームを作る」導線を別に出す |
| 3 | 歯車の使い分け: 「自分×時間割」= 時間割設定、「ルーム」= ルーム設定 (同じ `gearshape`) | 同一シンボル、a11y ラベルで区別 (§3.4) | ルーム側は `person.2` 等の別シンボル |
| 4 | 到達不能な `TemplatesView` + `TemplatesViewModel` + テスト 9 本を削除する | 削除 (§10)。Web の `/templates` が正典で、iOS で再導線するなら作り直し | VM とテストは残す (View だけ削除) |
| 5 | MOVE_DAY の「元の日を休講にする」トグルの既定 | **ON**、元の日は「振替先より前で最も近いその曜日」を既定に DatePicker で変更可 (§4.5) | OFF 既定 / トグル無し (常に休講) / 休講は別操作 |
| 6 | 振替が通常授業と同じ時限に重なったとき | その通常授業を **Meeting 単位で置き換え** (その日だけ開催しない。出欠記録があれば 409 で拒否) (§4.4 手順 5-6) | 409 で拒否し、ユーザーが先に科目休講にする / 両方残す (同一時限 2 コマ) |
| 7 | 出欠記録の付いた振替の取り消し | 確認ダイアログ (「出欠記録 N 件も削除されます」) の上で **記録ごと削除** (§4.5)。API は常に cascade | 記録があれば 409 で拒否 |
| 8 | 振替の取り消しで、元の日の休講 (トグルで作ったもの) を戻すか | **戻さない** (休講は独立した事実。日別シートの「休講を解除」で消す) (§4.4 削除) | 一緒に解除 |
| 9 | EventKit から消す出欠ステータス | **EXCUSED のみ追加** (CANCELLED は既存)。ABSENT は「出るべきだった授業」なので残す。TARDY / EARLY_LEAVE は出席しているので残す (§5.1) | ABSENT も消す / ユーザー設定にする |
| 10 | 個人カレンダーの振替 chip の識別 | タイトル先頭に「振替 」(§4.6)。14pt chip にバッジの余地が無い | 識別なし (日別シートのみ) / 別色 |

---

## 15. 不採用案

- **`MeetingOccurrence.meetingId` を nullable にして Meeting 無しの単発コマを作る**: 却下。読み取り側の全経路が `where: { meeting: { userTimetableId } }` で結合している (`dayDetail.service.ts:31`, `occurrence.service.ts:58`, `today.ts:21`, `room.service.ts:296`) ため、meeting が無い行は**どこにも出ない**。「occurrence として存在すれば自動反映」の前提が崩れ、全読み取りに OR 分岐が要る。Prisma の SQLite では列の NULL 化もテーブル再定義になり利点がない
- **振替専用の別テーブル (`TransferOccurrence`) を作る**: 却下。集計 (`attendanceStats.ts`) / 日サマリー / 日別 / 今日 / 書き出し / ルーム週の 6 経路が 2 テーブルを union する必要があり、追加の度に漏れる。本設計は生成側 3 箇所だけを触る
- **振替 occurrence を既存 Meeting に相乗りさせ、`updateMeeting` の `deleteMany` を放置する**: 却下。Researcher R2 の指摘どおり、Meeting のスケジュール編集で振替が巻き添え削除される (`meeting.service.ts:114-116`)。`transferId: null` の 1 条件で防げるので防ぐ
- **振替を「隠し Meeting (`transferId` 付き Meeting 行)」で表し、生成が 1 日だけ作る**: 却下。`timetable.meetings` を列挙する経路 (`SelfTimetableView` の週グリッド、`RoomTimetableLogic.buildRecurringEvents` の `recurringMeetings`、`attendanceStats` の `maxDayPeriods`、`MeetingExpansion`) に幽霊の週パターンが現れ、全部でフィルタが要る
- **置き換えを `CourseSuspension (courseId, date)` で表す**: 却下。同じ科目が週 2 回あるとき (月・金の語学)、金曜の時間割を月曜に写すと「月曜の通常」と「金曜から写した振替」が同じ (courseId, date) になり、科目休講が振替まで消す。読み取り側に `transferId` の例外分岐を足せば直るが、それは §4.1 の「読み取りを触らない」方針に反する。displacement を (meetingId, date) で持ち生成側でスキップすれば読み取りは無傷
- **置き換えを occurrence の「表示しないフラグ」で表す**: 却下。読み取り 6 経路すべてにフィルタが要る (別テーブル案と同じ欠点)。物理的に無い行は全経路で自然に無い
- **置き換えを時限 (periodOffset) 単位にする**: 却下。連続 2 コマの片方だけ消すと孤立した 1 コマが残り、書き出し (`CourseExportMapping` の run 結合) と日別表示で「半分の授業」が生まれる。Meeting 単位なら「その日その授業は無い」で一貫する。残った空き時限 (例: 月曜 5限) を別に休みにしたければ既存の科目休講が使える
- **振替行の `periodOffset` に `periodIndex` をそのまま入れる**: 却下。通常行の offset (0…periodCount−1) と衝突しうる (通常 3-4限 = offset 0,1、同日の振替 1限 = 1)。`1000 +` で領域を分ける。負数 (`-periodIndex`) も衝突しないが `ExportKey.meeting(...firstPeriodOffset:)` の URL パスに負号が入る (`ExportKey.swift:14`) ので避けた
- **同じ Meeting・同じ日に通常と振替を置くのを禁止する (unique 衝突の回避策)**: 却下。学期末に「金曜 3限の科目の補講を同じ金曜の 5限に」は現実にあり、Leader 条件「通常授業がある日への振替が成り立つ」に反する。offset の領域分離で禁止せずに成立させる
- **振替先の休講を API が黙って解除する**: 却下。`liftTargetSuspension` を明示させ、iOS が注記を出した上で true を送る。黙って消すと「休講にしたはずが消えた」になる
- **iOS が「休講解除 → 振替作成」を 2 リクエストで行う**: 却下。1 回目成功 / 2 回目失敗で休講だけ消える。API 側で 1 トランザクション
- **`reconcileOccurrencesForSemesterDateChange` で範囲外の振替も削除する**: 却下 (Leader 条件)。ユーザーが明示的に置いた日付は学期日付の編集で消さない
- **授業変更シートを日別シートの中でインライン展開する / 3 段階ウィザードにする**: 却下 (Touri 明示)。1 枚のシート + `Picker(.segmented)` の 2 モード。`MeetingEditModal` と同じ「1 件 1 往復」
- **モード切替を 2 つのボタン (「曜日ごと」「コマごと」) → 別々のシートにする**: 却下。段階が 1 つ増える。標準の segmented で 1 枚に収まる
- **曜日選択を `Picker(.menu)` にして授業の無い曜日を出さない**: 却下。segmented の 7 分割 (1 文字ラベル) は `MeetingEditModal` の編集モードが既に採っている形で 1 タップ。無効な曜日はプレビューの文言で伝える
- **「元の日」を指定させない (振替先の直前のその曜日に固定)**: 却下。祝日の振替は数週間前の日付が元になることがある。既定値を賢く置き、DatePicker で変えられるようにする (認知タスクのオフロード、汎用層 §6)
- **個人カレンダーの授業表示を occurrence ベースに全面移行する**: 却下 (今回は)。`MeetingExpansion` + テスト群は健在で、必要なのは「除外」と「追加」の 2 点。default 引数の追加と loader への 2 行で足りる。全面移行は別設計
- **振替の一覧 API (`GET /api/class-transfers`) を足す**: 却下 (今回は)。日別 (`DayDetailDto.transfers`) と範囲 (`OccurrenceRangeDto.transfers`) で必要な画面は全部賄える。表面積を増やさない
- **ルーム 0 件時にルーム作成の別画面 (ContentUnavailableView) を出す**: 却下。「+」が常時見えていれば導線は 1 つで足り、空状態の面を増やすと chip 行と二重になる (裁定 #2 に選択肢として残す)
- **ホームの nav title をルーム名にする**: 却下。DESIGN.md §3.7.1「タイトル = そのタブの日本語名」。ルーム名は選択中 chip が示す
- **`HomeView` に `.sheet` を 3 つ並べる (作成 / 参加 / 設定)**: 却下。兄弟 `.sheet` は 1 つしか発火しない (`gotcha/swiftui-multiple-sibling-sheets-only-one-fires`)。`HomeSheet` enum + `.sheet(item:)` 1 個
- **deep link の着地を `homePath` に push する新ルート (`HomeRoute.roomJoin`) にする**: 却下。参加は 1 回の POST で終わる短いタスクで、push 画面 (`JoinRoomView`) はシートに置き換えられる。`NavigationPath` を増やさない
- **ABSENT も EventKit から消す**: 却下 (Leader 推奨)。欠席は「出るべきだった授業」で、予定として残る方が実態に合う。裁定 #9

---

## 16. 受け入れ表 (最終レビューの MVP — 要望原文 → 挙動仕様 → 確認手段)

| 要望 (原文) | 対応する挙動仕様 | 確認手段 |
|---|---|---|
| **F1** ルームタブを廃止 | #R1, #R9 | ユニット / XCUITest |
| ホームのグループ追加ボタンをクリックしたら直で「ルームを作成」「リンクで参加」が出てくる | #R10, #R12, #R13 (+ #R7/#R11 でルーム 0 件でも「+」がある) | XCUITest / ソース走査 |
| ついでに QR での参加もできる | #R12 (3 項目目 `QR で参加`)、#R4-#R6 (スキャン → deep link → ホーム着地)、#R17 | ユニット / XCUITest / **実機** (カメラはシミュレータ不可) |
| ルームの設定画面はホームの該当ルームを選択時に画面右上に設定ボタン | #R14, #R15 + §9 #7-15 (機能 9 項目) | XCUITest / 実機で 9 項目を 1 回ずつ操作 |
| (Leader 前提) deep link の着地 = ホーム + 参加シート → 成功でそのルームを選択 | #R4, #R5, #R17 + §3.3 の `onJoined → context = .room` | ユニット / XCUITest / 実機 (他人の招待リンク) |
| (Leader 前提) `RoomDetailView` 削除で `semesterId` 未配線が消える | §9 #6、#F8/#F9 の書き換え | ユニット (ソース走査) |
| **F3** 学期カレンダー選択時に休講と同じ感じで「授業変更」ボタン | #U15 | XCUITest |
| 曜日の時間割丸ごと該当の日だけに持ってくる | #T1-#T7, #U1-#U4 | API / ユニット / 実機 |
| 科目を 1 つずつ時間割登録みたいに設定できるモード | #T12-#T16, #U5, #U16 | API / ユニット / XCUITest |
| インラインの設定画面はやめる・何も考えなくても自然に | §4.5 (1 枚シート、segmented、既定値の自動計算 #U1/#U2、衝突の事前表示 #U3/#U4)、#U15 (タイトル中央) | XCUITest / **実機で Touri が触る** |
| 台風で金曜の授業が月曜に振替 (元の日は休講) | #T7 (元の日の休講)、#T1 (月曜の重なる授業を置き換え)、裁定 #5/#6 | API / 実機 |
| 振替授業が学期末にある (通常授業がある日への追加) | #T12, #T13, #T16 | API |
| 休講日への振替 | #T10 (`liftTargetSuspension`) | API |
| 集計・日別・週・ルーム週・EventKit に自動反映 | #T2-#T6 (API 6 経路)、#U13 (書き出しトリガ)、#U18 (個人カレンダー)、#U19 (学期カレンダーのバッジ) | API / ユニット / XCUITest |
| `updateMeeting` / `reconcile` が振替を消さない | #T20-#T22 | API |
| 振替の取り消し (出欠記録付き含む) | #T17-#T19, #U7, #U17 | API / ユニット / XCUITest |
| **F4** 公欠時は外部カレンダーに反映されない | #E1-#E5 | ユニット / **実機** (公欠にして 15 秒以内に iPhone カレンダーから消える) |
| 休講時も反映 (既に除外済) — 「反映されない」体感の原因 | #E6 (throttle 15 秒 / 起動時同期)、§5.2 | ユニット / 実機 (アプリを閉じて Web で休講 → 再起動で消える) |
| **版数** build 18、`MIN_IOS_BUILD` 据え置き | #V1-#V3 | ユニット |
| **build 17 レーンの受け入れ (参照のみ)** B1 モーダルタイトル / B2 ルーム時間割の学期文脈 / B3 カレンダー UI 統一 / F2 chip 左帯 | `.designs/20260730-ios-unify-calendar-build17.md` §6.6 (#B50-#B55) / §6.7 (#B56-#B60, #A1-#A5) / §6.1-6.5 (#B1-#B49) / §3.3 (#B11-#B13) | 同 doc §10.3 |
