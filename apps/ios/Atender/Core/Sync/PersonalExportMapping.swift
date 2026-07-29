import Foundation

/// 個人予定 occurrence → ExportItem (§5.3、純関数)
enum PersonalExportMapping {
    static func items(occurrences: [PersonalEventOccurrenceDto]) -> [ExportItem] {
        var out: [ExportItem] = []
        for occurrence in occurrences {
            // EVENTKIT ミラーを書き戻すと、ユーザーの元カレンダーの予定が Atender カレンダーにも二重に出る
            guard occurrence.source == "MANUAL" else { continue }
            guard let occurrenceDate = parseInstant(occurrence.occurrenceDate),
                  let start = parseInstant(occurrence.start),
                  let end = parseInstant(occurrence.end) else { continue }
            let title = occurrence.title.isEmpty ? "予定" : occurrence.title
            out.append(ExportItem(
                key: ExportKey.personal(seriesId: occurrence.seriesId, occurrenceDate: occurrenceDate),
                title: title,
                start: start,
                // D2 の終日 end は「最終日の翌日 JST 00:00 (排他)」。EK の終日 endDate は
                // 包含/排他どちらとも取れるので、どちらの解釈でも最終日が変わらない値を書く
                end: occurrence.isAllDay ? end.addingTimeInterval(-1) : end,
                isAllDay: occurrence.isAllDay,
                location: normalized(occurrence.location),
                notes: normalized(occurrence.note)
            ))
        }
        return out.sorted { lhs, rhs in
            if lhs.start != rhs.start { return lhs.start < rhs.start }
            return lhs.key < rhs.key
        }
    }

    /// ISO8601 文字列 → Date の 1 手順だけ。JST 暦の日割りはしない
    static func parseInstant(_ value: String) -> Date? {
        fractionalFormatter.date(from: value) ?? plainFormatter.date(from: value)
    }

    private static func normalized(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private nonisolated(unsafe) static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private nonisolated(unsafe) static let plainFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}
