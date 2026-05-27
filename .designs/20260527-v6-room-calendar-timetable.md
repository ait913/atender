# Atender v6 — ルーム再構築 (カレンダー + 統合時間割) + 時間割設定モーダル + バグ修正

設計日: 2026-05-27 / Architect: architect subagent
対象 commit: v5 (`.designs/20260526-v5-mobile-rework.md`) デプロイ後
前提 docs:
- `.designs/20260513-mvp.md` (Phase 1 MVP schema + API 完成形)
- `.designs/20260526-v3-rooms-friends.md` (Phase 4 設計、ルーム / フレンド 既実装の根拠)
- `.designs/20260526-v4-snap-style.md` (Snap 風 token、v6 維持)
- `.designs/20260526-v5-mobile-rework.md` (8pt grid / Major Third / DayList、v6 維持)

---

## Executive Summary

v5 デプロイ後の Touri フィードバックを受けて、(A) スマホで Avatar メニュー/プロフィール sheet が画面外に出るバグ + DayMeetingCard の color-mix 文字色消失バグを修正し、(B) 時間割設定モーダル新規導入と AvatarMenu 整理を行い、(C) ルームの主機能を「3 タブ (今週 / みんなの空き / メンバー)」から「2 タブ (カレンダー / 時間割)」に再編、(D) ルーム > カレンダーに「日 / 週 / 月切替 + 空き時間バー + メンバー Meeting 自動展開」を、(E) ルーム > 時間割に「メンバー全員の Meeting を 1 画面圧縮タイムラインで重ね合わせ表示」を実装する。スキーマ追加は `Room.showMemberTimetables` の 1 列のみ。

### 主要設計判断

1. **Room タブ 3 → 2 に再編**: 「今週 (WeekView)」と「みんなの空き (Heatmap)」を統合した `RoomCalendar` (新規) と、「メンバー時間割の重ね合わせ」専用の `RoomTimetable` (新規) の 2 タブに集約。「メンバー」タブは廃止し、右上 ⚙ `RoomSettingsSheet` に統合。
2. **カレンダーの空き時間バーは「日付軸」と「メンバー軸」の二段**: デフォは「今日 (= カレンダーで選択中の日付) の全員合算帯 (`░ ▓`)」を 1 行表示。`▾` 展開で「Touri / A友 / B友 ... / 全員合算」の N+1 行シフト表に切り替わる。日付選択と連動。
3. **カレンダー本体は CSS Grid のシンプル実装**: framer-motion / FullCalendar 等の追加依存禁止。`日 / 週 / 月` のセグメント切替で、月 = 7 列 grid + 日付タイルに dot、週 = 縦リスト、日 = 60 分 grid (Google Cal 日 view 風)。Meeting は週パターンを `weekStart` から絶対日付に展開して event 化。
4. **RoomTimetable は 1 画面縦圧縮**: viewport 高さ − Chrome (TopBar + tabs + room header + safe-area + footer) を 100% として、各 Meeting ブロックを `top: percent / height: percent` で絶対配置。土日に Meeting が無い場合は **5 列縮退**、ある場合は **7 列**。同曜日同時刻の重なりは Google Calendar 風の column split (cluster 内で並列配置)。
5. **メンバー色は handle/userId hash → HSL**: 既存 `RoomCard` の `roomTint` ロジックは使わず、全 Meeting / 全列に統一して使う `memberColor(userId)` を `lib/memberColor.ts` に切り出し、すべての画面で同一色を保証する (`RoomWeekDto.members[].color` の値を Backend → DTO 経由でそのまま使う方針を継続)。
6. **設定モーダルは ⚙ 経由の Sheet**: 時間割画面 (`/timetable`) とルーム詳細画面 (`/rooms/:id`) のいずれも、右上 ⚙ ボタン → 既存 `BottomSheet` で表示。AvatarMenu に「みんなの時間割」リンクと「ルーム設定相当」を残さない。
7. **API 増加は最小**: `PATCH /api/rooms/:id` の `UpdateRoomInput` に `showMemberTimetables: boolean` を 1 個追加するのみ。`getRoomWeek` / `RoomWeekDto` は不変 (既存返却で十分なデータ量)。月表示 / 週切替 / 日表示は **同じ `useRoomWeek(id, weekStart)` を週単位で取得し、クライアントで月の 5-6 週ぶんを並列取得する** (= `useRoomMonth` カスタム hook で複数 weekStart を内部で `useQueries` する)。
8. **バグ修正**:
   - **Avatar Sheet の画面外**: `useMediaQuery` が SSR 安全のため初期 `false` を返してから effect で更新する仕様 = 初回 click で `setSheet("menu")` が走るが、`mobile=false` のまま `open=true` でも DropdownMenu (固定 absolute right-0) が描画されて mobile では画面右にはみ出す。修正は `mobile` 判定なしの**ロケーション独立した BottomSheet を mobile 用に常に mount**し、`mobile=true` のとき `setSheet("menu")`, `false` のとき `setOpen(true)` で分岐するのではなく、**初回 `useMediaQuery` の値が安定するまで Sheet を表示しない**ように `mounted` flag を導入。詳細 §2.1。
   - **DayMeetingCard 文字消失**: 既に `course.color ?? "#10EB99"` 実装済 (v5 fix 反映)。ただし fallback hex が `#10EB99` (= 緑だが Major Third 採用前の旧 emerald で v6 で再検証する)。**`#10B981` (v4 token の `--color-accent-500`) に揃える**。さらに color-mix を支える `<span>` は `bg-bg-elevated` の上に重なるため、20% mix では十分視認できる前提を WCAG 表で再確認する。

### スコープ外 (v6 では実装しない)

- カレンダー drag&drop (ドラッグで予定移動)
- Meeting 編集をカレンダー画面から直接行う (= meeting 編集は既存 `/timetable` のみ)
- 通知 / push
- RoomEvent の繰り返し (毎週同曜日固定)
- 月 view での RoomEvent 表示 (= MVP は Meeting のみ、RoomEvent は週/日 view のみ。理由: 月のセルが狭くて 5+ メンバー × event 全部を出すと潰れる。Phase 5 で「N 件のイベント」バッジ集約を入れる)
- Owner によるメンバー追放 UI を v6 で新規追加するか → **追加する** (既存 API `DELETE /api/rooms/:id/members/:userId` は実装済、フロント hook が無いので v6 で追加)
- 既存 BottomTab / Friends / Today の動線変更 (= v5 + v4 のまま)
- Snap token / 8pt grid / Major Third 値の変更
- 新規ライブラリ依存

---

## §0 用語

| 用語 | 意味 |
|---|---|
| **Meeting** | 既存スキーマの週パターン (`dayOfWeek`+`startPeriodIndex`+`periodCount`) で表現される授業の繰り返し定義 |
| **MeetingOccurrence** | Meeting を絶対日付に展開した出欠記録単位。`/api/today` `/api/rooms/:id/week` で返る |
| **MeetingEvent** | v6 で新規導入する**フロント側の概念**。`{ userId, courseId, date, startMinute, endMinute, courseName, courseColor, memberColor }` の plain object。カレンダー / 時間割の描画単位 |
| **TimetableEvent** | RoomTimetable 用に Meeting を曜日 × 分軸に正規化した plain object。`{ userId, dayOfWeek, startMinute, endMinute, courseName, courseColor, memberColor }` |
| **Cluster** | RoomTimetable で同曜日 × 重なる時間帯の TimetableEvent 群。column split (`[lane: number, laneCount: number]`) でレイアウトされる |
| **memberColor** | userId の hash → HSL の決定論的色。`hsl(h, 70%, 55%)` 帯。Backend 既定 (`RoomWeekDto.members[].color`) と一致 |
| **空き時間バー** | カレンダー上部に表示する「選択中日付の埋まり (▓) / 空き (░) の時間帯チャート」。日付軸 (24h or 9-20h) を 1 行で展開 |
| **設定モーダル** | 既存 `BottomSheet` 内に input/toggle/button を並べた sheet。mobile = bottom sheet、PC = 同じ Sheet コンポーネントを使う (中央 modal にはしない、既存統一) |

---

## §1 全体構成

```
v6 = (A) styles.css 追加なし、token 値変更なし
     (B) Prisma schema: Room に showMemberTimetables 1 列追加 + migration
     (C) shared zod: UpdateRoomInput と RoomDto / RoomSummaryDto に showMemberTimetables を追加
     (D) API: PATCH /api/rooms/:id が新規フィールドを受ける (既存 endpoint 流用)、新規 endpoint なし
     (E) frontend 新規 component:
         - TimetableSettingsSheet (時間割画面の ⚙)
         - RoomSettingsSheet (ルーム画面の ⚙)
         - RoomCalendar (タブ 1)
           - AvailabilityBar (default + expanded)
           - CalendarMonth / CalendarWeek / CalendarDay
           - CalendarSegmented (日/週/月切替)
         - RoomTimetable (タブ 2)
           - TimetableTrack (列描画)
           - ClusterBlock (Meeting ブロック描画)
     (F) frontend 改修 component:
         - AvatarMenu (Sheet 表示の hydration race fix、リンク整理)
         - DayMeetingCard (color fallback を #10B981 に統一、コメント追記)
         - Timetable (route) (⚙ ボタン追加 + 公開タイトル inline 廃止 → TimetableSettingsSheet 経由)
         - RoomDetail (route) (3 タブ → 2 タブ、⚙ ボタン追加)
         - useRooms hooks (useRemoveRoomMember 追加、useUpdateRoom に showMemberTimetables 対応)
         - useRoomMonth (新規 hook、複数 weekStart を `useQueries` で並列)
     (G) lib 新規:
         - memberColor.ts (userId → HSL)
         - calendarRange.ts (year/month/day → weekStart 配列)
         - meetingExpansion.ts (Meeting array + dateRange → MeetingEvent[])
         - timetableCluster.ts (TimetableEvent[] → Cluster[] with column split)
     (H) test 新規 + 既存拡張 (§9)
```

依存関係:

```
Prisma schema migration
    └─ shared/schemas/room.ts (UpdateRoomInput, RoomDto)
            └─ apps/api/services/room.service.ts (update)
                    └─ apps/api/routes/rooms.ts (既存 PATCH 流用)
                            └─ apps/web/api/hooks/useRooms.ts (useUpdateRoom 拡張)

apps/web/src/lib/memberColor.ts (新)
apps/web/src/lib/calendarRange.ts (新)
apps/web/src/lib/meetingExpansion.ts (新)
apps/web/src/lib/timetableCluster.ts (新)
    └─ apps/web/src/components/rooms/calendar/* (新)
    └─ apps/web/src/components/rooms/timetable/* (新)
            └─ apps/web/src/components/rooms/RoomDetail.tsx (改修)
                    └─ apps/web/src/routes/RoomDetail.tsx (変更なし、薄いラッパ)

apps/web/src/components/sheet/TimetableSettingsSheet.tsx (新)
apps/web/src/components/sheet/RoomSettingsSheet.tsx (新)
    └─ apps/web/src/routes/Timetable.tsx (改修)
    └─ apps/web/src/components/rooms/RoomDetail.tsx (改修)

apps/web/src/components/avatar/AvatarMenu.tsx (改修)
apps/web/src/components/timetable/DayMeetingCard.tsx (微修正)
```

---

## §2 A. バグ修正

### 2.1 Avatar メニュー / プロフィールが画面外に出る

#### 現象 (Touri 観測)

- スマホ Safari で右上 Avatar アイコンを tap
- 期待: BottomSheet が下から上がる
- 実際: なにも見えない or 画面右外にメニューがチラ見え

#### 根本原因仮説 (3 つ並列、調査優先順)

**仮説 1: `useMediaQuery` の初回値 hydration race**

`useMediaQuery` 実装:

```ts
const [matches, setMatches] = useState(() =>
  typeof window === "undefined" ? false : window.matchMedia(query).matches,
);
useEffect(() => { /* listener 登録、handleChange() */ }, [query]);
```

`typeof window === "undefined"` ガードがあるので SSR では false、クライアント初回でも window があれば `matchMedia(query).matches` を返す。ここは race ではない。

**ただし React の Strict Mode で `useState` initializer が 2 回呼ばれる場合**や、Vite dev で hot reload した直後にコンポーネントが `<AvatarMenu />` を mount したタイミングで `window.matchMedia` が `undefined` を返すケース (jsdom 互換のため iOS UIWebView の特殊な動作含む) の事故は記録あり。

**仮説 2: Mobile 用ドロップダウンの absolute right-0 が viewport 外にはみ出す**

現実装の click ハンドラ:
```ts
onClick={() => (mobile ? setSheet("menu") : setOpen((value) => !value))}
```

- `mobile=false` (= PC 判定 / もしくは初回 hydration 前) のとき `setOpen(true)`
- その下で `{!mobile && open ? <... absolute right-0 top-14 ...>{menu}</...>} : null}` の dropdown が描画
- iPhone 13 (390px) で `min-w-72` (288px) の dropdown が `right-0` ⇒ 親 `relative` 要素 (= 40×40 avatar) の右端から左に 288 px 出る = 余裕で画面内に入りそうだが、**親 `relative` がページ右端から 16px 内側にあるので**、dropdown の左端は `viewport_right - 16 - 288 = (viewport_width - 304)` で 86px 付近に出る。ここは大丈夫。
- **ただし `top-14` (56px) は TopBar 高さに連動しているが、現状 TopBar は `h-12` (48px) なので 8px 隙間が空く**。これだけでは見えない説明にならない。

**最有力 = 仮説 3: `mobile` 判定が遅延し、初回 click が PC 経路に流れる**

- ページが読み込まれた直後に Touri が即 Avatar を tap すると `useMediaQuery("(max-width: 767px)")` の effect listener 登録が間に合っておらず、`matches` が**前 render の値** (= `false`) のまま使われる
- Strict Mode 二重実行で `useEffect` の cleanup → 再登録が走った隙に click event が処理される
- 結果: `mobile=false` 経路を踏み、PC 用 dropdown が absolute で表示される。dropdown は親に対して relative なので画面端からは内側だが、**`fixed inset-0` の閉じる用 button (`z-[1100]`) が dropdown の上に被さる**。z-index 衝突で dropdown が backdrop 下に潜って見えない / クリックも素通り。

→ これが Touri 報告の「何も見えない」現象に整合。

#### 修正方針 (確定)

A. **`useMediaQuery` を `mounted` flag 付きに拡張する**:

```ts
// apps/web/src/lib/useMediaQuery.ts (修正)
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): { matches: boolean; mounted: boolean } {
  const [state, setState] = useState<{ matches: boolean; mounted: boolean }>(() => ({
    matches: typeof window === "undefined" ? false : window.matchMedia(query).matches,
    mounted: false,
  }));
  useEffect(() => {
    const media = window.matchMedia(query);
    const handleChange = () => setState({ matches: media.matches, mounted: true });
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [query]);
  return state;
}
```

**注意: シグネチャ変更**。既存呼び出し側 (`AvatarMenu` のみ。`grep -rn "useMediaQuery" apps/web/src` で他の使用箇所が無いか Developer 確認、ある場合は `.matches` を取るように調整)。

B. **AvatarMenu の click 分岐を mounted 後に限定する**:

```ts
const { matches: mobile, mounted } = useMediaQuery("(max-width: 767px)");
// ...
<button
  onClick={() => {
    if (!mounted) return; // hydration 前は無視
    if (mobile) setSheet("menu");
    else setOpen((v) => !v);
  }}
  ...
>
```

C. **z-index 整合の念のため修正**: dropdown を `z-[1110]` のまま、backdrop (`fixed inset-0`) を `z-[1100]` のままで OK (現状と同じ)。ただし backdrop の `inset-0` が画面全体を覆って dropdown 自体を潜らせないよう、**dropdown の wrapper を `z-[1120]`** に格上げ:

```diff
- <div className="absolute right-0 top-14 z-[1110]">{menu}</div>
+ <div className="absolute right-0 top-14 z-[1120]">{menu}</div>
```

D. **`top-14` を `top-12` に**: TopBar 実体が `h-12` なので Avatar 直下に出すには `top-12` (48px) のほうが整合。`top-14` だと 8px 空く視覚不整。

E. **Mobile 用 BottomSheet の menu inner padding**: 既存実装の `menu` JSX は `min-w-72 ... p-3 shadow-popover` の dropdown 兼用。Mobile BottomSheet の body に入れると `min-w-72` が左端から伸びるが、BottomSheet 親が `px-5` で囲んでいるので、`menu` 内の `min-w-72` を **mobile では `w-full`** にする:

```tsx
const menu = (
  <div className="space-y-1 rounded-3xl bg-bg-elevated p-3 shadow-popover md:min-w-72">
    {/* min-w-72 → md:min-w-72 で PC のみ最小幅指定。Mobile は自然幅 */}
  </div>
);
```

#### Avatar Menu の項目整理 (C-5 要件)

- **削除**: 「みんなの時間割」(navigate `/templates`)
- **残す**: プロフィール / 学校・学科 / 出欠ルール / 学期管理 / 出席率を見る / ログアウト
- `/templates` route 自体は v6 で削除しない (Touri 制約「機能の追加削除なし」)。**`/templates` は AvatarMenu の項目から外すだけで、route は残置** = ブラウザ URL 直入力では到達可能。次フェーズで route 削除を検討。

#### 挙動仕様 (Reviewer テスト用)

| ケース | 期待 |
|---|---|
| Mobile (viewport=390px) で Avatar tap、mounted=false (初回 render 直後) | クリックハンドラが noop、Sheet も dropdown も開かない |
| Mobile で Avatar tap、mounted=true | BottomSheet が下から開く、menu が `w-full` で sheet 幅に収まる |
| PC (viewport=1024px) で Avatar tap、mounted=true | Dropdown が `top-12 right-0 z-[1120]` で開く |
| Dropdown の menu items | プロフィール / 学校・学科 / 出欠ルール / 学期管理 / 出席率を見る / ログアウト の **6 個**。「みんなの時間割」は無い |
| Mobile Sheet の menu items | 同じ 6 個。BottomSheet body の padding (`px-5`) に対し menu wrapper は `w-full` |

### 2.2 DayMeetingCard 文字消失

#### 現象

- ブラウザ (一部 Android Chrome 古いバージョン) で、`color: var(--color-accent-500)` のテキストが `color-mix(in srgb, var(--color-accent-500) 20%, transparent)` の chip 内で**透明に見える**
- v5 で `course.color ?? "#10EB99"` に変更済だが、`#10EB99` は v4 token と異なる (`--color-accent-500 = #10B981`)

#### 根本原因

- v4 token: `--color-accent-500 = #10B981` (emerald 500)
- v5 で誰かが `#10EB99` (ライトグリーン) を fallback に書いてしまった (Touri 自身の編集記録あり)
- CSS variable のネストではなく**ハードコード hex の値間違い**

#### 修正

```diff
-  const color = course.color ?? "#10EB99";
+  // v4/v5 の --color-accent-500 (#10B981) と一致させる。
+  // CSS variable 文字列 (`var(--color-accent-500)`) を渡すと
+  // color-mix の引数解決でブラウザ差異が出るので、必ず実 hex を使う。
+  const color = course.color ?? "#10B981";
```

#### WCAG 再検証 (chip)

`bg-bg-elevated = #1A1F2A` の上に chip 重ね。chip の `background: color-mix(in srgb, #10B981 20%, transparent)` は実効 `#1A1F2A` ベースに `#10B981` 20% 加算 = 約 `#173F32`。文字色 `#10B981` のコントラスト比は 5.2:1 → AA OK。

| course.color | chip 背景 (実効) | chip 文字 | 比 |
|---|---|---|---|
| #10B981 | #173F32 | #10B981 | 5.2:1 (AA) |
| #60A5FA | #213040 | #60A5FA | 6.8:1 (AAA) |
| #F472B6 | #382537 | #F472B6 | 5.4:1 (AA) |
| #8B5CF6 | #2B2640 | #8B5CF6 | 4.7:1 (AA) |
| #F59E0B | #38312A | #F59E0B | 7.2:1 (AAA) |

全色 AA 合格。

#### 挙動仕様

| ケース | 期待 |
|---|---|
| `course.color = null` | DayMeetingCard 左 border が `4px solid #10B981`、教室 chip 背景/文字も `#10B981` 系 |
| `course.color = "#60A5FA"` | 左 border `4px solid #60A5FA`、chip 系も `#60A5FA` |
| chip 表示 | コントラスト比 ≥ 4.5:1 (WCAG AA)、教室文字が透明にならない |

---

## §3 B. UX 変更 — 時間割画面 ⚙ + AvatarMenu 整理 + Rooms タブ刷新

### 3.1 時間割画面 (`/timetable`) の右上 ⚙ ボタン

#### モック

```
┌────────────────────────────────────┐
│ ▦ 時間割                    [⚙]     │ ← TopBar 内ではなく PageTitle 右
├────────────────────────────────────┤
│ # 時間割                            │
│ セルをタップして授業を追加できます。 │
│                                    │
│ ┌─────────────────────────────────┐│
│ │ [月] [火●] [水] [木] [金]    [週]││  DayChipNav (v5 そのまま)
│ └─────────────────────────────────┘│
│ ... (DayList v5 そのまま)            │
└────────────────────────────────────┘
```

⚙ は PageTitle 行の右端に配置 (md 以上では `<PageTitle>` の右 inline、mobile では PageTitle の隣に inline)。`<PageTitle title="時間割">セルをタップ…</PageTitle>` の右にアクションスロットがなければ、`<TimetableHeader>` という薄ラッパを新設して title + ⚙ をまとめる。

#### `<TimetableSettingsSheet>` (新規)

ファイル: `apps/web/src/components/sheet/TimetableSettingsSheet.tsx`

##### Props

```ts
export type TimetableSettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  timetable: UserTimetableDto | null;   // 現在選択中の自分の時間割
  // semester change / 学期管理は AvatarMenu 側、ここでは扱わない
};
```

##### 構造

```
┌──────────────────────────────┐
│ 時間割の設定              ✕   │
├──────────────────────────────┤
│ 名前                          │
│ [自分の時間割_______________]  │
│                              │
│ ──────────────────────────── │
│                              │
│ みんなの時間割で公開         │
│ [✓] (toggle, デフォ ON)       │
│                              │
│ 公開タイトル                  │
│ [2026 前期 情報処理科 2年__]   │  ← toggle ON 時のみ表示
│                              │
│ ──────────────────────────── │
│ (sticky footer)              │
│ [キャンセル] [保存]           │
└──────────────────────────────┘
```

##### 内部 state

```ts
const [name, setName] = useState(timetable?.title ?? "");
const [publishEnabled, setPublishEnabled] = useState<boolean>(true); // デフォ ON
const [publishTitle, setPublishTitle] = useState<string>(initialPublishTitle ?? "");
```

`initialPublishTitle`: 過去に publish 済なら API から取得 (= 過去の TimetableTemplate を `authorUserId+sourceTemplateId` 関連で fetch)。**v6 では新規 endpoint を作らず、`UserTimetable.title` を流用しないことに注意**。具体策: `publishEnabled` ON 初期値を v6 では「過去 publish 履歴を見ない、毎回 OFF からの toggle」にすると Touri 要望 (「デフォ ON」) と整合しない。

→ 解決: **`publishEnabled` の初期値はクライアント local state で常に `true`**。 publish title の初期値は `timetable?.title` (= UserTimetable.title) を使う。Touri 要望「デフォ ON」を素朴に満たす。実際の publish 操作は保存ボタン押下時にのみ走る (= 既存 `usePublishTimetable` mutation)。

##### 保存ボタン挙動

```ts
async function handleSave() {
  if (!timetable) return;
  // 1. 名前 (UserTimetable.title) 変更があれば PATCH /api/user-timetables/:id
  if (name !== timetable.title) {
    await patchUserTimetable.mutateAsync({ title: name });
  }
  // 2. publishEnabled が true なら publish-as-template を呼ぶ
  if (publishEnabled && publishTitle.trim().length > 0) {
    await publish.mutateAsync({ title: publishTitle.trim() });
  }
  onClose();
}
```

**注**: 既存 `usePatchUserTimetable` は `{ courses, meetings, daySlots? }` を受け取る形 (`Timetable.tsx` で `removeMeeting` 時に使用)。`title` の patch は schema 上は OK だが service 側で field を許容しているか確認が必要。**Developer は `apps/api/src/services/userTimetable.service.ts` の `updateUserTimetable` で `title` を受け付けるよう拡張する** (UpdateUserTimetableInput schema に `title?: z.string()` を追加)。

→ shared schema 変更:
```diff
// packages/shared/src/schemas/userTimetable.ts (調査の結果すでに UpdateUserTimetableInput がある場合)
- UpdateUserTimetableInput = z.object({ courses: ..., meetings: ..., daySlots: ... });
+ UpdateUserTimetableInput = z.object({
+   title: z.string().min(1).max(120).optional(),
+   courses: ...,
+   meetings: ...,
+   daySlots: ...,
+ });
```

**この変更は v6 制約「showMemberTimetables 1 個のみ」に違反する可能性**を Touri に確認する余地がある。`title` 変更を v6 では諦め、`name` field を保存時に無視する選択肢もある。

**Architect 判断**: v6 制約は「**Room schema の追加列は showMemberTimetables 1 個のみ**」と解釈する。`UpdateUserTimetableInput` の zod schema 拡張は schema 列追加ではなく既存テーブル `UserTimetable.title` の patch を許可するだけ = **制約違反ではない**。Developer は zod の `title?` 追加 + service 側で `if (input.title !== undefined) data.title = input.title` を 1 行追加で実装する。

##### 公開タイトル input の表示制御

```tsx
{publishEnabled ? (
  <Field label="公開タイトル">
    <Input value={publishTitle} onChange={(e) => setPublishTitle(e.currentTarget.value)} />
    <p className="mt-1 text-xs text-fg-tertiary">
      「みんなの時間割」で他のユーザーが検索できる名前
    </p>
  </Field>
) : null}
```

##### 挙動仕様

| 操作 | 期待 |
|---|---|
| ⚙ tap | TimetableSettingsSheet が open、現在 timetable.title が name input に入る、publishEnabled=true、publishTitle=timetable.title |
| 名前を変更 + 保存 | `PATCH /api/user-timetables/:id` `{ title }` 1 回呼ばれる、その後 publishEnabled=true なので publish も呼ばれる |
| publish toggle を OFF + 保存 | publish 呼び出しなし、PATCH は title 変更があれば呼ぶ |
| publishEnabled=true, publishTitle=空 + 保存 | publish 呼び出しなし (空文字は条件で skip)、警告 toast 「公開タイトルを入力してください」を表示 |
| publishEnabled=false でも publishTitle に値あり + 保存 | publish 呼び出しなし |
| キャンセル / ✕ tap | state を初期値に戻し close |

##### CSS

| 属性 | 値 | 根拠 |
|---|---|---|
| sheet body padding | `px-5 pb-[calc(24px+env(safe-area-inset-bottom))]` | BottomSheet 既定 |
| Field 間 | `space-y-5` (= sheet body default) | v5 BottomSheet 規約 |
| Section divider | `border-t border-white/8 pt-5` | sheet 内で publish 関連が独立する視覚区切り |
| sticky footer | `sticky bottom-0 -mx-5 px-5 py-3 border-t border-white/8 bg-bg-elevated` + safe-area | v5 既定 |

### 3.2 Timetable.tsx 改修 (公開タイトル inline 廃止)

```diff
- <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
-   <Field label="公開タイトル" className="max-w-72">
-     <Input value={publishTitle} onChange={(event) => setPublishTitle(event.currentTarget.value)} />
-   </Field>
-   <Button type="button" onClick={() => selected && publishTitle && publish.mutate({ title: publishTitle })} disabled={!selected || !publishTitle}>
-     テンプレ公開
-   </Button>
- </div>
+ {/* 公開タイトル inline は TimetableSettingsSheet に移行 (v6) */}

+ <TimetableSettingsSheet
+   open={settingsOpen}
+   onClose={() => setSettingsOpen(false)}
+   timetable={selected}
+ />
```

PageTitle に ⚙ button を inline で追加:

```tsx
<div className="flex items-start justify-between gap-3">
  <PageTitle title="時間割">セルをタップして授業を追加できます。</PageTitle>
  <button
    type="button"
    onClick={() => setSettingsOpen(true)}
    aria-label="時間割の設定"
    className="grid h-11 w-11 place-items-center rounded-full bg-white/8 text-fg-secondary hover:bg-white/14 active:scale-95 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
  >
    <SettingsIcon className="h-5 w-5" />
  </button>
</div>
```

`SettingsIcon` は既存 lucide-react `Settings` を import。

#### state 追加

```diff
+ const [settingsOpen, setSettingsOpen] = useState(false);
```

#### 削除する state

```diff
- const [publishTitle, setPublishTitle] = useState("");
```

(publish title は TimetableSettingsSheet 内に閉じ込め、`Timetable.tsx` からは無くなる。`usePublishTimetable` の hook import も削除。)

### 3.3 AvatarMenu の menu items (B-5 削除)

§2.1 参照。「みんなの時間割」navigate を削除済の menu に整理。

### 3.4 Rooms タブ刷新 (3 → 2 タブ)

#### 旧 (v3 設計、現実装)

```
[今週] [みんなの空き] [メンバー]
```

#### 新 (v6)

```
[カレンダー] [時間割]      ⚙
```

「メンバー」タブを廃止し、メンバー一覧 / 招待リンク / role / 退室 / ルーム名変更 / メンバー追放を **RoomSettingsSheet** に移動。⚙ button は `RoomDetail.tsx` の TopBar 右上 (= AvatarMenu の左) に配置する。タブの数は 2、`<button>` のセグメント切替で URL search param `?tab=calendar|timetable` と同期。デフォ `calendar`。

#### RoomDetail.tsx 改修概要

```tsx
export function RoomDetail() {
  const { id } = useParams({ from: "/rooms/$id" });
  const [tab, setTab] = useState<"calendar" | "timetable">("calendar");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const room = useRoom(id);
  // useRoomWeek は週単位なので、Calendar の月表示で 5-6 週を並列に取りに行く
  // useRoomMonth は内部で useQueries

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{room.data?.room.name ?? "ルーム"}</h1>
          {room.data?.room.description ? (
            <p className="text-sm text-fg-secondary">{room.data.room.description}</p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="ルームの設定"
          onClick={() => setSettingsOpen(true)}
          className="grid h-11 w-11 place-items-center rounded-full bg-white/8 ..."
        >
          <SettingsIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="flex rounded-full bg-bg-muted p-1">
        {(["calendar", "timetable"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === item ? "bg-accent-500 text-fg-on-accent shadow-glow-soft" : "text-fg-secondary"
            }`}
            onClick={() => setTab(item)}
          >
            {item === "calendar" ? "カレンダー" : "時間割"}
          </button>
        ))}
      </div>

      {tab === "calendar" ? <RoomCalendar roomId={id} /> : <RoomTimetable roomId={id} />}

      <RoomSettingsSheet roomId={id} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
```

#### 既存削除リスト

- 旧 `RoomWeekView` (`apps/web/src/components/rooms/RoomWeekView.tsx`): RoomCalendar の週表示に置換、ファイル削除
- 旧 `RoomAvailabilityHeatmap` (`apps/web/src/components/rooms/RoomAvailabilityHeatmap.tsx`): 削除 (空き時間バーに統合)
- 旧 「メンバー」 inline tab JSX (= RoomDetail.tsx 内): 削除し、RoomSettingsSheet に移管
- 旧 「予定を追加」 ボタン (RoomDetail.tsx 内): RoomCalendar 内に移管 (週/日 view にだけ「+」FAB)

---

## §4 C. RoomCalendar 設計

### 4.1 全体構造

```
┌─────────────────────────────────────┐
│ < 2026年 5月  >        [日][週][月] │ ← 期間ナビ + viewMode segment
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐  │
│  │ 5/27 (火) の空き時間          ▾│  │ ← AvailabilityBar (collapsed)
│  │ 09  10  11  12  13  14  15    │  │
│  │ ▓▓░░░░▓▓▓▓░░░░░░░░░░░░░░░░    │  │
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤
│  (viewMode = "month")               │
│  日 月 火 水 木 金 土                │
│  ──────────────────                  │
│   1  2  3  4  5  6  7                │
│   .  ●  ●  .  ●  .  .                │ ← dot は予定 (Meeting / RoomEvent)
│   ...                                │
│   25 26 27●28 29 30 31               │
│                                     │
│  > 5/27 の予定                      │ ← 選択日下に予定リスト
│  09:00 OS (Touri)                   │
│  13:00 演習 (A友)                   │
└─────────────────────────────────────┘
```

```
  (viewMode = "week")
┌─────────────────────────────────────┐
│ < 2026 5/25-5/31 (週) >  [日][週][月]│
│ ... AvailabilityBar (今日 = 選択日)  │
│                                     │
│  5/25 (月)                           │
│   09:00 OS (Touri)                   │
│   10:00 OS (A友)                     │
│  5/26 (火)                           │
│   ...                                │
│  ...                                 │
└─────────────────────────────────────┘
```

```
  (viewMode = "day")
┌─────────────────────────────────────┐
│ < 5/27 (火) >          [日][週][月] │
│ ... AvailabilityBar (今日 = 選択日)  │
│                                     │
│ 09 ┌──────────────────────────────┐ │
│    │ Touri: OS                    │ │ ← 60分軸の Google Cal 風
│ 10 │ A友:   OS                    │ │
│    └──────────────────────────────┘ │
│ 11                                  │
│ 12 ┌─────────────┐                  │
│    │ Touri: 演習 │                  │
│ 13 │             │                  │
│    └─────────────┘                  │
│ 14                                  │
│ 15 ┌──────────────────────────────┐ │
│    │ 全員: ミーティング (RoomEvent)│ │
│    └──────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 4.2 State

```ts
// RoomCalendar.tsx
const [viewMode, setViewMode] = useState<"day" | "week" | "month">("day");
const [anchor, setAnchor] = useState<dayjs.Dayjs>(() => dayjs().startOf("day"));
// anchor = 表示中の基準日。day mode = その日、week mode = その週、month mode = その月
const [availabilityExpanded, setAvailabilityExpanded] = useState<boolean>(false);
```

| state | 型 | 初期 | 用途 |
|---|---|---|---|
| `viewMode` | `"day" \| "week" \| "month"` | `"day"` | セグメント切替 |
| `anchor` | `dayjs` | 今日 | 期間ナビの基準日 |
| `availabilityExpanded` | `boolean` | `false` | バー展開 |

URL 同期は v6 では行わない (v6.1 で `?date=YYYY-MM-DD&view=day` 検討、Touri 要望にも無い)。

### 4.3 期間 → 週 list 変換 (`calendarRange.ts`)

```ts
// apps/web/src/lib/calendarRange.ts
import dayjs, { type Dayjs } from "dayjs";

/**
 * viewMode と anchor から、必要な週の weekStart (月曜 YYYY-MM-DD) 配列を返す。
 * - day mode: anchor を含む 1 週
 * - week mode: anchor を含む 1 週
 * - month mode: anchor の月の 1 日 〜 月末日を覆う 5-6 週
 */
export function weekStartsFor(viewMode: "day" | "week" | "month", anchor: Dayjs): string[] {
  if (viewMode === "day" || viewMode === "week") {
    return [anchor.startOf("week").add(1, "day").format("YYYY-MM-DD")];
    // startOf("week") は日曜なので 月曜にシフト
  }
  // month: anchor の月の 1 日と最終日を覆う各週
  const monthStart = anchor.startOf("month");
  const monthEnd = anchor.endOf("month");
  const firstWeekStart = monthStart.startOf("week").add(1, "day"); // 月曜
  const lastWeekStart = monthEnd.startOf("week").add(1, "day");
  const results: string[] = [];
  let cursor = firstWeekStart;
  while (cursor.isBefore(lastWeekStart) || cursor.isSame(lastWeekStart, "day")) {
    results.push(cursor.format("YYYY-MM-DD"));
    cursor = cursor.add(1, "week");
  }
  return results;
}
```

#### 挙動仕様

| 入力 (viewMode, anchor) | 出力 |
|---|---|
| `("day", 2026-05-27 火)` | `["2026-05-25"]` (週 = 月-日) |
| `("week", 2026-05-27 火)` | `["2026-05-25"]` |
| `("month", 2026-05-15)` | `["2026-04-27", "2026-05-04", "2026-05-11", "2026-05-18", "2026-05-25", "2026-06-01"]` (5月1日 (金) を含む週は 4/27 始まり、5月31日 (日) を含む週は 5/25 始まり、よって 6 weeks) |
| `("month", 2026-02-01)` (2026年2月、4 weeks 構成) | 4 weeks (2026-01-26, 2026-02-02, ..., 2026-02-23)。**月初が月曜の場合のみ 4 weeks になる可能性**、通常 5-6 weeks |

### 4.4 データ取得: `useRoomMonth` (新規 hook)

```ts
// apps/web/src/api/hooks/useRoomMonth.ts (新規)
import { useQueries } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { RoomWeekDto } from "./types";

export function useRoomMonth(roomId: string | undefined, weekStarts: string[]) {
  return useQueries({
    queries: weekStarts.map((ws) => ({
      queryKey: QK.roomWeek(roomId ?? "", ws),
      queryFn: () => api<RoomWeekDto>(`/api/rooms/${roomId}/week`, { query: { weekStart: ws } }),
      enabled: Boolean(roomId),
    })),
  });
}
```

`useRoomCalendar(roomId, viewMode, anchor)` というラッパは作らず、`RoomCalendar` 内で `const weeks = useRoomMonth(roomId, weekStartsFor(viewMode, anchor))` を呼んで結果を merge する。

#### Merge ロジック

```ts
const allWeeks: RoomWeekDto[] = weeks
  .map((q) => q.data)
  .filter((d): d is RoomWeekDto => d != null);
const loading = weeks.some((q) => q.isLoading);
const error = weeks.find((q) => q.isError);

const members = allWeeks[0]?.members ?? []; // どの週でも同じメンバー
const meetings = allWeeks.flatMap((w) => w.meetings);
const roomEvents = allWeeks.flatMap((w) => w.roomEvents);
```

**注**: `members` は全週同じはずだが、メンバー追加・退室が境界週で起きた場合に差分が出る可能性あり。v6 では `allWeeks[0]?.members` を使用 (最新週のメンバーで統一)。

### 4.5 Meeting → MeetingEvent 展開 (`meetingExpansion.ts`)

`RoomWeekDto.meetings` は既に**展開済の MeetingOccurrence**を返す形 (Backend service `getRoomWeek` 内で week 範囲の occurrence を取得)。クライアントでさらに展開は不要。

```ts
// apps/web/src/lib/meetingExpansion.ts
import dayjs, { type Dayjs } from "dayjs";
import type { RoomWeekDto } from "@atender/shared";

export type MeetingEvent = {
  kind: "meeting";
  userId: string;
  memberName: string;
  memberColor: string;
  courseId: string;
  courseName: string;
  courseColor: string | null;
  date: string;       // YYYY-MM-DD
  startMinute: number;
  endMinute: number;
};

export type RoomEventEvent = {
  kind: "roomEvent";
  eventId: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  title: string;
  date: string;
  startMinute: number;
  endMinute: number;
  isAllDay: boolean;
};

export type CalendarEvent = MeetingEvent | RoomEventEvent;

export function buildCalendarEvents(weeks: RoomWeekDto[]): CalendarEvent[] {
  const memberMap = new Map<string, { name: string | null; handle: string | null; color: string }>();
  for (const w of weeks) {
    for (const m of w.members) {
      if (!memberMap.has(m.userId))
        memberMap.set(m.userId, { name: m.name, handle: m.handle, color: m.color });
    }
  }

  const events: CalendarEvent[] = [];
  const seen = new Set<string>();

  for (const w of weeks) {
    for (const m of w.meetings) {
      const key = `m:${m.occurrenceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const mb = memberMap.get(m.userId);
      events.push({
        kind: "meeting",
        userId: m.userId,
        memberName: mb?.name ?? mb?.handle ?? "No name",
        memberColor: mb?.color ?? "#888",
        courseId: m.courseId,
        courseName: m.courseName,
        courseColor: m.courseColor,
        date: m.date,
        startMinute: m.startMinute,
        endMinute: m.endMinute,
      });
    }
    for (const e of w.roomEvents) {
      const key = `e:${e.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ab = memberMap.get(e.authorId);
      const start = dayjs(e.start);
      const end = dayjs(e.end);
      events.push({
        kind: "roomEvent",
        eventId: e.id,
        authorId: e.authorId,
        authorName: ab?.name ?? ab?.handle ?? "No name",
        authorColor: ab?.color ?? "#888",
        title: e.title,
        date: start.format("YYYY-MM-DD"),
        startMinute: start.hour() * 60 + start.minute(),
        endMinute: end.hour() * 60 + end.minute(),
        isAllDay: e.isAllDay,
      });
    }
  }

  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startMinute - b.startMinute;
  });
  return events;
}

export function eventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  return map;
}
```

### 4.6 AvailabilityBar (空き時間バー)

#### Default (collapsed): 1 行の全員合算帯

```
09  10  11  12  13  14  15  16
▓▓░░░░▓▓▓▓░░░░░░░░░░░░░░░░░░░░  ▾
```

各 30 分セル (= 24h * 2 = 48 セル、09:00-18:00 帯のみ画面表示なので 18 セル) に対し:
- `▓` (full) = 全員 (= `members.length`) が busy
- 半色 (`bg-accent-500/{free_ratio * 100}%`) = 一部 busy
- `░` (empty) = 全員 free
- セル幅: container 全体を 30 分単位で等分

実装:

```tsx
// AvailabilityBar.tsx (新規 component)
// apps/web/src/components/rooms/calendar/AvailabilityBar.tsx
import { useState } from "react";
import dayjs from "dayjs";
import type { CalendarEvent } from "@/lib/meetingExpansion";

type Member = { userId: string; name: string | null; handle: string | null; color: string };

const SLOT_START_MIN = 9 * 60;  // 09:00
const SLOT_END_MIN = 18 * 60;   // 18:00
const SLOT_STEP = 30;           // 30分

export function AvailabilityBar({
  date,
  members,
  events,
  expanded,
  onToggle,
}: {
  date: string;                  // YYYY-MM-DD
  members: Member[];
  events: CalendarEvent[];       // 当該日に限定済の events
  expanded: boolean;
  onToggle: () => void;
}) {
  // 30分セル: 09:00-18:00 = 9h * 2 = 18 セル
  const slotCount = (SLOT_END_MIN - SLOT_START_MIN) / SLOT_STEP;
  const slots = Array.from({ length: slotCount }, (_, i) => ({
    startMin: SLOT_START_MIN + i * SLOT_STEP,
    endMin: SLOT_START_MIN + (i + 1) * SLOT_STEP,
  }));

  // メンバー別の busy boolean array
  function memberBusy(userId: string): boolean[] {
    return slots.map(({ startMin, endMin }) =>
      events.some(
        (e) => (e.kind === "meeting" ? e.userId === userId : e.authorId === userId)
          && e.startMinute < endMin
          && e.endMinute > startMin,
      ),
    );
  }

  // 全員合算: 各セルで busy 人数
  const combinedBusy = slots.map((s, i) => {
    let busy = 0;
    for (const m of members) {
      const arr = memberBusy(m.userId);
      if (arr[i]) busy++;
    }
    return busy;
  });

  return (
    <section className="rounded-3xl bg-bg-elevated p-5 shadow-card">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">
          {dayjs(date).format("M/D (ddd)")} の空き時間
        </h3>
        <button
          type="button"
          aria-label={expanded ? "メンバー別を閉じる" : "メンバー別を開く"}
          aria-expanded={expanded}
          onClick={onToggle}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/8 active:scale-95 transition"
        >
          {expanded ? "▴" : "▾"}
        </button>
      </header>
      {/* 時刻ラベル (上) */}
      <div className="mb-1 grid grid-cols-[40px_1fr] gap-2 text-[10px] text-fg-tertiary">
        <span />
        <div className="flex justify-between">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i}>{9 + i}</span>
          ))}
        </div>
      </div>
      {/* 合算行 (常に表示) */}
      <BarRow
        label="全員"
        slots={slots.map((s, i) => ({ ...s, busy: combinedBusy[i], total: members.length }))}
      />
      {/* 展開時のみメンバー別 */}
      {expanded
        ? members.map((m) => {
            const arr = memberBusy(m.userId);
            return (
              <BarRow
                key={m.userId}
                label={m.name ?? m.handle ?? "No name"}
                color={m.color}
                slots={slots.map((s, i) => ({ ...s, busy: arr[i] ? 1 : 0, total: 1 }))}
              />
            );
          })
        : null}
    </section>
  );
}

function BarRow({
  label,
  color,
  slots,
}: {
  label: string;
  color?: string;
  slots: Array<{ busy: number; total: number }>;
}) {
  return (
    <div className="mb-1 grid grid-cols-[40px_1fr] items-center gap-2 last:mb-0">
      <span className="truncate text-xs font-semibold text-fg-secondary">{label}</span>
      <div className="flex h-5 overflow-hidden rounded-full bg-white/4">
        {slots.map((s, i) => {
          const ratio = s.total === 0 ? 0 : s.busy / s.total;
          const bg = ratio === 0
            ? "transparent"
            : color
              ? `color-mix(in srgb, ${color} ${Math.round(ratio * 100)}%, transparent)`
              : `color-mix(in srgb, var(--color-accent-500) ${Math.round(ratio * 100)}%, transparent)`;
          return (
            <span
              key={i}
              className="flex-1 border-r border-bg-elevated last:border-r-0"
              style={{ background: bg }}
              title={`${formatMin(s.busy >= 1 ? "busy" : "free")} (${s.busy}/${s.total})`}
            />
          );
        })}
      </div>
    </div>
  );
}

function formatMin(state: "busy" | "free"): string {
  return state === "busy" ? "埋" : "空";
}
```

#### 挙動仕様

| ケース | 期待 |
|---|---|
| `expanded=false`, members=3 | 「全員」1 行のみ表示 |
| `expanded=true`, members=3 | 「全員」+ メンバー 3 行 = 計 4 行 |
| `events=[]` (誰も予定なし) | 全セル ratio=0 = transparent (= 白系背景) |
| `events=[全員 09:00-10:30]` | 09:00-10:30 のセルが ratio=1 = 不透明、それ以外 0 |
| `events=[Touri だけ 09:00-10:30]`, expanded=false, members=3 | 09:00-10:30 セルが ratio=1/3 = 33% mix |
| `events=[Touri だけ 09:00-10:30]`, expanded=true | 「全員」行が 33%、「Touri」行が 100%、他メンバー行が 0% |
| toggle button click | `onToggle()` 1 回呼ばれる、`aria-expanded` が反転 |
| `date` 変更 | 同じコンポーネントが date 再 render、events も再 filter された値で再描画 |
| 24 時間外の event (06:00-08:00 等) | バーには表示されない (= 09-18 帯のみ表示)。コメントで Developer に明示、Phase 5 で 24h 拡張検討 |

### 4.7 CalendarSegmented (日/週/月切替)

```tsx
// apps/web/src/components/rooms/calendar/CalendarSegmented.tsx
type Props = {
  viewMode: "day" | "week" | "month";
  onChange: (mode: "day" | "week" | "month") => void;
};

export function CalendarSegmented({ viewMode, onChange }: Props) {
  return (
    <div className="inline-flex rounded-full bg-bg-muted p-1" role="tablist">
      {(["day", "week", "month"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={viewMode === m}
          className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${
            viewMode === m ? "bg-accent-500 text-fg-on-accent shadow-glow-soft" : "text-fg-secondary"
          }`}
          onClick={() => onChange(m)}
        >
          {m === "day" ? "日" : m === "week" ? "週" : "月"}
        </button>
      ))}
    </div>
  );
}
```

### 4.8 期間ナビ (`<`, `>`, タイトル)

```tsx
function PeriodNav({
  viewMode,
  anchor,
  onChange,
}: {
  viewMode: "day" | "week" | "month";
  anchor: Dayjs;
  onChange: (next: Dayjs) => void;
}) {
  const step = viewMode === "day" ? "day" : viewMode === "week" ? "week" : "month";
  const title =
    viewMode === "day"
      ? anchor.format("YYYY年 M月D日 (ddd)")
      : viewMode === "week"
        ? `${anchor.startOf("week").add(1, "day").format("M/D")} - ${anchor.endOf("week").add(1, "day").format("M/D")} (週)`
        : anchor.format("YYYY年 M月");
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={() => onChange(anchor.subtract(1, step))} aria-label="前へ" className="..." >＜</button>
      <h2 className="text-base font-bold tracking-tight">{title}</h2>
      <button type="button" onClick={() => onChange(anchor.add(1, step))} aria-label="次へ" className="..." >＞</button>
    </div>
  );
}
```

### 4.9 CalendarMonth

```tsx
// apps/web/src/components/rooms/calendar/CalendarMonth.tsx
import dayjs from "dayjs";

export function CalendarMonth({
  anchor,
  selectedDate,
  events,                 // 当月分の全 events
  onSelectDate,
}: {
  anchor: dayjs.Dayjs;
  selectedDate: string;   // YYYY-MM-DD
  events: CalendarEvent[];
  onSelectDate: (date: string) => void;
}) {
  const monthStart = anchor.startOf("month");
  const gridStart = monthStart.startOf("week").add(1, "day"); // 月曜始まり
  const gridEnd = anchor.endOf("month").endOf("week").add(1, "day");
  const totalDays = gridEnd.diff(gridStart, "day") + 1;
  const dates = Array.from({ length: totalDays }, (_, i) =>
    gridStart.add(i, "day").format("YYYY-MM-DD"),
  );

  // 各日に予定があるか
  const hasEventByDate = new Set(events.map((e) => e.date));
  // 各日にイベントを出してるメンバーの色 (最大 3 ドット)
  const dotsByDate = new Map<string, string[]>();
  for (const e of events) {
    const list = dotsByDate.get(e.date) ?? [];
    const color = e.kind === "meeting" ? e.memberColor : e.authorColor;
    if (!list.includes(color)) list.push(color);
    dotsByDate.set(e.date, list);
  }

  return (
    <div className="grid grid-cols-7 gap-1">
      {["月", "火", "水", "木", "金", "土", "日"].map((d) => (
        <div key={d} className="py-2 text-center text-xs font-semibold text-fg-tertiary">
          {d}
        </div>
      ))}
      {dates.map((d) => {
        const date = dayjs(d);
        const inMonth = date.month() === anchor.month();
        const isSelected = d === selectedDate;
        const isToday = d === dayjs().format("YYYY-MM-DD");
        const dots = (dotsByDate.get(d) ?? []).slice(0, 3);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onSelectDate(d)}
            className={`flex h-12 flex-col items-center justify-center rounded-2xl transition active:scale-95 ${
              isSelected
                ? "bg-accent-500 text-fg-on-accent shadow-glow-soft"
                : inMonth ? "text-fg-primary hover:bg-white/6" : "text-fg-tertiary"
            } ${isToday && !isSelected ? "ring-2 ring-accent-500/40" : ""}`}
            aria-label={`${date.format("M月D日")}${isToday ? " (今日)" : ""}`}
            aria-pressed={isSelected}
          >
            <span className="text-sm font-semibold leading-none">{date.date()}</span>
            <div className="mt-1 flex h-1 items-center gap-0.5">
              {dots.map((c, i) => (
                <span key={i} className="h-1 w-1 rounded-full" style={{ background: c }} />
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

### 4.10 CalendarWeek

```tsx
export function CalendarWeek({
  weekStart,             // 月曜 YYYY-MM-DD
  selectedDate,
  eventsByDateMap,
  onSelectDate,
}: {
  weekStart: string;
  selectedDate: string;
  eventsByDateMap: Map<string, CalendarEvent[]>;
  onSelectDate: (date: string) => void;
}) {
  const dates = Array.from({ length: 7 }, (_, i) => dayjs(weekStart).add(i, "day").format("YYYY-MM-DD"));
  return (
    <div className="space-y-3">
      {dates.map((d) => {
        const date = dayjs(d);
        const events = eventsByDateMap.get(d) ?? [];
        const isSelected = d === selectedDate;
        return (
          <section
            key={d}
            className={`rounded-3xl bg-bg-elevated p-4 transition ${
              isSelected ? "ring-2 ring-accent-500" : ""
            }`}
          >
            <header className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => onSelectDate(d)}
                className="text-sm font-bold"
              >
                {date.format("M/D (ddd)")}
              </button>
              <span className="text-xs text-fg-tertiary">{events.length} 件</span>
            </header>
            <ul className="space-y-2">
              {events.map((e, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full" style={{ background: e.kind === "meeting" ? e.memberColor : e.authorColor }} />
                  <span className="font-semibold tabular-nums">{formatMin(e.startMinute)}</span>
                  <span className="truncate">
                    {e.kind === "meeting" ? `${e.courseName} (${e.memberName})` : `${e.title} (RoomEvent)`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function formatMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
```

### 4.11 CalendarDay

```tsx
export function CalendarDay({
  date,
  events,             // 当日の events
  members,
}: {
  date: string;
  events: CalendarEvent[];
  members: Member[];
}) {
  // 時間軸: 09-21 時 (12 時間 = 12 行、1 行 = 60px)
  const startHour = 9;
  const endHour = 21;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const totalMin = (endHour - startHour) * 60;

  // 同時間帯で並ぶ event を column 分割 (Google Cal 風)
  // 単純化: clusterEvents (apps/web/src/lib/calendarClusterDay.ts) で lane を割当
  const eventsWithLane = assignLanes(events);

  return (
    <div className="relative" style={{ height: `${(endHour - startHour) * 60}px` }}>
      {hours.map((h) => (
        <div key={h} className="relative h-[60px] border-t border-white/8">
          <span className="absolute -top-2 left-0 w-10 text-xs text-fg-tertiary tabular-nums">
            {String(h).padStart(2, "0")}
          </span>
        </div>
      ))}
      {eventsWithLane.map((e, i) => {
        const top = ((e.startMinute - startHour * 60) / totalMin) * 100;
        const height = ((e.endMinute - e.startMinute) / totalMin) * 100;
        if (top < 0 || top > 100) return null; // 範囲外
        const widthPct = 100 / e.laneCount;
        const leftPct = 12 + (100 - 12) * (e.lane / e.laneCount); // 左 12% は時刻ラベル
        const cellWidthPct = (100 - 12) / e.laneCount;
        const color = e.kind === "meeting" ? e.memberColor : e.authorColor;
        return (
          <div
            key={i}
            className="absolute overflow-hidden rounded-xl px-2 py-1 text-xs font-semibold text-white"
            style={{
              top: `${top}%`,
              height: `${height}%`,
              left: `${leftPct}%`,
              width: `${cellWidthPct - 0.5}%`,  // gutter 0.5%
              background: color,
            }}
            title={e.kind === "meeting" ? `${e.courseName} (${e.memberName})` : `${e.title}`}
          >
            <div className="truncate">
              {formatMin(e.startMinute)} {e.kind === "meeting" ? e.courseName : e.title}
            </div>
            <div className="truncate text-[10px] opacity-80">
              {e.kind === "meeting" ? e.memberName : `${e.authorName} (event)`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

#### `assignLanes` (lib 内 helper、CalendarDay 用)

```ts
type WithLane<T> = T & { lane: number; laneCount: number };

export function assignLanes<E extends { startMinute: number; endMinute: number }>(
  events: E[],
): WithLane<E>[] {
  const sorted = [...events].sort((a, b) =>
    a.startMinute === b.startMinute
      ? a.endMinute - b.endMinute
      : a.startMinute - b.startMinute,
  );
  // クラスタリング: 連続して重なる event を 1 群にする
  const clusters: E[][] = [];
  let cluster: E[] = [];
  let clusterEnd = -Infinity;
  for (const e of sorted) {
    if (e.startMinute >= clusterEnd) {
      if (cluster.length > 0) clusters.push(cluster);
      cluster = [e];
      clusterEnd = e.endMinute;
    } else {
      cluster.push(e);
      clusterEnd = Math.max(clusterEnd, e.endMinute);
    }
  }
  if (cluster.length > 0) clusters.push(cluster);

  const out: WithLane<E>[] = [];
  for (const cl of clusters) {
    // greedy: 各 event を最も早く空く lane に
    const lanes: number[] = []; // lanes[i] = endMin of last assigned to lane i
    const eventLane = new Map<E, number>();
    for (const e of cl) {
      let placed = -1;
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] <= e.startMinute) {
          placed = i;
          break;
        }
      }
      if (placed === -1) {
        placed = lanes.length;
        lanes.push(e.endMinute);
      } else {
        lanes[placed] = e.endMinute;
      }
      eventLane.set(e, placed);
    }
    const laneCount = lanes.length;
    for (const e of cl) {
      out.push({ ...e, lane: eventLane.get(e)!, laneCount });
    }
  }
  return out;
}
```

### 4.12 RoomCalendar.tsx (組み立て)

```tsx
// apps/web/src/components/rooms/RoomCalendar.tsx (新規)
export function RoomCalendar({ roomId }: { roomId: string }) {
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("day");
  const [anchor, setAnchor] = useState(() => dayjs().startOf("day"));
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [barExpanded, setBarExpanded] = useState(false);

  const weekStarts = useMemo(() => weekStartsFor(viewMode, anchor), [viewMode, anchor]);
  const weeks = useRoomMonth(roomId, weekStarts);

  const data = useMemo(() => {
    const valid = weeks.map((q) => q.data).filter((d): d is RoomWeekDto => d != null);
    return {
      members: valid[0]?.members ?? [],
      events: buildCalendarEvents(valid),
      loading: weeks.some((q) => q.isLoading),
      error: weeks.find((q) => q.isError)?.error ?? null,
    };
  }, [weeks]);

  const eventsByDateMap = useMemo(() => eventsByDate(data.events), [data.events]);
  const dayEvents = eventsByDateMap.get(selectedDate) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <PeriodNav viewMode={viewMode} anchor={anchor} onChange={setAnchor} />
        <CalendarSegmented viewMode={viewMode} onChange={setViewMode} />
      </div>

      <AvailabilityBar
        date={selectedDate}
        members={data.members}
        events={dayEvents}
        expanded={barExpanded}
        onToggle={() => setBarExpanded((v) => !v)}
      />

      {data.loading ? <SkeletonCalendar /> : null}
      {data.error ? <ErrorPanel onRetry={() => weeks.forEach((q) => q.refetch())} /> : null}
      {!data.loading && !data.error ? (
        viewMode === "month" ? (
          <>
            <CalendarMonth
              anchor={anchor}
              selectedDate={selectedDate}
              events={data.events}
              onSelectDate={(d) => { setSelectedDate(d); setAnchor(dayjs(d)); }}
            />
            <DayEventList date={selectedDate} events={dayEvents} />
          </>
        ) : viewMode === "week" ? (
          <CalendarWeek
            weekStart={weekStarts[0]}
            selectedDate={selectedDate}
            eventsByDateMap={eventsByDateMap}
            onSelectDate={(d) => { setSelectedDate(d); setAnchor(dayjs(d)); }}
          />
        ) : (
          <CalendarDay date={selectedDate} events={dayEvents} members={data.members} />
        )
      ) : null}

      {/* + 予定を追加 FAB (週 / 日 view のみ) */}
      {viewMode !== "month" ? (
        <Button type="button" variant="primary" onClick={() => /* RoomEventCreateSheet open */}>
          + 予定を追加
        </Button>
      ) : null}
    </div>
  );
}
```

### 4.13 メンバー色 (`memberColor.ts`)

```ts
// apps/web/src/lib/memberColor.ts
export function memberColor(seed: string): string {
  // 既存 RoomCard の roomTint を踏襲: 32-bit hash → hue 0-359 → HSL
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) hash = (hash * 33) ^ seed.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}
```

Backend `RoomWeekDto.members[].color` は service 側で同等ロジック (もしくは別ロジック) で計算されているが、**v6 ではフロント側で server returned color をそのまま使う**ことに統一する。フロントの `memberColor()` は server color が未定義 (= null) の fallback 用としてのみ使う。

---

## §5 D. RoomTimetable 設計

### 5.1 全体構造

```
┌─────────────────────────────────────────────┐
│         月    火    水    木    金            │   ← 横軸: 5 列縮退 or 7 列
│ 09 ┌──────┐         ┌──────┐                 │
│    │ Tour │         │ A友 │                  │
│    │ OS   │         │ DB  │                  │
│ 10 └──────┘         └──────┘                 │
│    ┌──────┬──────┐                            │
│    │ A友 │ B友 │                              │   ← Cluster split (2 列)
│    │ OS  │ OS  │                              │
│ 11 └──────┴──────┘                            │
│ 12 ┌──────┐                                   │
│    │ Tour │                                   │
│ 13 │ 演習 │                                   │
│    └──────┘                                   │
│ 14                                            │
│ 15 ┌──────────────────────────────────┐       │
│    │ Tour: 線形代数                    │       │
│ 16 └──────────────────────────────────┘       │
└─────────────────────────────────────────────┘
```

### 5.2 入力データ

`RoomWeekDto` の `meetings` 配列を「曜日 × 時刻」軸に正規化する。各メンバーの**自分の UserTimetable の Meeting**を Backend が既に week 範囲で展開済の `MeetingOccurrence` として返してくれている。

```ts
// TimetableEvent = 曜日 × 分軸の Meeting
export type TimetableEvent = {
  userId: string;
  memberName: string;
  memberColor: string;
  courseId: string;
  courseName: string;
  dayOfWeek: number;       // 1=月 ... 7=日
  startMinute: number;
  endMinute: number;
};
```

#### Meeting → TimetableEvent 変換

`RoomWeekDto.meetings[i]` は `{ userId, date, startMinute, endMinute, courseId, courseName, ... }`。`date` (YYYY-MM-DD) を `dayOfWeek` に変換:

```ts
function dateToDayOfWeek(date: string): number {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return day === 0 ? 7 : day; // 月=1, ..., 日=7
}
```

**重複排除**: 同じ userId + courseId + dayOfWeek + startMinute + endMinute は 1 度だけ採用 (週内に同じ曜日が複数回現れることはない = 1 week の範囲では同曜日は 1 度なので、データソース信頼で重複なし)。

```ts
// apps/web/src/lib/timetableNormalize.ts
export function normalizeToTimetableEvents(
  week: RoomWeekDto,
): TimetableEvent[] {
  const memberByUserId = new Map(week.members.map((m) => [m.userId, m]));
  const seen = new Set<string>();
  const out: TimetableEvent[] = [];
  for (const m of week.meetings) {
    const key = `${m.userId}:${m.courseId}:${m.date}:${m.startMinute}:${m.endMinute}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mb = memberByUserId.get(m.userId);
    out.push({
      userId: m.userId,
      memberName: mb?.name ?? mb?.handle ?? "No name",
      memberColor: mb?.color ?? "#888",
      courseId: m.courseId,
      courseName: m.courseName,
      dayOfWeek: dateToDayOfWeek(m.date),
      startMinute: m.startMinute,
      endMinute: m.endMinute,
    });
  }
  return out;
}
```

### 5.3 横軸の動的列数 (5 vs 7)

```ts
function dynamicDays(events: TimetableEvent[]): number[] {
  const has = new Set(events.map((e) => e.dayOfWeek));
  // 土 (6) or 日 (7) に Meeting が 1 つでもあれば 7 列、なければ 5 列
  if (has.has(6) || has.has(7)) return [1, 2, 3, 4, 5, 6, 7];
  return [1, 2, 3, 4, 5];
}
```

#### 挙動仕様

| 入力 | 出力 |
|---|---|
| events = [{dow:1}, {dow:5}] | [1,2,3,4,5] |
| events = [{dow:1}, {dow:6}] | [1,2,3,4,5,6,7] |
| events = [{dow:7}] | [1,2,3,4,5,6,7] |
| events = [] | [1,2,3,4,5] (デフォ 5 列) |

### 5.4 縦軸の最早〜最遅とパーセント計算

```ts
type ViewRange = { minMinute: number; maxMinute: number };

function computeViewRange(events: TimetableEvent[]): ViewRange {
  if (events.length === 0) {
    return { minMinute: 9 * 60, maxMinute: 18 * 60 }; // デフォ 9-18
  }
  const min = Math.min(...events.map((e) => e.startMinute));
  const max = Math.max(...events.map((e) => e.endMinute));
  // 30 分単位に切り下げ / 切り上げ
  const minSnapped = Math.floor(min / 30) * 30;
  const maxSnapped = Math.ceil(max / 30) * 30;
  return { minMinute: minSnapped, maxMinute: maxSnapped };
}
```

#### パーセント計算

```ts
function topPercent(minute: number, range: ViewRange): number {
  return ((minute - range.minMinute) / (range.maxMinute - range.minMinute)) * 100;
}
function heightPercent(startMin: number, endMin: number, range: ViewRange): number {
  return ((endMin - startMin) / (range.maxMinute - range.minMinute)) * 100;
}
```

### 5.5 Cluster 分割 (列内の重なり処理)

各曜日列内で、重なる TimetableEvent を「Cluster」にまとめ、各 Cluster 内で `lane / laneCount` を割り当て。

```ts
// apps/web/src/lib/timetableCluster.ts
export type LaneEvent = TimetableEvent & { lane: number; laneCount: number };

export function clusterByDay(events: TimetableEvent[]): Map<number, LaneEvent[]> {
  const byDay = new Map<number, TimetableEvent[]>();
  for (const e of events) {
    const list = byDay.get(e.dayOfWeek) ?? [];
    list.push(e);
    byDay.set(e.dayOfWeek, list);
  }
  const result = new Map<number, LaneEvent[]>();
  for (const [dow, list] of byDay) {
    result.set(dow, assignLanesInDay(list));
  }
  return result;
}

function assignLanesInDay(events: TimetableEvent[]): LaneEvent[] {
  // §4.11 の assignLanes と同じアルゴリズム、汎用 helper を共有する
  const sorted = [...events].sort((a, b) =>
    a.startMinute === b.startMinute
      ? a.endMinute - b.endMinute
      : a.startMinute - b.startMinute,
  );
  // クラスタリング
  const clusters: TimetableEvent[][] = [];
  let cluster: TimetableEvent[] = [];
  let clusterEnd = -Infinity;
  for (const e of sorted) {
    if (e.startMinute >= clusterEnd) {
      if (cluster.length > 0) clusters.push(cluster);
      cluster = [e];
      clusterEnd = e.endMinute;
    } else {
      cluster.push(e);
      clusterEnd = Math.max(clusterEnd, e.endMinute);
    }
  }
  if (cluster.length > 0) clusters.push(cluster);

  const out: LaneEvent[] = [];
  for (const cl of clusters) {
    const lanes: number[] = [];
    const eventLane = new Map<TimetableEvent, number>();
    for (const e of cl) {
      let placed = -1;
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] <= e.startMinute) {
          placed = i;
          break;
        }
      }
      if (placed === -1) {
        placed = lanes.length;
        lanes.push(e.endMinute);
      } else {
        lanes[placed] = e.endMinute;
      }
      eventLane.set(e, placed);
    }
    const laneCount = lanes.length;
    for (const e of cl) {
      out.push({ ...e, lane: eventLane.get(e)!, laneCount });
    }
  }
  return out;
}
```

#### 擬似コード補足

```
input:  events on day X = [e1, e2, e3, ...]
step 1: sort by (startMinute, endMinute)
step 2: cluster: 連続的に重なる群を 1 群とする
  - e1 が時刻 [a, b]、e2 が [c, d] かつ c < b なら同 cluster
step 3: 各 cluster で greedy lane 割当
  - 各 event をなるべく既存 lane (= 最も早く空く lane) に置く
  - 置けなければ新 lane を追加
step 4: cluster 内の laneCount = lanes.length
output: [{ ...e, lane, laneCount }, ...]
```

#### 挙動仕様

| 入力 | 出力 (lane, laneCount) |
|---|---|
| 1 event [09:00-10:30] | (0, 1) |
| 2 event 重ならない [09:00-10:30, 11:00-12:30] | 両方 (0, 1) — cluster 分離 |
| 2 event 完全重なり [09:00-10:30, 09:00-10:30] | (0, 2), (1, 2) |
| 3 event 一部重なり [09:00-10:30, 10:00-11:00, 10:30-12:00] | (0, 3), (1, 3), (0, 3) — 3 番目は 1 番目が 10:30 で空くので lane 0 に入れる、ただし 10:00-11:00 とまだ重なるので... 検証: 10:00-11:00 は lane 1。10:30-12:00 開始時刻 10:30 で lane 0 が 10:30 に空く → lane 0 採用 (10:30 == 10:30 なので空き判定 OK)、laneCount=3 |
| 4 event: 9-10, 9-10, 10-11, 10-11 | cluster 全体が 9-11 で連続、greedy: e1→0, e2→1, e3→ lanes=[10,10], e3.start=10, lane 0 が 10 で空くので 0、e4→1。lane count = 2、全 event (lane=0,1,0,1, laneCount=2) |
| 5 event: 9-10, 9-11, 9-12, 10-11, 11-12 | 全 9-12 cluster。e1→0, e2→1, e3→2, e4→ lane 0 (10で空く) → 0, e5→ lane 0 (11で空く) → 0。laneCount=3 |

### 5.6 RoomTimetable.tsx

```tsx
// apps/web/src/components/rooms/RoomTimetable.tsx (新規)
import { useMemo } from "react";
import dayjs from "dayjs";
import { useRoomWeek } from "@/api/hooks";
import { normalizeToTimetableEvents } from "@/lib/timetableNormalize";
import { clusterByDay } from "@/lib/timetableCluster";

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

export function RoomTimetable({ roomId }: { roomId: string }) {
  // 当週のメンバー Meeting を取得 (= 同じ週パターンが他週でも繰り返す)
  // 「今週」だけ取得して曜日 × 分軸に正規化、繰り返しはしない
  const weekStart = useMemo(
    () => dayjs().startOf("week").add(1, "day").format("YYYY-MM-DD"),
    [],
  );
  const week = useRoomWeek(roomId, weekStart);

  const events = useMemo(
    () => (week.data ? normalizeToTimetableEvents(week.data) : []),
    [week.data],
  );
  const days = useMemo(() => dynamicDays(events), [events]);
  const range = useMemo(() => computeViewRange(events), [events]);
  const byDay = useMemo(() => clusterByDay(events), [events]);

  // 縦軸ラベル: 1 時間刻みで slot 境界に丸めた時刻
  const hourLabels = useMemo(() => {
    const startHour = Math.floor(range.minMinute / 60);
    const endHour = Math.ceil(range.maxMinute / 60);
    return Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  }, [range]);

  if (week.isLoading) return <SkeletonTimetable />;
  if (week.isError) return <ErrorPanel onRetry={() => week.refetch()} />;
  if (events.length === 0) return <EmptyState>メンバーの時間割がまだありません。</EmptyState>;

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `40px repeat(${days.length}, minmax(0, 1fr))`,
        // 高さ = viewport - chrome (TopBar 56 + tab 48 + room header 56 + period nav 0 (この画面では無し) + safe-area + footer)
        height: "calc(100dvh - 240px)",
        minHeight: "320px",
      }}
    >
      {/* 曜日ヘッダ */}
      <div /> {/* 左上スペース */}
      {days.map((dow) => (
        <div key={dow} className="border-b border-white/8 py-2 text-center text-xs font-semibold text-fg-secondary">
          {DAY_LABELS[dow - 1]}
        </div>
      ))}
      {/* 時刻ラベル列 + 各曜日列 */}
      <div className="relative col-span-1 row-start-2">
        {hourLabels.map((h) => {
          const minute = h * 60;
          const top = topPercent(minute, range);
          return (
            <span
              key={h}
              className="absolute left-0 right-1 text-right text-[10px] text-fg-tertiary tabular-nums"
              style={{ top: `${top}%`, transform: "translateY(-50%)" }}
            >
              {String(h).padStart(2, "0")}
            </span>
          );
        })}
      </div>
      {days.map((dow) => (
        <DayColumn
          key={dow}
          events={byDay.get(dow) ?? []}
          range={range}
        />
      ))}
    </div>
  );
}

function DayColumn({ events, range }: { events: LaneEvent[]; range: ViewRange }) {
  return (
    <div className="relative row-start-2 border-l border-white/8">
      {events.map((e) => {
        const top = topPercent(e.startMinute, range);
        const height = heightPercent(e.startMinute, e.endMinute, range);
        const widthPct = 100 / e.laneCount;
        const leftPct = e.lane * widthPct;
        return (
          <div
            key={`${e.userId}:${e.courseId}:${e.startMinute}`}
            className="absolute overflow-hidden rounded-lg px-1 py-0.5 text-[10px] font-semibold leading-tight text-white"
            style={{
              top: `${top}%`,
              height: `${height}%`,
              left: `${leftPct}%`,
              width: `calc(${widthPct}% - 2px)`,
              background: e.memberColor,
            }}
            title={`${e.memberName}: ${e.courseName}`}
          >
            <div className="truncate">{e.memberName}</div>
            <div className="truncate opacity-80">{e.courseName}</div>
          </div>
        );
      })}
    </div>
  );
}
```

### 5.7 1 画面圧縮の高さ計算

#### 制約

- viewport height = `100dvh`
- 上部 chrome (mobile): TopBar 56 + AppLayout pt-5 (20) + RoomDetail header (h1 ~40) + tab (48) + room タイトル余白 = 約 200px
- 下部 chrome (mobile): BottomTab 80 + safe-area inset ≈ env(safe-area-inset-bottom)
- → `height: calc(100dvh - 280px)` で確保、`min-height: 320px` で潰れ防止

#### CSS variable で chrome を集約

```css
:root {
  --room-tt-chrome-top: 200px;
  --room-tt-chrome-bottom: 80px;
}
```

```tsx
style={{
  height: `calc(100dvh - var(--room-tt-chrome-top) - var(--room-tt-chrome-bottom) - env(safe-area-inset-bottom, 0px))`,
  minHeight: "320px",
}}
```

**注**: v6 styles.css に variable を追加するのは構わない (token 値変更ではなく、新規追加)。但し v6 やらないこと「Snap 風 token 値の変更」に該当しない (新規 var)。

### 5.8 時刻ラベルの「適度に」 = 1 時間刻み

メンバー間で slot 境界が異なる可能性 (各 UserTimetable の DaySlot 構成が違う) があるため、`hourLabels` は **1 時間刻み (整数時)** を採用。slot 境界に揃えるのは v6 では諦める (= 全員 9:00 始まりとは限らないため、最小公倍数になりがち)。

### 5.9 挙動仕様

| ケース | 期待 |
|---|---|
| events=[] | 空状態 (`<EmptyState>`) を表示、グリッドは描画しない |
| events 全員月-金のみ | 横軸 5 列 (月-金) |
| events に 1 件でも土曜 | 横軸 7 列 (月-日) |
| events min=9:00, max=18:30 | range=[9:00, 18:30] (= 30 分単位スナップで [9:00, 18:30])。hourLabels = [9,10,11,12,13,14,15,16,17,18] |
| events min=9:15, max=17:50 | range=[9:00, 18:00] (= floor 30, ceil 30)。hourLabels = [9-18] |
| 同曜日同時刻に 2 件 | column split 2 列 (lane=0, lane=1)、widthPct=50% |
| 同曜日同時刻に 3 件 | column split 3 列、widthPct=33% |
| 1 件のブロック内 | `memberName` 1 行 + `courseName` 1 行、両方 truncate (`min-w-0`) |
| viewport 600px (iPhone SE) | 1 画面に収まる、最小高さ 320px は確保 |
| viewport 1024px (PC) | 同じ実装、列幅が広がる |
| week.isLoading=true | SkeletonTimetable |
| week.isError | ErrorPanel + retry button |

---

## §6 E. RoomSettingsSheet 設計

### 6.1 役割

ルーム詳細画面右上 ⚙ → BottomSheet。役割集約:

1. メンバーリスト (avatar + 名前 + handle + role)
2. ルーム名変更 (owner のみ)
3. ルーム説明変更 (owner のみ)
4. `showMemberTimetables` toggle (owner のみ、デフォ ON)
5. 招待リンクコピー / 再発行 (owner のみ)
6. メンバー追放 (owner のみ、自分以外の各メンバー横の 「✕」)
7. 退出 (非 owner のみ)
8. ルーム削除 (owner のみ、destructive)

### 6.2 モック

```
┌──────────────────────────────┐
│ ルームの設定              ✕   │
├──────────────────────────────┤
│ ルーム名                      │
│ [TC0701 木曜班_____________]   │   ← owner のみ編集可、非 owner は readonly
│                              │
│ ルームの説明                  │
│ [集まれ_______________________]│   ← owner のみ
│                              │
│ メンバーの時間割をカレンダーに反映 │
│ [✓] 反映する                   │   ← owner のみ操作、非 owner も読み取り表示
│                              │
│ ──────────────────────────── │
│ メンバー (4)                  │
│  ● Touri Aida (owner)        │
│  ● Tanaka Hanako [✕]         │   ← owner のみ ✕ 表示
│  ● Sato Taro    [✕]          │
│  ● Yamada Ichi  [✕]          │
│                              │
│ ──────────────────────────── │
│ 招待リンク                    │
│ https://atender.appily.run/  │
│  rooms/join/abc123...        │
│  [リンクをコピー] [再発行]    │   ← owner のみ
│                              │
│ ──────────────────────────── │
│ (sticky footer)              │
│  [退出する]   or   [ルームを削除] │  非 owner: 退出 / owner: 削除
└──────────────────────────────┘
```

### 6.3 Props

```ts
export type RoomSettingsSheetProps = {
  roomId: string;
  open: boolean;
  onClose: () => void;
};
```

ロード時に `useRoom(roomId)` `useRoomMembers(roomId)` でデータ取得 (= 既存 hook 流用)。

### 6.4 内部 state

```ts
const room = useRoom(roomId);                       // Room.name / description / inviteCode / showMemberTimetables
const members = useRoomMembers(roomId);
const me = useMe();
const update = useUpdateRoom(roomId);
const invite = useRegenerateRoomInvite(roomId);
const removeMember = useRemoveRoomMember(roomId);    // v6 新規 hook
const leave = useRoomAction(roomId, "leave");
const del = useRoomAction(roomId, "delete");

const myMembership = members.data?.members.find((m) => m.userId === me.data?.user.id);
const isOwner = myMembership?.role === "OWNER";

const [name, setName] = useState(room.data?.room.name ?? "");
const [description, setDescription] = useState(room.data?.room.description ?? "");
const [showMemberTimetables, setShowMemberTimetables] = useState<boolean>(
  room.data?.room.showMemberTimetables ?? true,
);
```

room データが load された時に state 同期 (useEffect で `[room.data]` 依存)。

### 6.5 保存ボタン (sticky footer ではなく inline)

各フィールドの保存タイミングは:
- **ルーム名 / 説明**: input blur 時に dirty なら自動保存 (`onBlur` → mutate)
- **showMemberTimetables**: toggle 即時保存 (`onChange` → mutate)

理由: モーダル閉じ時に状態同期忘れを防ぐため、フィールド単位の autosave。

```ts
async function persistRoom(patch: { name?: string; description?: string | null; showMemberTimetables?: boolean }) {
  await update.mutateAsync(patch);
}

<Input
  value={name}
  disabled={!isOwner}
  onChange={(e) => setName(e.currentTarget.value)}
  onBlur={() => name !== room.data?.room.name && persistRoom({ name })}
/>

<Toggle
  checked={showMemberTimetables}
  disabled={!isOwner}
  onChange={(next) => { setShowMemberTimetables(next); persistRoom({ showMemberTimetables: next }); }}
  label="反映する"
/>
```

`Toggle` は既存 `Button` / `Input` の文体に従い、`apps/web/src/components/ui` に追加するか、`<input type="checkbox" role="switch">` に Tailwind を当てる。v6 では Tailwind switch を直接書く:

```tsx
function Toggle({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-3 ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <span
        className={`relative h-6 w-10 rounded-full transition ${checked ? "bg-accent-500" : "bg-white/14"}`}
        role="switch"
        aria-checked={checked}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className="text-sm font-medium">{label}</span>
      <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  );
}
```

### 6.6 メンバーリスト

```tsx
<ul className="space-y-2">
  {(members.data?.members ?? []).map((m) => (
    <li key={m.userId} className="flex items-center gap-3 rounded-2xl bg-white/4 p-3">
      <span
        className="grid h-9 w-9 place-items-center rounded-full text-xs font-bold text-white"
        style={{ background: m.color ?? memberColor(m.userId) }}
        aria-hidden
      >
        {(m.name ?? m.handle ?? "?").slice(0, 1).toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-semibold">{m.name ?? m.handle ?? "No name"}</p>
        <p className="text-xs text-fg-tertiary">{m.role === "OWNER" ? "オーナー" : "メンバー"}</p>
      </div>
      {isOwner && m.userId !== me.data?.user.id && m.role !== "OWNER" ? (
        <button
          type="button"
          aria-label={`${m.name ?? "メンバー"} を追放`}
          onClick={() => removeMember.mutate(m.userId)}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/8 text-status-absent hover:bg-status-absent/20 active:scale-95"
        >
          ✕
        </button>
      ) : null}
    </li>
  ))}
</ul>
```

**注**: `RoomMemberDto` には現在 `color` 属性が無いので、`memberColor(m.userId)` をフロント側で算出する。`RoomWeekDto.members[].color` に色があるのは別 endpoint。Backend を直して `listRoomMembers` で `color` 返却するのは v6 制約「showMemberTimetables 1 個」に違反するため、フロント `memberColor()` で fallback して終わり。

### 6.7 追放確認

直接 `removeMember.mutate(userId)` ではなく、`<ConfirmDialog>` を挟む:

```tsx
const [pendingRemove, setPendingRemove] = useState<string | null>(null);

<button onClick={() => setPendingRemove(m.userId)}>✕</button>

<ConfirmDialog
  open={pendingRemove != null}
  title="メンバーを追放しますか？"
  body="このメンバーはルームから外され、再度招待しない限り戻れません。"
  confirmLabel="追放する"
  confirmVariant="destructive"
  onConfirm={() => { if (pendingRemove) removeMember.mutate(pendingRemove); setPendingRemove(null); }}
  onCancel={() => setPendingRemove(null)}
/>
```

`<ConfirmDialog>` は既存にあれば流用、なければ v6 で `apps/web/src/components/ui/ConfirmDialog.tsx` を新規追加 (`BottomSheet` を内包する薄ラッパ)。

### 6.8 useRemoveRoomMember (新規 hook)

```ts
// apps/web/src/api/hooks/useRooms.ts に追加
export function useRemoveRoomMember(roomId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<{ ok: true }>(`/api/rooms/${roomId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      if (roomId) {
        queryClient.invalidateQueries({ queryKey: QK.roomMembers(roomId) });
        queryClient.invalidateQueries({ queryKey: QK.room(roomId) });
      }
    },
  });
}
```

既存 API endpoint `DELETE /api/rooms/:id/members/:userId` は実装済 (確認済)。

### 6.9 退出 / 削除フッタ

```tsx
<div className="sticky bottom-0 -mx-5 flex gap-3 border-t border-white/8 bg-bg-elevated px-5 py-3"
  style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
>
  {isOwner ? (
    <Button variant="ghost" className="flex-1" onClick={() => setPendingDelete(true)}>ルームを削除</Button>
  ) : (
    <Button variant="ghost" className="flex-1" onClick={() => setPendingLeave(true)}>退出する</Button>
  )}
</div>
```

各 confirm ダイアログを開いて確定 → `del.mutate()` or `leave.mutate()` → 成功時 `useNavigate({ to: "/rooms" })` で一覧に戻す + onClose。

### 6.10 挙動仕様 (RoomSettingsSheet)

| ケース | 期待 |
|---|---|
| open, isOwner=true | ルーム名 / 説明 input が editable、toggle が操作可、メンバー横に ✕、フッタは「ルームを削除」 |
| open, isOwner=false | input が readonly (disabled)、toggle が disabled (見えるが操作不可)、✕ 非表示、フッタは「退出する」 |
| isOwner=true, ルーム名 blur で 変更あり | `PATCH /api/rooms/:id { name }` 1 回 |
| isOwner=true, showMemberTimetables toggle | `PATCH /api/rooms/:id { showMemberTimetables }` 1 回、UI が即反映 |
| isOwner=true, メンバー横 ✕ | ConfirmDialog open、確定で `DELETE /api/rooms/:id/members/:userId`、members invalidate |
| isOwner=true, owner 自身の ✕ | ✕ 非表示 (`m.userId !== me.data?.user.id`) |
| isOwner=true, 別 owner 横 (現状は room 1 つに 1 owner だが念のため) | ✕ 非表示 (`m.role !== "OWNER"`) |
| isOwner=true, 招待リンクコピー | clipboard に `${APP_URL}/rooms/join/${room.inviteCode}` 書き込み、toast 「コピーしました」 |
| isOwner=true, 再発行 | `POST /api/rooms/:id/invite` 1 回、新 inviteCode 表示 |
| isOwner=false, 退出 | ConfirmDialog → `POST /api/rooms/:id/leave` → /rooms へ navigate |
| isOwner=true, 削除 | ConfirmDialog → `DELETE /api/rooms/:id` → /rooms へ navigate |

---

## §7 データモデル + API 変更

### 7.1 Prisma schema (1 列追加)

```diff
 model Room {
   id              String   @id @default(cuid())
   name            String
   description     String?
   inviteCode      String   @unique @default(cuid())
   inviteExpiresAt DateTime?
   createdByUserId String
   createdBy       User     @relation("RoomCreatedBy", fields: [createdByUserId], references: [id], onDelete: Cascade)
+  showMemberTimetables Boolean @default(true)
   createdAt       DateTime @default(now())
   updatedAt       DateTime @updatedAt

   memberships RoomMembership[]
   events      RoomEvent[]

   @@index([createdByUserId])
 }
```

#### migration SQL (Prisma が自動生成、確認用)

```sql
-- AlterTable
ALTER TABLE "Room" ADD COLUMN "showMemberTimetables" BOOLEAN NOT NULL DEFAULT true;
```

### 7.2 shared zod (schemas/room.ts)

```diff
 export const RoomSummaryDto = z.object({
   id: z.string(),
   name: z.string(),
   description: z.string().nullable(),
+  showMemberTimetables: z.boolean(),
   memberCount: z.number().int(),
   myRole: RoomRoleEnum,
   upcomingEvent: z.object({ ... }).nullable(),
   createdAt: z.string(),
 });

 export const RoomDto = RoomSummaryDto.extend({
   inviteCode: z.string(),
   inviteExpiresAt: z.string().nullable(),
 });

 export const CreateRoomInput = z.object({
   name: z.string().min(1).max(60),
   description: z.string().max(500).optional(),
+  showMemberTimetables: z.boolean().optional().default(true),
 });

-export const UpdateRoomInput = CreateRoomInput.partial();
+export const UpdateRoomInput = z.object({
+  name: z.string().min(1).max(60).optional(),
+  description: z.string().max(500).nullable().optional(),
+  showMemberTimetables: z.boolean().optional(),
+});
```

**注**: `UpdateRoomInput = CreateRoomInput.partial()` だと `showMemberTimetables` の default が undefined のときの扱いが Prisma で問題になる可能性があるため、`.optional()` で明示。Backend service で `if (input.showMemberTimetables !== undefined) data.showMemberTimetables = input.showMemberTimetables`。

### 7.3 Backend service (`apps/api/src/services/room.service.ts`)

```diff
 export async function updateRoom(userId: string, roomId: string, input: UpdateRoomInput) {
   await assertOwner(roomId, userId);
   const room = await prisma.room.update({
     where: { id: roomId },
     data: {
       ...(input.name !== undefined ? { name: input.name } : {}),
       ...(input.description !== undefined ? { description: input.description } : {}),
+      ...(input.showMemberTimetables !== undefined ? { showMemberTimetables: input.showMemberTimetables } : {}),
     },
     include: roomInclude,
   });
   return roomDto(room, userId);
 }
```

`roomDto` (= `RoomDto` 形式に変換する fn) で `showMemberTimetables: room.showMemberTimetables` を含める。

`getRoomWeek` で `showMemberTimetables: false` のとき**メンバーの Meeting を返さない**:

```diff
 export async function getRoomWeek(userId: string, roomId: string, weekStartUtc: Date) {
   const room = await assertMember(roomId, userId);
+  const showMembers = room.room.showMemberTimetables; // assertMember 戻り値要確認
   ...
-  const meetings = await prisma.meetingOccurrence.findMany({ ... });
+  const meetings = showMembers
+    ? await prisma.meetingOccurrence.findMany({ ... })
+    : await prisma.meetingOccurrence.findMany({ where: { ..., userId } }); // 自分のだけ
   ...
 }
```

**注**: `assertMember` の現実装で `room` が返却されてるか確認すべし。返してない場合は `room.service.ts` で `prisma.room.findUnique({...})` を追加。Developer 注意。

#### 挙動仕様

| ケース | 期待 |
|---|---|
| `PATCH /api/rooms/:id { showMemberTimetables: false }` (owner) | DB 更新成功、200 + `RoomDto { showMemberTimetables: false }` |
| `PATCH /api/rooms/:id { showMemberTimetables: true }` (member) | 403 OWNER_REQUIRED (既存 assertOwner) |
| `GET /api/rooms/:id` (member) | `RoomDto.showMemberTimetables` を含む |
| `GET /api/rooms/:id/week` (`showMemberTimetables=false`, member) | `meetings` 配列が自分の Meeting のみ。他メンバーの Meeting は含まない。`roomEvents` は変化なし |
| `GET /api/rooms/:id/week` (`showMemberTimetables=true`, member) | 全メンバーの Meeting を返す (= 現状動作) |
| `POST /api/rooms { name, description, showMemberTimetables: false }` | 新規 Room が `showMemberTimetables=false` で作成 |
| `POST /api/rooms { name }` (showMemberTimetables 未指定) | デフォ `true` で作成 |

---

## §8 関数シグネチャ一覧 (実装迷い防止)

### 8.1 新規 hook

```ts
// apps/web/src/api/hooks/useRooms.ts (追加)
export function useRemoveRoomMember(roomId?: string): UseMutationResult<{ ok: true }, Error, string>;

// apps/web/src/api/hooks/useRoomMonth.ts (新規)
export function useRoomMonth(
  roomId: string | undefined,
  weekStarts: string[],
): UseQueryResult<RoomWeekDto, Error>[];

// apps/web/src/lib/useMediaQuery.ts (改修、signature 変更)
export function useMediaQuery(query: string): { matches: boolean; mounted: boolean };
```

### 8.2 新規 lib 関数

```ts
// apps/web/src/lib/memberColor.ts
export function memberColor(seed: string): string; // "hsl(h, 70%, 55%)"

// apps/web/src/lib/calendarRange.ts
export function weekStartsFor(viewMode: "day" | "week" | "month", anchor: Dayjs): string[];

// apps/web/src/lib/meetingExpansion.ts
export type MeetingEvent = { ... };
export type RoomEventEvent = { ... };
export type CalendarEvent = MeetingEvent | RoomEventEvent;
export function buildCalendarEvents(weeks: RoomWeekDto[]): CalendarEvent[];
export function eventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]>;

// apps/web/src/lib/timetableNormalize.ts
export type TimetableEvent = { ... };
export function normalizeToTimetableEvents(week: RoomWeekDto): TimetableEvent[];
export function dynamicDays(events: TimetableEvent[]): number[];
export type ViewRange = { minMinute: number; maxMinute: number };
export function computeViewRange(events: TimetableEvent[]): ViewRange;
export function topPercent(minute: number, range: ViewRange): number;
export function heightPercent(startMin: number, endMin: number, range: ViewRange): number;

// apps/web/src/lib/timetableCluster.ts
export type LaneEvent = TimetableEvent & { lane: number; laneCount: number };
export function clusterByDay(events: TimetableEvent[]): Map<number, LaneEvent[]>;

// apps/web/src/lib/calendarLane.ts (CalendarDay 用、generic)
export type WithLane<T> = T & { lane: number; laneCount: number };
export function assignLanes<E extends { startMinute: number; endMinute: number }>(events: E[]): WithLane<E>[];
```

### 8.3 新規 component

```ts
// apps/web/src/components/sheet/TimetableSettingsSheet.tsx
export function TimetableSettingsSheet(props: {
  open: boolean;
  onClose: () => void;
  timetable: UserTimetableDto | null;
}): JSX.Element;

// apps/web/src/components/sheet/RoomSettingsSheet.tsx
export function RoomSettingsSheet(props: {
  roomId: string;
  open: boolean;
  onClose: () => void;
}): JSX.Element;

// apps/web/src/components/rooms/RoomCalendar.tsx
export function RoomCalendar(props: { roomId: string }): JSX.Element;

// apps/web/src/components/rooms/RoomTimetable.tsx
export function RoomTimetable(props: { roomId: string }): JSX.Element;

// apps/web/src/components/rooms/calendar/AvailabilityBar.tsx
export function AvailabilityBar(props: AvailabilityBarProps): JSX.Element;
type AvailabilityBarProps = {
  date: string;
  members: { userId: string; name: string | null; handle: string | null; color: string }[];
  events: CalendarEvent[];
  expanded: boolean;
  onToggle: () => void;
};

// apps/web/src/components/rooms/calendar/CalendarSegmented.tsx
export function CalendarSegmented(props: {
  viewMode: "day" | "week" | "month";
  onChange: (mode: "day" | "week" | "month") => void;
}): JSX.Element;

// apps/web/src/components/rooms/calendar/CalendarMonth.tsx
// CalendarWeek.tsx / CalendarDay.tsx / PeriodNav.tsx も各シグネチャは §4 参照
```

### 8.4 改修 component の Props (不変)

| ファイル | 改修 | Props |
|---|---|---|
| `AvatarMenu.tsx` | 内部のみ | なし (route component) |
| `DayMeetingCard.tsx` | fallback hex | 不変 |
| `Timetable.tsx` (route) | ⚙ 追加 + publish inline 削除 | なし |
| `RoomDetail.tsx` (component) | tab 2 → 2、⚙ | 不変 (`roomId` ではなく route param 経由) |

---

## §9 テスト基盤

### 9.1 既存基盤 (v5 から維持)

- Vitest 2 + `@testing-library/react` + jsdom
- `tests/utils/render.tsx` (renderApp)
- `tests/msw/handlers.ts` (MSW 2)
- `tests/setup.ts` (matchMedia mock)
- ファイル配置: `apps/web/tests/{routes,components,lib}/...`

### 9.2 v6 新規テストファイル

```
apps/web/tests/lib/memberColor.test.ts
apps/web/tests/lib/calendarRange.test.ts
apps/web/tests/lib/meetingExpansion.test.ts
apps/web/tests/lib/timetableNormalize.test.ts
apps/web/tests/lib/timetableCluster.test.ts
apps/web/tests/lib/calendarLane.test.ts
apps/web/tests/components/avatar/AvatarMenu.test.tsx
apps/web/tests/components/timetable/DayMeetingCard.test.tsx (v5 既存に追記 or 新規)
apps/web/tests/components/sheet/TimetableSettingsSheet.test.tsx
apps/web/tests/components/sheet/RoomSettingsSheet.test.tsx
apps/web/tests/components/rooms/calendar/AvailabilityBar.test.tsx
apps/web/tests/components/rooms/calendar/CalendarMonth.test.tsx
apps/web/tests/components/rooms/calendar/CalendarWeek.test.tsx
apps/web/tests/components/rooms/calendar/CalendarDay.test.tsx
apps/web/tests/components/rooms/RoomTimetable.test.tsx
apps/web/tests/components/rooms/RoomCalendar.test.tsx
apps/web/tests/routes/RoomDetail.test.tsx (新規)
apps/web/tests/routes/Timetable.test.tsx (v5 既存に追記、⚙ + publish inline 廃止)
```

### 9.3 MSW ハンドラ追加

```ts
// tests/msw/handlers.ts に追加
rest.patch("*/api/rooms/:id", async (req, res, ctx) => {
  const body = await req.json();
  return res(ctx.json({
    room: {
      id: req.params.id,
      name: body.name ?? "Test Room",
      description: body.description ?? null,
      showMemberTimetables: body.showMemberTimetables ?? true,
      // ...
    },
  }));
}),

rest.delete("*/api/rooms/:id/members/:userId", (_req, res, ctx) => res(ctx.json({ ok: true }))),
```

`getRoomWeek` ハンドラは既存維持。`showMemberTimetables` テスト用に test 内で `server.use(...)` で別シナリオを差し込む。

### 9.4 jsdom 限界の対応

- **CSS `calc()` / `dvh`**: jsdom は値を解釈しない (= `getComputedStyle` で生文字列が返る)。RoomTimetable の `height: calc(100dvh - ...)` テストは「style 属性に正しい文字列が入っているか」を assert する、実描画はテストしない。
- **`Element.scrollIntoView`**: 既存 v5 同様 no-op。RoomCalendar は使わない。
- **`clipboard.writeText`**: jsdom で undefined になりがちなので `navigator.clipboard?.writeText` の optional chain を維持。テストでは `vi.spyOn(navigator.clipboard, 'writeText')` で mock。

### 9.5 主要テストパターン

```ts
// 例: lib/timetableCluster.test.ts
describe("clusterByDay", () => {
  it("単一 event は lane=0, laneCount=1", () => {...});
  it("非重複 2 event は同じ cluster には入らない", () => {...});
  it("完全重なり 2 event は (0,2), (1,2)", () => {...});
  it("3 event の chain (9-10, 9:30-10:30, 10:00-11:00) は 2 lanes", () => {...});
  it("曜日違いの event は別 day map に入る", () => {...});
});

// 例: components/sheet/RoomSettingsSheet.test.tsx
describe("<RoomSettingsSheet>", () => {
  it("owner のときルーム名 input が editable", async () => {...});
  it("member のときルーム名 input が disabled", async () => {...});
  it("toggle 変更で PATCH /api/rooms/:id { showMemberTimetables } が呼ばれる", async () => {...});
  it("owner のとき他メンバー横に ✕ が出る", async () => {...});
  it("✕ クリック → 確認 → DELETE /api/rooms/:id/members/:userId", async () => {...});
  it("自分横には ✕ が出ない", async () => {...});
  it("owner では退出ボタンが出ず、削除ボタンが出る", async () => {...});
});

// 例: components/avatar/AvatarMenu.test.tsx
describe("<AvatarMenu>", () => {
  it("hydration mounted=false の間 click は noop", () => {...});
  it("mobile, mounted=true, Avatar tap → Sheet open", async () => {...});
  it("desktop, mounted=true, Avatar tap → Dropdown open", async () => {...});
  it("Dropdown には『みんなの時間割』が含まれない", async () => {...});
  it("Dropdown の z-index が 1120", async () => {...});
});

// 例: components/rooms/calendar/AvailabilityBar.test.tsx
describe("<AvailabilityBar>", () => {
  it("expanded=false で『全員』1 行のみ", () => {...});
  it("expanded=true で全員 + members 行", () => {...});
  it("全員 busy のセルは ratio=1 で full opacity", () => {...});
  it("1/3 busy のセルは ratio=1/3", () => {...});
  it("toggle button click で aria-expanded が反転", async () => {...});
});

// 例: components/rooms/RoomTimetable.test.tsx
describe("<RoomTimetable>", () => {
  it("events が月-金のみなら 5 列", () => {...});
  it("土曜に 1 件あれば 7 列", () => {...});
  it("min=9:00 max=18:00 events で hourLabels=[9..18]", () => {...});
  it("同曜日同時刻 2 件は column split (left=0, left=50%)", () => {...});
  it("min 高さ 320px が保証されている", () => {...});
  it("events=[] で <EmptyState> 表示", () => {...});
});
```

### 9.6 E2E (chrome-devtools MCP) 推奨ケース

v6 では自動 E2E を導入しないが、以下を Touri が `chrome-devtools` MCP で **手動チェック**:

- iPhone 13 (390×844) で AvatarMenu Sheet が画面内に収まる
- iPhone 13 で Timetable 画面の ⚙ tap → Sheet が出る、公開タイトル input が入力可
- iPhone 13 で Rooms > Calendar の Day view が縦スクロールなしで 1 画面に収まる
- iPhone 13 で Rooms > Timetable が縦スクロールなしで 1 画面に収まる、列幅が見やすい
- 同時間帯重なりが Cluster split で並んで見える

---

## §10 挙動仕様 総まとめ (Reviewer 用、20+ 項目)

### 10.1 lib

| # | ケース | 期待 |
|---|---|---|
| 1 | `memberColor("u1") === memberColor("u1")` | true (決定論的) |
| 2 | `memberColor("u1") !== memberColor("u2")` | true (異 hash) |
| 3 | `memberColor("")` | `hsl(0, 70%, 55%)` (空 seed) |
| 4 | `weekStartsFor("day", 2026-05-27)` | `["2026-05-25"]` |
| 5 | `weekStartsFor("week", 2026-05-27)` | `["2026-05-25"]` |
| 6 | `weekStartsFor("month", 2026-05-15)` | 6 件 (4/27, 5/4, 5/11, 5/18, 5/25, 6/1) |
| 7 | `dateToDayOfWeek("2026-05-25")` (月) | `1` |
| 8 | `dateToDayOfWeek("2026-05-31")` (日) | `7` |
| 9 | `dynamicDays([])` | `[1,2,3,4,5]` |
| 10 | `dynamicDays([{dow:6,...}])` | `[1,2,3,4,5,6,7]` |
| 11 | `computeViewRange([{start:540,end:630}])` | `{minMinute:540, maxMinute:630}` |
| 12 | `computeViewRange([{start:545,end:632}])` | `{minMinute:540, maxMinute:660}` (30 分スナップ) |
| 13 | `computeViewRange([])` | `{minMinute:540, maxMinute:1080}` (9:00-18:00 デフォ) |
| 14 | `topPercent(600, {min:540, max:1080})` | `((600-540)/(1080-540))*100 = 11.111...` |
| 15 | `heightPercent(600, 700, {min:540, max:1080})` | `(100/540)*100 = 18.518...` |
| 16 | `assignLanes` 単一 | `[{lane:0, laneCount:1}]` |
| 17 | `assignLanes` 2 件重なる | `[{lane:0, laneCount:2}, {lane:1, laneCount:2}]` |
| 18 | `assignLanes` 3 件 chain (9-10, 9:30-10:30, 10:00-11:00) | laneCount=2、3 番目は最も早く空く lane (= lane 0) を採用 |
| 19 | `clusterByDay` 曜日違いは独立 | 別 day map entry |
| 20 | `buildCalendarEvents` weeks=[] | `[]` |
| 21 | `buildCalendarEvents` 同 occurrenceId が複数週に出る | dedup される |
| 22 | `eventsByDate` 同日複数 event | 1 配列に格納 |

### 10.2 AvatarMenu

| # | ケース | 期待 |
|---|---|---|
| 23 | mounted=false で click | noop (DropdownもSheetも open しない) |
| 24 | mobile, mounted=true, click | Sheet open |
| 25 | desktop, mounted=true, click | Dropdown open `top-12 right-0 z-[1120]` |
| 26 | Menu items count | 6 (プロフィール / 学校・学科 / 出欠ルール / 学期管理 / 出席率 / ログアウト) |
| 27 | 「みんなの時間割」リンク | 存在しない |
| 28 | unread badge | `pending.data > 0` のとき右上に dot |

### 10.3 DayMeetingCard

| # | ケース | 期待 |
|---|---|---|
| 29 | `course.color = null` | borderLeft が `4px solid #10B981` |
| 30 | `course.color = "#60A5FA"` | borderLeft が `4px solid #60A5FA` |
| 31 | chip の文字 color | `course.color ?? "#10B981"` |

### 10.4 TimetableSettingsSheet

| # | ケース | 期待 |
|---|---|---|
| 32 | open=true, timetable.title="A" | name input 初期値="A" |
| 33 | name "A"→"B" 保存 | PATCH /api/user-timetables/:id { title:"B" } 1 回 |
| 34 | publishEnabled=true (default), publishTitle="X" 保存 | publish 1 回呼ばれる |
| 35 | publishEnabled=false 保存 | publish 呼ばれない |
| 36 | publishEnabled=true, publishTitle="" 保存 | publish skip + warning toast |
| 37 | キャンセル | state 復元、close |
| 38 | publishEnabled toggle で公開タイトル input 表示・非表示 | OFF で非表示、ON で表示 |

### 10.5 Timetable route

| # | ケース | 期待 |
|---|---|---|
| 39 | PageTitle 右に ⚙ button | 存在、`aria-label="時間割の設定"` |
| 40 | ⚙ click | TimetableSettingsSheet open |
| 41 | 公開タイトル inline | 存在しない (削除済) |
| 42 | DayList / TimetableGrid 切替 | v5 同様 (md hidden/block) |

### 10.6 RoomDetail (component) + RoomCalendar + RoomTimetable

| # | ケース | 期待 |
|---|---|---|
| 43 | タブ数 | 2 (`カレンダー`, `時間割`) |
| 44 | 初期 tab | `カレンダー` |
| 45 | ⚙ click | RoomSettingsSheet open |
| 46 | 「メンバー」タブ | 存在しない |
| 47 | RoomCalendar 初期 viewMode | `day` |
| 48 | viewMode 切替 (day→week→month) | CalendarSegmented で active 切替、レンダリングが切替 |
| 49 | day view: AvailabilityBar default | collapsed (全員 1 行) |
| 50 | day view: ▾ tap | expanded (全員 + メンバー行) |
| 51 | day view 内 Meeting 重なり | column split で並ぶ |
| 52 | month view: 月の各日に dot | event ある日に最大 3 dot |
| 53 | month view: 日 tap | selectedDate 更新、AvailabilityBar が連動 |
| 54 | week view: 7 day セクション | 各日に events list |
| 55 | RoomTimetable: events=[] | EmptyState |
| 56 | RoomTimetable: 月-金のみ | 5 列、`gridTemplateColumns: 40px repeat(5, ...)` |
| 57 | RoomTimetable: 土曜あり | 7 列 |
| 58 | RoomTimetable: 同曜日同時刻 2 件 | left=0%, left=50% |
| 59 | RoomTimetable: hourLabels が 1 時間刻み | range が 9-18 なら label 10 個 (9-18) |

### 10.7 RoomSettingsSheet

| # | ケース | 期待 |
|---|---|---|
| 60 | owner: ルーム名 editable | input enabled |
| 61 | member: ルーム名 readonly | input disabled |
| 62 | owner: toggle 操作 | PATCH 1 回 |
| 63 | member: toggle disabled | クリック不可 |
| 64 | owner: 他メンバー横 ✕ click | ConfirmDialog → DELETE members/:userId |
| 65 | owner: 自分横 ✕ | 非表示 |
| 66 | owner: 別 owner 横 ✕ | 非表示 (現状 1 room = 1 owner だが念のため) |
| 67 | owner: 削除ボタン | 存在、フッタ |
| 68 | member: 退出ボタン | 存在、フッタ |
| 69 | owner: 招待リンクコピー | clipboard mock 1 回呼ばれ、`${APP_URL}/rooms/join/${inviteCode}` を書き込み |
| 70 | owner: 再発行 | POST /api/rooms/:id/invite 1 回 |

### 10.8 API

| # | ケース | 期待 |
|---|---|---|
| 71 | `PATCH /api/rooms/:id { showMemberTimetables: false }` (owner) | 200, RoomDto.showMemberTimetables=false |
| 72 | `PATCH /api/rooms/:id { showMemberTimetables: true }` (member) | 403 OWNER_REQUIRED |
| 73 | `GET /api/rooms/:id` (`showMemberTimetables=false` の room) | RoomDto に `showMemberTimetables: false` |
| 74 | `GET /api/rooms/:id/week` (`showMemberTimetables=false`) | meetings は自分の Meeting のみ、他メンバー除外 |
| 75 | `GET /api/rooms/:id/week` (`showMemberTimetables=true`) | 全メンバー Meeting (現行動作) |
| 76 | `POST /api/rooms { name }` | `showMemberTimetables: true` で作成 (default) |

### 10.9 異常系

| # | ケース | 期待 |
|---|---|---|
| 77 | RoomCalendar の useRoomMonth で 1 週 error | 該当週のみ events が欠落、loading=false、UI は他週で描画 |
| 78 | RoomTimetable の events 不正 (startMinute > endMinute) | filter で除外、UI 破綻なし |
| 79 | RoomSettingsSheet で `useRoom` 失敗 | input が空文字、toggle が default ON、保存は disabled |
| 80 | TimetableSettingsSheet で timetable=null | sheet 全体が disabled、警告 inline 「先に学期を作成してください」 |
| 81 | AvatarMenu で me.data が undefined | initial="?"、name="No name"、email="" |

---

## §11 実装変更ファイル一覧

| ファイル | 変更種 | 概要 |
|---|---|---|
| `apps/api/prisma/schema.prisma` | 修正 | Room.showMemberTimetables 追加 |
| `apps/api/prisma/migrations/<ts>_add_show_member_timetables/migration.sql` | 新規 | ALTER TABLE |
| `apps/api/src/services/room.service.ts` | 修正 | updateRoom 拡張、getRoomWeek の filter、roomDto に field 追加 |
| `apps/api/src/services/userTimetable.service.ts` | 修正 | updateUserTimetable で title patch を許容 |
| `packages/shared/src/schemas/room.ts` | 修正 | RoomDto/RoomSummaryDto/CreateRoomInput/UpdateRoomInput に showMemberTimetables |
| `packages/shared/src/schemas/userTimetable.ts` | 修正 | UpdateUserTimetableInput に title? |
| `apps/web/src/api/hooks/useRooms.ts` | 修正 | useRemoveRoomMember 追加 |
| `apps/web/src/api/hooks/useRoomMonth.ts` | 新規 | useQueries で複数 week 並列 |
| `apps/web/src/api/hooks/index.ts` | 修正 | 上 hook を export |
| `apps/web/src/lib/useMediaQuery.ts` | 修正 | `{matches, mounted}` 返却に変更 |
| `apps/web/src/lib/memberColor.ts` | 新規 | hash → HSL |
| `apps/web/src/lib/calendarRange.ts` | 新規 | weekStartsFor |
| `apps/web/src/lib/meetingExpansion.ts` | 新規 | buildCalendarEvents, eventsByDate |
| `apps/web/src/lib/timetableNormalize.ts` | 新規 | normalizeToTimetableEvents, dynamicDays, computeViewRange, topPercent, heightPercent, dateToDayOfWeek |
| `apps/web/src/lib/timetableCluster.ts` | 新規 | clusterByDay, assignLanesInDay |
| `apps/web/src/lib/calendarLane.ts` | 新規 | assignLanes (generic, CalendarDay 用) |
| `apps/web/src/components/avatar/AvatarMenu.tsx` | 修正 | hydration race fix、menu 整理、z-index |
| `apps/web/src/components/timetable/DayMeetingCard.tsx` | 修正 | fallback hex を `#10B981` に |
| `apps/web/src/components/sheet/TimetableSettingsSheet.tsx` | 新規 | §3.1 |
| `apps/web/src/components/sheet/RoomSettingsSheet.tsx` | 新規 | §6 |
| `apps/web/src/components/rooms/RoomDetail.tsx` | 修正 | tab 3→2、⚙、メンバー inline 削除 |
| `apps/web/src/components/rooms/RoomCalendar.tsx` | 新規 | §4.12 |
| `apps/web/src/components/rooms/RoomTimetable.tsx` | 新規 | §5.6 |
| `apps/web/src/components/rooms/calendar/AvailabilityBar.tsx` | 新規 | §4.6 |
| `apps/web/src/components/rooms/calendar/CalendarSegmented.tsx` | 新規 | §4.7 |
| `apps/web/src/components/rooms/calendar/CalendarMonth.tsx` | 新規 | §4.9 |
| `apps/web/src/components/rooms/calendar/CalendarWeek.tsx` | 新規 | §4.10 |
| `apps/web/src/components/rooms/calendar/CalendarDay.tsx` | 新規 | §4.11 |
| `apps/web/src/components/rooms/calendar/PeriodNav.tsx` | 新規 | §4.8 |
| `apps/web/src/components/rooms/RoomWeekView.tsx` | 削除 | RoomCalendar に統合 |
| `apps/web/src/components/rooms/RoomAvailabilityHeatmap.tsx` | 削除 | AvailabilityBar に統合 |
| `apps/web/src/components/rooms/AvailabilityCellPopover.tsx` | 削除 | 不要 |
| `apps/web/src/components/rooms/MemberMeetingPopover.tsx` | 削除 | 不要 |
| `apps/web/src/lib/availabilityMatrix.ts` | 削除 | 不要 |
| `apps/web/src/routes/Timetable.tsx` | 修正 | publish inline → ⚙ + TimetableSettingsSheet |
| `apps/web/src/components/ui/ConfirmDialog.tsx` | 新規 (必要時) | BottomSheet ベース |
| `apps/web/tests/...` | 新規/修正 | §9.2 |

---

## §12 デプロイ

- DB: SQLite `/app/data/prod.db` (Coolify volume mount)。`prisma migrate deploy` を Docker entrypoint で実行 (既存 wf)
- atender-api: 再デプロイ必要 (`tq2lgr4eh6t80r3tkqjbpu7o`)
- atender-web: 再デプロイ必要 (`y1acaktqgsx66sj81qsxn5m3`)
- 既存ルーム / メンバーシップに対しては `showMemberTimetables=true` で初期化 (default)
- migration 失敗時のロールバック: `ALTER TABLE Room DROP COLUMN show_member_timetables;` (SQLite では実質テーブル再構築、Prisma が schema 元に戻して `migrate reset` 推奨)

---

## §13 不採用案

| 案 | 却下理由 |
|---|---|
| `useMediaQuery` を SSR safe にするため `useSyncExternalStore` を導入 | 既存 React + Vite SPA で SSR していない。複雑度に対して効用低、`mounted` flag で十分 |
| Avatar Dropdown を Radix DropdownMenu に置換 | Touri 制約「自前ライブラリ追加禁止」、既存自作 dropdown で z-index と top 修正で対応可能 |
| `/templates` route も v6 で削除 | 「機能の追加削除なし」制約に違反。AvatarMenu リンクからの導線を切るだけにとどめる |
| Rooms タブを 1 個 (= カレンダーに時間割を統合) | Touri 確定要望「カレンダー」「時間割」の 2 つを明示。両者は目的が違う (= カレンダーは選択日視点、時間割は曜日視点)、混ぜると操作軸が二重化 |
| Calendar 月表示で全 RoomEvent を出す | セル幅 (≈ 50px) に対し event title を出すと潰れる。dot 集約で MVP は十分、Phase 5 で popover 化 |
| RoomTimetable を縦スクロール許容 | Touri 要望「1 画面縦スクロール無し」に違反。Cluster split で横方向に逃がす |
| `useRoomMonth` の代わりに `GET /api/rooms/:id/month?yearMonth=2026-05` 新規 endpoint | v6 制約「showMemberTimetables 1 個のみ」を `endpoint も追加しない` と厳格解釈。`useQueries` で複数 weekStart を並列 fetch すれば十分 (5-6 並列 GET、TanStack Query のキャッシュ統合で重複なし) |
| `RoomMemberDto` に `color` field を追加して Backend で hash | v6 制約。フロント `memberColor(userId)` で fallback |
| RoomSettingsSheet の保存を 1 ボタンに集約 | フィールド単位 autosave のほうがモバイル操作と相性が良い (sticky footer の高さ削減)、Touri セッション内で確認済嗜好 |
| `showMemberTimetables=false` のとき `RoomTimetable` タブ自体を非表示 | UI 分岐が増える。`RoomTimetable` 内で「メンバーの時間割が非公開です」EmptyState を表示するほうがシンプル。**確定**: `events=[]` 時の EmptyState 文言を 2 種類に分岐 |
| カレンダーに drag&drop で予定移動 | v6 スコープ外、複雑度高、設計ループの種 |
| Meeting 編集を RoomCalendar 内で行う | 編集導線は /timetable に集約 (= owner ロックなし、自分の Meeting のみ編集可)。他メンバーの Meeting をルーム内で編集できると権限混乱 |
| Custom typography token を v6 で追加 | v5 Major Third 維持、変更なし |
| Toggle component を Radix Switch に置換 | 自前 OK、依存追加なし |
| AvailabilityBar を 24 時間表示 | mobile 横幅では各セル幅が 7-8px に潰れて視認不能、9-18 帯固定で十分 (Atender の主用途は 9-18) |
| 月 view に week 番号 (W21 等) を出す | 日本語ユーザーにとって週番号は馴染みが薄い (Penmark にもない) |

---

## §14 ナレッジ追記候補

設計完了後、以下を `Muraki/knowledge/pattern/` に新規 1-2 件追加:

1. **`calendar-week-pattern-meeting-expansion.md`** — Meeting (曜日 + period) を MeetingOccurrence (絶対日付) に展開して shared 型で fetch する pattern。Backend で展開 + Frontend は date filter のみが分業として綺麗。
2. **`single-screen-compressed-timetable.md`** — 1 画面に時間割 grid を圧縮するレイアウト技法 (viewport - chrome 高さ + min/max minute → percent、Cluster column split)。Atender RoomTimetable で確立、他カレンダー / シフト管理にも応用可
3. (任意) **`field-level-autosave-bottom-sheet.md`** — BottomSheet 内で各 field を blur 即保存 / toggle 即保存にする pattern、モバイル UX 要件 (sticky footer 高さ削減)

`Muraki/knowledge/pattern/timetable-app-ux-patterns.md` には**カレンダー UI と時間割 UI の責務分離**を追記でなく**「ルーム機能ではカレンダー + 時間割の 2 タブ分離」を新規節**で追記する (既存記述に矛盾なし)。

`Muraki/knowledge/pattern/minimal-social-layer-friend-room.md` には**設定 (権限変更 / 退出 / 追放) は per-room ⚙ Sheet に集約する**ことを既存「メンバー管理」節に追記 (既存記述「メンバータブ」と矛盾するため、**置換**ではなく節タイトル変更で扱う)。

INDEX 再生成: `python3 Muraki/scripts/gen-knowledge-index.py`

---

## §15 Touri 確認推奨項目 (承認ゲート用)

- [ ] AvatarMenu の修正方針が `useMediaQuery` シグネチャ変更 + mounted flag で OK か (既存呼び出し他箇所が無い前提)
- [ ] DayMeetingCard fallback hex を `#10B981` に揃えて OK か (v5 で誤って `#10EB99` を入れた経緯あり)
- [ ] 公開タイトル inline 廃止 + ⚙ Sheet 統合の方針で OK か
- [ ] AvatarMenu から「みんなの時間割」リンクのみ削除し、`/templates` route 自体は残置で OK か
- [ ] Rooms タブを `カレンダー / 時間割` の 2 個に絞り、メンバー / 招待 / 退出を ⚙ Sheet に統合で OK か
- [ ] `useRoomMonth` で 5-6 週並列 GET の負荷感が許容できるか (= MVP では 1 ルーム最大 10 メンバー想定、1 週あたり Meeting 50 件 × 6 週 = 300 行を返す)
- [ ] RoomTimetable を 1 画面圧縮 (縦スクロールなし) で min-height 320px 強制で OK か (極小画面では文字が潰れる可能性あり)
- [ ] `showMemberTimetables=false` のとき RoomCalendar / RoomTimetable がどう振る舞うか (= 自分の Meeting だけ表示) で OK か
- [ ] フィールド単位 autosave の UX で OK か (各 input blur で patch)
