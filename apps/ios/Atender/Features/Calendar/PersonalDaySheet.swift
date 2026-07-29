import SwiftUI

struct PersonalDaySheet: View {
    let date: String
    let meetings: [CalendarEvent]
    let occurrences: [PersonalEventOccurrenceDto]
    let onChanged: () async -> Void
    let onClose: () -> Void

    enum Mode: Equatable {
        case list
        case editor(EditorTarget)
    }

    struct EditorTarget: Equatable {
        var occurrence: PersonalEventOccurrenceDto?
        var defaultDate: String
    }

    @State private var mode: Mode = .list

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            switch mode {
            case .list:
                listContent
            case .editor(let target):
                editorContent(target)
            }
        }
        .accessibilityIdentifier("personal-day-sheet")
    }

    // MARK: - list

    @ViewBuilder
    private var listContent: some View {
        Text(PersonalDaySheetFormat.heading(date))
            .font(.atender2xl.weight(.bold))
            .foregroundStyle(Color.textPrimary)

        if !meetings.isEmpty {
            section("授業 (\(meetings.count))") {
                ForEach(meetings) { meeting in
                    row(color: meeting.color, title: meeting.title,
                        detail: PersonalDaySheetFormat.timeRange(startMinute: meeting.startMinute, endMinute: meeting.endMinute),
                        meta: nil, showsRecurrence: false, onTap: nil, onDelete: nil)
                }
            }
        }

        section("予定 (\(occurrences.count))") {
            if occurrences.isEmpty {
                Text("予定はありません")
                    .font(.footnote)
                    .foregroundStyle(Color.textTertiary)
            } else {
                ForEach(occurrences) { occurrence in
                    row(
                        color: occurrence.color ?? "#8b5cf6",
                        title: occurrence.title,
                        detail: PersonalDaySheetFormat.occurrenceTime(occurrence),
                        meta: occurrence.location,
                        showsRecurrence: occurrence.isRecurringOccurrence,
                        onTap: { mode = .editor(EditorTarget(occurrence: occurrence, defaultDate: date)) },
                        onDelete: { mode = .editor(EditorTarget(occurrence: occurrence, defaultDate: date)) }
                    )
                }
            }
        }

        AtenderButton(title: "＋ 予定を追加", variant: .primary) {
            mode = .editor(EditorTarget(occurrence: nil, defaultDate: date))
        }
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text(title).font(.footnote).foregroundStyle(Color.textSecondary)
            content()
        }
    }

    @ViewBuilder
    private func row(
        color: String,
        title: String,
        detail: String,
        meta: String?,
        showsRecurrence: Bool,
        onTap: (() -> Void)?,
        onDelete: (() -> Void)?
    ) -> some View {
        let body = HStack(alignment: .top, spacing: Space.s3) {
            Capsule().fill(Color(hexString: color)).frame(width: 2)
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(title).font(.atenderSm.weight(.semibold)).foregroundStyle(Color.textPrimary).lineLimit(1)
                    Spacer()
                    Text(detail).font(.footnote).foregroundStyle(Color.textSecondary)
                }
                if showsRecurrence || meta != nil {
                    HStack(spacing: Space.s1) {
                        if showsRecurrence {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.caption2)
                                .foregroundStyle(Color.textSecondary)
                        }
                        if let meta, !meta.isEmpty {
                            Text(meta).font(.footnote).foregroundStyle(Color.textSecondary).lineLimit(1)
                        }
                    }
                }
            }
        }
        .padding(Space.s3)
        .frame(minHeight: 44)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.bgMuted)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))

        if let onTap {
            Button(action: onTap) { body }
                .buttonStyle(.plain)
                .contentShape(Rectangle())
        } else {
            body
        }
    }

    // MARK: - editor

    @ViewBuilder
    private func editorContent(_ target: EditorTarget) -> some View {
        HStack(spacing: Space.s1) {
            Button {
                mode = .list
            } label: {
                HStack(spacing: 2) {
                    Image(systemName: "chevron.left")
                    Text("予定")
                }
                .font(.atenderSm)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Spacer()
        }
        Text(target.occurrence == nil ? "予定を追加" : "予定を編集")
            .font(.atender2xl.weight(.bold))
            .foregroundStyle(Color.textPrimary)
        PersonalEventEditorContent(
            defaultDate: target.defaultDate,
            occurrence: target.occurrence,
            onSaved: {
                await onChanged()
                mode = .list
            },
            onDeleted: {
                await onChanged()
                mode = .list
            },
            onCancel: { mode = .list }
        )
        .id(target.occurrence?.id ?? "new")
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
