import Foundation

enum SyncTrigger: Equatable, Sendable {
    case appLaunch, foreground, storeChanged, permissionGranted, calendarScreen, dataChanged, manual

    var bypassesThrottle: Bool { self == .appLaunch || self == .permissionGranted || self == .manual }
}

/// 書き出し窓 (今日−31日 〜 今日+334日)
struct ExportWindow: Equatable, Sendable {
    let from: String    // "yyyy-MM-dd" JST・含む
    let to: String      // "yyyy-MM-dd" JST・含む

    static func around(today: String) -> ExportWindow {
        ExportWindow(from: CalendarRange.addDays(today, -31), to: CalendarRange.addDays(today, 334))
    }
}

/// トリガとスロットル (§5.5、純関数)
enum CalendarSyncTrigger {
    static let throttle: TimeInterval = 15
    static let selfWriteQuietPeriod: TimeInterval = 3
    static let storeChangedDebounce: TimeInterval = 1

    static func shouldRun(
        trigger: SyncTrigger,
        now: Date,
        lastRunAt: Date?,
        lastSelfWriteAt: Date?,
        isRunning: Bool
    ) -> Bool {
        if isRunning { return false }
        if trigger == .storeChanged, let lastSelfWriteAt,
           now.timeIntervalSince(lastSelfWriteAt) < selfWriteQuietPeriod {
            return false
        }
        if trigger.bypassesThrottle { return true }
        guard let lastRunAt else { return true }
        return now.timeIntervalSince(lastRunAt) >= throttle
    }

    /// 書き出しの再実行が要る QueryKey の前方一致集合
    static let watchedPrefixes: [QueryKey] = [
        QueryKey(["personal-events"]),
        QueryKey(["user-timetables"]),
        QueryKey(["timetable-suspensions"]),
        QueryKey(["semesters"]),
        QueryKey(["courses"]),
    ]

    static func isDataChange(_ invalidated: [QueryKey]) -> Bool {
        invalidated.contains { key in
            watchedPrefixes.contains { key.hasPrefix($0) }
        }
    }
}
