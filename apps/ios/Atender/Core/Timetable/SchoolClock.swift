import Foundation

/// API date semantics are fixed to Asia/Tokyo, so "today" must use the same clock.
enum SchoolClock {
    static let timeZone = TimeZone(identifier: "Asia/Tokyo")!

    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = timeZone
        c.locale = Locale(identifier: "ja_JP")
        return c
    }()

    /// Minutes elapsed since 00:00 JST. This matches DaySlotDto.startMinute.
    static func nowMinute(_ now: Date = Date()) -> Int {
        let components = calendar.dateComponents([.hour, .minute], from: now)
        return (components.hour ?? 0) * 60 + (components.minute ?? 0)
    }

    /// Today's date in JST, formatted as yyyy-MM-dd.
    static func todayString(_ now: Date = Date()) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: now)
        let year = components.year ?? 1970
        let month = components.month ?? 1
        let day = components.day ?? 1
        return String(format: "%04d-%02d-%02d", year, month, day)
    }

    /// Display weekday: 1=Monday ... 7=Sunday. Weekends are not rounded to Monday.
    static func displayDay(_ now: Date = Date()) -> Int {
        let weekday = calendar.component(.weekday, from: now)
        return weekday == 1 ? 7 : weekday - 1
    }
}
