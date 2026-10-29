---
title: build 21 設計前リサーチ — カレンダー撤去(EventKit書き出しのみ残す) / 単位(回数)対応 / 公開時間割のオンボーディング提案
category: library
project: atender
tags: [build21, ios, eventkit, calendar-removal, attendance, credit, onboarding, timetable-templates, app-store]
created: 2026-10-29
sources:
  - https://developer.apple.com/documentation/eventkit/accessing-the-event-store
  - https://developer.apple.com/documentation/eventkit/ekeventstore/requestwriteonlyaccesstoevents(completion:)
  - https://developer.apple.com/documentation/eventkit/accessing-calendar-using-eventkit-and-eventkitui
  - https://developer.apple.com/documentation/bundleresources/information-property-list/nscalendarswriteonlyaccessusagedescription
  - https://laws.e-gov.go.jp/api/2/law_data/331M50000080028 (大学設置基準, 2026-09-04 施行版, 実取得)
  - https://laws.e-gov.go.jp/api/2/law_data/351M50000080002 (専修学校設置基準, 実取得)
  - https://laws.e-gov.go.jp/api/2/law_data/501M60000080006 (大学等における修学の支援に関する法律施行規則, 実取得)
  - https://www.kindai.ac.jp/international-studies/files/research-and-education/curriculum/outline/syllabus_alart.pdf
  - https://tokaigakuin-u.ac.jp/wp-content/themes/daigaku/pdf/public_info/rishu_tebiki_h26/123_26dai3.pdf
  - https://okayamatakebe.isu.ac.jp/media/files/disclosure/2023_new/SotsuNintei.pdf
  - https://www.ujc.ac.jp/absence/files/absence.pdf
  - https://www.titech.ac.jp/guide/guide_2026/graduate/pdf/12-16.pdf
  - https://college.koseiin.or.jp/wp-content/uploads/2026/03/2026_student_binnrann.pdf
---

## Context

Touri の build 21 要望 4 件 (カレンダー撤去 / 単位システム対応 / オンボーディングで公開時間割を提案 / 通常の学期設定からも公開時間割インポート) の設計前調査。調査時点の main = `ebeade8`、作業ツリーは clean。実装・設計はしていない (事実のみ)。
行番号は `ebeade8` 時点。iOS パスは `apps/ios/Atender/` 起点、API は `apps/api/src/` 起点。

## 0. 先に読む要点 (Architect 向け・★ = 設計の前提が変わる発見)

1. ★ **iOS に「公開時間割を探して取り込む」UI は存在しない。** `TemplatesView`/`TemplatesViewModel`/`TemplatesViewModelTests` は build 18 P1 (`0784bef`, 2026-09-08) で削除済 (build 16 から導線ゼロの死ルートだった。設計 build18 §裁定#4「iOS で再導線するなら作り直し」)。残っているのは `TemplateRepository.templates()/copyTemplate()` (`Core/Data/RoomRepositories.swift:165-196`) と Endpoint/DTO だけで**呼び出し元ゼロ**。復元元は `git show 0784bef^:apps/ios/Atender/Features/Rooms/TemplatesView.swift` (439行)。要望 3・4 は新規 UI。
2. ★ **設定の「学校・学科」は ID 生入力のスタブ** (`Features/Settings/SchoolDeptEditSheet.swift:12-13` が `LabeledInput(label: "学校 ID")`/`"学科 ID"`)。「設定時にも学校→学科を選んで提案」は、まずここを `SetupFlowView` の step1/2 相当の検索 UI に作り直す必要がある。
3. ★ **`allowedAbsences`(あと N 限休める) は既に実装済み** (`apps/api/src/services/attendanceStats.ts:165-176`、iOS `SemesterOverviewView.swift:288-318`)。ただし単位は「限(コマ)」、閾値は**ユーザー単位の必要出席率 Int%** (`User.requiredAttendanceRate`, 既定 70, `schema.prisma:28`) 1 本のみ。「回数で決まる」を足すのは新しい入力モデル(欠席上限回数)の追加であって表示追加ではない。
4. ★ **write-only では「専用 Atender カレンダー + 差分更新」方式が成立しない** (Apple 公式、B2)。現行の書き出しは full access 前提 (`EventKitStore.swift:63-80` が既存イベントを読んで差分を取る)。「双方向を消して書き出しだけ残す」は、権限は full のまま import/個人予定だけを剥がすのが最小変更。write-only 化は書き出しエンジンの作り直し(重複不可避)。
5. ★ **学期カレンダー (学期・科目タブの `AttendanceCalendar`) は Home カレンダーとコードをほぼ共有しない** (共有は `CalendarRange` ユーティリティのみ)。ただし学期タブの `DayDetailSheet`「予定」セクションと `BulkEditSheet`「予定追加」は **個人予定 (PersonalEvent)** に依存している。個人予定を完全撤去するなら学期タブも修正対象。
6. ★ **API は残置が必須級**: Web (`apps/web`) が `personal-events` / ルーム予定 / ICS / Google カレンダー / templates を使っている。iOS build 12〜20 の実機も旧 API を叩く (`MIN_IOS_BUILD = 12`)。iOS のみ使用の endpoint (`eventkit-sync`, `eventkit-legacy-pushes`, `personal-calendar-share`, `class-transfers`, `occurrences`) だけが「iOS から呼ばなくなる」候補。
7. ★ **設定の時間割シートの「みんなの時間割で公開」トグルは既定 ON** (`Features/Settings/TimetableSettingsSheet.swift:19` `@State private var publishEnabled = true`)。保存のたびに `publishAsTemplate` が走り (`:187-195`、結果は `try?` で握りつぶし)、サーバーは重複チェックをしない (`routes/userTimetables.ts:126-`) → 公開時間割が無自覚に量産されうる (提案機能の母集団の質に直結。実害は未検証)。
8. 本番 `1.0 / build 20` は **READY_FOR_SALE (公開中)**。build 21 を公開するには ASC で新バージョン(1.0.1 等)作成が要る。TestFlight だけなら 1.0 のまま (A5)。

## A1. iOS カレンダー関連の全容

### A1-1. Home の構造 (現状)

- タブ: `App/MainTabView.swift` 4 タブ (ホーム/学期・科目/友達/設定)。
- `Features/Home/HomeCore.swift`:
  - `:8-11` `enum HomeViewMode { timetable, calendar }` / `:53` `@State mode` / `:73` `CalendarModePicker(selection: $mode)` (定義は `Features/Calendar/CalendarScreen.swift:244`、文言「時間割」「カレンダー」、id `home-mode-picker`)。
  - `:373-396` `HomeBody` が `(context, mode)` の 4 分岐: `(.self,.timetable)=SelfTimetableView` / `(.self,.calendar)=PersonalCalendar` / `(.room,.timetable)=RoomTimetable` / `(.room,.calendar)=RoomCalendar`。
  - ツールバー: `:95` 時間割歯車は `context == .self` かつ `mode == .timetable` のとき、`:106` ルーム歯車は `.room` のとき。
  - `ContextChips` (`:294-`、自分 + ルーム chip + 「+」Menu: 作成/リンクで参加/QR)。`SemesterMenu` (`:256-`、左上)。`HomeAttendanceOverlay` (自分のときだけ。今日の出欠 CTA)。前学期終了 alert (`:137`)。
- **カレンダーを消した後に Home に残るもの**: 学期メニュー、ContextChips、自分=`SelfTimetableView` (グリッド+コマ編集+歯車→`TimetableSettingsSheet`)、ルーム=`RoomTimetable` (メンバー時間割の重ね表示)+ルーム歯車→`RoomSettingsSheet`、`HomeAttendanceOverlay`、学期ロールオーバー alert。`HomeViewMode` は不要になり `HomeBody` は 2 分岐。

### A1-2. 「時間割を iPhone カレンダーに出力」の経路 (残す対象)

- 起動点:
  1. 設定 → 「カレンダー同期」→「iPhone のカレンダー」行 (`SettingsView.swift:34-36`, `SettingsSheet.calendar`) → `Features/Settings/CalendarSyncSettingsSheet.swift`。
  2. 自動: `App/RootView.swift:36-40` が**セットアップ完了後の起動ごと**に `CalendarSyncCoordinator.sync(trigger: .appLaunch)`。前面化 (`CalendarSyncCoordinator.swift:319`)・`EKEventStoreChanged` (`:308`)・キャッシュ無効化 (`:69` → `CalendarSyncTrigger.watchedPrefixes`)・Home カレンダー表示 (`PersonalCalendar.swift:103`) でも走る。`exportEnabled` は UserDefaults 未設定なら **true** (`:25`)。権限が未決定なら何もしない (`:121-131`)。
  3. 権限の最初の誘導は**カレンダー画面の 1 行バナー** (`Features/Calendar/CalendarSyncBanner.swift`, `CalendarScreenOptions.personal.showsSyncBanner`)。**Home カレンダーを消すとバナーも消え、権限要求の入口は設定シートの「iPhone のカレンダーと同期する」ボタン (`CalendarSyncSettingsSheet.swift:47-` の `accessSection`) だけになる。**
- 経路: View → `CalendarSyncCoordinator` (`Core/Sync/CalendarSyncCoordinator.swift`, 368行, 唯一の入口) → `EventKitStore` (actor, `Core/Sync/EventKitStore.swift`) / `CalendarExportRepository.occurrenceRange` → `GET /api/occurrences` (`apps/api/src/routes/occurrences.ts`, `listOccurrenceRange`)。
- 書き出すデータ: `OccurrenceRangeResponse` = 授業 occurrence (`MeetingOccurrence`、授業変更=振替の occurrence を含む)・`courseSuspensions`・`timetableSuspensions`(休講)・`hasActiveTimetable` (`packages/shared/src/schemas/attendance.ts:75-83`)。`CourseExportMapping.items` (`Core/Sync/CourseExportMapping.swift`) が休講・`CANCELLED`・**`EXCUSED`(公欠, build 18 で追加)** を除外し、連続コマを 1 イベントに結合。窓は今日−31日〜+334日 (`CalendarSyncTrigger.swift:10-17`)。
- 差分エンジン: `ExportKey` (`atender://m/<meetingId>/<yyyyMMdd>/<offset>` を `EKEvent.url` に埋める) → `CalendarExportPlanner.plan(desired:existing:prunableKinds:)` → `EventKitStore.apply` (create/update/delete)。**`existing` を読むために `store.events(matching:)` が要る = full access 前提。**
- **現在要求している権限は full access**: `EventKitStore.swift:14-17` `requestFullAccessToEvents()`、`project.yml:47` `NSCalendarsFullAccessUsageDescription`(「授業と予定を…書き出し、選んだカレンダーの予定を読み込むため」)。`NSCalendarsWriteOnlyAccessUsageDescription` は未設定。`currentAccess()==.writeOnly` は専用カレンダー不成立のエラー扱い (`CalendarSyncCoordinator.swift:127`、設計 `20260729-eventkit-dedicated-calendar-export.md:653,897,1228`)。
- 双方向同期の実体は**読み込み(import)側だけ**: `CalendarSyncCoordinator.swift:183-198` (`linkedCalendarIds` → `EventKitStore.fetchSnapshots` → `POST /api/personal-events/eventkit-sync` → `PersonalEvent(source=EVENTKIT)`)。Atender 専用カレンダーは読み戻さない設計 (設計 §3)。import を消しても書き出しの差分エンジンは無傷で残せる。
- 個人予定の書き出し: `CalendarSyncCoordinator.swift:222-` (`exportPersonal`、`GET /api/personal-events`) + `PersonalExportMapping`。個人予定を消すなら不要。
- Info.plist 側 (書き出しを残す場合の修正点): `NSCalendarsFullAccessUsageDescription` の文言に「選んだカレンダーの予定を読み込む」が入っている → import を消すなら文言修正が必要 (権限の目的と実機能の食い違いを避ける)。`PrivacyInfo.xcprivacy` にカレンダー固有項目は**無い** (収集データは Email/Name/UserID/OtherUserContent + UserDefaults CA92.1 のみ)。import を消すと端末カレンダーのタイトル/場所がサーバへ送られなくなる(`OtherUserContent` 宣言は個人予定・ルーム予定が残る限り維持)。`B20PrivacyManifestTests` は collected data types を固定しているので変えるならテスト更新。
- `SettingsView.swift:16,93` の `case google` は `EmptyView()` の死コード (iOS に Google Calendar OAuth/同期 UI は**無い**。Google Calendar 連携は Web 専用)。`GoogleSignIn` パッケージは認証用でカレンダーとは別。

### A1-3. 学期カレンダー (学期・科目タブ) との関係 — 曖昧点

- 学期タブの月表示は `Features/SemesterOverview/SemesterOverviewComponents.swift:67` `AttendanceCalendar` + `SemesterLogic.swift:110` `SemesterCalendarGrid` で**独立実装**。`Features/Calendar/*` の型 (`CalendarScreen`/`CalendarMonth`/`CalendarMonthStore`/`CalendarWindow`/`CalendarMonthLayout`/`CalendarDayStyle`/`CalendarDaySheet*`) を**一つも参照しない** (grep 実測)。共有は `CalendarRange` (`Core/Timetable/TimetableLogic.swift:202`)、`DateFormatPattern`(同:168)、`ClassTransferLogic.TransferDisplay` が返す `CalendarEvent` 型 (`ClassTransferLogic.swift:145-`、消費するのは Home 側のみ)。
- 日タップで `DayDetailSheet` (`Features/SemesterOverview/DayDetailSheet.swift`) が開き、休講・**授業変更(class transfer)**・出欠 occurrence・**個人予定「予定 (N)」+追加/編集** (`:196-230`, `PersonalEventEditorContent` を使用 `:66,76`) を扱う。`BulkEditSheet` (`BulkAndPersonalEventSheets.swift:134-` `addPersonalEvents`) も個人予定を作る。
- したがって境界は 2 通り:
  - (a) **Home のカレンダーだけ消す**: `Features/Calendar/*` と Home/ルームのカレンダー系を消す。学期タブ・授業変更・出欠 multi-status は無傷。ただし `PersonalDaySheetFormat` (`PersonalDaySheet.swift:77`) と `PersonalEventEditorContent`/`PersonalEventTimeMath` (`PersonalEventEditor.swift`) は `DayDetailSheet`/`BulkEditSheet` が使うので移設が要る。
  - (b) **個人予定という概念ごと消す**: (a) + `DayDetailSheet` の予定セクション/`DayDetailSheetKind.create/.edit`、`BulkEditSheet` の予定追加、`RecurrenceSpecPicker`、`PersonalEvent*` DTO/Repository/Endpoint、書き出しの個人予定、ルームの「自分のカレンダーを共有」(個人予定を投影する機能なので意味を失う)。
  - Touri の言う「カレンダー周り」に学期カレンダーの月表示(出欠 multi-status)が含まれるかは**文面から断定できない**。「時間割」と「カレンダー」のタブ切替の話なので Home のカレンダーを指す可能性が高いが未確認。

### A1-4. ルーム機能のうちカレンダー(予定)を消したら何が残るか

- 残る: ルーム作成/参加(コード・QR)/退出/削除/招待再発行/メンバー一覧/名前・説明・`showMemberTimetables` (`RoomSettingsSheet`)、**ルーム時間割** (`RoomTimetable` = `GET /api/rooms/:id/week` の `recurringMeetings` を `TimetableGrid` に重ねる。`RoomLogic.swift:149-197` `RoomTimetableLogic`)、友達タブ(別機能)、deep link (`room-join`)。
- 消える/不要になる: `RoomCalendar`(113行)・`RoomDaySheet`(76)・`RoomEventEditorContent`/`RecurrencePicker`(`RoomSheets.swift:380-541`)・ルーム予定 CRUD・`IcsImportWizard`(同:542-、`icsSection` `:223`)・`IcsTitleRuleEditorSheet`・`personalCalendarShareSection`(同:231)・`AvailabilityBar`(**既に呼び出し元ゼロの死コード**、`B17RoomFeatureParityTests` が文字列で存在検査)。`RoomWeekDto` の `meetings`/`roomEvents` は API が返し続けるので decode 互換のため DTO は残す選択肢あり。
- 授業変更(振替)は学期タブの機能で、ルームのカレンダーとは別。

### A1-5. 削除候補ファイル一覧 (判定材料)

判定: **D**=削除候補(Home カレンダー撤去で不要) / **K**=残す(EventKit 書き出しの依存) / **M**=一部修正 / **D\***=個人予定も消す場合のみ削除 / **R**=移設して残す。行数は `wc -l`。

| path | 行 | 役割 | 判定 | 材料 |
|---|---|---|---|---|
| Features/Calendar/CalendarScreen.swift | 257 | 月カレンダー共通シェル + `CalendarModePicker` | D | 参照元は PersonalCalendar/RoomCalendar/CalendarMonth のみ。`HomeCore:73` が `CalendarModePicker` を使う |
| Features/Calendar/CalendarMonth.swift | 336 | 月グリッド/ヘッダ/曜日行/予定 chip | D | CalendarScreen のみが参照。`CalendarSyncWarningButton` を呼ぶ(`:45`) |
| Features/Calendar/CalendarDaySheet.swift | 100 | 日別シート汎用 | D | PersonalDaySheet/RoomDaySheet のみ |
| Features/Calendar/PersonalCalendar.swift | 120 | 個人カレンダー VM+View | D | `PersonalCalendarViewModel` は `occurrenceRange`/`semesterOverview` も叩く(Home 専用) |
| Features/Calendar/PersonalDaySheet.swift | 108 | 個人日別シート | D / **R** | 内の `PersonalDaySheetFormat` (`:77`) は `DayDetailSheet.swift` が使う → 残すなら移設 |
| Features/Calendar/PersonalEventEditor.swift | 288 | 個人予定エディタ + `PersonalEventTimeMath` | D\* | `DayDetailSheet:66,76`・`BulkAndPersonalEventSheets:149` が使用 |
| Features/Calendar/RecurrenceSpecPicker.swift | 256 | 繰り返し指定 UI+Logic | D\* | 参照は PersonalEventEditor のみ |
| Features/Calendar/CalendarSyncBanner.swift | 174 | 書き出しバナー + `CalendarSyncWarningButton` | D | カレンダー画面専用。**権限誘導の入口が設定シートだけになる** |
| Core/Data/CalendarMonthStore.swift | 164 | 月ペイロードストア + `CalendarEventOrder` | D | 参照は Calendar 系のみ |
| Core/Timetable/CalendarDaySheetLogic.swift | 143 | 日別シート純ロジック | D | Calendar 系のみ |
| Core/Timetable/CalendarMonthLayout.swift | 64 | 月レイアウト/`CalendarDayStyle` | D | CalendarMonth のみ |
| Core/Timetable/CalendarWindow.swift | 29 | 月ウィンドウ | D | CalendarScreen のみ |
| Core/Timetable/TimetableLogic.swift | 425 | 時間割グリッド用ロジック + カレンダー型の同居 | **M** | `CalendarRange`(`:202`)・`DateFormatPattern`・`MemberColor`・`TimetableCoalesce`・`DayConvention` は残す。`MeetingExpansion`/`CalendarViewMode`/`CalendarLane`/`CalendarEventDisplay`/`PersonalEventDisplay`/`PersonalCalendarLogic` は Calendar 系のみ参照 → 削除可。`CalendarEvent` は `ClassTransferLogic.TransferDisplay`・`RoomLogic` も参照 |
| Features/Home/HomeCore.swift | 396 | Home 本体 | **M** | `HomeViewMode`/`mode`/`CalendarModePicker`/`HomeBody` 4→2 分岐/`:95` 条件 |
| Features/Rooms/RoomCalendar.swift | 113 | ルームカレンダー | D | |
| Features/Rooms/RoomDaySheet.swift | 76 | ルーム日別シート | D | |
| Features/Rooms/AvailabilityBar.swift | 76 | 空き時間バー | D (既に死コード) | 呼び出し元ゼロ |
| Features/Rooms/IcsTitleRuleEditorSheet.swift | 149 | ICS タイトルルール | D | ICS import 専用 |
| Features/Rooms/RoomSheets.swift | 686 | ルーム設定/イベントエディタ/ICS ウィザード | **M** | `RoomSettingsSheet`(`:62-`) は残す。`RoomEventEditorContent`(`:380`)・`RecurrencePicker`(`:513`)・`IcsImportWizard`(`:542`)・`personalCalendarShareSection`(`:231`)・`icsSection`(`:223`) を削除 |
| Features/Rooms/RoomLogic.swift | 275 | ルーム純ロジック | **M** | `RoomTimetableLogic`(`:149`)・`RoomCardLogic`・`RoomInviteCode`・`TemplateLogic`(`:271`)は残す。`RoomCalendarLogic`/`RoomEventTiming`/`RoomAvailability`/`RecurrencePresetLogic` は削除可 |
| Features/Rooms/RoomTimetable.swift / RoomJoinSheets.swift | 73 / 98 | ルーム時間割/作成・参加 | K | |
| Features/SemesterOverview/DayDetailSheet.swift | 417 | 学期タブ日別シート | **M** (個人予定を消す場合) | `:196-230` 予定セクション、`DayDetailSheetKind.create/.edit`、`:60-80` |
| Features/SemesterOverview/BulkAndPersonalEventSheets.swift | 203 | 一括編集 (`BulkEditSheet`) | **M** (個人予定を消す場合) | `addPersonalEvents` `:134-` |
| Features/SemesterOverview/ClassTransferLogic.swift / ClassTransferSheet.swift | 191 / 313 | 授業変更(振替) | K / M | `TransferDisplay.calendarEvents` (`ClassTransferLogic.swift:156`) は Home カレンダー専用 → 削除可。書き出し(occurrence 経由)は影響なし |
| Features/Settings/SettingsView.swift | 240 | 設定 | **M** | `:34-36` 「カレンダー同期」セクション(書き出し行は**残す**)。`:16,93` `case google`/EmptyView は死コード。`wipeExport()`(`:170,190`) は残す |
| Features/Settings/CalendarSyncSettingsSheet.swift | 313 | 同期設定シート | **M** | `importSection`(`:184-`)・`exportPersonalBinding`(`:259`) を削除、`accessSection`(`:47`)/`exportSection`/`statusSection` 残す。文言「Atender の予定を書き出す」「授業」「自分の予定」(`:105`) を時間割向けに |
| Core/Sync/CalendarSyncCoordinator.swift | 368 | 同期オーケストレータ | **M** | 残: 権限/カレンダー解決/授業の書き出し(`:199-`)/`wipeExport`。削除: import `:183-198`、個人予定 `:222-`、`cleanUpLegacyPushes`(`:337`)、`linkedCalendarIds`/`promptDismissed`/`exportPersonal`/`availableCalendars`(`:90`)、`.calendarScreen` トリガ、`:273` `invalidate(.personalEvents)` |
| Core/Sync/EventKitStore.swift | 256 | EventKit I/O | **M** | 残: `requestFullAccess`/`snapshot`/`createCalendar`/`fetchExported`/`apply`/`wipeOwned`。削除: `fetchSnapshots`(`:128`)・`removeEvents`(`:150`, legacy)。write-only 化するなら全面書き直し |
| Core/Sync/CalendarExportPlanner.swift / ExportKey.swift / CourseExportMapping.swift / AtenderCalendarResolver.swift / AtenderCalendarSpec.swift / EventKitTimeMapping.swift / CalendarSyncStatus.swift / CalendarSyncTrigger.swift | 128/54/84/90/9/33/107/56 | 書き出しエンジン | K (一部 M) | `ExportKind.personal`+`ExportKey.personal` は個人予定を消すなら削除。`CalendarSyncBannerLogic`(`CalendarSyncStatus.swift:87-`)は削除。`watchedPrefixes` の `personal-events` 行は削除。`EventKitTimeMapping.jstDayStart` は残す |
| Core/Sync/PersonalExportMapping.swift / EventKitReconciler.swift | 54 / 31 | 個人予定書き出し / import アップロード変換 | D | |
| Core/Data/CalendarExportRepository.swift | 28 | `occurrenceRange`/legacy | **M** | `occurrenceRange` 残す。`legacyEkPushes`/`clearLegacyEkPushes` 削除可 |
| Core/Data/Repositories.swift `PersonalEventRepository` | `:189-` | 個人予定 API | D\* | |
| Core/Data/InvalidationMatrix.swift / QueryKey.swift | | `.personalEvent`(`:13,59`)/`personalEvents()`(`:33`) | D\* | |
| Core/Models/DTOs.swift | 1171 | DTO | **M** | `:456-562` Recurrence/PersonalEvent*、`:564-611` EventKitSync*/LegacyEk*(`OccurrenceRangeResponse :592` は残す)、`:693-,795-,825-,919-` RoomEvent/Share/Ics* は decode 互換のため**API が返す限り残す選択肢**(`RoomWeekDto :717` が `roomEvents` を持つ。`DayDetailDto :619` が `personalEvents` を持つ) |
| Core/Networking/APIEndpoint.swift | 208 | Endpoint | **M** | `:100-120` personalEvents/eventkit*、`:131-172` room events/ICS/share、`:175-180` ics-title-rules |
| App/AppEnvironment.swift | 74 | DI | **M** | `personalEventRepository`/`icsImportRepository`/`templateRepository` |
| Info.plist / project.yml | | | **M** | `NSCalendarsFullAccessUsageDescription` 文言(`project.yml:47`)、`CFBundleVersion "20"→"21"`(`:49`) |

### A1-6. テスト (AtenderTests / AtenderUITests) の分類

件数ベースライン: ユニット 719 / 0 fail (build 20 出荷時、台帳 `known-failures.md:300`)。**今回 iOS は未再実測**。

| 判定 | ファイル |
|---|---|
| 削除 (Home カレンダー撤去) | `B16CalendarDaySheetLogicTests`(267, RoomEvent/PersonalDaySheet 含む)・`B16CalendarDayStyleTests`・`B16CalendarSelectionRenderTests`・`B17CalendarGridRenderTests`・`B17CalendarMonthStoreTests`(408)・`B17CalendarScreenLogicTests`・`B17CalendarWindowTests`・`B17GridTokenAndGeometryTests`(CalendarMonth 15 参照)・`CalendarEventDisplayTests`・`CalendarLaneTests`・`CalendarLayoutTests`(265)・`CalendarMonthRenderTests`・`CalendarSyncStatusTests`(Banner 部分)・`PersonalCalendarLogicTests`・`PersonalEventDisplayTests` |
| 要確認 (BottomSheet 系は学期タブ等で生きている) | `B16BottomSheetDetentTests`・`B17ModalTitleTests` |
| 削除 (ルーム予定/ICS) | `B17RoomFeatureParityTests`(AvailabilityBar/RoomCalendar の存在を文字列検査)・`RoomLogicTests` の RoomCalendar/RoomEvent/RoomAvailability 部分・`DTODecodingTests` の RoomEvent/Ics 部分 |
| 削除 (個人予定を消す場合) | `PersonalEventContractTests`・`RecurrenceSpecLogicTests`・`PersonalExportMappingTests`・`ExportDTODecodingTests`(EventKitSync 部分) |
| 削除 (import) | `EventKitReconcilerTests` |
| 残す (書き出し) | `CalendarExportPlannerTests`・`ExportKeyTests`(personal 部分は D\*)・`CourseExportMappingTests`・`B18ExportMappingTests`・`AtenderCalendarResolverTests`・`EventKitTimeMappingTests`・`CalendarSyncTriggerTests`(`watchedPrefixes` 期待値の修正が要る) |
| 残す (学期/授業変更/共通) | `CalendarRangeTests`・`MeetingExpansionTests`(`MeetingExpansion` を消すなら削除)・`B18ClassTransferLogicTests`(TransferDisplay.calendarEvents 部分は M)・`SemesterLogicTests`・`SemesterMultiStatusReviewTests`・`SemesterOverviewDisplayLogicTests` |
| UI テスト | `B17CalendarUITests`(344, ほぼ削除; 一部は `home-mode-picker` 依存)・`B16NavTrailingUITests`(363, `openHomeCalendar()` でカレンダーへ遷移する前提 → 大半修正)・`B18HomeRoomsUITests`(`home-mode-picker` 2 箇所・ICS ボタンのテスト R16 → 修正)・`B18ClassTransferUITests`(U18 `PersonalCalendarShowsTransferChip` 削除)・`ScreenshotFlow.swift:40-43,166`(カレンダーボタン前提) |
| 版数ピン留め (build 21 で必ず更新) | `BuildVersionTests.swift:17-18`、`B18HomeAndVersionTests.swift:115-116,144`、`B20PrivacyManifestTests.swift:74-75,92-93` (いずれも `"20"` 固定) |

## A2. API / shared / Web

### A2-1. カレンダー系 route と依存

| route (apps/api/src/routes) | Prisma | iOS | Web | 書き出しに必要? |
|---|---|---|---|---|
| `GET /api/occurrences` (`occurrences.ts`) | MeetingOccurrence 他 | 書き出し(`CalendarExportRepository`)・Home 個人カレンダー | **不使用** | **必要** |
| `/api/personal-events` GET/POST/PATCH/DELETE (`personalEvents.ts`) | PersonalEvent/Override | 個人カレンダー・学期タブ・書き出し | 使用 (`usePersonalEvents`, `BulkEditSheet.tsx`) | 個人予定を書くなら |
| `POST /api/personal-events/eventkit-sync` | PersonalEvent(source=EVENTKIT) | import のみ | 不使用 | 不要 |
| `GET/POST /api/personal-events/eventkit-legacy-pushes[/clear]` | PersonalEvent.ek* | legacy 掃除のみ | 不使用 | 不要。**build 11 以前向け。App Store 公開は build 20 が初なので公開ユーザーには無関係** |
| `/api/rooms/:id/events*` (`rooms.ts:225-235`) | RoomEvent/Override | RoomCalendar/DaySheet | 使用 | 不要 |
| `/api/rooms/:id/ics-imports*`, `/api/me/ics-title-rules*` | IcsImport/IcsTitleRule | `IcsImportWizard`/`IcsTitleRuleEditorSheet` | 使用 | 不要 |
| `/api/rooms/:id/personal-calendar-share*` (`rooms.ts:198-220`) | PersonalCalendarShare | `RoomSettingsSheet` のみ | **不使用** | 不要 |
| `/api/rooms/:id/google-calendar-syncs*`, `/api/me/google-calendar/*` | GoogleCalendarConnection/Sync | **iOS 不使用** | Web のみ | 不要 |
| `POST/DELETE /api/class-transfers` (`classTransfers.ts`) | ClassTransfer/Displacement | 学期タブ `ClassTransferSheet` | **不使用** | 授業変更が occurrence に反映され書き出される |
| `GET /api/rooms/:id/week` | — | RoomTimetable + RoomCalendar | 使用 | RoomTimetable に必要 |

- **Web ルート**: `/`, `/templates`, `/semester`, `/rooms`, `/rooms/$id`, `/rooms/join/$inviteCode`, `/friends`, `/friends/add/$inviteCode`, `/settings`, `/settings/calendar`(Google), `/settings/integrations/google`, `/setup`, `/signin`, `/verify` (`apps/web/src/router.tsx:54-75`)。
- **API を消すと Web が壊れる箇所**: personal-events(Home/BulkEditSheet)、ルーム予定・ICS・Google(RoomDetail/SettingsCalendar)、templates(Templates)。→ API は残置が前提。iOS 専用の `eventkit-sync`/`eventkit-legacy-pushes`/`personal-calendar-share` だけは「消しても Web は壊れない」が、**build 12〜20 の実機が呼ぶ**(`MIN_IOS_BUILD=12` は据え置きが安全。上げると 426)。消すなら MIN_IOS_BUILD 引き上げが必要で、`clientVersion.ts:12` の注意(`MIN_IOS_BUILD <= 配る CFBundleVersion`)に従う。
- shared zod: `packages/shared/src/schemas/personalEvent.ts`, `room.ts`(RoomEvent), `ics.ts`, `google.ts`, `classTransfer.ts`, `attendance.ts:68-83`(OccurrenceRange)。

### A2-2. `fix/ics-esm-import` の現状

- worktree `Muraki/worktrees/atender-ics-esm-import` @ `39e2db4` (2026-07-17)。main 未マージ 3 コミット(`f4160c2` CJS/ESM interop 修正、`fa5afa1` 契約テスト、`39e2db4` 終日 APP_TZ)。**未コミット差分あり**: ` M apps/api/src/lib/icsParse.ts` (+106/-20) と untracked の `probe-matrix.ts`/`probe-stack.ts`/`probe-zones.ts`。
- **main の ICS import は実質壊れている**: 実測 (tsx, `apps/api`): `import * as ical from "node-ical"` で `typeof ical.parseICS === "undefined"`、`ical.default.parseICS` は function。`icsParse.ts:48` は `ical.parseICS(...)` を呼ぶ → throw。本番は `node dist/index.js` (`package.json:9`) で `tsc` ビルド形態の挙動は未確認だが、台帳 A9 も「この経路は一度も実行されたことがなかった」と記録。つまり**iOS のルーム ICS 取り込みは現状ユーザーに価値を出していない**。
- ICS import を撤去する(要望 1 の範囲次第)なら、このブランチ/worktree は**破棄で畳める**根拠になる。Web が ICS UI を持つので API 側を直すかは別判断(Web の ICS 利用実態は未確認)。
- `fix/nonroot-container` は main にマージ済み(`ebeade8`)で、ブランチだけ残っている(削除可)。

## A3. 出欠ルール / 判定の現状

- **モデル** (`apps/api/prisma/schema.prisma`):
  - `User.requiredAttendanceRate Int @default(70)` (`:28`)。**全科目共通・ユーザー単位・率(整数%)**。PATCH `/api/me` で更新、iOS `RequiredRateSheet` (プリセット 60/66/70/80, `:9`)。
  - `AttendanceRule` (`:735-`): `(schoolId, departmentId, userId?)` で一意。`userId=null` が学校・学科デフォルト、`userId` 指定がユーザー上書き。**持つのは 3 つの strategy だけ**: `excusedStrategy`(既定 `REDUCE_DENOMINATOR`)/`tardyStrategy`(`HALF_PRESENT`)/`earlyLeaveStrategy`(`HALF_PRESENT`)。`RuleStrategy` = COUNT_AS_PRESENT/COUNT_AS_ABSENT/HALF_PRESENT/REDUCE_DENOMINATOR/SEPARATE_COUNT。PRESENT/ABSENT/CANCELLED は固定。**閾値(率/回数)は AttendanceRule に無い**。解決は `services/rules.ts:getEffectiveRule` (userOverride ?? schoolDefault ?? system default)。
  - `School.kind` enum = `UNIVERSITY | JUNIOR_COLLEGE | TECHNICAL_COLLEGE | VOCATIONAL_SCHOOL | HIGH_SCHOOL | OTHER` (`:126-133`)。`apps/api/scripts/seed-demo-user.ts:27` の `kind: "SENSHU" as any` は enum 外(`as any` で素通し、デモ seed 限定で本番コードには無関係)。**iOS の `SetupViewModel.addSchool` は常に `kind: .other`** (`SetupFlowView.swift:205`) → ユーザー作成校は kind=OTHER で大学/専門の区別がつかない。本番に MEXT 全件 seed が入っているかは未確認(リポジトリにあるのは 35 行の `mext-schools-sample.csv` のみ、`seed-mext-schools.ts` は `mext-schools.csv` 優先)。
- **計算** (`services/attendanceStats.ts`、API 側のみ。iOS は DTO を表示するだけで再計算しない):
  - 単位は **occurrence = 1 限(コマ)**。分母 `denominator = course.occurrences.length − denominatorReduction` (休講/SEPARATE/REDUCE を除外, `:155`)。`attendanceRate = numerator/denominator`。`toDate.attendanceRate` は「今日まで・過去未記録=欠席扱い」。設計 `20260611-occurrence-based-denominator.md` どおり開催回数ベース。
  - `allowedAbsences = floor((1−r)×D − 消化欠席 + 1e-9)` (`:165-170`、r=必要出席率/100)。`allowedAbsenceDays = floor(allowedAbsences / maxDayPeriods)` (`:171-177`)。overall は生値を合算してから floor (`semesterOverview.service.ts:59`)。
  - 公欠 EXCUSED は既定 `REDUCE_DENOMINATOR`(分母から除外=欠席にも出席にも数えない)。TARDY/EARLY_LEAVE は 0.5 出席。`statusWeight` (`:21-28`)。
  - 現在の "あと N" は「**必要出席率から逆算した許容欠席限数**」。大学の「欠席 N 回で失格」とは(a) 単位が限(2 連続コマ=2)、(b) 閾値の出所が率入力、(c) 遅刻 3 回=欠席 1 回のような換算がない(TARDY は 0.5 で固定)、の 3 点で異なる。
- **DTO/表示**: `CourseStatsDto`(`packages/shared/src/schemas/stats.ts`)に `allowedAbsences`/`allowedAbsenceDays`/`remainingCount`/`counts`。iOS 表示: `SemesterOverviewView.swift:288-318` `overallActionText`/`courseActionText`(「あと N限(M日) 休める」「残り全休OK」「N% を下回る見込み」)、`SemesterOverviewComponents.swift:3-66` `AttendanceRateHero`、`:316-` `CourseListItem`。必要出席率は `RateProgressBar`/`Color.forRate` の色分けにも使用。
- **回数ベースを足す場合の事実材料** (設計はしない):
  - 保存場所の候補は 3 つ: `User`(既存 `requiredAttendanceRate` と並置)/`AttendanceRule`(学校・学科デフォルト+ユーザー上書きの機構が既にある)/`Course`(科目別。現状 `Course` は name/teacher/color/note のみ)。いずれも **nullable 列の追加 (SQLite `ALTER TABLE ADD COLUMN`) で additive 可**。NULL 既定なら旧クライアント(build 12〜20)は新フィールドを無視するだけ(Codable は未知キーを無視)。逆に **iOS が新フィールドを非 Optional にすると旧 API で decode が落ちる** → デプロイ順は API 先 (既存 gotcha: `non-optional-dto-field-is-not-additive-for-callers`)。
  - 計算は 1 か所 (`attendanceStats.ts`) に集約されているので、率と回数の共存は `allowedAbsences` の算出式を 2 本にして `min` を取る/どちらかを主表示にする、のいずれも API 側変更で閉じる。iOS は `allowedAbsences` を既に「回(限)」表示しているので、回数ルールを入れても**表示コンポーネントは流用可能**(論点は文言とカウント単位 = 限か授業回か)。
  - `User.requiredAttendanceRate` は全科目共通。大学は科目ごとにシラバスが違う(B1)ので、科目別閾値を持たないモデルでは「科目ごとに欠席上限が違う」を表現できない。
  - 単位(単位数・GPA)の概念は DB に無い (`Course` に credits なし)。「単位システム対応」を単位数管理と解釈する場合は新規。Touri の質問文は出席判定の話なので出席ルールの話と解釈した(未確認)。

## A4. オンボーディング / 学期設定 / 公開時間割

### A4-1. 画面と state

- **初回オンボーディング**: `App/RootView.swift:19-24` が `me.setupStatus.isComplete == false` のとき `SetupFlowView` を出す。完了条件 = `schoolId`・`departmentId`・`defaultSemesterId` が全て非 null (`apps/api/src/lib/setupStatus.ts`、**時間割は含まない**)。`Features/Setup/SetupFlowView.swift`:
  - step1 学校検索 (都道府県 menu は 9 件固定 `SetupViewModel.prefectures`) → step2 学科検索/追加 (`submitDepartment` `:226` で `PATCH /api/me` に school/department を保存し `step = 3` `:236`) → step3 学期作成 (`submitSemester` `:242`、`PATCH /api/me` で `defaultSemesterId`、`refreshMe()` `:252`)。**「学校+学科を選んだ直後」の hook 点は `submitDepartment()` 成功直後 (`:236`)**。
  - **step3 完了で `defaultSemesterId` が入り `isComplete` が true になった瞬間に `RootView` が `MainTabView` へ切り替わる**ため、提案をオンボーディング内に出すなら step3 より前 (step2 直後〜step3 内) に置く必要がある (step4 を足しても到達しない)。学期作成後の提案は Home 側の導線が要る。
  - ★ step3 の既定値が `SemesterDraft(name: "2026 前期", startDate: "2026-04-01", endDate: "2026-09-30")` の**ハードコード** (`:164`)。調査日 (2026-10-29) では既に終了した学期が既定になる。`SemesterRollover.proposal(after:today:)` (`Features/Home/SemesterRollover.swift:29-41`) は日付から前期/後期を出すロジックを持つが Setup は使っていない。
  - `SetupViewModel.addSchool` は `kind: .other` 固定 (`:205`)、学科は自由入力追加 (`Department` は `@@unique([schoolId, name])`)。→ 同じ実在学科でもユーザーが別名/別行で作ると**別 `departmentId`** になり、公開時間割の「同じ学科」判定は ID 一致のみ。表記ゆれで分裂しうる(本番の school/department/template 件数は**未確認**)。
- **通常の学期設定**:
  - `Features/Settings/SemesterListSheet.swift` (設定→学期管理): 追加/編集/削除/既定選択。作成は `createSemester` (`:158`)。ここには時間割(UserTimetable)の概念が無い(学期だけ作る)。
  - `Features/Home/SemesterCreateSheet.swift` (77行, build 19 の軽量作成シート): `SemesterProposal` を受け、`createSemester` → `updateMe(defaultSemesterId)` → `onCreated` (`:56-75`)。起動元は Home の前学期終了 alert (`HomeCore.swift:137`) のみ。コマ設定は前学期から引き継ぐ旨の文言 (`TimetableCarryOver`)。
  - **時間割(UserTimetable)は学期作成時には作られない**。`SelfTimetableViewModel.ensureTimetable` (`Features/Home/SelfTimetableView.swift:90`) が**コマを最初に追加/設定を開いた時に遅延作成**する (`title:"自分の時間割"`, 引継ぎスロット)。`DELETE /api/user-timetables/:id` は存在(カスケード)。
  - 既定学期の切替は Home の `SemesterMenu`(`HomeCore.swift:256-`)。`TimetableSettingsSheet` に「みんなの時間割で公開」トグル (`:70`、**既定 ON** `:19`、`:187-195` `publishAsTemplate(title:)` を `try?` で呼ぶ)。
- **me DTO**: `UserDto` に `schoolId`/`departmentId`/`defaultSemesterId` あり (`DTOs.swift:11-23`)。ただし**名前は持たない**(`schoolName` 等なし。表示には `schools`/`departments` を再取得するか `TemplateDto.schoolName/departmentName` を使う)。`SetupStatus` に `hasUserTimetable` あり(`:30-36`)。

### A4-2. 公開時間割 API

- `GET /api/timetable-templates?schoolId&departmentId&q&limit&cursor` (`routes/templates.ts:23-49`): `isPublic:true`、`q` は **title の部分一致のみ**、`limit` 既定 20・最大 50 (`packages/shared/src/schemas/template.ts:48-54`)、`updatedAt desc` + cursor。**件数だけを返す endpoint は無い**。レスポンスは毎回 `daySlots`/`courses`/`meetings` を丸ごと include (`:12-18`)。`copyCount` は DTO にある。並びに人気順なし。
- `POST /api/timetable-templates/:id/copy` (`:75-86`, `services/templateCopy.ts`): 自分の学期のみ(他人 403 `FORBIDDEN`、学期なし 404)。`UserTimetable` は `@@unique([userId, semesterId])` なので**対象学期に既に時間割があると 409 `CONFLICT`**。上書き/マージの概念は**無い**。Web は 409 を「この学期には既に時間割があります。別の学期を選ぶか、既存を削除してください」と表示 (`apps/web/src/routes/Templates.tsx:10-15`)。コピーされるのは daySlots/courses/meetings(room・periodCount 含む)。**`UserTimetable.daysOfWeek`(表示曜日)は template に無いのでコピーされず既定 `1,2,3,4,5`**。`copyCount` +1。コピー後 `generateOccurrencesForUserTimetable` が走り出欠 occurrence も生成 (`templates.ts:83`)。
- **template の `year`/`term`**: `schema.prisma:187-188` コメント通り `year` = **学年(1-4)であって西暦ではない**、`term` = "前期/後期/通年" 等の自由文字列。さらに iOS の `TemplatePublishInput(title:)` は year/term を送らない (`DTOs.swift:315-320`、`TimetableSettingsSheet` は title のみ) → **iOS 経由で公開された template は year/term が null**。Web `/templates` の publish 経路は未確認(`usePublishTimetable`)。**学期と突合して「同じ学期の時間割」を優先表示する材料は DB に無い** (title の文字列 "2026 前期 情報処理科 2年" への部分一致程度)。
- `publish-as-template` (`routes/userTimetables.ts:126-`): school/department は**ユーザーの現在値**を使う(未設定なら 403 `SCHOOL_OR_DEPT_NOT_SET`)。重複チェックなし → 設定シートで公開トグル ON のまま保存するたびに新規 template が作られる(コードからの読み取り。実データでの重複は未検証)。
- `authorUserId` は退会で null になりうるが DTO は番兵 `""` に変換 (`lib/dto.ts:79`) → iOS の非 Optional `authorUserId: String` は安全。

### A4-3. iOS の到達性 (死んだ機能)

- ★ `TemplatesView` は削除済 (§0-1)。導線は build 16 #N6 で既に消え、build 18 P1 (`0784bef`) でファイルごと削除。`RoomsRoute.templates` も `AppRouter.swift` から消えている(現 `AppRouter.swift` は `FriendsRoute` のみ)。
- 生きているコード: `TemplateRepository`(`RoomRepositories.swift:165-196`)・`Endpoints.templates/template/createTemplate/copyTemplate/publishAsTemplate`・`TemplateDto`(`DTOs.swift:250-268`)・`TemplateLogic.authorHandle`(`RoomLogic.swift:271`、テスト 1 本)。`AppEnvironment.templateRepository` は注入されているが誰も使っていない。
- 2026-07-21 設計 (`20260721-public-timetable-search.md`) の 2 段ピッカー(学校→学科→一覧、取り込み先学期 Picker、409 表示)は設計として残っており、復元元の実装は `0784bef^`。ただしその設計は「学校ID/学科ID生入力」の dev グレードを置き換えたもので、**今回の要望(登録済みの学校+学科から自動提案)とは入口が違う**(自動検索が主、ピッカーは副)。

## A5. ビルド・テスト基盤・リリース状態

- `project.yml:49` `CFBundleVersion: "20"`、`CFBundleShortVersionString: "1.0"`。`Info.plist` は xcodegen 生成物。`MIN_IOS_BUILD = 12` (`apps/api/src/lib/clientVersion.ts:15`、テスト `BuildVersionTests` が `MIN_IOS_BUILD <= CFBundleVersion` を検査)。版数ピン留めテスト 3 ファイルは A1-6 参照。
- git: `main` = `ebeade8` (clean)。ブランチ: `fix/ics-esm-import`(未マージ、worktree あり・未コミット差分あり)、`fix/nonroot-container`(**main にマージ済み**、削除可)、`origin/feature/mvp`。
- **ASC (実測, `Muraki/scripts/asc.py`)**: `reviewSubmissions/e21be568-…` = `state: COMPLETE`、submittedDate 2026-10-09、item `state: APPROVED`。App Store version **1.0 = `READY_FOR_SALE` / `READY_FOR_DISTRIBUTION`** (createdDate 2026-07-13)、紐づく build = **20**。builds: 20 (2026-10-08 upload, VALID)、19、18 (VALID)、16/15 は expired。→ **build 21 を App Store に出すには新しい App Store version(1.0.1 / 1.1)の作成が必要**。TestFlight のみなら 1.0 のまま build 21 を upload 可。
- **API ベースライン (今回実測)**: `cd apps/api ; pnpm exec vitest run` → **Tests 27 failed | 562 passed | 1 skipped (590) / Test Files 11 failed | 38 passed (49)**。内訳 = 台帳の既知 16 (A1-A5,A7,A8 / B1-B5 / Magic Link 4, `known-failures.md`) + 環境依存 5 (dev `.env` 漏れ: `auth #7`, `cors-cookie #70`, `ios-api 8.4` ×3) + **6 (`b20-account-deletion` #D9-D14)**。
  - この 6 件は台帳に無かったので原因を調べた: `PrismaClientKnownRequestError: Error converting field "authorId" of expected non-nullable type "String", found incompatible value of "null"`。`node_modules/.pnpm/@prisma+client@6.19.3…/.prisma/client/schema.prisma:180,509` が **旧スキーマ(`authorId String` / `onDelete: Cascade`)** で、リポジトリの `schema.prisma:180,509` (`String?` / SetNull) と不一致 = **生成済み Prisma Client が古い**(client 生成 2026-10-09 01:35、build 20 migration 前)。**分類: 環境依存 (`pnpm exec prisma generate` で解消するはず)**。再生成して緑になることまでは未確認(コード/環境を変えない方針で実施せず)。台帳に追記が必要(追記すれば未分類は 0)。
  - **計測の罠**: 1 回目は 127 failed / 94 pending で**無効**だった。直前にバックグラウンドで起動して殺された vitest の残骸が `apps/api/tests/.tmp/` (template.db 共有) を汚し、`prisma migrate deploy` 失敗・`PrismaClientUnknownRequestError` が大量に出た。`rm -rf tests/.tmp` して単独で再実行したら 27/562 に戻った(commit `6bcd670` のメッセージ「27 failed / 562 passed」と一致)。vitest を並走・バックグラウンド起動させない。
- iOS ユニット: 719 / 0 fail (build 20 出荷時, 台帳)。**今回は再実測していない**(xcodebuild 未実行)。未分類 0。

## B1. 日本の単位認定と出席要件 (事実のみ。結論は出さない)

### B1-1. 法令に出席要件はあるか

- **大学設置基準**(昭和31年文部省令第28号、e-Gov 2026-09-04 施行版を API で全文取得): 「出席」「欠席」「出欠」が**全文で 0 回**。第21条は「一単位の授業科目を四十五時間の学修を必要とする内容をもつて構成することを標準」「おおむね十五時間から四十五時間までの範囲で大学が定める時間の授業をもつて一単位」と**学修時間の枠だけ**を定める。
- **専修学校設置基準**(昭和51年文部省令第2号、同): 「出席」「欠席」が**0 回**。授業時数・単位の定めはあるが出席率の定めはない。
- → 出席要件は**各学校の学則・履修規程・シラバス依存**(根拠: 上記 2 法令に規定なし)。
- ただし**別の法令に「率」が出てくる**: 大学等における修学の支援に関する法律施行規則 (`501M60000080006`, 高等教育の修学支援新制度。大学・短大・高専・専門学校が対象) の別表に「履修科目の授業への出席率が**六割以下**であること…(学修意欲が著しく低い)」(廃止の区分)、「出席率が**八割以下**…(学修意欲が低い)」(警告の区分、括弧書きで廃止の項第三号を除外) とある。専門学校の「80%/90%」という数字の出どころの一つの可能性はあるが、**各校の学則がそれに倣っているという証拠は取れていない**(未確認)。

### B1-2. 実在する学校の文言 (6 件中 5 件は原文 PDF を取得して確認)

| 学校 | 文言(逐語) | 種別 | URL |
|---|---|---|---|
| 近畿大学 国際学部 | 「授業回数の 3 分の 2 を超える出席がなければ、各試験等の受験資格、レポート等の提出資格を失います」(授業担当教員の別指示がある場合を除く) | **率(2/3)・「超える」** | kindai.ac.jp/international-studies/files/research-and-education/curriculum/outline/syllabus_alart.pdf |
| 東海学院大学 (履修の手引 H26) | 「授業回数の 70%以上出席し…」「各教科目において70%の出席がなければ定期試験を受験することが出来ません。なお、定められた理由により授業を欠席した場合は、公認欠席扱いとなります」 | **率(%)** | tokaigakuin-u.ac.jp/…/rishu_tebiki_h26/123_26dai3.pdf |
| 宇都宮短期大学 (ホーム HTML の © 表記からの推測、学校名は PDF 内に無い) 学生便覧 | 「出席回数が 3 分の 2 に満たない科目の定期試験は受けられず、単位は認定されません」「30 分未満の遅刻、早退の合計 3 回分を欠席 1 回と換算します」「公欠(公認欠席)は、授業に関しては欠席扱いになりますが、試験の受験資格に抵触する場合や、成績評価において、不利にならない等の教育的配慮を行います」(公欠: 忌引・学校感染症・実習・公共交通機関の遅延 等) | 率(2/3)+**回数換算(遅刻3=欠席1)**+公欠 | ujc.ac.jp/absence/files/absence.pdf |
| 東京科学大学 | 「『公欠』とは…やむをえず授業を欠席した場合、これを欠席扱いとはしない取扱いをいう」(令和6年10月1日制定) | 公欠=欠席に数えない | titech.ac.jp/guide/guide_2026/graduate/pdf/12-16.pdf |
| 岡山・建部医療福祉専門学校 学則 (専門学校) | 第17条「授業時間及び臨地実習の出席時間が 3 分の 2 以上出席していない者については、その授業科目の学業成績は評価しない」第19条「欠席日数が出席すべき日数の 3 分の 1 を超える者については、原則として卒業を認めない」 | 専門学校・**時間数の率(2/3 以上)** | okayamatakebe.isu.ac.jp/media/files/disclosure/2023_new/SotsuNintei.pdf |
| 函館厚生院看護専門学校 (専門学校) | 第2条「単位修得の認定は、各授業科目における規定時間の３分の２以上の出席の上に、成績評価を実施し合格と認めたもの」第6条「試験を受けることができるのは、授業時間の３分の２以上の出席をした者」 | 専門学校・率(2/3 以上) | college.koseiin.or.jp/…/2026_student_binnrann.pdf |

- **「回数」で書く規定**: 同志社大学法科大学院の出席規程が「15回の授業を行う科目にあっては5回以上の欠席があった場合には当該科目の単位修得を認めません」という趣旨(WebSearch スニペットのみ。原文 PDF は取得時に 503 メンテナンスで**未確認**)。回数表現の実例はこの 1 件のみで、法科大学院(専門職大学院)であり学部の代表例ではない。
- **「以上」と「超える」で境界が 1 回ずれる**: 15 回授業なら「2/3 以上」=10 回出席(欠席 5 回まで)、「2/3 を超える」=11 回出席(欠席 4 回まで)。近畿大学は「超える」。
- **遅刻の換算**: 「30 分未満の遅刻・早退 3 回 = 欠席 1 回、30 分以上は欠席」(宇都宮短大)。看護校の例では 30〜45 分遅れ=1 時間の欠課、45 分超=2 時間の欠課(静岡市立清水看護専門学校の内規、WebSearch スニペット、原文未取得)。atender の TARDY/EARLY_LEAVE=0.5 固定 (`attendanceStats.ts:15-17`) はこれらのどれとも一致しない。
- **公欠**: 「欠席に数えない(東京科学大)」と「欠席扱いだが受験資格・評価で不利にしない(宇都宮短大)」の 2 流儀がある。atender の既定 `REDUCE_DENOMINATOR`(分母除外)は前者に近い。
- 専門学校の「率 80%/90%」を学則本文で確認する目的で 2 回検索したが**一次資料は取れなかった**(取れたのは看護系専門学校の 2/3 のみ)。IT/デザイン系専門学校の実例は**未確認**。

### B1-3. Touri の仮説「大学=回数、専門=率」の判定 (事実ベース)

- 取得できた原文では、大学も専門学校も**基準自体は率(2/3 または 70%)で書かれている**。「欠席 N 回まで」という表現は取得できた大学の学則/便覧に出てこなかった(回数表現は同志社法科大学院 1 件のみ、未確認)。
- 回数で語られるのは**運用上の翻訳**: 「全 15 回なら欠席 5 回まで/4 回まで」(2/3 以上か超えるかで 1 回差)。シラバスで科目ごとに「3 回欠席で…」と書く教員もいる可能性があるが、取得した資料では確認できていない。
- 大学では**科目(教員)ごとに異なる**ことが明示されている(近畿大学「授業担当教員から異なる指示がある場合を除いて」「各授業科目の出欠に関する取り決めは『シラバス』に記載」)。atender の「全科目共通 1 本の必要出席率」では表現できない。
- 設計材料として: (a) 基準の種類は 2/3 以上 / 2/3 超 / 70% / 学期中の回数上限、の少なくとも 4 通りが実在、(b) 遅刻換算と公欠の扱いも学校ごと、(c) 率・回数のどちらを入力させても 15 回授業なら相互に換算できるが、境界(以上/超える)を入力側が選べないとズレる。

## B2. EventKit write-only (iOS 17〜)

(汎用部分は `Muraki/knowledge/library/eventkit-ios17-access-and-sync-identifiers.md` に追記済)

- `requestWriteOnlyAccessToEvents(completion:)` (iOS 17.0+): 「If the person grants permission, your app receives write-only access…Your app can create events, but it can't access any of the existing calendars and events on the device, **including events your app created**. API calls to read event data from the event store don't return any events.」(developer.apple.com …/requestwriteonlyaccesstoevents(completion:))。
- Accessing the event store: 「If your app has write-only access, a request for a list of calendars **returns a single virtual calendar**, that doesn't represent any real calendar in the event store. Requests for events on the virtual calendar return no results. When your app creates an event, EventKit saves it to a calendar that's **chosen by the person** using your app.」→ `EKEventStore.calendars(for:)` は**使えるが実カレンダーを返さない**。書き込み先を指定できず、専用カレンダーの再取得(`calendar(withIdentifier:)`)・既存イベントの更新/削除もできない。
- Info.plist: `NSCalendarsWriteOnlyAccessUsageDescription` (write-only) または `NSCalendarsFullAccessUsageDescription` (full)。「**On iOS 17 or later, if your app doesn't include usage description keys, or only includes the older `NSCalendarsUsageDescription` key…iOS automatically denies any access request.**」現行 `project.yml` は Full だけ持つので、write-only を要求するなら `NSCalendarsWriteOnlyAccessUsageDescription` の追加が必須。両キーを併記したときの挙動は公式に記載なし(未確認)。
- 権限なしの別経路: `EKEventEditViewController` は iOS 17+ でプロセス外 UI として動き、権限不要 (Accessing the event store / sample 'DropInLessons')。ただし**1 件ずつユーザー確認が要る**ので学期ぶん(数百件)の一括書き出しには不向き(UI の性質からの推論、一括用途の公式記述は無し)。
- **既存設計との照合** (`20260729-eventkit-dedicated-calendar-export.md`): 設計 §13「write-only で書き出しだけ動かす — 却下。…作った専用カレンダーを再取得できないので毎回再作成に陥る」は**今回確認した公式文言と整合**(§3 の T1「専用 Atender カレンダーを自動生成」が前提)。`NSCalendarsWriteOnlyAccessUsageDescription` を追加しない判断(`:897`)も同じ根拠。したがって write-only にするとこの設計の差分エンジン(`ExportKey`/`CalendarExportPlanner`/`fetchExported`/`wipeOwned`)が全て使えなくなり、再エクスポートは**重複を作る**(置換/削除不能)。サインアウト時の `wipeExport()`(`SettingsView.swift:170,190`) も不能になる。
- write-only 下で `EKEventStore.saveCalendar` が可能かは公式に記載がなく**未確認**(実機/シミュレータでの権限プロンプト操作が必要で、今回は実測していない)。

## 設計で迷いそうな論点 (Architect/Leader 判断が要る)

1. 「カレンダー」の範囲: Home のカレンダーのみか、個人予定(学期タブの予定セクション・一括予定追加・ルームの共有)や学期カレンダーまで含むか (A1-3)。
2. 書き出しの権限: full 維持で import/個人予定だけ剥がす (最小変更・専用カレンダーと差分更新を温存) か、write-only 化で再設計 (重複不可避・サインアウト時の掃除不能) か (B2)。full 維持なら Info.plist 文言のみ変更。
3. 書き出し対象に個人予定を残すか (残すと PersonalEvent の CRUD UI が無いのに予定だけ書く矛盾が出る)。
4. ルームの予定/ICS/個人カレンダー共有を iOS から消すか (消すとルームは時間割共有+メンバー+招待だけ)。API/Web は残置。
5. 「回数」の入力モデル: 保存先 (User / AttendanceRule / Course)、科目別か共通か、境界 (以上/超える)、遅刻換算 (3 回=1 回)、公欠の扱い、単位は「限」か「授業回」か (A3, B1)。
6. 提案の命中率: ユーザー作成の学校/学科が表記ゆれで別 ID になりうる、iOS 公開の template は year/term が null、iOS に取り込み UI が無い、公開トグルが既定 ON で量産される (A4)。件数 endpoint・並び順(人気順)・学期突合用の列は無い。
7. 409 (対象学期に既に時間割あり) の UX: 時間割は最初のコマ追加で遅延作成される (`ensureTimetable`)。空の時間割なら `DELETE → copy` で差し替え可能だが、API に「空なら上書き」は無い。
8. 設定の「学校・学科」を ID 生入力から検索 UI に作り直す工数 (Setup step1-2 の再利用)。Setup step3 の学期既定値ハードコード (`2026 前期`) の是正。
9. オンボーディングの hook 点: `isComplete` は `defaultSemesterId` で true になり Home に遷移するので、step4 は不成立。提案は step2 直後〜step3 内に置く必要。
10. リリース: App Store は 1.0/build 20 公開中。build 21 の配布形態 (TestFlight のみか新バージョン申請か)、版数ピン留めテスト 3 ファイル、`MIN_IOS_BUILD` は据え置き推奨 (iOS 専用 endpoint を消すなら要引き上げ)。
