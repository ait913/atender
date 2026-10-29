# atender Web — iOS と同じ仕様にする (web-parity)

- ブランチ: `feature/web-parity` (1 worktree・1 ブランチ。フェーズ分割しない)
- 触る範囲: **`apps/web` のみ** + 正典の置換 (`CLAUDE.md` / `DESIGN.md`) + 台帳 (`.knowledge/known-failures.md`)。**`apps/api` / `packages/shared` / `apps/ios` は変更しない** (§0.3)
- 正典: **iOS (`apps/ios`) の挙動**。本書の文言・規則は iOS の Swift から転記した確定値。Developer / Reviewer は iOS を読まなくてよい
- 根拠の file:line は 2026-10-30 の main (`399c198`) で引いた

---

## 1. 目的

Touri 要望 (原文):「Web 版の仕様をアプリ版と全く同じにして欲しい。ルームタブとかはアプリではもう消してるし、初期オンボーディングの流れとか、学期の扱いとか (期間をすぎたら表示するとか)、公開時間割を引っ張ってこれるとか」。

Web は iOS の build 17 相当 (5 タブ) で止まっており、build 18 (ルーム集約) / 19 (学期の引継ぎ・終了提案) / 21 のレーン B (科目別の出席基準) / C (公開時間割の提案・取込) が入っていない。加えて本番で効いている穴が 2 つある:

- **W-D1**: 「時間割の設定」を保存するたびに公開トグルが ON に戻って `publish-as-template` を呼ぶ。非公開にする手段が無く、取り込んだ時間割も自分名義で公開される
- **W-D2**: 同シートの「公開時間割から取り込む」は時間割が無いと押せず、時間割があると `replaceExisting` を送らないので 409 で無言に失敗する

本書で Web の機能・遷移・文言を iOS と揃え、上の 2 つを解消する。見た目は Web の現行デザイン言語を維持する (トークンは既に iOS と 1:1)。

---

## 0. スコープ

### 0.1 対象 (iOS と同じにするもの)

| 区分 | 内容 | 節 |
|---|---|---|
| A. IA | ナビ 4 項目 / `/rooms` `/rooms/$id` `/templates` 撤去 / chip「+」を Menu に / 作成・参加後に chip 自動切替 / ルーム設定はホームのギア / 招待 URL はホームの参加シート / 今日・現在コマの強調 | §3, §5.1 |
| B. オンボーディング | 時間割を選ぶ段 / 学期既定値の日付算出 / 完了処理の順序 / 学校・学科ピッカーの共通化 | §5.2 |
| C. 学期 | 学期終了の提案 + 新しい学期シート (提案値・テンプレ提案) / 時限・曜日の引継ぎ / 学期管理の取込ボタン・409 toast | §5.3 |
| D. 公開時間割 | 公開時間割ブラウザ (スコープ固定 + 別の学科 + 中身プレビュー) / 取込判定 (W-D2) / 公開トグル (W-D1) / 非公開化 / 時間割の削除 | §5.4, §5.5 |
| E. 科目別の出席基準 | 科目編集の「出席の基準」/ 科目詳細の「基準:」/ 科目行の「あとN回休める」系 | §5.6 |
| F. 出欠・グリッド | 出欠オーバーレイ (既定展開・自動で閉じる・Now/Next) / ルーム時間割を `recurringMeetings` + `semesterId` に / 授業変更 (振替) / 時間割の削除 | §5.1.6, §5.7 |
| G. ルーム | 作成・参加・設定シートの文言と遷移を iOS に合わせる | §5.1 |
| H. 設定 | 学校・学科を共通ピッカーで / テーマ既定をライトに / 法務リンク 3 つ | §5.8 |

### 0.2 除外 (Web に作らない)

- **QR**: QR で参加・QR で友達追加・自分の QR 表示。Web では Menu の項目ごと・ボタンごと出さない (§10)
- **カレンダー書き出し** (iOS の EventKit 書き出し、設定の「カレンダー」節)。Web に該当機能なし
- 友達タブ: QR 以外は既に同じ 4 節。**変更しない**

### 0.3 触らない

- `apps/api` / `packages/shared`: 必要な endpoint・DTO は全部揃っている (§4)。**API の変更は 0**
- `apps/ios`: iOS 側の不具合を 1 件見つけた (§12-L1) が本ブランチでは直さない
- 見た目のトークン (`styles.css`)。新しい色・角丸・影の token を足さない

---

## 2. 現状の実測 (Researcher 報告を補正した点のみ)

| # | Researcher の記述 | 実測 | 設計への影響 |
|---|---|---|---|
| R1 | iOS の招待リンクは「コード入力済みの参加シートを開く (自動参加しない)」 | `JoinByCodeSheet.swift:79-84`: `initialCode` があると **`.task` で 1 回だけ自動で参加を試みる**。成功で閉じて chip 切替、失敗はシート内にエラー | Web も「ホームに移動 → 参加シートを開いて 1 回だけ自動で参加」(§5.1.4) |
| R2 | iOS の学期管理の新規追加は提案値あり (Web は空) | `SemesterListSheet.swift:13,41-46`: iOS も **空フォーム** (`SemesterForm()`) | 新規追加フォームは**変えない** |
| R3 | 学期削除 409 →「時間割があるため削除できません」toast | iOS は `catch APIError.http(status: 409)` のみ。API は JSON body 付き 409 (`semesters.ts:97`) を返すので iOS では `.api(409)` になり **「削除できませんでした」に落ちている** (iOS のバグ) | Web は**意図どおり** 409 で専用文言を出す (§5.3.4)。iOS 側は §12-L1 |
| R4 | `publish-as-template` が授業 0 件を拒否するか未確認 | `userTimetables.ts:133-191`: **拒否しない** (0 件のテンプレが作られる)。授業 0 件の抑止はクライアント (`TimetablePublishLogic`) の責務 | §6.7 の規則をそのまま写す。API 変更は要らない |
| R5 | ルーム設定の項目は同じ | 項目は同じだが文言が 6 か所違う (「ルームの説明」/「メンバーの時間割を表示」+「反映する」/ 追放が ✕ アイコン / 確認ダイアログに本文 / 確認ボタン「追放する」等 / 参加シートに「キャンセル」) | §5.1.5 で iOS 文言に揃える |
| R6 | テーマ既定 auto | iOS は `@AppStorage("atender.theme") = ThemePreference.light` (`AtenderApp.swift:6`)。Web は未保存 = auto | §5.8.3 |
| R7 | (記載なし) | MSW 既定の `GET /api/semesters` は `endDate: "2026-09-30"`。今日 (2026-10-30) 時点で**全学期が終了扱い**になり、本書の学期終了提案がホームを描く全ルートテストで出る | §8.2 で既定 fixture の `endDate` を `2099-03-31` に変える |

---

## 3. ルーティング (before → after)

`apps/web/src/router.tsx` 1 枚で完結する (コードベースルーティング)。

| パス | before | after |
|---|---|---|
| `/` | Home | Home (変更なし。`requireCompleteSetup`) |
| `/semester` `/friends` `/settings` `/setup` `/signin` `/verify` | 各画面 | 変更なし |
| `/friends/add/$inviteCode` | 友達申請 | 変更なし |
| `/timetable` `/stats` `/me` `/login` `/settings/calendar` `/settings/integrations/google` | redirect | 変更なし |
| `/rooms` | ルーム一覧 | **`beforeLoad: () => { throw redirect({ to: "/" }) }`** (component なし) |
| `/rooms/$id` | ルーム詳細 | **同上 → `/`** |
| `/templates` | 公開時間割 (dev 品質) | **同上 → `/`** |
| `/rooms/join/$inviteCode` | 表示と同時に参加 → `/rooms/$id` | **`beforeLoad`: ① `pendingRoomJoin.set(params.inviteCode)` ② `await requireCompleteSetup(...)` ③ `throw redirect({ to: "/" })`**。component なし。ホームが pending を消費して参加シートを開く (§5.1.4) |

- ナビ (`components/layout/navItems.ts`、BottomTab と SideNav が共有): **4 項目** `ホーム (/) / 学期・科目 (/semester) / 友達 (/friends) / 設定 (/settings)`。アイコンは現行のまま (ルームの `Users` 行を削除するだけ)
- `/rooms/join/$inviteCode` の pending を **①で先に書く**のは、未サインイン・セットアップ未完了で redirect されても SPA 内の遷移でホームに戻れば拾えるようにするため (iOS の `pendingDeepLink` と同じ)。ページを読み直すサインイン (Magic Link / Google) を挟むと消える (メモリだけ。§10)

---

## 4. API (変更なし。Web が新たに叩くもの)

| endpoint | 用途 | 節 |
|---|---|---|
| `GET /api/timetable-templates?schoolId&departmentId&limit=20` | 提案・ブラウザ一覧 (`q` / `cursor` は送らない) | §5.2, §5.4 |
| `POST /api/timetable-templates/:id/copy` `{semesterId, replaceExisting?: true}` | 取込 (置換は `replaceExisting: true`) | §5.4 |
| `PATCH /api/timetable-templates/:id` `{isPublic: false}` | 非公開化 | §5.5 |
| `DELETE /api/user-timetables/:id` | 時間割の削除 | §5.5 |
| `GET /api/rooms/:id/week?weekStart&semesterId` | ルーム時間割 (`recurringMeetings` を使う) | §5.1.3 |
| `POST /api/class-transfers` / `DELETE /api/class-transfers/:id` | 授業変更 | §5.7 |
| `POST /api/semesters` / `PATCH /api/me {defaultSemesterId}` | 学期作成と既定化 | §5.2, §5.3 |

DTO はすべて `@atender/shared` のものを使う (`UserTimetableDto.publishedTemplate` / `sourceTemplateId`、`MeResponseDto.user.schoolName` / `departmentName` / `requiredAttendanceRate`、`CourseStatsDto.requiredAttendanceRate` / `rule` / `remainingLessons` / `absenceLessons` / `allowedAbsenceLessons` / `limitedBy`、`RoomWeekDto.recurringMeetings`、`DayDetailDto.transfers`、`OccurrenceDto.transferId`、`ClassTransferCreateInput` / `ClassTransferDto`)。

**`publishedTemplate` は `GET /api/user-timetables` (一覧) にだけ載る** (POST / PATCH / copy の応答には無い)。公開トグルの初期値は一覧のキャッシュから取った時間割で判定する (§6.7)。

---

## 5. 画面ごとの UI・文言・遷移

文言は全て iOS の確定値。`data-testid` は iOS の `accessibilityIdentifier` と同じ文字列を使う (Reviewer がそのまま引ける)。新しい UI は既存部品 (`BottomSheet` / `Button` / `Field` / `Input` / `Select` / `Toggle` / `NumberStepper` / `ConfirmDialog` / `Skeleton` / `EmptyState`) で組む。

### 5.0 共通部品の拡張 (先に入れる)

| 部品 | 変更 |
|---|---|
| `components/sheet/BottomSheet.tsx` | `stackLevel?: 1 \| 2 \| 3` (3 = overlay `z-[1140]` / content `z-[1150]`)。`onBack?: () => void` を足し、あるときはタイトルの左に「戻る」ボタン (`aria-label="戻る"`、`ChevronLeft`、44×44、閉じるボタンと同じ見た目) を出す |
| `components/ui/ConfirmDialog.tsx` | `body?: string` (無ければ本文の `<p>` を描かない)、`cancelLabel?: string` (既定 `"キャンセル"`)、`stackLevel?: 1 \| 2 \| 3` (既定 1、`BottomSheet` に渡す) |
| `lib/toast.ts` (新規) + `components/ui/ToastHost.tsx` (新規) | 全画面共通の toast。`showToast(message: string): void` を呼ぶと 2600 ms 表示 (表示中に次が来たら置き換えてタイマーを張り直す)。`ToastHost` は `routes/_root.tsx` の `RootLayout` で `AuthLayout` / `AppLayout` の外側に 1 個置く。見た目は既存 `Toast` と同じクラスで `z-[1200]` (シートより上)。`role="status"` |
| `lib/pendingRoomJoin.ts` (新規) | `set(code: string)` / `take(): string \| null` (取り出すと消える)。モジュール変数のみ |

### 5.1 ホーム (`/`)

#### 5.1.1 構成

```
[自分] [情報科学1年] [＋]                         ← ContextChips (横スクロール)
2026 後期 ⌄                              [⚙]      ← HomeSemesterPicker。⚙ は context で変わる
┌ 時間割グリッド (自分 or ルーム) ─────────────┐
│ 月 火 [水] 木 金      ← 今日の曜日を強調      │
│ 1限 …                                        │
│ [2限] …  ← 現在の時限を強調 + 交点に枠        │
└──────────────────────────────────────────────┘
━━━━━━ (出欠の開閉)                              ← 自分 context のみ。§5.1.6
```

- `HomeSemesterPicker` を `SelfTimetableView` から `Home` へ移し、**自分・ルームの両方で出す** (iOS は toolbar に常時ある)。ルームの時間割は選択中の学期で引く (§5.1.3)
- ⚙ (trailing): context = 自分 → `aria-label="時間割の設定"` で `TimetableSettingsSheet` を開く (既存の見た目)。context = ルーム → `aria-label="ルームの設定"`、`data-testid="home-room-settings"` で `RoomSettingsSheet` を開く
- 学期選択の初期値 (iOS `applyDefaultSemester` / `applyFallbackSemester`): `semesterId` が null の間、`me.user.defaultSemesterId` があればそれ、無ければ `semesters[0].id`。一度入ったら me の変化では上書きしない

#### 5.1.2 chip の「+」(Menu)

- 「+」ボタン: `aria-label="ルームを追加"`、`data-testid="rooms-add"`、`aria-haspopup="menu"`。押すと `role="menu"` のポップオーバー (実装は `MainAttendanceCTA` の一括メニューと同じ自前方式: 外側 pointerdown / Escape で閉じる)
- 項目 (`role="menuitem"`、この順): **`ルームを作成`** → `RoomCreateSheet` / **`リンクで参加`** → `JoinByCodeSheet (initialCode なし)`。QR 項目は出さない
- 作成成功: シートを閉じる → `rooms` を再取得 → **context をそのルームに切り替える**
- 参加成功: 同上 (参加したルームに切り替える)

#### 5.1.3 ルーム context の時間割 (`components/rooms/RoomTimetable.tsx`)

- props: `{ roomId: string; semesterId: string | null }`。`roomId` が変わったら中身を作り直す (`key={roomId}`)
- 取得: `GET /api/rooms/:id/week?weekStart=<SchoolClock の今日の週の月曜>&semesterId=<semesterId があれば>`。query key `QK.roomWeek(id, weekStart, semesterId ?? "none")`
- 描画: `RoomTimetableLogic.buildRecurringEvents(week)` (§6.11) で `recurringMeetings` から作る。**`week.meetings` (日付ベース) はもう使わない**
- 行 (`daySlots`): `RoomTimetableLogic.resolveDaySlots({ preferredSemesterId: semesterId, defaultSemesterId: me.defaultSemesterId, timetables })`
- 列: `RoomTimetableLogic.displayDays(events)`
- 状態: loading = 既存の `TimetableGridSkeleton` / error = `Panel` に `"時間割を読み込めませんでした。"` / events 0 件 = `EmptyState` タイトル `members.length === 0 ? "メンバーがいません" : "メンバーの時間割がまだありません"` (現行どおり)
- `TimetableView` に今日・現在コマを渡す (§5.1.7)。`data-testid="room-timetable"` を外側に付ける

#### 5.1.4 招待リンクからの参加

- ホームのマウント時に `pendingRoomJoin.take()` が非 null なら `JoinByCodeSheet initialCode=<code>` を開く
- `JoinByCodeSheet` (iOS `RoomJoinSheets.swift:39-102`):
  - タイトル `"リンクで参加"`。中身: `Field label="招待リンクまたはコード"` + (エラー時) 赤字のエラー文。**footer は「参加」(primary) だけ** (キャンセルボタンは無い。閉じるは ×)
  - 「参加」: `disabled = code === "" || pending`。`POST /api/rooms/join {inviteCode: RoomTimetableLogic.parseInviteCode(code)}` (§6.11)。成功 → シートを閉じて `onJoined(room.id)`。失敗 → エラー文 = `ApiError.message` (サーバーの message をそのまま。iOS も同じ)、シートは開いたまま
  - `initialCode` があるとき: 開いた直後に `code = initialCode` を入れて **1 回だけ**自動で「参加」と同じ処理を走らせる (2 回目以降の再描画では走らない)
  - QR ボタンは出さない

#### 5.1.5 ルームのシート (文言を iOS に合わせる)

`RoomCreateSheet` (iOS `RoomJoinSheets.swift:3-37`):
- タイトル `"ルームを作成"`、`Field label="ルーム名"` / `Field label="説明"` (Textarea)、footer `キャンセル` (ghost) / `作成` (primary、`name === "" || pending` で disabled)
- 失敗: `showToast("保存できませんでした、もう一度試してください")`、シートは開いたまま
- props に `onCreated(room: RoomDto)` を足す

`RoomSettingsSheet` (iOS `RoomSheets.swift:68-275`)。現行 Web から次を置換する:

| 箇所 | before (Web) | after (iOS) |
|---|---|---|
| 説明の見出し | `ルームの説明` | `説明` |
| 表示トグル | 見出し `メンバーの時間割を表示` + Toggle `反映する` | Toggle 1 つ、label `メンバー時間割を表示`。失敗したら元の値に戻して `showToast("保存できませんでした、もう一度試してください")` |
| メンバー行の 2 行目 | `オーナー` / `メンバー` | `@{handle ?? userId の先頭 8 文字} · {オーナー \| メンバー}` |
| 追放 | ✕ アイコン | `Button variant="ghost" size="sm"` 文言 `追放` (オーナーが自分・オーナー以外の行に出す。現行の出す条件は不変) |
| 確認ダイアログ | 本文あり / 確認 `追放する` `退出する` `削除する` | **本文なし** / 確認 `追放` `退出` `削除`。タイトルは現行どおり `メンバーを追放しますか？` `ルームを退出しますか？` `ルームを削除しますか？` (全角？) |
| 招待リンク | `リンクをコピー` / `再発行` | 同じ + `navigator.share` が関数のときだけ `共有` (`navigator.share({ url })`) を間に足す |
| 退出・削除後 | `/rooms` へ遷移 | `onRemoved()` を呼ぶ (ホームが context を自分に戻し、rooms を再取得)。遷移しない |
| 失敗時 | 無反応 | 名前・説明の保存 / 再発行: `保存できませんでした、もう一度試してください`、追放: `削除できませんでした`、退出: `退出できませんでした`、削除: `削除できませんでした` (いずれも `showToast`) |

props: `{ roomId: string; open: boolean; onClose: () => void; onChanged?: () => void; onRemoved?: () => void }`。

#### 5.1.6 出欠オーバーレイ (自分 context のみ。`SelfTodayCTA` + `MainAttendanceCTA`)

iOS `HomeAttendanceOverlay.swift` の 2 段の開閉を写す。見た目は Web 現行 (下端固定の半透明バー) を使う。

| 状態 | 表示 |
|---|---|
| 今日の occurrence 0 件 | 何も出さない (現行どおり) |
| `tileOpen = false` | 開閉バーだけ (`role="button"`、`aria-label="出欠の開閉"`、`data-testid="attendance-grabber"`、幅 42×高 5 の capsule を高さ 36 の帯の中央に) |
| `tileOpen = true` | 開閉バー + タイル: ① Now/Next 行 ② 一括ボタン + 一括メニュー (現行) ③ 「各コマの出欠」ボタン |
| `detailOpen = true` | ③で開閉する各コマの出欠パネル (現行の `ExpandedPanel`)。**`tileOpen` と独立** (タイルが自動で閉じても開いたまま) |

- タイル ①: `NowNextText.statusLabel(state)` が非 null かつ state ≠ noClass のとき、小さい字で `"{statusLabel}"` + (detail があれば) `" · {detail}"`。その下の行に `NowNextText.title(state)` (太字、2 行まで) を一括ボタンの左に置く (§6.12)
- タイル ②: 文言は現行どおり (`今日は全出席 (N)` / `本日の記録は完了済` / `全部 欠席 (N)` 等)
- タイル ③: `aria-label = detailOpen ? "各コマの出欠を閉じる" : "各コマの出欠を開く"`、`data-testid="cta-expand-toggle"`、アイコンは現行 (ChevronUp / ChevronDown)
- `tileOpen` の規則 (iOS と同じ):
  - **today の `date` が初めて入ったとき・変わったとき** に `tileOpen = HomeAttendance.defaultExpanded(occurrences)` (未記録が 1 件以上なら開く)
  - 未記録数が **1 以上から 0 になったとき** `tileOpen = false` (0 → 0 は何もしない)
  - 開閉バーのクリックで反転。開閉バー上の pointer ドラッグ: pointerup 時の移動量で `HomeAttendance.shouldCollapse` (開いているとき) / `shouldExpand` (閉じているとき) が true なら閉じる / 開く
- `state` は `TodayTimeline.state(occurrences, SchoolClock.nowMinute(now))`。`now` は `useNow(60_000)`
- 日付の切替: 1 分ごとの `now` で `TodayTimeline.isStale(today.data?.date, now)` が true かつ `today.data` があり取得中でないとき `today` を refetch する

#### 5.1.7 今日・現在コマの強調 (`TimetableView`)

- props を追加: `todayDisplayDay?: number | null` (1=月…7=日)、`currentPeriodIndex?: number | null`
- 自分・ルームとも `todayDisplayDay = SchoolClock.displayDay(now)`、`currentPeriodIndex = TimetableGridLayout.currentPeriodIndex(daySlots, SchoolClock.nowMinute(now))` を渡す (`now = useNow(60_000)`)
- 描き方 (DESIGN 準拠、iOS `TimetableGridPhaseB.swift:54-61,120-143` の写し):
  - 曜日ヘッダー: 今日の列は `font-bold`、文字 `text-accent-500`、背景 `color-mix(in srgb, var(--color-accent-500) 6%, transparent)`、`data-today="true"`
  - 時限ラベル: 現在の時限は背景 `bg-accent-500`、文字 `text-fg-on-accent`、`data-current="true"`
  - 交点: 今日の列に「現在の時限を含む」ブロック (coalesce 後) があればそのブロック全体、無ければ現在の時限の 1 セルを、`2px` の `accent-500` の枠で囲む (`data-testid="timetable-now-ring"`、1 個だけ)
  - 今日の列が `days` に無い (週末で非表示等) / `currentPeriodIndex == null` のときは枠を出さない (ヘッダーとラベルの強調は個別に出す)

### 5.2 オンボーディング (`/setup`、`routes/Setup.tsx` を作り直し)

#### 5.2.1 段

| step | 出る条件 | タイトル (`PageTitle` の下の行) |
|---|---|---|
| `school` | 常に | `Step 1/{T}: 学校を選ぶ` |
| `department` | 常に | `Step 2/{T}: 学科を選ぶ` |
| `template` | 学科確定後の提案が 1 件以上 | `Step 3/{T}: 時間割を選ぶ` |
| `semester` | 常に | `Step {T}/{T}: 学期を作る` |

`T = suggestions.length > 0 ? 4 : 3`。見出しは `PageTitle title="セットアップ"`。

#### 5.2.2 学校・学科 (`components/setup/SchoolDepartmentPicker.tsx`、新規・共用)

`step` が `school` / `department` の間は `SchoolDepartmentPicker allowsCreate` を出し、`step` は picker の `stage` に従う (picker で学校を選ぶと department に、「変更」で school に戻る)。

`SchoolDepartmentPicker` (iOS `SchoolDepartmentPicker.swift`):

```ts
type Props = {
  allowsCreate: boolean;
  value: { school: SchoolDto | null; department: DepartmentDto | null };
  onChange: (next: { school: SchoolDto | null; department: DepartmentDto | null }) => void;
  disabled?: boolean;
};
// stage は value から導出: school == null → "school"、それ以外 → "department"
```

- stage school:
  - `Input placeholder="学校名で検索"` (ラベルなし) + `Select` (都道府県。値 `"", 北海道, 東京都, 千葉県, 神奈川県, 埼玉県, 大阪府, 京都府, 愛知県, 福岡県`、`""` の表示は `都道府県`)
  - 入力・都道府県の変化から **300 ms 後**に `GET /api/schools?q&prefecture&limit=20` (空文字は送らない。空でも検索する)。古い応答 (入力が変わった後に返ったもの) は捨てる
  - 結果: 1 件ずつボタン `○ {name}` → `onChange({ school, department: null })`
  - `allowsCreate` のとき `＋ リストに無い学校を追加` (query が空 / 作成中は disabled) → `POST /api/schools {name: query, kind: "OTHER", prefecture?}` → 成功でその学校を選ぶ
- stage department:
  - 行 `{school.name}` + 右に `変更` ボタン → `onChange({ school: null, department: null })`
  - `Input placeholder="{school.name} の学科名で検索"`、300 ms 後に `GET /api/schools/:id/departments?q`
  - 結果ボタン `○ {name}`、選択中は `border-accent-500 bg-accent-50` (現行 Setup と同じ) → `onChange({ school, department })`
  - `allowsCreate` のとき `＋ 学科を追加` (secondary。query が空 / 作成中は disabled) → `POST /api/schools/:id/departments {name}` → 成功でその学科を選ぶ
- エラー: 検索・作成の失敗は picker の上に赤字で `ApiError.message`

Setup の department 段の下: `戻る` (ghost → 学校の段へ) / `次へ` (primary、学科未選択 / 送信中は disabled)。

「次へ」(`submitDepartment`):
1. `PATCH /api/me {schoolId, departmentId}`。失敗 → エラー表示して止まる
2. `GET /api/timetable-templates?schoolId&departmentId&limit=20` → `TemplateSuggestionLogic.visible` を `suggestions` に。**取得失敗は空配列** (エラーを出さない)
3. `selectedTemplateId = null`、`step = suggestions.length > 0 ? "template" : "semester"`

#### 5.2.3 時間割を選ぶ (`data-testid="setup-template-step"`)

```
✓ 同じ学科の時間割が見つかりました                     (太字)
{学校名} {学科名} で公開されている時間割を、そのまま自分の学期に取り込めます。
┌ card (data-testid="setup-template-card-{id}") ────────┐  選択中: accent-500 枠 + accent-50 塗り
│ ◉/○ {title}                                          │
│      {sizeText}                                       │
│      {metaText(t, meId: null)}                        │
│      中身を見る ⌄   ← 押すとカード内に previewRows を展開 (行 "{weekday} {periodText} {courseName}" + detail) │
└───────────────────────────────────────────────────────┘
[ この時間割で進む ]  primary  data-testid="setup-template-use"  (未選択なら disabled)
[ 使わずに進む ]      secondary data-testid="setup-template-skip"
[ 戻る ]              ghost
```

- カードのタイトル部分を押す → `selectedTemplateId = id` (`aria-pressed`)
- 「この時間割で進む」→ `step = "semester"` / 「使わずに進む」→ `selectedTemplateId = null`、`step = "semester"` / 「戻る」→ `suggestions = []`、`selectedTemplateId = null`、学科の段へ (学校・学科の選択は保持)

#### 5.2.4 学期を作る

- `selectedTemplateId` があるときフォームの上に `取り込む時間割: {title}` + `変更` (ghost sm。学期作成済みなら disabled) → `step = "template"`
- `Field label="名前"` / `Field label="開始日"` (`type=date`) / `Field label="終了日"`。初期値 `SemesterRollover.initialProposal(SchoolClock.todayString())` (§6.3)。**学期作成済み (`createdSemesterId != null`) の間は 3 つとも disabled**
- ボタン: `戻る` (ghost。作成済み / 送信中は disabled。`suggestions.length > 0` なら template へ、それ以外は学科の段へ) / `完了して時間割を作る` (primary)
- `copyFailed` のとき: 赤帯 `学期は作成しました。時間割を取り込めませんでした` + `もう一度` (primary) + `取り込まずに完了` (secondary)。「戻る」「完了して時間割を作る」は出さない

完了処理 (`submitSemester`) = `SemesterCreationPlan.steps("onboarding", createdSemesterId, selectedTemplateId, templateCopied)` (§6.5) を先頭から:

| step | 処理 | 失敗時 |
|---|---|---|
| `createSemester` | `POST /api/semesters {name, startDate, endDate}` → `createdSemesterId` | エラー表示、中断 |
| `copyTemplate` | `POST /api/timetable-templates/:id/copy {semesterId: createdSemesterId}` (`replaceExisting` は送らない)。成功 or **409** → `templateCopied = true` | 409 以外 → `copyFailed = true`、中断 |
| `setDefaultSemester` | `PATCH /api/me {defaultSemesterId: createdSemesterId}` | エラー表示、中断 |
| `refreshMe` | `queryClient.fetchQuery({...meQueryOptions, staleTime: 0})` → `navigate({ to: "/" })` | — |

- 「もう一度」: `copyFailed = false` にして `submitSemester()` (plan は `[copyTemplate, setDefaultSemester, refreshMe]`)
- 「取り込まずに完了」: `selectedTemplateId = null` にして `submitSemester()` (plan は `[setDefaultSemester, refreshMe]`)
- エラー表示 = 段の上の赤帯に `ApiError.message`

### 5.3 学期

#### 5.3.1 学期終了の提案 (ホーム)

iOS `HomeCore.swift:131-173`。

- 評価 = `SemesterRollover.promptTarget(semesters, SchoolClock.todayString(), localStorage["atender.semesterRollover.dismissedSemesterId"])` (§6.3)
- 評価する時点 (どれも「ホームのシート (ルーム作成・参加・設定・新しい学期) が開いていない、かつ提案ダイアログが出ていない」ときだけ):
  1. ホームのマウント後、`semesters` の取得が初めて成功したとき (マウントごとに 1 回)
  2. `document.visibilityState` が `"visible"` になった `visibilitychange` (ホームがマウントされている間だけ購読)
  3. (ホームへ戻る = ホームの再マウント。1 で拾う)
- 結果が非 null なら `ConfirmDialog`:
  - title `前回の学期が終了しました`
  - body `SemesterRollover.alertMessage(previous)` = `「{name}」は {yyyy年 M月d日} に終了しました。新しい学期を作成しますか?`
  - 確認 `作成する` (`confirmVariant="primary"`) → `SemesterCreateSheet` を `proposal = SemesterRollover.proposal(previous, today)` で開く
  - キャンセル `あとで` → `localStorage` に `previous.id` を保存して閉じる。**× / Esc / overlay での閉じも「あとで」と同じ扱い**
- 保存キー `atender.semesterRollover.dismissedSemesterId` (iOS の UserDefaults キーと同名)。値は学期 id 1 つ (上書き)

#### 5.3.2 新しい学期シート (`components/home/SemesterCreateSheet.tsx`、新規)

iOS `SemesterCreateSheet.swift`。

```
<BottomSheet title="新しい学期">                      data-testid="semester-create-sheet" (中身)
学期名 / 開始日 / 終了日                              初期値 = proposal
{selected ? "時限と表示曜日は取り込む時間割に合わせます" : "時限と表示曜日は前の学期から引き継がれます"}
┌ card (data-testid="semester-create-template-suggestion") ── 提案 1 件以上のときだけ
│ 未選択: 同じ学科の時間割が {n} 件見つかりました  [選ぶ] (secondary sm)
│ 選択後: 取り込む: {title}                       [解除] (ghost sm)
└──────
footer: [キャンセル] (ghost) [学期を作成] (primary)
```

- 開いたとき 1 回: me の `schoolId` / `departmentId` が両方あれば `GET /api/timetable-templates?schoolId&departmentId&limit=20` → `visible`。scope = `{schoolId, departmentId, schoolName ?? "", departmentName ?? ""}`。失敗・未設定なら提案なし (カードを出さない)
- 「選ぶ」→ `TemplateBrowserSheet purpose="select" showsFoundBanner` (§5.4)。そこで選ばれたら `selected` に入れてブラウザを閉じる
- 「学期を作成」: `disabled = !SemesterRollover.canCreate(name, start, end) || pending`。plan = `SemesterCreationPlan.steps("rollover", null, selected?.id ?? null, false)`:

| step | 処理 | 失敗時 |
|---|---|---|
| `createSemester` | `POST /api/semesters {name: name.trim(), startDate, endDate}` | `showToast("保存できませんでした")`、中断 (シートは開いたまま) |
| `copyTemplate` | `POST .../copy {semesterId: created.id}` | **409 は無視**。それ以外は `showToast("学期は作成しました。時間割は「時間割の設定」から取り込めます")` して**続行** |
| `setDefaultSemester` | `PATCH /api/me {defaultSemesterId: created.id}` | `showToast("既定の学期を更新できませんでした。設定の学期管理から選べます")` して続行 |

- 最後に `onCreated(created)` → シートを閉じる。ホームは `semesters` を再取得して `semesterId = created.id`
- 送信中は閉じられない (× / overlay / Esc を無視)

#### 5.3.3 時限・表示曜日の引継ぎ (`SelfTimetableView`)

iOS `SelfTimetableView.swift:46-109`。時間割の無い学期を表示するときの「空の時間割」(`emptyTimetable`) と、空セルを押して実際に作るとき (`ensureTimetable`) の両方で:

- 対象学期 = `semesterId ?? me.defaultSemesterId ?? semesters[0].id` (現行どおり)
- `previous = TimetableCarryOver.previousTimetable(target, semesters, timetables)` (対象学期が `semesters` に無ければ null)
- `daySlots = TimetableCarryOver.inheritedSlots(previous, DEFAULT_SLOTS)`、`daysOfWeek = TimetableCarryOver.inheritedDaysOfWeek(previous)`
- `ensureTimetable` の `POST /api/user-timetables` に **`daySlots` と `daysOfWeek` を両方送る** (現行は `DEFAULT_SLOTS` 固定・`daysOfWeek` 無し)
- `createdTimetable` は**その学期のものだけ**を表示に使う (`createdTimetable.semesterId === 対象学期` のときだけ。別の学期に切り替えたら空の時間割に戻る)

#### 5.3.4 学期管理シート (`SemesterListSheet`)

- 一覧の上に `公開時間割から取り込む` (secondary、`data-testid="semester-list-import-template"`)。me の `schoolId` / `departmentId` / `schoolName` / `departmentName` が 4 つとも揃っていないと disabled。押すと `TemplateBrowserSheet purpose="importInto" initialSemesterId=me.defaultSemesterId lockSemester=false showsFoundBanner=false`。取り込んだらブラウザを閉じる (学期管理は開いたまま)
- 削除の失敗: 409 → `showToast("時間割があるため削除できません。先に時間割を削除してください")`、それ以外 → `showToast("削除できませんでした")`
- 編集保存・追加の失敗: `showToast("保存できませんでした")`
- それ以外 (行の見た目・`/ 現在`・編集・既定化・新規追加フォームが空) は現行どおり

### 5.4 公開時間割ブラウザ (`components/templates/TemplateBrowserSheet.tsx`、新規)

iOS `TemplateBrowser.swift`。iOS はモーダル内 push だが、Web は**呼び出し元シートの上に重ねる 1 枚のシート** (`stackLevel={2}`) で、中の 3 画面を `onBack` で行き来する。

```ts
type TemplateScope = { schoolId: string; departmentId: string; schoolName: string; departmentName: string };
type Props = {
  open: boolean;
  purpose: { kind: "importInto"; initialSemesterId: string | null; lockSemester: boolean } | { kind: "select" };
  showsFoundBanner: boolean;
  initialScope: TemplateScope;
  onImported?: (timetable: UserTimetableDto) => void;  // importInto
  onSelected?: (template: TemplateDto) => void;        // select
  onBack: () => void;    // 一覧画面の「戻る」= ブラウザだけ閉じて呼び出し元へ戻る
  onClose: () => void;   // ×  = 呼び出し元ごと閉じる (呼び出し元が実装)
};
```

#### 5.4.1 一覧画面 (タイトル `公開時間割`)

```
(showsFoundBanner) ┌ accent-500 15% 面、角丸 md ─────────┐
                   │ ✓ 同じ学科の時間割が見つかりました     │ 太字
                   │ そのまま自分の学期に取り込めます       │ 小・secondary
                   └───────────────────────────────────────┘
(importInto)  取り込み先 [2026 後期 ⌄]   ← Select data-testid="template-target-semester" (lockSemester=false)
              取り込み先: 2026 後期      ← テキスト (lockSemester=true)
              (学期・時間割の読込失敗) 読み込めませんでした [再読み込み]
{schoolName} › {departmentName}                       [別の学科を探す] data-testid="template-browse-other"
┌ card (bg-elevated, 角丸 md, shadow-card, p-4) data-testid="template-card-{id}" ┐  全体がボタン → 中身
│ {title}            text-lg semibold、2 行まで                                │
│ {sizeText}         text-sm secondary                                        │
│ {metaText(t, me.user.id)} text-xs tertiary                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- 取得: scope が変わるたびに `GET /api/timetable-templates?schoolId&departmentId&limit=20` (キャッシュを使わない: `staleTime: 0`) → `TemplateSuggestionLogic.visible`。ページングなし。scope 変更後に古い応答が返っても捨てる
- 状態: loading = カード 3 枚のスケルトン / error = `読み込めませんでした` + `再読み込み` (secondary) / 0 件 = `EmptyState` (マスコット) タイトル `この学科の公開時間割はまだありません`、本文 `時間割を作って「みんなの時間割で公開」をオンにすると、同じ学科の人が使えるようになります`
- 作成者 (handle) は出さない
- 「戻る」= `onBack()`

#### 5.4.2 学校・学科画面 (タイトル `学校・学科`)

- 「別の学科を探す」で開く。`SchoolDepartmentPicker allowsCreate={false}` (初期値は空)
- 学科を選んだ瞬間に scope を `{school.id, department.id, school.name, department.name}` に差し替えて一覧画面へ戻る。**`PATCH /api/me` は送らない**
- 「戻る」= 一覧画面へ

#### 5.4.3 中身画面 (タイトル `時間割の中身`、`data-testid="template-preview"`)

```
{title}                                  text-2xl bold
{sizeText} / {metaText(t, me.user.id)}   text-sm secondary
┌ card ──────────────────────────────────┐
│ {weekday}  {periodText}  {courseName}   │  previewRows の各行
│                          {detail}       │
└─────────────────────────────────────────┘
select:     [ この時間割を使う ]   primary → onSelected(template)
importInto: [ この学期に取り込む ] primary data-testid="template-import-button"
            (学期一覧の読込済み・取り込み先あり・取込中でない ときだけ enabled)
            (読込済みで取り込み先が無い) 先に学期を作成してください
```

- 「戻る」= 一覧画面へ

#### 5.4.4 取り込み (importInto。iOS `TemplateImportViewModel`)

- ブラウザを開いたとき: `semesters` と `user-timetables` を取り直す (両方 `refetch`)。`targetSemesterId` の初期値 = `initialSemesterId ?? me.defaultSemesterId`、それが null で学期があれば `semesters[0].id`、学期 0 件なら null
- 「この学期に取り込む」:
  1. `decision = TemplateImportLogic.decide(timetables.find(t => t.semesterId === target) ?? null)` (§6.6)
  2. `confirmReplace` → 確認ダイアログ (`ConfirmDialog stackLevel={3}`):
     - title `既存の時間割と出欠記録を置き換えます`
     - body `「{学期名}」の時間割（{courseCount} 科目）と、その出欠記録はすべて削除され、元に戻せません。`
     - 確認 `置き換える` (destructive) / `キャンセル` (何も送らない)
     - **確認した時点の学期だけを置換する** (確認中に取り込み先を変えても、確認した学期に送る)
  3. `copy` / `replaceSilently` / 確認後 → `POST .../copy` body = `TemplateImportLogic.copyInput(target, decision)`
- 結果:
  - 成功 → `showToast("「{template.title}」を取り込みました")` → `onImported(dto)`
  - **409** (初回のみ) → `user-timetables` を取り直して 1. からやり直す (2 回目の 409 は「その他」と同じ)。取り直しに失敗 → `showToast("取り込めませんでした、もう一度試してください")`
  - **404** → `showToast("この時間割は公開が終了しました")` → 一覧を取り直して一覧画面へ戻る
  - その他 → `showToast("取り込めませんでした、もう一度試してください")` (画面は変えない)
- 成功時の invalidate: `["user-timetables"]` `["me"]` `["today"]` `["stats"]` `["semesters"]` `["day"]` (`useCopyTemplate` の onSuccess を差し替える)

#### 5.4.5 入口 (iOS と同じ 4 か所 + 時間割の設定)

| # | 入口 | purpose | showsFoundBanner | scope | 取り込み / 選択後 | `onBack` | `onClose` |
|---|---|---|---|---|---|---|---|
| E1 | 学期管理 (§5.3.4) | importInto(me.defaultSemesterId, lock=false) | false | me の 4 値 | ブラウザだけ閉じる | ブラウザだけ閉じる | 両方閉じる |
| E2 | 時間割の設定 (§5.5) | importInto(シートの `semesterId`, lock=true) | false | me (名前が null なら `未設定`) | `onSaved` 相当 (なし) → 両方閉じる | ブラウザだけ閉じる | 両方閉じる |
| E3 | 新しい学期シート (§5.3.2) | select | true | me (名前が null なら `""`) | `selected` に入れてブラウザだけ閉じる | ブラウザだけ閉じる | 両方閉じる |
| E4 | 学校・学科 (§5.8.1) の保存後 | importInto(me.defaultSemesterId, lock=false) | true | 保存した学校・学科 | 両方閉じる | ブラウザだけ閉じる (学校・学科シートに戻る) | 両方閉じる |
| (Setup) | §5.2.3 | — (インラインのカード。ブラウザは使わない) | | | | | |

ホームの学期選択には入口を置かない。

### 5.5 時間割の設定シート (`TimetableSettingsSheet`)

iOS `TimetableSettingsSheet.swift`。props: `{ open; onClose; timetable: UserTimetableDto | null; semesterId: string | null; onSaved?: () => void }`。`SelfTimetableView` は `timetable = 選択中の学期の時間割 ?? その学期の createdTimetable`、`semesterId = timetable?.semesterId ?? 対象学期` を渡す。

上から:
1. `timetable == null` → `先に学期を作成してください。` (現行どおり)
2. 名前 / 表示する曜日 / 時限 (現行どおり)
3. `Toggle label="みんなの時間割で公開"` (`timetable == null` で disabled)
4. `timetable` があり `meetings.length === 0` → `授業を 1 つ以上登録すると公開されます` (text-sm secondary。トグルの状態に関係なく出す)
5. トグル ON のとき `Field label="公開タイトル"`
6. `公開時間割から取り込む` (secondary、`data-testid="timetable-settings-import-template"`、**`timetable == null` でも enabled**)。押すと me の `schoolId` / `departmentId` が無ければメッセージ `先に学校・学科を設定してください`、あれば E2 でブラウザを開く
7. メッセージ (あれば)。文言に `できません` か `してください` を含むなら `text-status-absent`、それ以外 `text-fg-secondary`
8. `timetable != null` のとき危険ゾーン: 見出し `この時間割を削除` (absent 色・太字) / `授業・出席記録も全て削除されます。元に戻せません。` / `削除する` (ghost) → `ConfirmDialog title="時間割を削除" confirmLabel="削除する" stackLevel={2}` (本文なし) → `DELETE /api/user-timetables/:id` → 成功: `onSaved?.()` → 閉じる / 失敗: `showToast("削除できませんでした")`

- **撤去**: 「同じ学校の公開時間割から持ってくる」の折りたたみ・検索欄・一覧・その場の「取り込む」
- 開くたびの初期化: `publishEnabled = TimetablePublishLogic.initialToggle(timetable)` (§6.7)、`publishTitle = timetable.publishedTemplate?.title ?? timetable.title`、名前・曜日・時限は現行どおり、メッセージ消去
- 「保存」(`timetable == null` / 送信中は disabled):
  1. 曜日 0 個 → `表示する曜日を1つ以上選んでください` / 時限の終了 ≤ 開始 → `{i+1} 限目: 終了時刻は開始時刻より後にしてください` (現行どおり)
  2. 名前・曜日・時限の PATCH を**この順に 1 本ずつ** (変わったものだけ。名前は trim して空なら送らない = 現行どおり)。失敗 → `保存できませんでした`、中断
  3. `action = TimetablePublishLogic.action(publishEnabled, publishTitle.trim(), timetable)`: `none` → 何もしない / `publish(title)` → title が空なら `公開タイトルを入力してください` で中断、それ以外 `POST .../publish-as-template {title}` / `unpublish(id)` → `PATCH /api/timetable-templates/:id {isPublic:false}`。失敗 → `公開設定を保存できませんでした`、**シートを閉じない**
  4. `onSaved?.()` → 閉じる
- publish / unpublish 成功の invalidate: `["user-timetables"]` `["me"]`

### 5.6 科目別の出席基準

#### 5.6.1 科目の追加・編集 (`CourseEditModal`) — 「出席の基準」

メモの下に:

```
出席の基準                                                (Field の見出しと同じ体裁)
┌ bg-muted, 角丸 md, p-3 ──────────────────────────────────┐
│ [Toggle] この科目の必要出席率を変える   data-testid=course-rule-rate-toggle
│   (ON) [−] 80 [+] %                      NumberStepper 1…100, label "必要出席率"
│ ─────────
│ [Toggle] 欠席できる回数の上限を決める   data-testid=course-rule-max-absences-toggle
│   (ON) [−] 5 [+] 回まで                  NumberStepper 0…30, label "欠席上限"
│ ─────────
│ [Toggle] 遅刻・早退を欠席に換算する     data-testid=course-rule-tardy-toggle
│   (ON) [−] 3 [+] 回で欠席 1 回           NumberStepper 1…10, label "遅刻・早退の換算"
└──────────────────────────────────────────────────────────┘
回数は授業の回数です。同じ日のコマはまとめて 1 回と数えます。          (text-xs tertiary、常時)
{CourseRuleLogic.footnote(rateOn, maxOn, userRate, rate)}               (text-xs tertiary)
```

- `userRate = me.user.requiredAttendanceRate ?? 70`
- 開くたびの初期値: 各トグル = 科目の値が非 null か。値 = 率 `course.requiredAttendanceRate ?? userRate`、上限 `course.maxAbsences ?? 5`、換算 `course.tardiesPerAbsence ?? 3`。新規は 3 つとも OFF
- 率トグルを ON にした瞬間、`course?.requiredAttendanceRate == null` なら率を `userRate` に戻す
- 保存 (編集): `PATCH /api/courses/:id` の body に `name / teacher / color / note` (現行どおり) + **3 キーを必ず入れる** (ON の項目は値、OFF は `null`)
- 保存 (新規): `POST /api/courses` に ON の項目だけ値を入れる (OFF のキーは入れない)

#### 5.6.2 科目詳細 (`CourseDetailModal`)

先生の行の下に `基準: {CourseRuleLogic.summary(rule, userRate)}` (text-sm secondary、`data-testid="course-detail-rule-summary"`)。rule = 科目の 3 値。

#### 5.6.3 学期・科目の科目行 (`CourseListItem`)

- 色分けとバーのマーカーに使う率 = `SemesterOverviewDisplayLogic.requiredRate(stats, props.requiredRate)`
- 行末の文言・色 = `courseActionText(stats)` / `courseActionTone(stats)` (§6.9)。「出N 欠N ・」の前置きと未記録バッジは現行どおり
- 全体ヒーロー (`AttendanceRateHero`) は変えない

### 5.7 授業変更 (振替)

#### 5.7.1 日別シート (`DayDetailSheet`) の「授業変更」節

休講の節と「授業 (N)」の節の間 (iOS と同じ順):

```
┌ bg-muted/50, 角丸 ───────────────────────────────┐
│ 授業変更                                  (text-sm bold secondary)
│ {ClassTransferLogic.summary(t, occs)}   [取り消す] (ghost sm)   ← transfers の各行
│ [ 授業変更 ] (secondary sm)                        → ClassTransferSheet
└──────────────────────────────────────────────────┘
```

- `occs` = その日の `occurrences` のうち `transferId === t.id`
- 「取り消す」: `n = ClassTransferLogic.needsDeleteConfirmation(t, occurrences)`。`n > 0` → `ConfirmDialog stackLevel={2} title="出欠記録 {n} 件も削除されます" confirmLabel="取り消す"` (本文なし) → 確認で削除 / `n == 0` → 確認なしで `DELETE /api/class-transfers/:id`。失敗 → シート下部に赤字 `ApiError.message`
- 成功 (作成・削除) の invalidate: `["day"]` `["semesters"]` `["stats"]` `["today"]` `["timetable-suspensions"]`

#### 5.7.2 授業変更シート (`components/semester/ClassTransferSheet.tsx`、新規。`BottomSheet title="授業変更" stackLevel={2}`)

props: `{ open; onClose; date: string; semesterId: string | null; existingOccurrences: OccurrenceDto[]; targetIsSuspended: boolean; onSaved: () => void }`。`data-testid="class-transfer-sheet"`。

- 対象の時間割: `user-timetables` のうち `semesterId` の学期のもの ?? 先頭。学期の `startDate` / `endDate` も引く。時間割が無い → `時間割がありません`
- 上段: 2 択 (`aria-pressed` のボタン 2 つ) `曜日ごと` / `コマごと`。既定 `曜日ごと`
- **曜日ごと**:
  - 見出し `曜日`。7 ボタン (表示順 月…日: `月 火 水 木 金 土 日`)。初期値 `ClassTransferLogic.defaultSourceDay(date, meetings)` (null なら未選択)
  - 見出し `この日に置く授業`。未選択 / 授業なし → `この曜日に授業はありません`、選んだ曜日が `date` と同じ → `この日と同じ曜日です`、それ以外 → `previewMoveDay` の各行
  - `Toggle label="元の日を休講にする"` (既定 ON)。ON のとき `Input type=date` (min = 学期開始、max = 学期終了)。初期値・曜日を変えたとき = `defaultSourceDate(date, sourceDay, semesterStart)`
  - `targetIsSuspended` → `この日の休講は解除されます` (text-xs tertiary)
- **コマごと**:
  - 見出し `科目` + `Select` (先頭の空値 `科目を選択`。候補 = その時間割で meeting を持つ科目)。科目を変えたら時限の選択を空に
  - 見出し `時限` + `PeriodChips periodCount={daySlots.length}` (既存部品)
  - `previewSingle` の各行
- プレビュー行: `{periodIndex}限` (連続は `{start}-{end}限`) + 科目名 + 右に (blockedBy があれば赤字) `{blockedBy}` / (replaces があれば) `→ {replaces}`
- 送信ボタン (primary、`data-testid="class-transfer-submit"`): 文言 `曜日ごと` → `この日に反映` / `コマごと` → `追加`。enabled 条件:
  - 曜日ごと: 曜日選択済み かつ `date` と別の曜日 かつ (休講 ON なら日付が空でない) かつ `canSubmit(rows)`
  - コマごと: 科目選択済み かつ 時限 1 つ以上 かつ `canSubmit(rows)`
- 送信 body:
  - 曜日ごと: `{kind:"MOVE_DAY", date, semesterId?, sourceDayOfWeek, suspendSourceDate, sourceDate (休講 ON のときだけ), liftTargetSuspension: targetIsSuspended}`
  - コマごと: `{kind:"SINGLE", date, semesterId?, courseId, periodIndexes (重複除去・昇順), liftTargetSuspension: targetIsSuspended}`
  - `semesterId` は null なら送らない
- エラー (シート内の赤字): `PERIOD_CONFLICT` → `その時限には既に授業変更があります` / `DISPLACED_HAS_RECORD` → `出欠記録がある授業を置き換えることはできません。先に記録を消してください` / `DAY_SUSPENDED` → `この日は休講です` / その他 → `ApiError.message`
- 成功 → `onSaved()` (日別シートは開いたまま再取得)

### 5.8 設定 (`/settings`)

#### 5.8.1 学校・学科 (`SchoolDeptEditSheet` を作り直し)

iOS `SchoolDeptEditSheet.swift`。

```
<BottomSheet title="学校・学科">
現在: {schoolName} / {departmentName}      (どちらかが空なら "未設定")。text-sm secondary
<SchoolDepartmentPicker allowsCreate />    (初期値は空。学校の段から)
footer: [キャンセル] (ghost) [保存]
```

- 「学校 ID」「学科 ID」の入力欄は撤去
- 保存の enabled = 学科まで選択済み かつ `(school.id, department.id) !== (me.schoolId, me.departmentId)` かつ送信中でない。variant は学科の段なら primary、学校の段なら secondary
- 保存 → `PATCH /api/me {schoolId, departmentId}`。失敗 → `showToast("保存できませんでした")` (シートは開いたまま)
- 成功 → `GET /api/timetable-templates?schoolId&departmentId&limit=20` → `visible` が 1 件以上なら E4 でブラウザを開く (`showsFoundBanner`)、0 件 or 取得失敗なら `showToast("学校・学科を変更しました")` → 閉じる
- 送信中は閉じられない

#### 5.8.2 行の並び (iOS `SettingsView.swift:24-55`。カレンダー節は除外)

| 節 | 行 | 変更 |
|---|---|---|
| アカウント | プロフィール編集 / 学校・学科 | 学校・学科の右に `{schoolName} / {departmentName}` (空でない方だけを ` / ` で連結。両方空なら従来のシェブロン) |
| 出席 | 必要出席率 / 出欠ルール / 学期管理 | 変更なし |
| 表示 | 自動 / ライト / ダーク | 既定をライトに (§5.8.3) |
| その他 | **プライバシーポリシー / 利用規約 / サポート** / ログアウト / アカウントを削除 | 先頭 3 行を追加。押すと `window.open("/privacy" \| "/terms" \| "/support", "_blank", "noopener,noreferrer")`。router の `Link` は使わない (SPA 外の静的ページ。nginx の `try_files $uri $uri.html` が `public/*.html` を返す) |

#### 5.8.3 テーマ既定 (`lib/useTheme.ts`)

- `readStored()`: 保存値が `"auto" | "light" | "dark"` ならそれ、**それ以外 (未保存含む) は `"light"`**
- `setTheme(next)`: **常に** `localStorage.setItem("theme", next)` (`"auto"` も保存する。`removeItem` はやめる)
- 保存キー `theme` は変えない (既存ユーザーの明示的なライト / ダークを引き継ぐため)

---

## 6. 純粋関数 (`apps/web/src/lib/`、iOS と同名のファイル)

全て副作用なし・React 非依存。日付は `"YYYY-MM-DD"` 文字列、比較は文字列比較 (iOS と同じ)。型は `@atender/shared` を import。

### 6.1 `lib/SchoolClock.ts` (iOS `SchoolClock.swift`)

API の日付は Asia/Tokyo 固定なので、Web も端末のタイムゾーンでなく JST で数える (JST は夏時間が無いので `+9h` で決まる)。

```ts
export function todayString(now?: Date): string;   // JST の YYYY-MM-DD
export function nowMinute(now?: Date): number;     // JST 0:00 からの分
export function displayDay(now?: Date): number;    // JST の曜日。1=月 … 7=日 (週末を月に丸めない)
```

### 6.2 `lib/CalendarDate.ts` (iOS `CalendarRange` のうち使う分)

```ts
export function addDays(date: string, n: number): string;
export function addMonths(date: string, n: number): string;  // 月を足し、日はその月の末日で頭打ち (Foundation と同じ)
export function monthFirst(date: string): string;            // "YYYY-MM-01"
export function mondayOf(date: string): string;              // その週の月曜 (日曜は前の月曜)
export function formatYearMonthDay(date: string): string;    // "2026年 9月30日" (年の後に半角スペース、月日は 0 埋めしない)
export function formatMonthDay(date: string): string;        // "9/11"
export function jsWeekday(date: string): number;             // 0=日 … 6=土
```

### 6.3 `lib/SemesterRollover.ts` (iOS `SemesterRollover.swift`)

```ts
export type SemesterProposal = { name: string; startDate: string; endDate: string };
export const DISMISSED_KEY = "atender.semesterRollover.dismissedSemesterId";
export function initialProposal(today: string): SemesterProposal;
// 4–9 月: "{Y} 前期", Y-04-01, Y-09-30 / 10–12 月: "{Y} 後期", Y-10-01, (Y+1)-03-31 / 1–3 月: "{Y-1} 後期", (Y-1)-10-01, Y-03-31
export function latest(semesters: SemesterDto[]): SemesterDto | null;
// startDate 降順 → endDate 降順 → id 昇順 の先頭
export function allEnded(semesters: SemesterDto[], today: string): boolean;
// 1 件以上かつ全学期の endDate < today
export function promptTarget(semesters: SemesterDto[], today: string, dismissedSemesterId: string | null): SemesterDto | null;
// allEnded かつ latest.id !== dismissedSemesterId なら latest
export function proposal(previous: SemesterDto, today: string): SemesterProposal;
// start = addDays(previous.endDate, 1)、end = addDays(addMonths(start, 6), -1)
// end < today なら start = monthFirst(today)、end = addDays(addMonths(start, 6), -1)
// name = "{start の年} {start の月が 4–9 なら 前期、それ以外 後期}"
export function alertMessage(previous: SemesterDto): string;
// "「{name}」は {formatYearMonthDay(endDate)} に終了しました。新しい学期を作成しますか?"
export function canCreate(name: string, startDate: string, endDate: string): boolean;
// name.trim() が空でない かつ startDate <= endDate
export function readDismissed(): string | null;      // localStorage[DISMISSED_KEY]
export function writeDismissed(id: string | null): void;  // null は removeItem
```

### 6.4 `lib/TimetableCarryOver.ts` (iOS `TimetableCarryOver.swift`)

```ts
export const DEFAULT_DAYS_OF_WEEK = [1, 2, 3, 4, 5];
export function previousTimetable(target: SemesterDto, semesters: SemesterDto[], timetables: UserTimetableDto[]): UserTimetableDto | null;
// 候補 = startDate < target.startDate かつ時間割を持つ学期。startDate 降順 → endDate 降順 → id 昇順 の先頭の学期の時間割
export function inheritedSlots(previous: UserTimetableDto | null, fallback: DaySlotDto[]): DaySlotDto[];  // previous が無いか daySlots が空なら fallback
export function inheritedDaysOfWeek(previous: UserTimetableDto | null): number[];                          // 無いか空なら [1,2,3,4,5]
```

### 6.5 `lib/SemesterCreationPlan.ts` (iOS `SemesterCreationPlan.swift`)

```ts
export type SemesterCreationContext = "onboarding" | "rollover";
export type SemesterCreationStep =
  | { kind: "createSemester" } | { kind: "copyTemplate"; templateId: string }
  | { kind: "setDefaultSemester" } | { kind: "refreshMe" };
export function steps(context: SemesterCreationContext, createdSemesterId: string | null,
                      templateId: string | null, templateCopied: boolean): SemesterCreationStep[];
// createdSemesterId == null → createSemester / templateId != null && !templateCopied → copyTemplate
// 常に setDefaultSemester / context == "onboarding" → 末尾に refreshMe
```

### 6.6 `lib/TemplateImportLogic.ts` (iOS `TemplateImportLogic.swift`)

```ts
export type TemplateImportDecision = { kind: "copy" } | { kind: "replaceSilently" } | { kind: "confirmReplace"; courseCount: number };
export function decide(existing: UserTimetableDto | null): TemplateImportDecision;
// null → copy / meetings 0 かつ courses 0 → replaceSilently / それ以外 → confirmReplace(courses.length)
export function copyInput(semesterId: string, decision: TemplateImportDecision): TemplateCopyInput;
// copy → { semesterId } (replaceExisting キーを入れない) / それ以外 → { semesterId, replaceExisting: true }。title は入れない
```

### 6.7 `lib/TimetablePublishLogic.ts` (iOS `TimetablePublishLogic.swift`)

```ts
export type TimetablePublishAction = { kind: "none" } | { kind: "publish"; title: string } | { kind: "unpublish"; templateId: string };
export function initialToggle(timetable: UserTimetableDto | null): boolean;
// null → false / publishedTemplate があれば その isPublic / 無ければ sourceTemplateId == null
export function action(toggle: boolean, title: string, timetable: UserTimetableDto): TimetablePublishAction;
// toggle ON: meetings 0 → none、それ以外 → publish(title)
// toggle OFF: publishedTemplate?.isPublic === true → unpublish(publishedTemplate.id)、それ以外 → none
```

### 6.8 `lib/TemplateSuggestionLogic.ts` (iOS `TemplateSuggestionLogic.swift`)

```ts
export const FOUND_TITLE = "同じ学科の時間割が見つかりました";
export type TemplatePreviewRow = { id: string; weekday: string; periodText: string; courseName: string; detail: string | null };
export function visible(templates: TemplateDto[]): TemplateDto[];
// (1) meetings が空のものを除く
// (2) authorUserId !== "" のものを (authorUserId, title) で束ね、「新しい方」を 1 件残す
//     新しい方 = updatedAt (Date.parse。解釈できなければ最古) が大きい、同値なら id (文字列) が大きい
// (3) authorUserId === "" は束ねない
// (4) 並び: copyCount 降順 → 新しい順 (上と同じ比較)
export function sizeText(t: TemplateDto): string;   // "{courses.length}科目・週{Σ meetings.periodCount}コマ"
export function metaText(t: TemplateDto, meId: string | null): string;
// 部品を "・" で連結: (meId != null かつ meId === authorUserId) "あなたが公開" / (copyCount > 0) "{n}人が使用" / (updatedAt が解釈できれば) "{JST の yyyy/M/d} 更新"
export function previewRows(t: TemplateDto): TemplatePreviewRow[];
// 並び: 曜日 (dayOfWeek 0=日 は 7 として) 昇順 → startPeriodIndex 昇順 → meeting.id 昇順
// weekday = ["日","月","火","水","木","金","土"][dayOfWeek]、periodText = periodCount > 1 ? "{s}–{s+n-1}限" (en dash U+2013) : "{s}限"
// courseName = 科目が見つからなければ "授業"、detail = [course.teacher, meeting.room] の非 null を " · " で連結、空なら null
```

### 6.9 `lib/CourseRuleLogic.ts` / `lib/SemesterOverviewDisplayLogic.ts` (iOS `CourseRuleLogic.swift` / `SemesterOverviewView.swift:277-344`)

```ts
// CourseRuleLogic.ts
export type CourseRuleValues = { requiredAttendanceRate: number | null; maxAbsences: number | null; tardiesPerAbsence: number | null };
export function footnote(rateOn: boolean, maxOn: boolean, userRate: number, rate?: number | null): string;
// (F,F) "未設定の項目は共通の必要出席率（{userRate}%）で判定します"
// (T,F) "この科目は {rate ?? userRate}% で判定します"
// (F,T) "この科目は回数の上限で判定します（共通の必要出席率は使いません）"
// (T,T) "出席率と回数の厳しい方で「あと何回休めるか」を出します"
export function summary(rule: CourseRuleValues, userRate: number): string;
// 3 つとも null → "共通（{userRate}%）"
// それ以外: 部品を " ・ " で連結。率も上限も null なら先頭に "共通（{userRate}%）"、率 "出席率 {r}%"、上限 "欠席 {m} 回まで"、換算 "遅刻・早退 {n} 回で欠席 1 回"
// 全角括弧（）と全角の・(U+30FB) を使う

// SemesterOverviewDisplayLogic.ts
export type ActionTone = "absent" | "accent" | "tertiary";   // CSS は var(--color-status-absent) / var(--color-accent-500) / var(--color-fg-tertiary)
export function requiredRate(stats: CourseStatsDto, fallback: number): number;  // stats.requiredAttendanceRate ?? fallback
export function courseActionText(stats: CourseStatsDto): string;
export function courseActionTone(stats: CourseStatsDto): ActionTone;
// allowedAbsenceLessons == null → 旧規則 (現 CourseListItem の shortActionText / actionColor をここへ移す):
//   allowedAbsences == null "—"(tertiary) / < 0 "下回る見込み"(absent) / >= remainingCount "残り全休OK"(accent)
//   / allowedAbsenceDays == null "あと{a}限休める" / それ以外 "あと{a}限 ({d}日) 休める" (tertiary)
// それ以外 L = allowedAbsenceLessons, R = remainingLessons ?? 0:
//   L < 0 → limitedBy === "rate" ? "下回る見込み" : "欠席上限を超えています" (absent)
//   L >= R → "残り全休OK" (accent) / それ以外 → "あと{L}回休める" (tertiary)
```

### 6.10 `lib/TimetableGridLayout.ts`

```ts
export function currentPeriodIndex(daySlots: DaySlotDto[], nowMinute: number): number | null;
// periodIndex 昇順で startMinute <= now < endMinute の最初の periodIndex
```

### 6.11 `lib/RoomTimetableLogic.ts` (iOS `RoomLogic.swift`)

```ts
export const DEFAULT_SLOTS: DaySlotDto[];  // 1–5 限: 540–630 / 640–730 / 780–870 / 880–970 / 980–1070、label "{n}限"、isBreak false
export function resolveDaySlots(a: { preferredSemesterId: string | null; defaultSemesterId: string | null; timetables: UserTimetableDto[] }): DaySlotDto[];
// preferred の学期の時間割 ?? default の学期の時間割 ?? timetables[0]。それが無いか daySlots が空なら DEFAULT_SLOTS
export function buildRecurringEvents(week: RoomWeekDto): TimetableEventInput[];
// recurringMeetings の順に: dow = jsToDisplay(dayOfWeek) (0→7)、key = "{userId}:{courseId}:{dow}:{startPeriodIndex}"、同じ key は最初の 1 件だけ
// id = key、periodCount = max(1, periodCount)、color = courseColor ?? member.color ?? "#F97316"、title = courseName
// subtitle = member.name (空でなければ) ?? member.handle (空でなければ) ?? "No name"、mergeKey = "{userId}:{courseId}"
// 並び: dayOfWeek 昇順 → startPeriodIndex 昇順 (同値は入力順)
export function displayDays(events: TimetableEventInput[]): number[];  // {1..5} ∪ events の曜日、昇順
export function parseInviteCode(raw: string): string;
// iOS RoomInviteCode.parse の写し。trimmed = raw.trim()、trimmed.split("/").filter(s => s !== "").at(-1) ?? trimmed
// (Swift の split は空要素を捨てるので、末尾が "/" の入力も最後の非空要素になる)
```

### 6.12 `lib/TodayTimeline.ts` (iOS `TodayTimeline.swift`)

```ts
export type TodayState =
  | { kind: "noClass" } | { kind: "upcoming"; next: OccurrenceDto }
  | { kind: "inClass"; current: OccurrenceDto; next: OccurrenceDto | null } | { kind: "finished"; last: OccurrenceDto };
export function state(occurrences: OccurrenceDto[], nowMinute: number): TodayState;
// 並び: startMinute → endMinute → id 昇順。current = start <= now < end の最初、next = start > now の最初
// current あり → inClass / next あり → upcoming / それ以外 → finished(last = endMinute 最大、同値は startMinute → id の大きい方)
export function isStale(loadedDate: string | null | undefined, now: Date): boolean;  // loadedDate 無し or todayString(now) !== loadedDate
export const NowNextText: {
  statusLabel(s: TodayState): string | null;  // noClass null / upcoming "次の授業" / inClass "授業中" / finished "本日終了"
  title(s: TodayState): string | null;        // noClass null / upcoming "{next.periodIndex}限 {courseName}" / inClass "{current.periodIndex}限 {courseName}" / finished "今日の授業は終わりました"
  detail(s: TodayState): string | null;       // upcoming "{HH:mm(start)}" + (room 空でなければ " · {room}") / inClass "{HH:mm}–{HH:mm}" (en dash) + 同上 / 他 null
};
export function unrecordedCount(occurrences: OccurrenceDto[]): number;  // status == null の件数
export const HomeAttendance: {
  DRAG_THRESHOLD: 40;
  isActive(occ: OccurrenceDto[]): boolean;          // 1 件以上
  defaultExpanded(occ: OccurrenceDto[]): boolean;   // 1 件以上 かつ 未記録 1 件以上
  shouldCollapse(dy: number, dx: number): boolean;  // |dy| > |dx| かつ dy > 40 (下へ)
  shouldExpand(dy: number, dx: number): boolean;    // |dy| > |dx| かつ dy < -40 (上へ)
};
```

### 6.13 `lib/ClassTransferLogic.ts` (iOS `ClassTransferLogic.swift`)

```ts
export type ClassTransferPreviewRow = { periodIndex: number; periodCount: number; courseName: string; replaces: string | null; blockedBy: string | null };
export function groupPeriods(periods: number[]): { start: number; count: number }[];  // 重複除去・昇順の連続区間
export function defaultSourceDay(targetDate: string, meetings: MeetingDto[]): number | null;
// 表示順 (月→日) で最初の「meeting を持ち、targetDate の曜日と違う」JS 曜日
export function defaultSourceDate(targetDate: string, sourceDayOfWeek: number, semesterStart: string): string;
// diff = (target の曜日 − sourceDay + 7) % 7、0 なら 7。candidate = targetDate − diff 日
// candidate < semesterStart なら semesterStart + ((sourceDay − start の曜日 + 7) % 7) 日
export function previewMoveDay(targetDate: string, sourceDayOfWeek: number, timetable: UserTimetableDto, existing: OccurrenceDto[]): ClassTransferPreviewRow[];
// sourceDay の meeting を startPeriodIndex 昇順に 1 行ずつ (連続コマも 1 行)。periods = [start, start+count)
// replaces = existing のうち transferId == null で periodIndex ∈ periods の最初 → "{target の曜日 1 字}曜 {periodIndex}限 {courseName} を置き換え"
// blockedBy = existing に transferId != null で periodIndex ∈ periods があれば "既に授業変更があります"
export function previewSingle(periodIndexes: number[], courseId: string, timetable: UserTimetableDto, existing: OccurrenceDto[]): ClassTransferPreviewRow[];
// groupPeriods ごとに 1 行。replaces の曜日は置き換えられる occurrence の date の曜日。空入力 → []
export function canSubmit(rows: ClassTransferPreviewRow[]): boolean;  // 1 行以上 かつ blockedBy が全て null
export function summary(transfer: ClassTransferDto, occurrences: OccurrenceDto[]): string;
// MOVE_DAY: "{日曜日…土曜日}の時間割 ({occurrences.length}コマ)" + (sourceDate あり) " · {M/d}({曜日 1 字}) を休講"
// SINGLE: "{先頭の courseName} {groupPeriods を "・" で連結 (1 コマ "3限"、連続 "3-4限" は半角ハイフン)}"
export function needsDeleteConfirmation(transfer: ClassTransferDto, occurrences: OccurrenceDto[]): number;
// transferId === transfer.id かつ status != null の件数
```

---

## 7. 挙動仕様 (Reviewer はここからテストを作る)

**層**: `U` = `lib/` の単体テスト (`tests/lib/*.test.ts`)、`C` = コンポーネントの RTL (`tests/components/`)、`R` = `renderApp` のルートテスト (`tests/routes/`)。時刻依存の行は**危険窓の標本**を指定する。値は scratchpad で規則を実走して確かめた。

### 7.L 純粋関数 (U)

#### SchoolClock / CalendarDate

| # | 入力 | 期待 |
|---|---|---|
| LSC1 | `todayString(new Date("2026-09-30T14:59:00Z"))` / `"2026-09-30T15:00:00Z"` | `"2026-09-30"` / `"2026-10-01"` (JST 0:00 の境界) |
| LSC2 | `nowMinute` 同上 2 標本 | `1439` / `0` |
| LSC3 | `displayDay`: `2026-09-30T14:59Z` / `2026-09-30T15:00Z` / `2026-10-31T14:59:59Z` / `2026-11-01T01:00Z` / `2026-11-01T15:00Z` | `3` (水) / `4` (木) / `6` (土) / `7` (日。月に丸めない) / `1` (月) |
| LSC4 | テストの `process.env.TZ` を `"America/Los_Angeles"` にしても LSC1–3 が同じ | 端末 TZ に依存しない |
| LCD1 | `addMonths("2026-08-31", 6)` / `("2027-01-31", 1)` / `("2028-01-31", 1)` / `("2026-10-31", -1)` | `"2027-02-28"` / `"2027-02-28"` / `"2028-02-29"` / `"2026-09-30"` |
| LCD2 | `mondayOf("2026-11-01")` (日曜) / `mondayOf("2026-10-26")` | `"2026-10-26"` / `"2026-10-26"` |
| LCD3 | `formatYearMonthDay("2026-09-30")` / `formatMonthDay("2026-09-11")` | `"2026年 9月30日"` / `"9/11"` |

#### SemesterRollover (iOS B19 #P1–#P11 の写し。A = `{id:"A", name:"2026 前期", 2026-04-01〜2026-09-30}`、B = `{id:"B", name:"2026 後期", 2026-10-01〜2027-03-31}`)

| # | 入力 | 期待 |
|---|---|---|
| LR1 | `latest([A,B])` / `([B,A])` / `([])` | B / B / null |
| LR2 | `latest([A, Z])` Z = `{id:"Z", 2026-04-01〜2026-12-31}` | Z (endDate 降順) |
| LR3 | `latest([A, A0])` / `([A0, A])` A0 = `{id:"A0", A と同日程}` | A / A (id 昇順の先頭) |
| LR4 | `allEnded([A], "2026-10-01")` / `([A], "2026-09-30")` / `([A,B], "2026-10-01")` / `([], "2026-10-01")` | true / false / false / false |
| LR5 | `promptTarget([A], "2026-10-01", null)` / `(…, "A")` / `(…, "zzz")` | A / null / A |
| LR6 | `promptTarget([A,B], "2026-10-01", null)` / `([], …)` / `([A,B], "2027-04-01", "A")` | null / null / B |
| LR7 | `promptTarget([A], todayString(new Date("2026-09-30T14:59:00Z")), null)` / `"2026-09-30T15:00:00Z"` | null / A (JST 境界) |
| LR8 | `proposal(A, "2026-10-01")` | `{2026 後期, 2026-10-01, 2027-03-31}` |
| LR9 | `proposal(B, "2027-04-05")` | `{2027 前期, 2027-04-01, 2027-09-30}` |
| LR10 | `proposal({endDate:"2025-09-30"}, "2026-10-07")` (放置) | `{2026 後期, 2026-10-01, 2027-03-31}` |
| LR11 | `proposal({endDate:"2026-08-31"}, "2026-09-01")` | `{2026 前期, 2026-09-01, 2027-02-28}` |
| LR12 | `proposal({endDate:"2026-08-30"}, "2026-08-31")` (月末からの 6 か月) | `{2026 前期, 2026-08-31, 2027-02-27}` |
| LR13 | `proposal({endDate:"2027-01-31"}, "2027-02-01")` | `{2027 後期, 2027-02-01, 2027-07-31}` |
| LR14 | `alertMessage(A)` | `"「2026 前期」は 2026年 9月30日 に終了しました。新しい学期を作成しますか?"` (末尾は半角 `?`) |
| LR15 | `canCreate(" ", "2026-10-01", "2027-03-31")` / `("x", "2027-04-01", "2027-03-31")` / `("x", "2026-10-01", "2026-10-01")` / `(" 2026 後期 ", …)` | false / false / true / true |
| LR16 | `writeDismissed("A")` → `readDismissed()` → `writeDismissed(null)` → `readDismissed()`、`DISMISSED_KEY` | `"A"` → null、キーは `"atender.semesterRollover.dismissedSemesterId"` |
| LR17 | `initialProposal`: `2026-10-29` / `2026-04-01` / `2026-09-30` / `2026-03-31` / `2027-01-15` | `{2026 後期, 2026-10-01, 2027-03-31}` / `{2026 前期, 2026-04-01, 2026-09-30}` / 前期 (同) / `{2025 後期, 2025-10-01, 2026-03-31}` / `{2026 後期, 2026-10-01, 2027-03-31}` |

#### TimetableCarryOver (iOS B19 #C1–#C8。semA 2026-04-01〜09-30、semB 2026-10-01〜2027-03-31、semC 2027-04-01〜09-30。tt(x) = 学期 x の時間割、daySlots 8 個・daysOfWeek [1..6])

| # | 入力 | 期待 |
|---|---|---|
| LC1 | `previousTimetable(semC, [A,B,C], [ttA])` | ttA (時間割の無い B を飛ばす) |
| LC2 | `(semB, …, [ttA])` / `(semA, …, [ttA])` | ttA / null |
| LC3 | `(semC, …, [ttA, ttB])` / `(semC, …, [])` | ttB / null |
| LC4 | A2 = `{2026-04-01〜2026-10-15}`: `(semB, [A, A2, B], [ttA, ttA2])` | ttA2 (endDate 降順) |
| LC5 | A3 = A と同日程: `(semB, [A3, A, B], [ttA3, ttA])` | ttA (id 昇順) |
| LC6 | A2' = A と同 startDate: `(semA, [A, A2'], [tt(A2')])` | null (startDate が同じなら候補でない) |
| LC7 | `inheritedSlots(ttA, DEFAULT)` / `(null, DEFAULT)` / `(daySlots 空, DEFAULT)` | ttA.daySlots (8 個) / DEFAULT / DEFAULT |
| LC8 | `inheritedDaysOfWeek(ttA)` / `(null)` / `(daysOfWeek 空)` | `[1..6]` / `[1..5]` / `[1..5]` |

#### SemesterCreationPlan (B21 C26)

| # | 入力 | 期待 (kind の列) |
|---|---|---|
| LP1 | `("onboarding", null, "T", false)` | create, copy(T), setDefault, refreshMe |
| LP2 | `("onboarding", "s", "T", false)` / `("onboarding", "s", "T", true)` | copy(T), setDefault, refreshMe / setDefault, refreshMe |
| LP3 | `("onboarding", null, null, false)` | create, setDefault, refreshMe |
| LP4 | `("rollover", null, "T", false)` / `("rollover", null, null, false)` | create, copy(T), setDefault / create, setDefault |

#### TemplateImportLogic / TimetablePublishLogic (B21 C24/C25/C41/C42)

| # | 入力 | 期待 |
|---|---|---|
| LI1 | `decide(null)` / meetings 0・courses 0 / meetings 0・courses 2 / meetings 3・courses 2 | copy / replaceSilently / confirmReplace(2) / confirmReplace(2) |
| LI2 | `copyInput("s", copy)` | `{semesterId:"s"}` — `"replaceExisting" in` 結果が false、`title` キー無し |
| LI3 | `copyInput("s", replaceSilently)` / `confirmReplace(1)` | `{semesterId:"s", replaceExisting:true}` |
| LPub1 | `initialToggle(null)` / publishedTemplate isPublic true / isPublic false / publishedTemplate 無し・sourceTemplateId null / 無し・`"x"` | false / true / false / true / false |
| LPub2 | `action(true, "T", meetings 0)` / `(true, "T", meetings 1)` | none / publish("T") |
| LPub3 | `action(false, "T", publishedTemplate {id:"p", isPublic:true})` / `isPublic:false` / 無し | unpublish("p") / none / none |

#### TemplateSuggestionLogic (B21 C20–C23)

| # | 入力 | 期待 |
|---|---|---|
| LS1 | meetings 空のテンプレを含む | 結果に含まれない |
| LS2 | 同 author・同 title の 2 件 (updatedAt `10-01` と `10-03`) | `10-03` の 1 件だけ |
| LS3 | 同 author・同 title・同 updatedAt、id `"a"` と `"b"` | `"b"` だけ |
| LS4 | authorUserId `""` の同 title 2 件 | 2 件とも残る |
| LS5 | copyCount 3 / 10 / 10 (updatedAt 新 / 旧) | 10(新), 10(旧), 3 の順 |
| LS6 | `sizeText`: courses 8・meetings の periodCount 合計 12 | `"8科目・週12コマ"` |
| LS7 | `metaText`: copyCount 12, updatedAt `2026-10-03T00:30:00.000Z`, meId null | `"12人が使用・2026/10/3 更新"` |
| LS8 | copyCount 0 / updatedAt `2026-10-02T15:30:00.000Z` (JST 10/3 0:30) / `2026-10-02T14:59:00.000Z` (JST 10/2 23:59) | `"2026/10/3 更新"` / `"2026/10/3 更新"` / `"2026/10/2 更新"` |
| LS9 | meId === authorUserId、copyCount 12 | `"あなたが公開・12人が使用・2026/10/3 更新"` |
| LS10 | meId null かつ authorUserId `""` | 先頭に `あなたが公開` が付かない |
| LS11 | `previewRows`: dayOfWeek 0 の meeting / periodCount 2・start 3 / teacher "山田"・room null / 科目不明 | 日曜は最後 (`weekday "日"`) / `"3–4限"` (U+2013) / detail `"山田"` / courseName `"授業"` |

#### CourseRuleLogic / SemesterOverviewDisplayLogic (B21 B28–B36)

| # | 入力 | 期待 |
|---|---|---|
| LCR1 | `footnote(false,false,70)` / `(true,false,70,80)` / `(false,true,70)` / `(true,true,70)` | §6.9 の 4 文 (率は 80) |
| LCR2 | `summary({null,null,null}, 70)` / `({80,4,null}, 70)` / `({null,null,3}, 70)` | `"共通（70%）"` / `"出席率 80% ・ 欠席 4 回まで"` / `"共通（70%） ・ 遅刻・早退 3 回で欠席 1 回"` |
| LSO1 | `requiredRate({requiredAttendanceRate:80}, 70)` / 無し | 80 / 70 |
| LSO2 | allowedAbsenceLessons 無し・allowedAbsences 2・remainingCount 9・allowedAbsenceDays 1 | `"あと2限 (1日) 休める"` / tertiary (旧規則と同じ。null / 負 / 残り全休も旧規則どおり) |
| LSO3 | L=−1・limitedBy "count" / L=−1・"rate" | `"欠席上限を超えています"` absent / `"下回る見込み"` absent |
| LSO4 | L=5・R=3 / L=0・R=10 / L=2・R=9 / L=0・remainingLessons 無し | `"残り全休OK"` accent / `"あと0回休める"` tertiary / `"あと2回休める"` / `"残り全休OK"` (R=0) |

#### RoomTimetableLogic (iOS RoomLogicTests の写し)

| # | 入力 | 期待 |
|---|---|---|
| LRM1 | `DEFAULT_SLOTS` | 5 個、start `[540,640,780,880,980]`、end `[630,730,870,970,1070]` |
| LRM2 | recurring `{userId:"u1", courseId:"c1", courseName:"Math", courseColor:"#123", dayOfWeek:3, start 1, count 2}`、member u1 name "Alice" | 1 件: dayOfWeek 3, start 1, count 2, color "#123", title "Math", subtitle "Alice", mergeKey "u1:c1", id "u1:c1:3:1" |
| LRM3 | dayOfWeek 0 / 1 / 6 | 7 / 1 / 6 |
| LRM4 | courseColor null・member color "#0f0" / member 無し | "#0f0" / "#F97316" |
| LRM5 | member name null・handle "al" / 両方 null | "al" / "No name" |
| LRM6 | 同じ曜日・時限に別メンバー 2 件 | 2 件 (id `u1:cy:3:2`, `u2:cz:3:2`) |
| LRM7 | 同じ key 2 件 (title "First", "Second") | 1 件 "First" |
| LRM8 | periodCount 0 | 1 |
| LRM9 | 金・月・水の順で入力 | 月, 水, 金 の順 |
| LRM10 | `resolveDaySlots`: preferred の学期に時間割あり / preferred 無し・default あり / どちらも無し・先頭あり / 時間割 0 / 該当の daySlots 空 | preferred の slots / default の slots / 先頭の slots / DEFAULT / DEFAULT |
| LRM11 | `parseInviteCode("https://atender.appily.run/rooms/join/abc")` / `(" abc ")` / `("…/join/abc/")` | `"abc"` / `"abc"` / `"abc"` |
| LRM12 | `displayDays([])` / 土曜・日曜のイベント | `[1..5]` / `[1..7]` |

#### TodayTimeline / NowNextText / HomeAttendance (iOS TodayTimelineTests / NowNextTextTests / HomeAttendanceTests)

標本: o1 = 1限 540–630、o2 = 2限 640–730、o3 = 3限 780–870。

| # | nowMinute | 期待 |
|---|---|---|
| LT1 | 0 件 | noClass |
| LT2 | 480 / 540 / 600 / 630 | upcoming(o1) / inClass(o1, o2) (開始境界) / inClass(o1, o2) / upcoming(o2) (終了境界) |
| LT3 | 735 / 780 / 870 / 1000 | upcoming(o3) / inClass(o3, null) / finished(o3) / finished(o3) |
| LT4 | 入力順を逆にする | LT2/LT3 と同じ |
| LT5 | 1 件だけ: 前 / 中 / 後 | upcoming / inClass(next null) / finished |
| LT6 | 重なる 2 件 (a 540–630, b 560–650) で 600 | current = a |
| LT7 | `isStale(null, …)` / `("2026-07-17", 2026-07-16T23:00Z = JST 7/17 8:00)` / `("2026-07-17", 2026-07-17T15:00Z = JST 7/18 0:00)` | true / false / true |
| LN1 | noClass | 3 つとも null |
| LN2 | upcoming(3限 英語 780 room "A302") | `"次の授業"` / `"3限 英語"` / `"13:00 · A302"` |
| LN3 | inClass(1限 情報デザイン 540–630 room "B201") | `"授業中"` / `"1限 情報デザイン"` / `"09:00–10:30 · B201"` |
| LN4 | upcoming で room null / room `""` | detail `"13:00"` |
| LN5 | finished | `"本日終了"` / `"今日の授業は終わりました"` / null |
| LHA1 | `isActive([])` / 1 件 | false / true |
| LHA2 | `defaultExpanded`: 全未記録 / 全出席 / 混在 / 0 件 | true / false / true / false |
| LHA3 | `shouldCollapse(41, 0)` / `(40, 0)` / `(-41, 0)` / `(41, 50)` | true / false / false / false |
| LHA4 | `shouldExpand(-41, 0)` / `(-40, 0)` / `(41, 0)` | true / false / false |
| LG1 | `currentPeriodIndex(DEFAULT_SLOTS, 539 / 540 / 629 / 630 / 635)` | null / 1 / 1 / null / null |

#### ClassTransferLogic (iOS B18 #U1–#U7。時間割: 金 mF1=1限(F1科目) / mF2=3–4限(F2科目)、月 mM1=1限(M1科目) / mM2=5限(M2科目)、target = `2026-09-14` (月))

| # | 入力 | 期待 |
|---|---|---|
| LCT1 | `defaultSourceDay("2026-09-14", [金1, 月1])` / `([月1])` / `([水1, 金1])` | 5 / null / 3 |
| LCT2 | `defaultSourceDate("2026-09-14", 5, "2026-04-06")` / `("2026-04-07", 5, "2026-04-06")` | `"2026-09-11"` / `"2026-04-10"` |
| LCT3 | `previewMoveDay(target, 5, tt, [oM1(1限), oM2(5限)])` | 2 行: 1限 count 1 F1科目 replaces `"月曜 1限 M1科目 を置き換え"` / 3限 count 2 F2科目 replaces null。`canSubmit` true |
| LCT4 | existing に transferId `"t"` の 1 限 | 1 限の行 blockedBy `"既に授業変更があります"`、`canSubmit` false |
| LCT5 | `previewSingle([3,4,6], "cF1", tt, [oM2(5限)])` / `([], …)` | 2 行・replaces 全て null / [] (`canSubmit([])` false) |
| LCT6 | `summary(MOVE_DAY 金, sourceDate "2026-09-11", 3 コマ)` / sourceDate null / SINGLE 情報数学 3・4 限 | `"金曜日の時間割 (3コマ) · 9/11(金) を休講"` / `"金曜日の時間割 (3コマ)"` / `"情報数学 3-4限"` |
| LCT7 | `needsDeleteConfirmation(t1, [t1 出席, t1 未記録, other 欠席])` | 1 |

### 7.R ルーティング (R)

| # | 条件 | 期待 |
|---|---|---|
| R1 | ナビ | リンクは `ホーム` `学期・科目` `友達` `設定` の 4 つ (BottomTab・SideNav とも)。`/rooms` への href が 0 |
| R2 | `/rooms` / `/rooms/room-1` / `/templates` を開く | パスが `/` になりホームが出る。`GET /api/rooms/room-1` と `GET /api/timetable-templates` は呼ばれない (`/templates` から) |
| R3 | `/rooms/join/abc123` を開く (セットアップ完了) | パスが `/`、`リンクで参加` シートが開き入力欄が `abc123`、`POST /api/rooms/join {inviteCode:"abc123"}` が **1 回** |
| R4 | R3 で join が 200 (room-1) | シートが閉じ、`情報科学1年` chip が `aria-pressed=true`、`GET /api/rooms/room-1/week` を呼ぶ |
| R5 | R3 で join が 404 `{error:{code:"INVITE_NOT_FOUND", message:"Invite not found"}}` | シートは開いたまま `Invite not found` が出る。join は 1 回だけ (再描画で再送しない) |
| R6 | `/rooms/join/abc123` を開く (セットアップ未完了) | `/setup` に行く。join は呼ばれない |
| R7 | 既存の redirect (`/timetable` `/stats` `/me` `/login` `/settings/calendar`) | 変更なし |

### 7.H ホーム (R / C)

| # | 条件 | 期待 |
|---|---|---|
| H1 | 「ルームを追加」を押す | `role=menu` に `ルームを作成` `リンクで参加` の 2 項目だけ (QR が無い)。Escape / 外側 pointerdown で閉じる |
| H2 | `ルームを作成` → 名前 `新ルーム` → `作成` (POST が `{room:{id:"room-9", …}}`) | `POST /api/rooms {name:"新ルーム"}` (description は空なら送らない)。シートが閉じ、`GET /api/rooms` を取り直し、`room-9` の chip が選択状態 |
| H3 | 作成が 500 | toast `保存できませんでした、もう一度試してください`、シートは開いたまま |
| H4 | `リンクで参加` → `https://atender.appily.run/rooms/join/xyz` → `参加` | body `{inviteCode:"xyz"}`。成功でそのルームに切替。参加シートの footer に `キャンセル` が無い |
| H5 | 自分 context | ⚙ は `時間割の設定` (`ルームの設定` は無い) |
| H6 | ルーム context | ⚙ は `ルームの設定` (`data-testid=home-room-settings`)、`時間割の設定` は無い。学期選択が出ている |
| H7 | ルーム context で学期選択を `semester-2` にする | `GET /api/rooms/room-1/week?weekStart=<今週の月曜 JST>&semesterId=semester-2` |
| H8 | week の `meetings` が空で `recurringMeetings` に 1 件 (月 1限 数学I) | グリッドに `数学I` が出る (`meetings` は使わない) |
| H9 | week の `meetings` に 1 件、`recurringMeetings` 空 | `メンバーの時間割がまだありません` |
| H10 | ルーム設定で `ルームを削除` → 確認 `削除` | `DELETE /api/rooms/room-1`、シートが閉じ、`自分` chip が選択、パスは `/` のまま |
| H11 | ルーム設定の文言 | `説明` / `メンバー時間割を表示` (トグル 1 つ) / メンバー行 `@tanaka · オーナー` / 確認ダイアログに本文が無く確認ボタンが `追放` `退出` `削除` |
| H12 | `メンバー時間割を表示` の PATCH が 500 | トグルが元に戻り toast `保存できませんでした、もう一度試してください` |
| H13 | 今日の強調 (`vi.useFakeTimers({ toFake: ["Date"] })` + `setSystemTime("2026-10-28T02:00:00Z")` = JST 水 11:00 = 660 分) | 曜日ヘッダー `水` に `data-today="true"`、時限ラベル `2限` (640–730) に `data-current="true"`、`timetable-now-ring` が 1 個 |
| H14 | 同 `2026-10-28T14:59:00Z` (JST 水 23:59) / `2026-10-28T15:00:00Z` (JST 木 0:00) | `水` が today / `木` が today。どちらも `data-current` なし・ring なし |
| H15 | JST 土 11:00 (`2026-10-31T02:00:00Z`) で daysOfWeek [1..5]・土の授業なし | どのヘッダーにも `data-today` が無く ring も無い。`2限` ラベルは `data-current="true"` |
| H16 | ルーム context でも H13 と同じ | 同じ属性が付く |

### 7.A 出欠オーバーレイ (C: `SelfTodayCTA` を QueryClient + MSW で描く)

| # | 条件 | 期待 |
|---|---|---|
| A1 | today 0 件 | 何も出ない |
| A2 | today 3 件・未記録 2 | 開いた状態: `今日は全出席 (2)`、`各コマの出欠を開く` (`cta-expand-toggle`)、`attendance-grabber` |
| A3 | today 3 件・全部記録済み | 閉じた状態: `attendance-grabber` だけ (`今日は全出席` / `本日の記録は完了済` が無い) |
| A4 | A2 で `今日は全出席 (2)` を押す | `POST /api/attendance/mark-all-present`。楽観更新で未記録 0 になったらタイルが閉じる (grabber だけ) |
| A5 | A2 で `各コマの出欠を開く` → 最後の未記録を個別に `出` | 未記録 0 でタイルは閉じるが、各コマの出欠パネルは開いたまま |
| A6 | A3 で grabber を押す | タイルが開き `本日の記録は完了済` (disabled) |
| A7 | 開いた状態で grabber を下へ 41px ドラッグ (pointerdown → pointerup clientY +41) / 40px | 閉じる / 開いたまま |
| A8 | 閉じた状態で上へ 41px | 開く |
| A9 | Now/Next (fake Date `2026-05-13T00:30:00Z` = JST 9:30、occurrence 1限 540–630 room "101" 数学I、2限 英語) | `授業中 · 09:00–10:30 · 101` と `1限 数学I` |
| A10 | 同 JST 8:00 | `次の授業 · 09:00 · 101` と `1限 数学I` |
| A11 | 全授業終了後 (JST 23:00) | `本日終了` と `今日の授業は終わりました` |
| A12 | today の `date` が `2026-05-13` のまま、fake Date を JST `2026-05-14 00:00` (`2026-05-13T15:00:00Z`) に進めて 60 秒経過 | `GET /api/today` を取り直す |
| A13 | today が `2026-05-13` 全記録済み (閉) → 取り直しで `2026-05-14`・未記録あり | タイルが開く (日付が変わった時点で再判定) |

### 7.S オンボーディング (R: `/setup`。`/api/me` は `setupRequiredMe`)

| # | 条件 | 期待 |
|---|---|---|
| S1 | 表示直後 | `Step 1/3: 学校を選ぶ`、`学校名で検索`、`都道府県`、`＋ リストに無い学校を追加` |
| S2 | `東京` を入力 | 300 ms 後に `GET /api/schools?q=東京&limit=20` (prefecture は空なら送らない)。都道府県 `東京都` を選ぶと `prefecture=東京都` も |
| S3 | 学校を選ぶ | `Step 2/3: 学科を選ぶ`、学校名と `変更`、`{学校名} の学科名で検索`、`＋ 学科を追加` |
| S4 | `変更` / `戻る` | `Step 1/3` に戻る |
| S5 | 学科を選んで `次へ`、templates が meetings ありの 2 件 | `PATCH /api/me {schoolId, departmentId}` → `GET /api/timetable-templates?schoolId=…&departmentId=…&limit=20`、`Step 3/4: 時間割を選ぶ`、`✓ 同じ学科の時間割が見つかりました`、カード 2 枚 |
| S6 | S5 で templates 0 件 / 500 | `Step 3/3: 学期を作る`、エラー表示なし |
| S7 | テンプレの段で `この時間割で進む` (未選択) | disabled |
| S8 | カードを選び `この時間割で進む` | `Step 4/4: 学期を作る`、`取り込む時間割: {title}` と `変更` |
| S9 | `使わずに進む` | `Step 4/4`、`取り込む時間割` が出ない |
| S10 | 学期の段の初期値 (fake Date `2026-10-29T03:00:00Z`) | 名前 `2026 後期`、開始 `2026-10-01`、終了 `2027-03-31` |
| S11 | 同 `2026-03-31T14:59:00Z` (JST 3/31 23:59) / `2026-03-31T15:00:00Z` (JST 4/1 0:00) | `2025 後期 / 2025-10-01 / 2026-03-31` / `2026 前期 / 2026-04-01 / 2026-09-30` |
| S12 | テンプレ選択 → `完了して時間割を作る` | 送信順 `POST /api/semesters` → `POST /api/timetable-templates/T/copy {semesterId:"semester-new"}` (`replaceExisting` キー無し) → `PATCH /api/me {defaultSemesterId:"semester-new"}` → `GET /api/me` → パス `/` |
| S13 | copy が 500 | 赤帯 `学期は作成しました。時間割を取り込めませんでした` と `もう一度` `取り込まずに完了`。`PATCH /api/me {defaultSemesterId}` は送られていない。名前・日付の入力が disabled |
| S14 | S13 → `取り込まずに完了` | `POST /api/semesters` は合計 1 回、copy は合計 1 回、`PATCH /api/me {defaultSemesterId}` → `/` |
| S15 | S13 → `もう一度` (今度は 201) | `POST /api/semesters` 合計 1 回、copy 合計 2 回 → PATCH → `/` |
| S16 | copy が 409 | 成功扱いで PATCH → `/` |
| S17 | テンプレなしで完了 | `POST /api/semesters` → `PATCH /api/me` → `/` (copy を呼ばない) |

### 7.SM 学期 (R / C)

| # | 条件 | 期待 |
|---|---|---|
| SM1 | `/` を開く。semesters = `[{id:"old", name:"2000 前期", 2000-04-01〜2000-09-30}]`、localStorage 空 | ダイアログ `前回の学期が終了しました`、本文 `「2000 前期」は 2000年 9月30日 に終了しました。新しい学期を作成しますか?`、ボタン `作成する` `あとで` |
| SM2 | SM1 で `あとで` | 閉じる。`localStorage["atender.semesterRollover.dismissedSemesterId"] === "old"`。アンマウント→再マウント (別ルートへ行って戻る) でも出ない |
| SM3 | SM1 で × (閉じる) | SM2 と同じ (保存される) |
| SM4 | SM2 の後、semesters に `{id:"old2", 2001-04-01〜2001-09-30}` を足して再マウント | 再び出る (対象 `2001 …`) |
| SM5 | semesters に 1 件でも終了していない学期がある (既定 fixture) | ダイアログが出ない |
| SM6 | semesters 0 件 | 出ない |
| SM7 | SM1 の後 `document.visibilityState = "visible"` で `visibilitychange` を発火 (ダイアログを `あとで` 以外で消す手段が無いので、`localStorage` を一度空にして再発火) | 評価が走り再び出る。ホームのシート (ルーム作成) が開いている間に発火した場合は出ない |
| SM8 | SM1 で `作成する` | `新しい学期` シート。初期値 = `SemesterRollover.proposal(old, todayString())` の 3 値 (Reviewer はテスト内で同じ関数で期待値を作る)。注記 `時限と表示曜日は前の学期から引き継がれます` |
| SM9 | 新しい学期シート: me に学校・学科あり、templates 2 件 | カード `同じ学科の時間割が 2 件見つかりました` と `選ぶ` |
| SM10 | `選ぶ` → ブラウザ (帯 `✓ 同じ学科の時間割が見つかりました`) → カード → `この時間割を使う` | ブラウザが閉じ、カードが `取り込む: {title}` と `解除`、注記が `時限と表示曜日は取り込む時間割に合わせます` |
| SM11 | `学期を作成` | `POST /api/semesters` → copy → `PATCH /api/me {defaultSemesterId}` の順。シートが閉じ、ホームの学期表示が新学期名 |
| SM12 | copy が 500 | toast `学期は作成しました。時間割は「時間割の設定」から取り込めます`、PATCH は送る、シートは閉じる |
| SM13 | copy が 409 | toast なしで PATCH → 閉じる |
| SM14 | `POST /api/semesters` が 500 | toast `保存できませんでした`、シートは開いたまま、copy / PATCH を送らない |
| SM15 | PATCH が 500 | toast `既定の学期を更新できませんでした。設定の学期管理から選べます`、シートは閉じ、ホームは新学期を表示 |
| SM16 | 名前を空白だけ / 開始 > 終了 | `学期を作成` disabled |
| SM17 | 引継ぎ: semesters [A(時間割 8 コマ・月〜土), B(時間割なし)]、ホームで B を選ぶ | グリッドの行が 8、列が月〜土 |
| SM18 | SM17 で空セルを押す | `POST /api/user-timetables` の body に 8 個の `daySlots` と `daysOfWeek:[1,2,3,4,5,6]` |
| SM19 | 引継ぎ元なし (最初の学期) | 5 行・月〜金、POST の `daysOfWeek` は `[1,2,3,4,5]` |
| SM20 | 学期管理: 削除が 409 / 500 | toast `時間割があるため削除できません。先に時間割を削除してください` / `削除できませんでした` |
| SM21 | 学期管理: `公開時間割から取り込む` | me に 4 値があれば enabled、`schoolName` が null なら disabled |

### 7.T 公開時間割ブラウザと取込 (C: `TemplateBrowserSheet` / R: 入口)

| # | 条件 | 期待 |
|---|---|---|
| T1 | 0 件 | `この学科の公開時間割はまだありません` と説明文 |
| T2 | 取得 500 → `再読み込み` | 再取得する |
| T3 | カード | `{title}` / `8科目・週12コマ` / `12人が使用・2026/10/3 更新`。作成者 handle が無い |
| T4 | `別の学科を探す` → 学校 → 学科 | 一覧がその学科で再取得される (`departmentId` が変わる)。`PATCH /api/me` を送らない。`＋ リストに無い学校を追加` `＋ 学科を追加` が出ない |
| T5 | カード → 中身 | `時間割の中身`、previewRows の行。`戻る` で一覧へ |
| T6 | 取り込み先の学期に時間割なし → `この学期に取り込む` | copy body `{semesterId}` (`replaceExisting` キー無し)。toast `「{title}」を取り込みました`、`onImported` |
| T7 | 取り込み先に空の時間割 (科目 0・授業 0) | 確認なしで `{semesterId, replaceExisting:true}` を 1 回 |
| T8 | 取り込み先に科目 2 の時間割 | 確認 `既存の時間割と出欠記録を置き換えます` / `「{学期名}」の時間割（2 科目）と、その出欠記録はすべて削除され、元に戻せません。`。`キャンセル` → 何も送らない / `置き換える` → `replaceExisting:true` |
| T9 | 初回 copy が 409、取り直した時間割が空 | `GET /api/user-timetables` を取り直し、確認なしで `replaceExisting:true` を送る (copy 合計 2 回) |
| T10 | 409 → 取り直しても 409 | toast `取り込めませんでした、もう一度試してください`、copy 合計 2 回で止まる |
| T11 | 404 | toast `この時間割は公開が終了しました`、一覧を再取得して一覧画面 |
| T12 | 500 | toast `取り込めませんでした、もう一度試してください`、中身画面のまま |
| T13 | 学期 0 件 | `この学期に取り込む` disabled、`先に学期を作成してください` |
| T14 | 成功後 | `["user-timetables"]` `["me"]` `["today"]` `["stats"]` `["semesters"]` `["day"]` を invalidate (Reviewer は `queryClient.invalidateQueries` を spy) |
| T15 | lockSemester (E2) | `取り込み先: {学期名}` (Select が無い) |
| T16 | 確認中に取り込み先を変えてから `置き換える` (lock=false) | body の `semesterId` は確認を出した時点の学期 |
| T17 | E4: 学校・学科を変えて保存、提案 1 件以上 | ブラウザが帯付きで開く。× で学校・学科シートも閉じる、`戻る` で学校・学科シートに戻る |

### 7.TS 時間割の設定 (C)

| # | 条件 | 期待 |
|---|---|---|
| TS1 | 自作の時間割 (publishedTemplate なし・sourceTemplateId null) を開く | 公開トグル ON |
| TS2 | 取り込んだ時間割 (sourceTemplateId `"x"`・publishedTemplate なし) | OFF |
| TS3 | publishedTemplate `{isPublic:false}` / `{isPublic:true, title:"公開名"}` | OFF / ON・公開タイトル `公開名` |
| TS4 | TS2 のまま `保存` | `publish-as-template` を送らない (**W-D1**) |
| TS5 | publishedTemplate isPublic true → OFF にして保存 | `PATCH /api/timetable-templates/{id} {isPublic:false}`、シートが閉じる |
| TS6 | ON・授業 0 件 | `授業を 1 つ以上登録すると公開されます` が出る、保存で publish を送らない |
| TS7 | ON・授業あり・公開タイトル空 | `公開タイトルを入力してください`、閉じない |
| TS8 | publish が 500 | `公開設定を保存できませんでした`、閉じない (名前の PATCH は送信済み) |
| TS9 | 「同じ学校の公開時間割から持ってくる」 | 存在しない |
| TS10 | timetable null | `公開時間割から取り込む` が enabled (**W-D2**) |
| TS11 | me の学校・学科なしで `公開時間割から取り込む` | `先に学校・学科を設定してください` (赤) |
| TS12 | 既存の時間割 (科目あり) へ取り込み | 確認ダイアログを経て `replaceExisting:true` (**W-D2**)、成功で両シートが閉じる |
| TS13 | 危険ゾーン `削除する` → `時間割を削除` の `削除する` | `DELETE /api/user-timetables/{id}`、閉じる。500 なら toast `削除できませんでした` |
| TS14 | timetable null | 危険ゾーンが無い |
| TS15 | 名前・曜日・時限を全部変えて保存 | PATCH が 3 本、`title` → `daysOfWeek` → `daySlots` の順 (前のが返ってから次) |

### 7.CO 科目 (C)

| # | 条件 | 期待 |
|---|---|---|
| CO1 | 既存科目 (80, null, 3) を開く | 率 ON・80、上限 OFF、換算 ON・3 |
| CO2 | 上限を ON にした直後 / 率 (科目値 null) を ON にした直後 (me の率 75) | ステッパー 5 / 75 |
| CO3 | footnote | §6.9 の 4 通り (トグルに追従) |
| CO4 | 編集保存 (上限だけ ON・4) | PATCH body のキー集合 ⊇ `{requiredAttendanceRate, maxAbsences, tardiesPerAbsence}`、値 `null, 4, null` |
| CO5 | 新規保存 (全 OFF) | POST body に 3 キーが無い |
| CO6 | 新規保存 (率 ON・60) | POST body `requiredAttendanceRate: 60` があり他 2 キーが無い |
| CO7 | 科目詳細 | `基準: 共通（70%）` (3 値 null・me 70) / `基準: 出席率 80% ・ 欠席 4 回まで` |
| CO8 | 科目行: stats.requiredAttendanceRate 80・`props.requiredRate` 70・率 75% | 率の色が「下回る」側 (absent)。マーカー位置 `left: 80%` |
| CO9 | 科目行: allowedAbsenceLessons 2・remainingLessons 9 | `あと2回休める` |

### 7.D 授業変更 (C: `DayDetailSheet` / `ClassTransferSheet`)

| # | 条件 | 期待 |
|---|---|---|
| D1 | 日別シート | 休講の節と `授業 (N)` の間に `授業変更` の節と `授業変更` ボタン |
| D2 | transfers 1 件 (MOVE_DAY 金、sourceDate 2026-09-11、3 コマ) | `金曜日の時間割 (3コマ) · 9/11(金) を休講` と `取り消す` |
| D3 | `取り消す` (記録 0) | 確認なしで `DELETE /api/class-transfers/{id}` |
| D4 | `取り消す` (記録 2) | `出欠記録 2 件も削除されます` → `取り消す` で DELETE / `キャンセル` で送らない |
| D5 | 授業変更シート (target 月曜、時間割は §7.L の金・月) | 既定 `曜日ごと`・`金` 選択、`この日に置く授業` に 2 行、休講 ON・日付 `2026-09-11` |
| D6 | `月` を選ぶ | `この日と同じ曜日です`、送信 disabled |
| D7 | 送信 (曜日ごと) | body `{kind:"MOVE_DAY", date:"2026-09-14", sourceDayOfWeek:5, suspendSourceDate:true, sourceDate:"2026-09-11", liftTargetSuspension:false, semesterId?}` |
| D8 | 休講 OFF で送信 | body に `sourceDate` キーが無く `suspendSourceDate:false` |
| D9 | `コマごと` → 科目 F1科目 → 3・4 限 | 1 行 `3-4限 F1科目`、送信 `追加`、body `{kind:"SINGLE", courseId:"cF1", periodIndexes:[3,4], …}` |
| D10 | 409 `PERIOD_CONFLICT` / `DISPLACED_HAS_RECORD` / `DAY_SUSPENDED` | 各日本語文 (§5.7.2) |
| D11 | targetIsSuspended | `この日の休講は解除されます`、body `liftTargetSuspension:true` |
| D12 | 成功 | シートが閉じ、`["day"]` `["semesters"]` `["stats"]` `["today"]` `["timetable-suspensions"]` を invalidate |

### 7.ST 設定 (R: `/settings`)

| # | 条件 | 期待 |
|---|---|---|
| ST1 | 学校・学科シート | `学校 ID` `学科 ID` の入力欄が無い。`現在: {学校} / {学科}` |
| ST2 | 現在と同じ学校・学科を選ぶ | 保存 disabled |
| ST3 | 別の学科で保存、提案 0 件 | `PATCH /api/me {schoolId, departmentId}`、toast `学校・学科を変更しました`、閉じる |
| ST4 | 保存が 500 | toast `保存できませんでした`、開いたまま |
| ST5 | 学校・学科の行の右 | `{schoolName} / {departmentName}` |
| ST6 | その他の節 | `プライバシーポリシー` `利用規約` `サポート` `ログアウト` `アカウントを削除` の順。押すと `window.open("/privacy", "_blank", "noopener,noreferrer")` 等 |
| ST7 | `localStorage` に `theme` が無い状態で起動 | `data-theme="light"` (OS がダークでも) |
| ST8 | `自動` を選ぶ | `localStorage.theme === "auto"`、以後 OS に追従 |
| ST9 | `theme` が `"dark"` で起動 | dark (既存ユーザーの明示値を引き継ぐ) |

---

## 8. テスト基盤

### 8.1 フレームワークと配置

- Vitest 2 + RTL + MSW 2 (jsdom 29)。`cd apps/web ; pnpm exec vitest run` (test script は無い)
- 単体 `tests/lib/<ファイル名>.test.ts`、コンポーネント `tests/components/`、ルート `tests/routes/` (`renderApp`)
- `vitest.config.ts` の `define VITE_API_URL=http://localhost:3000` は消さない
- 時刻: `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(...)` (Date だけを偽装。`setTimeout` を偽装すると MSW と RTL の待ちが止まる)。60 秒の経過は `useNow` の interval を進める必要があるので A12 だけ `toFake: ["Date", "setInterval"]` + `vi.advanceTimersByTime(60_000)`
- E2E (chrome-devtools MCP) は今回使わない

### 8.2 基盤の前提変更 (Developer がブロック 1 で入れる。新規テストは書かない)

| ファイル | 変更 | 理由 |
|---|---|---|
| `tests/setup.ts` | `window.localStorage` / `globalThis.localStorage` の `getItem` が関数でなければ、Map ベースの Storage (`getItem/setItem/removeItem/clear/key/length`) を `defineProperty` で入れる。`afterEach` で `localStorage.clear()` | Node 25 + jsdom 29 で `localStorage.getItem is not a function`。本書で `/` (学期提案) と全画面 (テーマ) が localStorage を読むようになる |
| `tests/msw/handlers.ts` | 既定 `GET /api/semesters` の `endDate` を `"2099-03-31"` に | §2 R7。今日の日付で全学期が終了扱いになり、学期提案が全ルートテストで出るのを防ぐ (`2026-09-30` に依存するテストは無い: grep 済) |
| `tests/msw/handlers.ts` | `defaultMe.user` に `schoolName: "テスト大学"`, `departmentName: "情報科学科"`, `requiredAttendanceRate: 70`, `handle: "tanaka"`, `image: null`, `inviteCode: "invite-1"` を足す | 新 UI がこれらを読む |
| `tests/msw/handlers.ts` | 既定ハンドラ追加 (下表) | `onUnhandledRequest: "error"` |

追加する既定ハンドラ:

| endpoint | 既定応答 |
|---|---|
| `GET /api/rooms` | `{ rooms: [] }` |
| `GET /api/user-timetables` | `{ userTimetables: [] }` |
| `POST /api/user-timetables` | 201 `{ userTimetable: { id:"ut-new", userId:"user-1", semesterId: body.semesterId, title: body.title, sourceTemplateId:null, daysOfWeek: body.daysOfWeek ?? [1,2,3,4,5], daySlots: body.daySlots, courses:[], meetings:[], createdAt, updatedAt } }` |
| `PATCH /api/user-timetables/:id` / `DELETE /api/user-timetables/:id` | 200 (PATCH は body を反映した時間割、DELETE は `{ok:true}`) |
| `PATCH /api/timetable-templates/:id` | `{ template: { id, isPublic: body.isPublic } }` |
| `GET /api/semesters/:id/overview` | 空の overview (courses `[]`, days `[]`) |
| `GET /api/day/:date` | `{ date, occurrences:[], courseSuspensions:[], timetableSuspension:null, transfers:[] }` |
| `POST /api/class-transfers` / `DELETE /api/class-transfers/:id` | 201 `{ transfer: … }` / 200 `{removedOccurrences:0, removedAttendanceRecords:0, restoredOccurrences:0}` |
| `GET /api/rooms/:id` / `GET /api/rooms/:id/members` / `GET /api/rooms/:id/week` | 最小の room / `{members:[]}` / `{weekStart, weekEnd, members:[], meetings:[], recurringMeetings:[]}` |
| `POST /api/rooms` / `POST /api/rooms/join` | 201 `{ room }` / 200 `{ room }` |
| `GET /api/friendships` | `{ friends:[], incoming:[], outgoing:[] }` |
| `DELETE /api/semesters/:id` / `PATCH /api/semesters/:id` | `{ok:true}` / `{ semester }` |

(既存の `GET /api/timetable-templates` 既定は meetings が空なので `visible` で 0 件になる。提案ありのテストは `server.use` で meetings 付きを返す。)

### 8.3 既存テストの扱い (Developer が実装と同じブランチで行う。grep で洗い出した全件)

| ファイル | 対応 | 理由 |
|---|---|---|
| `tests/routes/Home.test.tsx` (9 件、W1) | **ファイル削除** | 2026-05 MVP のホーム (挨拶・マスコット・`すべて出席にする`) を前提にした陳腐化。本書の §7.H / §7.A で置き換わる |
| `tests/routes/Templates.test.tsx` (4 件、うち既知失敗 W7-1/2) | **ファイル削除** | `/templates` 撤去 |
| `tests/routes/SettingsDeleteAccount.test.tsx` の `describe("[B20 #W5] /templates author label")` | **その describe だけ削除** | `/templates` 撤去 (作成者 handle を出さない仕様になる) |
| `tests/routes/Setup.test.tsx` (5 件、うち既知失敗 W4 1 件) | **ファイル削除** | 3 段固定・`/timetable` 遷移・`学校選択` の旧仕様。§7.S で置き換わる |
| `tests/routes/Settings.test.tsx` の既知失敗 4 件 (W5 sign-out 1 + W6 3) | **その 4 件を削除**、残り 2 件 (`必要出席率` 行 / RequiredRateSheet) は残す | 台帳 W5/W6 の陳腐化。§7.ST で置き換わる |
| `tests/routes/B21CalendarRemoval.test.tsx` | AW2 の 2 件 (`/rooms/:id`, `/rooms` 一覧) と「残存画面」の `/templates` `/rooms` 2 件を削除。AW3 は入口を「`/` → ルーム chip → `ルームの設定`」に変え、文言の正規表現を `/メンバー時間割を表示/` に。AW8 の `it.each` から `/rooms` `/rooms/room-1` `/templates` を外す | 撤去したルート / 文言変更 |
| `tests/components/MainAttendanceCTA.test.tsx` | `個別修正を開く/閉じる` の aria-label を参照する 2 件を `各コマの出欠を開く/閉じる` に。開閉の新しい 2 段構造に合わない件があれば §7.A に合わせて書き換える | 文言・構造の変更 |
| `tests/components/CourseListItem*.test.tsx` | `stats` に新フィールドが無い fixture は旧規則に落ちるので**変更不要** (LSO2) | — |
| `tests/lib/resolveTheme.test.tsx` の `initializes auto from OS dark when localStorage is empty` | 期待を `light` に (テスト名も `initializes light when localStorage is empty`) | §5.8.3 |
| `tests/routes/Guard.test.tsx` / `SignIn` / `Stats` / `Verify` | 変更しない | 本書の対象外 (SignIn 5 / Stats 3 / Verify 2 は既知失敗のまま) |

### 8.4 台帳 (`.knowledge/known-failures.md` Web 節)

- 削除で消える既知失敗: Home 9 + Templates 2 + Setup 1 + Settings 4 = **16**。残る既知失敗は **SignIn 5 / Stats 3 / Verify 2 = 10** (Verify W8 は Setup 画面の文言が変わるので結果が変わり得る。Reviewer が実測して分類を更新する)
- Reviewer は着手時と完了時に `pnpm exec vitest run` を走らせ、失敗の**名前集合**を台帳の Web 節の先頭 (「★ 最新実測」) に置換で書く。未分類の失敗が 1 件でも残ればマージ不可 (Muraki 規約)
- W7 節 (`/templates`) は「`/templates` 撤去で対象消滅 (2026-10-30, web-parity)」に置換。末尾の「★ 同型の未修正バグ (`usePublishTimetable` のエラー表示皆無)」も §5.5 の `公開設定を保存できませんでした` で解消、と置換

---

## 9. 変更・新規・削除ファイル (全列挙。パスは `apps/web/` 起点)

### 9.1 新規

| ファイル | 内容 |
|---|---|
| `src/lib/SchoolClock.ts` `CalendarDate.ts` `SemesterRollover.ts` `TimetableCarryOver.ts` `SemesterCreationPlan.ts` `TemplateImportLogic.ts` `TimetablePublishLogic.ts` `TemplateSuggestionLogic.ts` `CourseRuleLogic.ts` `SemesterOverviewDisplayLogic.ts` `TimetableGridLayout.ts` `RoomTimetableLogic.ts` `TodayTimeline.ts` `ClassTransferLogic.ts` | §6 |
| `src/lib/toast.ts`、`src/components/ui/ToastHost.tsx` | §5.0 |
| `src/lib/pendingRoomJoin.ts` | §5.0 |
| `src/components/setup/SchoolDepartmentPicker.tsx` | §5.2.2 |
| `src/components/templates/TemplateBrowserSheet.tsx` | §5.4 |
| `src/components/home/SemesterCreateSheet.tsx` | §5.3.2 |
| `src/components/semester/ClassTransferSheet.tsx` | §5.7.2 |
| `src/api/hooks/useClassTransfers.ts` | `useCreateClassTransfer()` / `useDeleteClassTransfer()` (§5.7.1 の invalidate) |

### 9.2 変更

| ファイル | 変更 |
|---|---|
| `src/router.tsx` | §3 |
| `src/routes/_root.tsx` | `ToastHost` を置く |
| `src/routes/Setup.tsx` | 作り直し (§5.2) |
| `src/components/layout/navItems.ts` | 4 項目 |
| `src/components/home/Home.tsx` | chip Menu・シート 4 種・学期選択と ⚙ の移設・学期提案・pending join (§5.1, §5.3.1) |
| `src/components/home/HomeBody.tsx` | ルームに `semesterId` を渡す、`key={roomId}` |
| `src/components/home/ContextChips.tsx` | `onAddRoom: (action: "create" \| "join") => void`、Menu (§5.1.2) |
| `src/components/home/SelfTimetableView.tsx` | 学期選択を外す (Home へ)、引継ぎ (§5.3.3)、今日・現在コマ、`TimetableSettingsSheet` に `semesterId` / `onSaved` |
| `src/components/home/SelfTodayCTA.tsx`、`src/components/today/MainAttendanceCTA.tsx` | §5.1.6 |
| `src/components/timetable/TimetableView.tsx` | §5.1.7 |
| `src/components/rooms/RoomTimetable.tsx` | §5.1.3 |
| `src/components/rooms/RoomCreateSheet.tsx`、`JoinByCodeSheet.tsx`、`src/components/sheet/RoomSettingsSheet.tsx` | §5.1.4–5.1.5 |
| `src/components/sheet/TimetableSettingsSheet.tsx` | §5.5 |
| `src/components/sheet/SemesterListSheet.tsx` | §5.3.4 |
| `src/components/sheet/SchoolDeptEditSheet.tsx` | §5.8.1 |
| `src/components/sheet/BottomSheet.tsx`、`src/components/ui/ConfirmDialog.tsx` | §5.0 |
| `src/components/semester/CourseEditModal.tsx`、`CourseDetailModal.tsx`、`CourseListItem.tsx`、`DayDetailSheet.tsx` | §5.6, §5.7.1 |
| `src/components/settings/Settings.tsx` | 学校・学科の右の名前、法務 3 行 (§5.8.2) |
| `src/lib/useTheme.ts` | §5.8.3 |
| `src/api/queryKeys.ts` | `roomWeek: (id, weekStart, semesterId: string) => ["rooms", id, "week", weekStart, semesterId]` |
| `src/api/hooks/useRoomWeek.ts` | `(id, weekStart, semesterId: string \| null)`、query に `semesterId` |
| `src/api/hooks/useTemplates.ts` | `useTemplates(query, { enabled, staleTime })`、`useCopyTemplate` の invalidate (§5.4.4)、`useUnpublishTemplate()` 追加 |
| `src/api/hooks/useUserTimetable.ts` | `usePublishTimetable` に invalidate (`user-timetables`, `me`)、`useDeleteUserTimetable()` 追加 (invalidate `user-timetables` `today` `stats` `semesters`) |
| `src/api/hooks/index.ts` | `useClassTransfers` を export |
| `tests/setup.ts`、`tests/msw/handlers.ts` | §8.2 |
| `tests/…` | §8.3 |

### 9.3 削除 (import 元を grep 済み。下の 8 ファイル以外からは参照されていない)

`src/routes/Rooms.tsx` `src/routes/RoomDetail.tsx` `src/routes/JoinRoom.tsx` `src/routes/Templates.tsx` `src/components/rooms/Rooms.tsx` `src/components/rooms/RoomDetail.tsx` `src/components/rooms/RoomCard.tsx` `src/components/rooms/JoinRoom.tsx`

(`useCreateTemplate` は呼び出し元が無くなるが、本書では消さない。)

---

## 10. 実装順序 (Codex への指示ブロック)

依存順。各ブロックの終わりで `pnpm exec tsc --noEmit` と `pnpm exec vitest run` を回し、失敗の名前集合が「台帳の既知失敗 26 − そのブロックまでに消したもの」から増えていないことを見て次へ進む。Codex は同時 1 つ。

| # | ブロック | 中身 | 完了の目安 |
|---|---|---|---|
| 1 | 純粋関数 + テスト基盤 | §6 の 14 ファイル (`lib/`)、§8.2 の基盤変更 | tsc 緑・既存テストの結果が変わらない |
| 2 | 共通部品 + hooks | §5.0 (`BottomSheet` / `ConfirmDialog` / toast / pendingRoomJoin)、§9.2 の hooks・queryKeys | 同上 |
| 3 | 学校・学科ピッカー + Setup | §5.2 (`SchoolDepartmentPicker`、`Setup.tsx` 作り直し)。`tests/routes/Setup.test.tsx` を削除 | `/setup` が 3 / 4 段で完走 |
| 4 | ホーム: chip・ルーム | §5.1.1–5.1.5、§5.1.7 (TimetableView の強調)、ルームの 3 シート | ルーム作成・参加・設定がホームで完結 |
| 5 | ホーム: 出欠オーバーレイ | §5.1.6。`MainAttendanceCTA.test.tsx` の追従 | 2 段の開閉 |
| 6 | 学期 | §5.3.1–5.3.3 (提案・新しい学期シート・引継ぎ)、§5.3.4 の 409 toast | 終了学期だけのアカウントで提案が出る |
| 7 | 公開時間割 | §5.4 (ブラウザ・取込)、§5.5 (時間割の設定の作り直し)、入口 E1–E4 (§5.8.1 の学校・学科シートを含む) | W-D1 / W-D2 が解消 |
| 8 | 科目の基準 | §5.6 | 3 か所 |
| 9 | 授業変更 | §5.7 | 日別シートから作成・取消 |
| 10 | 設定 | §5.8.2 (行・法務)、§5.8.3 (テーマ)、`resolveTheme.test.tsx` の追従、`Settings.test.tsx` の 4 件削除 | — |
| 11 | ルーティング撤去 + 正典 | §3 (redirect・ナビ 4 項目)、§9.3 の削除、§8.3 の残り (`Home.test.tsx` `Templates.test.tsx` 削除・B21 / SettingsDeleteAccount の該当削除)、§11 の正典置換 | tsc 緑・既知失敗 10 以下・未分類 0 |

---

## 11. 正典の置換 (同じブランチで)

### 11.1 `projects/atender/CLAUDE.md`

| 行 | before | after |
|---|---|---|
| 7 (要約) | `Web 版 (\`apps/web\`) が機能の正典。` … `iOS ネイティブ版 (\`apps/ios\`) は **機能を Web と共有しつつ、入口・見た目と操作は iOS ネイティブ** (Apple HIG / 標準部品 / Liquid Glass)。` | `**iOS (\`apps/ios\`) が仕様 (機能・画面遷移・文言) の正典**。Web 版 (\`apps/web\`) は同じ仕様を React で提供し、見た目は Web のデザイン言語 (トークンは iOS と 1:1) で描く (2026-10-30 web-parity、\`.designs/20261030-web-parity-with-ios.md\`)。` … `iOS ネイティブ版は見た目と操作を iOS ネイティブ (Apple HIG / 標準部品 / Liquid Glass) で作る。` (カレンダーの文はそのまま) |
| 36 (規約) | `Web のボトムナビは 5 項目、**iOS は 4 タブ (ホーム/学期・科目/友達/設定)** — ルームは iOS ではホームの context chip に集約 (…)。機能は Web と共有、入口だけが違う。` | `**Web のナビも iOS のタブも 4 項目 (ホーム/学期・科目/友達/設定)** — ルームはホームの context chip に集約 (iOS 2026-09 build 18、Web 2026-10-30 web-parity)。` (以降の Today/Timetable/Stats の文はそのまま。末尾「iOS 独自機能の追加・Web 機能の削除は設計 doc で明示的に決める」は「Web だけの機能・iOS だけの機能 (QR・カレンダー書き出し) は設計 doc で明示的に決める」に置換) |
| 35 | `\`apps/web\` は**デザインの正典ではない**` | 変更なし (見た目の正典ではない、は今も正しい) |

### 11.2 `projects/atender/DESIGN.md`

- 冒頭の「この文書の地位」の段落の後に 1 行: `> 機能仕様 (画面遷移・文言) の正典は iOS 実装。本書は iOS の視覚言語の正典で、Web は自身の styles.css で同じ仕様を描く (2026-10-30)。`
- 「参照」節の `Web 正典:` 行を現存ファイルに置換: `- Web の視覚の出所: \`apps/web/src/styles.css\`、\`components/timetable/{TimetableView,EmptyCell}.tsx\`、\`components/event-tile/EventTile.tsx\`、\`components/home/SelfTimetableView.tsx\`` (`CalendarMonth.tsx` / `PersonalCalendar.tsx` は build 21 で削除済み)

### 11.3 申し送り (Leader 宛て)

- memory の持ち越し「Web の 5 コマ固定」は §5.3.3 で解消 (ブランチのマージ後に memory 側を削る)

---

## 12. 判断が要る点

### 12.L Leader に上げる

1. **iOS のバグ (学期削除の 409)**: iOS `SemesterListSheet.swift` は `catch APIError.http(status: 409)` だけを見ており、API が JSON body 付きの 409 を返すため実機では「時間割があるため削除できません…」が出ず「削除できませんでした」になる。Web は意図どおりの文言を出す (§5.3.4) ので、ここだけ Web と iOS の表示が割れる。次の iOS ビルドで `catch APIError.api(status: 409, …)` を足す 1 行修正を推奨
2. **テーマ既定の変更が既存の Web ユーザーに効く**: 今まで「自動」を選んでいた人も、未保存なので次の読み込みからライトになる (保存値で区別できない)。iOS も既定ライトなので仕様どおりだが、ダークモードの端末で Web を使っていた人には見た目が変わる。リリースノートに 1 行入れるかどうか
3. **招待リンクのサインインまたぎ**: 未サインインで `/rooms/join/<code>` を開くと、サインイン (ページを読み直す) を挟むとコードが消える (§3)。iOS もメモリ保持で同じだが、Web は Magic Link で別タブになりやすい。`sessionStorage` に置けば救えるが、iOS と挙動が分かれるので本書では入れていない

### 12.T Touri に見せる要約

§13。

---

## 13. Touri 向け要約 (変わる画面と既存ユーザーへの影響)

- **ナビが 4 つに**: 「ルーム」タブが消え、ルームはホームの chip に。chip の「+」から作成・参加、ルーム設定はホームの ⚙。招待リンクを開くとホームで参加シートが開く。`/rooms` `/templates` はホームへ転送
- **オンボーディング**: 学科を選んだあと同じ学科の公開時間割があれば「時間割を選ぶ」段が出る。学期の既定値は今日から決まる (今なら「2026 後期 10/1〜3/31」)
- **学期**: 全部の学期が終わっていると、ホームで「前回の学期が終了しました」→ 新しい学期を作れる (提案値・テンプレ提案つき)。新学期は前の学期の時限と曜日を引き継ぐ (5 コマ固定をやめる)
- **公開時間割**: 学期管理・時間割の設定・学校学科の変更後・新学期シートから、同じ学科の時間割を中身を見て取り込める。既存の時間割がある学期は確認してから置き換える
- **★ 既存ユーザーへの影響 1 (公開トグル)**: 「時間割の設定」を保存するたびに勝手に公開されていたのが止まる。取り込んだ時間割は既定で非公開、トグルを OFF にして保存すると公開が取り下げられる
- **★ 既存ユーザーへの影響 2 (テーマ)**: 既定がライトになる。今まで「自動」で暗い画面だった人は、設定で「自動」を選び直す必要がある
- **科目**: 科目ごとの出席基準 (必要出席率・欠席上限・遅刻換算) を Web でも設定でき、科目行に「あと N 回休める」が出る
- その他: 出欠バーが未記録のときだけ開いて「授業中 / 次の授業」を出す、今日と今の時限が強調される、日別シートから授業変更 (振替) ができる、時間割を削除できる、設定に利用規約などのリンク。QR とカレンダー書き出しは Web には入れない

---

## 14. 不採用案

| 案 | 却下理由 |
|---|---|
| **QR (カメラで参加・友達追加・自分の QR 表示) を Web にも作る** | カメラで読む UX は iOS の DataScanner 前提。Web でカメラ権限 + JS の QR デコーダを入れると依存とプライバシー説明が増える割に、PC ブラウザでは使えない。自分の QR 表示だけ出すと「読む手段の無い QR」になる。Menu の項目ごと出さない |
| **`/templates` 独立ページを作り直して残す** | iOS に独立画面は無く、入口は文脈 (学期・学校学科・時間割の設定) にある。独立ページは「どの学期に入れるか」を別に選ばせる UI になり、W7 の 409 無反応の温床だった。ブックマーク救済は redirect で足りる |
| **`/rooms` 一覧ページを残す** (ナビからだけ外す) | ルームの全操作がホームで完結し、一覧ページは到達経路が無い死に画面になる。iOS に無い画面を保守する理由が無い |
| **フェーズ分割 (IA / オンボーディング / 学期 / テンプレ …を別ブランチ)** | 撤去 (`/rooms` `/templates`) の最後の参照が別フェーズの節にいて、どこで割っても中間状態で入口の無い機能か二重の入口ができる。1 ブランチで実装順序 (§10) だけ決める |
| **API に Web 用の変更を入れる** (例: `publish-as-template` で授業 0 件を 400、テンプレ一覧のサーバー側畳み込み) | 全部クライアントの規則で足り、iOS と同じ純粋関数で揃えた方が 2 クライアントの挙動が一致する。サーバーで弾くと iOS の既存版 (クライアント側で抑止済) に影響は無いが、Web だけ別経路の検証になる |
| **ルーム時間割を今週の occurrence (`week.meetings`) のまま使う** | 休講・振替の週で形が変わり、iOS (`recurringMeetings` = 時間割の型) と表示が割れる。`.designs/20260721-room-recurring-timetable.md` の追随漏れ |
| **公開時間割ブラウザを別ページ (ルート) にする** | 取り込み後に呼び出し元 (学期管理・時間割の設定) へ戻る遷移が iOS のモーダル内 push と合わない。重ねシート 1 枚の中で 3 画面を切り替える |
| **Radix `DropdownMenu` (依存に既にある) で chip の Menu を作る** | 依存にはあるが src で 1 度も使われておらず、既存の一括メニュー (`MainAttendanceCTA`) が自前の `role=menu` で組まれている。同じ画面に 2 方式を持ち込まない |
| **学期終了の提案を `localStorage` でなくサーバー (`/api/me`) に持つ** | iOS は端末ローカル (UserDefaults) で、同じ人が iOS で「あとで」を押しても Web では出る。サーバーに持つと API 変更になり、iOS にも追随が要る |
| **テーマの「自動」を既存ユーザーにだけ残す (未保存 = auto のまま、新規だけライト)** | 未保存の人の中に「自動を選んだ人」と「何も選んでいない人」が混ざっており区別できない。iOS と同じ既定にするなら全員ライトに寄せるしかない (§12-L2) |
