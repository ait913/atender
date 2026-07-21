# ルーム時間割を recurring 週パターンで常時表示 (iOS 独自)

## 目的 (1-3行)

ルーム詳細の「時間割」タブが occurrence ベース (その週に実在する授業のみ) のため、学期範囲外の週やメンバー未登録で空になる。これを Home の時間割と同じ **recurring な週パターン (曜日 × 時限の典型的な1週間)** に変え、日付・学期に関係なく常時表示にする。**Web 版とは意図的に挙動を分岐させる (iOS 独自)。**

---

## なぜ Web と分岐するか (規約逸脱の明示)

CLAUDE.md の「IA と機能は Web と共有する (不変)」原則から、本機能は**意図的に外れる**。Web のルーム時間割は occurrence ベース (特定週の実データ) を正典とし続け、iOS のみ recurring 週パターンに変える。理由は Touri が選択肢から明示的に選んだプロダクト判断であり、iOS の利用文脈 (教室移動しながら「みんなの典型的な週」を素早く俯瞰する) では「実在する授業だけ」より「常に埋まった週グリッド」の方が有用なため。**この分岐は「機能の削除」でなく「同一機能の iOS 独自の表示モデル」**であり、backend は additive 変更 (既存 occurrence 契約を温存) で両モデルを同時に返すことで Web を一切壊さない。カレンダータブ (日付特化) は iOS でも Web と同じ occurrence ベースのまま。

---

## スコープ境界 (触る領域)

- **backend**: `getRoomWeek` の戻り値に `recurringMeetings[]` を **additive** で追加。既存 `meetings[]` (occurrence) / `roomEvents[]` / `members[]` は**一切変更しない**。schema migration なし (既存 `Meeting` / `Course` / `UserTimetable` / `User.defaultSemesterId` を読むだけ)。
- **iOS**: 時間割タブ (`RoomTimetable`) のみ `recurringMeetings[]` を消費するよう切替。カレンダータブ (`RoomCalendar` / `RoomCalendarLogic.buildCalendarEvents`) は `meetings[]` (occurrence) のまま**無変更**。
- **触らない**: 週ナビゲーション (カレンダータブ内にのみ存在。時間割タブには元々無い — `RoomDetailView.body:41-49` は tab で `RoomCalendar` か `RoomTimetable` を出し分けるだけ)。roomEvents。認証・課金・削除・migration。

---

## プロダクト判断: どの時間割を各メンバーから採用するか (★承認ゲート対象)

### 前提 (schema 確定事実)

`UserTimetable` は `@@unique([userId, semesterId])` (schema.prisma:272) — **1 ユーザー × 1 学期 = 1 時間割**。つまり「どの時間割か」は「**どの学期か**」に還元される。`User.defaultSemesterId` (schema.prisma:22, nullable) は、ユーザーが時間割を作成/コピーするたびに backend が自動でその学期に更新する (`userTimetables.ts:76` `data: { defaultSemesterId: timetable.semesterId }`)。= 「そのユーザーが今使っている学期」を表す。

### 採用案: 各メンバーの `defaultSemesterId` の時間割 (fallback: 最新作成の時間割)

メンバー M ごとに、recurring 表示に使う時間割を次の決定的規則で 1 つ選ぶ:

1. M の全 `UserTimetable` のうち `semesterId === M.defaultSemesterId` のものがあれば**それ**。
2. 無ければ (defaultSemesterId が null、または該当学期の時間割が無い)、M の**最も新しく作成された** `UserTimetable` (`createdAt` 降順の先頭)。
3. M が `UserTimetable` を 1 つも持たなければ、M は recurringMeetings に**何も寄与しない**。

**理由**: (a) `defaultSemesterId` は Home が自分の時間割を出すのに使う値そのもの (Home = 現在の学期の時間割)。ルームで各メンバーの defaultSemesterId を採ると「全員の**今**の時間割」= 素直な「典型的な1週間」になり、Home と意味論が一致する。(b) `defaultSemesterId` は作成/コピー時にしか動かないので、古い学期を閲覧編集しても表示が揺れない (updatedAt より安定)。(c) fallback (最新作成) は defaultSemesterId が null の移行期ユーザーでも空表示を避ける。

### 却下案

- **最新 `updatedAt` の時間割**: 却下。過去学期の時間割を 1 コマ直しただけで updatedAt が跳ね、ルーム表示がその過去学期に flip する。intent を表す defaultSemesterId の方が安定。
- **閲覧者 (viewer) の学期を全メンバーに適用**: 却下。メンバーは学校/学期暦が異なりうる。viewer の学期で揃えると、その学期の時間割を持たないメンバーが全員脱落し「常時表示」の目的に反する。
- **全学期の時間割をマージ**: 却下。同一曜日時限に複数学期の科目が重なり、意味のない「典型週」になる。
- **ルームに学期概念を新設**: 却下。schema migration が要り (認証/破壊的変更に隣接)、MVP 過剰。room は学期を持たない設計を維持する。

---

## データモデル

### backend zod (`packages/shared/src/schemas/room.ts`)

`RoomWeekDto` に `recurringMeetings` 配列を **additive** で追加する。`meetings` は**変更しない**。

```ts
export const RoomWeekDto = z.object({
  weekStart: z.string(),
  weekEnd: z.string(),
  members: z.array(z.object({ /* 無変更 */ })),
  meetings: z.array(z.object({ /* 無変更: occurrence ベース */ })),
  recurringMeetings: z.array(z.object({   // ★ 追加
    userId: z.string(),
    timetableId: z.string(),
    courseId: z.string(),
    courseName: z.string(),
    courseColor: z.string().nullable(),
    dayOfWeek: z.number(),        // 0=日 .. 6=土 (JS 標準、Meeting.dayOfWeek と同一慣習)
    startPeriodIndex: z.number(),
    periodCount: z.number(),
  })),
  roomEvents: z.array(RoomEventDto),
});
```

配置は zod object 内で `meetings` の直後、`roomEvents` の直前。挿入位置は wire 契約に影響しない (JSON key)。

### iOS Swift (`apps/ios/Atender/Core/Models/DTOs.swift`)

`RoomWeekDto` に nested struct `RecurringMeeting` と `recurringMeetings` フィールドを追加する。

**★ additive-safe の要件** (`gotcha/non-optional-dto-field-is-not-additive-for-callers.md` 準拠): 非 Optional フィールドの追加は wire では additive でも Swift の memberwise init 呼出しと decode fixture を壊す。既存 fixture (`roomWeek.json` / `roomWeekLive.json`) が key を欠いても decode が throw しないよう、**custom `init(from:)` で `decodeIfPresent ?? []`** にする。かつ memberwise init を**明示提供**し、新フィールドに default `[]` を与えて既存呼出し (`RoomLogicTests.swift:72`) を非破壊にする。

```swift
struct RoomWeekDto: Codable, Equatable {
    let weekStart: String
    let weekEnd: String
    let members: [Member]
    let meetings: [Meeting]
    let recurringMeetings: [RecurringMeeting]   // ★ 追加 (非 Optional。init(from:) で欠落を [] に)
    let roomEvents: [RoomEventDto]

    struct Member: Codable, Equatable, Identifiable { /* 無変更 */ }
    struct Meeting: Codable, Equatable { /* 無変更 */ }

    struct RecurringMeeting: Codable, Equatable {   // ★ 追加
        let userId: String
        let timetableId: String
        let courseId: String
        let courseName: String
        let courseColor: String?
        let dayOfWeek: Int          // 0=日 .. 6=土 (JS 標準)
        let startPeriodIndex: Int
        let periodCount: Int
    }

    // custom init(from:) を書くと合成 memberwise init が消えるため明示提供。
    // 新フィールドは default [] で既存呼出しを壊さない。
    init(weekStart: String, weekEnd: String, members: [Member], meetings: [Meeting],
         recurringMeetings: [RecurringMeeting] = [], roomEvents: [RoomEventDto]) {
        self.weekStart = weekStart
        self.weekEnd = weekEnd
        self.members = members
        self.meetings = meetings
        self.recurringMeetings = recurringMeetings
        self.roomEvents = roomEvents
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        weekStart = try c.decode(String.self, forKey: .weekStart)
        weekEnd = try c.decode(String.self, forKey: .weekEnd)
        members = try c.decode([Member].self, forKey: .members)
        meetings = try c.decode([Meeting].self, forKey: .meetings)
        recurringMeetings = try c.decodeIfPresent([RecurringMeeting].self, forKey: .recurringMeetings) ?? []
        roomEvents = try c.decode([RoomEventDto].self, forKey: .roomEvents)
    }
}
```

- `CodingKeys` は Codable 合成で自動生成される (プロパティ名と一致) ので手書き不要。`init(from:)` を書いても `Encodable` は合成のまま残る (RoomWeekDto を encode する箇所は iOS に無いが、Codable 準拠は維持)。
- **memberwise init の default `[]` により**、`RoomLogicTests.swift:72` の `RoomWeekDto(weekStart:...members:meetings:roomEvents:)` 呼出しは `recurringMeetings` を省略でき、**引数を足せば** recurring テストにも使える (下記テスト節)。

---

## API / 関数シグネチャ

### backend `getRoomWeek` (`apps/api/src/services/room.service.ts:285`)

シグネチャ不変: `getRoomWeek(userId: string, roomId: string, weekStart: Date)`。戻り値に `recurringMeetings` を追加する。既存の `members` / `meetings` (occurrence) / `roomEvents` の算出は**一切変更しない**。

追加ロジック (occurrence 取得の後、return の中):

```ts
// showMemberTimetables のゲートは occurrence と対称にする
const timetableUserIds = room.showMemberTimetables ? memberIds : [userId];

// 各対象ユーザーの defaultSemesterId
const users = await prisma.user.findMany({
  where: { id: { in: timetableUserIds } },
  select: { id: true, defaultSemesterId: true },
});
const defaultSemesterByUser = new Map(users.map((u) => [u.id, u.defaultSemesterId]));

// 対象ユーザーの全時間割 (meetings + course 同梱)。createdAt 降順で「最新が先頭」
const timetables = await prisma.userTimetable.findMany({
  where: { userId: { in: timetableUserIds } },
  include: { meetings: { include: { course: true } } },
  orderBy: { createdAt: "desc" },
});

// ユーザーごとに 1 つ選択 (defaultSemesterId 優先、無ければ最新 = 先頭)
const selectedByUser = new Map<string, (typeof timetables)[number]>();
for (const tt of timetables) {
  const current = selectedByUser.get(tt.userId);
  const def = defaultSemesterByUser.get(tt.userId) ?? null;
  if (!current) { selectedByUser.set(tt.userId, tt); continue; }        // 先頭 = 最新 (fallback)
  if (def && tt.semesterId === def) selectedByUser.set(tt.userId, tt);  // default 学期があれば上書き採用
}

const recurringMeetings = [...selectedByUser.values()].flatMap((tt) =>
  tt.meetings.map((m) => ({
    userId: tt.userId,
    timetableId: tt.id,
    courseId: m.courseId,
    courseName: m.course.name,
    courseColor: m.course.color,
    dayOfWeek: m.dayOfWeek,
    startPeriodIndex: m.startPeriodIndex,
    periodCount: m.periodCount,
  })),
);
```

- `recurringMeetings` は `weekStart` に**依存しない** (occurrence と違い日付を持たない)。同一ルームなら週を変えても内容不変。
- 並び順は保証しない (iOS 側 `buildRecurringEvents` が `dayOfWeek` → `startPeriodIndex` でソートする)。ただしテスト安定のため `courseColor` 等は選択時間割から決定的に決まる。

### iOS `RoomTimetableLogic.buildRecurringEvents` (`apps/ios/Atender/Features/Rooms/RoomLogic.swift`)

occurrence を消費する既存 `buildEvents(week:daySlots:)` を**削除**し、recurring を消費する新関数に**置換**する。`recurringMeetings` は `startPeriodIndex` / `periodCount` を native に持つため daySlots (分→スロット照合) は不要。

```swift
static func buildRecurringEvents(week: RoomWeekDto) -> [TimetableEventInput] {
    let members = Dictionary(uniqueKeysWithValues: week.members.map { ($0.userId, $0) })
    var seen = Set<String>()
    var events: [TimetableEventInput] = []
    for rm in week.recurringMeetings {
        let dow = DayConvention.jsToDisplay(rm.dayOfWeek)   // 0=日..6=土 → 1=月..7=日
        let key = "\(rm.userId):\(rm.courseId):\(dow):\(rm.startPeriodIndex)"
        guard seen.insert(key).inserted else { continue }
        let member = members[rm.userId]
        events.append(TimetableEventInput(
            id: key,
            dayOfWeek: dow,
            startPeriodIndex: rm.startPeriodIndex,
            periodCount: max(1, rm.periodCount),
            color: rm.courseColor ?? member?.color ?? "#F97316",
            title: rm.courseName,
            subtitle: RoomCalendarLogic.memberName(name: member?.name, handle: member?.handle),
            mergeKey: "\(rm.userId):\(rm.courseId)"
        ))
    }
    return events.sorted {
        if $0.dayOfWeek != $1.dayOfWeek { return $0.dayOfWeek < $1.dayOfWeek }
        return $0.startPeriodIndex < $1.startPeriodIndex
    }
}
```

- `resolveDaySlots(defaultSemesterId:timetables:)` と `defaultSlots` は**残す** (グリッドの行構造 = 時限ラベル/本数に必要)。`displayDays(events:)` も残す (TimetableEventInput ベースで recurring でもそのまま動く)。
- **既知の制約**: グリッドの行 (`periodIndexes`) は viewer の resolved daySlots に由来する (`TimetableGrid` の `eventLayer` は `periodIndexes.contains($0.startPeriodIndex)` でフィルタ)。あるメンバーの `startPeriodIndex` が viewer の daySlots の範囲外 (例: viewer は 5 限までだがメンバーが 6 限を持つ) の場合、そのコマは描画されない。これは occurrence 経路でも同等 (現状も viewer の daySlots に startMinute 照合していた) で挙動退行ではない。同一ルームのメンバーは同じ校時を共有する前提で許容する。

### iOS `RoomTimetable` view (`apps/ios/Atender/Features/Rooms/RoomDetailView.swift:381`)

`buildEvents(week:daySlots:)` 呼出しを `buildRecurringEvents(week:)` に差し替える。それ以外 (load の 3 並行 fetch、daySlots 解決、EmptyState / Panel 分岐、`TimetableGrid` 呼出し) は**据え置き**。

```swift
} else if let week {
    let events = RoomTimetableLogic.buildRecurringEvents(week: week)   // ★ 変更 (daySlots 引数を渡さない)
    if events.isEmpty {
        EmptyState(title: week.members.isEmpty ? "メンバーがいません" : "メンバーの時間割がまだありません")
    } else {
        TimetableGrid(
            daySlots: daySlots,           // 行構造は viewer の daySlots のまま
            events: events,
            days: RoomTimetableLogic.displayDays(events: events),
            available: available,
            todayDisplayDay: SchoolClock.displayDay(),
            currentPeriodIndex: TimetableGridLayout.currentPeriodIndex(daySlots: daySlots, nowMinute: SchoolClock.nowMinute())
        )
    }
}
```

- `load()` の `roomWeek(weekStart: mondayOf(today), force: true)` は**変更しない**。recurringMeetings は weekStart 非依存なので今日の月曜のままで一意。`me` / `timetables` fetch も daySlots 解決に引き続き必要なので残す。

---

## UI/UX

### 画面構成 (無変更部分の確認)

ルーム詳細 (`RoomDetailView`) の縦構成: `header` (大タイトル + 歯車) → `tabPicker` (カレンダー / 時間割) → タブ内容。タブは `.calendar` / `.timetable` の 2 つ。**週ナビゲーションはカレンダータブ (`RoomCalendar`) の内側にのみ存在**し、時間割タブには元々無い。本設計は時間割タブの中身 (グリッドのデータ源) だけを recurring に変える。

```
┌─────────────────────────────┐
│ 情報処理科ルーム        [⚙]  │  header (無変更)
│ みんなの予定共有             │
├─────────────────────────────┤
│ [ カレンダー ] [ 時間割 ]    │  tabPicker (無変更)
├─────────────────────────────┤
│  時間割タブ選択時:           │
│         月  火  水  木  金   │  TimetableGrid (recurring)
│  1限   ┌──┐        ┌──┐     │  ・日付なし「典型的な1週間」
│  2限   │A │        │B │     │  ・全メンバーの授業を常時表示
│  3限   └──┘  ┌──┐  └──┘     │  ・学期/週に依存せず不変
│  4限         │C │           │
│  5限         └──┘           │
└─────────────────────────────┘
```

### recurring グリッドと日付特化 roomEvents の整合

- **時間割タブ** = recurring (曜日 × 時限、日付なし)。`recurringMeetings` のみを描画。roomEvents (特定日付の「合同勉強会」等) は日付を持つため、**日付なしの recurring グリッドには載せない**。
- **カレンダータブ** = 従来どおり occurrence `meetings[]` + `roomEvents[]` を日付上に描画。**無変更**。週/月ナビもここに残る。
- → 2 つの表示モデルは**タブで明確に分離**される。「典型的な週の授業パターンを見る」= 時間割タブ、「特定日に何があるか (授業実体 + イベント) を見る」= カレンダータブ。ユーザーは既存の tabPicker でこれを切替える (新規 UI なし)。

### 複数メンバーの重なり表現 (調査済・破綻しない)

同一コマ (同 dayOfWeek × 同 startPeriodIndex) に複数メンバーの授業が入る場合、`TimetableGrid.eventLayer` (`TimetableGridPhaseB.swift:92-116`) は `"dayOfWeek:startPeriodIndex"` でグループ化し、**`HStack` で複数 `EventTile` を横並び**に描く。recurring でも各メンバーの授業は別 `TimetableEventInput` (異なる `mergeKey = userId:courseId`) なので、既存の横並び描画がそのまま機能する。`TimetableCoalesce` は同一 `dayOfWeek:mergeKey` の連続コマだけを縦結合するので、別メンバーは結合されない。→ **重なりは既存部品で表現済み、追加実装不要**。

### 空状態

- `week.members.isEmpty` (メンバー 0) → 「メンバーがいません」。
- メンバーは居るが全員が時間割を 1 つも持たない (`recurringMeetings` が空 → events 空) → 「メンバーの時間割がまだありません」。
- 文言は現行 `EmptyState` の 2 分岐を**踏襲**する (DESIGN.md §5 の ContentUnavailableView 化は本設計スコープ外。既存 `EmptyState` はマスコット資産を内包しており据え置く)。

### 状態管理

`RoomTimetable` (`@State week / daySlots / isLoading / loadError`) の構造は不変。データ源が `week.meetings` → `week.recurringMeetings` に変わるのみ。

---

## 挙動仕様 (Reviewer はここからテスト生成)

### backend (`getRoomWeek` → recurringMeetings)

各ケースの dayOfWeek は JS 標準 (0=日..6=土)。`setupCompleteUser` は既定で「水曜 (dayOfWeek=3)・1 限開始・2 コマ・科目 オペレーティングシステム (color #ffffff)」の meeting を 1 件持つ時間割を作り、その学期を defaultSemesterId に設定する (helpers/auth.ts:128-158)。

- **B1 正常系 (単一メンバー)**: setupCompleteUser で作った owner のみのルームで `getRoomWeek` → `recurringMeetings` に 1 件。`{ userId: owner, dayOfWeek: 3, startPeriodIndex: 1, periodCount: 2, courseName: "オペレーティングシステム", courseColor: "#ffffff", timetableId: <owner の tt> }`。
- **B2 週非依存**: 同ルームで `weekStart` を「学期範囲外」(例 `2027-01-04`) と「学期内」(例 `2026-04-06`) の 2 通りで呼ぶと、`recurringMeetings` は**両方で同一** (件数・内容一致)。← occurrence の `meetings[]` は学期外で空になるのと対照。
- **B3 複数メンバーの重なり**: owner (水1-2 科目X) と、別 setup ユーザー memberB (水 2 限に科目Y の meeting を追加した時間割) をルームに入れる → `recurringMeetings` に owner の水1-2 と memberB の水2 が両方含まれる (userId で区別)。
- **B4 defaultSemesterId 優先選択**: あるメンバーが 2 学期分の時間割を持ち (semesterOld 作成が先・semesterNew が後)、defaultSemesterId = semesterOld を指す場合、`recurringMeetings` は **semesterOld の時間割の meeting** を返す (最新 createdAt の semesterNew ではなく)。→ selectedByUser が default 学期を優先することの検証。
- **B5 fallback (defaultSemesterId=null)**: defaultSemesterId が null のメンバーが時間割を 2 つ持つ → **最新作成 (createdAt 降順先頭)** の時間割の meeting を返す。
- **B6 時間割なしメンバーは寄与しない**: 時間割を持たないメンバー (createTestUser のみで setup 未完了ではなく、setup 済だが timetable delete したケース等) はルームに居ても `recurringMeetings` に現れない。members には残る。
- **B7 showMemberTimetables=false**: `updateRoom` で false にすると、`recurringMeetings` は**閲覧者自身の meeting のみ** (他メンバーの授業は出ない)。occurrence `meetings[]` の既存ゲートと対称。
- **B8 既存契約の不変 (負のコントロール)**: 既存 roomWeek.test.ts の occurrence/roomEvents/members アサーションが**全て緑のまま**。`meetings[]` は occurrence ベースのままで、`recurringMeetings` 追加が既存 key を書き換えない。
- **B9 非メンバー/setup 未完了/未認証**: 既存の 403 NOT_MEMBER / 403 SETUP_REQUIRED / 401 UNAUTHORIZED / 400 INVALID_WEEK_START が**不変** (recurring 追加は認可の後段なので影響なし)。

### iOS `buildRecurringEvents`

recurringMeeting の `dayOfWeek` は JS (0=日)。期待 dow は display (1=月..7=日)。

- **I1 曜日/時限/連コマ写像**: `recurringMeeting(userId:"u1", courseId:"c1", courseName:"Math", courseColor:"#123", dayOfWeek:3, startPeriodIndex:1, periodCount:2)` (水曜) + member u1 → 1 件。`dayOfWeek==3` (水), `startPeriodIndex==1`, `periodCount==2`, `color=="#123"`, `title=="Math"`, `subtitle==member 名`, `mergeKey=="u1:c1"`, `id=="u1:c1:3:1"`。
- **I2 曜日変換の境界**: `dayOfWeek:0` (日) → display `7`。`dayOfWeek:6` (土) → display `6`。`dayOfWeek:1` (月) → display `1`。← `DayConvention.jsToDisplay` の写像を境界で確認。
- **I3 色 fallback**: `courseColor:nil` かつ member 有り → member.color。`courseColor:nil` かつ member 無し (`members` に無い userId) → `"#F97316"`。
- **I4 subtitle fallback**: member.name 有り → name。name 無し handle 有り → handle。両方無し → `"No name"` (RoomCalendarLogic.memberName に委譲)。
- **I5 複数メンバー同一コマ**: u1 (水2 科目Y) と u2 (水2 科目Z) → 2 件返る (別 id / 別 mergeKey)。dedup されない (userId が違う)。ソートは dayOfWeek→startPeriodIndex で安定。
- **I6 dedup**: 同一 `userId:courseId:dow:startPeriodIndex` の recurringMeeting が 2 件来ても 1 件に畳む (seen セット)。
- **I7 空**: `recurringMeetings: []` → `[]`。
- **I8 periodCount 下限**: `periodCount:0` の異常入力 → `max(1, ...)` で 1。
- **I9 ソート**: 金1・月3・水1 の順で来ても、返りは月3 → 水1 → 金1 (dayOfWeek 昇順、同日は startPeriodIndex 昇順)。

### iOS decode (`RoomWeekContractTests` / `DTODecodingTests`)

- **I10 recurringMeetings 有りを decode**: `recurringMeetings` を含む live fixture を repository 経由で decode → `week.recurringMeetings` が空でなく、先頭要素の `dayOfWeek` / `startPeriodIndex` / `courseName` が読める。
- **I11 recurringMeetings 欠落でも decode 成功 ([] になる)**: `recurringMeetings` key を持たない inline JSON (旧形状) を decode → throw せず `week.recurringMeetings == []`。かつ `week.meetings` / `week.members` は従来どおり読める。← `decodeIfPresent ?? []` の検証 (別 inline JSON を使い、fixture は更新後の新形状に保つ)。
- **I12 既存 occurrence 契約の不変**: `week.meetings` / `week.roomEvents` / `week.members` の既存アサーションが全て緑のまま (contract test の他ケース)。

---

## テスト基盤

- **backend**: vitest。`apps/api/tests/roomWeek.test.ts` に B1-B9 を追記 (既存 describe 内に it を足す)。ヘルパは既存 `setupCompleteUser` / `createRoom` / `addRoomMember` / `createSemester` / `createUserTimetable` (helpers/auth.ts, seedRoom.ts) を使う。B4/B5 の「2 学期分の時間割」は test 内で `prisma.userTimetable.create` + `prisma.meeting.create` を直接呼んで構成する (occurrence 生成は不要)。B4 の createdAt 前後関係は 2 回目の create が後になるので自然に担保される (必要なら `createdAt` を明示指定)。
- **iOS**: XCTest。
  - `apps/ios/AtenderTests/RoomLogicTests.swift`: occurrence 版の 3 テスト (`testBuildTimetableEventsMapsDayPeriodSpanAndFields` / `...HandlesSundaySaturdaySpanAndFallbackColors` / `...DedupsByUserCourseDayAndPeriod`) を**削除**し、I1-I9 を検証する `buildRecurringEvents` テストに置換する。テストヘルパに `recurringMeeting(...)` ファクトリを追加し、`week(...)` ヘルパに `recurringMeetings: [RoomWeekDto.RecurringMeeting] = []` 引数を足す (memberwise init に対応)。`displayDays` テストは TimetableEventInput ベースなので不変。
  - `apps/ios/AtenderTests/RoomWeekContractTests.swift`: I10 (fixture の recurringMeetings decode) を追記。I11 (欠落 → []) は inline JSON で追加。
  - `apps/ios/AtenderTests/Fixtures/roomWeekLive.json`: `recurringMeetings` 配列を追加 (backend 新形状に合わせる。最低 1 要素、例: demo-user-ios の月1 プログラミング演習)。
- ベースライン: iOS 268 GREEN (known-failures 参照)。**非 Optional フィールド追加は memberwise init / decode fixture を壊しうる** (`gotcha/non-optional-dto-field-is-not-additive-for-callers.md`) ため、Reviewer は sandbox 外で `xcodebuild build-for-testing` を回し、**pass/fail 以前にコンパイルが通るか**を第一関門にする。memberwise init 呼出しは `grep -rn "RoomWeekDto(" apps/ios` = 1 箇所 (`RoomLogicTests.swift:72`) のみ。

---

## 触るファイル確定リスト

### backend
1. `packages/shared/src/schemas/room.ts` — `RoomWeekDto` zod に `recurringMeetings` array 追加。
2. `apps/api/src/services/room.service.ts` — `getRoomWeek` に recurringMeetings 算出を追加 (return に 1 key)。
3. `apps/api/tests/roomWeek.test.ts` — B1-B9 追記。

### iOS
4. `apps/ios/Atender/Core/Models/DTOs.swift` — `RoomWeekDto` に `RecurringMeeting` struct + `recurringMeetings` フィールド + custom `init(from:)` + 明示 memberwise init。
5. `apps/ios/Atender/Features/Rooms/RoomLogic.swift` — `buildEvents(week:daySlots:)` を削除し `buildRecurringEvents(week:)` に置換。`resolveDaySlots` / `defaultSlots` / `displayDays` は残す。
6. `apps/ios/Atender/Features/Rooms/RoomDetailView.swift` — `RoomTimetable.body` の `buildEvents(week:daySlots:)` 呼出しを `buildRecurringEvents(week:)` に差替え (1 行)。
7. `apps/ios/AtenderTests/RoomLogicTests.swift` — occurrence 版 3 テスト削除 → recurring 版に置換、`week()` ヘルパの memberwise init に `recurringMeetings` 引数追加、`recurringMeeting()` ファクトリ追加。
8. `apps/ios/AtenderTests/RoomWeekContractTests.swift` — I10/I11 追記。
9. `apps/ios/AtenderTests/Fixtures/roomWeekLive.json` — `recurringMeetings` 配列追加。

### 変更不要と確認済 (grep で母数確定)
- `apps/ios/AtenderTests/Fixtures/roomWeek.json` (`DTODecodingTests.swift:326` が decode) — `init(from:)` が `decodeIfPresent ?? []` なので key 欠落でも decode 成功。**更新不要**。
- `apps/ios/Atender/Features/Rooms/RoomLogic.swift` の `RoomCalendarLogic.buildCalendarEvents` (カレンダータブ) — `week.meetings` (occurrence) を使い続ける。**無変更**。
- 週ナビゲーション / `RoomCalendar` — 時間割タブと無関係。**無変更**。
- `RoomWeekDto(` memberwise init 呼出し = `RoomLogicTests.swift:72` の 1 箇所のみ (grep 済)。他に本番/テストの呼出しなし。

---

## 不採用案

- **`meetings[]` 自体を recurring 化 (occurrence の date を dayOfWeek に置換)**: 却下。既存 occurrence 契約 (roomWeek.test.ts の `occurrenceId` / `date` アサーション、カレンダータブの date 特化描画、Web の occurrence 依存) を破壊する。additive な別配列 `recurringMeetings` なら両モデルを同時に返せ Web を壊さない。
- **iOS DTO で `recurringMeetings` を Optional (`[RecurringMeeting]?`) にする**: 却下寄り。nil 分岐が全消費点に伝播する。非 Optional + `decodeIfPresent ?? []` の custom init なら消費側は常に配列を見られ、fixture 欠落にも耐える (gotcha の推奨「迷ったら Optional + default」も検討したが、消費点の nil 分岐増を避けるため custom init を採用)。
- **recurring グリッドに roomEvents を重畳表示**: 却下。roomEvents は特定日付を持ち、日付なしの typical-week グリッドに載せると「どの週の分か」が不定になる。日付特化情報はカレンダータブに集約する。
- **backend で「どの学期か」を viewer が選べる UI/param を新設**: 却下 (スコープ過剰)。各メンバーの defaultSemesterId 自動選択で「全員の今」を出すのが要望 (常時表示・ゼロ操作) に最短。将来ルームに学期概念を持たせたくなったら別 feature。
- **occurrence 版 `buildEvents` とテストを残す (dead code)**: 却下。時間割タブが消費しなくなり、occurrence→dayOfWeek 導出のテストは死にコードを検証する。削除して recurring 版に置換し、Reviewer が「なぜ緑が減ったか」を疑わずに済むよう本 doc に置換を明記した。
