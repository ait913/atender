import Foundation
import SwiftUI

enum DayConvention {
    static func jsToDisplay(_ js: Int) -> Int { ((js + 6) % 7) + 1 }
    static func displayToJs(_ display: Int) -> Int { display % 7 }

    static func resolveDisplayDays(daysOfWeek: [Int], meetings: [MeetingDto]) -> [Int] {
        var set = Set(daysOfWeek.isEmpty ? [1, 2, 3, 4, 5] : daysOfWeek)
        for meeting in meetings {
            set.insert(jsToDisplay(meeting.dayOfWeek))
        }
        return set.sorted()
    }

    static func todayDayOfWeekJs(_ date: Date = Date(), calendar: Calendar = .current) -> Int {
        let weekday = calendar.component(.weekday, from: date) - 1
        return (weekday == 0 || weekday == 6) ? 1 : weekday
    }
}

struct TimetableEventInput: Equatable, Identifiable {
    let id: String
    let dayOfWeek: Int
    let startPeriodIndex: Int
    var periodCount: Int
    let color: String
    let title: String
    let subtitle: String?
    let mergeKey: String?
}

enum TimetableCoalesce {
    private struct Ordered {
        var event: TimetableEventInput
        let order: Int
    }

    static func coalesce(_ events: [TimetableEventInput]) -> [TimetableEventInput] {
        var passThrough: [Ordered] = []
        var groups: [String: [Ordered]] = [:]

        for (order, event) in events.enumerated() {
            guard let mergeKey = event.mergeKey else {
                passThrough.append(.init(event: event, order: order))
                continue
            }
            groups["\(event.dayOfWeek):\(mergeKey)", default: []].append(.init(event: event, order: order))
        }

        var merged = passThrough
        for list in groups.values {
            let sorted = list.sorted {
                if $0.event.startPeriodIndex != $1.event.startPeriodIndex {
                    return $0.event.startPeriodIndex < $1.event.startPeriodIndex
                }
                return $0.order < $1.order
            }
            var current: Ordered?
            for item in sorted {
                guard var active = current else {
                    current = Ordered(event: item.event, order: item.order)
                    continue
                }
                let currentEnd = active.event.startPeriodIndex + active.event.periodCount
                if item.event.startPeriodIndex == currentEnd {
                    active.event.periodCount += item.event.periodCount
                    current = active
                } else {
                    merged.append(active)
                    current = Ordered(event: item.event, order: item.order)
                }
            }
            if let current {
                merged.append(current)
            }
        }

        return merged.sorted {
            if $0.event.dayOfWeek != $1.event.dayOfWeek { return $0.event.dayOfWeek < $1.event.dayOfWeek }
            if $0.event.startPeriodIndex != $1.event.startPeriodIndex { return $0.event.startPeriodIndex < $1.event.startPeriodIndex }
            return $0.order < $1.order
        }.map(\.event)
    }
}

enum CalendarEventKind: Equatable { case meeting, personal, roomEvent }

struct CalendarEvent: Equatable, Identifiable {
    let kind: CalendarEventKind
    let id: String
    let date: String
    let title: String
    let startMinute: Int
    let endMinute: Int
    let color: String
    let subtitle: String
    let courseId: String?
    var ownerId: String? = nil
    var source: RoomEventSource? = nil
}

enum MemberColor {
    private static let palette = ["#12B172", "#56D8C3", "#568CFC", "#A978FA", "#FC6ABF", "#FD728E"]

    static func memberColor(_ seed: String) -> String {
        guard !seed.isEmpty else { return palette[0] }
        var hash = 5381
        for scalar in seed.unicodeScalars {
            hash = (hash &* 33) ^ Int(scalar.value)
        }
        return palette[abs(hash) % palette.count]
    }
}

enum MeetingExpansion {
    static func expandUserTimetable(
        meetings: [MeetingDto],
        courses: [CourseDto],
        daySlots: [DaySlotDto],
        rangeStart: String,
        rangeEnd: String,
        semesterStart: String?,
        semesterEnd: String?,
        statusByDate: [String: AttendanceDayStatus]
    ) -> [CalendarEvent] {
        let courseMap = Dictionary(uniqueKeysWithValues: courses.map { ($0.id, $0) })
        let slotMap = Dictionary(uniqueKeysWithValues: daySlots.map { ($0.periodIndex, $0) })
        var events: [CalendarEvent] = []
        var cursor = rangeStart
        while cursor <= rangeEnd {
            defer { cursor = CalendarRange.addDays(cursor, 1) }
            if let semesterStart, cursor < semesterStart { continue }
            if let semesterEnd, cursor > semesterEnd { continue }
            if statusByDate[cursor] == .noClass { continue }
            guard let date = CalendarRange.parse(cursor) else { continue }
            let jsDay = CalendarRange.utcCalendar.component(.weekday, from: date) - 1
            for meeting in meetings where meeting.dayOfWeek == jsDay {
                guard let course = courseMap[meeting.courseId],
                      let startSlot = slotMap[meeting.startPeriodIndex]
                else { continue }
                let endSlot = slotMap[meeting.startPeriodIndex + meeting.periodCount - 1] ?? startSlot
                events.append(CalendarEvent(
                    kind: .meeting,
                    id: "m:\(meeting.courseId):\(cursor):\(startSlot.startMinute)",
                    date: cursor,
                    title: course.name,
                    startMinute: startSlot.startMinute,
                    endMinute: endSlot.endMinute,
                    color: course.color ?? MemberColor.memberColor(meeting.courseId),
                    subtitle: "自分",
                    courseId: meeting.courseId
                ))
            }
        }
        return events.sorted {
            if $0.date != $1.date { return $0.date < $1.date }
            return $0.startMinute < $1.startMinute
        }
    }

    static func eventsByDate(_ events: [CalendarEvent]) -> [String: [CalendarEvent]] {
        Dictionary(grouping: events, by: \.date)
    }
}

enum CalendarViewMode: String, CaseIterable {
    case day, week, month
}

enum DateFormatPattern {
    case monthDay
    case yearMonthDay
    case yearMonth
}

enum CalendarRange {
    static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        calendar.locale = Locale(identifier: "ja_JP")
        return calendar
    }()

    private static let parser: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = utcCalendar
        formatter.timeZone = utcCalendar.timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func parse(_ date: String) -> Date? { parser.date(from: date) }
    static func yyyyMMdd(_ date: Date) -> String { parser.string(from: date) }

    static func mondayOf(_ date: String) -> String {
        guard let parsed = parse(date) else { return date }
        let day = utcCalendar.component(.weekday, from: parsed) - 1
        let offset = day == 0 ? -6 : -(day - 1)
        return yyyyMMdd(utcCalendar.date(byAdding: .day, value: offset, to: parsed) ?? parsed)
    }

    static func monthGridRange(anchorMonthFirst: String) -> (start: String, end: String) {
        let start = mondayOf(monthFirst(anchorMonthFirst))
        return (start, addDays(start, 41))
    }

    static func weekStartsFor(_ mode: CalendarViewMode, anchor: String) -> [String] {
        if mode == .day || mode == .week { return [mondayOf(anchor)] }
        let first = mondayOf(monthFirst(anchor))
        return (0..<6).map { addDays(first, $0 * 7) }
    }

    static func addDays(_ date: String, _ n: Int) -> String {
        guard let parsed = parse(date),
              let next = utcCalendar.date(byAdding: .day, value: n, to: parsed)
        else { return date }
        return yyyyMMdd(next)
    }

    static func addMonths(_ date: String, _ n: Int) -> String {
        guard let parsed = parse(date),
              let next = utcCalendar.date(byAdding: .month, value: n, to: parsed)
        else { return date }
        return yyyyMMdd(next)
    }

    static func monthFirst(_ date: String) -> String {
        String(date.prefix(7)) + "-01"
    }

    static func format(_ date: String, _ pattern: DateFormatPattern) -> String {
        guard let parsed = parse(date) else { return date }
        let formatter = DateFormatter()
        formatter.calendar = utcCalendar
        formatter.timeZone = utcCalendar.timeZone
        formatter.locale = Locale(identifier: "ja_JP")
        switch pattern {
        case .monthDay: formatter.dateFormat = "M/d"
        case .yearMonthDay: formatter.dateFormat = "yyyy年 M月d日"
        case .yearMonth: formatter.dateFormat = "yyyy年 M月"
        }
        return formatter.string(from: parsed)
    }

    static func todayString() -> String { yyyyMMdd(Date()) }
}

enum CalendarLane {
    struct Laned: Equatable {
        var event: CalendarEvent
        var lane: Int
        var laneCount: Int
    }

    static func assignLanes(_ events: [CalendarEvent]) -> [Laned] {
        let sorted = events
            .filter { $0.endMinute > $0.startMinute }
            .sorted { $0.startMinute == $1.startMinute ? $0.endMinute < $1.endMinute : $0.startMinute < $1.startMinute }

        var clusters: [[CalendarEvent]] = []
        var cluster: [CalendarEvent] = []
        var clusterEnd = Int.min
        for event in sorted {
            if event.startMinute >= clusterEnd {
                if !cluster.isEmpty { clusters.append(cluster) }
                cluster = [event]
                clusterEnd = event.endMinute
            } else {
                cluster.append(event)
                clusterEnd = max(clusterEnd, event.endMinute)
            }
        }
        if !cluster.isEmpty { clusters.append(cluster) }

        var out: [Laned] = []
        for current in clusters {
            var lanes: [Int] = []
            var assigned: [String: Int] = [:]
            for event in current {
                var placed = -1
                for index in lanes.indices where lanes[index] <= event.startMinute {
                    placed = index
                    break
                }
                if placed == -1 {
                    placed = lanes.count
                    lanes.append(event.endMinute)
                } else {
                    lanes[placed] = event.endMinute
                }
                assigned[event.id] = placed
            }
            for event in current {
                out.append(.init(event: event, lane: assigned[event.id] ?? 0, laneCount: lanes.count))
            }
        }
        return out
    }
}

enum CalendarEventDisplay {
    static func eventColor(_ e: CalendarEvent) -> String { e.color }
    static func eventTitle(_ e: CalendarEvent) -> String { e.title }

    static func dayStatusColor(_ s: AttendanceDayStatus) -> Color {
        switch s {
        case .allPresent: return .statusPresent
        case .hasAbsent: return .statusAbsent
        case .hasTardy: return .statusTardy
        case .allSuspended: return .statusCancelled
        case .partialUnrecorded, .noClass, .unknown: return .statusNone
        }
    }

    static func dayStatusLabel(_ s: AttendanceDayStatus) -> String {
        switch s {
        case .allPresent: return "出席"
        case .hasAbsent: return "欠席あり"
        case .hasTardy: return "遅刻・早退あり"
        case .allSuspended: return "休講"
        case .partialUnrecorded, .noClass, .unknown: return "未記録あり"
        }
    }
}

enum PeriodGrouping {
    struct Group: Equatable {
        let start: Int
        let count: Int
    }

    static func groupPeriods(_ periods: [Int]) -> [Group] {
        let sorted = Array(Set(periods)).sorted()
        guard let first = sorted.first else { return [] }
        var groups: [Group] = []
        var start = first
        var previous = first
        for period in sorted.dropFirst() {
            if period == previous + 1 {
                previous = period
            } else {
                groups.append(.init(start: start, count: previous - start + 1))
                start = period
                previous = period
            }
        }
        groups.append(.init(start: start, count: previous - start + 1))
        return groups
    }

    static func renderPreview(_ periods: [Int]) -> String {
        groupPeriods(periods).map { group in
            group.count == 1 ? "\(group.start)限 (単独)" : "\(group.start)-\(group.start + group.count - 1)限 (\(group.count)連続)"
        }.joined(separator: " + ")
    }

    static func isContiguous(_ periods: [Int]) -> Bool {
        let sorted = Array(Set(periods)).sorted()
        guard let first = sorted.first else { return false }
        return sorted.enumerated().allSatisfy { offset, value in value == first + offset }
    }

    static func meetingRange(_ periods: [Int]) -> (startPeriodIndex: Int, periodCount: Int) {
        let sorted = Array(Set(periods)).sorted()
        guard let first = sorted.first else { return (1, 1) }
        return (first, max(1, sorted.count))
    }
}

enum TimeFormatting {
    static func minutesToTime(_ minutes: Int) -> String {
        String(format: "%02d:%02d", minutes / 60, minutes % 60)
    }

    static func hhmmToMinutes(_ value: String) -> Int? {
        let parts = value.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        return parts[0] * 60 + parts[1]
    }
}

extension Color {
    init(hexString: String) {
        var hex = hexString.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        if hex.count == 3 {
            hex = hex.map { "\($0)\($0)" }.joined()
        }
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        self.init(
            red: Double((int >> 16) & 0xFF) / 255,
            green: Double((int >> 8) & 0xFF) / 255,
            blue: Double(int & 0xFF) / 255
        )
    }

    static func mix(hex: String, with target: Color, ratio: Double) -> Color {
        Color(hexString: hex).opacity(max(0.12, min(1, ratio + 0.18)))
    }
}
