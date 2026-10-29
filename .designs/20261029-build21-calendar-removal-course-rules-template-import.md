# atender build 21 — カレンダー撤去 (書き出しだけ残す) / 科目別の出席基準 / 公開時間割の提案と取り込み

> 対象: `apps/ios` (レーン A / B / C) + `apps/web` (レーン A-Web) + `apps/api`・`packages/shared` (B / C は additive、**A2 は破壊的 = カレンダー API とテーブルの削除**)
> 改訂 (2026-10-29 同日 R2): Touri 裁定で「カレンダー機能は API と Web からも消す」。T1/T2 は「テーブルごと消える」ので iOS 側の移行コードは書かない (Leader 裁定)。API は **2 段デプロイ** (§9)
> 前提 main: `ebeade8` (build 20 出荷状態、`CFBundleVersion: "20"`、iOS ユニット 719 / 0 fail (台帳)、API Vitest 27 failed / 562 passed / 1 skipped = 台帳既知 16 + 環境依存 5 + `b20-account-deletion` 6 (未記載、§8.6))
> 版数: `project.yml` の `CFBundleVersion` を **"21"**、`CFBundleShortVersionString` を **"1.0.1"** に (TestFlight 配布 → 同じ build で App Store 1.0.1 申請。§9)。`MIN_IOS_BUILD` は **デプロイ 1 では 12 のまま、デプロイ 2 (A2) で 21**
> デザイン正典: `DESIGN.md`。本 doc で置換が要る記述は §10.1
> 調査の正典: `.knowledge/10-build21-research.md` (以下「R」。`R §A1-5` のように引く)

---

## 0. スコープとレーン

### 0.1 レーン

| レーン | 内容 | 層 |
|---|---|---|
| **A** カレンダー撤去 (iOS) | Home の「時間割 / カレンダー」切替・個人カレンダー・ルームカレンダー・個人予定 CRUD・ルーム予定・ICS 取込・個人カレンダーのルーム共有・EventKit の読み込み・個人予定の書き出しを iOS から撤去。**時間割の iPhone カレンダー書き出し (自動同期トリガー含む) だけ残す** | iOS |
| **A-Web** カレンダー撤去 (Web) | 個人カレンダー・ルームカレンダー・個人予定・ルーム予定・ICS・Google Calendar 連携・関連設定を `apps/web` から撤去。privacy / terms の書き直し (§3.11、§10.3) | Web (デプロイ 1 で出す) |
| **A2** カレンダー API の削除 | カレンダー系 route / service / shared schema / Prisma テーブルの削除 (DROP)、`MIN_IOS_BUILD = 21`。**ブランチ `chore/drop-calendar-api` で書き、1.0.1 が App Store で `READY_FOR_SALE` になった後に main へマージしてデプロイ 2** (§3.12、§9) | API・shared・Prisma (破壊的) |
| **B** 科目別の出席基準 | `Course` に「必要出席率」「欠席上限回数」「遅刻・早退 N 回で欠席 1 回」を任意で持たせ、「あと N 回休める」を率と回数の厳しい方で出す | Prisma (additive)・shared・API・iOS |
| **C** 公開時間割の提案と取り込み | オンボーディング・設定の学校学科変更で「同じ学科の時間割が見つかりました」を提案。学期管理・時間割の設定・学期作成シートから公開時間割を探して自分の学期に取り込む。公開テンプレの量産を止める。設定の学校・学科を検索 UI に作り直す。Setup の学期既定値を日付から決める | Prisma (additive)・shared・API・iOS |
| **R** リリース | 版数 21 / 1.0.1、版数ピン留めテスト 4 本、台帳、DESIGN.md / CLAUDE.md 置換、デプロイ 1 → App Store 1.0.1 申請 → デプロイ 2 | A・A-Web・B・C のマージ後 (A2 は別) |

### 0.2 触らない

| 対象 | 理由 |
|---|---|
| `GET /api/occurrences` (`routes/occurrences.ts` / `services/occurrence.service.ts`) | 書き出しが使う。A2 でも残す |
| `ClassTransfer*` (API・iOS・Web)、`GET /api/day/:date` の occurrence / 休講 / 授業変更部分、`GET /api/rooms/:id/week` の `members`・`meetings`・`recurringMeetings` | 残す (A2 で外すのは `personalEvents`・`roomEvents` の出力だけ) |
| Google **サインイン** (`apps/api/src/auth.ts:86-92` の better-auth `socialProviders.google`、`Account` テーブルの token、`services/tokenRevocation.service.ts` の Google revoke、iOS `GoogleSignIn`、Web の Google ログインボタン) | 認証であってカレンダーではない。判別は §3.12.1 |
| `Room.showMemberTimetables` | ルーム時間割の表示設定なので残す (Web の文言だけ「カレンダーに反映」→「表示」に直す) |
| Web の時間割・出欠・学期 (出欠カレンダー `AttendanceCalendar` 含む)・ルーム時間割・テンプレ・友達・法務ページ | 残す |
| 学期タブの出欠カレンダー (`AttendanceCalendar` / `SemesterCalendarGrid`) と授業変更 (`ClassTransfer*`) | Touri 裁定で残す |
| `AttendanceRule` (学校・学科デフォルトの出欠ルール) | Leader 裁定。科目別ルールは `Course` にだけ足す |
| `PrivacyInfo.xcprivacy` | 収集データ型は変わらない (`OtherUserContent` は科目名・ルーム名で残る)。`B20PrivacyManifestTests` の collected types 部分は不変 |
| 書き出しエンジン (`ExportKey` / `CalendarExportPlanner` / `AtenderCalendarResolver` / `CourseExportMapping` / `EventKitTimeMapping` / 専用カレンダー / full access) | 残す。write-only 化はしない (§11) |
(`fix/ics-esm-import` worktree / branch は ICS ごと消えるので**廃棄**する。R の作業: `git -C Muraki/projects/atender worktree remove --force ../../worktrees/atender-ics-esm-import` → `git -C Muraki/projects/atender branch -D fix/ics-esm-import`。未コミット差分と probe スクリプトも捨てる。マージ済みの `fix/nonroot-container` も `branch -d` で消す)

### 0.3 ★ ファイル境界 (レーン間の重なり)

**同じファイルを 2 レーン以上が触る箇所**。いずれも別の型・別の関数・別の行で、意味の衝突は無い (テキストのマージ衝突だけ)。

| ファイル | A | B | C |
|---|---|---|---|
| `apps/ios/Atender/Core/Models/DTOs.swift` | PersonalEvent*/EventKit*/LegacyEk*/RoomEvent*/Share*/Ics* を削除、`DayDetailDto.personalEvents`・`RoomWeekDto.roomEvents` を削除 | `CourseDto`・`CourseCreateInput`・`CourseUpdateInput`・`CourseStatsDto` に追加 | `UserDto`・`TemplateDto`・`TemplateCopyInput`・`UserTimetableDto` に追加、`TemplatePatchInput` 新設 |
| `apps/ios/Atender/Core/Models/Enums.swift` | `VisibilityMode`・`RoomEventSource`・`IcsSource`・`IcsImportStatus`・`IcsMatchType` を削除 | — | — |
| `apps/ios/Atender/Core/Networking/APIEndpoint.swift` | 個人予定・EventKit・ルーム予定・ICS・共有の endpoint を削除 | — | `patchTemplate` 追加 |
| `apps/ios/Atender/Core/Data/Repositories.swift` | `PersonalEventRepository` を削除 | — | `TimetableRepository.templates/copyTemplate` を削除、`publishAsTemplate` に invalidate、`unpublishTemplate` 追加 |
| `apps/ios/Atender/Core/Data/RoomRepositories.swift` | `RoomEventRepository`・`IcsImportRepository` を削除 | — | `TemplateRepository.publishTimetable` 削除 |
| `apps/ios/Atender/Core/Data/InvalidationMatrix.swift` / `QueryKey.swift` | `.personalEvent`/`.roomEvent`/`.icsImport` と `personalEvents()`/`roomEvents()`/`icsImports()`/`icsTitleRules()` を削除 | — | `.templateCopy` の対象を拡張 |
| `apps/ios/Atender/App/AppEnvironment.swift` | `personalEventRepository`・`roomEventRepository`・`icsImportRepository` を削除 | — | — |
| `apps/ios/Atender/Features/Settings/SettingsView.swift` | 「カレンダー同期」節の文言・`case google` 削除 | — | 「学校・学科」行の trailingText |
| `apps/ios/Atender/Features/Rooms/RoomLogic.swift` | `RoomCalendarLogic`/`RoomEventTiming`/`RoomAvailability`/`RecurrencePresetLogic` を削除 | — | `TemplateLogic` を削除 |
| `apps/ios/Atender/Features/SemesterOverview/*` | `DayDetailSheet`・`BulkAndPersonalEventSheets` (予定の節) | `SemesterOverviewView` (DisplayLogic)・`SemesterOverviewComponents` (`CourseListItem`)・`CourseDetailModal` | — |
| `apps/api/prisma/schema.prisma` | — | `Course` に 3 列 | `TimetableTemplate` に 2 列 |
| `apps/api/src/lib/dto.ts` | — | `courseDto` | `templateDto`・`userTimetableDto` |
| `packages/shared/src/schemas/template.ts` | — | `CourseDto` | `TemplateDto`・`TemplateCopyInput` |
| `apps/api/scripts/seed-demo-user.ts` | — | 科目ルール 1 件 (§8.4) | 同級生 + 公開テンプレ (§8.4) |
| `HomeCore.swift` | `HomeViewMode`/`CalendarModePicker`/`HomeBody` | — | — (C は `SemesterCreateSheet` 本体だけを触る。Home の呼び出しは不変) |
| `SetupFlowView.swift` | — | — | C のみ |

**Web / API の重なり**:

| ファイル | A-Web | A2 | B | C |
|---|---|---|---|---|
| `apps/web/src/components/semester/DayDetailSheet.tsx`・`BulkEditSheet.tsx` | 予定の節を削除 | — | — | — |
| `apps/web/src/components/settings/Settings.tsx` | Google / ICS の行・シート、削除確認文 | — | — | — |
| `apps/web/src/api/hooks/types.ts`・`index.ts`・`queryKeys.ts` | カレンダー系を削除 | — | — | — |
| `apps/web/public/privacy.html`・`terms.html` | 移行期の文言 (§10.3.1) | 最終文言 (§10.3.2) | — | — |
| `apps/api/prisma/schema.prisma` | — | カレンダー 9 モデル・7 enum と relation 行を削除 | `Course` | `TimetableTemplate` |
| `apps/api/src/routes/rooms.ts`・`me.ts`・`services/room.service.ts`・`dayDetail.service.ts`・`accountDeletion.service.ts` | — | A2 のみ (§3.12) | — | — |
| `packages/shared/src/index.ts`・`schemas/room.ts`・`day.ts` | — | A2 のみ | — | — |
| `apps/api/src/lib/clientVersion.ts` | — | `MIN_IOS_BUILD = 21` | — | — |

A-Web は API に触らない (Web は削除するだけで、API は A2 まで全 endpoint を返し続ける)。A2 と B / C は `schema.prisma` で重なるが別モデル。

**順序制約 (migration)**: B の migration 名 `20261029120000_b21_course_attendance_rules` < C の `20261029130000_b21_template_source_link`。Prisma の `migrate deploy` は未適用分を名前順に当てる。**デプロイ 1 は B と C の両方が main に入った後に 1 回だけ**。A2 の DROP migration は §3.12.4 の規則で**マージ直前に名前を付け直し**、main の最大名より後にする。

**推奨 (Leader が決める)**: A ∥ A-Web ∥ B を並列、C は B のマージ後に着手 (C は B と `schema.prisma`・`dto.ts`・`template.ts` を共有するため)。A2 は B / C のマージ後に main から `chore/drop-calendar-api` を切って書き、レビューまで済ませて**マージは保留** (§9 手順 9)。R は A・A-Web・B・C のマージ後。

### 0.4 用語

- **授業回 (lesson)**: 同じ科目・同じ日付の occurrence の集まりを 1 回と数える単位 (連続していなくても、振替の occurrence を含めても 1 日 1 回)。既存表示の「(M日)」(`allowedAbsenceDays`) と同じ粒度
- **限 (occurrence)**: `MeetingOccurrence` 1 行 = 1 コマ。既存の出席率と `allowedAbsences` の単位
- **共通の必要出席率**: `User.requiredAttendanceRate` (既定 70)
- **公開時間割 / テンプレ**: `TimetableTemplate` (`isPublic = true`)
- **空の時間割**: `UserTimetable` のうち `meetings` が 0 件**かつ** `courses` が 0 件のもの (§5.6.1)
- **today**: `SchoolClock.todayString()` (iOS) / `toIsoDate(new Date())` (API)、JST の `yyyy-MM-dd`

---

## 1. 目的

1. iOS からカレンダー機能の画面と設定項目を消し、「時間割を iPhone カレンダーに書き出す」だけを残す (要望 1)
2. 大学のように科目ごとに「欠席 N 回まで」「遅刻 3 回で欠席 1 回」と決まる出席基準を科目単位で持ち、「あと何回休めるか」を正しく出す (要望 2)
3. オンボーディングと設定で学校・学科を選んだ直後に、同じ学科の公開時間割を提案し、自分の学期に取り込めるようにする。通常の学期設定からも探して取り込める (要望 3・4)

---

## 2. 現状の実測 (R に無い / R を補正する事実のみ。`ebeade8`)

| 事実 | 場所 | 設計への影響 |
|---|---|---|
| ★ R §0-1「iOS に取り込み UI は存在しない」は**不正確**。`TimetableSettingsSheet` に「同じ学校の公開時間割から持ってくる」が残っていて、`copyTemplate` を**時間割が既にある学期** (`timetable.semesterId`) に投げている。`timetable == nil` だとボタン自体が disabled なので、**押せる時は必ず 409** になり、`try?` で握り潰して「取り込みました」と表示する | `Features/Settings/TimetableSettingsSheet.swift:76-106, 216-227` | 撤去して新しい取り込み導線 (§5.5 E2) に置き換える |
| `TimetableRepository.templates/copyTemplate` と `TemplateRepository.templates/copyTemplate` が重複している (前者は `TimetableSettingsSheet` だけが使う) | `Core/Data/Repositories.swift:126-136`、`RoomRepositories.swift:165-196` | `TemplateRepository` に一本化 |
| `TemplateLogic.authorHandle` は `authorUserId` (cuid) をそのまま返す。handle は DTO に無い | `Features/Rooms/RoomLogic.swift:271-275` | カードに作成者を出さない (§5.3.4)。`TemplateLogic` は削除 |
| `POST /api/semesters` は `UserTimetable` を 1 件も持たないユーザーなら `defaultSemesterId` を自動で立てる → オンボーディングでは**学期作成の時点でサーバー側の `isComplete` が true になる** | `apps/api/src/routes/semesters.ts:42-45` | iOS の画面遷移は `authStore.refreshMe()` を呼んだ時だけ起きる (`RootView.swift:20`、呼び出し元は `SetupFlowView.swift:252`・`RootView.swift:48` (OAuth callback)・`NowNextBar.swift:29` (Home 内)) ので、Setup 内では「学期作成 → 取り込み → 既定学期 → refreshMe」の順で遷移を遅らせられる。ローカルフラグは要らない (§5.4.3) |
| `POST /api/user-timetables` は `defaultSemesterId` を作成学期に書き換える。`POST /api/timetable-templates/:id/copy` は書き換えない | `routes/userTimetables.ts:76`、`routes/templates.ts:75-86` | 取り込みは既定学期を変えない (挙動仕様 C17) |
| `UserTimetable.daysOfWeek` は **1=月 … 7=日** の CSV、`Meeting.dayOfWeek` / `TemplateMeeting.dayOfWeek` は **0=日 … 6=土** (JS)。テンプレは `daysOfWeek` を持たないのでコピー後は常に `"1,2,3,4,5"` (土曜の授業がある時間割を取り込むと土曜が表示曜日に入らない) | `schema.prisma:243, 263`、`packages/shared/src/schemas/userTimetable.ts:4-7`、`services/templateCopy.ts:30-37` | テンプレに `daysOfWeek` を足し、無い場合は meeting から導出 (§5.2.3) |
| 公開は授業 0 件の時間割でも template を作る (`TimetableSettingsSheet` は時間割作成直後でも保存で公開する) | `routes/userTimetables.ts:126-155`、`TimetableSettingsSheet.swift:187-194` | iOS は授業 0 件なら公開を呼ばない。提案一覧は授業 0 件のテンプレを隠す (§5.3.2) |
| iOS の `CourseUpdateInput` は Swift 合成の `Encodable` で `nil` のキーを送らない (= null で消せない) | `DTOs.swift:335-340` | 科目ルールは必ず 3 キーを送る専用エンコードにする (§4.3.2) |
| Swift の `let x: T?` は memberwise init で省略できない。省略できるのは `var x: T? = nil` (先例 `AttendanceDaySummary.transferCount`) | `DTOs.swift:64-71` | **新 DTO フィールドはすべて `var x: T? = nil` で末尾に足す** (既存の memberwise init 呼び出しとテスト fixture を壊さない。gotcha `non-optional-dto-field-is-not-additive-for-callers`) |
| 版数を `"20"` で固定しているテストは R の 3 本 + **`B17BuildVersionTests.swift:17-32`** の計 4 本 | §8.5 | 4 本とも更新 |
| `CalendarSyncSettingsSheet` の「授業」トグル (`exportCourses`) を OFF にしていたユーザーは、build 20 では「自分の予定」だけを書き出していた | `CalendarSyncCoordinator.swift:31-34, 204-237`、`CalendarSyncSettingsSheet.swift:104-105` | 一度きりの移行でこのユーザーは書き出し OFF に倒す (§3.3) |
| build 20 以前が「Atender」カレンダーに書いた個人予定 (`atender://p/...`) は、個人予定の書き出しを消しても削除されない (`prunableKinds` に `.personal` が入らないと planner は消さない) | `CalendarExportPlanner.swift:84-89` | `ExportKind.personal` を掃除用に残し、移行で ±730 日を一掃 + 以後の同期でも常に掃除対象にする (§3.2-3.3) |
| ★ R §A5「TestFlight だけなら 1.0 のまま build 21 を upload 可」は**成り立たない前提で設計する**。App Store の version 1.0 は `READY_FOR_SALE` で、公開済みの version train には新しい build を上げられない (App Store Connect が「train version is closed」で upload を拒否する。未実測なので R の upload 時に確認し、通っても 1.0.1 で出し直す) | ASC 状態は R §A5 | `CFBundleShortVersionString` を `"1.0.1"` に上げ、同じ build 21 を TestFlight → App Store 1.0.1 申請に使う (§9) |
| Google **Calendar** と Google **サインイン**は別の経路: サインインは better-auth の `socialProviders.google` (`auth.ts:86-92`) で `Account` 行を作る。カレンダーは Web が `authClient.linkSocial({ scopes: ["…/auth/calendar.readonly"] })` (`apps/web/src/api/hooks/useGoogleCalendar.ts:41-43`) で同じ `Account` に scope を足し、`GoogleCalendarConnection` (`accountId` で `Account` を参照) を作る。カレンダー API は `routes/me.ts:164-191` (`/api/me/google-calendar/*`)・`routes/rooms.ts:154-197` (`/api/rooms/:id/google-calendar-syncs*`)・cron 用 `scripts/sync-google-calendars.ts` | 左記 | A2 は Calendar 側だけ消す。`Account` と `auth.ts` は不変 (§3.12.1) |
| `SetupViewModel.semester` の既定は `2026 前期 / 2026-04-01〜2026-09-30` 固定 (R §A4-1) | `SetupFlowView.swift:164` | `SemesterRollover.initialProposal(today:)` (§5.4.4) |

---

## 3. レーン A — カレンダー撤去

### 3.1 撤去 / 修正 / 残す の確定表 (iOS 本体)

判定: **削除** = ファイルごと削除 / **修正** = 一部を残して削る / **残す** = 変更なし。R §A1-5 の候補を本設計で確定させた。パスは `apps/ios/Atender/` 起点。

| path | 判定 | 内容 |
|---|---|---|
| `Features/Calendar/CalendarScreen.swift` | 削除 | `CalendarModePicker` 含む |
| `Features/Calendar/CalendarMonth.swift` | 削除 | |
| `Features/Calendar/CalendarDaySheet.swift` | 削除 | |
| `Features/Calendar/PersonalCalendar.swift` | 削除 | |
| `Features/Calendar/PersonalDaySheet.swift` | 削除 | `PersonalDaySheetFormat` の利用者は `DayDetailSheet` の予定節 (同時に削除) と `CalendarDaySheetLogic` (削除) だけになるので移設しない |
| `Features/Calendar/PersonalEventEditor.swift` | 削除 | `PersonalEventTimeMath` の利用者は `BulkEditSheet.addPersonalEvents` (同時に削除) だけ |
| `Features/Calendar/RecurrenceSpecPicker.swift` | 削除 | |
| `Features/Calendar/CalendarSyncBanner.swift` | 削除 | `CalendarSyncWarningButton` 含む。`Features/Calendar/` ディレクトリは空になるので消す |
| `Core/Data/CalendarMonthStore.swift` | 削除 | `CalendarEventOrder` 含む |
| `Core/Timetable/CalendarDaySheetLogic.swift` | 削除 | |
| `Core/Timetable/CalendarMonthLayout.swift` | 削除 | `CalendarDayStyle` 含む |
| `Core/Timetable/CalendarWindow.swift` | 削除 | |
| `Core/Timetable/TimetableLogic.swift` | 修正 | 削除: `CalendarEventKind`・`CalendarEvent`・`MeetingExpansion`・`CalendarViewMode`・`PersonalEventDisplay`・`PersonalCalendarLogic`・`CalendarLane`・`CalendarEventDisplay`。残す: `DayConvention`・`TimetableEventInput`・`TimetableCoalesce`・`MemberColor`・`DateFormatPattern`・`CalendarRange`・`PeriodGrouping`・`TimeFormatting`・`extension Color` |
| `Features/Home/HomeCore.swift` | 修正 | §3.5 |
| `Features/Rooms/RoomCalendar.swift` | 削除 | |
| `Features/Rooms/RoomDaySheet.swift` | 削除 | |
| `Features/Rooms/AvailabilityBar.swift` | 削除 | 既に呼び出し元 0 |
| `Features/Rooms/IcsTitleRuleEditorSheet.swift` | 削除 | |
| `Features/Rooms/RoomSheets.swift` | 修正 | §3.7。`RoomEventEditorContent`・`RecurrencePicker`・`IcsImportWizard` の 3 型を削除。`import UniformTypeIdentifiers` も ICS ウィザード専用なら削除 |
| `Features/Rooms/RoomLogic.swift` | 修正 | 削除: `RoomCalendarLogic`・`RoomEventTiming`・`RoomAvailability`・`RecurrencePresetLogic`・`RoomCardLogic` (ルーム予定のラベル。本番の呼び出し元 0)・`TemplateLogic` (C 由来、§2)。残す: `RoomTimetableLogic`・`RoomInviteCode` |
| `Features/Rooms/RoomTimetable.swift` / `RoomJoinSheets.swift` | 残す | |
| `Features/SemesterOverview/DayDetailSheet.swift` | 修正 | §3.6 |
| `Features/SemesterOverview/BulkAndPersonalEventSheets.swift` | 修正 + **改名** → `BulkEditSheet.swift` | §3.6。ファイル名をパスで参照するテストは無い (grep 済) |
| `Features/SemesterOverview/ClassTransferLogic.swift` | 修正 | `TransferDisplay` (enum ごと) を削除。`displacedKeys`/`calendarEvents` の利用者は `PersonalCalendar` だけ |
| `Features/SemesterOverview/ClassTransferSheet.swift` | 残す | |
| `Features/Settings/SettingsView.swift` | 修正 | §3.4.1 |
| `Features/Settings/CalendarSyncSettingsSheet.swift` | 修正 (型名は維持) | §3.4.2 |
| `Core/Sync/CalendarSyncCoordinator.swift` | 修正 | §3.2 |
| `Core/Sync/EventKitStore.swift` | 修正 | 削除: `fetchSnapshots(range:calendarIds:)`・`removeEvents(externalIds:excludingCalendarId:)`・それらだけが使う `EKEventSnapshot` 型 (定義場所ごと)。残す: `currentAccess`・`requestFullAccess`・`refreshSources`・`snapshot`・`createCalendar`・`fetchExported`・`apply`・`wipeOwned` |
| `Core/Sync/ExportKey.swift` | 残す | `ExportKind.personal` と `ExportKey.personal(...)` は**掃除のためだけに残す** (doc コメントを「build 20 以前が書いた個人予定を見分けて消すためだけに残す。新規には生成しない」に置換) |
| `Core/Sync/CalendarExportPlanner.swift` / `CourseExportMapping.swift` / `AtenderCalendarResolver.swift` / `AtenderCalendarSpec.swift` / `EventKitTimeMapping.swift` | 残す | |
| `Core/Sync/CalendarSyncStatus.swift` | 修正 | `CalendarSyncBannerKind`・`CalendarSyncBannerLogic` を削除。`CalendarSyncError.network` の文言を `"時間割を取得できませんでした（\(detail)）"` に置換 (他の文言は不変) |
| `Core/Sync/CalendarSyncTrigger.swift` | 修正 | `SyncTrigger.calendarScreen` を削除。`watchedPrefixes` から `QueryKey(["personal-events"])` を削除 (残り 4 件: `user-timetables`・`timetable-suspensions`・`semesters`・`courses`) |
| `Core/Sync/PersonalExportMapping.swift` / `EventKitReconciler.swift` | 削除 | |
| `Core/Data/CalendarExportRepository.swift` | 修正 | `legacyEkPushes`・`clearLegacyEkPushes` を削除。`occurrenceRange` は残す |
| `Core/Data/Repositories.swift` | 修正 | `PersonalEventRepository` を削除 |
| `Core/Data/RoomRepositories.swift` | 修正 | `RoomEventRepository`・`IcsImportRepository` を削除 |
| `Core/Data/InvalidationMatrix.swift` | 修正 | `Mutation.personalEvent`・`.roomEvent`・`.icsImport` を削除 |
| `Core/Data/QueryKey.swift` | 修正 | `personalEvents()`・`roomEvents(_:)`・`icsImports(_:)`・`icsTitleRules()` を削除 |
| `Core/Models/DTOs.swift` | 修正 | §3.8 |
| `Core/Models/Enums.swift` | 修正 | `VisibilityMode`・`RoomEventSource`・`IcsSource`・`IcsImportStatus`・`IcsMatchType` を削除 (利用者は削除する DTO と UI だけ) |
| `Core/Networking/APIEndpoint.swift` | 修正 | 削除: `personalEvents`・`createPersonalEvent`・`updatePersonalEvent`・`deletePersonalEvent`・`legacyEkPushes`・`clearLegacyEkPushes`・`eventKitSync`・`roomEvents`・`createRoomEvent`・`updateRoomEvent`・`deleteRoomEvent`・`icsImports`・`icsImportPreview`・`commitIcsImport`・`personalCalendarShare`・`setPersonalCalendarShare`・`patchPersonalCalendarShare`・`deletePersonalCalendarShare`・`icsTitleRules`・`createIcsTitleRule`・`patchIcsTitleRule`・`deleteIcsTitleRule`。残す: `occurrenceRange` |
| `App/AppEnvironment.swift` | 修正 | `personalEventRepository`・`roomEventRepository`・`icsImportRepository` のプロパティと初期化を削除 |
| `App/RootView.swift` | 残す | 起動時の `sync(trigger: .appLaunch)` (`:37-40`) はそのまま |
| `project.yml` | 修正 | §3.9 (R の版数は §9) |

**孤児の規則**: 上表の削除で本番コードから参照が 0 になった型・関数・定数は同じレーンで削除する。表に無い孤児が出たら Developer が削除し、削除した名前を PR 本文に列挙する (表を正典とし、表外の削除は報告のみ)。

### 3.2 `CalendarSyncCoordinator` の新しい契約

```swift
@MainActor @Observable
final class CalendarSyncCoordinator {
    private(set) var status: CalendarSyncStatus
    var exportEnabled: Bool          // UserDefaults "atender.eventkit.exportEnabled"、未設定なら true (不変)
    init(store: EventKitStore, client: APIClient, cache: QueryClient, calendarRepository: CalendarExportRepository)  // 引数不変
    func refreshAccess()
    func requestFullAccess() async
    func sync(trigger: SyncTrigger) async     // 唯一の入口 (不変)
    func setExportEnabled(_ value: Bool) async
    func wipeExport() async                   // 不変 (サインアウト・退会で呼ぶ)
    func startObserving()                     // 不変 (EKEventStoreChanged + willEnterForeground)
}
```

削除するメンバ: `exportCourses`・`exportPersonal`・`linkedCalendarIds`・`promptDismissed`・`availableCalendars()`・`legacyPushCleanupDone`・`cleanUpLegacyPushes(...)`・`Keys` の `exportCourses`/`exportPersonal`/`linkedCalendarIds`/`promptDismissed`/`legacyPushCleanupDone` 定数 (ただし §3.3 の移行が読むキー文字列は移行関数内のローカル定数として持つ)。`init` の `legacyWriteTargetCalendarId` 掃除 1 行は残す。

`sync(trigger:)` の手順 (旧 6〜11 を置換):

1. スロットル判定 (不変)
2. `status.access` 更新。`fullAccess` 以外なら従来どおり `lastError` を立てて return (不変)
3. カレンダー解決 (不変)
4. **build 21 移行** (§3.3)。未実施なら実施する。移行で `exportEnabled` が false になったら手順 5 を飛ばして 6 へ
5. 書き出し (`exportEnabled` かつ `calendarId` が解決済みのとき):
   - `desired` = `CourseExportMapping.items(occurrenceRange(window))` (不変)
   - `prunableKinds` = `range.hasActiveTimetable ? [.meeting, .personal] : [.personal]` (★ `.personal` を**常に**入れる。desired に personal は 1 件も無いので、窓内の旧個人予定はこの同期で消える)
   - 以降 (`fetchExported` → `plan` → `apply` → identity 検証) は不変
6. 成功判定 (不変)
7. 旧 11 の `cache.invalidate(prefixes: [.personalEvents()])` は**削除** (読み込みが無いので不要)

### 3.3 build 21 移行 (一度きり)

**端末の「Atender」カレンダーと UserDefaults だけを掃除する移行**。サーバー側のデータ (旧 §12-T1 のミラー削除・T2 の共有停止) は A2 の DROP で消えるので、iOS からサーバーへ削除を送るコードは書かない (§3.10)。端末カレンダー内の旧個人予定はサーバーの DROP では消えないので、この移行は A2 後も必要。

UserDefaults キー `atender.eventkit.b21Migrated` (Bool) が true なら何もしない。`sync` の手順 4 で、**`fullAccess` かつカレンダー解決済み (`calendarId != nil`) のときだけ**次を行い、最後に `b21Migrated = true` を書く。条件を満たさない回は何もせず次回に持ち越す (フラグも立てない)。

```swift
/// 純ロジック (テスト対象)。UserDefaults の生値から移行後の exportEnabled を決める
enum CalendarSyncMigration {
    /// exportCoursesRaw: UserDefaults.object(forKey: "atender.eventkit.exportCourses") as? Bool (未設定なら nil)
    static func exportEnabledAfterMigration(current: Bool, exportCoursesRaw: Bool?) -> Bool {
        exportCoursesRaw == false ? false : current
    }
    /// 移行で消す UserDefaults キー (この 5 本)
    static let obsoleteKeys = [
        "atender.eventkit.exportCourses",
        "atender.eventkit.exportPersonal",
        "atender.eventkit.linkedCalendarIds",
        "atender.eventkit.promptDismissed",
        "atender.eventkit.legacyPushCleanupDone",
    ]
}
```

手順:
1. `next = exportEnabledAfterMigration(current: exportEnabled, exportCoursesRaw: …)`
2. `next == false` かつ `exportEnabled == true` (= 「授業」を OFF にして個人予定だけ書き出していた人) → `exportEnabled = false` にし、`store.wipeOwned(calendarId:window: ±730 日)` で Atender カレンダー内の Atender 製イベントを全て消す (既存 `wipeExport` と同じ範囲)
3. それ以外 → `fetchExported(calendarId:window: today−730〜today+730)` を読み、`CalendarExportPlanner.plan(desired: [], existing: …, prunableKinds: [.personal])` を `apply` する (= `atender://p/...` だけを窓 ±730 日で削除。`atender://m/...` と他人のイベントは消さない)
4. `obsoleteKeys` を `removeObject`
5. `b21Migrated = true`

失敗 (手順 2/3 の `apply`/`wipeOwned` が throw) した回はフラグを立てず `status.lastError = .applyFailed(...)`、`phase = .failed` で return (次回再試行。冪等)。

### 3.4 書き出し設定 UI

#### 3.4.1 設定タブ (`SettingsView`)

```
設定
┌ アカウント ───────────────────────┐
│ プロフィール編集                  › │
│ 学校・学科            情報科学科  › │ ← C (§5.5 E4)
└──────────────────────────────────┘
┌ 出席 ────────────────────────────┐
│ 必要出席率                  70%  › │
│ 出欠ルール                        › │
│ 学期管理                          › │
└──────────────────────────────────┘
┌ 表示 ─ (テーマ) ──────────────────┐
┌ カレンダー ───────────────────────┐   ← 節名「カレンダー同期」→「カレンダー」
│ iPhone カレンダーに書き出す  オン  › │   ← 行ラベル置換、trailingText 追加
└──────────────────────────────────┘
┌ その他 ─ (不変) ─────────────────┐
```

- 行 id は `settings-row-calendar` のまま。trailingText は `CalendarExportRowLogic.trailingText(access:exportEnabled:)`:
  - `access != .fullAccess` → `"未設定"`
  - `fullAccess` かつ `exportEnabled` → `"オン"`
  - `fullAccess` かつ `!exportEnabled` → `"オフ"`
- `SettingsSheet` enum から `case google` を削除し、`.sheet` の `case .google: EmptyView()` も削除
- `signOut()`/`deleteAccount()` の `wipeExport()` は不変
- `SettingsLogic.deleteAccountMessage` を次に置換 (A2 後は予定・ルーム予定が存在しないため。デプロイ 1〜2 の間も嘘にならない範囲の文言): `"時間割・出欠・友達などのデータはすべて直ちに削除され、元に戻せません。作成したルームは他のメンバーに引き継がれます。公開した時間割テンプレートは、作成者を伏せて残ります。"`。`B20AccountDeletionTests` の該当アサーションを同じ文字列に更新

#### 3.4.2 書き出しシート (`CalendarSyncSettingsSheet`、`SheetScaffold`)

タイトル `"カレンダーに書き出し"` (10 文字、§3.7.4 の 12 文字以内)。accessibility identifier `calendar-export-sheet` を `SheetScaffold` の content に付ける。

```
<  カレンダーに書き出し          ✕
┌ card ─────────────────────────────────┐
│ 時間割の授業を iPhone の「Atender」カレン │  ← 説明 (.atenderSm secondary、常時)
│ ダーに書き出します。休講・振替・公欠は自動 │
│ で反映されます。                          │
│                                          │
│ [ iPhone カレンダーに書き出す ] (primary) │  ← access == .notDetermined のとき
│ ✓ 書き出しできます                        │  ← .fullAccess
│ (既存の writeOnly / denied / restricted   │
│  の表示は文言・ボタンとも不変)            │
└──────────────────────────────────────────┘
(fullAccess のときだけ以下)
┌ card ─────────────────────────────────┐
│ 時間割を書き出す                  [ON] │  ← Toggle (exportEnabled)
└──────────────────────────────────────────┘
書き出し先: Atender（iCloud）                ← exportEnabled のとき (不変)
[ 今すぐ書き出す ] (secondary)               ← exportEnabled のとき (不変)
同期状態 (不変)
                                  [ 閉じる ]
```

- 削除: `importSection` 全体・`calendarLabel`・`linkedBinding`・`exportCoursesBinding`・`exportPersonalBinding`・`@State calendars`・`reloadCalendars()` とその呼び出し
- 節見出し「権限」「iPhone カレンダーへの書き出し」は削除し、上のカード 2 枚 + 既存「同期状態」の 3 ブロックにする
- Toggle ラベル `"Atender の予定を書き出す"` → `"時間割を書き出す"`。OFF 時の確認 `confirmationDialog` の title を `"iPhone カレンダーから Atender の授業を削除します"` に置換 (ボタン「削除する」「キャンセル」とトースト「iPhone カレンダーから削除しました」は不変)
- `notDetermined` のボタン文言 `"iPhone のカレンダーと同期する"` → `"iPhone カレンダーに書き出す"`
- 権限要求の入口はこのシートだけ (Home のバナーが消えるため)。Home に新たな誘導は置かない (§11)

### 3.5 Home (`HomeCore.swift`)

- 削除: `enum HomeViewMode`・`@State mode`・`CalendarModePicker(selection: $mode)` の行・`HomeBody.mode`
- `HomeBody` は `context` の 2 分岐: `.self` → `SelfTimetableView`、`.room(id)` → `RoomTimetable(...).id(roomId)` (`.id` は維持)
- toolbar の時間割歯車の条件 `context == .self && mode == .timetable` → `context == .self`
- レイアウト: `VStack(spacing: Space.s3) { ContextChips; GeometryReader { HomeBody } }` (切替が消えた分、時間割が縦に伸びる。余白値は不変)
- accessibility identifier `home-mode-picker` はアプリから消える

### 3.6 学期タブ

**`DayDetailSheet`**:
- `DayDetailSheetKind` を `enum DayDetailSheetKind: Equatable { case transfer }` に縮める (`.create`/`.edit` を削除)
- `sheetHost` から `.create`/`.edit` の分岐を削除、`personalEventsSection(_:_:)`・`iconButton(...)` を削除
- body の並び: `suspensionSection` → `classTransferSection` → `occurrencesSection` (予定の節が消える)

**`BulkEditSheet`** (改名後 `BulkEditSheet.swift`):
- `eventSection`・`@State eventTitle`・`addPersonalEvents()` を削除。body の末尾の `Divider()` + `eventSection` を削除 (並び: 出席一括 → 未記録に戻す → 休講)

### 3.7 ルーム設定 (`RoomSheets.swift` の `RoomSettingsSheet`)

- `RoomSettingsViewModel` から `personalCalendarShare`・`setPersonalCalendarShare`・`patchPersonalCalendarShare`・`load()` 内の `share` 取得を削除
- `RoomSettingsSheet` から `personalCalendarShareSection`・`icsSection`・`@State importOpen/ruleEditorOpen/shareEnabled/shareVisibility`・`.task` 内の share 初期化・`.sheet(isPresented: $importOpen)`・`.sheet(isPresented: $ruleEditorOpen)` を削除
- 残る並び: 名前・説明・メンバー表示トグル (既存) → `memberSection` → (OWNER なら) `inviteSection`、footer は不変

### 3.8 DTO (`DTOs.swift`)

- 削除: `RecurrenceEndDto`・`RecurrenceSpecDto`・`OccurrenceDayDto`・`PersonalEventSeriesDto`・`PersonalEventOccurrenceDto`・`PersonalEventRecurrenceInput`・`PersonalEventCreateInput`・`PersonalEventUpdateInput`・`EventKitSyncEvent`・`EventKitSyncInput`・`EventKitSyncResponse`・`LegacyEkPushListResponse`・`LegacyEkPushClearInput`・`LegacyEkPushClearResponse`・`RoomEventDto`・`CreateRoomEventInput`・`UpdateRoomEventInput`・`PersonalCalendarShareDto`・`SharePutInput`・`SharePatchInput`・`IcsImportDto`・`IcsImportPreviewItem`・`IcsImportPreview`・`IcsImportCommitResult`・`IcsTitleRuleDto`・`CreateIcsTitleRuleInput`・`PatchIcsTitleRuleInput`・`PersonalEventsResponse`・`PersonalEventResponse`・`RoomEventsResponse`・`RoomEventResponse`・`PersonalCalendarShareResponse`・`IcsImportsResponse`・`IcsUploadResponse`・`IcsTitleRulesResponse`・`IcsTitleRuleResponse`
- `DayDetailDto` から `personalEvents` を削除 (API はデプロイ 2 まで返すが Codable は未知キーを無視する)
- `RoomWeekDto` から `roomEvents` を削除。`init(weekStart:weekEnd:members:meetings:recurringMeetings:roomEvents:)` は `roomEvents` 引数を除いた形に、`init(from:)` から `roomEvents` の decode 行を削除
- `RoomSummaryDto.upcomingEvent`・`RoomDto.upcomingEvent`・`RoomSummaryDto.UpcomingEvent` も削除 (iOS で表示に使っていない。A2 で API も出力をやめる。fixture 4 本の `upcomingEvent` キーは無視されるので残す)
- 残す: `OccurrenceRangeResponse`・`RoomWeekDto.meetings` (未使用になるが A2 後も API が返すので decode 互換のため残す)

### 3.9 `project.yml`

`NSCalendarsFullAccessUsageDescription` を次に置換 (読み込みの文言を消す):

```
時間割の授業を「Atender」カレンダーに書き出し、休講や振替に合わせて書き出した予定を更新・削除するために、カレンダーへのアクセスを使用します。
```

`Info.plist` は手編集しない (`xcodegen generate` で生成)。

### 3.10 サーバーに残る状態 (T1 / T2)

EventKit 読み込みのミラー (`PersonalEvent.source = EVENTKIT`) と有効な個人カレンダー共有 (`PersonalCalendarShare`) は、A2 の DROP でテーブルごと消える。**iOS 側に消すための移行コードは書かない** (Leader 裁定。デプロイ 1〜2 の数日のための使い捨てコードは要らない)。デプロイ 1〜2 の間は旧データが DB に残るが、Web からは画面が消えているので誰にも表示されない (旧 iOS build 12〜20 の利用者だけが見る)。

### 3.11 レーン A-Web — `apps/web` からの撤去 (デプロイ 1)

パスは `apps/web/src/` 起点。孤児の規則は §3.1 と同じ。

| path | 判定 | 内容 |
|---|---|---|
| `routes/SettingsCalendar.tsx` | 削除 | |
| `router.tsx` | 修正 | `SettingsCalendar` の import と `settingsCalendarRoute`・`settingsGoogleIntegrationRoute` を、`/settings/calendar`・`/settings/integrations/google` → `/settings` へ redirect する 2 route (`beforeLoad: () => { throw redirect({ to: "/settings" }) }`、既存 `meRoute` と同形) に置換 (古いブックマーク・Google OAuth の戻り先が 404 にならないように) |
| `components/home/Home.tsx` | 修正 | `HomeViewModeTabs`・`mode` state を削除。`HomeSemesterPicker` の条件行 (`mode !== "timetable"`) を削除。`SelfTodayCTA` は `context.kind === "self"` で表示 |
| `components/home/HomeBody.tsx` | 修正 | `mode` を削除し `self → SelfTimetableView`、`room → RoomTimetable` の 2 分岐 |
| `components/home/HomeViewModeTabs.tsx`・`PersonalCalendar.tsx` | 削除 | |
| `components/rooms/RoomDetail.tsx` | 修正 | 「カレンダー / 時間割」タブと `tab` state を削除し、常に `RoomTimetable` |
| `components/rooms/RoomCalendar.tsx`・`RoomEventCreateSheet.tsx`・`RoomEventDetailSheet.tsx`・`RoomGoogleSyncSection.tsx` | 削除 | |
| `components/rooms/calendar/` (`AvailabilityBar`・`CalendarDay`・`CalendarMonth`・`CalendarSegmented`・`CalendarWeek`・`DayAgendaPanel`・`PeriodNav`) | ディレクトリごと削除 | |
| `components/rooms/RoomCard.tsx` | 修正 | `upcomingEvent` の表示 (`:29-33`) を削除 |
| `components/avatar/GoogleCalendarSection.tsx`・`GoogleCalendarConnectSheet.tsx`・`GoogleCalendarSelectorSheet.tsx` | 削除 | `components/avatar/` が空になれば消す |
| `components/ics-import/` (`IcsImportWizard`・`TitleRuleEditor`) | ディレクトリごと削除 | |
| `components/recurrence/` (`RecurrenceEditDialog`・`RecurrencePicker`・`RecurrenceSpecPicker`) | ディレクトリごと削除 | |
| `components/semester/PersonalEventEditModal.tsx` | 削除 | |
| `components/semester/DayDetailSheet.tsx` | 修正 | 「予定 (N)」節 (`:133-165` 付近)・`PersonalEventEditModal`/`RecurrenceEditDialog` の利用・`PersonalEventOccurrenceDto` の import を削除 |
| `components/semester/BulkEditSheet.tsx` | 修正 | 終日予定の一括追加 (`/api/personal-events` の POST と `personal-events` の invalidate、`personalEventDays` の import) を削除 |
| `components/settings/Settings.tsx` | 修正 | 「Google Calendar 連携」「カレンダー設定 (ICS 等)」の 2 行と `sheet === "google"` の BottomSheet を削除。アカウント削除の確認文 (`:132`) を iOS と同じ §3.4.1 の文字列に置換 |
| `components/sheet/RoomSettingsSheet.tsx` | 修正 | 「カレンダー取り込み設定」ボタン節・「外部カレンダーから取り込み」節・`RoomGoogleSyncSection`・`IcsImportWizard` を削除。見出し「メンバーの時間割をカレンダーに反映」→「メンバーの時間割を表示」(トグルと `showMemberTimetables` は不変) |
| `components/ui/skeletons/CalendarDaySkeleton`・`CalendarMonthSkeleton`・`CalendarWeekSkeleton`・`DayAgendaPanelSkeleton` | 削除 | `skeletons/index.ts` の export 4 行も削除 |
| `components/event-tile/` | 残す | 時間割 (`TimetableView`・`MeetingBlock`・`DayMeetingCard`) が使う |
| `lib/calendarEventDisplay.ts`・`calendarLane.ts`・`calendarRange.ts`・`meetingExpansion.ts`・`personalEventDays.ts`・`recurrenceFormat.ts` | 削除 | 利用者は全て削除対象 (grep 済) |
| `lib/memberColor.ts` | 残す | `RoomTimetable`・`RoomSettingsSheet` |
| `api/hooks/useGoogleCalendar.ts`・`useIcsImports.ts`・`useIcsTitleRules.ts`・`usePersonalEvents.ts`・`useRoomEvents.ts`・`useRoomMonth.ts` | 削除 | `hooks/index.ts` の export 6 行も削除 |
| `api/hooks/types.ts`・`api/queryKeys.ts` | 修正 | PersonalEvent* / RoomEvent* / Ics* / Google* / Share* の型 re-export と `personalEvents`・`roomEvents` 等の queryKey を削除 |
| `public/privacy.html`・`public/terms.html` | 修正 | §10.3.1 (移行期の文言) |

Web の Google **ログイン** (`components/ui/AuthProviderButton.tsx`・`routes/SignIn.tsx`) は残す。

### 3.12 レーン A2 — カレンダー API の削除 (デプロイ 2、ブランチ `chore/drop-calendar-api`)

#### 3.12.1 Google Calendar と Google サインインの境界 (実測)

| 残す (サインイン) | 消す (カレンダー) |
|---|---|
| `src/auth.ts` の `socialProviders.google` (`accessType: "offline"`・`prompt: "consent"` も変えない) | `routes/me.ts:164-191` の `/api/me/google-calendar/*` 5 本 |
| `Account` モデル (token 列含む) | `routes/rooms.ts:154-197` の `/api/rooms/:id/google-calendar-syncs*` 5 本 |
| `services/tokenRevocation.service.ts` (退会時の Google revoke。`Account` の token を使う) | `services/googleCalendar.service.ts`・`googleCalendarSync.service.ts`・`googleAccessToken.service.ts`、`lib/googleApi.ts`・`googleCalendarMapping.ts`、`scripts/sync-google-calendars.ts` |
| `env.ts` の `GOOGLE_CLIENT_ID`・`GOOGLE_CLIENT_SECRET`・`GOOGLE_IOS_CLIENT_ID` | `GoogleCalendarConnection`・`GoogleCalendarSync` モデル、`Account.googleCalendarConnection` relation 行 |

`googleAccessToken.service.ts` の利用者は `googleCalendarSync.service.ts` だけ (grep 済) なので一緒に消せる。過去に calendar scope を付けた `Account.scope` の文字列は残る (害なし。サインインは scope を見ない)。

#### 3.12.2 API の撤去表 (パスは `apps/api/` 起点)

| path | 判定 | 内容 |
|---|---|---|
| `src/routes/personalEvents.ts` | 削除 | `personal-events*` 全 7 route (eventkit-sync / eventkit-legacy-pushes 含む)。`src/index.ts` の import と `registerPersonalEventRoutes(app)` も削除 |
| `src/routes/rooms.ts` | 修正 | 削除: `GET /api/rooms/:id/events`・`POST/PATCH/DELETE /api/rooms/:id/events*`・`/ics-imports*` 5 本・`/google-calendar-syncs*` 5 本・`/personal-calendar-share` 4 本と、それらだけが使う zod (`EventsQuery`・`IcsImportParam`・`SyncParam`・`CreateSyncBody`・`PatchSyncBody`・`DeleteSyncQuery`・`SharePutBody`・`SharePatchBody`・`EventParam`・`DeleteEventQuery` 等)。残す: 一覧・作成・参加・取得・更新・削除・退出・メンバー・招待・`/week` |
| `src/routes/me.ts` | 修正 | `/api/me/ics-title-rules*` 4 本・`/api/me/google-calendar/*` 5 本と関連 import / zod を削除 |
| `src/services/personalEvent.service.ts`・`personalRecurrence.service.ts`・`personalCalendarShare.service.ts`・`recurrence.service.ts`・`icsImport.service.ts`・`icsTitleRule.service.ts`・`googleCalendar.service.ts`・`googleCalendarSync.service.ts`・`googleAccessToken.service.ts` | 削除 | |
| `src/lib/rruleExpand.ts`・`icsParse.ts`・`googleApi.ts`・`googleCalendarMapping.ts` | 削除 | 利用者は削除対象のみ (grep 済) |
| `src/types/vendor.d.ts` | 修正 | `node-ical`・`jschardet` 等の宣言だけなら削除 (中身を見て、残る宣言があれば該当行のみ) |
| `src/services/room.service.ts` | 修正 | `listRoomEvents`・`createRoomEvent`・`updateRoomEvent`・`deleteRoomEvent`・`visibleOccurrenceDto` とその型、`recurrence.service`/`rruleExpand` の import を削除。`getRoomWeek` の `expandRoomEvents` 呼び出しと戻り値の `roomEvents` を削除。一覧 / 取得の DTO から `upcomingEvent` を削除 (`:83` 周辺の upcoming 取得クエリも) |
| `src/services/dayDetail.service.ts` | 修正 | `expandPersonalEvents`・`personalEventOccurrenceDto` を削除し、戻り値から `personalEvents` を削除 (2 箇所 `:24,67`) |
| `src/services/accountDeletion.service.ts` | 修正 | `tx.roomEvent.deleteMany(... PERSONAL / GOOGLE_OAUTH)` (`:40`) と RoomEvent / IcsImport / Sync / Share に触れる行・コメントを削除。テンプレ・ルーム移譲・Apple/Google revoke は不変 |
| `src/lib/dto.ts` | 修正 | 削除した route だけが使う DTO 関数を削除 (孤児の規則) |
| `scripts/sync-google-calendars.ts` | 削除 | Coolify の atender-api に scheduled task が登録されていれば **A2 のデプロイ前に削除** (`GET $COOLIFY_API_BASE/applications/vrdxzvmakcxieyhfhayz5r8r/scheduled-tasks` で実物を確認。登録が無ければ何もしない) |
| `src/lib/clientVersion.ts` | 修正 | `MIN_IOS_BUILD = 21`。冒頭コメントに「12 → 21 (A2): カレンダー API とテーブルを削除。build 12〜20 は削除した endpoint を叩くので 426 で更新を促す」を足す (置換でなく履歴の追記。既存コメントの形式に合わせる) |
| `scripts/seed-demo-user.ts` | 修正 | 個人予定・ルーム予定を作る行があれば削除 |
| `package.json` | 修正 | `node-ical`・`rrule`・`iconv-lite`・`jschardet` を、`grep -rn "<pkg>" src scripts` が 0 件になったものだけ `dependencies` から外し、`pnpm install` で lockfile を更新 |
| `src/routes/occurrences.ts`・`services/occurrence.service.ts`・`classTransfers.ts`・`classTransfer.service.ts` | 残す | |

#### 3.12.3 shared / Prisma

`packages/shared/src/` (A2 で消す。A-Web で Web の参照が 0 になり、API の参照は A2 で 0 になる):
- 削除: `schemas/personalEvent.ts`・`schemas/recurrence.ts`・`schemas/ics.ts`・`schemas/google.ts`・`recurrence/rrule.ts`、`index.ts` の該当 export 5 行
- `schemas/room.ts`: `RoomEventDto`・`RoomEventInputBase`・`CreateRoomEventInput`・`UpdateRoomEventInput`・`PersonalCalendarShareDto` 等を削除、`RoomWeekDto` から `roomEvents`、`RoomSummaryDto` から `upcomingEvent` を削除
- `schemas/day.ts`: `DayDetailDto` から `personalEvents` を削除
- `schemas/attendance.ts` の `OccurrenceRange*` は残す

Prisma (`apps/api/prisma/schema.prisma`):
- 削除するモデル (9): `PersonalEvent`・`PersonalEventOverride`・`RoomEvent`・`RoomEventOverride`・`IcsImport`・`IcsTitleRule`・`GoogleCalendarConnection`・`GoogleCalendarSync`・`PersonalCalendarShare`
- 削除する enum (7): `EventSource`・`RoomEventSource`・`EventVisibility`・`IcsImportStatus`・`TitleMatchType`・`GoogleConnStatus`・`GoogleSyncStatus`
- 削除する relation 行: `User` の `authoredRoomEvents`・`personalEvents`・`icsImports`・`icsTitleRules`・`googleCalendarConnection`・`personalCalendarShares`、`Room` の対応 4 行 (events / icsImports / googleCalendarSyncs / personalCalendarShares)、`Account.googleCalendarConnection` (relation 行は DB 列を持たないので migration には出ない)

migration `apps/api/prisma/migrations/<マージ日>120000_a2_drop_calendar/migration.sql` (子 → 親の順):

```sql
PRAGMA foreign_keys=OFF;
DROP TABLE "RoomEventOverride";
DROP TABLE "RoomEvent";
DROP TABLE "IcsImport";
DROP TABLE "IcsTitleRule";
DROP TABLE "GoogleCalendarSync";
DROP TABLE "GoogleCalendarConnection";
DROP TABLE "PersonalCalendarShare";
DROP TABLE "PersonalEventOverride";
DROP TABLE "PersonalEvent";
PRAGMA foreign_keys=ON;
```

- 実装時は `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` で生成した SQL と上の 9 本が一致することを確かめる (index は DROP TABLE で一緒に消える。差があれば生成物を正とし PR に差分を書く)
- `entrypoint.sh` が migrate 前に `prod.db.bak-<ts>` を 5 世代残す (build 20 の仕組み) ので、デプロイ 2 直後のバックアップがロールバック手段になる

#### 3.12.4 デプロイ 2 の分離方式 (確定)

**別ブランチ方式**を採る (feature flag や「route だけ先に消す」方式は採らない。§11)。

1. B と C が main に入った後、main から `chore/drop-calendar-api` を切る (worktree `Muraki/worktrees/atender-drop-calendar-api`)
2. §3.12.2 / §3.12.3 と §8.7 のテスト削除を**このブランチだけ**に入れる。iOS・Web のファイルは触らない (iOS の版数テストのうち `MIN_IOS_BUILD` を見る 1 行だけ例外。§8.7)
3. migration ディレクトリ名は作業中は `99999999999999_a2_drop_calendar` (仮名) にし、**マージ直前に** `<マージ日 yyyyMMdd>120000_a2_drop_calendar` へ改名して、main の最大 migration 名より後であることを `ls prisma/migrations | sort | tail -2` で確かめる (先に main へ入った migration より前の名前にしない)
4. レビュー (Reviewer + リリース前ゲート) はブランチ上で済ませ、**マージは §9 の手順 9 (1.0.1 の `READY_FOR_SALE` 確認後) まで保留**。保留中に main が進んだら rebase してテストを取り直す
5. main は「デプロイ 1 の状態」のまま常にデプロイ可能 (A2 が main に入らない限り、誰が main をデプロイしても build 20 は壊れない)

---

## 4. レーン B — 科目別の出席基準

### 4.1 データモデル

```prisma
model Course {
  // 既存の列 …
  requiredAttendanceRate Int?   // 科目の必要出席率 (1–100 %)。null = 未設定
  maxAbsences            Int?   // 欠席上限 (授業回)。上限回数までの欠席は OK、超えたら失格。0–99。null = 未設定
  tardiesPerAbsence      Int?   // 遅刻・早退 N 回で欠席 1 回 (1–10)。null = 未設定 (出欠ルールの tardy/earlyLeave strategy に従う)
}
```

migration `apps/api/prisma/migrations/20261029120000_b21_course_attendance_rules/migration.sql`:

```sql
ALTER TABLE "Course" ADD COLUMN "requiredAttendanceRate" INTEGER;
ALTER TABLE "Course" ADD COLUMN "maxAbsences" INTEGER;
ALTER TABLE "Course" ADD COLUMN "tardiesPerAbsence" INTEGER;
```

`TemplateCourse` には足さない (§11)。テンプレからのコピー・`PATCH /api/user-timetables/:id` の `courses` 置き換え (科目を作り直す既存経路) で作られた科目は 3 列とも null。

### 4.2 計算仕様 (`apps/api/src/services/attendanceStats.ts` の `computeCourseStatsWithProjection`)

科目ごとに次を計算する。ここに書いていない既存の計算は不変。

**入力**: `U` = 共通の必要出席率、`Rc` = `course.requiredAttendanceRate`、`M` = `course.maxAbsences`、`N` = `course.tardiesPerAbsence`、出欠ルール (`excused/tardy/earlyLeave` strategy)。

#### 4.2.1 率の側 (既存フィールドの算出を変更)

- 使う率: `r = (Rc ?? U) / 100`
- `N != null` のとき、この科目の `TARDY` / `EARLY_LEAVE` の重みは出欠ルールを無視して `(num 1, den 1)` (出席扱い) とし、ループの後で
  - `penaltyAll = floor(tardyAll / N)`、`tardyAll` = 休講でない記録済み occurrence のうち `TARDY` か `EARLY_LEAVE` の件数 → `numerator −= penaltyAll`、`fixedNumAll −= penaltyAll`
  - `penaltyToDate = floor(tardyToDate / N)`、`tardyToDate` = 上のうち `date <= today` の件数 → `toDateNum −= penaltyToDate`
  - (単位は限。率の側は限で数える)
- 以降 `denominator`・`attendanceRate`・`toDate`・`allowanceRaw = (1 − r) × D − (fixedDenAll − fixedNumAll)`・`allowedAbsences`・`allowedAbsenceDays` の式は不変 (r と重みだけが変わる)
- overall (`semesterOverview.service.ts`) は科目ごとの `allowanceRaw` (科目の r で算出) を合算して floor (式は不変)

#### 4.2.2 回数の側 (新規。`M != null` のときだけ)

- 授業回 = 休講 (時間割休講・科目休講) でない occurrence を日付 (`toIsoDate(occurrence.date)`) でまとめたもの
- 各 occurrence の欠席重み `a` と分母 `d`:

| status | a | d |
|---|---|---|
| `PRESENT` | 0 | 1 |
| `ABSENT` | 1 | 1 |
| `CANCELLED` | — | 0 (数えない) |
| `EXCUSED` | strategy: `COUNT_AS_PRESENT` 0/1、`COUNT_AS_ABSENT` 1/1、`HALF_PRESENT` 0.5/1、`REDUCE_DENOMINATOR`・`SEPARATE_COUNT` 0 (数えない) | 同左 |
| `TARDY` / `EARLY_LEAVE` | `N != null` なら 0/1。`N == null` なら strategy (上と同じ対応) | 同左 |
| 未記録 | 0 | 1 (分母にだけ入る) |

- 授業回の欠席量 = `Σa / Σd` (その回の `Σd = 0` なら数えない)。例: 2 コマの回で 1 コマ欠席・1 コマ出席 → 0.5
- `tardyLessons` (`N != null` のとき) = 記録済み occurrence に `TARDY` か `EARLY_LEAVE` を 1 つ以上含む授業回の数
- `absenceLessons = Σ(授業回の欠席量) + (N != null ? floor(tardyLessons / N) : 0)`
- `countAllowed = floor(M − absenceLessons + 1e-9)` (上限回数まで OK = `absenceLessons == M` で 0、超えたら負)

#### 4.2.3 合成

- `rateLessons` = `Rc != null` かつ `allowedAbsences != null` かつ `maxDayPeriods > 0` なら `floor(allowedAbsences / maxDayPeriods)` (負もそのまま floor)、それ以外は null
  - ★ **科目に回数だけを設定し率を設定しなかった場合、共通の必要出席率は合成に使わない** (§12-T3)
- `allowedAbsenceLessons = rateLessons == null ? countAllowed : min(countAllowed, rateLessons)`
- `limitedBy = rateLessons != null && rateLessons < countAllowed ? "rate" : "count"`
- `remainingLessons` (常に算出) = 休講でない未記録 occurrence のうち `date > today` のものの**日付の種類数**

#### 4.2.4 実走で確かめた例 (scratchpad のスクリプトで §4.2 を実装して得た値。今日 = 表の列)

週 1 回 1 コマ × 15 回 (`maxDayPeriods 1`)、`U = 70`、出欠ルールは既定 (excused=REDUCE、tardy/earlyLeave=HALF)。「today = k 回目」は k 回目の授業日が today (その日の occurrence は `date <= today` 側)、記録は 1 回目から順に付け、残りは未記録:

| # | 設定 | 記録 (先頭から) | today | allowedAbsences | absenceLessons | allowedAbsenceLessons | limitedBy | remainingLessons |
|---|---|---|---|---|---|---|---|---|
| E1 | M=5 | 欠×5 | 5 回目 | −1 | 5 | **0** | count | 10 |
| E2 | M=5 | 欠×6 | 6 回目 | −2 | 6 | **−1** | count | 9 |
| E3 | M=5, N=3 | 欠×2, 遅×4 | 6 回目 | 1 | 3 | **2** | count | 9 |
| E5a | M=0 | 出×1 | 1 回目 | 4 | 0 | **0** | count | 14 |
| E5b | M=0 | 欠×1 | 1 回目 | 3 | 1 | **−1** | count | 14 |
| E6 | M=5 | 欠×5、6 回目は科目休講 | 6 回目 | −1 (D=14) | 5 | **0** | count | 9 |
| E7 | M=5 | 欠×5, 公欠×1 | 6 回目 | −1 (D=14) | 5 | **0** | count | 9 |
| E8 | Rc=60 | 欠×3 | 3 回目 | **3** | — | null | null | 12 |
| E9 | N=3 | 遅×3 | 3 回目 | **3** | — | null | null | 12 |
| E10 | Rc=60, M=3 | 欠×1 | 1 回目 | 5 | 1 | **2** | count | 14 |
| E11 | M=5 (N なし) | 欠×2, 遅×4 | 6 回目 | 0 | 4 | **1** | count | 9 |
| E12 | M=5 | 出×12 | 12 回目 | 4 | 0 | **5** | count | 3 |

週 1 回 2 コマ連続 × 15 回 (`maxDayPeriods 2`、occurrence 30)、`Rc = 80`、`M = 4`。1 回目: 欠・欠 / 2 回目: 欠・出 / 3 回目: 遅・出、today = 3 回目:

| # | allowedAbsences | rateLessons | absenceLessons | countAllowed | allowedAbsenceLessons | limitedBy | remainingLessons |
|---|---|---|---|---|---|---|---|
| E4 | 2 | 1 | 1.75 | 2 | **1** | rate | 12 |

### 4.3 API / shared

#### 4.3.1 zod (`packages/shared`)

```ts
// schemas/course.ts
const CourseRuleFields = {
  requiredAttendanceRate: z.number().int().min(1).max(100).nullable().optional(),
  maxAbsences: z.number().int().min(0).max(99).nullable().optional(),
  tardiesPerAbsence: z.number().int().min(1).max(10).nullable().optional(),
};
export const CourseCreateInput = z.object({ /* 既存 */ ...CourseRuleFields });
export const CourseUpdateInput = z.object({ /* 既存 */ ...CourseRuleFields });

// schemas/template.ts — CourseDto (UserTimetable と Template で共用)
export const CourseDto = z.object({
  /* 既存 */
  requiredAttendanceRate: z.number().int().nullable().optional(),
  maxAbsences: z.number().int().nullable().optional(),
  tardiesPerAbsence: z.number().int().nullable().optional(),
});

// schemas/stats.ts — CourseStatsDto に追加 (既存フィールドは不変)
requiredAttendanceRate: z.number().int().optional(),            // この科目で使った率 (Rc ?? U)
rule: z.object({
  requiredAttendanceRate: z.number().int().nullable(),
  maxAbsences: z.number().int().nullable(),
  tardiesPerAbsence: z.number().int().nullable(),
}).optional(),                                                   // 科目の設定値そのまま
remainingLessons: z.number().int().optional(),
absenceLessons: z.number().nullable().optional(),               // M == null なら null
allowedAbsenceLessons: z.number().int().nullable().optional(),  // M == null なら null
limitedBy: z.enum(["rate", "count"]).nullable().optional(),     // M == null なら null
```

#### 4.3.2 route / dto

- `POST /api/courses`: 3 フィールドを受けて保存 (`undefined` → null で作成)
- `PATCH /api/courses/:courseId`: 3 フィールドとも「`undefined` = 変更しない、`null` = 消す、数値 = 設定」(既存の `teacher` 等と同じ扱い)
- `courseDto()` (`lib/dto.ts:47`): 3 フィールドを出力。`Course` 行は列値、`TemplateCourse` 行 (列が無い) は `null`
- `GET /api/stats`・`GET /api/semesters/:id/overview` の各 course に §4.3.1 の追加フィールドを常に出力 (`M == null` のとき `absenceLessons`/`allowedAbsenceLessons`/`limitedBy` は `null`)
- エラー: 範囲外の値は既存の zValidator → `400 VALIDATION_ERROR`

#### 4.3.3 iOS DTO

```swift
struct CourseDto: Codable, Equatable, Identifiable {
    /* 既存 5 フィールド */
    var requiredAttendanceRate: Int? = nil
    var maxAbsences: Int? = nil
    var tardiesPerAbsence: Int? = nil
}
struct CourseRuleValues: Codable, Equatable {
    var requiredAttendanceRate: Int?
    var maxAbsences: Int?
    var tardiesPerAbsence: Int?
    static let none = CourseRuleValues(requiredAttendanceRate: nil, maxAbsences: nil, tardiesPerAbsence: nil)
}
struct CourseCreateInput: Codable, Equatable {
    /* 既存 */
    var requiredAttendanceRate: Int? = nil   // nil は送らない (合成 Encodable のまま)
    var maxAbsences: Int? = nil
    var tardiesPerAbsence: Int? = nil
}
struct CourseUpdateInput: Codable, Equatable {
    var name: String?
    var teacher: String?
    var color: String?
    var note: String?
    var rule: CourseRuleValues? = nil
    // ★ 自前 encode(to:): name/teacher/color/note は encodeIfPresent (従来どおり)。
    //   rule != nil のときだけ requiredAttendanceRate / maxAbsences / tardiesPerAbsence の 3 キーを
    //   トップレベルに必ず書く (nil は encodeNil = JSON null)。rule == nil なら 3 キーとも書かない。
    //   "rule" というキー自体は JSON に出さない。
}
struct CourseStatsDto {
    /* 既存 */
    var requiredAttendanceRate: Int? = nil
    var rule: CourseRuleValues? = nil
    var remainingLessons: Int? = nil
    var absenceLessons: Double? = nil
    var allowedAbsenceLessons: Int? = nil
    var limitedBy: String? = nil      // "rate" | "count"。enum にしない (未知値で decode を落とさない)
}
```

### 4.4 iOS UI

#### 4.4.1 科目の追加・編集 (`CourseEditModal`) — 「出席の基準」節

既存の「メモ」の下に追加。`BottomSheet` の内容がスクロールで伸びる (detent は既存の自動計算)。

```
出席の基準                                   (.atenderSm bold secondary = 既存 field 見出し)
┌ card (bgMuted, Radius.md, padding 12) ─────────────┐
│ この科目の必要出席率を変える            [ ON ]      │  id: course-rule-rate-toggle
│   [−]  80  [+]  %                                   │  NumberStepper(1...100)
│ ─────────────────────────────────────────────────── │
│ 欠席できる回数の上限を決める            [ ON ]      │  id: course-rule-max-absences-toggle
│   [−]  4  [+]  回まで                               │  NumberStepper(0...30)
│ ─────────────────────────────────────────────────── │
│ 遅刻・早退を欠席に換算する              [ OFF ]     │  id: course-rule-tardy-toggle
│   (ON のとき) [−] 3 [+] 回で欠席 1 回               │  NumberStepper(1...10)
└─────────────────────────────────────────────────────┘
回数は授業の回数です。同じ日のコマはまとめて 1 回と数えます。   (.atenderXs tertiary、常時)
<補足 1 行>                                                    (.atenderXs tertiary、下表)
```

補足 1 行 = `CourseRuleLogic.footnote(rateOn:maxOn:userRate:)`:

| rateOn | maxOn | 文言 |
|---|---|---|
| false | false | `"未設定の項目は共通の必要出席率（\(userRate)%）で判定します"` |
| true | false | `"この科目は \(rate)% で判定します"` (rate はステッパーの値) |
| false | true | `"この科目は回数の上限で判定します（共通の必要出席率は使いません）"` |
| true | true | `"出席率と回数の厳しい方で「あと何回休めるか」を出します"` |

- 初期値: 既存科目なら `course` の 3 値 (null の項目はトグル OFF)。トグルを ON にしたときのステッパー初期値は、率 = `userRate` (`MeResponse` キャッシュの `requiredAttendanceRate`、無ければ 70)、上限 = 5、換算 = 3
- 保存 (編集): `updateCourse(id:, CourseUpdateInput(name:…, rule: CourseRuleValues(各トグルが ON なら値、OFF なら nil)))` — rule は**常に**付ける
- 保存 (新規): `createCourse(CourseCreateInput(…, ON の項目だけ値))`
- 保存後の invalidate は既存どおり (`[.userTimetables(), today, .semesters()]` = 学期 overview も再取得される)

#### 4.4.2 科目詳細 (`CourseDetailModal.courseEditSection`)

既存の科目名・先生の表示の下に 1 行 `"基準: \(CourseRuleLogic.summary(rule:userRate:))"` (`.atenderSm` secondary)。`summary`:
- 3 つとも nil → `"共通（\(userRate)%）"`
- それ以外 → 設定されている項目を `" ・ "` で連結。率 `"出席率 \(r)%"`、上限 `"欠席 \(m) 回まで"`、換算 `"遅刻・早退 \(n) 回で欠席 1 回"`。率も上限も nil で換算だけある場合は先頭に `"共通（\(userRate)%）"` を付ける
- 例: `(80, 4, nil)` → `"出席率 80% ・ 欠席 4 回まで"`、`(nil, nil, 3)` + userRate 70 → `"共通（70%） ・ 遅刻・早退 3 回で欠席 1 回"`

#### 4.4.3 学期・科目の一覧 (`CourseListItem`) と表示ロジック

`SemesterOverviewDisplayLogic` に追加 (既存関数は不変):

```swift
static func requiredRate(stats: CourseStatsDto, fallback: Int) -> Int          // stats.requiredAttendanceRate ?? fallback
static func courseActionText(stats: CourseStatsDto) -> String
static func courseActionColor(stats: CourseStatsDto) -> Color
```

- `stats.allowedAbsenceLessons == nil` → 既存の `courseActionText(allowedAbsences:remainingCount:allowedAbsenceDays:)` / `courseActionColor(...)` に委譲 (値は §4.2.1 で科目の率が反映済み)
- `L = allowedAbsenceLessons`, `R = remainingLessons ?? 0`:
  - `L < 0` → `limitedBy == "rate" ? "下回る見込み" : "欠席上限を超えています"`、色 `.statusAbsent`
  - `L >= R` → `"残り全休OK"`、色 `.accent`
  - それ以外 → `"あと\(L)回休める"`、色 `.textTertiary`
- `CourseListItem`: `requiredRate` は `requiredRate(stats:fallback: 画面の requiredRate)` を使う (色分け `Color.forRate` と `RateProgressBar` のマーカー)。行末の文言・色は `courseActionText(stats:)` / `courseActionColor(stats:)`
- overall (`AttendanceRateHero` / `overallActionText`) は不変 (共通率の限ベース。§12-L3)

---

## 5. レーン C — 公開時間割の提案と取り込み

### 5.1 データモデル

```prisma
model TimetableTemplate {
  // 既存の列 …
  sourceUserTimetableId String? @unique  // 公開元の UserTimetable。FK は張らない (UT 削除後も行は残り、id は宙に浮く)
  daysOfWeek            String?          // 公開元の表示曜日 CSV ("1,2,3,4,5"、1=月…7=日)。null = 旧データ
}
```

migration `apps/api/prisma/migrations/20261029130000_b21_template_source_link/migration.sql`:

```sql
ALTER TABLE "TimetableTemplate" ADD COLUMN "sourceUserTimetableId" TEXT;
ALTER TABLE "TimetableTemplate" ADD COLUMN "daysOfWeek" TEXT;
CREATE UNIQUE INDEX "TimetableTemplate_sourceUserTimetableId_key" ON "TimetableTemplate"("sourceUserTimetableId");
```

- SQLite の UNIQUE は NULL を複数許すので、既存行 (全て null) と衝突しない
- FK を張らない理由: FK 追加は SQLite で table 作り直しになる (build 20 の `b20_author_set_null` と同じ重さ)。ぶら下がった id は「その UT からの再公開は来ない」以上の意味を持たず、害が無い
- 既存の重複テンプレは消さない (§12-T4)。提案一覧は表示側で畳む (§5.3.2)

### 5.2 API

#### 5.2.1 `POST /api/user-timetables/:id/publish-as-template` (公開 = upsert)

入力 `PublishInput` は不変。処理 (1 tx):
1. `getOwnedTimetable` (不変)、学校・学科未設定は `403 SCHOOL_OR_DEPT_NOT_SET` (不変)
2. `existing = findFirst({ where: { sourceUserTimetableId: id } })`
3. `existing` があり `existing.authorUserId === user.id` → **更新**: `schoolId`/`departmentId` = ユーザーの現在値、`title` = 入力、`description`/`year`/`term` = 入力にあれば上書き (無ければ据え置き)、`isPublic = true`、`daysOfWeek` = UT の `daysOfWeek`、daySlots/courses/meetings は全削除 → UT から作り直し (`copyCount` は据え置き)。**200** `{ template }`
4. `existing` があり author が別 (null を含む) → `existing.sourceUserTimetableId = null` に更新してから 5 へ
5. **作成**: 既存の作成処理に `sourceUserTimetableId: id`、`daysOfWeek: UT.daysOfWeek` を足す。**201** `{ template }`
6. 作成で `P2002` (同時公開の競合) → 3 の更新経路を 1 回だけやり直す

#### 5.2.2 `POST /api/timetable-templates/:id/copy` (置換に対応)

`TemplateCopyInput` に `replaceExisting: z.boolean().optional()` (既定 false) を追加。`copyTemplateToUser` を次に置換 (既存の 404/403 判定は不変):

1. tx 開始 (`prisma.$transaction(fn, { timeout: 60_000, maxWait: 10_000 })`。手順 8 の生成は occurrence を 1 件ずつ create するので既定の 5 秒を超えうる)
2. `existing = tx.userTimetable.findUnique({ userId_semesterId })`
3. `existing` あり、`replaceExisting !== true` → `409 CONFLICT` (従来どおり)
4. `existing` あり、`replaceExisting === true` → `tx.userTimetable.delete({ id: existing.id })` (daySlots・courses・meetings・occurrences・出欠記録・科目休講・時間割休講・授業変更が cascade で消える)
5. template (`isPublic: true`) が無ければ `404 NOT_FOUND` (tx はロールバック = 4 の削除も取り消し)
6. UT 作成: `title = input.title ?? template.title`、`sourceTemplateId = template.id`、`daysOfWeek = template.daysOfWeek ?? deriveDaysOfWeek(template.meetings)`
7. daySlots/courses/meetings のコピー、`copyCount + 1` (不変)
8. **同じ tx の中で** `generateOccurrencesForUserTimetable({ userTimetableId }, tx)` を実行 (関数に任意の client 引数を足す。既定は `prisma` で、他の呼び出し元は不変)。生成が throw したら tx ごとロールバック = 4 の削除・6〜7 の作成・`copyCount + 1` が全て取り消される (例: テンプレの meeting が daySlots に無い period を参照 → `400 DAY_SLOT_NOT_FOUND`。`POST /api/timetable-templates` はこの不整合を 201 で保存できるので起こりうる)。`routes/templates.ts` 側の生成呼び出しは削除。tx 終了 → `201 { userTimetable }`。`replaceExisting` 無しの新規 copy も同じ tx を通る
9. `P2002` → `409 CONFLICT` (不変)

`deriveDaysOfWeek(meetings)` = `{1,2,3,4,5} ∪ { m.dayOfWeek == 0 ? 7 : m.dayOfWeek }` を昇順 CSV。例: meeting が月・水・土 → `"1,2,3,4,5,6"`、日曜あり → `"1,2,3,4,5,7"`。

#### 5.2.3 DTO の追加

```ts
// template.ts
TemplateDto: + daysOfWeek: z.array(z.number().int().min(1).max(7)).nullable().optional()
TemplateCopyInput: + replaceExisting: z.boolean().optional()

// userTimetable.ts
UserTimetableDto: + publishedTemplate: z.object({
  id: z.string(), title: z.string(), isPublic: z.boolean(), updatedAt: z.string(),
}).nullable().optional()

// me.ts — MeResponseDto.user に追加
schoolName: z.string().nullable().optional(),
departmentName: z.string().nullable().optional(),
```

- `templateDto()`: `daysOfWeek` を CSV から配列に (null はそのまま null)
- `GET /api/user-timetables` (一覧) **だけ**が `publishedTemplate` を付ける: 一覧取得の後に `timetableTemplate.findMany({ where: { sourceUserTimetableId: { in: ids }, authorUserId: user.id } })` を 1 回引き、UT ごとに該当行 (無ければ `null`) を付ける。他の UT 返却経路 (`GET :id`・POST・PATCH・copy) はキー自体を出さない
- `getMeResponse` (`routes/me.ts:33`): `schoolId`/`departmentId` が非 null なら名前を引いて付ける (無ければ null)
- `GET /api/timetable-templates` は**変更しない** (件数 endpoint・`?summary` も作らない。§11)

#### 5.2.4 iOS DTO / Endpoint / Repository

```swift
struct UserDto { /* 既存 */ var schoolName: String? = nil; var departmentName: String? = nil }
struct TemplateDto { /* 既存 */ var daysOfWeek: [Int]? = nil }
struct TemplateCopyInput: Codable, Equatable { let semesterId: String; var title: String?; var replaceExisting: Bool? = nil }
struct PublishedTemplateRef: Codable, Equatable { let id: String; let title: String; let isPublic: Bool; let updatedAt: String }
struct UserTimetableDto { /* 既存 */ var publishedTemplate: PublishedTemplateRef? = nil }
struct TemplatePatchInput: Codable, Equatable { var isPublic: Bool? }

// APIEndpoint
static func patchTemplate(id: String, _ body: TemplatePatchInput) -> APIEndpoint   // PATCH /api/timetable-templates/:id

// TemplateRepository (RoomRepositories.swift)
func templates(_ query: TemplateSearchQuery, force: Bool = false) async throws -> [TemplateDto]   // 不変
func copyTemplate(id: String, _ input: TemplateCopyInput) async throws -> UserTimetableDto        // invalidate .templateCopy
// publishTimetable(id:title:) は削除 (TimetableRepository.publishAsTemplate と重複)

// TimetableRepository (Repositories.swift)
func publishAsTemplate(id: String, title: String) async throws -> TemplateDto   // 既存 + invalidate .userTimetablePublish
func unpublishTemplate(id: String) async throws                                 // PATCH isPublic=false + invalidate .userTimetablePublish
// templates(query:) と copyTemplate(id:input:) は削除

// InvalidationMatrix
case .templateCopy: return [.userTimetables(), .me(), QueryKey(["today"]), QueryKey(["stats"]), .semesters(), .dayPrefix()]
```

`.templateCopy` が `user-timetables` を含むので、取り込み後に EventKit の書き出しも走る (`CalendarSyncTrigger.watchedPrefixes`)。

### 5.3 iOS 共有部品

#### 5.3.1 学校・学科の検索 (`Features/Setup/SchoolDepartmentPicker.swift`、新規)

`SetupViewModel` の step1/2 のロジックを切り出し、Setup と設定シートとテンプレ一覧の「別の学科を探す」で共用する。

```swift
@MainActor @Observable
final class SchoolDepartmentPickerModel {
    enum Stage: Equatable { case school, department }
    private(set) var stage: Stage = .school
    var schoolQuery = ""
    var prefecture = ""                       // "" = 指定なし
    var departmentQuery = ""
    private(set) var schools: [SchoolDto] = []
    private(set) var departments: [DepartmentDto] = []
    private(set) var school: SchoolDto?
    var department: DepartmentDto?
    private(set) var busy = false
    private(set) var errorText: String?
    let allowsCreate: Bool                    // Setup / 設定 = true、テンプレの「別の学科を探す」= false

    static let prefectures = ["", "北海道", "東京都", "千葉県", "神奈川県", "埼玉県", "大阪府", "京都府", "愛知県", "福岡県"]  // 既存の 9 件 (不変)

    init(schoolRepository: SchoolRepository, allowsCreate: Bool)
    func searchSchools() async                 // 既存 SetupViewModel.searchSchools と同じ
    func selectSchool(_ school: SchoolDto)     // school = school, department = nil, departmentQuery = "", stage = .department
    func addSchool() async                     // allowsCreate のときだけ。既存と同じ (kind: .other)、成功で selectSchool
    func loadDepartments() async               // 既存と同じ
    func addDepartment() async                 // allowsCreate のときだけ。既存と同じ、成功で department = 作成したもの
    func backToSchool()                        // stage = .school, school = nil, department = nil, departments = []
}

struct SchoolDepartmentPickerView: View {
    @Bindable var model: SchoolDepartmentPickerModel
    // stage == .school: 学校名 LabeledInput + 都道府県 Picker(.menu) + 結果ボタン列 + (allowsCreate) 「＋ リストに無い学校を追加」
    // stage == .department: 「〈学校名〉 [変更]」行 + 学科名 LabeledInput + 結果ボタン列 (選択中は accent50 塗り) + (allowsCreate) 「＋ 学科を追加」
    // 検索は既存どおり .task(id:) + 300ms
}
```

`SetupViewModel` は `picker: SchoolDepartmentPickerModel(allowsCreate: true)` を持ち、step1/2 の View は `SchoolDepartmentPickerView` + 既存の「戻る」「次へ」ボタンに置き換える。

#### 5.3.2 提案一覧の純ロジック (`Features/Templates/TemplateSuggestionLogic.swift`、新規)

```swift
struct TemplateScope: Equatable { let schoolId: String; let departmentId: String; let schoolName: String; let departmentName: String }

enum TemplateSuggestionLogic {
    /// 表示する順に並べた一覧。手順: (1) meetings が空のテンプレを除く
    /// (2) authorUserId が "" でないものを (authorUserId, title) で束ね、updatedAt が最大の 1 件を残す (同値は id が大きい方)
    /// (3) copyCount 降順 → updatedAt 降順 → id 降順
    static func visible(_ templates: [TemplateDto]) -> [TemplateDto]
    /// "8科目・週12コマ" (コマ = meetings の periodCount の合計)
    static func sizeText(_ t: TemplateDto) -> String
    /// copyCount > 0: "12人が使用・2026/10/3 更新"、copyCount == 0: "2026/10/3 更新"。
    /// meId と authorUserId が一致したら先頭に "あなたが公開・"。日付は updatedAt を JST の yyyy/M/d
    static func metaText(_ t: TemplateDto, meId: String?) -> String
    /// プレビュー行。並びは表示曜日順 (月→日: dayOfWeek 1,2,3,4,5,6,0) → startPeriodIndex 昇順
    static func previewRows(_ t: TemplateDto) -> [TemplatePreviewRow]
}
struct TemplatePreviewRow: Equatable, Identifiable {
    let id: String              // meeting.id
    let weekday: String         // "月" … "日"
    let periodText: String      // periodCount 1: "1限"、2 以上: "3–4限" (en dash)
    let courseName: String      // 科目が見つからなければ "授業"
    let detail: String?         // teacher と room を " · " で連結、両方 nil なら nil
}
```

#### 5.3.3 取り込みの判定 (`Features/Templates/TemplateImportLogic.swift`、新規)

```swift
enum TemplateImportDecision: Equatable {
    case copy                              // 対象学期に時間割が無い
    case replaceSilently                   // 空の時間割がある → 確認なしで置換
    case confirmReplace(courseCount: Int)  // 中身がある → 確認してから置換
}
enum TemplateImportLogic {
    static func decide(existing: UserTimetableDto?) -> TemplateImportDecision
    // existing == nil → .copy
    // existing.meetings.isEmpty && existing.courses.isEmpty → .replaceSilently
    // それ以外 → .confirmReplace(courseCount: existing.courses.count)
    static func copyInput(semesterId: String, decision: TemplateImportDecision) -> TemplateCopyInput
    // .copy → replaceExisting nil、それ以外 → replaceExisting true。title は常に nil
}
```

(「空」の定義を裁定の「コマ無し」より 1 段厳しくした理由: 授業を置いていない科目だけがある時間割も、ユーザーが手で入れた科目名を黙って消さないため。)

#### 5.3.4 テンプレ一覧画面 (`Features/Templates/TemplateBrowser.swift`、新規)

モーダル内の `NavigationStack` に **push** される画面 (DESIGN §3.7.4「モーダル内の 2 階層は push」)。ヘッダーは `atenderModalDetailHeader(title: "公開時間割", onBack:, onClose:)`。

```swift
struct TemplateBrowser: View {
    enum Purpose: Equatable {
        case importInto(initialSemesterId: String?, lockSemester: Bool)  // 選んだら取り込む
        case select                                                       // 選んだら呼び出し元へ返す (学期作成シート)
    }
    let purpose: Purpose
    let showsFoundBanner: Bool          // 先頭に「同じ学科の時間割が見つかりました」帯を出す
    let initialScope: TemplateScope
    let onImported: (UserTimetableDto) -> Void   // importInto のとき
    let onSelected: (TemplateDto) -> Void        // select のとき
    let onClose: () -> Void
}
```

レイアウト:

```
<        公開時間割          ✕
(showsFoundBanner) ┌ accent500 15% tint, Radius.md ───────────────┐
                   │ ✓ 同じ学科の時間割が見つかりました            │ .atenderBase bold
                   │ そのまま自分の学期に取り込めます              │ .atenderSm secondary
                   └───────────────────────────────────────────────┘
取り込み先  [2026 後期 ⌄]          ← importInto && !lockSemester: Menu (id template-target-semester)
取り込み先: 2026 後期              ← importInto && lockSemester: テキスト
〇〇大学 › 情報科学科        [別の学科を探す]   ← id template-browse-other
┌ card (bgElevated, Radius.md, shadow card, padding 16) ── id template-card-<id> ┐
│ 2026 後期 情報科学科 2年                      .atenderLg semibold, 2 行まで    │
│ 8科目・週12コマ                               .atenderSm secondary              │
│ 12人が使用・2026/10/3 更新                    .atenderXs tertiary               │
└──────────────────────────────────────────────────────────────────────────────┘
 (カード間 Space.s3、カード全体がボタン → プレビューへ push)
```

- 作成者は表示しない (handle が DTO に無く、`authorUserId` は内部 id のため)
- 「別の学科を探す」→ `SchoolDepartmentPickerView(allowsCreate: false)` を push。学科を選ぶと pop して scope を差し替え、一覧を再取得 (ユーザーの学校・学科設定は変えない)
- 状態:
  - loading: カード 3 枚のスケルトン (`.redacted(reason: .placeholder)`)
  - 0 件: `ContentUnavailableView` (マスコット `mascot-hello`) タイトル `"この学科の公開時間割はまだありません"`、説明 `"時間割を作って「みんなの時間割で公開」をオンにすると、同じ学科の人が使えるようになります"`
  - error: `"読み込めませんでした"` + `AtenderButton("再読み込み", .secondary)`
- 取得: `templateRepository.templates(TemplateSearchQuery(schoolId:, departmentId:, q: nil, limit: 20, cursor: nil), force: true)` → `TemplateSuggestionLogic.visible`。ページングはしない (20 件まで)

プレビュー (`TemplatePreviewScreen`、さらに push。title `"時間割の中身"`、id `template-preview`):

```
<       時間割の中身          ✕
2026 後期 情報科学科 2年                 .atender2xl bold
8科目・週12コマ / 12人が使用・2026/10/3 更新
┌ card ───────────────────────────────────────┐
│ 月  1限    プログラミング演習                │
│            山田 · 301                        │
│ 月  3–4限  データベース                      │
│ …                                            │
└──────────────────────────────────────────────┘
               [ この学期に取り込む ] (primary)   ← importInto。id template-import-button
               [ この時間割を使う ]   (primary)   ← select
```

取り込み (importInto) の流れ — `TemplateImportViewModel`:

```swift
@MainActor @Observable
final class TemplateImportViewModel {
    init(env: AppEnvironment, initialSemesterId: String?)
    private(set) var semesters: [SemesterDto]
    private(set) var timetables: [UserTimetableDto]
    var targetSemesterId: String?         // 初期 = initialSemesterId ?? me.defaultSemesterId ?? semesters.first?.id
    private(set) var isImporting = false
    var pendingReplace: PendingReplace?   // 非 nil で確認ダイアログ
    struct PendingReplace: Equatable { let template: TemplateDto; let semesterName: String; let courseCount: Int }
    func load() async                     // semesters(force: true) + userTimetables(force: true)
    func requestImport(_ t: TemplateDto) async -> UserTimetableDto?   // decide → copy は即実行 / confirm は pendingReplace を立てて nil
    func confirmReplace() async -> UserTimetableDto?
}
```

- 確認ダイアログ (`confirmationDialog`、titleVisibility .visible): title `"既存の時間割と出欠記録を置き換えます"`、message `"「\(semesterName)」の時間割（\(courseCount) 科目）と、その出欠記録はすべて削除され、元に戻せません。"`、ボタン `"置き換える"` (destructive) / `"キャンセル"`
- 成功: トースト `"「\(title)」を取り込みました"` → `onImported(dto)` (呼び出し元がモーダルを閉じる)
- 409 (確認前に誰かが時間割を作った) → `timetables` を再取得して `decide` をやり直す (1 回だけ)。やり直しで `.confirmReplace` ならダイアログ、`.replaceSilently` なら即置換
- 404 → トースト `"この時間割は公開が終了しました"` + 一覧を再取得して pop
- その他のエラー → トースト `"取り込めませんでした、もう一度試してください"` (状態は変えない)
- `targetSemesterId == nil` (学期が 1 つも無い) → 取り込みボタン disabled + 説明 `"先に学期を作成してください"`

### 5.4 オンボーディング (`SetupFlowView` / `SetupViewModel`)

#### 5.4.1 ステップ

| step | 名前 | 出る条件 |
|---|---|---|
| `.school` | 学校を選ぶ | 常に |
| `.department` | 学科を選ぶ | 常に |
| `.template` | 時間割を選ぶ | 学科確定後の提案が 1 件以上 |
| `.semester` | 学期を作る | 常に |

```swift
enum SetupStep: Equatable { case school, department, template, semester }
var step: SetupStep
var hasTemplateStep: Bool                 // suggestions が 1 件以上
var title: String                         // "Step \(n)/\(total): …"、total = hasTemplateStep ? 4 : 3
                                          // n: school 1, department 2, template 3, semester (hasTemplateStep ? 4 : 3)
private(set) var suggestions: [TemplateDto]
var selectedTemplateId: String?
var semester: SemesterDraft               // 初期値 = SemesterRollover.initialProposal(today: SchoolClock.todayString())
private(set) var createdSemesterId: String?
private(set) var templateCopied = false
private(set) var copyFailed = false
```

- 学科確定前は `hasTemplateStep == false` なので学校・学科の画面は `Step 1/3`・`Step 2/3`。提案が見つかった時点で以降が `Step 3/4`・`Step 4/4` になる
- 学期画面の「戻る」: `hasTemplateStep ? .template : .department`

`submitDepartment()` (既存の PATCH /api/me の後):
1. `suggestions = TemplateSuggestionLogic.visible(templates(schoolId:, departmentId:, limit: 20))`。**取得が失敗したら空配列として扱う** (オンボーディングを止めない、エラー表示もしない)
2. `hasTemplateStep = !suggestions.isEmpty`、`step = hasTemplateStep ? .template : .semester`

#### 5.4.2 「時間割を選ぶ」画面 (id `setup-template-step`)

```
セットアップ
Step 3/4: 時間割を選ぶ
┌ Panel ─────────────────────────────────────────┐
│ ✓ 同じ学科の時間割が見つかりました              │ .atenderLg bold
│ 〇〇大学 情報科学科 で公開されている時間割を、  │ .atenderSm secondary
│ そのまま自分の学期に取り込めます。              │
│ ┌ card ── id setup-template-card-<id> ────────┐ │
│ │ ◉ 2026 後期 情報科学科 2年                   │ │ ← 選択中: accent500 1pt 枠 + accent50 塗り
│ │   8科目・週12コマ                            │ │
│ │   12人が使用・2026/10/3 更新                 │ │
│ │   中身を見る ⌄                               │ │ ← タップでプレビュー行をカード内に展開
│ └──────────────────────────────────────────────┘ │
│ [ この時間割で進む ]      (primary, full)  id setup-template-use   │ selectedTemplateId != nil で enabled
│ [ 使わずに進む ]          (secondary, full) id setup-template-skip │
│ [ 戻る ]                  (ghost)                                  │
└─────────────────────────────────────────────────┘
```

- 「この時間割で進む」→ `step = .semester` (selectedTemplateId 保持)
- 「使わずに進む」→ `selectedTemplateId = nil`、`step = .semester`
- 「戻る」→ `step = .department`
- 学期画面に戻ってきた時、`selectedTemplateId != nil` なら学期フォームの上に `"取り込む時間割: \(title)"` + `[変更]` (ghost, sm。押すと `.template`) を出す

#### 5.4.3 完了処理の順序 (★ 遷移を遅らせる仕組み)

```swift
enum SemesterCreationContext: Equatable { case onboarding, rollover }
enum SemesterCreationStep: Equatable { case createSemester, copyTemplate(templateId: String), setDefaultSemester, refreshMe }
enum SemesterCreationPlan {
    static func steps(context: SemesterCreationContext, createdSemesterId: String?,
                      templateId: String?, templateCopied: Bool) -> [SemesterCreationStep]
    // createdSemesterId == nil なら先頭に .createSemester
    // templateId != nil && !templateCopied なら .copyTemplate(templateId)
    // 常に .setDefaultSemester
    // context == .onboarding なら末尾に .refreshMe
}
```

`SetupViewModel.submitSemester()` は `steps(context: .onboarding, createdSemesterId:, templateId: selectedTemplateId, templateCopied:)` を先頭から実行する:
- `.createSemester`: `createSemester(name/start/end)` → `createdSemesterId` を保存。失敗 → `errorText = error.userFacingMessage`、中断
- `.copyTemplate`: `copyTemplate(id:, TemplateCopyInput(semesterId: createdSemesterId!, title: nil, replaceExisting: nil))`。成功 or `409` → `templateCopied = true`。それ以外の失敗 → `copyFailed = true`、中断
- `.setDefaultSemester`: `updateMe(defaultSemesterId: createdSemesterId)`。失敗 → `errorText`、中断
- `.refreshMe`: `authStore.refreshMe()` (ここで `isComplete == true` を受けて `RootView` が `MainTabView` に切り替わる)

サーバー側は `.createSemester` の時点で `isComplete` が true になるが、iOS の遷移は `.refreshMe` まで起きない (§2)。アプリがその間に終了した場合は次回起動で Home に入り、時間割は空のまま (取り込みは §5.5 の導線から行える)。

`createdSemesterId != nil` の間、学期フォームの 3 フィールドは disabled。`copyFailed == true` のとき学期画面に ErrorBanner `"学期は作成しました。時間割を取り込めませんでした"` と 2 ボタン:
- `"もう一度"` (primary) → `copyFailed = false` にして `submitSemester()` を再実行 (plan は `[.copyTemplate, .setDefaultSemester, .refreshMe]`)
- `"取り込まずに完了"` (secondary) → `selectedTemplateId = nil` にして `submitSemester()` (plan は `[.setDefaultSemester, .refreshMe]`)

#### 5.4.4 学期の既定値 (`SemesterRollover.initialProposal`)

```swift
static func initialProposal(today: String) -> SemesterProposal
// month = today の月、year = today の年
// 4...9 月  → "\(year) 前期",   "\(year)-04-01", "\(year)-09-30"
// 10...12 月 → "\(year) 後期",   "\(year)-10-01", "\(year + 1)-03-31"
// 1...3 月  → "\(year - 1) 後期", "\(year - 1)-10-01", "\(year)-03-31"
```

### 5.5 通常の導線 (4 つ)

| # | 入口 | 起動 | `TemplateBrowser` の引数 | 取り込み後 |
|---|---|---|---|---|
| **E1** | 設定 → 学期管理 (`SemesterListSheet`) の学期一覧の上に `AtenderButton("公開時間割から取り込む", .secondary)` (id `semester-list-import-template`) | push | `.importInto(initialSemesterId: me.defaultSemesterId, lockSemester: false)`、`showsFoundBanner: false`、scope = me の学校・学科 | トースト → pop して `reload()` |
| **E2** | ホームの時間割の設定 (`TimetableSettingsSheet`) の「同じ学校の公開時間割から持ってくる」(と検索欄・一覧) を**撤去**し、`AtenderButton("公開時間割から取り込む", .secondary)` (id `timetable-settings-import-template`) を置く。`timetable == nil` でも enabled | push (BottomSheet の `navigationPath`) | `.importInto(initialSemesterId: semesterId, lockSemester: true)` | トースト → `onSaved?()` → シートを閉じる |
| **E3** | 学期作成シート (`SemesterCreateSheet`、build 19 のロールオーバー) | シート表示時に提案を取得、1 件以上ならフォームの下にカード (id `semester-create-template-suggestion`) | 「選ぶ」で `.select`、`showsFoundBanner: true` | §5.5.2 |
| **E4** | 設定 → 学校・学科 (`SchoolDeptEditSheet`) で学科を変えて保存した直後 | 提案 1 件以上なら push | `.importInto(initialSemesterId: me.defaultSemesterId, lockSemester: false)`、`showsFoundBanner: true` | トースト → シートを閉じる |

- E2 のために `TimetableSettingsSheet` に `let semesterId: String?` を追加し、`SelfTimetableView` の呼び出しで `semesterId` を渡す (`timetable?.semesterId ?? semesterId`)
- Home の学期メニュー (`SemesterMenu`) には入口を置かない (§11)

#### 5.5.1 設定の学校・学科 (`SchoolDeptEditSheet` を作り直し)

```
<        学校・学科          ✕
現在: 〇〇大学 / 情報科学科            .atenderSm secondary (名前が無ければ "未設定")
(SchoolDepartmentPickerView, allowsCreate: true)
                 [キャンセル] [保存]
```
- 保存 enabled = `picker.department != nil` かつ `(school.id, department.id) != (me.schoolId, me.departmentId)` かつ未保存中
- 保存 → `updateMe(schoolId:, departmentId:)`。失敗 → トースト `"保存できませんでした"` (シートは閉じない)
- 成功 → `onSaved()` → 提案を取得 (失敗は 0 件扱い) → 1 件以上なら E4 として push、0 件ならトースト `"学校・学科を変更しました"` → 閉じる
- id `school-dept-sheet` (既存) を維持

#### 5.5.2 学期作成シート (E3)

```
<         新しい学期          ✕
学期名 / 開始日 / 終了日          (既存)
時限と表示曜日は前の学期から引き継がれます    (既存。取り込む時間割を選んだら "時限と表示曜日は取り込む時間割に合わせます" に置換)
┌ card ── id semester-create-template-suggestion ─┐   提案 1 件以上のときだけ
│ 同じ学科の時間割が \(n) 件見つかりました          │ .atenderBase bold
│ [ 選ぶ ]  (secondary, sm)                        │
│ ── 選択後 ──                                      │
│ 取り込む: 2026 後期 情報科学科 2年   [解除]       │
└──────────────────────────────────────────────────┘
                 [キャンセル] [学期を作成]
```
- 「学期を作成」→ `SemesterCreationPlan.steps(context: .rollover, createdSemesterId: nil, templateId: selected?.id, templateCopied: false)` = `[.createSemester, (.copyTemplate), .setDefaultSemester]` を実行
- `.createSemester` 失敗 → 既存どおりトースト `"保存できませんでした"`、中断
- `.copyTemplate` 失敗 (409 以外) → トースト `"学期は作成しました。時間割は「時間割の設定」から取り込めます"`、**中断せず** `.setDefaultSemester` へ
- `.setDefaultSemester` 失敗 → 既存どおりトースト `"既定の学期を更新できませんでした。設定の学期管理から選べます"` して続行
- 最後に既存どおり `onCreated(created)` → 閉じる
- `SemesterCreateSheet` の中身を `NavigationStack` に入れる責務は既存の `SheetScaffold` が持つ (push は `.navigationDestination(isPresented:)`)

### 5.6 公開トグル (`TimetableSettingsSheet`)

- 初期値 `publishEnabled = TimetablePublishLogic.initialToggle(timetable)`:
  - `timetable == nil` → false (トグル自体 disabled、既存どおり)
  - `timetable.publishedTemplate != nil` → `publishedTemplate.isPublic`
  - それ以外 → `timetable.sourceTemplateId == nil` (自分で作った時間割は ON、取り込んだ時間割は OFF。取り込み直後の再公開で同じ中身のテンプレが増えるのを防ぐ)
- 初期 `publishTitle` = `publishedTemplate?.title ?? timetable.title`
- 保存時 `TimetablePublishLogic.action(toggle:timetable:)`:

| toggle | `meetings.isEmpty` | `publishedTemplate` | 動作 |
|---|---|---|---|
| ON | true | 任意 | 何もしない (トグル下に `"授業を 1 つ以上登録すると公開されます"` を常時表示) |
| ON | false | 任意 | `publishAsTemplate(id:, title:)` (サーバーが更新 or 作成) |
| OFF | 任意 | `isPublic == true` | `unpublishTemplate(id: publishedTemplate.id)` |
| OFF | 任意 | nil or `isPublic == false` | 何もしない |

```swift
enum TimetablePublishAction: Equatable { case none, publish(title: String), unpublish(templateId: String) }
enum TimetablePublishLogic {
    static func initialToggle(_ timetable: UserTimetableDto?) -> Bool
    static func action(toggle: Bool, title: String, timetable: UserTimetableDto) -> TimetablePublishAction
}
```
- 公開・非公開の失敗は `try?` で握り潰さず、`message = "公開設定を保存できませんでした"` を出してシートを閉じない (他の項目の保存は済んでいる)

### 5.7 画面遷移

```
[オンボーディング]
学校 ─▶ 学科 ─(PATCH me)─▶ 提案取得 ─┬─ 1件以上 ─▶ 時間割を選ぶ ─┬─ この時間割で進む ─▶ 学期を作る
                                      │                            └─ 使わずに進む ────▶ 学期を作る
                                      └─ 0件/失敗 ─────────────────────────────────────▶ 学期を作る
学期を作る ─▶ POST semesters ─▶ (copy) ─▶ PATCH me default ─▶ refreshMe ─▶ ホーム

[設定タブ]
学校・学科 ─(保存)─▶ 提案 1 件以上 ─push─▶ 公開時間割 (帯あり) ─▶ 中身 ─▶ 取り込む ─▶ 閉じる
学期管理 ─[公開時間割から取り込む]─push─▶ 公開時間割 ─▶ 中身 ─▶ 取り込む ─▶ pop
カレンダー ─▶ カレンダーに書き出し (権限 / 時間割を書き出す / 今すぐ書き出す / 同期状態)

[ホーム]
歯車 (時間割の設定) ─[公開時間割から取り込む]─push─▶ 公開時間割 (学期固定) ─▶ 中身 ─▶ 取り込む ─▶ 閉じる
「前回の学期が終了しました」─▶ 新しい学期 ─[選ぶ]─push─▶ 公開時間割 (帯あり) ─▶ 中身 ─[この時間割を使う]─pop─▶ 学期を作成
                                                                                              (どの画面も 公開時間割 ─[別の学科を探す]─push─▶ 学校・学科検索 ─pop)
```

### 5.8 UI/UX チェック (汎用層 §7 の該当項目、DESIGN.md 準拠)

| 観点 | 判定 |
|---|---|
| ヘッダー規格 | 新画面は全て `atenderModalHeader` / `atenderModalDetailHeader`。タイトル「公開時間割」(5)「時間割の中身」(6)「カレンダーに書き出し」(10) は 12 文字以内 |
| カード | `Radius.md` + `.atenderShadow(.card)` + `bgElevated`。シート内のカードは既存 `CalendarSyncSettingsSheet.card` と同じ規格 |
| accent | 塗りボタンは各画面 1 個 (取り込む / この時間割で進む / 学期を作成)。提案の帯は accent 15% tint (面) で文字色は `textPrimary` |
| タップ領域 | テンプレカード全体がボタン (高さ ≥ 44)。ステッパーは既存 44pt |
| 空 / loading / error | §5.3.4 に全て定義。Setup の提案取得失敗はステップを出さないことで吸収 |
| 破壊的操作 | 置換は confirmationDialog (destructive)。空の時間割の置換だけ確認なし (裁定) |
| 文言 | 「同じ学科の時間割が見つかりました」(要望の逐語) を Setup・E3・E4 の 3 か所で同じ文字列にする (`TemplateSuggestionLogic.foundTitle` 定数) |

---

## 6. データモデルのまとめ

| 層 | 変更 | additive の根拠 |
|---|---|---|
| Prisma | `Course` + 3 列 (nullable)、`TimetableTemplate` + 2 列 (nullable) + UNIQUE index 1 本 | `ALTER TABLE ADD COLUMN` のみ。table 作り直し無し。既存行は全て NULL |
| shared zod | 追加は全て `.optional()` (入力) / `.nullable().optional()` (出力) | 旧 Web・旧 iOS は未知キーを無視 |
| iOS DTO | 追加は全て `var x: T? = nil` を末尾に | memberwise init・fixture 不変 |
| API 挙動の変化 | (1) publish の 2 回目以降が 201 作成 → 200 更新 (2) 科目に率を設定した場合だけ `allowedAbsences` 等がその率で出る | (1) Web の `api()` は 2xx を成功扱い (`useUserTimetable.ts:118`)。(2) 科目ルールは build 21 の iOS でしか設定できない |
| **A2 (破壊的、デプロイ 2)** | Prisma 9 モデル・7 enum を DROP (§3.12.3)。API の出力から `RoomWeekDto.roomEvents`・`DayDetailDto.personalEvents`・`RoomSummaryDto/RoomDto.upcomingEvent` を削除。カレンダー route 34 本 (§7.A AD1) が 404 | build 21 の iOS は 3 フィールドを decode しない (§3.8)。A2 後の Web はこれらを参照しない (§3.11)。build 12〜20 は `MIN_IOS_BUILD = 21` の 426 で更新画面に入る (削除 route に到達しない) |

---

## 7. 挙動仕様 (Reviewer はここからテストを作る)

### 7.A レーン A

| # | 条件 | 期待 |
|---|---|---|
| A1 | Home を開く | `home-mode-picker` が存在しない。「カレンダー」ボタンが存在しない |
| A2 | Home で自分 chip | `SelfTimetableView` が出て、toolbar に「時間割の設定」歯車がある |
| A3 | Home でルーム chip | `RoomTimetable` が出て、toolbar に `home-room-settings` がある。「時間割の設定」は無い |
| A4 | ルーム設定シート | 「自分のカレンダーをルームに共有」節と ICS 取り込みボタンが無い。メンバー・招待 (OWNER)・削除/退出は従来どおり |
| A5 | 学期タブで日付をタップ | 日別シートに「休講」「授業変更」「授業 (N)」の 3 ブロックだけがあり、「予定」節と「追加」ボタンが無い |
| A6 | 学期タブで複数選択 → 一括編集 | 「出席を一括登録」「未記録に戻す」「休講」の 3 節。「予定」節が無い |
| A7 | 設定タブ | 節「カレンダー」に行「iPhone カレンダーに書き出す」(id `settings-row-calendar`)。trailingText は §3.4.1 の 3 通り |
| A8 | 書き出しシート (未許可) | タイトル「カレンダーに書き出し」、説明文、ボタン「iPhone カレンダーに書き出す」。読み込みカレンダーの一覧・「授業」「自分の予定」トグルが無い |
| A9 | 書き出しシート (fullAccess) | Toggle「時間割を書き出す」・書き出し先・「今すぐ書き出す」・同期状態がある |
| A10 | Toggle を OFF | 確認 title「iPhone カレンダーから Atender の授業を削除します」→「削除する」で `wipeExport` + トースト「iPhone カレンダーから削除しました」 |
| A11 | `sync` 実行 (fullAccess、`exportEnabled`、移行済み) | `POST /api/personal-events/eventkit-sync`・`GET /api/personal-events`・`GET /api/personal-events/eventkit-legacy-pushes` のいずれも送らない。`GET /api/occurrences` だけを送る |
| A12 | `sync` の planner 入力 | `prunableKinds` は `hasActiveTimetable == true` なら `{.meeting, .personal}`、false なら `{.personal}` |
| A13 | Atender カレンダーに `atender://p/...` が窓内にある状態で `sync` | その個人予定が削除される。`atender://m/...` と他人のイベント (key nil) は残る (純ロジック: `CalendarExportPlanner.plan(desired: [], existing: [p, m, foreign], prunableKinds: [.personal])` → deletes = [p の eventIdentifier] のみ) |
| A14 | `CalendarSyncMigration.exportEnabledAfterMigration` | `(true, nil)→true`、`(true, true)→true`、`(true, false)→false`、`(false, nil)→false`、`(false, false)→false` |
| A15 | 移行 (exportCourses 未設定 or true) | ±730 日の `atender://p/...` だけを消し、5 キーを削除し、`b21Migrated = true`。`exportEnabled` は不変 |
| A16 | 移行 (`exportCourses == false` かつ `exportEnabled == true`) | `exportEnabled = false`、`wipeOwned(±730)`、5 キー削除、`b21Migrated = true`。この回の書き出し (手順 5) はしない |
| A17 | 移行 (access が fullAccess でない、またはカレンダー未解決) | 何もしない。`b21Migrated` は false のまま |
| A18 | 移行の `apply`/`wipeOwned` が throw | `b21Migrated` は false のまま、`status.phase == .failed`、`lastError == .applyFailed(...)` |
| A19 | `b21Migrated == true` | 移行処理を一切しない (planner を ±730 で呼ばない) |
| A20 | `CalendarSyncTrigger.watchedPrefixes` | `["user-timetables"]`・`["timetable-suspensions"]`・`["semesters"]`・`["courses"]` の 4 件。`isDataChange([QueryKey(["personal-events"])])` は false |
| A21 | `CalendarSyncError.network("timeout").message` | `"時間割を取得できませんでした（timeout）"`。他のケースの文言・recovery は不変 |
| A22 | サインアウト / アカウント削除 | 従来どおり `wipeExport()` を呼ぶ |
| A23 | `project.yml` | `NSCalendarsFullAccessUsageDescription` が §3.9 の文字列と一致し、「読み込む」を含まない。`NSCalendarsWriteOnlyAccessUsageDescription` は無い |
| A24 | 授業変更 (振替) を作る | 学期タブの日別シートに授業変更カードが出る (不変)。次の `sync` で振替の occurrence が書き出される (不変) |
| A25 | `DayDetailDto` の decode | `personalEvents` キーを含む JSON でも成功する (キーは無視) |
| A26 | `RoomWeekDto` の decode | `roomEvents` キーを含む JSON でも成功し、`recurringMeetings` 欠落時は `[]` (不変) |
| A27 | ソース走査 | `apps/ios/Atender/` 配下に `PersonalEvent`・`RoomEventDto`・`IcsImport`・`eventKitSync`・`linkedCalendarIds`・`CalendarModePicker`・`HomeViewMode`・`upcomingEvent` の文字列が 0 件。`Features/Calendar/` ディレクトリが存在しない |
| A28 | 設定のアカウント削除確認 (iOS / Web) | 文言が §3.4.1 の文字列と一致し、「予定」を含まない |

**A-Web (デプロイ 1)**:

| # | 条件 | 期待 |
|---|---|---|
| AW1 | `/` を開く | 「時間割 / カレンダー」の切替が無い。自分 chip で時間割、ルーム chip でルーム時間割 |
| AW2 | `/rooms/:id` | 「カレンダー」タブが無く、ルーム時間割と設定ボタンが出る |
| AW3 | ルーム設定シート | ICS 取り込み・Google 同期・「カレンダー取り込み設定」が無い。「メンバーの時間割を表示」トグルが動く (`PATCH /api/rooms/:id { showMemberTimetables }`) |
| AW4 | `/settings` | 「Google Calendar 連携」「カレンダー設定 (ICS 等)」の行が無い。必要出席率・出欠ルール・学期管理・ログアウト・削除は残る |
| AW5 | `/settings/calendar`・`/settings/integrations/google` | `/settings` に redirect |
| AW6 | 学期の日別シート | 「予定」節が無い。出欠・休講・科目休講は従来どおり |
| AW7 | 学期の一括編集 | 終日予定の追加が無い。出欠一括・未記録に戻す・休講は従来どおり |
| AW8 | Web 全体のネットワーク | `/api/personal-events`・`/api/rooms/:id/events`・`ics-`・`google-calendar`・`personal-calendar-share`・`/api/me/ics-title-rules` を一度も呼ばない (MSW の未定義 handler 警告で検出) |
| AW9 | Google でログイン | 従来どおり動く (サインインは残す) |
| AW10 | `apps/web/src` のソース走査 | `PersonalEvent`・`RoomEvent`・`IcsImport`・`GoogleCalendar`・`personal-events` が 0 件 |
| AW11 | privacy.html / terms.html | §10.3.1 の文言を含み、「読み込むカレンダーはiOSアプリの設定から変更できます」を含まない |

**A2 (デプロイ 2)**:

| # | 条件 | 期待 |
|---|---|---|
| AD1 | 削除した route (`GET/POST /api/personal-events`、`PATCH/DELETE /api/personal-events/:id`、`POST /api/personal-events/eventkit-sync`、`GET /api/personal-events/eventkit-legacy-pushes`、`POST …/clear`、`GET/POST /api/rooms/:id/events`、`PATCH/DELETE /api/rooms/:id/events/:eventId`、`/api/rooms/:id/ics-imports*` 5 本、`/api/rooms/:id/google-calendar-syncs*` 5 本、`/api/rooms/:id/personal-calendar-share` 4 メソッド、`/api/me/ics-title-rules*` 4 本、`/api/me/google-calendar/*` 5 本) を `X-Atender-Client: ios/21` で叩く (34 本) | **404** (ボディは既存の未定義 route と同じ形。テストはステータスだけを見る) |
| AD2 | 同じ route を `X-Atender-Client: ios/20` で叩く | **426** `CLIENT_UPGRADE_REQUIRED` (route より手前の `clientVersionGuard`) |
| AD3 | `GET /api/occurrences?from&to` | デプロイ 1 と同じレスポンス (既存 `occurrence-range.test.ts` API1〜API10 が無変更で緑) |
| AD4 | `GET /api/rooms/:id/week` | `members`・`meetings`・`recurringMeetings` は不変、`roomEvents` キーが無い |
| AD5 | `GET /api/day/:date` | occurrences・休講・授業変更は不変、`personalEvents` キーが無い |
| AD6 | `GET /api/rooms`・`GET /api/rooms/:id` | `upcomingEvent` キーが無い。他のフィールドは不変 |
| AD7 | `POST/DELETE /api/class-transfers` | 不変 (既存 `class-transfers.test.ts` が緑) |
| AD8 | `DELETE /api/me` | 204。ルーム移譲・公開テンプレ匿名化・Apple/Google revoke は不変 (b20 #D1〜#D8・#D13〜#D24 が緑。#D9〜#D12 は削除) |
| AD9 | Google でサインイン → `GET /api/me` | 従来どおり (better-auth の Google provider は不変) |
| AD10 | migration 適用後の DB | 9 テーブルが存在しない (`sqlite_master` に無い)。`User`・`Room`・`Account`・`MeetingOccurrence` 等の行数はデプロイ前と同じ (`db-stats` の前後ログで確認) |
| AD11 | `GET /api/version` | `minIOSBuild == 21` |
| AD12 | `apps/api/src` のソース走査 | `personalEvent`・`roomEvent`・`icsImport`・`googleCalendar`・`personalCalendarShare` が 0 件 (大文字小文字区別なし)。`socialProviders.google` は残る |

### 7.B レーン B

| # | 条件 | 期待 |
|---|---|---|
| B1 | `POST /api/courses` に 3 フィールドなし | 3 列とも null。レスポンス `course` に 3 キーが `null` で出る |
| B2 | `POST /api/courses` に `{requiredAttendanceRate: 80, maxAbsences: 4, tardiesPerAbsence: 3}` | 保存され、レスポンスに同値 |
| B3 | `PATCH /api/courses/:id` に `{maxAbsences: null}` | その列だけ null。他の 2 列と name 等は不変 |
| B4 | `PATCH` でキーを省略 | 3 列とも不変 |
| B5 | 範囲外: `requiredAttendanceRate` 0 / 101、`maxAbsences` −1 / 100、`tardiesPerAbsence` 0 / 11、小数 | `400 VALIDATION_ERROR` |
| B6 | 他人の科目への PATCH | `404 NOT_FOUND` (不変) |
| B7 | 3 列とも null の科目の stats | 既存フィールドの値が build 20 と同一。`requiredAttendanceRate == U`、`rule` は 3 つとも null、`absenceLessons`/`allowedAbsenceLessons`/`limitedBy` は null、`remainingLessons` は §4.2.3 の値 |
| B8〜B20 | §4.2.4 の E1〜E12・E4 の各行 | 表の値と一致 (Reviewer は各行を API 統合テスト 1 本ずつにする。today は `now` 引数で固定し、**授業日の当日 0:00 JST と 23:59 JST の 2 標本**で同じ値になることを確かめる) |
| B21 | `Rc` を設定した科目の overall | overall の `allowedAbsences` = 各科目の `(1 − (Rc ?? U)/100) × D − 消化欠席` の和を floor |
| B22 | テンプレから取り込んだ科目 | 3 列とも null |
| B23 | `PATCH /api/user-timetables/:id` に `courses` を送る | 作り直された科目の 3 列は null |
| B24 | `GET /api/timetable-templates` の courses | 3 キーが `null` で出る |
| B25 | iOS `CourseUpdateInput(name: "A", rule: CourseRuleValues(requiredAttendanceRate: nil, maxAbsences: 5, tardiesPerAbsence: nil))` の JSON | キー集合 = `{name, requiredAttendanceRate, maxAbsences, tardiesPerAbsence}`、値 `"A"`, `null`, `5`, `null`。`"rule"` キーは無い |
| B26 | iOS `CourseUpdateInput(name: "A")` (rule nil) の JSON | キー集合 = `{name}` |
| B27 | iOS `CourseStatsDto` の decode | build 20 形 (新キー無し) の JSON で成功し、新フィールドは全て nil。`limitedBy: "future"` (未知値) でも成功 |
| B28 | `courseActionText(stats:)` (`allowedAbsenceLessons == nil`) | 既存 3 引数版と同じ文字列 |
| B29 | `courseActionText(stats:)` L=−1, limitedBy "count" | `"欠席上限を超えています"`、色 `.statusAbsent` |
| B30 | L=−1, limitedBy "rate" | `"下回る見込み"`、色 `.statusAbsent` |
| B31 | L=5, R=3 | `"残り全休OK"`、色 `.accent` |
| B32 | L=0, R=10 | `"あと0回休める"`、色 `.textTertiary` |
| B33 | L=2, R=9 | `"あと2回休める"` |
| B34 | `requiredRate(stats:fallback:)` | `stats.requiredAttendanceRate = 80, fallback 70 → 80`、nil → 70 |
| B35 | `CourseRuleLogic.summary` | §4.4.2 の 2 例 + 3 つとも nil (userRate 70) → `"共通（70%）"` |
| B36 | `CourseRuleLogic.footnote` | §4.4.1 の表 4 行 |
| B37 | `CourseEditModal` で既存科目 (80, nil, 3) を開く | 率トグル ON・80、上限トグル OFF、換算トグル ON・3 |
| B38 | 上限トグルを ON にした直後 | ステッパー 5。率トグルを ON にした直後は共通率 |
| B39 | 編集保存 | `PATCH /api/courses/:id` の body に 3 キーが必ず入る (OFF の項目は null) |

### 7.C レーン C

| # | 条件 | 期待 |
|---|---|---|
| C1 | 初回公開 (`publish-as-template`) | 201。作成された template の `sourceUserTimetableId == UT.id`、`daysOfWeek == UT.daysOfWeek` |
| C2 | 同じ UT で 2 回目の公開 (title 変更) | **200**。template の件数は増えない。id 同一、title 更新、`copyCount` 不変、daySlots/courses/meetings が UT の現在の内容と一致、`isPublic == true` |
| C3 | 2 回目の公開時にユーザーの学科が変わっている | 同じ template の `schoolId`/`departmentId` が新しい値に更新 |
| C4 | 非公開 (`isPublic false`) にした template がある UT で公開 | 同じ template が `isPublic true` に戻る (200) |
| C5 | 別 UT からの公開 | それぞれ別の template (201) |
| C6 | 学校・学科未設定で公開 | `403 SCHOOL_OR_DEPT_NOT_SET` (不変) |
| C7 | `copy` で対象学期に UT なし | 201、UT 作成。`daysOfWeek` = template の `daysOfWeek` (あれば) |
| C8 | `copy` で template の `daysOfWeek` が null、meeting に土曜 (6) | UT の `daysOfWeek == [1,2,3,4,5,6]` |
| C9 | 同、meeting に日曜 (0) | `[1,2,3,4,5,7]` |
| C10 | `copy` で UT あり・`replaceExisting` 省略 | `409 CONFLICT`、既存 UT・出欠記録は不変 |
| C11 | `copy` で UT あり (meeting 2・出欠記録 3・科目休講 1・授業変更 1)・`replaceExisting: true` | 201。旧 UT とその occurrences・AttendanceRecord・CourseSuspension・ClassTransfer が 0 件、新 UT が template の内容で存在し occurrences が生成済み |
| C12 | `replaceExisting: true` で template が非公開 / 存在しない | `404 NOT_FOUND`、**旧 UT と出欠記録は残る** (tx ロールバック) |
| C12c | 公開テンプレの meeting が daySlots に無い period を参照する | `replaceExisting: true` の copy は `400 DAY_SLOT_NOT_FOUND`、旧 UserTimetable・出欠記録が残り、`copyCount` も増えない。新規 copy (対象学期に UT なし) でも UserTimetable は作られない |
| C13 | 他人の学期への copy | `403 FORBIDDEN` (不変) |
| C14 | `copy` の後 | `copyCount + 1` (置換でも +1) |
| C15 | `GET /api/user-timetables` | 各 UT に `publishedTemplate` (自分が author の linked template。無ければ `null`) |
| C16 | `GET /api/user-timetables/:id`・POST・PATCH・copy のレスポンス | `publishedTemplate` キーを含まない |
| C17 | copy の後の `GET /api/me` | `defaultSemesterId` は copy 前と同じ |
| C18 | `GET /api/me` (学校・学科設定済み) | `user.schoolName`・`user.departmentName` が名前。未設定なら null |
| C19 | 退会 | 公開 template は匿名化されて残る (build 20 #D13 不変)。`sourceUserTimetableId` は残ったまま (指す UT は消えている) |
| C20 | `TemplateSuggestionLogic.visible` | (a) meetings 空を除外 (b) 同 author・同 title は updatedAt 最大だけ (c) authorUserId `""` は束ねない (d) 並び copyCount 降順 → updatedAt 降順 → id 降順 |
| C21 | `sizeText` | courses 8・meetings の periodCount 合計 12 → `"8科目・週12コマ"` |
| C22 | `metaText` | copyCount 12, updatedAt `2026-10-03T00:30:00.000Z` → `"12人が使用・2026/10/3 更新"`。copyCount 0 → `"2026/10/3 更新"`。**updatedAt `2026-10-02T15:30:00.000Z` (JST 10/3 0:30) → `"2026/10/3 更新"`** (JST で日付を出す)。meId == authorUserId → 先頭 `"あなたが公開・"` |
| C23 | `previewRows` | dayOfWeek 0 の meeting は最後 (日)。periodCount 2・start 3 → `"3–4限"`。teacher "山田"・room nil → detail `"山田"` |
| C24 | `TemplateImportLogic.decide` | nil → `.copy`、meetings 0・courses 0 → `.replaceSilently`、meetings 0・courses 2 → `.confirmReplace(2)`、meetings 3・courses 2 → `.confirmReplace(2)` |
| C25 | `copyInput` | `.copy` → `replaceExisting == nil`、それ以外 → `true`。`title == nil` |
| C26 | `SemesterCreationPlan.steps` | (onboarding, nil, "T", false) → `[create, copy(T), setDefault, refreshMe]`、(onboarding, "s", "T", false) → `[copy(T), setDefault, refreshMe]`、(onboarding, "s", "T", true) → `[setDefault, refreshMe]`、(onboarding, nil, nil, false) → `[create, setDefault, refreshMe]`、(rollover, nil, "T", false) → `[create, copy(T), setDefault]`、(rollover, nil, nil, false) → `[create, setDefault]` |
| C27 | `SemesterRollover.initialProposal` | `2026-10-29` → (`2026 後期`, `2026-10-01`, `2027-03-31`)、`2026-04-01` → (`2026 前期`, `2026-04-01`, `2026-09-30`)、`2026-09-30` → 前期、`2026-03-31` → (`2025 後期`, `2025-10-01`, `2026-03-31`)、`2027-01-15` → (`2026 後期`, `2026-10-01`, `2027-03-31`) |
| C28 | Setup: `SetupViewModel` 生成直後 | `semester` = `initialProposal(today)` (2026 前期固定ではない) |
| C29 | Setup: 学科確定・提案 2 件 | `step == .template`、`title == "Step 3/4: 時間割を選ぶ"` |
| C30 | Setup: 学科確定・提案 0 件 or 取得失敗 | `step == .semester`、`title == "Step 3/3: 学期を作る"`、errorText は nil |
| C31 | Setup: 提案ありで学期画面 | `title == "Step 4/4: 学期を作る"` |
| C32 | Setup: 「使わずに進む」 | `selectedTemplateId == nil`、`step == .semester` |
| C33 | Setup: copy が 500 | `copyFailed == true`、`createdSemesterId != nil`、`refreshMe` は呼ばれていない (`authStore.me.setupStatus.isComplete` は false のまま) |
| C34 | Setup: C33 の後「取り込まずに完了」 | 学期作成を再送しない (POST /api/semesters は合計 1 回)、PATCH me → refreshMe |
| C35 | Setup: copy が 409 | 成功扱いで続行 |
| C36 | 公開時間割一覧: 0 件 | タイトル「この学科の公開時間割はまだありません」の空状態 |
| C37 | 取り込み: 対象学期に中身のある時間割 | 確認 title「既存の時間割と出欠記録を置き換えます」、message に学期名と科目数。キャンセルで何も送らない |
| C38 | 取り込み: 空の時間割 | 確認なしで `replaceExisting: true` の copy を 1 回送る |
| C39 | 取り込み成功 | トースト「「<title>」を取り込みました」、invalidate に `user-timetables`・`today`・`stats`・`semesters`・`day` を含む |
| C40 | 取り込み 404 | トースト「この時間割は公開が終了しました」 |
| C41 | `TimetablePublishLogic.initialToggle` | nil → false、publishedTemplate isPublic true → true、isPublic false → false、publishedTemplate nil & sourceTemplateId nil → true、publishedTemplate nil & sourceTemplateId "x" → false |
| C42 | `TimetablePublishLogic.action` | §5.6 の表 4 行 |
| C43 | 時間割の設定シート | 「同じ学校の公開時間割から持ってくる」と検索欄が無い。`timetable-settings-import-template` が `timetable == nil` でも enabled |
| C44 | 学期管理シート | 一覧の上に `semester-list-import-template` |
| C45 | 学校・学科シート | 「学校 ID」「学科 ID」の入力欄が無い。学校検索 → 学科選択 → 保存 で `PATCH /api/me` に両 id |
| C46 | 学校・学科シート: 現在と同じ組み合わせ | 保存 disabled |
| C47 | 学校・学科を変更して保存・提案 1 件以上 | 「公開時間割」画面が push され、帯「同じ学科の時間割が見つかりました」が出る |
| C48 | 学期作成シート: 提案あり | カード「同じ学科の時間割が N 件見つかりました」。選んで作成すると `POST /api/semesters` → `copy` → `PATCH /api/me` の順に送る |
| C49 | 学期作成シート: copy が 500 | トースト「学期は作成しました。時間割は「時間割の設定」から取り込めます」、`PATCH /api/me` は送る、`onCreated` が呼ばれる |
| C50 | 「別の学科を探す」で選んだ学科 | 一覧がその学科の公開時間割に変わる。`PATCH /api/me` は送らない。学校・学科の追加ボタンが出ない |

---

## 8. テスト基盤

### 8.1 フレームワークと配置

| 層 | フレームワーク | 配置 | 実行 |
|---|---|---|---|
| API | Vitest (`apps/api/vitest.config.ts`、`pool: forks` singleFork) | `apps/api/tests/b21-course-rules.test.ts` (B)、`apps/api/tests/b21-template-publish-copy.test.ts` (C)、`apps/api/tests/b21-me-names.test.ts` (C18) | `cd apps/api; rm -rf tests/.tmp; pnpm exec prisma generate; pnpm exec vitest run` (並走・バックグラウンド起動しない。R §A5) |
| iOS ユニット | XCTest (`AtenderTests`) | `B21CalendarRemovalTests.swift` (A)、`B21CourseRuleTests.swift` (B)、`B21TemplateSuggestionTests.swift` / `B21SetupFlowTests.swift` (C) | `xcodebuild test -scheme Atender -destination 'platform=iOS Simulator,id=<UDID>'` |
| iOS UI | XCUITest (`AtenderUITests`) | `B21HomeAndExportUITests.swift` (A1-A3, A7-A9)、`B21TemplateImportUITests.swift` (C43-C44, C36-C39 の UI 部) | 同上 `-scheme AtenderUITests`。seed (§8.4) + bearer 注入 |
| Web | Vitest + RTL + MSW (`apps/web/vitest.config.ts`、`tests/setup.ts`) | `apps/web/tests/routes/B21CalendarRemoval.test.tsx` (AW1-AW8)、`apps/web/tests/legal/legal-pages.test.ts` (AW11 を #L4 に統合) | `cd apps/web; pnpm exec vitest run`。**着手時に 1 回走らせて実数を台帳の Web 節に記録** (台帳の最新は 2026-07-29 の 26 failed で古い) |
| API (A2) | Vitest | `apps/api/tests/a2-calendar-removed.test.ts` (AD1-AD12) | ブランチ `chore/drop-calendar-api` 上で |

- API の DB 層は実 SQLite + migration (`tests/helpers/db.ts` が `prisma migrate deploy`)。新 migration 2 本はここで当たる
- iOS のネットワーク依存ロジック (Setup の順序 C33-C35、取り込み C37-C40) は純ロジック (`SemesterCreationPlan`・`TemplateImportLogic`) の単体テストを主とし、実行器は `StubURLProtocol` (`APIClientTests` の先例) でリクエスト順を記録して検証する。そのために `SetupViewModel` / `TemplateImportViewModel` は `AppEnvironment` の代わりに使うリポジトリ群を引数で受ける init を **internal** で持つ (`init(schoolRepository:meRepository:semesterRepository:templateRepository:timetableRepository:authStore:)`)。本番は従来の `init(env:)` がそれを呼ぶ
- E2E (ブラウザ) は無し (iOS のみ)。chrome-devtools MCP は使わない

### 8.2 削除するテスト (A)

| ファイル | 処置 | 理由 |
|---|---|---|
| `B16CalendarDaySheetLogicTests` / `B16CalendarDayStyleTests` / `B16CalendarSelectionRenderTests` / `B17CalendarGridRenderTests` / `B17CalendarMonthStoreTests` / `B17CalendarScreenLogicTests` / `B17CalendarWindowTests` / `B17GridTokenAndGeometryTests` / `CalendarEventDisplayTests` / `CalendarLaneTests` / `CalendarLayoutTests` / `CalendarMonthRenderTests` / `PersonalCalendarLogicTests` / `PersonalEventDisplayTests` / `MeetingExpansionTests` | ファイル削除 | 対象型を削除 |
| `B17RoomFeatureParityTests` / `PersonalEventContractTests` / `RecurrenceSpecLogicTests` / `PersonalExportMappingTests` / `EventKitReconcilerTests` / `ExportDTODecodingTests` | ファイル削除 | 同上 (`ExportDTODecodingTests` は EventKitSync / LegacyEk の DTO だけを扱う) |
| `AtenderUITests/B17CalendarUITests` | ファイル削除 | 全テストが月カレンダー / ルームカレンダー / ICS / 個人予定 editor を前提 |
| `CalendarSyncStatusTests` | ST1〜ST6 (バナー) を削除、ST7 の network 行を §3.4 の新文言に、ST8・ST9 は残す | |
| `CalendarSyncTriggerTests` | TRG の `.personalEvents()` を使う 2 アサーションを `QueryKey(["courses"])` に置換し、`isDataChange([QueryKey(["personal-events"])]) == false` を 1 行追加。TRD で `.calendarScreen` を使っていれば削除 | |
| `EventKitTimeMappingTests` | `testEKEventSnapshotCarriesOccurrenceWithoutDaySplitting`・`testUploadsKeepsSameExternalIdWithDifferentOccurrences` を削除 (Reconciler)。jstDayStart 系 4 本は残す | |
| `B18ClassTransferLogicTests` | U8 / U9 (`TransferDisplay`)・U10 (`MeetingExpansion`) を削除。U11 の DayDetailDto JSON は `personalEvents` キーを持ったまま残す (A25 の回帰になる) | |
| `DTODecodingTests` | `testDecodeDayDetailEmptyAndPopulated` の `personalEvents` アサーション 2 行を削除、`testDecodePersonalEventOccurrenceAllDay` を削除、`testDecodeRoomWeekIntegerMinutesAsDouble` の `roomEvents` 3 行を削除、`testDecodePhaseAEnumsUnknownFallback` の `VisibilityMode`/`IcsImportStatus`/`RoomEventSource` 6 行を削除、`testDecodeRoomSummaryAndRoomNulls` の `upcomingEvent` 2 行 (`:333,339`) を削除 | |
| `RoomWeekContractTests` | `roomEvents` を読む 5 アサーション (`:64,68,69,112,114`) を削除。JSON 内の `"roomEvents": []` は残す | |
| `RoomLogicTests` | RoomEventTiming 3 本・SourceColor・BuildCalendarEvents 4 本・Availability 4 本・RecurrencePreset 2 本を削除。`testRoomCardUpcomingLabelAndTemplateAuthorHandle` を削除 (`RoomCardLogic` と `TemplateLogic` を両方削除するため)。Recurring I1〜I11・DefaultSlots・DisplayDays・InviteCode は残す | |
| `SemesterLogicTests` | 変更なし (`:288` の JSON の `personalEvents` は無視される) | |
| `CalendarExportPlannerTests` / `ExportKeyTests` | 変更なし (`ExportKey.personal` を残すため) | |
| `AtenderUITests/B16NavTrailingUITests` | N1-N3・N4-N7 は残す。D16D20・DesignIdentifiers・D17・D21・D18・D25・H3 (Home 月カレンダー前提の 7 本) と `openHomeCalendar`/日セル helper を削除 | |
| `AtenderUITests/B16Round2SheetGeometryUITests` | `testChromeMeasurementIsStableAcrossPresentations` の対象を「Home の歯車 → 時間割の設定シート」に付け替える (`openHomeCalendar` を削除し、`app.buttons["時間割の設定"]` を開閉 3 回で同じ測定を取る) | BottomSheet の detent 回帰は残す価値がある |
| `AtenderUITests/B18HomeRoomsUITests` | R14 をカレンダー切替の手順を除いた形に書き換え (自分 chip で「時間割の設定」あり、ルーム chip で `home-room-settings` あり)、R16 を削除 | |
| `AtenderUITests/B18ClassTransferUITests` | U18 を削除。U19 は残す | |
| `AtenderUITests/ScreenshotFlow.swift` | `:40-43` (カレンダーへ切替 + `02-home-calendar` スナップ) と `:166` 以降の Home カレンダー日タップを削除。学期タブの日タップは残す | |

### 8.3 更新するテスト (B / C)

| ファイル | 処置 |
|---|---|
| `apps/api/tests/user-timetables.test.ts` §8 #38 | `toBe(201)` は初回公開なので不変 (確認のみ) |
| `apps/api/tests/timetable-templates.test.ts` | copy の 409 テストは `replaceExisting` 省略なので不変 (確認のみ) |
| `AtenderTests/SemesterOverviewDisplayLogicTests` | 不変 (既存 3 引数版を残すため) |
| `AtenderTests/DTODecodingTests` の `testDecodeUserTimetable` / `testDecodeMeResponse` / template fixture | 不変 (新フィールドは Optional)。新キー入り fixture の decode は B21 側に新設 |

### 8.4 seed (`apps/api/scripts/seed-demo-user.ts`)

- (B) デモユーザーの先頭科目に `maxAbsences: 4, tardiesPerAbsence: 3` を設定
- (C) 同級生ユーザー `demo-user-ios-classmate` (掃除対象 id 配列に追加) を同じ学校・学科で作り、公開 template を 1 件: title `"情報処理科 2年 後期"`、daySlots 1〜4 限、科目 3、meeting 4 (うち 1 件は土曜 `dayOfWeek 6`、1 件は `periodCount 2`)、`daysOfWeek "1,2,3,4,5,6"`、`copyCount 3`。デモユーザーの「次学期」(時間割なし) が E1/E2 の取り込み先になる

### 8.5 版数ピン留め (R、必ず更新)

| ファイル | 置換 |
|---|---|
| `AtenderTests/BuildVersionTests.swift` `testV1BundleVersionIs20` | `"20"` → `"21"` (関数名も `Is21`) |
| `AtenderTests/B17BuildVersionTests.swift` `testB61ProjectYmlBundleVersionIs20` / `testB61bInfoPlistMatchesProjectYml` | `"20"` → `"21"`、否定の `"19"` → `"20"` (関数名・コメントも) |
| `AtenderTests/B18HomeAndVersionTests.swift` V1 / V3 | 同上 (V2 は不変) |
| `AtenderTests/B20PrivacyManifestTests.swift` V1 / V2 / V3 | `"20"` → `"21"`、`#""19""#` → `#""20""#`、`XCTAssertLessThanOrEqual(value, 20)` → `21` |
| 上の 4 本のうち `CFBundleShortVersionString: "1.0"` / `"1.0"` を見る全アサーション | `"1.0"` → `"1.0.1"` (`project.yml` の `CFBundleShortVersionString: "1.0.1"` と一致させる。§2) |

`B20PrivacyManifestTests.testV2MinIOSBuildStays12AndNotAboveBundleVersion` の `XCTAssertEqual(value, 12)` は**デプロイ 1 では 12 のまま**。A2 ブランチで `21` に置換し、関数名を `testV2MinIOSBuildIs21AndNotAboveBundleVersion` に (§8.7)。

### 8.6 ベースライン台帳 (`.knowledge/known-failures.md`)

- **着手した最初のレーン (B を推奨) の Developer** が `apps/api` で `pnpm exec prisma generate` → `rm -rf tests/.tmp` → `pnpm exec vitest run` を 1 回走らせ、`b20-account-deletion` #D9〜#D14 の 6 件が緑になることを確認して、台帳の「環境依存」節に「生成済み Prisma Client が build 20 migration 前のまま (2026-10-09 01:35 生成)。`pnpm exec prisma generate` で解消。2026-10-29 確認」と記録する
- 緑にならなければ「未分類」として台帳に記録し Leader に報告 (未分類を残したままマージしない)
- iOS は各レーンの着手時に 1 回走らせて実数を台帳の iOS 節に記録 (削除したテスト数を差し引いた新しい基準)

### 8.7 削除・更新するテスト (A2、`chore/drop-calendar-api` だけで行う)

| ファイル (`apps/api/tests/`) | 処置 |
|---|---|
| `eventkit-legacy-pushes.test.ts`・`eventkit-sync-contract.test.ts`・`eventkit-sync.test.ts`・`personal-calendar-share.test.ts`・`personal-events-recurrence.test.ts`・`personal-events.test.ts`・`personal-occurrence-days.test.ts`・`roomEvent.test.ts`・`rrule-expand-jst.test.ts`・`recurrence-spec.test.ts` | ファイル削除 (`fixtures/ios-eventkit-sync-body.json` も) |
| `day-detail.test.ts` | `personalEvents` を作る・読むケースを削除し、「`personalEvents` キーが無い」(AD5) を 1 本追加。occurrence / 休講 / 授業変更のケースは残す |
| `roomWeek.test.ts`・`b17-room-week-semester.test.ts` | `roomEvents` のアサーションを「キーが無い」(AD4) に置換。他は不変 |
| `room.test.ts` | `:90` の `db.roomEvent.count` を削除 (モデルが無い)。`upcomingEvent` を見ていれば「キーが無い」(AD6) に置換 |
| `b20-account-deletion.test.ts` | #D9〜#D12 (ルーム予定の匿名化・projection) を削除。seed で RoomEvent / PersonalEvent / IcsImport / Share を作る行を削除。#D13〜#D15 (テンプレ) は残す |
| `b20-author-set-null-migration.test.ts` | #M1 / #M2 の `RoomEvent` に関する行を削除 (テーブルが無い)。`TimetableTemplate.authorUserId` の検証は残す。#M3 が migration を途中まで当てて検証する形なら不変、最新 schema 前提なら RoomEvent 部分を削除 |
| `occurrence-range.test.ts`・`class-transfers.test.ts` | **不変** (AD3 / AD7 の回帰。1 行も触らない) |
| `version.test.ts` | 不変 (`MIN_IOS_BUILD` から標本を導出しているので 21 に追従する) |
| `apps/ios/AtenderTests/B20PrivacyManifestTests.swift` `testV2…` | `XCTAssertEqual(value, 12)` → `21` (§8.5) |
| 新規 `a2-calendar-removed.test.ts` | AD1 (34 route をテーブル駆動で) / AD2 / AD4〜AD6 / AD10 / AD11 / AD12 |

### 8.8 削除・更新するテスト (A-Web、`apps/web/tests/`)

| ファイル | 処置 |
|---|---|
| `components/CalendarMonth.test.tsx`・`DayAgendaPanel.test.tsx`・`PeriodNav.test.tsx`・`PersonalEventEditModal.test.tsx`・`RecurrenceSpecPicker.test.tsx`、`lib/calendarEventDisplay.test.ts`・`expandUserTimetable.test.ts`・`personalEventDays.test.ts`・`usePersonalEventsCallsites.test.ts` | ファイル削除 |
| `components/DayDetailSheet.test.tsx`・`DayDetailSheet.review.test.tsx` | 予定の節のケースを削除。出欠・休講のケースは残す。「予定」見出しが無いこと (AW6) を 1 本追加 |
| `components/BulkEditSheet.test.tsx` | 終日予定の追加のケースを削除 (AW7) |
| `components/skeletons.test.tsx` | Calendar* / DayAgendaPanel のスケルトン 4 種のケースを削除 |
| `routes/Settings.test.tsx` | 不変 (Google / ICS 行を見ていない)。AW4 は新規ファイルで |
| `legal/legal-pages.test.ts` #L4 | 必須文言の配列から `"iPhoneのカレンダーから読み込んだ予定"` を外し、§10.3.1 の `"提供を終了しました"` を足す |
| `msw/handlers.ts` | カレンダー系 handler を削除 (AW8 は MSW の `onUnhandledRequest: "error"` 相当で検出。既存の設定が warn なら新規テストのファイル内だけ error にする) |
| `components/EventTile.test.tsx`・`AttendanceCalendar*.test.tsx`・`routes/SignIn.test.tsx` | 不変 (時間割・出欠カレンダー・Google ログインは残す) |

---

## 9. リリース順序 (2 段デプロイ)

**デプロイ 1 (TestFlight 配布と同時)**

1. B → C の順で main にマージ (additive migration 2 本)。A・A-Web は任意の時点でマージ
2. R: 版数 `CFBundleVersion "21"` / `CFBundleShortVersionString "1.0.1"`・版数テスト 4 本・DESIGN.md / CLAUDE.md 置換 (§10)・`fix/ics-esm-import` の廃棄 (§0.2) を main に
3. リリース前ゲート (Codex 2LLM 突合 + 負のコントロール)。負のコントロールの例: C12 で copy の削除を tx の外に出すと C12 が赤になる。C12c で occurrence 生成を tx の外 (commit 後) に戻すと C12c が赤になる (旧 UT が消え `copyCount` が増える)
4. **atender-api をデプロイ** (`POST $COOLIFY_API_BASE/deploy?uuid=vrdxzvmakcxieyhfhayz5r8r`)。`entrypoint.sh` が migrate 前に `prod.db.bak-<ts>` を残す。確認: `GET /healthz`、`GET /api/me` (Leader の手元 token) に `schoolName` キー、`GET /api/version` の `minIOSBuild == 12`
5. **atender-web をデプロイ** (`POST $COOLIFY_API_BASE/deploy?uuid=xxg31wshj6rhjmnffju1bg5r`)。確認: `/` にカレンダー切替が無い、`/settings/calendar` が `/settings` に飛ぶ、`/privacy` が §10.3.1 の文言
6. iOS build 21 (1.0.1) を archive → export → TestFlight upload。upload が version train の理由で拒否されたら `CFBundleShortVersionString` を確認 (§2)
7. 内部テスターで実機確認 (§12-L5)

**App Store 申請**

8. ASC で App Store version **1.0.1** を作成し build 21 を紐付けて審査提出 (`Muraki/scripts/asc.py`。審査メモ・スクリーンショットは 1.0 から引き継ぎ、カレンダー画面のスクショがあれば差し替える)。審査中の端末は本番 API (デプロイ 1 の状態) に繋がり、build 21 が使う endpoint は全て存在する

**デプロイ 2 (1.0.1 が `READY_FOR_SALE` になった後)**

9. ASC で version 1.0.1 の `appStoreState == READY_FOR_SALE` を確認してから、`chore/drop-calendar-api` を rebase → migration 名を付け直し (§3.12.4) → テスト → main にマージ
10. Coolify の atender-api に Google Calendar 同期の scheduled task があれば削除 (§3.12.2)
11. **atender-api をデプロイ**。確認: `GET /api/version` の `minIOSBuild == 21`、`db-stats` の前後ログで 9 テーブルが消え他の行数が不変 (AD10)、build 21 の端末で Home・学期・ルーム・書き出しが動く
12. Web はデプロイ 2 で変更が無ければ再デプロイしない。§10.3.2 の privacy 最終文言を同じ PR に入れた場合だけ atender-web もデプロイ

- デプロイ 1〜2 の間: App Store の build 20 は旧 endpoint を叩き続けて動く。Web からはカレンダーが消えているので、旧データ (ミラー・共有・ルーム予定) は build 20 の画面だけに出る
- デプロイ 2 の後: build 12〜20 は 426 で `VersionGateView` (更新を促す画面) に入る。build 21 未満の TestFlight 端末も同じ
- ロールバック: デプロイ 2 で問題が出たら、直前の `prod.db.bak-<ts>` と A2 マージ前の commit を再デプロイ (DROP 後に書かれた新規行は失われる。デプロイ 2 直後の確認 (手順 11) までを検証窓とし、以後は前進修正)

---

## 10. 正典の置換

### 10.1 `DESIGN.md`

| 箇所 | 現行 | 置換後 |
|---|---|---|
| §3.6.2 原則 1 行目 | 「時間割グリッドと月カレンダー (§3.6.3) が同じ定数を使う」 | 「時間割グリッドが `AtenderGridLine` の単一定義を使う」 |
| §3.6.3 全体 | 月カレンダー (personal / room) の規定 | 「**build 21 (2026-10-29) で Home / ルームの月カレンダーは撤去した** (Touri 裁定: カレンダー機能は時間割の iPhone カレンダー書き出しだけを残す)。再導入するときは build 20 時点の本節 (git `ebeade8:DESIGN.md`) を出発点にする。学期の出席カレンダーは §3.6.4」の 1 段落に置換 |
| §3.6.4 冒頭 | 「§3.6.3 の『表』とは別の部品」「`CalendarScreen` にも載せない」 | 「罫線を引かない (円形バッジの格子のため)」だけを残し、`CalendarScreen` の言及を削除 |
| §3.7.1 4 つ目の箇条 | 「switcher ピル (自分/クラス) と segmented (時間割/カレンダー) は nav bar の下…」 | 「context chip (自分 / ルーム) は nav bar の下・スクロールコンテンツの先頭に置く」 |
| §4 ホーム表の L2 | 「switcher / segmented」 | 「context chip」 |
| §4 学期・科目表の L1 | 「月カレンダーも `Radius.lg` + shadow のカード。内側は 1pt 罫線 (§3.6.3)」 | 「出席カレンダーは `Radius.md` + shadow のカード (§3.6.4)」 |
| §8 不採用案の月カレンダー関連 4 項目 (選択日の accent 丸 / gap 分離 / `TabView(.page)` / …) | 個別の不採用理由 | 「月カレンダーに関する不採用案は build 21 で部品ごと撤去したため削除 (git `ebeade8:DESIGN.md` §8 に残る)」の 1 行に置換 |
| §2 診断表 | 2026-07 時点の診断 | 変更しない (日付付きの記録) |

### 10.2 `projects/atender/CLAUDE.md`

- 「プロジェクト要約」の「Web 版 (`apps/web`) が機能の正典」は残し、その後に「カレンダー機能 (個人予定・ルーム予定・ICS・Google Calendar 連携・EventKit 読み込み) は build 21 で全面撤去。残るのは iOS の時間割の iPhone カレンダー書き出し (`GET /api/occurrences`) だけ」を足す (新領域)
- 「技術スタック」の認証行「Magic Link + Google OAuth」に「(Google はサインインのみ。Google Calendar 連携は build 21 で撤去)」を足す
- 「規約・やらないこと」の出欠ルール行を「出欠ルール (公欠等の扱い) は学校・学科でデフォ共有 + ユーザー個別上書き可。**科目ごとの基準 (必要出席率 / 欠席上限回数 / 遅刻換算) は `Course` に持つ (build 21)**」に置換
- 「バージョン更新」の版数を `CFBundleVersion: "21"` / `CFBundleShortVersionString: "1.0.1"` に置換し、build 21 の記録 (Delivery UUID は配布時に記入、デプロイ 1 / 2 の日付、`MIN_IOS_BUILD` 12 → 21) を先頭に足す。「次ビルドは "22"」に。「公開済みの App Store version と同じ ShortVersion の build は上げられない」(§2) を同じ箇条に 1 文
- 「互換を壊す変更」の箇条に A2 を実例として 1 文 (「App Store 公開中の build が叩く API を消すときは、新 build が `READY_FOR_SALE` になってから消す 2 段デプロイにする」)

### 10.3 Web の privacy.html / terms.html (実施確定)

#### 10.3.1 デプロイ 1 (A-Web に含める)

`apps/web/public/privacy.html` の「保存する情報」の箇条を次のように置換する:

- 「予定」(`:55`)・「iPhoneのカレンダーから読み込んだ予定」(`:56`)・「取り込んだカレンダー」(`:57`)・「Googleカレンダー連携」(`:58`) の 4 箇条を、次の 1 箇条に置換:
  > **終了した機能のデータ：**個人の予定の登録、iPhoneのカレンダーからの読み込み、カレンダーファイル（ICS）の取り込み、Googleカレンダー連携、ルームへの予定の追加と個人カレンダーの共有は、提供を終了しました。これらで保存していたデータ（予定のタイトル・日時・場所・メモ、読み込んだ予定の識別子、取り込んだファイルの本文、Googleのカレンダー名と予定）は、提供終了に伴い削除します。授業をiPhoneの「Atender」カレンダーへ書き出す機能は端末内で動作し、カレンダーの内容をサーバーに送信しません。
- 「認証情報」(`:53`) の「やGoogleカレンダーと連携した場合」を削除
- 「友達とルーム」(`:59`) から「ルームに追加した予定、ルームへの個人カレンダーの共有設定」を削除
- 利用目的 (`:66`) の「・予定」を削除
- 共有の箇条 (`:71`) の「ルームに個人カレンダーを共有した場合は…表示されます。」の文を削除
- 外部送信 (`:79`) の Google の箇条を「Googleでのサインインに利用します。」以降 (プロフィール画像・Google Fonts) だけに、(`:82`)「カレンダーの取り込み元」の箇条を削除
- 削除の箇条 (`:92`・`:96`) から「予定、iPhoneから読み込んだ予定、取り込んだカレンダー、Googleカレンダー連携」と「ルームに追加した予定（…）」「ルームに共有していた個人の予定とGoogleカレンダーの予定は削除します。」を削除
- 改定日 (ページ内の日付) をデプロイ 1 の日付に

`apps/web/public/terms.html:51` の「予定とカレンダーの管理、友達やルームでの予定の共有」を「友達やルームでの時間割の共有」に置換。

(行番号は `ebeade8` 時点。Developer は文言で探して置換する。)

#### 10.3.2 デプロイ 2 (A2 の PR に含める)

- §10.3.1 の「終了した機能のデータ」の箇条から「は、提供終了に伴い削除します」を「は削除しました」に置換 (A2 の DROP で事実になるため)。改定日を更新
- この 1 文の変更のために atender-web を再デプロイする (§9 手順 12)

---

## 11. 不採用案

| 案 | 却下理由 |
|---|---|
| **API のカレンダー削除を 1 段 (デプロイ 1) で行う** | App Store の build 20 が 1.0.1 承認まで数日間、カレンダー画面でエラーを出し続けるか、`MIN_IOS_BUILD = 21` を同時に上げれば審査が終わる前に全員 426 で締め出される (Leader 裁定) |
| A2 を feature flag (env で route を無効化) にして main に入れる | 「消したはずのコードが main に残り flag で隠れる」状態が数日続き、DROP migration は flag で止められない (migrate deploy は起動時に必ず当たる)。別ブランチなら main がいつデプロイされても build 20 は壊れない |
| A2 を「route 削除」と「DROP migration」の 2 コミットに分けて別々にデプロイ | route を消した時点で build 12〜20 は壊れる (426 も同時でないと意味が無い) ので、分けても利点が無い。テーブルだけ残す期間に得るものも無い |
| T1 / T2 (ミラー削除・共有停止) の iOS 移行コードを書く | A2 でテーブルごと消える。デプロイ 1〜2 の数日のための使い捨てコード (Leader 裁定) |
| Google サインインも一緒に消す | カレンダーではない。Web / iOS の Google ログインユーザーが締め出される |
| Web のカレンダー URL をそのまま 404 にする | Google OAuth の戻り先 (`/settings/integrations/google`) やブックマークが 404 になる。`/settings` への redirect で吸収 |
| EventKit を write-only にする | 専用カレンダーの再取得・既存イベントの更新/削除ができず、再書き出しで重複が積み上がる。サインアウト時の `wipeExport` も不能 (R §B2、`20260729-eventkit-dedicated-calendar-export.md` §13) |
| 個人予定の書き出しだけ残す (CRUD は消す) | 作れない予定を書き出す矛盾。Touri 裁定 (個人予定ごと撤去) |
| `ExportKind.personal` も消す | build 20 以前に書いた `atender://p/...` を「Atender 製」と認識できなくなり、カレンダーに永久に残る |
| 移行で端末カレンダーの個人予定を消さず放置 | 同上。消えるのは Atender カレンダー内の Atender 製の個人予定だけで、ユーザー自身のカレンダーは触らない (これは T1 と別物で、端末側の掃除なので A2 後も要る) |
| Home に書き出しの誘導バナーを残す | 要望「画面も設定項目も消して」に反する。書き出しは既定 ON で、権限は設定から 1 回許可すれば以後自動 |
| iOS で削除型の DTO を decode 互換のため残す | 本番から参照 0 の型が残るだけで、Codable は未知キーを無視するので互換に不要。build 18 で `TemplatesView` を消した方針と揃える |
| 科目ルールを `AttendanceRule` (学校・学科デフォルト) に持つ | Leader 裁定。大学は科目 (教員) ごとに違う (R §B1-3) ので科目単位が本命 |
| 科目ルールを `TemplateCourse` にも持たせ、公開・取り込みで引き継ぐ | 同級生の誤設定が黙って伝播する。取り込み後に各自がシラバスを見て設定する方が安全。要望が出たら足す (列追加だけで済む) |
| 回数の単位を限にする | ユーザーの頭は「授業回」(「3 回休んだ」)。2 コマ続きの授業を 2 回と数えると上限の入力値が教員の言う数とずれる |
| 授業回を「連続コマ」で区切る (同じ日の離れたコマを別の回にする) | 既存の「(M日)」表示と粒度が揃わない。同じ科目が 1 日に離れて 2 回ある時間割は稀 |
| 回数だけ設定した科目にも共通率を合成に使う | 大学の「欠席 5 回まで」(15 回中 66%) が共通率 70% (4 回まで) に上書きされ、科目の規定より厳しい嘘の値が出る (T3、Touri 承認済) |
| 「以上 / 超える」の境界を選ばせる | Touri 裁定で「上限回数まで OK」に固定。率は既存の floor 式 |
| 件数 endpoint / `?summary=1` | 提案は 20 件の一覧をそのまま表示に使うので件数だけの取得は不要。1 件 10 KB 未満 × 20 件で十分軽い |
| occurrence 生成を tx の外 (commit 後) に置く (本 doc の元案) | 生成が失敗すると、旧時間割と出欠記録は削除済み・`copyCount` も加算済みのまま戻らない (リリース前ゲートで Codex が指摘し再現済み。C12c)。生成を同じ tx に入れれば失敗時に何も変わらない。代償は tx が長くなることで、timeout を 60 秒に明示して吸収する |
| 取り込みを iOS で `DELETE` → `copy` の 2 リクエストにする | copy が失敗すると時間割と出欠を失ったまま残る。サーバーの 1 tx (`replaceExisting`) なら失敗時に何も変わらない (C12) |
| オンボーディングで「学期作成後に step 4 を足す」 | `isComplete` で Home に遷移するので到達しない (R §A4-1)。ローカルフラグで遷移を止める案も、遷移の起点が `refreshMe` に集約されていて順序で解けるので不要 |
| Home の学期メニューに「公開時間割を探す」 | 学期の切り替えメニューに操作が混ざる。入口は時間割の設定 (E2) と学期管理 (E1) で足りる |
| 2 段ピッカー (学校 → 学科 → 一覧) を主導線にする (旧 `TemplatesView` の復元) | 今回は登録済みの学校・学科からの自動提案が主。ピッカーは「別の学科を探す」の副導線として `SchoolDepartmentPicker` を共用する形で残した |
| テンプレに FK (`sourceUserTimetable` relation) を張る | SQLite で table 作り直しになる。ぶら下がり id は無害 |
| 既存の重複テンプレをサーバーで消す | データ削除。表示側の畳み込みで提案の質は確保できる (T4、Touri 承認済) |
| 作成者 handle を DTO に足してカードに出す | 学科単位で誰でも検索できる一覧に handle を出すと、同じ学科の誰が公開したかが分かる。要望に無い |

---

## 12. 判断が要る点

### 12.T Touri 裁定 (2026-10-29、確定)

| # | 論点 | 裁定 |
|---|---|---|
| T1 | EventKit 読み込みのサーバー上のミラー | 消す。**A2 の DROP で消える** (iOS 側の移行コードは書かない) |
| T2 | 有効な個人カレンダーのルーム共有 | 止める。**A2 の DROP で消える** (同上) |
| T3 | 欠席上限回数だけ設定した科目に共通率を合成で使うか | 使わない (§4.2.3) |
| T4 | 既存の重複テンプレ | 消さない (表示側で畳む) |
| — | カレンダー機能の範囲 | API と Web からも消す。残すのは iOS の時間割書き出し (自動同期トリガー含む) と `GET /api/occurrences` |

残る Touri 判断は無い。

### 12.L Leader の残論点

| # | 論点 |
|---|---|
| L1 | レーンの並列 / 直列 (§0.3。推奨は A ∥ A-Web ∥ B → C、A2 は B / C の後に書いてマージ保留) |
| L2 | デプロイ 1 で `CFBundleShortVersionString` を 1.0.1 に上げる前提 (§2)。R §A5 と食い違うので、TestFlight upload 時の挙動で確定させる |
| L3 | overall の「あと N 限休める」は共通率の限ベースのまま (回数ルールの科目でも共通率で数える)。科目別の表示と食い違うと感じたら別ビルドで「科目の合計」表示を検討 |
| L4 | デプロイ 2 の判断は「1.0.1 が `READY_FOR_SALE`」だけで行い、build 20 の利用者の更新率は待たない (426 の更新画面で誘導する)。待つ場合は手順 9 の条件を書き換える |
| L5 | TestFlight の実機確認項目: (a) build 20 で個人予定を書き出していた端末で、更新後に Atender カレンダーの個人予定が消え授業は残る (b) 「授業」OFF だった端末で書き出しが OFF になる (c) 権限の文言 (iOS の設定アプリ → Atender → カレンダー) (d) 新規アカウントのオンボーディングで提案が出て、取り込んだ時間割がホームに出る (e) 科目に上限 4 回を設定して一覧が「あと N回休める」になる (f) Web にカレンダーの画面・設定が無く、Google ログインは通る |
