import Foundation

struct EKEventSnapshot: Equatable {
    let externalId: String
    let calendarId: String
    let lastModified: Date?
    let date: String
    let title: String
    let isAllDay: Bool
    let startMinute: Int?
    let endMinute: Int?
}

enum EventKitTimeMapping {
    static func toPersonalDays(
        start: Date,
        end: Date,
        isAllDay: Bool,
        clock: SchoolClock.Type = SchoolClock.self
    ) -> [(date: String, isAllDay: Bool, startMinute: Int?, endMinute: Int?)] {
        let calendar = clock.calendar
        if isAllDay {
            let startDay = calendar.startOfDay(for: start)
            let adjustedEnd = calendar.date(byAdding: .second, value: -1, to: end) ?? end
            let endDay = calendar.startOfDay(for: adjustedEnd)
            var cursor = startDay
            var output: [(String, Bool, Int?, Int?)] = []
            while cursor <= endDay {
                output.append((clock.todayString(cursor), true, nil, nil))
                cursor = calendar.date(byAdding: .day, value: 1, to: cursor) ?? cursor
            }
            return output
        }

        let startDay = calendar.startOfDay(for: start)
        let adjustedEnd = calendar.date(byAdding: .second, value: -1, to: end) ?? end
        let endDay = calendar.startOfDay(for: adjustedEnd)
        var cursor = startDay
        var output: [(String, Bool, Int?, Int?)] = []
        while cursor <= endDay {
            let dayEnd = calendar.date(byAdding: .day, value: 1, to: cursor) ?? cursor
            let segmentStart = max(start, cursor)
            let segmentEnd = min(end, dayEnd)
            output.append((
                clock.todayString(cursor),
                false,
                minutes(from: cursor, to: segmentStart),
                minutes(from: cursor, to: segmentEnd)
            ))
            cursor = dayEnd
        }
        return output
    }

    static func toAbsolute(date: String, isAllDay: Bool, startMinute: Int?, endMinute: Int?) -> (start: Date, end: Date) {
        let calendar = SchoolClock.calendar
        let parts = date.split(separator: "-").compactMap { Int($0) }
        let day = calendar.date(from: DateComponents(timeZone: SchoolClock.timeZone, year: parts[safe: 0] ?? 1970, month: parts[safe: 1] ?? 1, day: parts[safe: 2] ?? 1)) ?? Date()
        if isAllDay {
            return (day, calendar.date(byAdding: .day, value: 1, to: day) ?? day)
        }
        return (
            calendar.date(byAdding: .minute, value: startMinute ?? 0, to: day) ?? day,
            calendar.date(byAdding: .minute, value: endMinute ?? startMinute ?? 0, to: day) ?? day
        )
    }

    private static func minutes(from dayStart: Date, to date: Date) -> Int {
        max(0, min(1440, SchoolClock.calendar.dateComponents([.minute], from: dayStart, to: date).minute ?? 0))
    }
}

private extension Collection {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
