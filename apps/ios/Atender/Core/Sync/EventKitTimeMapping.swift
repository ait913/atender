import Foundation

enum EventKitTimeMapping {
    /// yyyy-MM-dd (JST) の 00:00 に対応する絶対時刻
    static func jstDayStart(_ date: String) -> Date {
        let calendar = SchoolClock.calendar
        let parts = date.split(separator: "-").compactMap { Int($0) }
        return calendar.date(from: DateComponents(
            timeZone: SchoolClock.timeZone,
            year: parts[safe: 0] ?? 1970,
            month: parts[safe: 1] ?? 1,
            day: parts[safe: 2] ?? 1
        )) ?? Date()
    }
}

private extension Collection {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
