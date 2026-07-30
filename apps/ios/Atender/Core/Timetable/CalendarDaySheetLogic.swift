import Foundation

enum CalendarDayEditorTarget: Hashable {
    case create(date: String)
    case edit(rowId: String, date: String)
}

enum CalendarDayIntent: Equatable {
    case view
    case create
}

struct CalendarDayRow: Identifiable, Equatable {
    let id: String
    let colorHex: String
    let title: String
    let detail: String
    let meta: String?
    let showsRecurrence: Bool
    let editorTarget: CalendarDayEditorTarget?
}

struct CalendarDaySection: Identifiable, Equatable {
    let id: String
    let title: String
    let rows: [CalendarDayRow]
    let emptyText: String?
}

enum CalendarDaySheetLogic {
    static func initialPath(intent: CalendarDayIntent, date: String) -> [CalendarDayEditorTarget] {
        switch intent {
        case .view:
            return []
        case .create:
            return [.create(date: date)]
        }
    }

    static func personalSections(
        date: String,
        meetings: [CalendarEvent],
        occurrences: [PersonalEventOccurrenceDto]
    ) -> [CalendarDaySection] {
        var sections: [CalendarDaySection] = []
        let meetingRows = meetings
            .filter { $0.kind == .meeting }
            .map { event in
                CalendarDayRow(
                    id: event.id,
                    colorHex: event.color,
                    title: event.title,
                    detail: PersonalDaySheetFormat.timeRange(startMinute: event.startMinute, endMinute: event.endMinute),
                    meta: nil,
                    showsRecurrence: false,
                    editorTarget: nil
                )
            }
        if !meetingRows.isEmpty {
            sections.append(CalendarDaySection(
                id: "meetings",
                title: "授業 (\(meetingRows.count))",
                rows: meetingRows,
                emptyText: nil
            ))
        }

        let eventRows = occurrences.map { occurrence in
            CalendarDayRow(
                id: occurrence.id,
                colorHex: occurrence.color ?? "#8b5cf6",
                title: occurrence.title,
                detail: PersonalDaySheetFormat.occurrenceTime(occurrence),
                meta: occurrence.location,
                showsRecurrence: occurrence.isRecurringOccurrence,
                editorTarget: .edit(rowId: occurrence.id, date: date)
            )
        }
        sections.append(CalendarDaySection(
            id: "events",
            title: "予定 (\(eventRows.count))",
            rows: eventRows,
            emptyText: "予定はありません"
        ))
        return sections
    }

    static func roomSections(date: String, events: [CalendarEvent]) -> [CalendarDaySection] {
        let roomRows = events
            .filter { $0.kind == .roomEvent }
            .map { event in
                CalendarDayRow(
                    id: event.id,
                    colorHex: event.color,
                    title: event.title,
                    detail: PersonalDaySheetFormat.timeRange(startMinute: event.startMinute, endMinute: event.endMinute),
                    meta: event.subtitle,
                    showsRecurrence: false,
                    editorTarget: .edit(rowId: event.id, date: date)
                )
            }
        var sections = [
            CalendarDaySection(
                id: "events",
                title: "予定 (\(roomRows.count))",
                rows: roomRows,
                emptyText: "予定はありません"
            )
        ]

        let memberRows = events
            .filter { $0.kind == .meeting }
            .map { event in
                CalendarDayRow(
                    id: event.id,
                    colorHex: event.color,
                    title: event.title,
                    detail: PersonalDaySheetFormat.timeRange(startMinute: event.startMinute, endMinute: event.endMinute),
                    meta: event.subtitle,
                    showsRecurrence: false,
                    editorTarget: nil
                )
            }
        if !memberRows.isEmpty {
            sections.append(CalendarDaySection(
                id: "members",
                title: "メンバーの授業 (\(memberRows.count))",
                rows: memberRows,
                emptyText: nil
            ))
        }
        return sections
    }

    static func editorTitle(_ target: CalendarDayEditorTarget) -> String {
        switch target {
        case .create:
            return "予定を追加"
        case .edit:
            return "予定を編集"
        }
    }
}
