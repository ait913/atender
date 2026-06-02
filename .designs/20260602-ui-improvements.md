# Atender フロント UI 改善 (5 項目)

## 目的

時間割・カレンダー・設定・テーマの 4 領域で、視認性と挙動の不具合を解消する。
(1) 連続コマの結合バグ、(2) コマ角丸の過大、(3) 個人カレンダーを TimeTree 風に — 自分の時間割を学期範囲に**クライアント展開して実授業 (科目名) を月/週/日カレンダーに並べ**、出席ステータスを副次シグナルとして重ねる、(4) 設定の Cloudflare 風細線化、(5) テーマ「自動」が OS に追従しない不具合 — をまとめて潰す。新規 API・DB スキーマは追加しない(項目 3 は既存フックの組み合わせ + pure 展開関数で実現、他は描画・トークン・クライアント state の改修に閉じる)。

---

## 全体方針・変更対象ファイル一覧

| 項目 | 主変更ファイル | 種別 |
|---|---|---|
| 1 連続コマ結合 | `apps/web/src/lib/coalesceTimetableEvents.ts` (新規), `apps/web/src/components/timetable/TimetableView.tsx`, `apps/web/src/components/home/SelfTimetableView.tsx`, `apps/web/src/components/rooms/RoomTimetable.tsx` | ロジック + 描画 |
| 2 コマ角丸 | `apps/web/src/components/event-tile/EventTile.tsx`, `apps/web/src/styles.css` (トークン追加), `apps/web/src/components/timetable/TimetableView.tsx`, `apps/web/src/components/timetable/TimetableGrid.tsx` | トークン + プロップ |
| 3 個人カレンダー | `apps/web/src/lib/meetingExpansion.ts` (`expandUserTimetable` 追加), `apps/web/src/lib/calendarEventDisplay.ts` (新規), `apps/web/src/lib/calendarRange.ts` (月グリッドレンジ helper 追加), `apps/web/src/components/home/PersonalCalendar.tsx`, `apps/web/src/components/rooms/calendar/CalendarMonth.tsx`, `apps/web/src/components/rooms/calendar/CalendarDay.tsx` (色 helper 共用化), `apps/web/src/components/rooms/calendar/DayAgendaPanel.tsx` (新規) | ロジック + 描画 |
| 4 設定細線化 | `apps/web/src/components/settings/SettingsSection.tsx`, `apps/web/src/components/settings/Settings.tsx`, `apps/web/src/styles.css` (トークン追加) | トークン + クラス |
| 5 テーマ自動 | `apps/web/src/lib/useTheme.ts`, `apps/web/src/styles.css` | ロジック + CSS 整理 |

---

# 項目 1: 時間割の連続コマ結合 (最重要)

## 1.0 TimetableView の公開 prop 契約 (設計レベルの公開インターフェース)

`TimetableView` は SelfTimetableView / RoomTimetable から呼ばれる共通描画コンポーネント。以下を**公開契約**として固定する (Reviewer の描画テストはこの prop 形を根拠に組む)。

```ts
export type TimetableEventInput = {
  id: string;
  dayOfWeek: number;        // 表示系 1=月..7=日 (DEFAULT_DAYS=[1,2,3,4,5])
  startPeriodIndex: number; // daySlots のいずれかの periodIndex と一致する必要がある
  periodCount: number;      // 1 以上。連続コマ数
  color: string;
  title: string;            // セルに表示されるテキスト
  subtitle?: string;
  mergeKey?: string;        // 同一性キー (coalesce 用)。Self=courseId, Room=userId:courseId
};

export type TimetableViewProps = {
  daySlots: DaySlotDto[];   // DaySlotDto = {periodIndex, label, startMinute, endMinute, isBreak}
  events: TimetableEventInput[];
  days?: number[];          // 既定 [1,2,3,4,5]。event.dayOfWeek がこの配列に含まれないと描画されない
  onEventClick?: (eventId: string) => void;
  onEmptyCellClick?: (dayOfWeek: number, periodIndex: number) => void; // 第1引数は number (曜日番号)
  height?: string;
};
```

> ここの `dayOfWeek` は **表示系 1=月..7=日** で、項目 3 が扱う `MeetingDto.dayOfWeek` (格納値 0=日..6=土) とは**別系統**。混同しないこと (3.1 dayOfWeek 規約参照)。

### 描画テスト作成時の必須前提

- **イベントが描画される条件**: `event.dayOfWeek` が `days` (既定 `[1,2,3,4,5]`) に含まれ、**かつ** `event.startPeriodIndex` が `daySlots` のいずれかの `periodIndex` と一致すること。この 2 条件のどちらかを満たさない event は描画されない。
  - テストは必ず `daySlots` を `{periodIndex:1,label:"1限",startMinute:540,endMinute:630,isBreak:false}` のように **periodIndex 付きで与え**、`events` の `startPeriodIndex` をその `periodIndex` に合わせる。periodIndex を欠いた daySlots では `startRowIndex = periodIndexes.indexOf(startPeriodIndex)` が -1 になり描画されないため、テストが偽陰性になる。
- **`onEmptyCellClick` のシグネチャ**: `(dayOfWeek: number, periodIndex: number)` の **2 つの number 引数**で呼ばれる (オブジェクト 1 個ではない)。1.4 の挙動仕様「空セルクリックで `onEmptyCellClick(1, 1)`」はこの意味 — 第 1 引数が曜日番号 (表示系 1=月)、第 2 引数が periodIndex。テストは `expect(spy).toHaveBeenCalledWith(1, 1)` の形で assert する。
- **イベントブロックの DOM 位置**: イベントブロックは**グリッド直下の子**で、`style` に `grid-row: <n> / span <span>` を持つ (1.3 新方式)。継続行に空セル (EmptyCell) は出ない (継続セルは `occupiedSet` で空セル描画から除外される)。テストは「イベントブロックがセル div の子ではなくグリッド直下に居る」「継続セルに `+` ボタンが無い」を構造で assert する。

## 1.1 調査で判明した実態 (Leader 仮説の訂正含む)

- **作成フロー側 (API) は既に coalesce 済み**。`apps/api/src/services/meeting.service.ts` の `periodsToMeetings()` が `startPeriodIndexes` の連番をまとめ、`{startPeriodIndex, periodCount}` 単位の **1 meeting (periodCount>1)** として保存する。よって「月1+2 を同時選択」で新規作成した場合、DB 上は 1 meeting / periodCount=2 になっている。
- したがって Leader 仮説 (a)「periodごとに別 meeting で保存される」は**新規作成パスでは成立しない**。ただし以下のケースで「同一 (dayOfWeek, courseId) の隣接 period が別 meeting に分かれた状態」が起こり得るため、描画側 coalesce は必要:
  - 1 限だけ登録 → 後から 2 限を別操作で追加 (各操作が periodCount=1 の独立 meeting を生む)
  - テンプレ取り込み・既存データ
  - `RoomTimetable` は `RoomWeekDto.meetings` (date+minute) を slot 照合して `TimetableEventInput` に変換しており、隣接コマが別 event になり得る
- **真因の本体は描画側 (b)**: `TimetableView` の各セル `div` が `overflow-hidden` で、span を表現する `height: calc(span*100% + ...)` の absolute タイルがセル境界でクリップされ、縦長ブロックにならない。

→ **方針: 作成フロー (API) は変更しない。描画側に (1) coalesce ヘルパー + (2) CSS Grid row span 方式の 2 段で対処する。** 既存データを壊さない描画専用改修。

## 1.2 coalesce ヘルパー (新規 pure function)

`apps/web/src/lib/coalesceTimetableEvents.ts`

```ts
import type { TimetableEventInput } from "@/components/timetable/TimetableView";

/**
 * 同一 (dayOfWeek, mergeKey) かつ period が隣接する event を 1 ブロックに結合する。
 * mergeKey が未指定の event は結合対象外 (そのまま通す)。
 * 入力順は保持しないが、出力は (dayOfWeek asc, startPeriodIndex asc) で安定ソートする。
 */
export function coalesceTimetableEvents(
  events: TimetableEventInput[],
): TimetableEventInput[];
```

### 結合判定仕様 (mergeKey)

`TimetableEventInput` に **任意プロパティ `mergeKey?: string` を追加** (TimetableView の型に追記)。呼び出し側が「同一授業」の同一性キーを渡す。

- SelfTimetableView: `mergeKey = m.courseId`
- RoomTimetable: `mergeKey = ${meeting.userId}:${meeting.courseId}`

`mergeKey` が `undefined` の event は他と結合しない (id 単位でそのまま出力)。

### アルゴリズム (擬似)

```
1. mergeKey==undefined の event は merged 配列にそのまま push (結合対象外グループ)
2. mergeKey 有りの event を (dayOfWeek, mergeKey) でグルーピング
3. 各グループ内を startPeriodIndex 昇順ソート
4. 先頭から走査し、
   「次 event.startPeriodIndex == 現ブロックの (startPeriodIndex + periodCount)」
   なら現ブロックに吸収し periodCount を加算 (= 隣接)。
   隣接でなければ新ブロックを開始。
   結合時、id/color/title/subtitle は先頭 event のものを採用。
5. 全ブロックを集めて (dayOfWeek asc, startPeriodIndex asc) で安定ソートして返す
```

### 結合後の id 規約

結合ブロックの `id` は**先頭 event の id をそのまま使う** (クリック時に既存の `display.meetings.find(m => m.id === id)` が引けるよう、先頭 meeting の id を温存する)。複数 meeting が結合された場合でも代表 id は先頭の 1 件。

## 1.3 描画方式の作り直し (CSS Grid row span)

`TimetableView.tsx` を以下に変更する。

### 現状の問題点 (撤去対象)

- 各セル `div` の `overflow-hidden`
- `continuationSet` で 2 行目以降を「何も描画しない」枠だけ出す方式
- `height: calc(${span * 100}% + ...)` の absolute 拡張方式

### 新方式: イベントをグリッド直下の子として row span 配置

グリッドは `gridTemplateRows: 28px(header) + repeat(rowCount, 1fr)`。periodIndex は連続 1..rowCount を前提とせず、`periodIndexes` の配列 index で row を決める。

1. **背景セル層**: 従来通り「時限ラベル列 + 各 (day, period) の空セル」を罫線付きで敷く。ただし空セルは**イベントが乗らない位置のみ** `EmptyCell` / 罫線を描く。`overflow-hidden` はセル div から外す (グリッドコンテナ側の `overflow-hidden` は radius 効かせのため維持)。
2. **イベント層**: coalesce 後の各 event を、背景セルとは別に**グリッド直下の子**として配置:
   - `gridColumn`: `${dayColumnIndex + 2}`  (1 列目は時限ラベルなので +2。`days` 配列内の index を使う)
   - `gridRow`: `${startRowIndex + 2} / span ${span}`  (1 行目は曜日ヘッダなので +2。`startRowIndex` = `periodIndexes.indexOf(startPeriodIndex)`)
   - これにより 1 ブロックが N 行ぶち抜きで描画され、`overflow-hidden` クリップが起きない。
3. **side-by-side (同一開始セルに複数 event)**: coalesce 後も同一 (dayOfWeek, startPeriodIndex) に複数ブロックが残るケースを維持する。同一グリッドセル位置に複数子を置くと重なるため、**そのセル位置の event 群を 1 つのラッパー div (同じ gridColumn/gridRow span) に入れ、内部を `flex gap-0.5` で横並び**にする。span が異なる複数 event が同一開始セルに来た場合は、ラッパーの span は**最大 span** を採用し、内部各タイルは `h-full`。
   - 横並びグルーピングのキー: `${dayOfWeek}:${startPeriodIndex}`。
4. **EventTile** には `className="h-full w-full"` を渡す (従来の `absolute inset-0` は廃止)。

### 背景セルとイベント層の重なり順

イベント層はイベントが存在するセルを覆う。空セルクリック (`onEmptyCellClick`) はイベントが無いセルでのみ機能すればよいので、**イベントが乗るセルには `EmptyCell` を描画しない** (従来の `continuationSet` と `cellEvents` 判定を、coalesce 後の「占有セル集合」に置き換える)。

占有セル集合 `occupiedSet`: 各 coalesce 後 event について `startPeriodIndex .. startPeriodIndex+span-1` の全 period × dayOfWeek を登録。`occupiedSet` に含まれるセルには空セルを出さない。

### RoomTimetable との両立

`RoomTimetable` も同じ `TimetableView` を使う。RoomTimetable 側は events に `mergeKey` を付与し、`TimetableView` 内部で `coalesceTimetableEvents` を呼ぶ (TimetableView が coalesce の責務を持つ)。**coalesce は TimetableView の内部で 1 回だけ実行**し、SelfTimetableView / RoomTimetable は raw events + mergeKey を渡すだけ。これで両画面で破綻しない。

> RoomTimetable 既存の `seen` Map による重複集約 (週内同一コマの重複除去) は**そのまま残す** (coalesce とは責務が別: 重複除去 vs 隣接結合)。

## 1.4 挙動仕様 (Reviewer テスト根拠)

### coalesceTimetableEvents (pure / unit)

- 入力が空配列 → 空配列を返す。
- 単一 event (mergeKey 有り) → 同一内容 1 件を返す (periodCount 不変)。
- 同一 (dayOfWeek=1, mergeKey="c1") で startPeriodIndex=1(count1) と 2(count1) → **1 件に結合、startPeriodIndex=1, periodCount=2**。
- 同一 (dayOfWeek=1, mergeKey="c1") で 1(count1) と 3(count1) (間に 2 が無い) → 隣接しないので **2 件のまま**。
- 同一 (dayOfWeek=1, mergeKey="c1") で 1(count2) と 3(count1) → 1 の終端が 3 の手前 (1+2=3) なので隣接 → **1 件, startPeriodIndex=1, periodCount=3**。
- dayOfWeek が異なる同一 mergeKey の 1+1 → 結合せず **2 件**。
- mergeKey が異なる同一 day の隣接 period (1,2) → 結合せず **2 件**。
- `mergeKey=undefined` の event 2 件 (隣接 period 同一 day) → 結合せず **2 件** (素通し)。
- 結合後 event の `id` は先頭 (最小 startPeriodIndex) event の id。
- 出力は (dayOfWeek asc, startPeriodIndex asc) で安定ソートされている。

### TimetableView (render / RTL + jsdom)

> jsdom では `getBoundingClientRect`/`calc`/`dvh` は評価されない (既知 gotcha)。**style 属性の生文字列 (gridRow / gridColumn) と DOM 構造を assert する**。getComputedStyle に依存しない。

- daySlots 5 件 + events に dayOfWeek=1/startPeriodIndex=1/periodCount=2/mergeKey="c1" を 1 件渡す → 該当イベントブロックの DOM に **`grid-row` に `span 2` を含む** style が付く (例: `style` 文字列が `span 2` を含む)。
- 同条件で **継続セル (1:2) に `EmptyCell` (空セルの `+` ボタン) が描画されない**。
- 隣接する別 meeting 2 件 (day1, c1, period1 count1) + (day1, c1, period2 count1) を渡す → 結合され **EventTile (title) が 1 つだけ**描画される (2 つに分かれない)。
- 同一 (day1, period1) に mergeKey 違いの 2 件 → 横並びラッパー内に **EventTile が 2 つ**描画される (side-by-side 維持)。
- イベントが無い (day1, period1) セルで `onEmptyCellClick` が定義されていれば、空セルクリックで `onEmptyCellClick(1, 1)` が呼ばれる。
- `overflow-hidden` がイベントブロックを乗せる個別セル div に**付いていない** (クリップ回避の回帰防止: ブロックの親に `overflow-hidden` クラスが無いことを assert、もしくは gridRow span 子がセル div の子でなくグリッド直下に居ることを構造で assert)。

---

# 項目 2: 時間割コマの border-radius を 8px に

## 2.1 方針

`EventTile` は時間割 (`TimetableView`/`TimetableGrid`/`MeetingBlock`) と**カレンダー (`CalendarDay`/`CalendarWeek`) で共用**されている。`rounded-md` (=18px `--radius-md`) をグローバル変更するとカレンダー他に波及するため不可。

→ **EventTile に `radius` プロップを追加**し、時間割系のみ明示指定する。グローバルトークンは触らない。

## 2.2 トークン追加 (styles.css)

`:root` に**時間割コマ専用トークン**を 1 つ追加 (dark/light 共通で値は同じ):

```css
--radius-timetable-cell: 8px;
```

`@theme` ブロックには**追加しない** (Tailwind ユーティリティ化せず、style/var で当てるため)。他テーマブロック (light / [data-theme]) には radius は元々無いので追加不要。

## 2.3 EventTile プロップ追加

```ts
export type EventTileProps = {
  // ...existing
  radius?: string; // 例: "var(--radius-timetable-cell)"。未指定時は従来の rounded-md
};
```

実装: `rootClass` から `rounded-md` を**外し**、

- `radius` 指定あり → `rootStyle.borderRadius = radius`
- `radius` 未指定 → `rootClass` に `rounded-md` を付与 (従来挙動を完全維持)

`showPill` の左バー (`rounded-full`) は変更しない。

## 2.4 呼び出し側

- `TimetableView` の EventTile → `radius="var(--radius-timetable-cell)"`
- `MeetingBlock` の EventTile → `radius="var(--radius-timetable-cell)"`
- `CalendarDay` / `CalendarWeek` の EventTile → **変更しない** (radius 未指定 = rounded-md 維持)

## 2.5 グリッド外枠の radius

`TimetableView.tsx` (L67) と `TimetableGrid.tsx` (L21) のコンテナ外枠は現状 `rounded-md` (18px)。コマと外枠の二重角丸の整合のため、**外枠も `rounded-md` のまま維持** (外枠は表全体の角丸で、コマ内側の 8px とは役割が別。Touri 要望は「コマだけ 8px」なので外枠は対象外)。

## 2.6 挙動仕様

- `EventTile` に `radius="var(--radius-timetable-cell)"` を渡すと root 要素の `style` に `border-radius: var(--radius-timetable-cell)` が付き、`rounded-md` クラスは付かない。
- `radius` を渡さない `EventTile` は従来通り `rounded-md` クラスを持ち、style に borderRadius が付かない (カレンダー回帰防止)。
- `TimetableView` 経由で描画される EventTile root は `radius` 由来の style を持つ。
- styles.css に `--radius-timetable-cell: 8px` が定義されている。

---

# 項目 3: 個人カレンダーを TimeTree 風に (実授業をカレンダー展開)

## 3.1 データソースの作り直し (要望解釈の確定)

Touri 要望: 「TimeTree のように**中身まで**表示」「**多すぎる場合は省略**して下にタイル」。"多すぎる" は **1 日に複数の実授業 (科目) が並ぶ**前提であり、見たいのは **実際の授業 (科目名) がカレンダーに並ぶ TimeTree 体験**。

現行 `PersonalCalendar` は `useSemesterOverview` の `days[]` (1 日 1 件の出席ステータス集計) を `personal` イベント化していた。これでは 1 日 1 件しか出ず "多すぎる" が起きないため、要望を満たさない。

→ **方針転換**: 自分の時間割 (`UserTimetableDto`) を学期範囲に**クライアント側で日付展開**して実授業イベント (`MeetingEvent[]`) を生成し、これを月/週/日カレンダーの主データにする。新規 API・DB スキーマ変更は不要 (既存フックの組み合わせ + pure 関数追加に閉じる)。出席ステータス (`overview.days`) は**捨てず、副次シグナル**として日セルに重ねる (Atender は出席率追跡アプリなので両立が必須)。

### 使うデータ (すべて既存フック)

- `useUserTimetables()` → `UserTimetableDto[]`。`semesterId` 一致の 1 件を選ぶ。`meetings[]`(`{id, courseId, dayOfWeek, startPeriodIndex, periodCount}`)、`courses[]`(`{id, name, color, room, ...}`)、`daySlots[]`(`{periodIndex, label, startMinute, endMinute, isBreak}`)。
- `useSemesters()` → `SemesterDto` の `startDate`/`endDate` (YYYY-MM-DD)。学期範囲。
- `useSemesterOverview(semesterId)` → `days[]` (`AttendanceDaySummary {date, status, occurrenceCount}`)。出席ステータス + 休講 (`ALL_SUSPENDED`) / 授業なし (`NO_CLASS`) の日付シグナル。

### dayOfWeek の規約 (要確認事項を確定)

`MeetingDto.dayOfWeek` は **0=日, 1=月, … 6=土** (Zod は `min(0).max(6)`、`MeetingCreateSheet`/`MeetingDetailSheet` が `["日","月","火","水","木","金","土"]` を value=index で対応付け、`dayLabels[meeting.dayOfWeek]` で表示)。これは **dayjs の `.day()` (0=Sun..6=Sat) と完全一致**するので、日付 → 曜日判定は `dayjs(date).day() === meeting.dayOfWeek` でよい。

> 注意: `TimetableView`/`TimetableGrid` は `dayOfWeek = index+1` (1=月..7) の**別系統 1..7 番号**を内部 grid 表示用に使うが、これは表示専用で `MeetingDto.dayOfWeek` の格納値ではない。`expandUserTimetable` は格納値 (0..6) を扱う。混同しないこと。

## 3.2 新規 pure 関数 `expandUserTimetable` (meetingExpansion.ts に追加)

`apps/web/src/lib/meetingExpansion.ts` に追加する。既存 `MeetingEvent` 型をそのまま流用 (新フィールド不要)。

```ts
import type { UserTimetableDto } from "@atender/shared";

export type ExpandUserTimetableInput = {
  timetable: Pick<UserTimetableDto, "meetings" | "courses" | "daySlots">;
  /** 展開する日付範囲 (両端含む, "YYYY-MM-DD")。表示中のレンジに絞ってパフォーマンスを守る */
  rangeStart: string;
  rangeEnd: string;
  /** 学期範囲 (両端含む)。この外の日付は学期外として展開しない。省略時は範囲制限なし */
  semesterStart?: string;
  semesterEnd?: string;
  /** 日付 → 出席ステータス (休講/授業なし判定用)。省略可 */
  statusByDate?: Map<string, AttendanceDaySummary["status"]>;
};

/**
 * 自分の時間割を [rangeStart, rangeEnd] に日付展開して実授業イベントを返す。
 * - 各日付 × その曜日に該当する各 meeting を 1 イベント化。
 * - 開始/終了分は daySlots から解決:
 *     startMinute = daySlot(startPeriodIndex).startMinute
 *     endMinute   = daySlot(startPeriodIndex + periodCount - 1).endMinute
 * - statusByDate[date] === "NO_CLASS" の日は展開しない (休校・祝日等で授業が無い日)。
 * - statusByDate[date] === "ALL_SUSPENDED" の日は展開する (休講でも「予定された授業」は存在し、
 *   ユーザーは履歴として見たい)。休講マークは描画側 (CalendarMonth) が statusByDate を使って重ねる。
 * - semesterStart/End の外の日付は展開しない。
 * - daySlot が見つからない (periodIndex 不在) meeting はスキップ (壊れたデータの防御)。
 * 出力は (date asc, startMinute asc) で安定ソート。
 */
export function expandUserTimetable(input: ExpandUserTimetableInput): MeetingEvent[];
```

### MeetingEvent の各フィールド解決

- `kind`: `"meeting"`
- `userId`: `""` (個人時間割は自分なので空文字。CalendarDay の key 生成は `userId:courseId:startMinute` で衝突しないため空でも可)
- `memberName`: `"自分"`
- `memberColor`: `course.color ?? memberColor(courseId)` (既存 `memberColor` フォールバック)
- `courseId` / `courseName`: 対応 course から (`course.name`)。course が見つからない meeting はスキップ
- `courseColor`: `course.color`
- `date`: 展開した日付 "YYYY-MM-DD"
- `startMinute` / `endMinute`: 上記 daySlots 解決ルール

### アルゴリズム (擬似)

```
1. courses を id→course の Map に、daySlots を periodIndex→daySlot の Map にする
2. rangeStart..rangeEnd を 1 日ずつ走査 (dayjs add(i,"day"))
3. 各日付 d について:
   - semesterStart/End が指定され、d がその外 → skip
   - statusByDate.get(d) === "NO_CLASS" → skip
   - dow = dayjs(d).day()  (0..6)
   - timetable.meetings のうち meeting.dayOfWeek === dow を抽出
   - 各 meeting について:
       course = courseMap.get(meeting.courseId); 無ければ skip
       startSlot = slotMap.get(meeting.startPeriodIndex); 無ければ skip
       endSlot = slotMap.get(meeting.startPeriodIndex + meeting.periodCount - 1)
                 ?? startSlot (末尾 slot 欠損時は開始 slot で代用)
       MeetingEvent を push
4. (date asc, startMinute asc) で安定ソートして返す
```

> 学期半年ぶんを一括展開すると件数膨大になるため、**必ず表示中レンジ (`rangeStart`/`rangeEnd`) に絞る**。月表示なら表示月のグリッド全域 (前後はみ出し含む 6 週)、week/day はその週/日だけを範囲にする (3.4 配線参照)。

## 3.3 CalendarMonth 改修 (実授業チップ + 出席ステータス重ね)

### 入力 props (変更)

```ts
export function CalendarMonth({
  anchor,
  selectedDate,
  events,            // CalendarEvent[] (実授業 MeetingEvent が主)
  statusByDate,      // Map<string, AttendanceDaySummary["status"]> 出席ステータス (副次シグナル)
  onSelectDate,
  maxChipsPerCell = 2,
}: {
  anchor: Dayjs;
  selectedDate: string;
  events: CalendarEvent[];
  statusByDate?: Map<string, AttendanceDaySummary["status"]>;
  onSelectDate: (date: string) => void;
  maxChipsPerCell?: number;
});
```

### 出席ステータスの重ね方 (実授業 + ステータスの両立)

実授業チップが主役。出席ステータスは**日セル左下に小さな丸 (ドット)** で控えめに重ねる:

- `statusByDate.get(dateString)` を引き、`undefined`/`NO_CLASS` 以外なら日付番号の脇に `h-1.5 w-1.5 rounded-full`、`background = dayStatusColor(status)` のドットを 1 個出す。
- `dayStatusColor` は現行 `PersonalCalendar` 内の同名関数を `apps/web/src/lib/calendarEventDisplay.ts` (新規, 3.3 末尾) に移し、CalendarMonth / DayAgendaPanel / PersonalCalendar から共用する (重複撤去)。
- `ALL_SUSPENDED` (休講) の日: 実授業チップは出しつつ、ステータスドットは休講色 (`--color-status-cancelled`)。チップ自体への取り消し線等は今回スコープ外 (ドットで足りる)。

### 月グリッドをカード(タイル)に載せる

ルートを次に変更 (既存トークンのみ):

```
<div className="rounded-2xl bg-bg-elevated p-2 shadow-card">
  <div className="grid grid-cols-7 gap-px"> ...曜日ヘッダ + 日セル... </div>
</div>
```

### 日セルの中身 (TimeTree 風チップ = 実授業)

各日セル button を「上に日付番号 (+ ステータスドット)、下に実授業チップ縦積み」に変更:

- セル高さ: `min-h-16` (固定 h-10 をやめ、チップ 2 件 + 「+N」が入る高さ)。狭幅でも崩れないよう `min-h-16`、内容超過時は省略。
- 日付番号: 左上に `text-[11px] font-bold`。today は accent リング、selected は accent 背景 (既存ロジック踏襲)。3.3「出席ステータスの重ね方」のドットを日付番号の脇に置く。
- チップ: その日の events を `startMinute asc` 順 (expandUserTimetable が既にソート済) で `slice(0, maxChipsPerCell)` 件、各々 1 行チップ:
  - 形: `rounded-[4px] px-1 py-0.5 text-[9px] font-semibold leading-tight truncate`
  - 背景: `color-mix(in srgb, ${eventColor} 18%, var(--color-bg-elevated))`、文字: `text-fg-primary`
  - テキスト: `eventTitle(event)` = meeting なら `courseName`。`truncate` で 1 行省略。
- 超過分: `events.length > maxChipsPerCell` のとき最終行に `+{events.length - maxChipsPerCell}` を `text-[9px] text-fg-tertiary` で表示。
- 当月外 (inMonth=false): チップ・ドットは出さず日付番号のみ薄表示 (`text-fg-tertiary`)。

### 色・タイトル決定ヘルパー (新規 calendarEventDisplay.ts)

```ts
export function eventColor(event: CalendarEvent): string;
// meeting → memberColor (= course.color ?? memberColor(courseId)) / personal → authorColor /
// roomEvent → source 別 (GOOGLE_OAUTH=#38bdf8, ICS_*=#94a3b8, それ以外 authorColor)
export function eventTitle(event: CalendarEvent): string;
// meeting → courseName / それ以外 → title
export function dayStatusColor(status: AttendanceDaySummary["status"]): string;
// ALL_PRESENT→present / HAS_ABSENT→absent / HAS_TARDY→tardy / ALL_SUSPENDED→cancelled / 他→none
```

`CalendarDay.tsx` の `roomEventColor` と現行 `PersonalCalendar` 内の `dayStatusColor`/`dayStatusLabel` が重複するため、`apps/web/src/lib/calendarEventDisplay.ts` (新規) に `eventColor` / `eventTitle` / `dayStatusColor` / `dayStatusLabel` を切り出し、CalendarDay・CalendarMonth・DayAgendaPanel・PersonalCalendar から共用する (重複ロジック撤去)。`eventColor` の roomEvent 規則は CalendarDay 既存 `roomEventColor` と完全一致させ、CalendarDay も import に置換する。

## 3.3 選択日の予定リスト (「M/D の予定」タイル)

新規 `DayAgendaPanel.tsx`。`CalendarMonth` の**下** (PersonalCalendar 内、month モード時のみ) に表示。

```ts
export function DayAgendaPanel({
  date,            // "YYYY-MM-DD"
  events,          // その日の CalendarEvent[]
}: { date: string; events: CalendarEvent[] });
```

- ルート: `rounded-2xl bg-bg-elevated p-3 shadow-card space-y-2`
- ヘッダ: `dayjs(date).format("M/D")` + " の予定" → 例「6/2 の予定」 (`text-sm font-bold text-fg-primary`)
- events が空 → 「予定はありません」 (`text-sm text-fg-tertiary`)
- events 有り → 各 event を行: 左に色ドット (`eventColor`)、`eventTitle` (実授業なら科目名)、開始–終了時刻 (`startMinute`/`endMinute` を `HH:MM` 整形)。`startMinute asc` 順。`EventTile` の `comfortable` density 流用可。

## 3.4 PersonalCalendar 配線 (データソース差し替え)

現行の「`overview.days` を `personal` イベント化」を**撤去**し、以下に置き換える。

### データ取得 + 展開

```ts
const timetables = useUserTimetables();
const semesters = useSemesters();
const overview = useSemesterOverview(semesterId);

const timetable = timetables.data?.userTimetables.find((t) => t.semesterId === semesterId) ?? null;
const semester = semesters.data?.semesters.find((s) => s.id === semesterId) ?? null;

// 出席ステータスを日付 Map に
const statusByDate = useMemo(() => {
  const m = new Map<string, AttendanceDaySummary["status"]>();
  for (const d of overview.data?.days ?? []) m.set(d.date, d.status);
  return m;
}, [overview.data?.days]);

// 表示中レンジを viewMode から決める (展開範囲を絞る)
const range = useMemo(() => {
  if (viewMode === "month") {
    const gridStart = mondayOf(anchor.startOf("month"));            // CalendarMonth と同じ前後はみ出し計算
    const gridEnd = gridEndOf(anchor);                              // 6 週グリッド末尾
    return { start: gridStart.format("YYYY-MM-DD"), end: gridEnd.format("YYYY-MM-DD") };
  }
  if (viewMode === "week") {
    const ws = weekStarts[0] ?? selectedDate;
    return { start: ws, end: dayjs(ws).add(6, "day").format("YYYY-MM-DD") };
  }
  return { start: selectedDate, end: selectedDate }; // day
}, [viewMode, anchor, weekStarts, selectedDate]);

const events = useMemo<CalendarEvent[]>(() => {
  if (!timetable || !semester) return [];
  return expandUserTimetable({
    timetable,
    rangeStart: range.start,
    rangeEnd: range.end,
    semesterStart: semester.startDate,
    semesterEnd: semester.endDate,
    statusByDate,
  });
}, [timetable, semester, range, statusByDate]);

const eventMap = useMemo(() => eventsByDate(events), [events]);
```

> `mondayOf` / 6 週グリッド末尾の計算は `CalendarMonth` 内のロジックと一致させる必要がある。レンジ計算ヘルパー (`monthGridRange(anchor)` 等) を `apps/web/src/lib/calendarRange.ts` に切り出し、CalendarMonth と PersonalCalendar で共用する (グリッドと展開範囲のズレ防止)。

### レンダリング

```
viewMode === "month" ? (
  <>
    <CalendarMonth anchor={anchor} selectedDate={selectedDate} events={events}
      statusByDate={statusByDate} onSelectDate={selectDate} />
    <DayAgendaPanel date={selectedDate} events={eventMap.get(selectedDate) ?? []} />
  </>
) : viewMode === "week" ? (
  <CalendarWeek weekStart={weekStarts[0] ?? selectedDate} selectedDate={selectedDate}
    eventsByDateMap={eventMap} onSelectDate={selectDate} />
) : (
  <CalendarDay date={selectedDate} events={eventMap.get(selectedDate) ?? []} />
)
```

- ローディング/エラー: `timetables`/`semesters`/`overview` のいずれかが loading → 読み込み中。`timetable` が見つからない (その学期に時間割未登録) → Panel「この学期の時間割がありません」。
- 日セルタップ (`onSelectDate` → `selectDate`) で `selectedDate` が更新され、DayAgendaPanel の中身が即切り替わる (既存 state フロー流用)。
- **week / day モードは維持** (`CalendarSegmented` も維持)。データソースが実授業 `MeetingEvent` に変わるだけで、`CalendarWeek`/`CalendarDay` は既に `CalendarEvent[]` を描画できる (kind=="meeting" 分岐が既存) ため**コンポーネント側の改修は不要**。`expandUserTimetable` の出力がそのまま流れる。

## 3.5 レスポンシブ / 省略

- 全チップ・パネルタイトルに `truncate` (1 行省略)。
- 日セルは `min-w-0` + grid なので狭幅で潰れても overflow せず省略表示。
- `gap-px` で罫線風の極細隙間、セル内 `p-0.5`。

## 3.6 挙動仕様 (Reviewer テスト根拠)

### expandUserTimetable (pure / unit) — 実授業前提

固定 daySlots を用意する (例: periodIndex 1 = 09:00–10:30 → startMinute=540/endMinute=630、periodIndex 2 = 10:40–12:10 → 640/730、periodIndex 3 = 13:00–14:30 → 780/870)。courses に `{id:"c1", name:"数学", color:"#10b981"}`。

- **曜日展開**: meeting `{courseId:"c1", dayOfWeek:1(月), startPeriodIndex:1, periodCount:1}`、range = 月曜を含む 1 週間 (例 2026-06-01(月)〜06-07(日)) → **その週の月曜 (2026-06-01) にだけ 1 イベント**、他曜日には 0 件。`courseName="数学"`、`startMinute=540`、`endMinute=630`、`memberColor="#10b981"`。
- **複数曜日 (月水金)**: 同 course を月(1)/水(3)/金(5) に 3 meeting、range 1 週間 → 月・水・金の 3 日付にそれぞれ 1 件、計 3 件。
- **periodCount=2 の終了分**: meeting `{startPeriodIndex:1, periodCount:2}` → `startMinute=540` (slot1 開始)、`endMinute=730` (slot2 終了)。
- **NO_CLASS 日の除外**: statusByDate に該当日 = `"NO_CLASS"` → その日のイベントは 0 件 (他の該当日は出る)。
- **ALL_SUSPENDED 日は展開する**: statusByDate に該当日 = `"ALL_SUSPENDED"` → その日のイベントは**出る** (休講でも予定授業として表示)。
- **学期範囲外の除外**: semesterStart/End の外にある range 日付 → 展開されない。
- **range 外の除外**: meeting 該当曜日でも rangeStart..rangeEnd の外の日付には出さない。
- **course 欠損スキップ**: meeting.courseId に対応する course が無い → そのイベントはスキップ (例外を投げない)。
- **daySlot 欠損スキップ**: meeting.startPeriodIndex に対応する daySlot が無い → スキップ。
- **color フォールバック**: course.color が null → `memberColor(courseId)` の値が `memberColor` に入る。
- **ソート**: 出力は (date asc, startMinute asc)。同日に period1 と period2 の授業 → period1 が先。

### CalendarMonth (render / RTL + jsdom)

> jsdom は `color-mix`/`calc` を評価しない。**クラス名・DOM 構造・style 生文字列・テキスト**で assert する。

- events が 0 件の月 → 各日セルは日付番号のみ、チップ・「+N」を描画しない。
- ある日に実授業 events 3 件・`maxChipsPerCell=2` → その日セルにチップ 2 件 (各 courseName テキスト) + テキスト `+1`。
- ある日に events 1 件 → チップ 1 件、「+N」表示なし。
- 日セルをクリックすると `onSelectDate(その日付)` が呼ばれる。
- 当月外の日セルにはチップ・ステータスドットを描画しない。
- 月グリッドのルートに `bg-bg-elevated` と `shadow-card` (カード化) が付く。
- チップ要素は `truncate` クラスを持つ (長文 courseName 省略)。
- `statusByDate` に当日 = `"HAS_ABSENT"` → その日セルに `background: var(--color-status-absent)` 相当のステータスドットが描画される。`"NO_CLASS"`/未登録 → ドットなし。

### DayAgendaPanel (render)

- `events=[]` → 「予定はありません」を表示。
- events 有り → 各行に `eventTitle` (courseName) と開始–終了時刻 (`HH:MM`) が出る。
- selectedDate を変えると PersonalCalendar 経由でヘッダが `M/D の予定` (例 `6/2 の予定`) に変わり、その日の events が並ぶ。

### calendarEventDisplay (pure / unit)

- `eventColor`: meeting → memberColor、personal → authorColor、roomEvent(GOOGLE_OAUTH) → `#38bdf8`、roomEvent(ICS_FILE) → `#94a3b8`。
- `eventTitle`: meeting → courseName、roomEvent/personal → title。
- `dayStatusColor`: `"ALL_PRESENT"`→`var(--color-status-present)`、`"HAS_ABSENT"`→absent、`"ALL_SUSPENDED"`→cancelled、未知→none。

### CalendarWeek / CalendarDay (回帰)

- `expandUserTimetable` 由来の MeetingEvent (kind="meeting") を `eventsByDateMap`/`events` 経由で渡して、courseName と時刻が従来通り描画される (データソース変更でクラッシュしない回帰確認)。

---

# 項目 4: 設定まわりを Cloudflare 風に細く

## 4.1 方針

設定セクションのカードを「強い影 + 大角丸 + 太い divide」から「**極薄影/影なし + 中角丸 + 繊細な 1px 罫線**」へ。**設定画面に閉じた変更**にするため、他画面が使う `shadow-card`/`--radius-2xl` は触らず、**設定専用トークン**を足して `SettingsSection` でのみ参照する。

## 4.2 トークン追加 (styles.css)

`:root` (dark) と `[data-theme="light"]` / `@media light` の各ブロックに**設定パネル用トークン**を追加 (border は既存 `--color-border-subtle` を流用、影だけ専用):

```css
/* dark :root */
--shadow-settings-panel: none;          /* dark は影なし、border で分離 */
--border-settings: var(--color-border-default);  /* dark は少し見える罫線 */

/* light (@media と [data-theme="light"] 両方) */
--shadow-settings-panel: 0 1px 2px rgba(15, 23, 42, 0.04);  /* 極薄 */
--border-settings: var(--color-border-subtle);
```

`@theme` には追加しない (クラスではなく style/任意値で参照)。

## 4.3 SettingsSection 改修

```
<section>
  <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-fg-tertiary">{title}</h2>
  <div
    className="overflow-hidden rounded-lg border divide-y divide-border-subtle"
    style={{
      borderColor: "var(--border-settings)",
      boxShadow: "var(--shadow-settings-panel)",
      background: "var(--color-bg-elevated)",
    }}
  >
    {children}
  </div>
</section>
```

変更点:
- `rounded-2xl` → `rounded-lg` (24px → 16px。Cloudflare 風の控えめ角丸)
- `shadow-card` (強い影) → `--shadow-settings-panel` (dark: none / light: 極薄)
- 外周に 1px `border` (`--border-settings`) を追加 (Cloudflare の罫線囲み)
- `divide-y divide-border-subtle` は**維持** (行間の細罫線)
- セクション見出しを `font-bold`→`font-semibold`、`text-xs`→`text-[11px]` でトーンダウン

## 4.4 Settings.tsx のプロフィールカード

L32 のプロフィール `section` は `rounded-2xl ... shadow-card`。SettingsSection と統一するため:
- `rounded-2xl` → `rounded-lg`
- `shadow-card` → 同じく `border` + `--shadow-settings-panel` を style で適用、`border-[var(--border-settings)]` 相当を付与。

## 4.5 ThemeRow / その他

`ThemeRow` の pill タブ (`rounded-full bg-bg-muted`) は機能的セグメントコントロールなので**変更しない** (Cloudflare 化の対象はカード罫線・影であり、セグメントは別)。`HomeViewModeTabs` も**対象外** (ホーム画面のタブであり設定画面ではない。要望は「設定まわりのタブ/区切り」だが、設定画面に閉じる原則を優先し、設定画面内のカード区切りに限定する)。

## 4.6 挙動仕様 (Reviewer)

- `SettingsSection` のカード div が `rounded-lg` を持ち、`rounded-2xl`/`shadow-card` クラスを持たない。
- カード div に `border` クラスが付き、`style.borderColor` が `var(--border-settings)`、`style.boxShadow` が `var(--shadow-settings-panel)`。
- `divide-y` と `divide-border-subtle` は維持されている (行区切り罫線が残る)。
- styles.css に `--shadow-settings-panel` と `--border-settings` が dark / light 両ブロックで定義されている。
- 他画面が使う `shadow-card` トークン定義値は変更されていない (回帰防止: `--shadow-card` の値が既存のまま)。

---

# 項目 5: カラーモード「自動」を OS 追従させる

## 5.1 真因

`useTheme.ts` の `apply()` は auto 時に `data-theme` を**削除**し、CSS の `@media (prefers-color-scheme)` 任せ。matchMedia のライブ監視が無く、OS のダーク/ライト切替に追従しない。さらに styles.css は `:not([data-theme])` 系セレクタと `@media` の二重定義で、`data-theme` 常設に切り替えると齟齬が出る箇所がある。

## 5.2 useTheme.ts 改修

auto を **JS 側で実 light/dark に解決し、常に `data-theme` を明示セット**する。

```ts
export type Theme = "auto" | "light" | "dark";

const STORAGE_KEY = "theme";
const MQ = "(prefers-color-scheme: dark)";

export function readStored(): Theme; // 既存と同じ ("light"|"dark" のみ採用、他は "auto")

/** OS 設定を解決して実テーマを返す */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window === "undefined" || !window.matchMedia) return "dark"; // SSR/未対応は既定 dark
  return window.matchMedia(MQ).matches ? "dark" : "light";
}

/** 解決済みの light|dark を data-theme に常設 */
function applyResolved(resolved: "light" | "dark"): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
}

/** render 前 (main.tsx) の初期確定。FOUC 回避 */
export function initTheme(): void {
  applyResolved(resolveTheme(readStored()));
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStored);

  useEffect(() => {
    applyResolved(resolveTheme(theme));
    if (theme !== "auto") return;            // auto の時だけ OS 監視
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(MQ);
    const onChange = () => applyResolved(resolveTheme("auto"));
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);  // cleanup
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    if (typeof window === "undefined") return;
    if (next === "auto") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, next);
  };

  return { theme, setTheme };
}
```

ポイント:
- `data-theme` は**常に light か dark のどちらか**が入る (削除しない)。
- auto 選択時のみ matchMedia listener を張り、OS 変更で `applyResolved` を再実行 → ライブ反映。
- listener は effect cleanup で `removeEventListener` (theme 変更・unmount でリーク防止)。
- localStorage の保存値は従来通り auto 時は削除 (= 次回 readStored が "auto")。選択状態 (UI) は `theme` state が "auto"/"light"/"dark" を保持するので 3 択表示は正しく出る。

## 5.3 styles.css 整理 (data-theme 常設前提へ)

`data-theme` が常に立つ前提になるため、`@media (prefers-color-scheme)` の CSS は**実質発火しなくなる**。矛盾と冗長を解消する:

- **ライトトークン**: `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) {...} }` ブロックを**撤去**し、`[data-theme="light"]` ブロックのみ残す (JS が必ず data-theme を立てるため media query は不要)。
- **body の dark gradient** (L311-318 の `@media dark` + L319-324 の `[data-theme="dark"]`): `@media` 版を**撤去**し `:root[data-theme="dark"] body` のみ残す。
- **date/time picker icon の invert** (L334-340 の `@media dark` + L341-345 の `[data-theme="dark"]`): `@media` 版を**撤去**し `[data-theme="dark"]` のみ残す。
- `:root { color-scheme: dark }` (L4) はデフォルト宣言として残す (data-theme=light 時は `[data-theme="light"]` の `color-scheme: light` が上書き)。dark 明示用に `:root[data-theme="dark"] { color-scheme: dark }` を 1 行追加して対称化。

> media query を「フォールバックとして残す」案は不採用 (常設 data-theme と二重発火し、項目 5 の真因である齟齬を温存するため。下記不採用案参照)。

## 5.4 テスト環境の注意

`tests/setup.ts` が `window.matchMedia` を `matches:false` 固定 + `addEventListener: vi.fn()` でモック済み。Reviewer は項目 5 のテストで **matchMedia を上書きモック** (matches を可変にし、change イベントを発火できる stub) する必要がある。設計はこの前提を明記する。

## 5.5 挙動仕様 (Reviewer)

### resolveTheme (pure / unit, matchMedia stub)

- `resolveTheme("light")` → `"light"` (OS 無視)。
- `resolveTheme("dark")` → `"dark"` (OS 無視)。
- `resolveTheme("auto")` で matchMedia matches=true → `"dark"`。
- `resolveTheme("auto")` で matchMedia matches=false → `"light"`。

### initTheme / useTheme (jsdom)

- localStorage 空 (= auto) + OS dark stub で `initTheme()` 実行 → `document.documentElement` の `data-theme` が `"dark"`。
- localStorage="light" で `initTheme()` → `data-theme` が `"light"`。
- `useTheme()` で `setTheme("auto")` 後、OS が dark→light に変わり matchMedia の `change` を発火 → `data-theme` が `"light"` に更新される (ライブ追従)。
- `setTheme("dark")` → `data-theme` が `"dark"`、localStorage に `"dark"` 保存。`change` 発火しても auto でないので変化しない。
- auto 時にマウントした listener が、theme を非 auto に変えた / unmount した際に `removeEventListener` される (cleanup; spy で検証)。
- `data-theme` 属性が**いかなる状態でも削除されない** (常に light/dark のどちらか)。

### Settings ThemeRow

- 現在 theme が "auto" のとき「自動」ボタンが選択状態 (`bg-accent-500`)。light/dark も同様に選択表示。

---

## データ / 型変更まとめ

- **新規 API・DB スキーマ変更なし**。
- フロント型: `TimetableEventInput` に `mergeKey?: string` を追加 (項目 1)。`EventTileProps` に `radius?: string` を追加 (項目 2)。`useTheme` に `resolveTheme` export 追加 (項目 5)。
- 項目 3:
  - `meetingExpansion.ts` に `expandUserTimetable(input: ExpandUserTimetableInput): MeetingEvent[]` と `ExpandUserTimetableInput` 型を追加 (`MeetingEvent` 型自体は流用、変更なし)。
  - `calendarEventDisplay.ts` (新規) に `eventColor` / `eventTitle` / `dayStatusColor` / `dayStatusLabel` を追加。`CalendarDay.roomEventColor` と `PersonalCalendar` の `dayStatusColor`/`dayStatusLabel` は撤去してこれを import。
  - `calendarRange.ts` に月グリッドレンジ helper (`monthGridRange(anchor)` 等) を追加し、CalendarMonth のグリッド計算もこれに揃える。
  - `CalendarMonth` props に `statusByDate?: Map<string, AttendanceDaySummary["status"]>` / `maxChipsPerCell?: number` を追加。`events` は型変更なし (`CalendarEvent[]`)。
  - `PersonalCalendar` は `useUserTimetables`/`useSemesters` を追加で読み、`expandUserTimetable` で events を生成 (`useSemesterOverview` は statusByDate 用に残す)。

## テスト基盤

- フレームワーク: **Vitest 2 + @testing-library/react 16 + jsdom**、`tests/setup.ts` (jest-dom + msw server + matchMedia/scrollTo モック)。MSW でAPI モック、`tests/utils/render` の `renderApp` でルート描画。
- 配置:
  - pure 関数 (coalesceTimetableEvents / expandUserTimetable / eventColor / eventTitle / dayStatusColor / resolveTheme) → **新規 `apps/web/tests/lib/*.test.ts`** (現状 lib 単体テスト用ディレクトリは無いので新設)。
  - コンポーネント (TimetableView / CalendarMonth / DayAgendaPanel / SettingsSection / EventTile) → **新規 `apps/web/tests/components/*.test.tsx`** (RTL 直接 render、ルーター不要なものは renderApp を介さず `render` でよい)。
  - 既存ルートテスト (`tests/routes/Settings.test.tsx` 等) は破壊しない。Settings の Cloudflare 化はクラス変更のみなので既存テストの文言 assert に影響しないことを確認すること。
- jsdom 制約: `getBoundingClientRect`/`calc`/`dvh`/`color-mix` は評価されない。**style 属性の生文字列・クラス名・DOM 構造**で assert する (gotcha: jsdom-getboundingclientrect-zero)。
- 項目 5 は matchMedia stub を差し替えて検証 (setup.ts のモックを各テストで上書き)。

---

## 不採用案

- **項目 1 / 作成フロー (API) を変更して periodCount をまとめ直す案**: 却下。API (`periodsToMeetings`) は既に連番を coalesce 済みで、新規作成では問題が出ない。真因は描画クリップと「後付け別 meeting」なので、描画側 coalesce で既存データを壊さず解決できる。API 変更は migration リスクと iPhone client 互換の懸念があり過剰。
- **項目 1 / 従来の absolute 高さ拡張 (`calc(span*100%+...)`) を overflow 解除だけで活かす案**: 却下。セル境界をまたぐ absolute はグリッドの行高 `1fr` 依存で計算が脆く、side-by-side との両立も複雑。CSS Grid `grid-row: span N` がブラウザネイティブで堅牢かつ jsdom で style 検証しやすい。
- **項目 2 / `--radius-md` をグローバルに 8px へ変更**: 却下。カレンダー・他カードに波及する。専用トークン + EventTile プロップで時間割に限定。
- **項目 2 / className に `rounded-lg` を渡して上書き**: 却下。EventTile が `rounded-md` を rootClass にハードコードしており、後勝ちが CSS ソース順依存で不安定。明示 `radius` プロップで決定的に。
- **項目 3 / 月セルにステータスラベルのみ表示 (旧 doc 案)**: 却下。「データソースは `useSemesterOverview` の day ステータス集計のみ → 月セルに出せる中身はステータスチップ (出席/欠席あり) だけ」とスコープを下げていたが、これは Touri 要望「TimeTree のように中身まで表示・多すぎる場合は省略」を満たさない。"多すぎる" は 1 日に複数の実授業が並ぶ前提であり、ステータス集計は 1 日 1 件なので「多すぎる」が起きない。自分の時間割をクライアント展開すれば新規 API 無しで実授業を並べられるため、そちらを採用。
- **項目 3 / 月セルに実イベント一覧を出すため新規 API を追加**: 却下 (スコープ外)。`UserTimetableDto` (meetings/courses/daySlots) + `SemesterDto` (startDate/endDate) + `SemesterOverviewDto.days` は既存フックで取得済み。これらをクライアント側 pure 関数 `expandUserTimetable` で日付展開すれば、サーバ往復を増やさず実授業を生成できる。
- **項目 3 / 出席ステータスを完全に捨てて実授業だけ表示**: 却下。Atender は出席率追跡アプリで、Touri は出席状況も見たい。実授業チップを主役にしつつ、出席ステータスを日セルのドット (副次シグナル) として両立させる。
- **項目 3 / 学期全期間を一括展開してフィルタ**: 却下。半年ぶんを毎レンダリング展開すると件数が膨大 (週 N コマ × 26 週)。表示中レンジ (月グリッド 6 週 / 週 / 日) を `expandUserTimetable` の引数で受け取り、その範囲だけ展開する。
- **項目 3 / week・day モードも作り直す**: 却下。week/day は既に `CalendarEvent[]` の詳細タイムラインを描画でき、`expandUserTimetable` 出力 (kind="meeting") がそのまま流れる。データソース差し替えのみで改修不要。
- **項目 4 / 設定変更を `shadow-card`/`--radius-md` のグローバル調整で実現**: 却下。他画面のカードに波及する。設定専用トークン (`--shadow-settings-panel` / `--border-settings`) で設定画面に閉じる。
- **項目 4 / HomeViewModeTabs・ThemeRow も Cloudflare 化**: 却下。設定画面に閉じる原則を優先。セグメントコントロールは機能 UI で罫線整理の対象外。
- **項目 5 / `@media (prefers-color-scheme)` をフォールバックとして残す**: 却下。JS が常に `data-theme` を立てるため二重定義となり、項目 5 の真因 (media と属性の齟齬) を温存する。`[data-theme]` 単一系に統一する。
- **項目 5 / `data-theme` を auto 時に削除したまま matchMedia 監視だけ足す**: 却下。属性削除と media 依存の混在が齟齬源。常設 data-theme で CSS 経路を 1 本化する方が堅牢。

---

## knowledge 追記予定 (実装後 Architect/Leader)

- `pattern/` 既存の `single-screen-compressed-timetable.md` / `grid-table-borders-bp.md` に「連続コマは CSS Grid `grid-row: span N` で結合、描画前に pure な coalesce ヘルパーで隣接 period をまとめる」を追補 (項目 1)。
- `pattern/` に「テーマ auto を JS で解決して data-theme 常設 + matchMedia ライブ監視、CSS は media query を撤去し [data-theme] 単一系に統一」を新規 (項目 5)。
- `pattern/calendar-week-pattern-meeting-expansion.md` (既存) に「個人カレンダーは UserTimetable (meetings/courses/daySlots) + Semester 範囲をクライアントで日付展開して実授業 MeetingEvent を生成。RRULE 不要、dayOfWeek(0..6)=dayjs.day() 直結。展開は表示中レンジに絞る。出席ステータスは副次シグナルとして日セルに重ねる」を追補 (項目 3)。
- `Muraki/projects/atender/.knowledge/` に「`MeetingDto.dayOfWeek` の格納値は 0=日..6=土 (dayjs.day と一致)。`TimetableView`/`TimetableGrid` の 1..7 は grid 表示専用の別系統で混同注意」を記録 (項目 3 で確定した規約)。
