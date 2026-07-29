import SwiftUI

enum AttendanceDayVisual {
    /// severity 順。CaseIterable の宣言順 = 表示順 (Web の DAY_MARK_ORDER と一致させる)
    enum Kind: String, CaseIterable, Equatable {
        case absent, excused, tardy, suspended, present, unrecorded
    }

    enum Icon: Equatable {
        case check, x, excused, clock, ban, minus, none
    }

    struct Mark: Equatable {
        let kind: Kind
        let count: Int        // 1 以上
        let icon: Icon
        let iconColor: Color
        let tintColor: Color
        let tintFraction: Double

        /// ホーム個人カレンダーのドット色 (§4.5)
        var dotColor: Color { kind == .unrecorded ? .statusNone : iconColor }
    }

    struct DayVisual: Equatable {
        let marks: [Mark]     // severity 順。count == 0 のものは含まない
        let dashed: Bool
    }

    /// 唯一の描画決定関数。
    static func dayVisual(summary: AttendanceDaySummary?, isFuture: Bool) -> DayVisual {
        guard let summary else { return DayVisual(marks: [], dashed: false) }
        guard let counts = summary.counts else {
            return legacyVisual(status: summary.status, isFuture: isFuture)
        }
        let unrecorded = isFuture ? 0 : counts.unrecorded
        let byKind: [Kind: Int] = [
            .absent: counts.absent,
            .excused: counts.excused,
            .tardy: counts.tardy + counts.earlyLeave,
            .suspended: counts.suspended,
            .present: counts.present,
            .unrecorded: unrecorded,
        ]
        let marks: [Mark] = Kind.allCases.compactMap { kind in
            guard let count = byKind[kind], count > 0 else { return nil }
            return mark(kind, count: count)
        }
        return DayVisual(marks: marks, dashed: unrecorded > 0)
    }

    /// 背景に敷く縦スライス列 (occurrence 1 件 = 1 スライス、等幅)。marks が空なら []
    static func backgroundSlices(_ marks: [Mark]) -> [(color: Color, fraction: Double)] {
        let total = marks.reduce(0) { $0 + $1.count }
        guard total > 0 else { return [] }
        let fraction = 1.0 / Double(total)
        var slices: [(color: Color, fraction: Double)] = []
        for mark in marks {
            let color = mark.tintColor.opacity(mark.tintFraction)
            for _ in 0..<mark.count {
                slices.append((color: color, fraction: fraction))
            }
        }
        return slices
    }

    /// セルに描くグリフ (severity 順に先頭 2 件)
    static func glyphs(_ marks: [Mark]) -> [Mark] {
        Array(marks.prefix(2))
    }

    /// counts を返さない旧 API 向けの legacy 経路 (§4.4)。
    private static func legacyVisual(status: AttendanceDayStatus, isFuture: Bool) -> DayVisual {
        if status == .allSuspended {
            return DayVisual(marks: [mark(.suspended, count: 1)], dashed: false)
        }
        if isFuture { return DayVisual(marks: [], dashed: false) }
        switch status {
        case .allPresent:
            return DayVisual(marks: [mark(.present, count: 1)], dashed: false)
        case .hasAbsent:
            return DayVisual(marks: [mark(.absent, count: 1)], dashed: false)
        case .hasTardy:
            return DayVisual(marks: [mark(.tardy, count: 1)], dashed: false)
        case .partialUnrecorded:
            return DayVisual(marks: [mark(.unrecorded, count: 1)], dashed: true)
        case .allSuspended, .noClass, .unknown:
            return DayVisual(marks: [], dashed: false)
        }
    }

    private static func mark(_ kind: Kind, count: Int) -> Mark {
        switch kind {
        case .absent:
            return Mark(kind: kind, count: count, icon: .x, iconColor: .statusAbsent, tintColor: .statusAbsent, tintFraction: Double(Color.surfaceTintRatio))
        case .excused:
            return Mark(kind: kind, count: count, icon: .excused, iconColor: .statusExcused, tintColor: .statusExcused, tintFraction: Double(Color.surfaceTintRatio))
        case .tardy:
            return Mark(kind: kind, count: count, icon: .clock, iconColor: .statusTardy, tintColor: .statusTardy, tintFraction: Double(Color.surfaceTintRatio))
        case .suspended:
            return Mark(kind: kind, count: count, icon: .ban, iconColor: .statusSuspended, tintColor: .statusSuspended, tintFraction: Double(Color.surfaceTintRatio))
        case .present:
            return Mark(kind: kind, count: count, icon: .check, iconColor: .statusPresent, tintColor: .statusPresent, tintFraction: Double(Color.surfaceTintRatio))
        case .unrecorded:
            return Mark(kind: kind, count: count, icon: .minus, iconColor: .textTertiary, tintColor: .statusNone, tintFraction: 0.12)
        }
    }
}

enum SemesterCalendarGrid {
    static func cells(monthAnchor: String) -> [String] {
        let first = CalendarRange.monthFirst(monthAnchor)
        let start = sundayOf(first)
        guard let firstDate = CalendarRange.parse(first),
              let nextMonth = CalendarRange.utcCalendar.date(byAdding: .month, value: 1, to: firstDate),
              let lastDate = CalendarRange.utcCalendar.date(byAdding: .day, value: -1, to: nextMonth)
        else { return [] }
        let last = CalendarRange.yyyyMMdd(lastDate)
        let end = saturdayOf(last)
        var out: [String] = []
        var cursor = start
        while cursor <= end {
            out.append(cursor)
            cursor = CalendarRange.addDays(cursor, 1)
        }
        return out
    }

    static func clampMonth(_ target: String, start: String, end: String) -> String {
        let month = CalendarRange.monthFirst(target)
        let startMonth = CalendarRange.monthFirst(start)
        let endMonth = CalendarRange.monthFirst(end)
        if month < startMonth { return startMonth }
        if month > endMonth { return endMonth }
        return month
    }

    static func atStart(anchor: String, start: String) -> Bool {
        CalendarRange.monthFirst(anchor) == CalendarRange.monthFirst(start)
    }

    static func atEnd(anchor: String, end: String) -> Bool {
        CalendarRange.monthFirst(anchor) == CalendarRange.monthFirst(end)
    }

    static func sundayOf(_ date: String) -> String {
        guard let parsed = CalendarRange.parse(date) else { return date }
        let weekday = CalendarRange.utcCalendar.component(.weekday, from: parsed)
        return CalendarRange.addDays(date, -(weekday - 1))
    }

    private static func saturdayOf(_ date: String) -> String {
        guard let parsed = CalendarRange.parse(date) else { return date }
        let weekday = CalendarRange.utcCalendar.component(.weekday, from: parsed)
        return CalendarRange.addDays(date, 7 - weekday)
    }
}

extension SemesterCalendarGrid {
    /// 複数選択モードで学期範囲外の日は「空セル」にする。
    /// 押せないことを不透明度でなく「不在」で示す (通常モードでは常に false = 現行踏襲)
    static func isBlanked(iso: String, startDate: String, endDate: String, selectionMode: Bool) -> Bool {
        guard selectionMode else { return false }
        return !(startDate <= iso && iso <= endDate)
    }
}

enum SemesterCalendarMetrics {
    static let cardHorizontalPadding: CGFloat = Space.s2   // 8
    static let cardVerticalPadding: CGFloat = Space.s4     // 16
    static let innerInset: CGFloat = Space.s2              // 非グリッド要素の追い padding (実効 16pt)
    static let gridSpacing: CGFloat = 3
    static let columnCount: Int = 7
    static let minTapTarget: CGFloat = 44

    /// 画面幅から日セルの一辺 (= 正方形なので tap 領域の縦横) を求める
    static func dayCellSide(screenWidth: CGFloat, pageMargin: CGFloat = Space.pagePxMobile) -> CGFloat {
        let content = screenWidth - pageMargin * 2 - cardHorizontalPadding * 2
            - gridSpacing * CGFloat(columnCount - 1)
        return max(0, content) / CGFloat(columnCount)
    }
}

enum DayDetailLogic {
    static func courseSuspendedIds(_ d: DayDetailDto) -> Set<String> {
        Set(d.courseSuspensions.map(\.courseId))
    }

    static func unrecordedCount(_ d: DayDetailDto) -> Int {
        let suspended = courseSuspendedIds(d)
        return d.occurrences.filter { $0.status == nil && !suspended.contains($0.courseId) }.count
    }

    static func occurrenceCount(_ d: DayDetailDto) -> Int {
        let suspended = courseSuspendedIds(d)
        return d.occurrences.filter { !suspended.contains($0.courseId) }.count
    }

    static func bulkMode(unrecordedCount: Int) -> BulkMode {
        unrecordedCount == 0 ? .overwrite : .fill
    }
}

enum BulkToast {
    static func mark(upserted: Int, skippedExisting: Int, skippedSuspended: Int) -> String {
        var parts = ["\(upserted)件 登録しました"]
        if skippedExisting > 0 { parts.append("\(skippedExisting)件 記録済み") }
        if skippedSuspended > 0 { parts.append("\(skippedSuspended)件 休講") }
        return parts.joined(separator: " / ")
    }

    static func createSuspensions(created: Int, skipped: Int) -> String {
        "\(created)日 休講登録" + (skipped > 0 ? " (\(skipped)日 登録済み)" : "")
    }

    static func formatDateList(_ dates: [String]) -> String {
        dates.map { CalendarRange.format($0, .monthDay) }.joined(separator: ", ")
    }
}

enum SemesterDateBinding {
    static func date(from value: String) -> Date {
        CalendarRange.parse(value) ?? CalendarRange.parse(SchoolClock.todayString()) ?? Date()
    }

    static func string(from date: Date) -> String {
        CalendarRange.yyyyMMdd(date)
    }
}

extension DateFormatPattern {
    static var yearMonthDayWeekday: DateFormatPattern { .yearMonthDay }
}

extension Double {
    var clean: String {
        if truncatingRemainder(dividingBy: 1) == 0 {
            return String(Int(self))
        }
        return String(format: "%.1f", self)
    }
}
