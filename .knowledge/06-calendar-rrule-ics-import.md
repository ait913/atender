---
title: Atender RoomCalendar に Google Calendar 相当 (RRULE + .ics import + タイトルマッピング) を載せる BP
category: pattern
project: atender
tags: [calendar, rrule, ics, import, recurrence, rfc5545, prisma, sqlite, room-event, mapping, privacy]
created: 2026-05-27
sources:
  - RFC 5545 (iCalendar) https://datatracker.ietf.org/doc/html/rfc5545
  - RFC 7529 (RSCALE) https://datatracker.ietf.org/doc/html/rfc7529
  - Google Calendar API v3 https://developers.google.com/calendar/api/v3/reference/events
  - Microsoft Graph events https://learn.microsoft.com/en-us/graph/api/resources/event
  - rrule npm (jakubroztocil/rrule) https://github.com/jakubroztocil/rrule
  - rrule-rs (Rust + WASM) https://github.com/fmeringdal/rrule-rs
  - ical.js (mozilla / kewisch) https://github.com/kewisch/ical.js
  - node-ical https://github.com/Apollon77/node-ical
  - ical-generator https://github.com/sebbo2002/ical-generator
  - Cal.com schema.prisma https://github.com/calcom/calcom/blob/main/packages/prisma/schema.prisma
  - Mattermost Calendar plugin https://github.com/mattermost/mattermost-plugin-calendar
  - Reclaim AI smart categories https://help.reclaim.ai/en/articles/4545084-smart-events-and-categories
  - Notion Calendar overview https://www.notion.so/help/guides/notion-calendar-overview
  - Calendly Security & Calendar sync https://calendly.com/pages/security
  - Google Cal export help https://support.google.com/calendar/answer/37111
  - Apple iCloud share calendar https://support.apple.com/guide/icloud/share-a-calendar-mm6b1a8694/icloud
  - SQLite JSON1 https://www.sqlite.org/json1.html
related_knowledge:
  - knowledge/pattern/calendar-week-pattern-meeting-expansion.md  # 週パターン展開 (Meeting / MeetingOccurrence) — RoomEvent recurrence にも転用する
  - projects/atender/.knowledge/03-v3-rooms-friends-research.md   # Room / RoomEvent の v3 設計
---

## Context

Atender は時間割 (`Meeting` / `MeetingOccurrence`) と Room ベースの単発予定 (`RoomEvent`) を持つ。現状 `RoomEvent` は **単発のみ** で recurrence なし、外部 import 不可、タイトル無加工保存。

Touri 要望は 3 つ:

1. **繰り返し予定** — Google Calendar / Apple Calendar と同等に「毎週月水金」「2週ごと」「平日のみ」「月末」等を扱える RRULE 対応
2. **カレンダーアプリからの import** — iPhone / Android / Google / iCloud カレンダーから `.ics` を取り込み、ルームの予定として反映できる
3. **タイトル → カテゴリマッピング** — スマホカレンダー上の生タイトル (「デート」「就活」「合コン」「通院」等) を、ルーム内では 1 つの中立カテゴリ「予定」に正規化する仕組み。プライバシー懸念 (恋人との予定がルームメンバーに丸見え) を UX で解決する

学生 (Touri 含む) のユースケース: 自分のスマホカレンダーをルームに繋いで「予定アリ」を可視化したいが、内容は他人に見せたくない。

`Meeting` 系の週パターン展開ロジックは既に `knowledge/pattern/calendar-week-pattern-meeting-expansion.md` で確立済。本ドキュメントは **RoomEvent を recurring 対応に拡張する設計** に焦点を当てる。

---

## Part A. RFC 5545 RRULE 仕様 — 実装に必要な最低限

### A-1. FREQ / INTERVAL — 必須コア

| プロパティ | 意味 | 例 |
| --- | --- | --- |
| `FREQ=DAILY` | 毎日 | `FREQ=DAILY;INTERVAL=2` = 隔日 |
| `FREQ=WEEKLY` | 毎週 | `FREQ=WEEKLY;BYDAY=MO,WE,FR` = 毎週 月水金 |
| `FREQ=MONTHLY` | 毎月 | `FREQ=MONTHLY;BYMONTHDAY=15` = 毎月 15 日 |
| `FREQ=YEARLY` | 毎年 | `FREQ=YEARLY;BYMONTH=4;BYMONTHDAY=1` = 毎年 4/1 |

`INTERVAL` デフォルト = 1。`FREQ` は必須。

出典: [RFC 5545 §3.8.5.3](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5.3)

### A-2. BYDAY — 曜日指定 (序数あり)

- `MO,TU,WE,TH,FR,SA,SU` の組み合わせ
- **序数付き**: `1MO` = 第 1 月曜、`-1FR` = 最終金曜
- 「平日のみ」= `BYDAY=MO,TU,WE,TH,FR`
- 「毎月第 2 火曜」= `FREQ=MONTHLY;BYDAY=2TU`
- 「毎月最終金曜」= `FREQ=MONTHLY;BYDAY=-1FR`

### A-3. BYMONTH / BYMONTHDAY / BYSETPOS

- `BYMONTH=1..12` 月指定
- `BYMONTHDAY=1..31` or `-31..-1` (月末 = `-1`)
- `BYSETPOS` = 他の BY* 適用後の集合から N 番目を選ぶ
  - 例: `FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1` = 月の最終平日

### A-4. UNTIL / COUNT — 終了条件 (排他)

- `UNTIL=20261231T235959Z` — UTC 必須 (DTSTART が UTC or TZID 付きの場合)
- `COUNT=10` — 10 回まで
- どちらも無いと無限。**実装側で必ず sanity limit を入れる** (Google は 5 年・1000 回相当の上限あり、出典: [Google Cal API recurrence](https://developers.google.com/calendar/api/v3/reference/events))

### A-5. WKST — 週開始曜日

デフォルト `MO`。`BYDAY` に序数 (1MO 等) を使う時の週境界に影響する。Apple Cal はシステム設定優先で `WKST` を無視するケースが報告されている。

### A-6. DTSTART のタイムゾーン形式

| 形式 | 例 | 意味 |
| --- | --- | --- |
| UTC | `DTSTART:20260527T000000Z` | 末尾 `Z`。全世界で同じ瞬間 |
| TZID 付き | `DTSTART;TZID=Asia/Tokyo:20260527T090000` | 特定 TZ のローカル時刻 (DST 考慮) |
| Floating | `DTSTART:20260527T090000` | TZ なし。「ユーザーの現地時間」 |

出典: [RFC 5545 §3.3.5](https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.5)

### A-7. EXDATE / RDATE — 除外日・追加日

- `EXDATE:20260615T090000Z` = 6/15 の occurrence を除外
- `RDATE:20260620T090000Z` = 単発で追加
- 主 RRULE と並存できる

出典: [RFC 5545 §3.8.5.1-2](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5.1)

### A-8. RECURRENCE-ID / SEQUENCE — 個別回 override

「この回だけタイトル変更」「この回だけ時間変更」を表現する。

- 親 VEVENT (UID=X, RRULE=...) + 子 VEVENT (UID=X, RECURRENCE-ID=20260615T090000Z, SUMMARY="特別ゲスト回") を組で送る
- `SEQUENCE` (整数) が編集の度に増加。受信側は SEQUENCE 比較で update or skip 判断

出典: [RFC 5545 §3.8.4.4](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.4.4), [§3.8.7.4](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.7.4)

### A-9. THISANDFUTURE

`RECURRENCE-ID;RANGE=THISANDFUTURE:20260615T090000Z` でその回以降全てを置換。Google Cal 等は別実装 (元 RRULE に `UNTIL` を追加で series を分割する) を採用。

### A-10. よくある実装の罠

| 罠 | 対策 |
| --- | --- |
| `UNTIL` を local time で書く | DTSTART が UTC/TZID 付きなら UNTIL は **必ず Z 付き UTC** |
| DST 跨ぎで時刻ズレ | UTC で展開せず TZID ローカルで展開、`luxon` / `dayjs-plugin-timezone` 経由 |
| `WKST` 違いで「毎週」の境界変化 | 明示的に `WKST=MO` を付ける (デフォルトでも) |
| 無限ループ | UNTIL も COUNT も無い場合、`rrule.between(start, end, {inc: true})` で必ず end 上限を指定。年単位以上は禁止 |
| 月末 `BYMONTHDAY=31` | 31 日のない月でスキップされる。**月末は `BYMONTHDAY=-1`** を使う |

### A-11. 主要 JS ライブラリ (2026 年)

| ライブラリ | 機能範囲 | メンテ | 用途 |
| --- | --- | --- | --- |
| `rrule` (npm) | RRULE 展開 + toText() NLP | 安定継続 ([GitHub](https://github.com/jakubroztocil/rrule)) | **メイン候補。Atender は本番採用** |
| `rrule-rs` (WASM) | RRULE 展開、RFC 厳密準拠 | 活発 ([GitHub](https://github.com/fmeringdal/rrule-rs)) | パフォーマンス必要時のみ。MVP では不要 |
| `ical.js` (Mozilla) | iCalendar 全 parse + RRULE | 安定 ([GitHub](https://github.com/kewisch/ical.js)) | parse 用。RRULE 展開も可だがクセあり、rrule npm に渡す方が楽 |
| `node-ical` | URL/file から parse + TZ 自動解決 | 活発 ([GitHub](https://github.com/Apollon77/node-ical)) | **import 用メイン。内部で ical.js + rrule** |
| `ical-generator` | .ics 出力のみ | 活発 ([GitHub](https://github.com/sebbo2002/ical-generator)) | 将来 export 機能用 |

**Atender 決定**: `rrule` npm (展開 + toText) + `node-ical` (import parse) の組み合わせ。

### A-12. Google Calendar / Apple / Outlook の方言

- **Google Cal**: `BYSECOND`/`BYMINUTE`/`BYHOUR` 無視、RRULE 文字列 720 char 上限、recurrence は `["RRULE:...", "EXDATE:...", "RDATE:..."]` の string array で API 出力 ([events resource](https://developers.google.com/calendar/api/v3/reference/events))
- **Apple Calendar**: `WKST` 無視、`BYSETPOS` 独自挙動 (報告例多数)
- **Outlook / Microsoft Graph**: `MONTHLY` の `BYDAY` 複数曜日に制限、recurrence は **構造化 object** で API 出力 ([recurrence resource](https://learn.microsoft.com/en-us/graph/api/resources/recurrencepattern))

→ Atender は **RRULE 文字列をそのまま保存** し、Google 互換を優先する。

---

## Part B. RRULE を Prisma / SQLite で保存する設計パターン

### B-1. 3 つの保存方式

| 方式 | カラム例 | Pros | Cons |
| --- | --- | --- | --- |
| **生 RRULE 文字列** | `recurrenceRule TEXT` = `"FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261231T235959Z"` | RFC 完全準拠 / .ics export 容易 / rrule npm 直接 .fromString() | DB レベルの freq クエリ困難 (LIKE で見るしかない) |
| **JSON 構造化** | `recurrence Json` = `{"freq":"WEEKLY","byDay":["MO","WE","FR"],"until":"..."}` | アプリ層で扱いやすい / 部分検索可 | RFC 互換は変換必要 / SQLite で index 不可 |
| **正規化テーブル** | `RecurrenceRule` 別 model | DB 制約効く / 型安全 | スキーマ複雑 / RRULE 文字列に戻すコスト |

**Atender 採用**: **生 RRULE 文字列** (= Google Cal API と同形式)。

理由:
- Google Cal API と同じ表現 → 将来 OAuth 連携時に変換不要
- `.ics` import 時もそのまま流し込める
- rrule npm で `RRule.fromString(str)` 一行
- DB クエリで `freq` を絞る要件は無い (常にシリーズ全件展開)

### B-2. occurrence 展開戦略

3 つの選択肢:

#### B-2-a. オンザフライ展開 (Atender 採用)

- API request の度に `rrule.between(weekStart, weekEnd)` で展開
- 採用例: **Mattermost Calendar Plugin**, **Outline**
- メリット: DB 容量ゼロ / ルール変更が即時全期間反映
- デメリット: 数千件規模になるとロード重い

**Atender ではこちらを選ぶ**:
- 1 ルームあたり RoomEvent シリーズは数十程度想定 (時間割ではない、単発+少数の繰り返し)
- 週単位 endpoint で範囲が限定的 (`weekStart .. weekStart+7d`)
- `Meeting` 系は別物 (`MeetingOccurrence` の事前展開を継続)

#### B-2-b. 事前展開 (採用しない)

- 採用例: **Cal.com** Booking
- メリット: 週単位 WHERE で高速
- デメリット: シリーズ編集時に大量 UPDATE/DELETE

→ Atender は MVP で不要。将来 RoomEvent 数が爆発したら再検討。

#### B-2-c. ハイブリッド (採用しない)

- 採用例: **Notion Calendar**
- MVP 段階で持ち込まない。

### B-3. RoomEvent recurring 拡張の Prisma schema 案

```prisma
// ---- 既存 RoomEvent を改修 ----
model RoomEvent {
  id              String   @id @default(cuid())
  roomId          String
  room            Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  authorId        String
  author          User     @relation("RoomEventAuthor", fields: [authorId], references: [id], onDelete: Cascade)

  title           String           // 表示タイトル (mapping 適用後の値が入る場合あり)
  rawTitle        String?          // 外部 import 時の元タイトル (UI で「内容を確認」する時のみ参照)
  description     String?
  start           DateTime         // シリーズの DTSTART (UTC)
  end             DateTime         // DTSTART と同日 (= DTEND or +DURATION)
  isAllDay        Boolean  @default(false)
  color           String?

  // 繰り返し
  recurrenceRule  String?          // "FREQ=WEEKLY;BYDAY=MO;UNTIL=..." 単独 RRULE
  exDates         String?          // "20260615T090000Z,20260622T090000Z" (CSV、簡易表現)
  rDates          String?          // 追加日 CSV
  // → SQLite で String[] は使えないので CSV TEXT。要件増えたら別テーブル化

  // 外部 import 由来
  source          RoomEventSource  @default(MANUAL)
  externalUid     String?          // RFC 5545 UID (import 同期で primary key)
  externalSeq     Int?             // SEQUENCE (RFC 5545 §3.8.7.4)
  externalLastModified DateTime?   // LAST-MODIFIED
  importId        String?          // FK to IcsImport (どの import から来たか)
  visibilityMode  EventVisibility  @default(NORMAL)  // タイトル隠蔽の閾値

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  overrides       RoomEventOverride[]

  @@index([roomId, start])
  @@index([authorId])
  @@unique([roomId, externalUid])    // 同一 room 内で同一 UID は 1 つ
}

enum RoomEventSource {
  MANUAL          // ユーザー手入力
  ICS_FILE        // .ics アップロード
  ICS_URL         // webcal:// or HTTPS 購読
  GOOGLE_OAUTH    // (Phase 2) Google Cal API
}

enum EventVisibility {
  NORMAL          // タイトルそのまま表示
  TITLE_MAPPED    // mapping ルールで置換済 (rawTitle にバックアップ)
  BUSY_ONLY       // メンバーには「予定」のみ。title すら見せない
}

// ---- override (この回だけ編集) ----
model RoomEventOverride {
  id              String   @id @default(cuid())
  seriesId        String
  series          RoomEvent @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  originalDate    DateTime          // 元の occurrence DTSTART
  isCancelled     Boolean  @default(false)
  newStart        DateTime?
  newEnd          DateTime?
  newTitle        String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([seriesId, originalDate])
  @@index([seriesId])
}

// ---- import 記録 ----
model IcsImport {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  roomId          String?            // 特定 Room 向けの import (NULL なら全 Room?)
  source          RoomEventSource    // ICS_FILE | ICS_URL
  url             String?            // ICS_URL の場合
  filename        String?            // ICS_FILE の場合
  lastSyncedAt    DateTime?
  lastEtag        String?            // HTTP cache 用 (RFC 7232)
  lastModified    String?            // HTTP Last-Modified header
  eventCount      Int       @default(0)
  errorMessage    String?
  status          IcsImportStatus   @default(PENDING)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  events          RoomEvent[]
  mappingRules    IcsTitleRule[]    // この import に紐づくマッピング

  @@index([userId])
}

enum IcsImportStatus {
  PENDING
  SUCCESS
  PARTIAL_ERROR
  FAILED
}

// ---- タイトル → カテゴリマッピングルール ----
model IcsTitleRule {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  importId        String?           // 特定 import 限定なら set
  import          IcsImport? @relation(fields: [importId], references: [id], onDelete: SetNull)

  matchType       TitleMatchType    // EQUALS | CONTAINS | REGEX
  pattern         String            // "デート" or "会議" or "ミーティング.*"
  replaceWith     String?           // "予定" (NULL なら "予定" デフォルト)
  visibilityMode  EventVisibility   // 適用された予定の表示モード
  priority        Int       @default(0)  // 低いほど優先
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([userId, priority])
}

enum TitleMatchType {
  EQUALS
  CONTAINS
  REGEX
}
```

### B-4. 設計の要点

1. **rawTitle と title の 2 段持ち** — import 時に rawTitle に元タイトル、mapping 適用後を title に。ルームメンバーには title のみ見せる。本人は設定画面で rawTitle を見れる
2. **externalUid + roomId の unique** — 同一カレンダーを 2 回 import しても dedup。SEQUENCE / LAST-MODIFIED 比較で update or skip
3. **EXDATE/RDATE は CSV TEXT** — SQLite で String[] が無いため。RFC 互換性は rrule.fromString に EXDATE/RDATE 行ごと渡せる関数で再構築
4. **overrides は別テーブル** — Cal.com 等の業界主流。master series 削除で cascade。`(seriesId, originalDate)` で unique
5. **EventVisibility は enum** — UI で「表示モード」を見せられる
6. **MeetingOccurrence と独立** — RoomEvent と Meeting は別世界、出席記録は MeetingOccurrence 専用

### B-5. SQLite の制約と対応

- **JSON 型は TEXT として保存**。`json_extract` でクエリ可、ただし index 不可 (出典: [SQLite JSON1](https://www.sqlite.org/json1.html))
- DateTime は ISO8601 文字列。**UTC で統一**、TZID 計算は app 層 (dayjs / luxon)
- FTS5 で title 検索が必要なら別テーブル `RoomEventFts` を作成、TRIGGER で同期。MVP は不要

---

## Part C. .ics import の実装ベストプラクティス

### C-1. ライブラリ選定 (再掲)

| 役割 | 採用 | 備考 |
| --- | --- | --- |
| .ics parse | **node-ical** | URL/file/buffer 全部対応、TZID 自動解決、TypeScript 型あり |
| RRULE 展開 | **rrule** (npm) | node-ical 内部でも使うが、UI でも直接使う |
| エンコーディング判定 | **jschardet** + **iconv-lite** | Shift-JIS や Win-1252 から UTF-8 へ |
| .ics 生成 (将来 export) | ical-generator | MVP では不要 |

### C-2. parse の罠

#### C-2-a. エンコーディング

```ts
import jschardet from 'jschardet';
import iconv from 'iconv-lite';

function normalizeIcs(buf: Buffer): string {
  const detected = jschardet.detect(buf);
  const enc = detected.encoding ?? 'utf-8';
  return iconv.decode(buf, enc).replace(/^﻿/, ''); // BOM strip
}
```

- 日本語スマホカレンダーの古い export は **Shift-JIS** ありえる
- UTF-8 BOM (`﻿`) を必ず strip
- Windows-1252 (CP1252) — Outlook 旧版で発生

出典: [RFC 5545 §3.1.4](https://datatracker.ietf.org/doc/html/rfc5545#section-3.1.4)

#### C-2-b. Line folding

`.ics` は 75 octet 超で `CRLF + SPACE` 折り返し。**自前 regex は禁止**、node-ical / ical.js に必ず通す。

出典: [RFC 5545 §3.1](https://datatracker.ietf.org/doc/html/rfc5545#section-3.1)

#### C-2-c. Floating time

`DTSTART:20260527T090000` (TZ なし) を**サーバー TZ で解釈すると本番事故**。Atender ルール: ユーザーの設定 TZ (デフォルト `Asia/Tokyo`) として解釈し、その時点で UTC 化して保存。

出典: [RFC 5545 §3.3.5](https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.5)

#### C-2-d. ファイルサイズ上限

- 上限 5MB を Hono middleware で enforce
- 5MB 超は 413 で拒絶 → ユーザーに「期間で絞って再 export してね」と案内

出典: [Node.js Don't Block the Event Loop](https://nodejs.org/en/docs/guides/dont-block-the-event-loop/)

### C-3. import 方式の比較

| 方式 | 認証 | リアルタイム性 | 実装コスト | Atender MVP |
| --- | --- | --- | --- | --- |
| File upload | 不要 | なし (1 回限り) | ★低 | ✅ 採用 |
| URL subscribe (webcal://, https://) | 不要 (secret URL) | 1-24h 遅延 (ポーリング) | ★中 | ✅ 採用 (Phase 1.5) |
| Google Cal API v3 (OAuth + watch) | OAuth + GCP 審査 | 即時 (webhook) | ★★高 | ❌ Phase 2 以降 |

**MVP 戦略**: File upload を**先に実装**、URL subscribe は同 schema (`IcsImport.source=ICS_URL`) で後付け。Google OAuth は学生ユースケースで iPhone/iCloud ユーザーが多い前提 → 投資効率悪い → 後回し。

### C-4. URL subscribe (webcal:// 対応)

- `webcal://` は **http スキーム差し替え** で `https://` として fetch ([RFC なし、慣習的](https://en.wikipedia.org/wiki/Webcal))
- ポーリング周期: デフォルト 6 時間、ユーザー設定で 1 時間 / 24 時間
- HTTP cache 活用: `If-None-Match` / `If-Modified-Since` ヘッダー送信、304 なら parse skip ([RFC 7232](https://datatracker.ietf.org/doc/html/rfc7232))

```ts
// Cron で 6 時間毎に実行
for (const imp of activeImports) {
  const headers: Record<string, string> = {};
  if (imp.lastEtag) headers['If-None-Match'] = imp.lastEtag;
  if (imp.lastModified) headers['If-Modified-Since'] = imp.lastModified;
  const res = await fetch(imp.url!, { headers });
  if (res.status === 304) continue;       // skip
  if (!res.ok) { /* log error */ continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  await importIcs(imp.id, buf);           // parse + upsert
  await prisma.icsImport.update({
    where: { id: imp.id },
    data: {
      lastEtag: res.headers.get('etag') ?? null,
      lastModified: res.headers.get('last-modified') ?? null,
      lastSyncedAt: new Date(),
    },
  });
}
```

### C-5. dedup (重複排除)

**Primary key**: `(roomId, externalUid)`

- 同一 UID が再 import されたら:
  1. DB の `externalSeq` vs 新 SEQUENCE → 新 > 旧 なら update
  2. SEQUENCE 欠落なら `externalLastModified` で比較
  3. 同値なら skip (DB 更新なし)
- `RECURRENCE-ID` を持つ VEVENT → `RoomEventOverride` レコードに格納

出典: [RFC 5545 §3.8.4.7 UID](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.4.7), [§3.8.7.4 SEQUENCE](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.7.4)

### C-6. import フロー全体

```
[User uploads file.ics]
        ↓
1. Hono POST /api/rooms/:roomId/ics-imports (multipart, 5MB limit)
        ↓
2. normalizeIcs(buf): encoding detect + decode + BOM strip
        ↓
3. node-ical.parseICS(text) → { VEVENT_1, VEVENT_2, ... }
        ↓
4. extractVEvents(): UID/SUMMARY/DTSTART/DTEND/RRULE/EXDATE/RECURRENCE-ID 抽出
        ↓
5. preview API: 返却 { count, events: [{uid, title, start, isRecurring}] }
        ↓ (ユーザー確認)
        ↓
6. POST /api/rooms/:roomId/ics-imports/:id/commit
   - mapping rule 適用
   - visibility mode 決定
   - upsert RoomEvent (by externalUid)
   - upsert RoomEventOverride (RECURRENCE-ID あれば)
        ↓
7. レスポンス: { imported: N, updated: M, skipped: K }
```

### C-7. ユーザー向け export 手順案内 (UI 内 help)

#### Google カレンダー (PC ブラウザ)
1. 設定 (歯車) → 設定
2. 「インポート / エクスポート」→「エクスポート」
3. zip 解凍 → 各カレンダーの `.ics` をアップロード

出典: [Google Cal Help 37111](https://support.google.com/calendar/answer/37111)

#### iCloud カレンダー (iPhone)
1. カレンダーアプリ → 該当カレンダーの「i」
2. 「公開カレンダー」ON
3. 「リンクを共有」→ Atender に URL 貼り付け (`webcal://...`)

出典: [Apple Support iCloud Share Calendar](https://support.apple.com/guide/icloud/share-a-calendar-mm6b1a8694/icloud)

#### Outlook
- web.outlook.com → 設定 → カレンダー → 「共有カレンダー」→ ics URL 取得

---

## Part D. タイトル → カテゴリマッピング設計

### D-1. なぜ必要か

Touri 要望の核心: **個人カレンダーの生タイトル (「デート」「彼女と」「合コン」「通院」「就活」) がルームメンバーに丸見えだとプライバシー事故**。

ルーム内では:
- **全部 "予定"** = 何があるか書かれてないが時間は埋まってる
- → 学生コンテキストで自然な「シェア度」: 自分が暇かどうかだけメンバーが分かる

### D-2. マッチング戦略 (3 種)

Reclaim.ai / Akiflow / Sunsama も同じ 3 種を採用 (出典: [Reclaim AI](https://help.reclaim.ai/en/articles/4545084-smart-events-and-categories)):

| matchType | 例 pattern | 用途 |
| --- | --- | --- |
| EQUALS | `"デート"` | 完全一致 (ルーチン) |
| CONTAINS | `"デート"` | 部分一致 (「アキバデート」「初デート」全部マッチ) |
| REGEX | `"^(デート|彼女|彼氏).*"` | 動的タイトル |

優先度 (`priority`): 数値小さい順に評価、最初にマッチした rule を適用。

### D-3. デフォルトルール (推奨初期値)

ユーザーが何も設定しなくても、外部 import は全部「予定」に置換:

```ts
// IcsImport 作成時に user 単位で 1 つの fallback rule
{
  matchType: 'REGEX',
  pattern: '.*',
  replaceWith: '予定',
  visibilityMode: 'TITLE_MAPPED',
  priority: 9999,    // 最低優先度 (他の rule に拾われない時のみ)
}
```

これで「初期状態: 全部"予定"に隠蔽」が保証され、ユーザーがあとから細かいルールを追加できる。

### D-4. LLM ベース auto-categorize (Phase 2 オプション)

- Claude Haiku 4.5 等で title → カテゴリ推論
- 精度: 主要英日タイトル 95%+ ([Reclaim 実績](https://help.reclaim.ai/en/articles/4545084-smart-events-and-categories))
- コスト: 1000 件 = 数円〜数十円 (Claude Haiku)
- **Atender MVP 不採用**: ユーザー定義 3 種ルール + デフォルト「全部 → 予定」で十分

### D-5. visibility モード

| Mode | UI 表示 | 用途 |
| --- | --- | --- |
| NORMAL | "title そのまま" | 手動入力の通常予定 |
| TITLE_MAPPED | "予定" or "授業" 等 | import + mapping 適用後 |
| BUSY_ONLY | "● 予定あり" のみ、時刻も時間幅で示す | 最強プライバシー、Calendly 風 |

メンバー側の見え方は visibility が決める。本人 (author) は常に rawTitle を確認可能 (設定画面)。

出典: [Calendly Calendar Sync Security](https://calendly.com/pages/security) — 同様に「予約画面では他予定の内容を露出しない」と明記。

### D-6. UI フロー (mapping 編集)

```
[設定画面] /settings/calendar-import
├── 接続中の import 一覧 (file/URL)
│   └── 各 import の「ルール編集」ボタン
│
└── タイトル正規化ルール
    ├── ＋ 新規ルール
    │   ├── 種別: 完全一致 / 部分一致 / 正規表現
    │   ├── パターン: [入力 box]
    │   ├── 置換後: [入力 box] (空欄なら "予定")
    │   ├── 表示モード: NORMAL / TITLE_MAPPED / BUSY_ONLY
    │   └── 優先度: ▲▼
    └── 既存ルール一覧 (drag & drop で順序入れ替え)
```

---

## Part E. UI / UX ベストプラクティス

### E-1. 繰り返し設定 UI (RoomEvent 作成画面)

```
[予定タイトル] [入力 box]
[開始日時]     [date + time picker]
[終了日時]     [date + time picker]
[終日]         [toggle]

[繰り返し]     [select ▼]
  - なし (default)
  - 毎日
  - 毎週 (start の曜日)
  - 平日のみ
  - 毎月 (start の日付)
  - 毎月 (start の第○曜日)
  - 毎年 (start の日付)
  - カスタム...

  ↓ カスタム選択時に modal pyramid (Apple Cal 式) で展開
   ┌─ カスタム繰り返し ────────────┐
   │ 単位: [日/週/月/年] [select]   │
   │ 間隔: [N] [日]                 │
   │ ─ 単位=週 ─                     │
   │ 曜日: [日][月][火][水][木][金][土]
   │       (toggle button grid)     │
   │ ─ 単位=月 ─                    │
   │ ○ 毎月 N 日 / ○ 第○曜日       │
   │ ─ 終了 ─                       │
   │ ○ 終了日なし                   │
   │ ○ N 回繰り返す                 │
   │ ○ 特定日まで [date picker]     │
   │ ────────                        │
   │ 自然言語表示:                  │
   │ "Every 2 weeks on Mon, Wed"    │
   └────────────────────────────────┘
```

- 自然言語表示は **rrule.toText()** をそのまま使う ([rrule npm](https://github.com/jakubroztocil/rrule))
- モバイル: Apple 風 modal pyramid 推奨。inline 展開 (Google) でも可だが画面狭くなる
- end type 3 択は radio が標準 (Google / Apple / Outlook 全部同じ)

出典: [Google Cal Help recurring events](https://support.google.com/calendar/answer/37115)

### E-2. 繰り返し予定の編集 UI (3 択 dialog)

ユーザーが既存の occurrence を編集して保存しようとした時:

```
┌─ この予定を編集 ───────────────────┐
│  ○ この予定のみ                       │
│  ○ これ以降のすべての予定             │
│  ○ すべての予定                       │
│  [キャンセル]            [保存]       │
└───────────────────────────────────────┘
```

- **この予定のみ** = `RoomEventOverride` 行を挿入 (originalDate=該当 occurrence)、newTitle/newStart/newEnd を上書き
- **これ以降** = 元 RoomEvent の RRULE に `UNTIL=originalDate-1` を追加して終了 + 新 RoomEvent を originalDate から開始 (series 分割)
- **すべて** = 元 RoomEvent の title/start/end/recurrenceRule を全部更新

出典: [Google Cal Help](https://support.google.com/calendar/answer/37115)

### E-3. .ics import フロー UI

```
[Step 1] アップロード画面
  ┌─ カレンダーを取り込む ────────────┐
  │  方式: ○ ファイル / ○ URL          │
  │  [.ics ファイル選択] (5MB まで)    │
  │  または                            │
  │  URL: [webcal://...] [取得テスト] │
  │  ─── 何を取り込む? ───            │
  │  [help: Google/iPhone から ics を]
  │   取り出す方法] (折りたたみ)       │
  └────────────────────────────────────┘

[Step 2] プレビュー (parse 後)
  ┌─ 取り込み内容を確認 ──────────────┐
  │  127 件の予定が見つかりました     │
  │                                    │
  │  ☑ 全部「予定」として取り込む     │
  │     (タイトルを隠す)               │
  │  ☐ 細かくルールを設定する          │
  │     → ルール編集画面へ             │
  │                                    │
  │  ─ プレビュー (最初の 10 件) ─    │
  │  06/01 月 09:00  デート       → 予定 │
  │  06/02 火 14:00  会議         → 予定 │
  │  ...                               │
  │  [キャンセル]          [取り込む]  │
  └────────────────────────────────────┘
```

### E-4. ルーム画面でのカテゴリ視覚区別

3 種 (時間割 / ルーム予定 / 外部 import) を区別する Best Practice:

| 種別 | 色 | アイコン | 縦線 |
| --- | --- | --- | --- |
| 時間割 (Meeting) | 学校テーマカラー | 📚 | 太め (3px) |
| ルーム予定 (RoomEvent, source=MANUAL) | author 色 | (なし) | 中 (2px) |
| 外部 import (source=ICS_*) | グレー | 🔗 | 細・点線 |

出典: [Notion Calendar overview](https://www.notion.so/help/guides/notion-calendar-overview) — カラーと縦線 indicator の使い分けを Best Practice として明記。

### E-5. プライバシーモード (BUSY_ONLY) の見え方

メンバー A の RoomEvent (visibility=BUSY_ONLY) を他メンバーが見た時:

```
2026-06-01 (月)
─ 14:00 ─ 16:00  ●  予定あり  (メンバー A)
                    (タイトル・場所・備考すべて非表示)
```

本人だけは title (rawTitle) を見える。

---

## Part F. プライバシー / セキュリティ懸念

### F-1. .ics に含まれる機微情報

- DESCRIPTION (詳細) / LOCATION (場所) / ATTENDEE (参加者) はそのまま保存しない
- Atender は **SUMMARY と DTSTART/DTEND のみ抽出**、DESCRIPTION/LOCATION/ATTENDEE は破棄
- URL subscribe の場合も同じ filter を parse 段で適用

### F-2. URL subscribe の secret URL 保護

- iCloud / Google が発行する secret URL は **トークン埋め込み URL** (例: `https://calendar.google.com/calendar/ical/<email>/private-<secret>/basic.ics`)
- DB の `IcsImport.url` カラムは **暗号化保存推奨** (envelope encryption、AES-GCM)
- 関連: `knowledge/pattern/envelope-encryption-postgres-node.md`

### F-3. ユーザー削除時の cascade

- User 削除 → IcsImport / IcsTitleRule / RoomEvent / RoomEventOverride 全て onDelete: Cascade で消える
- 既に Cascade 設定済 (schema 案 B-3)

### F-4. GDPR / 個人情報

- 学生対象なので未成年含む。**「カレンダー取り込みは内容を伏せて時間枠だけ共有する目的」と利用規約に明記**
- import データの保存期間ポリシー: ユーザーが import を削除した時点で全 RoomEvent 即時 DELETE

---

## Part G. Architect 向け推奨設計サマリ (1 ページ)

### 採用ライブラリ
- `rrule` (npm) — RRULE 展開 + toText (UI 自然言語)
- `node-ical` — .ics parse (file/URL)
- `jschardet` + `iconv-lite` — エンコーディング正規化
- (将来) `ical-generator` — .ics export

### 新規 Prisma model (詳細は B-3)
- `RoomEvent` を拡張: `recurrenceRule`/`exDates`/`rDates`/`source`/`externalUid`/`externalSeq`/`externalLastModified`/`importId`/`visibilityMode`/`rawTitle` を追加
- `RoomEventOverride` — `(seriesId, originalDate)` で unique
- `IcsImport` — file/URL の import 記録、ポーリング状態を保持
- `IcsTitleRule` — タイトルマッピングルール (EQUALS/CONTAINS/REGEX)
- enum: `RoomEventSource`, `EventVisibility`, `IcsImportStatus`, `TitleMatchType`

### Backend API 追加 (Hono)
- `POST /api/rooms/:roomId/events` — RRULE 含む RoomEvent 作成
- `PATCH /api/rooms/:roomId/events/:id` — body の `editScope: 'single' | 'future' | 'all'` で分岐
- `DELETE /api/rooms/:roomId/events/:id?scope=single|future|all`
- `POST /api/rooms/:roomId/ics-imports` — multipart file (5MB limit) or URL
- `POST /api/rooms/:roomId/ics-imports/:id/preview` — parse 結果プレビュー
- `POST /api/rooms/:roomId/ics-imports/:id/commit` — mapping 適用して RoomEvent 確定
- `GET/POST/PATCH/DELETE /api/users/me/title-rules` — マッピングルール CRUD
- 週単位 endpoint (`GET /api/rooms/:roomId/week?weekStart=YYYY-MM-DD`) 内で **オンザフライ展開**: RoomEvent.recurrenceRule を rrule.between(weekStart, weekStart+7) で展開し、RoomEventOverride を差し込む

### Frontend (Vite + React)
- 新 component:
  - `<RecurrencePicker>` — 「なし/毎日/毎週/平日のみ/毎月/毎年/カスタム」+ custom modal
  - `<RecurrenceEditDialog>` — 3 択 (single/future/all)
  - `<IcsImportWizard>` — file/URL/preview/commit の 4 step
  - `<TitleRuleEditor>` — drag-and-drop の rule リスト
  - `<EventCard>` — visibility=BUSY_ONLY の時はタイトル隠す
- TanStack Query key:
  - `['room', roomId, 'week', weekStart]` — `useQueries` で月 view 並列 fetch (`calendar-week-pattern-meeting-expansion.md` の pattern 継続)
  - `['user', 'title-rules']` — マッピングルール

### Cron / 定期実行
- 6 時間毎: `IcsImport` (source=ICS_URL) を全件 fetch、HTTP cache 効かせて差分のみ parse & upsert
- 実装: Node cron (`node-cron`) or Coolify scheduled task

### MVP 範囲 (Phase 1)
1. RoomEvent の RRULE 対応 (作成/編集/削除、3 択)
2. .ics file upload (preview + commit)
3. デフォルトルール「全部 → 予定」のみ
4. UI: RecurrencePicker / EventCard の visibility 対応

### Phase 1.5 (MVP 直後)
1. URL subscribe (webcal:// + Cron polling)
2. IcsTitleRule の CRUD UI (CONTAINS/REGEX)

### Phase 2 (将来)
1. Google Cal API v3 OAuth + watch (即時同期)
2. LLM ベース auto-categorize (Claude Haiku)
3. .ics export (ical-generator)

### テスト戦略
- `rrule` の展開結果を fixtures で snapshot test (weekly / monthly / BYDAY / UNTIL の各 case)
- node-ical parse の fixtures (Google export / iCloud export / Outlook export の 3 種 .ics ファイル)
- import dedup test: 同 UID 二度 import で行数増えない / SEQUENCE up で update / SEQUENCE 同で skip
- mapping rule priority test: 複数 rule マッチで最低 priority が勝つ
- visibility test: BUSY_ONLY で他ユーザー response から title が落ちる
- 既存 `knowledge/pattern/calendar-week-pattern-meeting-expansion.md` のテスト pattern を継承

### 既存知見との結合
- `calendar-week-pattern-meeting-expansion.md` の **Backend 展開・週単位 endpoint** を踏襲。RoomEvent の RRULE 展開も同じ `GET /api/rooms/:id/week` 内で行う
- `mood-log-schema-llm-ready.md` 等の pattern と独立、RoomCalendar に閉じる
- `envelope-encryption-postgres-node.md` — IcsImport.url を暗号化する場合に参照

---

## Part H. 既存 OSS 実装の参考

### H-1. Cal.com
- [packages/prisma/schema.prisma](https://github.com/calcom/calcom/blob/main/packages/prisma/schema.prisma)
- `Booking.recurringEventId` でシリーズ紐付け
- 個別予約は通常 Booking として独立行 (= 事前展開方式)

### H-2. Mattermost Calendar Plugin
- [mattermost-plugin-calendar](https://github.com/mattermost/mattermost-plugin-calendar)
- RRULE 文字列保存 + Go の rrule lib で都度展開 (= オンザフライ方式)

### H-3. Vikunja Recurring Tasks
- [Recurring tasks docs](https://vikunja.io/docs/usage/tasks/recurring-tasks/)
- RRULE 文字列 + 主要 freq を冗長カラム化

### H-4. Outline (doc reminders)
- RRULE 文字列のみ保存、オンザフライ展開

→ **Atender は Mattermost / Outline 寄り (オンザフライ + 文字列保存)** が最も近い。

---

## Part I. 不確定事項 / 設計で要確認

1. **RoomEvent vs Meeting の責務境界** — RoomEvent で時間割を模写できてしまうが、Meeting は出欠記録 (AttendanceRecord) と紐づくので別物。.ics import で時間割っぽい予定を入れられた時、RoomEvent に入れるのか Meeting に入れるのか UI で明示する必要あり ★ Architect 判断要
2. **EXDATE/RDATE の CSV TEXT は将来 1000 行 EXDATE で limit に当たる可能性** — RFC では文字列長制限なし。SQLite TEXT 上限は 10^9 char で実害なし、parse コストもキャッシュで吸収可。MVP は CSV で進める判断
3. **URL subscribe の secret URL 暗号化** — envelope encryption 採用するなら別途設計 (envelope-encryption-postgres-node.md)。MVP は plain TEXT で進め、Phase 1.5 で暗号化に切替 ★ Architect 判断要
4. **タイムゾーン正規化の責務** — Floating time の解釈、ユーザー TZ 設定 (User table に `timezone` カラム追加するか?) ★ Architect 判断要
5. **RoomEvent と既存の TanStack Router routes** — `/rooms/:id` 下のサブルート設計 (`/import`, `/settings/title-rules`) 配置 ★ Architect 判断要

---

## Part J. まとめ — Architect への伝言

- **RRULE は生文字列で持つ** (Google Cal API 互換、rrule npm で展開、ical export 容易)
- **occurrence はオンザフライ展開** (週単位 endpoint 内で rrule.between)、Meeting (事前展開) と方針を分ける
- **個別回 override は別テーブル** (`RoomEventOverride`)、Cal.com 等の業界標準
- **.ics import は node-ical + jschardet/iconv-lite + 5MB limit** で始める。UID で dedup、SEQUENCE/LAST-MODIFIED で update 判定
- **タイトルマッピングは 3 種 (EQUALS/CONTAINS/REGEX)** + デフォルトルール「全部 → 予定」で MVP 完結
- **プライバシーは visibility enum (NORMAL/TITLE_MAPPED/BUSY_ONLY)** で 3 段階。本人は rawTitle 確認可、メンバーは title のみ
- **MVP は file upload only**、URL subscribe / Google OAuth / LLM 分類は Phase 1.5+ で段階導入
- 既存 `Meeting` / `MeetingOccurrence` には**手を入れない**。RoomEvent 側だけ拡張する
