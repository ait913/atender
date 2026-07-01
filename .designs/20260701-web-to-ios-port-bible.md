# Atender Web → iOS SwiftUI 移植正典 (Port Bible)

> Researcher が Web ソース直読で作成した「忠実移植の正典」。Architect / Developer はこれと `apps/web` 実装を正典として設計・実装する。方針: **Web と完全一致**。スマホ独自の簡略化・IA改変・タブ再発明をしない。ファイル:行は `apps/` 相対。

## ★ 最重要の前提 (設計前に必読)

`router.tsx` の実態:

1. **Today / Timetable / Stats は独立画面ではない。** `/today` 無し、`/timetable`→`/`(router.tsx:67)、`/stats`→`/semester`(router.tsx:69) redirect。`routes/{Today,Timetable,Stats}.tsx` は現行ルーティングから切り離された旧実装。実機能は Home 内埋め込みへ移動:
   - 「今日の出欠」= Home の `SelfTodayCTA`(下部固定バー, components/home/SelfTodayCTA.tsx)
   - 「時間割」= Home の `SelfTimetableView`(components/home/SelfTimetableView.tsx)
   - 「出席率/統計」= `/semester` の `SemesterOverview`
   - → **iOS で Today/Timetable/Stats を別タブに作らない。Home を作れば足りる。**
2. **ボトムタブは5項目** (navItems.ts:10-16): ホーム(`/`) / 学期・科目(`/semester`) / ルーム(`/rooms`) / 友達(`/friends`) / 設定(`/settings`)。現行 iOS 3タブ(Today/Timetable/Settings)は全面作り直し。
3. **iOS の DTO ミラーは shared から drift 済み** (§3.12)。移植時に shared を正典に貼り直す。

---

## 1. デザインシステム (全トークン実値)

出典 `apps/web/src/styles.css`。dark が `:root` 既定 (3-142)、light は `:root[data-theme="light"]` 上書き (149-189)。

### 1.1 カラートークン (dark / light)

| トークン | dark | light |
|---|---|---|
| bg-base | `#0B0E14` | `#F9F9F9` |
| bg-muted | `#14181F` | `#F2F2F2` |
| bg-elevated | `#1A1F2A` | `#FFFFFF` |
| bg-overlay | `rgba(0,0,0,0.72)` | `rgba(15,23,42,0.40)` |
| text-primary | `#F5F6F8` | `#0F172A` |
| text-secondary | `rgba(245,246,248,0.72)` | `rgba(15,23,42,0.72)` |
| text-tertiary | `rgba(245,246,248,0.52)` | `rgba(15,23,42,0.58)` |
| text-on-accent | `#FFFFFF` | `#FFFFFF` |
| text-on-danger | `#FFFFFF` | `#FFFFFF` |
| border-subtle | `rgba(255,255,255,0.06)` | `rgba(15,23,42,0.08)` |
| border-default | `rgba(255,255,255,0.12)` | `rgba(15,23,42,0.14)` |
| border-emphasis | `rgba(255,255,255,0.28)` | `rgba(15,23,42,0.30)` |
| event-mix-target | `white` | `black` |
| accent-50 | `rgba(249,115,22,0.12)` | `rgba(234,88,12,0.10)` |
| accent-100 | `rgba(249,115,22,0.20)` | `rgba(234,88,12,0.18)` |
| accent-500 | `#F97316` | `#EA580C` |
| accent-600 | `#FB923C` | `#C2410C` |
| accent-700 | `#FDBA74` | `#9A3412` |
| status-present | `#34D399` | `#16A34A` |
| status-absent | `#FF5C7A` | `#DC2626` |
| status-excused | `#5AA9FF` | `#2563EB` |
| status-tardy | `#FFC93C` | `#D97706` |
| status-early | `#C685FF` | `#9333EA` |
| status-cancelled | `rgba(255,255,255,0.30)` | `rgba(15,23,42,0.40)` |
| status-suspended | `#94A3B8` | `#64748B` |
| status-none | `rgba(255,255,255,0.18)` | `rgba(15,23,42,0.18)` |
| friendship-pending | `#FFC93C` | `#D97706` |
| friendship-accepted | `#34D399` | `#16A34A` |
| friendship-blocked | `#FF5C7A` | `#DC2626` |
| room-event | `#C685FF` | `#9333EA` |
| room-availability-empty | `rgba(249,115,22,0.16)` | `rgba(234,88,12,0.14)` |

`--border-settings`: dark=border-default / light=border-subtle。

### 1.2 radius / shadow / その他
- radius: sm10 md18 lg24 xl28 full9999 timetable-cell8 (px)
- shadow (dark/light):
  - card dark `0 8px 24px rgba(0,0,0,.45),0 2px 6px rgba(0,0,0,.30)` / light `0 1px 3px rgba(15,23,42,.08),0 4px 16px rgba(15,23,42,.06)`
  - sheet dark `0 -16px 48px rgba(0,0,0,.65),0 -2px 8px rgba(0,0,0,.40)` / light `0 -6px 24px…`
  - glow dark `0 0 24px rgba(249,115,22,.45),0 0 48px rgba(249,115,22,.20)` / light `0 0 20px rgba(234,88,12,.32)`
  - glow-soft dark `0 0 16px rgba(249,115,22,.28)` / light `0 0 12px rgba(234,88,12,.22)`
  - settings-panel dark `none` / light `0 1px 2px rgba(15,23,42,.04)`
- z階層: base0 card-hover10 bottom-tab40 top-bar50 fab60 popover100 dropdown110 sheet-backdrop1000 sheet-content1010 modal-backdrop1100 modal-content1110 toast1200
- focus ring: accent-500 / 2px / offset 2px
- フォント: `--font-sans: "Inter","Noto Sans JP",system-ui,-apple-system,"Segoe UI",sans-serif`。html `font-size:14px`、body `line-height:1.4`
- dark body に radial-gradient 2枚のアンビエント (orange+purple blob, 266-271) — iOS でも背景グラデ再現要
- sheet アニメ: slide-up 220ms cubic-bezier(.16,1,.3,1) / overlay-fade-in 180ms

### 1.3 タイポ・スペーシング
- text scale (1.20): xs11 sm13 base14 lg17 xl20 2xl24 3xl30 4xl36 5xl44 (px)
- leading: tight1.1 snug1.2 normal1.4 body1.4 relaxed1.5
- weight: regular400 medium500 semibold600 bold700 black900
- spacing 8pt: 0_5=2 1=4 2=8 3=12 4=16 5=20 6=24 8=32 10=40 12=48 14=56 16=64 20=80
- セマンティック: page-px-mobile12 page-px-desktop24 card-padding12 card-padding-lg16 section-gap-mobile16 section-gap-desktop24 button-gap8 button-gap-destructive12 tab-bar-height64 tab-bar-content48 topbar-height-mobile48 topbar-height-desktop56 self-tt-chrome352 room-tt-chrome-top168 room-tt-chrome-bottom64
- sticky CTA padding-bottom: `max(12px, env(safe-area-inset-bottom))`

### 1.4 実タイポパターン
- PageTitle `text-3xl font-black tracking-tight md:text-4xl` + サブ `text-sm text-fg-secondary`
- ページ大見出し `text-2xl font-bold` (Rooms/Friends/RoomDetail)
- 出席率ヒーロー数値 `text-5xl font-black tabular-nums` + `%` `text-2xl font-bold`
- 科目カード率 `text-2xl font-black tabular-nums`
- Lyricカード限数字 `text-4xl font-black`、科目名 `text-lg font-black leading-tight`
- セクション見出し `text-sm font-bold` / `text-sm font-semibold text-fg-secondary`
- ボトムタブラベル `text-[10px] font-bold`、時間割曜日 `text-[11px] font-semibold`

### 1.5 現状 iOS DesignSystem との差分 (Web 実値へ直す)
- border-subtle: iOS dark .10/light .10 → Web dark .06/light .08 に**修正**
- 欠落追加: border-default/emphasis, bg-overlay, accent 50/100/600/700, status-suspended(#94A3B8/#64748B), friendship-*, room-*, room-availability-empty, radius-full, space 10/12/14/16/20, セマンティックspacing群, shadow card/sheet/popover/glow/glow-soft, body アンビエント radial-gradient
- Inter/Noto Sans JP 未バンドル (system font) → バンドル推奨
- 一致済: bg base/muted/elevated, text primary/secondary/tertiary, status present〜none/early, radius sm/md/lg/xl/timetableCell, text scale, space 0_5〜8

---

## 2. ナビゲーション / IA

### 2.1 レイアウト
`RootLayout`(routes/_root.tsx:5-9) が pathname 分岐: AuthLayout(`/signin /login /verify /setup`) / AppLayout(他)。AppLayout = SideNav(md+) + TopBar + Outlet + BottomTab(md-)。main `max-w-[920px] px-3 pb-20 pt-3`。iOS(モバイル): TopBar(sticky h48 `bg-bg-base/70 backdrop-blur-xl` safe-area-top) + BottomTab(fixed h64 `bg-bg-elevated/85 backdrop-blur-xl border-t` safe-area-bottom)。SideNav は iOS 不使用。

### 2.2 ボトムタブ (navItems.ts:10-16)
| # | ラベル | to | lucide | SF Symbols候補 |
|---|---|---|---|---|
| 1 | ホーム | `/` | Calendar | calendar |
| 2 | 学期・科目 | `/semester` | GraduationCap | graduationcap |
| 3 | ルーム | `/rooms` | Users | person.2 |
| 4 | 友達 | `/friends` | UserCircle | person.crop.circle |
| 5 | 設定 | `/settings` | Settings | gearshape |

アクティブ判定: `/` は完全一致、他は `pathname===to || startsWith(to+"/")` (`/rooms/123`→ルームタブ)。アクティブ表示: アイコンを `bg-accent-500 text-on-accent scale-105 shadow-glow` の h-10 w-10 rounded-xl で包む + ラベル `text-accent-500`。キーボード表示中は非表示。

### 2.3 全ルート (router.tsx)
| path | component | ガード | 種別 | 親タブ |
|---|---|---|---|---|
| /signin | SignIn | 既ログイン→`/` | AuthLayout | — |
| /verify | Verify | なし | AuthLayout | — |
| /setup | Setup | requireAuth | AuthLayout | — |
| /settings | Settings | requireCompleteSetup | AppLayout | 設定 |
| /settings/calendar | SettingsCalendar | 同上 | **push**(戻る) | 設定 |
| /settings/integrations/google | SettingsCalendar | 同上 | push | 設定 |
| / | Home | requireCompleteSetup | AppLayout | ホーム |
| /templates | Templates | requireCompleteSetup | AppLayout(直リンク) | — |
| /semester | SemesterOverview | requireCompleteSetup | AppLayout | 学期・科目 |
| /rooms | Rooms | requireCompleteSetup | AppLayout | ルーム |
| /rooms/$id | RoomDetail | requireCompleteSetup | **push** | ルーム |
| /rooms/join/$inviteCode | JoinRoom | requireCompleteSetup | push | ルーム |
| /friends | Friends | requireCompleteSetup | AppLayout | 友達 |
| /friends/add/$inviteCode | AddFriendByInviteCode | requireCompleteSetup | push | 友達 |

redirect: `/login`→`/signin`, `/me`→`/settings`, `/timetable`→`/`, `/stats`→`/semester`。ガード: requireAuth(401→`/signin`), requireCompleteSetup(`me.setupStatus.isComplete` 偽→`/setup`)。

### 2.4 push vs sheet
- push(NavigationStack): RoomDetail, SettingsCalendar(独自戻る→`/`), 招待着地2種
- BottomSheet/Modal(遷移でない): ほぼ全 CRUD (§4)。Setup はステップ切替(URL遷移なし)

### 2.5 現行 iOS 差分
MainTabView 3タブ→5タブ全面再構成。タブ内 NavigationStack 流用可。RootView の unknown/signedOut/signedIn 分岐流用可。SetupRequiredView(「Webでやれ」表示)は忠実移植ならアプリ内 Setup に差し替え。

---

## 3. ルート別 機能インベントリ

API は Web=cookie(client.ts:37)/iOS=Bearer(APIClient.swift:97-99)。

### 3.1 Home (`/`, components/home/Home.tsx)
縦 `space-y-3 pb-32`:
1. `ContextChips` — 「自分」+ルーム横スクロールchip+「＋」。選択で `border-accent-500 bg-accent-500/15 shadow-glow-soft`。＋で`/rooms`。data: useRooms
2. `HomeViewModeTabs` — 「時間割/カレンダー」ピルトグル
3. self×calendar のみ `HomeSemesterPicker`
4. `HomeBody` 4分岐: self×timetable→`SelfTimetableView` / self×calendar→`PersonalCalendar` / room×timetable→`RoomTimetable` / room×calendar→`RoomCalendar`
5. self×timetable のみ下部固定 `SelfTodayCTA`

**SelfTimetableView**: useUserTimetables から該当学期選択。上部 HomeSemesterPicker+設定歯車。本体 TimetableView。操作: 空セルtap→ensureTimetable(無ければ useCreateUserTimetable 自動生成)→MeetingEditModal(create) / 授業tap→MeetingDetailSheet→編集MeetingEditModal(edit)/削除useDeleteMeeting / 歯車→TimetableSettingsSheet
**PersonalCalendar**: month/week/day(CalendarSegmented)+PeriodNav。data: useUserTimetables+useSemesters+useSemesterOverview(出欠日状態)+usePersonalEvents。meeting を expandUserTimetable で日付展開し個人予定とマージ。month=CalendarMonth+DayAgendaPanel, week=CalendarWeek, day=CalendarDay
**SelfTodayCTA**: useTodayOccurrences。0件非表示。MainAttendanceCTA。操作 useMarkAllPresent/usePatchAttendance。403 SETUP_REQUIRED→`/setup`。トースト2600ms

### 3.2 `/semester` SemesterOverview
header: HomeSemesterPicker+期間 `M/D〜M/D`。`AttendanceRateHero`(今日まで出席率)。2カラム: `AttendanceCalendar`(月+複数選択)/科目一覧(`CourseListItem`×N)。複数選択時 `BulkActionBar`→`BulkEditSheet`。`CourseDetailModal`(全画面)/`DayDetailSheet`(日別)。data: useSemesterOverview(semesterId)→SemesterOverviewDto。既定 me.defaultSemesterId。
- **DayDetailSheet**: その日の休講(useCreateTimetableSuspension/delete)、授業ごと6状態+未記録(usePatchAttendance/useDeleteAttendance)、科目単位休講(useCreateCourseSuspension/delete)、一括出席(useBulkMarkAttendance FILL/OVERWRITE自動)、個人予定CRUD(useDeletePersonalEvent+PersonalEventEditModal)
- **CourseDetailModal**(全画面): 科目編集(CourseEditModal)、CourseSuspensionSection、CourseOccurrenceHistory、DangerZone(削除)

### 3.3 `/rooms` Rooms
見出し+「リンクで参加」「作成」。useRooms。空→EmptyState。RoomCard グリッド→tap `/rooms/$id`。RoomCreateSheet/JoinByCodeSheet

### 3.4 `/rooms/$id` RoomDetail
useRoom(id)。見出し=room名+説明、歯車→RoomSettingsSheet。「カレンダー/時間割」トグル。
- **RoomCalendar**: 既定 day。useRoomMonth(週並列fetch)。AvailabilityBar。month/week/day。FAB2つ: ICS取込(IcsImportWizard)+予定追加(RoomEventCreateSheet)。event 色=member/author色
- **RoomTimetable**: useRoomWeek の RoomWeekDto.meetings(date+分) を daySlots に照合し periodIndex/dayOfWeek 逆算、TimetableView にメンバー色描画。daySlots は自分の時間割流用

### 3.5 `/friends` Friends
useFriendships。meId基準で received/sent/accepted/blocked 振り分け。FriendCard。アクション useFriendshipAction(accept/decline/cancel/block/delete)。追加 AddFriendSheet

### 3.6 `/templates` Templates (routes/Templates.tsx)
学校/学科/検索/学期4フィルタ、useTemplates。公開 usePublishTimetable。カードに copyCount/更新日、コピー useCopyTemplate。タブ導線なし・直リンク

### 3.7 `/settings` Settings
プロフィールカード(avatar+name+email+@handle)。セクション: アカウント(ProfileEditSheet/SchoolDeptEditSheet)、出席(RequiredRateSheet 既定70%/AttendanceRuleSheet/SemesterListSheet)、カレンダー連携(GoogleCalendarSection/`/settings/calendar` push)、表示(テーマ 自動/ライト/ダーク セグメント useTheme)、ログアウト(POST /api/auth/sign-out→queryClient.clear()→`/signin`)

### 3.8 `/settings/calendar` SettingsCalendar
戻る→`/`。GoogleCalendarSection。`?linked=1`→useCompleteGoogleLink。TitleRuleEditor

### 3.9 `/setup` Setup (アプリ内3ステップ)
Step1 学校選択/新規(useSchools+useCreateSchool)、Step2 学科(useDepartments+useCreateDepartment+patchMe)、Step3 学期作成(useCreateSemester→patchMe defaultSemesterId→`/timetable`)。都道府県固定リスト

### 3.10 認証
- SignIn: magic link(POST /api/auth/sign-in/magic-link{email,callbackURL}, 60秒クールダウン)、Google(POST sign-in/social→data.url遷移)
- Verify: `?token`→GET /api/auth/magic-link/verify→/api/me→isComplete で `/` or `/setup`
- iOS 既存: Apple/Google Sign-In + Keychain。magic link 未実装

### 3.11 全 API エンドポイント
me(GET/PATCH) / schools(GET/POST) schools/$id/departments(GET/POST) / semesters(GET/POST/PATCH/DELETE) semesters/$id/overview(GET) / user-timetables(GET/POST/PATCH) $id/publish-as-template(POST) / courses(POST/PATCH/DELETE) courses/$id/suspensions(GET/POST/DELETE) / meetings/bulk(POST) meetings/$id(PATCH/DELETE) / today(GET) / attendance/$occurrenceId(POST/DELETE) attendance/mark-all-present(POST) attendance/bulk(POST) attendance/bulk-clear(POST) / day/$date(GET) / stats(GET) / timetable-suspensions(GET/POST/DELETE + bulk/bulk-remove) / personal-events(GET/POST/PATCH/DELETE) / friendships(GET/POST/DELETE + $id/$action) / users/search(GET) / rooms(GET/POST/PATCH/DELETE + join/$id/leave/$id/invite/$id/members/$id/week/$id/events) / rooms/$id/ics-imports(+preview/commit) / rooms/$id/google-calendar-syncs(+run) / me/google-calendar/{connection,calendars,link/complete,sync-all} / me/ics-title-rules / timetable-templates(+$id/copy)

### 3.12 shared 型と iOS ミラーの drift (貼り直す)
正典 `packages/shared/src/schemas/`。iOS DTOs.swift drift:
- CourseStatsDto: shared(stats.ts:4-32)に generatedOccurrences/suspended/separateCounts/toDate{}/remainingCount/allowedAbsences/maxDayPeriods/allowedAbsenceDays。iOS は totalSessions(shared に無い)を持ち toDate系欠落
- SemesterOverviewDto.Overall: shared(semester.ts:46-58)に toDate{}/unrecordedCount/remainingCount/allowedAbsences。iOS は3フィールドのみ→全面追加
- AttendanceDaySummary.status enum 一致。UserTimetableDto.daysOfWeek 一致
- Room/Friendship/PersonalEvent/RoomEvent/DayDetail 系 DTO は iOS 未実装

---

## 4. 共有コンポーネント群

### 4.1 UIプリミティブ (components/ui/)
- Button: variant primary/secondary/destructive/ghost/danger、size sm/md/lg。`rounded-full font-bold`、primary=`bg-accent-500 shadow-glow-soft`、active `scale-.97`
- PageTitle: h1 `text-3xl font-black`+サブ
- Panel: `rounded-3xl bg-bg-elevated p-5 shadow-card`
- EmptyState: Mascot画像+title+説明+action。`min-h-64 rounded-3xl bg-fg-primary/4`
- Mascot: `/character/mascot-hello-1024.png`
- Input/Select/Field/NumberStepper/Toggle/Toast(下部)/ConfirmDialog/Skeleton(+skeletons/ 構造パリティ)
- labels: statusLabels(1字 出欠公遅早休)/statusLongLabels(2字)/ruleLabels/minutesToTime

### 4.2 モーダル/シート基盤 (iOS で最初に共通化)
- **BottomSheet** (sheet/BottomSheet.tsx): radix Dialog。モバイル下端シート(`bottom-2 w-[calc(100%-12px)] rounded-2xl`)、ドラッグハンドル+タイトル+×、任意footer、stackLevel 1/2(ネスト)、maxHeight min(92dvh,760px)+safe-area。→ iOS `.sheet`+`.presentationDetents`。3経路close(overlay/ESC/×)原則
- **FullScreenModal** (ui/FullScreenModal.tsx): createPortal 全画面 `bg-bg-base`、ヘッダ(戻る/タイトル/×)。→ iOS `.fullScreenCover` or push。CourseDetailModal で使用
- 各シート(BottomSheet上): MeetingCreateSheet/MeetingDetailSheet/MeetingEditModal, TimetableSettingsSheet/AttendanceRuleSheet/RoomSettingsSheet/SchoolDeptEditSheet/SemesterListSheet, BulkEditSheet/CourseEditModal/PersonalEventEditModal/DayDetailSheet, Room*Sheet/JoinByCodeSheet, AddFriendSheet, ProfileEditSheet/RequiredRateSheet, Google*Sheet
- **MeetingEditModal**(要): 科目select(＋科目追加でネスト CourseEditModal stackLevel2)、曜日、PeriodChips(複数=連続コマ)、教室。create=useCreateMeetingsBulk(startPeriodIndexes配列)/edit=useUpdateMeeting。連続コマ判定 isContiguous

### 4.3 時間割グリッド (components/timetable/, lib/)
- **TimetableView**: CSS Grid `44px+repeat(days,1fr)` × `28px+repeat(rows,1fr)`、高さ `calc(100dvh - self-tt-chrome - safe-area)`。coalesceTimetableEvents で連続結合、同一セル複数は横並び。曜日ヘッダ 月火水木金。**periodIndex ベース**(分ベースでない)
- TimetableGrid(5曜日固定 旧/週fallback, MeetingBlock)、DayList(モバイル日別, DayChipNav+DayMeetingCard/DayEmptyRow)
- **EventTile**: color-mix で tint背景+左pill、density compact/comfortable、title 2行clamp。→ color の 15%/70% ブレンド実装要
- lib: coalesceTimetableEvents / timetableCluster+calendarLane(重なりレーン) / timetableNormalize / dayConvention(曜日変換) / meetingExpansion(週→日付展開)

### 4.4 カレンダー (components/rooms/calendar/)
- CalendarMonth: 月グリッド7列、日付+状態ドット(dayStatusColor)+イベントchip(最大3,+N)。today/selected 強調
- CalendarWeek/CalendarDay、DayAgendaPanel(選択日リスト)、CalendarSegmented(月/週/日)、PeriodNav、AvailabilityBar(room)
- **AttendanceCalendar** (semester/): 出欠特化月カレンダー。各日 aspect-square rounded-lg border、statusVisual でアイコン(check/x/clock/ban/minus)+背景色+未記録破線。複数選択、個人予定ドット、前月/次月/今日、凡例、学期範囲外グレーアウト

### 4.5 出欠CTA/Today (components/today/)
- **MainAttendanceCTA**: 下部固定バー(`fixed bottom-[--tab-bar-height] z-40 backdrop-blur-xl`)。「今日は全出席(N)」+分割ドロップダウン(欠席/公欠/遅刻/早退一括)+個別修正パネル(各授業6状態)。unrecorded=0 で「記録完了済」
- **TimetableScroll+OccurrenceLyricCard**: Spotify歌詞風。現在授業中央固定、過去薄く上、未来下。useNow(60s)、scrollIntoView、ReturnToNowFAB。state past/current/next/future で opacity/scale/glow。※Today.tsx 専用(現行 Web `/` では非表示) — 忠実移植での扱い要確認

### 4.6 semester カード
- AttendanceRateHero: `text-5xl` 率+プログレスバー(必要率マーカー線)+「あとN限休める」+未記録警告バナー。色 rateColor(pct, requiredRate)
- CourseListItem: 科目名+未記録バッジ+率+ミニプログレス+「出N欠N・あとN限(N日)休める」
- BulkActionBar/BulkEditSheet: 複数日一括出欠/休講

---

## 5. iOS 現状の再利用可否

### 5.1 流用 (土台)
- Networking: APIClient(Bearer/401/エラーデコード)、APIEndpoint/APIConfig、APIError → 全エンドポイント追加で使える
- Auth: AuthStore(Apple/Google+Keychain+bootstrap/refreshMe/signOut)、KeychainStore → 流用。magic link 未実装
- RootView 状態分岐 → 流用。SetupRequiredView は忠実移植でアプリ内 Setup に差し替え
- DesignSystem 骨格 → §1.5 補正して流用
- 既存 DTO 一部(Me/SetupStatus/Semester/Occurrence/Today/UserTimetable/DaySlot/Meeting/AttendanceStatus/AttendanceDayStatus/MarkAttendance) → drift 補正して流用

### 5.2 作り直す
MainTabView(3→5)、TodayView/TimetableView/SettingsView/SemesterOverviewView と各VM(Web IA と別物)

### 5.3 新規
- 画面: Home(ContextChips/ViewModeTabs/PersonalCalendar/RoomTimetable/RoomCalendar)、Rooms/RoomDetail、Friends、Templates、Setup(3step)、SettingsCalendar、SignIn(magic link)、招待着地(Universal Links)
- DTO: Room系/Friendship/PersonalEvent/DayDetail/CourseSuspension/TimetableSuspension/Stats(toDate)/Template/School/Department/ICS/Google → shared から貼り直し
- 部品: BottomSheet/FullScreenModal 基盤、EventTile、TimetableView、カレンダー各種、AttendanceCalendar、MainAttendanceCTA、Lyricスクロール、Hero/CourseListItem、Skeleton群、Toast
- 状態管理: Web は TanStack Query の invalidation マトリクス(出欠変更で today/stats/semesters/day 無効化)+楽観更新。iOS は現状 VM 手動 load のみ→ **キャッシュ無効化/楽観更新の代替機構が新規に必要**

## 参考 knowledge
pattern/single-screen-compressed-timetable, pattern/spotify-lyrics-scroll-css-only, pattern/attendance-to-date-rate-and-allowed-absences, pattern/home-aggregated-context-switcher, pattern/modal-sheet-base-component-3way-close, pattern/theme-auto-resolve-data-theme-matchmedia, pattern/skeleton-structural-parity, gotcha/design-must-specify-swift-type-signatures
