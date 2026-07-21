import SwiftUI

enum AttendanceDayVisual {
    struct Visual: Equatable {
        let icon: Icon
        let iconColor: Color
        let bgStatusColor: Color?
        let bgFraction: Double
        let dashed: Bool
    }

    enum Icon: Equatable {
        case check
        case x
        case clock
        case ban
        case minus
        case none
    }

    static func of(status: AttendanceDayStatus?, isFuture: Bool) -> Visual {
        if isFuture, status != .allSuspended {
            return .init(icon: .none, iconColor: .statusNone, bgStatusColor: nil, bgFraction: 0, dashed: false)
        }

        switch status {
        case .allPresent:
            return .init(icon: .check, iconColor: .statusPresent, bgStatusColor: .statusPresent, bgFraction: Double(Color.surfaceTintRatio), dashed: false)
        case .hasAbsent:
            return .init(icon: .x, iconColor: .statusAbsent, bgStatusColor: .statusAbsent, bgFraction: Double(Color.surfaceTintRatio), dashed: false)
        case .hasTardy:
            return .init(icon: .clock, iconColor: .statusTardy, bgStatusColor: .statusTardy, bgFraction: Double(Color.surfaceTintRatio), dashed: false)
        case .allSuspended:
            return .init(icon: .ban, iconColor: .statusSuspended, bgStatusColor: .statusSuspended, bgFraction: Double(Color.surfaceTintRatio), dashed: false)
        case .partialUnrecorded:
            return .init(icon: .minus, iconColor: .textTertiary, bgStatusColor: .statusNone, bgFraction: 0.12, dashed: true)
        case .noClass, .unknown, .none:
            return .init(icon: .none, iconColor: .statusNone, bgStatusColor: nil, bgFraction: 0, dashed: false)
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
