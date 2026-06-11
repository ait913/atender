---
title: 個人カレンダーは時間割をクライアント側で日付展開して実授業を出す (出席集計ではない)
category: pattern
project: atender
tags: [calendar, meeting-expansion, personal-calendar, timetable]
created: 2026-06-02
sources:
  - .designs/20260602-ui-improvements.md (項目3)
  - apps/web/src/lib/meetingExpansion.ts (expandUserTimetable)
  - apps/web/src/components/home/PersonalCalendar.tsx
---

## Context

個人カレンダー (Home の「カレンダー」タブ) で「TimeTree のように中身 (実授業) を表示」したい。`useSemesterOverview` の `days[]` は **1 日 1 件の出席ステータス集計** (ALL_PRESENT / HAS_ABSENT / ALL_SUSPENDED / NO_CLASS 等) しか持たず、実授業の羅列ソースではない。当初これを personal イベント化していたため 1 日 1 件しか出ず「中身表示」にならなかった。

## What

実授業は **クライアント側で自分の時間割を日付展開**して作る (新規 API 不要):

- `useUserTimetables()` の `UserTimetableDto` (meetings / courses / daySlots) + `useSemesters()` の `startDate`/`endDate` を `expandUserTimetable()` (`lib/meetingExpansion.ts`) に渡し、表示中レンジに絞って `MeetingEvent[]` を生成。
- **dayOfWeek 規約に注意**: `MeetingDto.dayOfWeek` は **0=日..6=土** (dayjs `.day()` 直結)。`TimetableView`/`TimetableGrid` 内部の 1=月..7 は**表示専用の別系統**。展開時は格納値 0..6 を使う。
- 開始/終了分は daySlots から解決 (periodCount>1 は開始 slot startMinute 〜 末尾 slot endMinute)。
- `NO_CLASS` 日は展開しない / `ALL_SUSPENDED` 日は展開する (休講でも予定授業は履歴として見せる)。
- **半年一括展開は禁物**。viewMode (month=6週グリッド全域 / week / day) に応じて `rangeStart`/`rangeEnd` を絞る (`calendarRange.ts` の `monthGridRange` 等)。
- 出席ステータス (`overview.days`) は捨てず、日セルの**ドット**として併存させる (Atender は出席率追跡アプリ)。

## Why

時間割 + 学期範囲 + daySlots が揃えば実授業は client で再構成できる。サーバに「個人の週/月イベント」API を足すのは iPhone client 互換と migration コストが見合わない。`MeetingEvent` 型と `eventsByDate` は既存で、CalendarWeek/CalendarDay も `kind:"meeting"` を描画できるのでデータソース差し替えだけで全ビューに効く。

## How to apply

- 将来 RoomEvent / Google Calendar 個人統合が入ったら、その events を `expandUserTimetable` 出力に**マージ**すれば月/週/日すべてに自動で乗る (CalendarMonth は `CalendarEvent[]` 入力に一般化済み)。
- 表示/タイトル/色は `lib/calendarEventDisplay.ts` (`eventColor`/`eventTitle`/`dayStatusColor`/`dayStatusLabel`) に集約。重複させない。
