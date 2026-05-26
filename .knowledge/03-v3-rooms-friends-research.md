---
title: Atender Phase 4 Pre-design Research — Rooms / Friends / Today UX 全面刷新
category: research
project: atender
tags: [phase4, friends, rooms, shared-calendar, spotify-lyrics-scroll, multi-select-chip, avatar-menu, free-time, prisma, tanstack-query]
created: 2026-05-26
sources:
  - https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/many-to-many-relations#self-relations
  - https://www.vertabelo.com/blog/database-model-for-social-networking-site/
  - https://support.timetreeapp.com/hc/ja/articles/204273015
  - https://support.timetreeapp.com/hc/ja/articles/204368935
  - https://support.timetreeapp.com/hc/ja/articles/204856029
  - https://timetreeapp.com/intl/ja/newsroom
  - https://penmark.jp/news/2024/07/04/v3-0-0/
  - https://penmark.jp/guide/
  - https://www.when2meet.com/
  - https://doodle.com/en/features/group-polls/
  - https://github.com/mebtte/react-lrc
  - https://www.npmjs.com/package/@applemusic-like-lyrics/react
  - https://developer.mozilla.org/ja/docs/Web/CSS/CSS_scroll_snap
  - https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView
  - https://www.radix-ui.com/primitives/docs/components/toggle-group
  - https://www.radix-ui.com/primitives/docs/components/dropdown-menu
  - https://www.w3.org/WAI/ARIA/apg/patterns/button/
  - https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
  - https://vaul.emilkowal.ski/
  - https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations
---

# Atender Phase 4 Pre-design Research

調査日: 2026-05-26 / 調査者: researcher (Gemini + ローカル既存コード読解)。
本書は Phase 1 (MVP) / Phase 2 (Redesign 設計) / Phase 3 (入力 UX 修正) に続く **Phase 4 (タブ刷新 + 今日 UX 刷新 + ルーム/フレンド新設)** の Pre-design リサーチ。Architect へのインプット。

## Executive Summary (Architect への 1 枚)

### 設計判断の結論

| 課題                       | 推奨                                                                                                                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **タブ構成**               | bottom 4 タブに変更: 今日 / 時間割 / ルーム / 友達。「みんなの時間割」は「ルーム」内サブ機能に統合、「出席率」は「今日」画面下部または右上アバターメニュー配下、「マイページ」は右上アバターメニュー (Radix DropdownMenu + Vaul drawer 切替) に格納。                            |
| **マイページ移動**         | デスクトップ: Radix DropdownMenu で右上アバターから 5-7 項目 (プロフィール / 出席率 / 学校・学科 / 出欠ルール / ログアウト)。モバイル: 同 trigger を tap で bottom sheet (Vaul Drawer) に切替 (片手操作)。                                                                       |
| **今日 UX (Spotify 風)**   | scrollIntoView block:center behavior:smooth を Tailwind transition-all と組合せ、過去は scale-90 opacity-30 -translate-y-2、現在は scale-105 opacity-100 ring-accent、未来は opacity-70 で表現。framer-motion は不要 (CSS + ネイティブ API で十分)。                              |
| **今日のメイン CTA**       | 画面上部 sticky: 「今日は全出席」primary ボタン。tap で mark-all-present 即送信。展開トグルで個別時限の修正 UI (Penmark 風 出 欠 遅 chip) を inline 表示。授業カードからは出欠 chip を消す (CTA に集約)。                                                                       |
| **時間割入力 (Phase 3 後継)** | periodCount 入力廃止 → startPeriodIndexes: number[] の multi-select chip (Radix ToggleGroup type=multiple)。複数連続 = 1 Meeting (periodCount = N)、複数飛び地 = N Meeting に展開。API は MeetingCreateInput を startPeriodIndexes を受ける単一型に変更、Service で periodCount 群を生成。 |
| **フレンド schema**        | 単一 Friendship テーブル + FriendshipStatus enum (PENDING/ACCEPTED/DECLINED/BLOCKED)。@@unique([senderId, receiverId]) で二重リクエスト防止。User に handle (検索用) と inviteCode (招待リンク用) を追加。双方向 Edge x2 は不採用 (整合性管理が複雑、SQLite で WHERE 句が冗長)。 |
| **ルーム schema**          | Room + RoomMembership (role: OWNER/MEMBER) + RoomEvent。招待方式は TimeTree 流: ルーム保持型 inviteCode + 招待 URL (/rooms/join/:code)。手入力フィールドは廃止 (URL タップで遷移)。RoomInvite テーブル分離は Phase 5 送り。                                                          |
| **共有カレンダー**         | RoomEvent { roomId, authorId, title, start, end, isAllDay }。メンバー誰でも作成・編集・削除可、author だけ表示。MVP では繰り返し予定なし (単発のみ)。TanStack Query refetch で十分、real-time 不要。                                                                            |
| **「みんなの空き時間」**   | Counting Slot Array (15 分粒度 × 7 日 = 672 slot or 12 時限 × 7 = 84 slot) をクライアント側で計算。各メンバーの Meeting (定期) + RoomEvent (絶対日時) を slot にマップ、slot[i] = 空いている人数 でヒートマップ表現。全員空きセルは特別ハイライト。サーバは raw データを返すだけ。 |
| **TanStack Query keys**    | 新規: ["friendships"], ["friendships","pending"], ["rooms"], ["rooms",roomId], ["rooms",roomId,"events",weekStart], ["rooms",roomId,"availability",weekStart]。設計 doc に mutation × invalidate マトリクス 必須 (既存パターン継承)。                                              |

### ★ 強い含意 (Architect が見落とさないこと)

★1. **redesign 設計 (20260515-redesign.md) は書かれているが、リポジトリは未実装** (styles.css が #02040a 黒背景のまま、ui.tsx も white/12 border)。Phase 4 を始める前に redesign の実装が完了しているかを Touri に確認するか、Phase 4 設計 doc は redesign 完了後の状態を前提にする旨を明記すること。タブ刷新と Today UX 刷新は redesign が前提 (CSS variables / Penmark 風 token に依存)。

★2. **タブ 4 個に減らすため、redesign 設計 (5 タブ前提) の §3 ナビゲーション節は破棄して上書き必要**。redesign §3.5 ルートツリーで /templates, /stats を /today, /timetable, /rooms, /friends に置き換え、/stats は /me/stats 等のサブパス化。Templates 画面そのものを廃止するわけではなく、「ルーム」内の「みんなの時間割を見る」サブ機能に再配置。または独立画面のまま残し、アクセス導線だけアバターメニュー経由にする。Architect が選択。

★3. **「みんなの時間割」をルーム内に統合する設計判断は 2 通り**: (A) 既存の public TimetableTemplate 検索を残しつつルームでは「ルームメンバーの時間割を week view で重ねる」だけ。(B) Template 共有は完全廃止して「ルーム内でだけ時間割が見える」モデルに刷新。MVP には (A) を推奨 (既存 schema 維持、Phase 5 で再検討)。

★4. **Friendship テーブル設計の落とし穴**: @@unique([senderId, receiverId]) だけだと「A→B 申請中に B→A 申請」が独立行として通る。MVP では「申請を承認する側が必ず receiver」とする方針なら問題ないが、双方向重複検出のため API レイヤで ペア正規化 ((min(a,b), max(a,b)) で内部保持) が必要かは検討。Penmark は「自分から相手」一方向式 (LINE 友達申請ライク) なので、Atender も同方針なら正規化不要。

★5. **startPeriodIndexes: number[] の連続判定**: chip で [1,2,4] (1限+2限+4限) を選んだ場合、1-2 = 連続 1 Meeting (periodCount=2) と 4 = 単独 Meeting (periodCount=1) の 2 Meeting に分割する Service ロジックが必要。API 入力は startPeriodIndexes のみ、periodCount は backend で算出。設計 doc §6 (API 補強) でこの変換ロジックを明示。

★6. **ルームメンバーの「時間割を共有」は schema 設計上自動**: RoomMembership.userId → User.userTimetables → Meeting で辿れる。新規テーブル不要、API が「メンバー全員の時間割と RoomEvent を返す」endpoint を 1 つ追加するだけ。ただし「共有を許可していないユーザー」を考慮するなら RoomMembership.shareTimetable: Boolean を追加 (MVP では全員共有強制で良い、Phase 5 で opt-in 化検討)。

★7. **Spotify lyrics scroll の auto-scroll 解除**: ユーザーが手動スクロールしたら auto-scroll を OFF (isManualScroll=true)、画面下部に「今に戻る」FAB を出す。onWheel/onTouchMove でのみ検知し、scrollIntoView 自体の smooth scroll で発火しないよう注意。Spotify 公式実装の挙動踏襲。

★8. **TimeTree 招待 URL は 7 日有効・1 ルーム 1 リンク・再発行で旧無効化**。Atender MVP では「単一の Room.inviteCode を Room model に持たせる」または「RoomInvite テーブルで履歴管理」の 2 案。MVP 推奨は前者 (Room に inviteCode 1 個、expiresAt あり、再発行は code 値を更新)。RoomInvite テーブルは Phase 5 で「単発招待」「期限なしリンク」など多様化したくなった時に追加。

---

## A. 既存実装の現状

### A.1 タブ構造とルート (apps/web/src/router.tsx / routes/_root.tsx)

現状 5 タブ (Home / Timetable / Templates / Stats / Settings)、各タブが TanStack Router の独立 route。bottom nav も RootLayout 内で navItems 配列定義 (_root.tsx:3-9)。

タブ追加コストは低い (1 行追記)。タブ削除は多少高い: route 定義 (router.tsx) と routeTree.addChildren から削除。/settings を廃止して /me 配下に潜らせる場合、Settings.tsx の役割を分割する必要あり (プロフィール編集 + 学校変更 + 出欠ルール編集 + ログアウトの 4 機能を Me 画面に再配置 or モーダル化)。

注意: _root.tsx の header は `<Link to="/">Atender::</Link>` だけで、右上はスペース空き。アバターメニュー追加の余地は大きい。

### A.2 API endpoint 一覧 (apps/api/src/routes/)

| File                | Endpoints (簡略)                                                                                                                                                          | Phase 4 影響                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| health.ts           | GET /healthz                                                                                                                                                              | 影響なし                                                                           |
| auth.ts             | (better-auth proxy)                                                                                                                                                       | 影響なし                                                                           |
| me.ts               | GET/PATCH /api/me                                                                                                                                                         | Me 画面再構成で利用継続、handle 追加に伴い PATCH 拡張                              |
| schools.ts          | GET/POST /api/schools, GET/POST /api/schools/:id/departments                                                                                                              | 影響なし                                                                           |
| semesters.ts        | GET/POST/GET:id/PATCH/DELETE /api/semesters                                                                                                                               | 影響なし                                                                           |
| templates.ts        | GET/GET:id/POST/POST:id/copy/PATCH/DELETE /api/timetable-templates                                                                                                        | ★3 判断次第で残置 or ルーム内移管                                                  |
| userTimetables.ts   | GET/GET:id/POST/PATCH/DELETE /api/user-timetables, POST /api/user-timetables/:id/publish-as-template                                                                       | Phase 3 input UX 変更で MeetingCreateInput を startPeriodIndexes 受信に変更        |
| today.ts            | GET /api/today                                                                                                                                                            | レスポンス形は変更不要 (UI 側で並べ替え)                                           |
| attendance.ts       | POST /api/attendance/mark-all-present, POST/DELETE /api/attendance/:occurrenceId                                                                                          | Today 画面の CTA で mark-all-present を使用 (既存利用継続)                         |
| stats.ts            | GET /api/stats?semesterId                                                                                                                                                 | Me メニューから遷移                                                                |
| rules.ts            | GET/PATCH default/PATCH user/DELETE user /api/attendance-rules                                                                                                            | Me 画面に統合                                                                      |

Phase 4 新規 endpoint 概算 (Architect 確定要):
- GET/POST/PATCH/DELETE /api/friendships (+ /accept /decline /block action endpoints)
- GET /api/users/search?handle=... (handle 検索)
- GET/POST/PATCH/DELETE /api/rooms + GET /api/rooms/:id
- POST /api/rooms/:id/leave
- GET /api/rooms/:id/members
- POST /api/rooms/:id/invite (招待コード再発行)
- POST /api/rooms/join (招待コードで参加)
- GET/POST/PATCH/DELETE /api/rooms/:id/events
- GET /api/rooms/:id/week?weekStart=... (週分の Meeting/RoomEvent 一括取得)

### A.3 Prisma schema 現状 (apps/api/prisma/schema.prisma)

既存 models (better-auth 4 + Atender 10): User, Account, Session, Verification, School, Department, Semester, TimetableTemplate, TemplateDaySlot, TemplateCourse, TemplateMeeting, UserTimetable, DaySlot, Course, Meeting, MeetingOccurrence, AttendanceRecord, AttendanceRule。

追加余地:
- User に handle (検索用 ID, null 可) と inviteCode (招待リンク用, @unique @default(cuid())) を追加
- 新規 models: Friendship, Room, RoomMembership, RoomEvent
- User に back-relation 追加: sentFriendships, receivedFriendships, roomMemberships, authoredRoomEvents

破壊変更なし (要望通り「追加のみ」で済む)。schema.prisma の MVP doc 「コピー後は完全同形 (Uniform Shape)」原則は維持。

### A.4 BottomTab.tsx / SideNav.tsx の構造

現状ではこれら専用コンポーネントは存在しない。_root.tsx の RootLayout が両方を内包 (header と nav)。タブ刷新時は:

1. _root.tsx の navItems 配列を更新
2. PC sidebar (md:flex) と mobile bottom nav (md:hidden) の両 nav に同配列を流用
3. アバターメニュー (Radix DropdownMenu) を header 右側に追加

Phase 2 redesign 設計 (20260515-redesign.md §3) で BottomTab.tsx / SideNav.tsx のコンポーネント分離が予定されているが、未実装。Phase 4 で分離するか、_root.tsx 内のまま 4 タブに置換するかは Architect が選択。

### A.5 TanStack Query invalidation 構造

| Hook File                  | queryKeys (現状)                                  | mutation invalidate (現状)                                          |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| useMe.ts                   | ["me"]                                            | useMutation で setQueryData (["me"] を直書き)                       |
| useTodayOccurrences.ts     | ["today", date]                                   | optimistic + onError rollback (cancelQueries/getQueriesData)        |
| useUserTimetable.ts        | ["user-timetables"]                               | onSuccess で ["user-timetables"] + ["today"] 両 invalidate          |
| useTemplates.ts            | ["templates", query]                              | copy mutation で ["user-timetables"] + ["me"] invalidate            |
| useStats.ts                | ["stats", semesterId]                             | (mutationなし、read-only)                                           |
| useSemesters.ts            | ["semesters"]                                     | mutation で ["semesters"] invalidate                                |
| useSchools.ts              | ["schools",q], ["departments",schoolId,q]         | mutation で同 key invalidate                                        |
| useAttendanceRules.ts      | ["attendance-rules", scope]                       | mutation で ["attendance-rules"] invalidate                         |

命名規則は雑 (["today", "current"] vs ["today", "2026-05-26"] の文字列差で別キー扱い)。pattern/tanstack-query-invalidation-matrix.md の queryKey 集約ファイル (src/api/queryKeys.ts) は未導入。Phase 4 ではこの導入が望ましい (新規 friend/room key が大量増殖するため、文字列リテラル散布は事故の元)。

### A.6 Today (Home.tsx) 現状規模

109 行。中身は OccurrenceCard (40 行) + Home 本体 (60 行)。全面差し替え工数:

- OccurrenceCard 廃棄 (出欠 chip 機能を CTA に集約するため)
- Spotify scroll 用 TimetableScroll 新規実装 (~80 行)
- メイン CTA + 個別修正展開 MainAttendanceCTA 新規実装 (~70 行)
- ヘッダー (日付・挨拶) は維持、Mascot は redesign で v1.5 送りされたので Phase 4 でも維持しない方向

合計新規 200 行 / 削除 100 行規模。差し替えコストは中程度、UI 設計 (Spotify scroll の挙動仕様) に時間がかかる。


---

## B. 新機能の技術調査

### B.1 フレンド機能の Prisma スキーマ・パターン

#### 推奨 schema (Single Table + Status enum)

```prisma
model User {
  // 既存 fields ...
  handle      String? @unique  // 検索用 ID (例 "@touri"), null 可
  inviteCode  String  @unique @default(cuid())  // 自分の招待リンク用, 不変

  sentFriendships     Friendship[] @relation("FriendshipSender")
  receivedFriendships Friendship[] @relation("FriendshipReceiver")
}

enum FriendshipStatus {
  PENDING
  ACCEPTED
  DECLINED
  BLOCKED
}

model Friendship {
  id         String           @id @default(cuid())
  senderId   String
  sender     User             @relation("FriendshipSender", fields: [senderId], references: [id], onDelete: Cascade)
  receiverId String
  receiver   User             @relation("FriendshipReceiver", fields: [receiverId], references: [id], onDelete: Cascade)
  status     FriendshipStatus @default(PENDING)
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt
  acceptedAt DateTime?

  @@unique([senderId, receiverId])
  @@index([receiverId, status])
  @@index([senderId, status])
}
```

#### 双方向 Edge x2 を採用しない理由

- 「A が B に申請」「B が A を承認」のフローで, Edge x2 だと 2 行同時更新 (transaction 必須)。1 行 + status enum なら 1 UPDATE で済む
- ブロック判定 (status=BLOCKED) も 1 行で表現可
- 友達一覧クエリは WHERE (senderId=me OR receiverId=me) AND status=ACCEPTED の 1 クエリ。複合 index (receiverId, status) + (senderId, status) で両方向高速

参考: [Vertabelo - Social Network DB Model](https://www.vertabelo.com/blog/database-model-for-social-networking-site/)

#### 招待方法 (どれが MVP か)

| 方式               | 学生向け典型              | Atender MVP 評価                                                                                                            |
| ------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| handle 検索        | Twitter/X, GitHub         | ★ 推奨。@touri のような unique handle を Setup 画面で設定して検索 API GET /api/users/search?handle=... で見つけて申請        |
| 招待リンク URL     | LINE, TimeTree            | ★ 推奨。https://atender.appily.run/friends/add/:inviteCode を LINE 等で共有しタップで遷移して申請                          |
| 招待コード手入力   | Penmark の友達コード      | 候補。inviteCode を 8 桁にし手入力可とする選択肢。MVP では URL タップで十分なので非推奨                                     |
| QR コード          | TimeTree, Instagram       | Phase 5。inviteCode から QR を生成, 相手のカメラで読取。MVP 不要                                                            |

MVP: handle 検索 + 招待リンク URL の 2 系統で十分。Penmark や TimeTree も両方備える。

#### 通知方法 (push なし MVP)

- TanStack Query の ["friendships","pending"] を refetchInterval: 60000 (1 分 polling) で更新
- ヘッダーのアバターアイコンに 未読バッジ (pending リクエスト件数) を出す
- Phase 5 で web push 追加可

参考: [Prisma Self-relations](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/many-to-many-relations#self-relations)

### B.2 グループ/ルーム機能の Prisma スキーマ

```prisma
model Room {
  id              String   @id @default(cuid())
  name            String
  description     String?
  inviteCode      String   @unique @default(cuid())
  inviteExpiresAt DateTime?
  createdByUserId String
  createdBy       User     @relation("RoomCreatedBy", fields: [createdByUserId], references: [id], onDelete: Cascade)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  memberships RoomMembership[]
  events      RoomEvent[]

  @@index([createdByUserId])
}

enum RoomRole {
  OWNER
  MEMBER
}

model RoomMembership {
  id       String   @id @default(cuid())
  roomId   String
  room     Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  userId   String
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  role     RoomRole @default(MEMBER)
  joinedAt DateTime @default(now())
  // 任意: shareTimetable Boolean @default(true)

  @@unique([roomId, userId])
  @@index([userId])
  @@index([roomId])
}

model RoomEvent {
  id          String   @id @default(cuid())
  roomId      String
  room        Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  authorId    String
  author      User     @relation("RoomEventAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  title       String
  description String?
  start       DateTime
  end         DateTime
  isAllDay    Boolean  @default(false)
  color       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([roomId, start])
  @@index([authorId])
}
```

#### 設計判断ポイント

1. Room.inviteCode を Room model に持たせる方式 (MVP 推奨): 1 ルーム = 1 有効リンク。再発行は inviteCode = cuid() で UPDATE。簡潔。
2. RoomInvite テーブル分離は Phase 5 送り: 「複数有効リンク」「期限ごと履歴」が要るときに分離。
3. OWNER 権限: ルーム削除 / メンバー削除 / ルーム名変更を OWNER 限定。MEMBER は退室と event CRUD のみ。
4. onDelete: Cascade に注意: OWNER User 削除でルーム消滅。MVP では受容, Phase 5 でオーナー移譲を検討。
5. RoomEvent の編集権限: MVP は「ルームメンバー全員が誰の event でも編集可」(TimeTree 方式)。author 制限を入れるなら WHERE authorId = me の check を service 層に。

参考: [TimeTree 招待 URL 仕様](https://support.timetreeapp.com/hc/ja/articles/204273015), [TimeTree 期限](https://support.timetreeapp.com/hc/ja/articles/204368935)

### B.3 共有カレンダー (TimeTree 風)

#### 「個人の時間割 (Meeting)」と「ルームイベント (RoomEvent)」の重畳表示

両者は別 schema・別単位:
- Meeting: 曜日 × 時限 (相対), MeetingOccurrence で絶対日時化
- RoomEvent: 絶対日時 (start/end)

ルーム週ビューでの統合表示: クライアント側で 1 週間分の MeetingOccurrence (各メンバー分) と RoomEvent を取得, time grid (例: 月-日 × 24h or 月-日 × 12 時限) に並べる。

```ts
type WeekCell = {
  date: string;
  startMinute: number;
  endMinute: number;
  source: "meeting" | "room-event";
  authorId?: string;
  userId: string;
  title: string;
  color?: string;
};
```

#### API endpoint 設計

```
GET /api/rooms/:roomId/week?weekStart=2026-05-25
応答: {
    meetings: [各メンバーの該当週 MeetingOccurrence ...],
    roomEvents: [該当週の RoomEvent ...],
    members: [userId, name, color ...]
  }
```

クライアントは 1 リクエストで週分のデータを得る。weekStart を変えると別キャッシュ (["rooms", roomId, "week", weekStart])。

#### Phase 5 拡張余地

- 繰り返し event (RoomEventRecurrence model)
- Meeting を RoomEvent 型に統合 (Polymorphic)
- リアルタイム同期 (WebSocket / SSE)

MVP では避ける。

### B.4 「みんなの空き時間」算出ロジック

#### 推奨: Counting Slot Array (クライアント側)

- 1 週 × 12 時限 = 84 slot or 1 週 × 96 (15 分単位) = 672 slot
- 各メンバーの Meeting (定期, 曜日+時限) + MeetingOccurrence (特定日時の出席状況) + RoomEvent を slot にマップ
- slot[i] = 空いている人数

#### 擬似コード

```ts
const totalMembers = members.length;
const slots = new Int32Array(7 * 12);

for (const member of members) {
  const busy = new Uint8Array(7 * 12);
  for (const m of member.meetings) {
    for (let offset = 0; offset < m.periodCount; offset++) {
      const periodIndex = m.startPeriodIndex + offset - 1;
      const idx = m.dayOfWeek * 12 + periodIndex;
      busy[idx] = 1;
    }
  }
  for (const e of roomEvents.filter(e => e.authorId === member.id)) {
    const periods = mapEventToPeriods(e, daySlots);
    for (const idx of periods) busy[idx] = 1;
  }
  for (let i = 0; i < busy.length; i++) {
    if (busy[i] === 0) slots[i]++;
  }
}

// slots[i] === totalMembers なら全員空き
```

#### UI: ヒートマップ vs 全員空きハイライト

- 5-10 人規模だと「全員空き」がスカスカになるリスク
- 推奨: ヒートマップ (opacity = slot[i] / total) で N 人空きを濃淡表現
- 全員空きセルには 特別な border / チェックアイコン で区別
- Doodle / When2meet の UX

#### サーバ計算 vs クライアント計算

| 観点               | サーバ                            | クライアント (推奨)                |
| ------------------ | --------------------------------- | ---------------------------------- |
| 計算量             | DB クエリ複数発生                 | O(members × slots) 一瞬             |
| フィルタリング     | API 再叩き                        | 即時 (例: 「A と B だけの空き」)   |
| キャッシュ         | 全員分の availability             | raw data だけキャッシュ            |
| 拡張性             | 集計仕様変更で API 改修必要       | UI で完結                          |

MVP: クライアント計算。サーバは raw data (/api/rooms/:id/week) を返すだけ。

参考: [When2meet](https://www.when2meet.com/), [Doodle Group Polls](https://doodle.com/en/features/group-polls/)

### B.5 Spotify 歌詞風スクロール UI

#### 推奨: CSS scroll + scrollIntoView (依存追加なし)

framer-motion は不要。scrollIntoView({behavior:"smooth", block:"center"}) とネイティブ scroll-snap で十分。実装イメージ:

- containerRef を useRef でつかむ。isManualScroll を useState で持つ。
- activeIndex は occurrences のうち currentTime が範囲内のものを findIndex で算出。
- useEffect で activeIndex か isManualScroll が変わったときに containerRef.current.children[activeIndex] の scrollIntoView({behavior:"smooth", block:"center"}) を呼ぶ (isManualScroll=true なら何もしない)。
- container に onWheel / onTouchMove を付け, ユーザー操作で isManualScroll=true にする。
- isManualScroll=true の間は「今に戻る」FAB を画面下に固定表示 (button onClick={() => setIsManualScroll(false)})。
- 各 occurrence のクラス分岐は以下。past = scale-90 opacity-30 -translate-y-2, current = scale-105 opacity-100 font-bold ring-2 ring-accent-500, future (どちらでもない) = opacity-70。すべてに snap-center py-6 transition-all duration-500 を共通付与。

#### 注意

- scrollIntoView の smooth scroll は onWheel を発火しないブラウザが多い (Chrome は OK)。isManualScroll フラグの誤動作懸念は低いが要 e2e 確認
- currentTime は 1 分ごと更新する hook (useNow(60_000)) で十分。秒単位は過剰
- prefers-reduced-motion 対応: ユーザー設定で behavior: "auto" に切替
- モバイル: snap-y snap-mandatory で snap が効きすぎると違和感あり; snap-proximity も検討

#### 過去 occurrence 「上に流れて消える」演出

Spotify 公式は過去歌詞を opacity: 0.3 + scale: 0.9 + blur(2px) で薄く表示し, 一定以上スクロールアップすると container 上端で fade out。Atender では:
- 一定数 (例: 過去 5 件) だけ上に残す
- 古すぎる occurrence は display: none で DOM から除去するとスクロール領域を圧迫しない

実装は MVP では「全部 DOM 内にレンダー, opacity だけ操作」で十分 (occurrences は 1 日 5-10 件なので)。

参考: [react-lrc](https://github.com/mebtte/react-lrc), [@applemusic-like-lyrics/react](https://www.npmjs.com/package/@applemusic-like-lyrics/react), [MDN CSS scroll snap](https://developer.mozilla.org/ja/docs/Web/CSS/CSS_scroll_snap)

---

## C. UI/UX 参考

### C.1 TimeTree / Penmark / Spaces の友達/グループ/共有カレンダー UX

#### TimeTree (招待 URL)
- 招待コード入力 UI なし, URL タップで即遷移
- 1 ルーム 1 有効リンク, 再発行で旧無効化
- 期限 7 日 (新規参加の安全装置)
- LINE での共有が圧倒的主流 (deep link 経由で参加プロフィール選択)
- 出典: [TimeTree カレンダーに招待](https://support.timetreeapp.com/hc/ja/articles/204273015)

#### Penmark (フレンド + 友達の時間割)
- bottom tab 5 個: 時間割 / カレンダー / トーク / 掲示板 / マイページ
- 「友達」概念は SNS 機能 (トーク・掲示板) に内包, 明示的な friend tab はない
- マイページから友達一覧アクセス
- 時間割共有は「同じ大学・学科のテンプレ」公開で擬似実現
- 出典: [Penmark v3](https://penmark.jp/news/2024/07/04/v3-0-0/)

#### Atender との差別化
- Atender は 「友達」を独立タブ昇格: 学生間の私的グループ (サークル内 / クラス内) でルームを作りやすくする
- Penmark の「大学全体」 vs Atender の「閉じた友達ルーム」: 後者の方が個人情報配慮しやすく, 学生のニーズに即している (Touri 自身の体感)

### C.2 アバターメニュー (右上アイコン経由でドロップダウン or モーダル)

#### 推奨: Radix DropdownMenu (PC) + Vaul Drawer (Mobile) の切替

実装方針:
- useMediaQuery("(max-width: 767px)") で mobile 判定。
- Mobile: Vaul Drawer.Root を使い, Drawer.Trigger に avatar button, Drawer.Content にメニュー項目。
- Desktop: Radix DropdownMenu.Root を使い, DropdownMenu.Trigger に avatar button, DropdownMenu.Content (align="end" sideOffset=8) にメニュー項目。
- 両方 portal 経由でレンダー (外部クリック / ESC で閉じる)。
- Trigger button は 40x40 rounded-full, img の `<img src={me.image}>` を rounded-full で出す。背景 bg-bg-muted。

#### メニュー項目案 (Phase 4)

- プロフィール編集 (handle, name)
- 学校・学科変更
- 出席率を見る (/me/stats へ遷移)
- 出欠ルール設定
- 学期管理
- ヘルプ
- ログアウト

参考: [Radix DropdownMenu](https://www.radix-ui.com/primitives/docs/components/dropdown-menu), [Vaul Drawer](https://vaul.emilkowal.ski/)

### C.3 開始時限の複数選択 chip パターン

#### 推奨: Radix ToggleGroup type="multiple"

実装方針:
- ToggleGroup.Root を type="multiple" value={value} onValueChange={onChange} aria-label="開始時限を選択" で使う。
- periods は Array.from({length: 12}, (_, i) => `${i+1}`) で 12 個生成 (DaySlot 数に応じて動的)。
- ToggleGroup.Item を map で出す。className は:
  - 共通: inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium transition
  - 未選択: border border-border-default text-text-primary
  - 選択時: data-[state=on]:border-transparent data-[state=on]:bg-accent-500 data-[state=on]:text-white
  - フォーカス: focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500

#### Atender 固有の連続コマ判定

選択された [1, 2, 4] を Meeting 群に変換:

```ts
function periodsToMeetings(periods: number[], dayOfWeek: number) {
  if (periods.length === 0) return [];
  const sorted = [...periods].sort((a, b) => a - b);
  const groups: Array<[number, number]> = []; // [start, count]
  let start = sorted[0];
  let count = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      count++;
    } else {
      groups.push([start, count]);
      start = sorted[i];
      count = 1;
    }
  }
  groups.push([start, count]);
  return groups.map(([startPeriodIndex, periodCount]) => ({
    dayOfWeek,
    startPeriodIndex,
    periodCount,
  }));
}
// [1,2,4] となる → [{start:1,count:2}, {start:4,count:1}]
```

これを MeetingCreateInput で受信 ({startPeriodIndexes: [1,2,4]}), Service 層で 2 Meeting 行に展開。

参考: [Radix ToggleGroup](https://www.radix-ui.com/primitives/docs/components/toggle-group), [W3C ARIA Toggle Button](https://www.w3.org/WAI/ARIA/apg/patterns/button/)

---

## D. 既存ナレッジ照合

### D.1 Muraki/knowledge/pattern/timetable-app-ux-patterns.md

- bottom tab 5 個 が推奨されているが, Phase 4 は 4 個 + 右上アバターメニュー で対応。HIG/MD3 共に 3-5 個範囲内なので逸脱なし。
- 時限可変 (1-12 限) は引き続き必須。Phase 4 では startPeriodIndexes の chip 数も 1-12 で動的生成 (DaySlot に応じて)。
- 連続コマ merge (grid-row: span N) は時間割タブ側で維持。Today タブの Spotify scroll は連続コマ表現ではなく「occurrence 単位の縦並び」なので別ロジック。

### D.2 Muraki/knowledge/pattern/mobile-first-bottom-tab.md

- タブ 4 個は推奨範囲内 (3-5 個)
- safe area / fill icon + label / env(safe-area-inset-bottom) 引き続き必須
- アバターメニューを Drawer (Vaul) でモバイル切替する設計は, bottom tab の浮き上がり問題 (キーボード時) と独立, 干渉なし

### D.3 Muraki/knowledge/pattern/tanstack-query-invalidation-matrix.md

Phase 4 で新規 mutation が 15+ 個発生する見込み:
- useCreateFriendship / useAcceptFriendship / useDeclineFriendship / useBlockUser / useDeleteFriendship
- useCreateRoom / usePatchRoom / useDeleteRoom / useLeaveRoom
- useCreateRoomEvent / usePatchRoomEvent / useDeleteRoomEvent
- useJoinRoomByInviteCode / useRegenerateRoomInviteCode

設計 doc に mutation × invalidate マトリクス 表を必須実装 (既存パターン継承)。queryKey 集約 (src/api/queryKeys.ts) 導入をこのタイミングで強く推奨。

例:
| Mutation                          | Invalidate                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| POST /api/friendships             | ["friendships"], ["friendships","pending"], ["users","search",*]                                       |
| POST /api/friendships/:id/accept  | ["friendships"], ["friendships","pending"]                                                             |
| POST /api/rooms                   | ["rooms"]                                                                                              |
| POST /api/rooms/:id/events        | ["rooms",roomId,"events",*], ["rooms",roomId,"availability",*]                                         |
| POST /api/rooms/join              | ["rooms"]                                                                                              |

### D.4 Muraki/knowledge/pattern/form-modal-readability-bp.md

- アバターメニューが Drawer (Vaul) のとき, sheet 内に「学校変更」「ルール編集」のフォームを内包する場合は本パターン適用
- focus ring outline-2 offset-2 outline-accent-500, label medium 500 / value medium 500 / value primary を厳守
- header divider 必須

### D.5 関連 gotcha (新機能で踏みうるもの)

| gotcha                                                                  | Phase 4 文脈                                                                                  |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| better-auth-test-cookie-must-match-hono-signed-format.md                | Friendship/Room の API テストで session helper が必要, 既存 helper 流用可                     |
| design-must-specify-app-export-path-for-tests.md                        | 設計 doc に apps/api/src/index.ts の export const app を明示 (既存維持で OK)                  |
| tanstack-router-factory-test-memory-history.md                          | 新規 /rooms /friends route のテストで memory history 注入が必要                               |
| hono-error-middleware-apperror-status.md                                | 新規 AppError (例: ROOM_FULL, FRIENDSHIP_EXISTS, INVALID_INVITE_CODE) の status を厳守        |
| prisma-coolify-dockerfile.md                                            | Phase 4 で schema 変更後, prisma migrate dev で migration ファイルを Docker image に含める必要 |

---

## E. Architect への引き継ぎポイント

### E.1 設計 doc 構成案

1. Executive Summary: タブ刷新と新機能 5 軸 (タブ / 今日 UX / 入力 UX / ルーム / 友達 / アバターメニュー)
2. Phase 1-3 設計 doc との関係: §3.5 ナビゲーション置換, §4.1 Today 全差し替え, §4.2 Timetable 入力 UX 変更
3. Prisma schema 追加 (破壊変更なし: User に handle/inviteCode 追加 + 4 model + 2 enum 追加)
4. API 補強: friend (6 endpoint) / room (8 endpoint) / 既存 MeetingCreateInput 変更
5. 画面別仕様: Today / Timetable / Rooms (一覧 + 詳細) / Friends / Avatar Menu の 5 画面
6. コンポーネント仕様: TimetableScroll / MainAttendanceCTA / PeriodChips / AvatarMenu / RoomCard / FriendCard / RoomWeekView / RoomAvailabilityHeatmap
7. TanStack Query: queryKeys 集約導入 + 新規 15+ mutation の invalidate マトリクス
8. 挙動仕様 (Reviewer のテスト根拠): 友達申請の冪等性 / ブロック後の見え方 / ルーム退室の権限 / 招待コード再発行の旧無効化 / 空き時間ヒートマップの境界条件 等
9. テスト基盤: 既存 Vitest + RTL + MSW + jsdom 流用, Spotify scroll は jsdom で scrollIntoView 検証できないので chrome-devtools MCP の E2E 推奨 1 箇所
10. デプロイ: 既存 Coolify 構成, schema migration を含む

### E.2 強い含意の再掲

- ★1 redesign 実装状況を Touri に確認 (黒背景 vs 白背景, ui.tsx の現状)
- ★2 Templates 画面の扱い (ルーム内移管 or 独立残置)
- ★3 「みんなの時間割」のスコープ (public template 検索 vs ルーム内週ビューのみ)
- ★4 Friendship 双方向重複検出をペア正規化するか (Penmark 流の一方向式採用なら不要)
- ★5 startPeriodIndexes を Service で連続判定して Meeting 群に展開するロジックを設計 doc に明示
- ★6 RoomMembership.shareTimetable の opt-in (MVP は強制共有)
- ★7 Spotify scroll の auto-scroll OFF トリガー (onWheel/onTouchMove 検知)
- ★8 招待コードを Room model 直書き vs RoomInvite テーブル分離 (MVP 直書き推奨)

### E.3 不採用案 (再検討ループ防止)

| 案                                                | 不採用理由                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 双方向 Friendship Edge x2                          | 整合性管理が複雑, 1 行 + status enum で十分                                                  |
| 招待コード手入力 UI                                | URL タップで遷移する方が UX 良 (TimeTree 流)                                                  |
| サーバ側「空き時間」算出 API                       | フィルタリング (誰だけ表示) で API 再叩きが発生, クライアント計算で十分                       |
| framer-motion / motion-one 追加                    | Spotify scroll は CSS + scrollIntoView で十分, 依存追加コスト不要                            |
| Headless UI ベース実装                             | Radix UI の方が ARIA 完備 (矢印キー, 文字検索), 2026 デファクト                              |
| FAB (主機能トリガー)                               | bottom tab + sticky CTA で完結, MD3 推奨範囲                                                  |
| 「みんなの時間割」を Phase 4 で独立タブ昇格        | redesign 5 タブ案からの自然な縮減はルーム統合, 独立タブだとさらに 5 タブ案に戻る矛盾          |
| RoomEvent の繰り返し予定 / RoomEventRecurrence    | MVP 範囲外, Phase 5 で TimeTree 同等機能として追加                                           |
| WebSocket / SSE による real-time 同期             | MVP 範囲外, TanStack Query refetch で十分                                                    |
| RoomInvite テーブル分離                            | MVP は Room.inviteCode 直書きで十分, Phase 5 で複数招待リンク対応時に分離                    |
