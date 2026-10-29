import Foundation

struct TemplateScope: Equatable {
    let schoolId: String
    let departmentId: String
    let schoolName: String
    let departmentName: String
}

struct TemplatePreviewRow: Equatable, Identifiable {
    let id: String
    let weekday: String
    let periodText: String
    let courseName: String
    let detail: String?
}

enum TemplateSuggestionLogic {
    static let foundTitle = "同じ学科の時間割が見つかりました"

    static func visible(_ templates: [TemplateDto]) -> [TemplateDto] {
        struct AuthorTitle: Hashable {
            let author: String
            let title: String
        }
        var latest: [AuthorTitle: TemplateDto] = [:]
        var anonymous: [TemplateDto] = []
        for template in templates where !template.meetings.isEmpty {
            guard !template.authorUserId.isEmpty else {
                anonymous.append(template)
                continue
            }
            let key = AuthorTitle(author: template.authorUserId, title: template.title)
            if let previous = latest[key], !newer(template, than: previous) { continue }
            latest[key] = template
        }
        return (Array(latest.values) + anonymous).sorted {
            if $0.copyCount != $1.copyCount { return $0.copyCount > $1.copyCount }
            return newer($0, than: $1)
        }
    }

    static func sizeText(_ t: TemplateDto) -> String {
        "\(t.courses.count)科目・週\(t.meetings.reduce(0) { $0 + $1.periodCount })コマ"
    }

    static func metaText(_ t: TemplateDto, meId: String?) -> String {
        var parts: [String] = []
        if meId == t.authorUserId { parts.append("あなたが公開") }
        if t.copyCount > 0 { parts.append("\(t.copyCount)人が使用") }
        if let date = timestamp(t.updatedAt) {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(identifier: "Asia/Tokyo")
            formatter.dateFormat = "yyyy/M/d"
            parts.append("\(formatter.string(from: date)) 更新")
        }
        return parts.joined(separator: "・")
    }

    static func previewRows(_ t: TemplateDto) -> [TemplatePreviewRow] {
        let weekdays = ["日", "月", "火", "水", "木", "金", "土"]
        return t.meetings.sorted {
            let lhsDay = $0.dayOfWeek == 0 ? 7 : $0.dayOfWeek
            let rhsDay = $1.dayOfWeek == 0 ? 7 : $1.dayOfWeek
            if lhsDay != rhsDay { return lhsDay < rhsDay }
            if $0.startPeriodIndex != $1.startPeriodIndex { return $0.startPeriodIndex < $1.startPeriodIndex }
            return $0.id < $1.id
        }.map { meeting in
            let course = t.courses.first { $0.id == meeting.courseId }
            let detail = [course?.teacher, meeting.room].compactMap { $0 }.joined(separator: " · ")
            let start = meeting.startPeriodIndex
            let periodText = meeting.periodCount > 1 ? "\(start)–\(start + meeting.periodCount - 1)限" : "\(start)限"
            return TemplatePreviewRow(
                id: meeting.id,
                weekday: weekdays.indices.contains(meeting.dayOfWeek) ? weekdays[meeting.dayOfWeek] : "",
                periodText: periodText,
                courseName: course?.name ?? "授業",
                detail: detail.isEmpty ? nil : detail
            )
        }
    }

    private static func newer(_ lhs: TemplateDto, than rhs: TemplateDto) -> Bool {
        let lhsDate = timestamp(lhs.updatedAt) ?? .distantPast
        let rhsDate = timestamp(rhs.updatedAt) ?? .distantPast
        if lhsDate != rhsDate { return lhsDate > rhsDate }
        return lhs.id > rhs.id
    }

    private static func timestamp(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}
