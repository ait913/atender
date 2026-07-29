import Foundation

/// EKEvent.url に埋める自己記述的な識別子 (§4.1)
enum ExportKind: String, Equatable, Sendable {
    case meeting = "m"
    case personal = "p"
}

enum ExportKey {
    static let scheme = "atender"

    /// atender://m/<meetingId>/<yyyyMMdd>/<firstPeriodOffset>
    static func meeting(meetingId: String, date: String, firstPeriodOffset: Int) -> String {
        "\(scheme)://\(ExportKind.meeting.rawValue)/\(meetingId)/\(compactDate(date))/\(firstPeriodOffset)"
    }

    /// atender://p/<seriesId>/<yyyyMMdd'T'HHmmss'Z'>
    static func personal(seriesId: String, occurrenceDate: Date) -> String {
        "\(scheme)://\(ExportKind.personal.rawValue)/\(seriesId)/\(basicUtc(occurrenceDate))"
    }

    /// 我々の書いたものでなければ nil
    static func kind(of key: String?) -> ExportKind? {
        guard let key else { return nil }
        let prefix = "\(scheme)://"
        guard key.hasPrefix(prefix) else { return nil }
        let rest = key.dropFirst(prefix.count)
        guard let slash = rest.firstIndex(of: "/") else { return nil }
        let remainder = rest[rest.index(after: slash)...]
        guard !remainder.isEmpty else { return nil }
        return ExportKind(rawValue: String(rest[rest.startIndex..<slash]))
    }

    static func isOwned(_ urlString: String?) -> Bool {
        kind(of: urlString) != nil
    }

    /// "2026-07-23" → "20260723" (区切り文字を落とすだけ。日付演算はしない)
    private static func compactDate(_ date: String) -> String {
        date.replacingOccurrences(of: "-", with: "")
    }

    private static func basicUtc(_ date: Date) -> String {
        Self.basicUtcFormatter.string(from: date)
    }

    private static let basicUtcFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        return formatter
    }()
}
