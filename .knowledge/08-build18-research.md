---
title: build18 事前調査 — ルームタブ廃止 / 授業変更(振替) / EventKit公欠除外 / build17残課題
category: library
project: atender
tags: [ios, rooms, occurrence, eventkit, prisma, swiftui, meeting]
created: 2026-09-08
sources:
  - apps/ios/Atender/App/MainTabView.swift, AppRouter.swift, Core/DeepLink.swift
  - apps/ios/Atender/Features/Rooms/*.swift, Features/Home/HomeCore.swift
  - apps/api/prisma/schema.prisma, src/services/occurrenceGen.ts, meeting.service.ts, attendanceStats.ts, semesterOverview.service.ts, dayDetail.service.ts, room.service.ts, occurrence.service.ts
  - apps/ios/Atender/Core/Sync/CourseExportMapping.swift, InvalidationMatrix.swift, CalendarSyncTrigger.swift, CalendarSyncCoordinator.swift
  - .designs/20260730-ios-unify-calendar-build17.md
model-era: opus-5.1
---

## R1. ルームタブ廃止 (iOS)

### タブ/ルーティング依存箇所 (全量)
- `MainTab` enum に `.rooms` あり (`App/MainTabView.swift:6,14,24`)。TabView 内で `RoomsView()` を `NavigationStack(path: roomsPath)` に載せ、`navigationDestination(for: RoomsRoute.self)` で `.detail/.join/.templates` を解決 (`MainTabView.swift:49-63`)
- `RoomsRoute` (`App/AppRouter.swift:4-8`): `.detail(String)` `.join(String)` `.templates`。**`.templates` は push している呼び出し元がゼロ** (`grep RoomsRoute.templates` → ヒットなし)。`TemplatesView` 自体は到達不能な死んだルート — 廃止設計で気にしなくてよい
- DeepLink `atender://rooms/join/<code>` → `AppRouter.apply()` (`AppRouter.swift:40-49`) が `selectedTab = .rooms; roomsPath.append(.join(code))`。**タブ廃止後もこの2行の書き換えが必須** (タブが無ければ selectedTab 設定は無意味 or 別 sheet 遷移に置換要)
- `selectedTab = .rooms` の唯一の非 DeepLink 呼び出し元: `HomeCore.swift:52` (`ContextChips` の `onAddRoom`)。Touri 要望の「+ から直接ルーム作成/参加」を実装するなら、ここを sheet 起動に置き換えるだけで済む
- **★ 罠**: `ContextChips` 自体が `HomeChips.isVisible(rooms:)` (`HomeCore.swift:30-32`) = `!rooms.isEmpty` の時だけ描画される (`HomeCore.swift:47`)。**ルームが0件のユーザーには現状 chip 行自体が出ない = "+" ボタンも出ない**。ルーム作成の入口をここに一本化するなら、この可視条件を「常に表示」に変える設計判断が要る (でなければ新規ユーザーがルームを一切作れなくなる)

### RoomsView / RoomSheets の機能棚卸し (全部 identifier 付き)
| 機能 | 場所 | a11y id |
|---|---|---|
| 作成 sheet (名前+説明) | `RoomsView.swift:190-224` `RoomCreateSheet` | `room-create-sheet` |
| コード参加 sheet (テキスト入力 + QR起動ボタン) | `RoomsView.swift:226-275` `JoinByCodeSheet` | `join-by-code-sheet` |
| QR スキャン (fullScreenCover) | `RoomsView.swift:264-273` → `QRScannerScreen` | — |
| 招待コード着地画面 (join進行/失敗) | `RoomsView.swift:277-316` `JoinRoomView` | — |
| ルーム一覧カード / 追加メニュー | `RoomsView.swift:40-114` | `rooms-add` (Menu「作成」「参加」), `rooms-list`, `room-card-<id>` |
| 設定シート: 名前・説明編集 (owner限定) | `RoomSheets.swift:96-103` | — |
| showMemberTimetables トグル | `RoomSheets.swift:104-117` | — |
| メンバー一覧+追放 (owner限定) | `RoomSheets.swift:192-221` | — |
| 自分のカレンダー共有 (enabled+visibilityMode 3種) | `RoomSheets.swift:231-273` | — |
| ICS 取込導線 | `RoomSheets.swift:223-229,166-170` → `IcsImportWizard` | `ics-wizard` |
| 招待QR表示・コピー・共有・再発行 (owner限定) | `RoomSheets.swift:275-` | — |
| 退出/削除 (destructive footer) | `RoomSheets.swift:124-129` | — |
| 設定シート全体 | `RoomSheets.swift:62-174` `RoomSettingsSheet` | `room-settings-sheet` |

**Touri 要望 (ホームで該当ルーム選択中に nav bar 右上に歯車)** の配線候補: `HomeCore.swift` の `.toolbar` (`:78-95`) は現状 `context == .self` の2条件のみ (学期メニュー / 時間割設定歯車)。`context == .room(let id)` の分岐が無い → 新設が必要。`RoomSettingsSheet(roomId:isPresented:onChanged:)` はシグネチャ上そのまま呼べる (roomId さえ渡せば良い、`RoomDetailView.swift:62-66` に既存の呼び出し例あり)

### Web側 IA (共有規約との整合)
`apps/web/src/routes/Rooms.tsx` / `RoomDetail.tsx` は独立ルートとして現存 (`find apps/web/src/routes` で確認)。**iOS だけタブを外すと CLAUDE.md の「IA と機能は Web と共有」原則から逸脱** — 同原則は「iOS 独自機能の追加・Web 機能の削除は設計 doc で明示的に決める」の適用対象と明記されているため、Architect は逸脱を暗黙にせず設計doc内で明示すること (Web側は変更しない前提と思われるが要確認)。

### 壊れる可能性のある既存 UI テスト
- `AtenderUITests/ScreenshotFlow.swift:80,189-192`: タブラベル "ルーム" を `tapButton` で叩く。タブが無くなれば失敗
- `AtenderUITests/B16NavTrailingUITests.swift:128-158,238-255`: `openTab("ルーム")` → `rooms-add` の位置・個数検証、ルームカード掴み。**タブ廃止で全滅する設計**。設計doc に「このテストは書き換え前提」と明記要

---

## R2. 授業変更 (振替授業)

### schema の制約 (★ 設計の岐路)
- `MeetingOccurrence.meetingId` は **必須 FK** (`schema.prisma:406-422`)。`@@unique([meetingId, date, periodOffset])`。単発の「Meeting を持たないコマ」は現行 schema では表現不可
- occurrence 生成契機: `Meeting` の create/update 時のみ (`meeting.service.ts:53,116`)、範囲は**学期全体** (`occurrenceGen.ts:33-34`、`timetable.semester.startDate〜endDate`)。毎リクエストでの動的生成ではない
- **生成ロジックは `date` を `meeting.dayOfWeek` に厳密一致させて作る** (`occurrenceGen.ts:47`) が、**読み取り側 (attendanceStats / semesterOverview / dayDetail / occurrence.service の listOccurrenceRange / room.service の `meetings`) は全て `MeetingOccurrence.date` を date-range フィルタするだけで dayOfWeek 整合性を再検証しない** (`attendanceStats.ts:106-107`, `semesterOverview.service.ts:90-91`, `dayDetail.service.ts:29-33`, `occurrence.service.ts:56-60`, `room.service.ts:294-301`)。→ **「Friday の Meeting に date=Monday の MeetingOccurrence 行を追加する」だけで、集計・日別詳細・週表示・EventKit 書き出し (`listOccurrenceRange` 経由) 全部に自動反映される** (実測ではなくコード読解による論理的結論、要 Developer 実地検証)
- **★ 落とし穴**: `updateMeeting` は `meetingOccurrence.deleteMany({ where: { meetingId } })` してから全再生成する (`meeting.service.ts:114-116`)。既存 Meeting に紐付けて手動追加した振替 occurrence は、**その Meeting が編集された瞬間に他の occurrence もろとも消える**。振替を安全に永続化するなら、既存 Meeting に相乗りさせず**専用の Meeting 相当エンティティ (または新規モデル) に隔離**する設計が要る
- `reconcileOccurrencesForSemesterDateChange` (`occurrenceGen.ts:101-138`) は学期日付変更時、範囲外 occurrence を「AttendanceRecord が無ければ削除」する。振替 occurrence も対象になりうる (要確認)
- **既存パターン参考**: `CourseSuspension` (Course×Date 中間テーブル、`schema.prisma:373-385`) が「分母から除外」の先例。振替は逆方向 (occurrence を**足す**) なので直接転用不可だが、粒度の考え方は流用可

### mode (a) 「ある曜日の時間割を丸ごと持ってくる」 / mode (b) 「1コマずつ置く」の実装経路 (事実+推測)
- mode (b) と親和性が高い既存部品: `MeetingEditModal` (`Features/Timetable/MeetingSheets.swift:5-` — courseId picker + dayOfWeek picker + period range picker)。ただしこれは**週パターン (`Meeting`) の編集 UI** であり日付指定ではない。**推測**: 新規 API (例 `POST /api/meetings/:id/transfer` または新モデル `MeetingTransfer{id, meetingId, fromDate?, toDate, periodOffset...}`) を作り、UI は `MeetingEditModal` のコース/コマ選択部分を流用しつつ日付ピッカーに差し替えるのが最短経路
- mode (a) 「曜日を丸ごと」は、対象曜日の全 `Meeting` を列挙 → 各 Meeting に対し `generateOccurrencesForMeeting` 相当の1日分バージョンを呼ぶイメージ (**推測**、既存関数はそのままでは 1 日限定呼び出しに対応していないので `fromDate=toDate=target` で呼べば理論上動く可能性はあるが未検証)

### iOS 導線候補 (2-3案、全て推測)
1. `DayDetailSheet.swift:77-100` (`suspensionSection`) の「この日を休講にする」ボタンと同じ並びに「授業変更」ボタンを追加 (Touri 要望の文面と一致度が最も高い、SemesterOverview の日タップ→シート導線)
2. `BulkAndPersonalEventSheets.swift:69-78` の複数日一括休講 UI と対にして、複数日一括の「授業変更」も検討可 (ただし振替は1対1の日付ペアなので複数選択との相性は悪い可能性)
3. Web 側 parity 実装先: `apps/web/src/components/semester/DayDetailSheet.tsx:75-103` が iOS の `DayDetailSheet.swift` と同一構造 (「この日を休講にする」ボタン location 一致確認済み)

### shared zod / migration 慣習
- migration 命名: `YYYYMMDDHHMMSS_snake_case` (`apps/api/prisma/migrations/` 実例: `20260729041500_personal_event_rebuild`)
- 型置き場慣習: `packages/shared/src/schemas/<entity>.ts` を作り `index.ts` でバレル export (例 `timetableSuspension.ts` → `index.ts:20`)。CourseSuspension 用の専用ファイルは無く既存 `courses.ts` route 内 zValidator 直書きの可能性あり (未確認)

---

## R3. 休講・公欠を EventKit に反映

**確定事実**: 休講は既に2重に除外されている。`CourseExportMapping.swift:10,14` (TimetableSuspension/CourseSuspension 由来の一括休講日) と `:16` (`occurrence.status == .cancelled` の個別休講) の両方が export から除外済み。**公欠 (`EXCUSED`) だけが未除外** — Touri の訴え「公欠の時も表示されて困っている」と完全一致。修正は `CourseExportMapping.swift:16` の条件を広げるだけで足りる可能性が高い (どのステータスを除外するかは設計判断)。

`AttendanceStatus` 全ケース (`Core/Models/Enums.swift:20-42`): `present`(出席) / `absent`(欠席) / `excused`(公欠) / `tardy`(遅刻) / `earlyLeave`(早退) / `cancelled`(休講) / `unknown`。TARDY/EARLY_LEAVE は現状 export に残る (除外対象に含めるかは設計判断)。

**再実行チェーンは実装済で機能する** (出欠変更→自動で書き出しが更新される):
1. 出欠変更 → `Mutation.patchAttendance` → invalidate targets に `.semesters()` を含む (`InvalidationMatrix.swift:42-43`)
2. `CalendarSyncTrigger.watchedPrefixes` に `"semesters"` prefix あり (`CalendarSyncTrigger.swift:43-49`) → `isDataChange([...])` が true
3. `CalendarSyncCoordinator` init 時に `cache.onInvalidate` を登録済み、true なら `sync(trigger: .dataChanged)` を起動 (`CalendarSyncCoordinator.swift:69-72`)
4. `.dataChanged` は throttle 対象 (15秒、`.bypassesThrottle` に含まれない) — 即時ではなく最大15秒遅延 (`CalendarSyncTrigger.swift:6,21,37-39`)

→ **R3 は基本的に配線変更不要、`CourseExportMapping.swift` の除外条件だけ触ればよい可能性が高い**。ただし15秒スロットルの体感は要確認。

既存テスト: `AtenderTests/CourseExportMappingTests.swift` に15件。**EXCUSED を除外/非除外どちらで扱うテストも現状ゼロ** (`grep excused` → cancelled のみヒット、150行目)。

Web/Google Calendar 側の parity: `googleCalendarSync.service.ts` は **RoomEvent を Google→Atender に取り込む方向専用** (`listGoogleEvents` 読み取りのみ、`googleCalendarSync.service.ts:1-30`)。個人の出欠ステータスを外部カレンダーに書き出す機能は Web に存在しない = **これは iOS EventKit 専用機能で、parity の概念自体が無い**。

---

## R4. build17 レーン残課題

- `RoomDetailView.swift:44,48` は `RoomTimetable(roomId:available:)` / `RoomCalendar(roomId:available:)` を **`semesterId` 引数なしで**呼んでいる。設計doc `.designs/20260730-ios-unify-calendar-build17.md` §4.7 (369-431行) は両 View に `semesterId: String? = nil` を追加する仕様。**ただしデフォルト値が `nil` のためコンパイルは通り、動作も「従来動作」に後退するだけ** (ビルド破壊ではなく機能未接続)。§4.8 の `RoomTimetableLogic.resolveDaySlots(preferredSemesterId:...)` も未使用の可能性が高い (grep未実施、深追い不要と指示あり)
- 現在 `project.yml:49` の `CFBundleVersion` は `"16"` — build17 の内容はまだ main に反映されていない (worktree 上の未マージ)
- ルームタブ廃止が実施されれば `RoomDetailView` 自体が消える見込みのため、上記ズレは**修正不要 (自然解消)** の可能性が高い — Architect は「ルームタブ廃止と同時にこの負債も消える」ことを設計docに明記すると手戻りを防げる

---

## Architect が迷いそうな論点 (5個)

1. **★ ルーム0件時の "+" 導線が消える** (R1、事実): `ContextChips` は rooms 空だと非表示。「+」をルーム作成の唯一入口にするなら常時表示への変更が必須
2. **★ 振替 occurrence をどう schema に落とすか** (R2、事実+要判断): 既存 Meeting に相乗りさせると `updateMeeting` の全消し再生成で消滅するリスクが確定している。新モデル/専用フラグが要る
3. **公欠除外は on/off 一律か、ユーザー設定にするか** (R3、未確定): TARDY/EARLY_LEAVE も一緒に消すか、EXCUSED だけかは product 判断で file からは読めない
4. **ルームタブ廃止は Web にも波及させるか** (R1、CLAUDE.md規約との整合): 「IA共有」原則からの明示的逸脱として書くか、Web側も追随するか
5. **mode (a)/(b) の一貫性**: 「曜日丸ごと」と「1コマずつ」を同一 API/モデルで表現するか別モデルにするか。既存 `generateOccurrencesForMeetings` の再利用可否は未検証 (推測止まり)
