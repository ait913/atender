import SwiftUI

enum PersonalEventTimeMath {
    nonisolated(unsafe) static let iso: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static func parse(_ value: String) -> Date? {
        iso.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    static func string(_ date: Date) -> String {
        iso.string(from: date)
    }

    static func jstDayStart(_ date: Date) -> Date {
        SchoolClock.calendar.startOfDay(for: date)
    }

    /// 終日の「終了日 (包含)」= end - 1ms の JST 日
    static func inclusiveEndDay(end: Date) -> Date {
        jstDayStart(end.addingTimeInterval(-0.001))
    }

    /// 終日の包含終了日を排他 end に戻す
    static func exclusiveEnd(fromInclusiveDay day: Date) -> Date {
        SchoolClock.calendar.date(byAdding: .day, value: 1, to: jstDayStart(day)) ?? day
    }
}

struct PersonalEventEditorContent: View {
    let defaultDate: String
    var occurrence: PersonalEventOccurrenceDto?
    let onSaved: () async -> Void
    let onDeleted: () async -> Void
    let onCancel: () -> Void
    @Environment(AppEnvironment.self) private var environment

    @State private var title = ""
    @State private var isAllDay = false
    @State private var startDate = Date()
    @State private var endDate = Date()
    @State private var spec: RecurrenceSpecDto?
    @State private var originalSpec: RecurrenceSpecDto?
    @State private var location = ""
    @State private var note = ""
    @State private var color = "#12B172"
    @State private var isPending = false
    @State private var errorMessage: String?
    @State private var scopePrompt = false
    @State private var pendingIsDelete = false
    @State private var didInitialize = false

    private let colors = ["#12B172", "#56D8C3", "#568CFC", "#A978FA", "#FC6ABF", "#FD728E"]

    private var isEditing: Bool { occurrence != nil }
    private var isRecurring: Bool { occurrence?.isRecurringOccurrence == true }
    private var specChanged: Bool { spec != originalSpec }
    private var allowsSingle: Bool { pendingIsDelete ? true : !specChanged }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            field("タイトル") {
                TextField("タイトル", text: $title)
                    .textFieldStyle(.atender)
                    .onChange(of: title) { _, value in title = String(value.prefix(100)) }
            }
            Toggle("終日", isOn: $isAllDay)
                .font(.atenderSm)
                .foregroundStyle(Color.textSecondary)
                .onChange(of: isAllDay) { _, _ in normalizeDates() }
            field("開始") {
                DatePicker("", selection: $startDate, displayedComponents: isAllDay ? [.date] : [.date, .hourAndMinute])
                    .datePickerStyle(.compact)
                    .labelsHidden()
            }
            field("終了") {
                DatePicker("", selection: $endDate, displayedComponents: isAllDay ? [.date] : [.date, .hourAndMinute])
                    .datePickerStyle(.compact)
                    .labelsHidden()
            }
            RecurrenceSpecPicker(spec: $spec, start: startDate)
            field("場所") {
                TextField("場所", text: $location)
                    .textFieldStyle(.atender)
                    .onChange(of: location) { _, value in location = String(value.prefix(200)) }
            }
            field("メモ") {
                TextField("メモ", text: $note, axis: .vertical)
                    .lineLimit(3...6)
                    .textFieldStyle(.atender)
                    .onChange(of: note) { _, value in note = String(value.prefix(500)) }
            }
            field("色") {
                HStack(spacing: Space.s3) {
                    ForEach(colors, id: \.self) { candidate in
                        Button { color = candidate } label: {
                            Circle()
                                .fill(Color(hexString: candidate))
                                .frame(width: 34, height: 34)
                                .overlay(Circle().stroke(color == candidate ? Color.textPrimary : Color.clear, lineWidth: 2))
                        }
                        .buttonStyle(.plain)
                    }
                    ColorPicker("", selection: Binding(
                        get: { Color(hexString: color) },
                        set: { color = $0.toHexString() }
                    ))
                    .labelsHidden()
                }
            }
            if let errorMessage {
                Text(errorMessage).font(.atenderSm).foregroundStyle(Color.statusAbsent)
            }
            AtenderButton(title: "保存", variant: .primary, isLoading: isPending, isEnabled: canSave) {
                submitSave()
            }
            if isEditing {
                AtenderButton(title: "削除", variant: .ghost, isEnabled: !isPending) {
                    submitDelete()
                }
                .foregroundStyle(Color.statusAbsent)
            }
        }
        .confirmationDialog(
            pendingIsDelete ? "繰り返しの予定を削除" : "繰り返しの予定を変更",
            isPresented: $scopePrompt,
            titleVisibility: .visible
        ) {
            if allowsSingle {
                Button("この予定のみ", role: pendingIsDelete ? .destructive : nil) { commit("single") }
            }
            Button("これ以降すべて", role: pendingIsDelete ? .destructive : nil) { commit("future") }
            Button("すべての予定", role: pendingIsDelete ? .destructive : nil) { commit("all") }
            Button("キャンセル", role: .cancel) { }
        }
        .onAppear(perform: initialize)
    }

    private var canSave: Bool {
        if isPending { return false }
        if title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return false }
        if isAllDay {
            return PersonalEventTimeMath.jstDayStart(endDate) >= PersonalEventTimeMath.jstDayStart(startDate)
        }
        return endDate > startDate
    }

    private func initialize() {
        guard !didInitialize else { return }
        didInitialize = true
        if let occurrence {
            title = occurrence.title
            isAllDay = occurrence.isAllDay
            let start = PersonalEventTimeMath.parse(occurrence.start) ?? Date()
            let end = PersonalEventTimeMath.parse(occurrence.end) ?? start
            startDate = start
            endDate = occurrence.isAllDay ? PersonalEventTimeMath.inclusiveEndDay(end: end) : end
            spec = occurrence.recurrenceSpec
            originalSpec = occurrence.recurrenceSpec
            location = occurrence.location ?? ""
            note = occurrence.note ?? ""
            color = occurrence.color ?? colors[0]
        } else {
            let day = CalendarRange.parse(defaultDate) ?? Date()
            let base = SchoolClock.calendar.date(bySettingHour: 9, minute: 0, second: 0, of: PersonalEventTimeMath.jstDayStart(day)) ?? day
            startDate = base
            endDate = base.addingTimeInterval(3600)
            spec = nil
            originalSpec = nil
        }
        errorMessage = nil
    }

    private func normalizeDates() {
        if isAllDay {
            startDate = PersonalEventTimeMath.jstDayStart(startDate)
            endDate = PersonalEventTimeMath.jstDayStart(endDate)
            if endDate < startDate { endDate = startDate }
        } else if endDate <= startDate {
            endDate = startDate.addingTimeInterval(3600)
        }
    }

    private var wireStart: String {
        PersonalEventTimeMath.string(isAllDay ? PersonalEventTimeMath.jstDayStart(startDate) : startDate)
    }

    private var wireEnd: String {
        PersonalEventTimeMath.string(isAllDay ? PersonalEventTimeMath.exclusiveEnd(fromInclusiveDay: endDate) : endDate)
    }

    private func submitSave() {
        pendingIsDelete = false
        if isRecurring {
            scopePrompt = true
        } else {
            commit("all")
        }
    }

    private func submitDelete() {
        pendingIsDelete = true
        if isRecurring {
            scopePrompt = true
        } else {
            commit("all")
        }
    }

    private func commit(_ scope: String) {
        Task {
            isPending = true
            defer { isPending = false }
            do {
                if pendingIsDelete {
                    try await deleteEvent(scope: scope)
                    await onDeleted()
                } else {
                    try await saveEvent(scope: scope)
                    await onSaved()
                }
            } catch {
                errorMessage = error.userFacingMessage
            }
        }
    }

    private var recurrenceInput: PersonalEventRecurrenceInput? {
        guard let spec else { return nil }
        return PersonalEventRecurrenceInput(spec: spec)
    }

    private func saveEvent(scope: String) async throws {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if let occurrence {
            var input = PersonalEventUpdateInput(
                title: trimmedTitle,
                start: wireStart,
                end: wireEnd,
                isAllDay: isAllDay,
                location: location.isEmpty ? nil : location,
                note: note.isEmpty ? nil : note,
                color: color,
                editScope: scope,
                originalDate: occurrence.occurrenceDate
            )
            if scope == "all" {
                if spec == nil {
                    input.clearRecurrence = originalSpec != nil
                } else if specChanged {
                    input.recurrence = recurrenceInput
                }
            }
            _ = try await environment.personalEventRepository.updatePersonalEvent(id: occurrence.seriesId, input)
        } else {
            _ = try await environment.personalEventRepository.createPersonalEvent(PersonalEventCreateInput(
                title: trimmedTitle,
                start: wireStart,
                end: wireEnd,
                isAllDay: isAllDay,
                location: location.isEmpty ? nil : location,
                note: note.isEmpty ? nil : note,
                color: color,
                recurrence: recurrenceInput
            ))
        }
    }

    private func deleteEvent(scope: String) async throws {
        guard let occurrence else { return }
        try await environment.personalEventRepository.deletePersonalEvent(
            id: occurrence.seriesId,
            scope: scope,
            originalDate: occurrence.occurrenceDate,
            invalidateDate: occurrence.days.first?.date
        )
    }

    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text(label).font(.atenderSm.weight(.bold)).foregroundStyle(Color.textSecondary)
            content()
        }
    }
}
