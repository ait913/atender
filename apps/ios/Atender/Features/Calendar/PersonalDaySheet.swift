import SwiftUI

struct PersonalDaySheet: View {
    let date: String
    let meetings: [CalendarEvent]
    let occurrences: [PersonalEventOccurrenceDto]
    @Binding var path: NavigationPath
    let onChanged: () async -> Void
    let onClose: () -> Void

    var body: some View {
        CalendarDaySheet(
            date: date,
            sections: CalendarDaySheetLogic.personalSections(date: date, meetings: meetings, occurrences: occurrences),
            addTitle: "＋ 予定を追加",
            path: $path,
            onClose: onClose
        ) { target in
            editor(target)
        }
    }

    @ViewBuilder
    private func editor(_ target: CalendarDayEditorTarget) -> some View {
        switch resolveTarget(target) {
        case .create(let defaultDate):
            editorContent(occurrence: nil, defaultDate: defaultDate)
        case .edit(let occurrence, let defaultDate):
            editorContent(occurrence: occurrence, defaultDate: defaultDate)
        case .unresolved:
            unresolvedTarget
        }
    }

    private func editorContent(occurrence: PersonalEventOccurrenceDto?, defaultDate: String) -> some View {
        PersonalEventEditorContent(
            defaultDate: defaultDate,
            occurrence: occurrence,
            onSaved: {
                await onChanged()
                if !path.isEmpty { path.removeLast() }
            },
            onDeleted: {
                await onChanged()
                if !path.isEmpty { path.removeLast() }
            },
            onCancel: { if !path.isEmpty { path.removeLast() } }
        )
        .id(occurrence?.id ?? "new")
    }

    /// rowId が解決できないときは editor を開かない (旧実装の `guard let … else { return }` 相当)。
    /// 空の作成フォームに化けさせないため、push されていたら即座に一覧へ戻す。
    private var unresolvedTarget: some View {
        Color.clear
            .frame(height: 0)
            .onAppear { if !path.isEmpty { path.removeLast() } }
    }

    private enum EditorResolution {
        case create(defaultDate: String)
        case edit(occurrence: PersonalEventOccurrenceDto, defaultDate: String)
        case unresolved
    }

    private func resolveTarget(_ target: CalendarDayEditorTarget) -> EditorResolution {
        switch target {
        case .create(let date):
            return .create(defaultDate: date)
        case .edit(let rowId, let date):
            guard let occurrence = occurrences.first(where: { $0.id == rowId }) else { return .unresolved }
            return .edit(occurrence: occurrence, defaultDate: date)
        }
    }
}

enum PersonalDaySheetFormat {
    static func heading(_ date: String) -> String {
        guard let parsed = CalendarRange.parse(date) else { return date }
        let weekday = ["日", "月", "火", "水", "木", "金", "土"][CalendarRange.utcCalendar.component(.weekday, from: parsed) - 1]
        let month = CalendarRange.utcCalendar.component(.month, from: parsed)
        let day = CalendarRange.utcCalendar.component(.day, from: parsed)
        return "\(month)月\(day)日 (\(weekday))"
    }

    static func timeRange(startMinute: Int, endMinute: Int) -> String {
        "\(TimeFormatting.minutesToTime(startMinute))-\(TimeFormatting.minutesToTime(endMinute))"
    }

    static func occurrenceTime(_ occurrence: PersonalEventOccurrenceDto) -> String {
        let days = occurrence.days
        guard let first = days.first, let last = days.last else { return "終日" }
        if occurrence.isAllDay {
            if days.count <= 1 { return "終日" }
            return "\(shortDate(first.date)) - \(shortDate(last.date))"
        }
        if days.count <= 1 {
            return timeRange(startMinute: first.startMinute, endMinute: first.endMinute)
        }
        return "\(shortDate(first.date)) \(TimeFormatting.minutesToTime(first.startMinute)) - \(shortDate(last.date)) \(TimeFormatting.minutesToTime(last.endMinute))"
    }

    static func shortDate(_ date: String) -> String {
        let parts = date.split(separator: "-")
        guard parts.count == 3 else { return date }
        return "\(Int(parts[1]) ?? 0)/\(Int(parts[2]) ?? 0)"
    }
}
