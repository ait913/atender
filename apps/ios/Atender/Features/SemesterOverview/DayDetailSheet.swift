import SwiftUI

struct DayDetailSheet: View {
    let date: String
    let semesterId: String?
    let onChanged: () async -> Void
    let onClose: () -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var model: DayDetailViewModel?
    @State private var reason = ""
    @State private var editingEvent: PersonalEventDto?
    @State private var creatingEvent = false

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            if let model {
                if model.isLoading && model.detail == nil {
                    ProgressView().frame(maxWidth: .infinity)
                } else if let detail = model.detail {
                    suspensionSection(detail, model)
                    occurrencesSection(detail, model)
                    personalEventsSection(detail, model)
                }
                if let errorMessage = model.errorMessage {
                    Text(errorMessage).font(.atenderSm).foregroundStyle(Color.statusAbsent)
                }
            }
        }
        .accessibilityIdentifier("day-detail-sheet")
        .task {
            if model == nil { model = DayDetailViewModel(env: environment, date: date, onChanged: onChanged) }
            await model?.load()
        }
        .background {
            BottomSheet(title: "予定を追加", isPresented: $creatingEvent, stackLevel: 2) {
                PersonalEventEditModalContent(date: date, event: nil, semesterId: semesterId) { event in
                    creatingEvent = false
                    Task { await afterEventSaved(event) }
                }
            }
            BottomSheet(title: "予定を編集", isPresented: Binding(
                get: { editingEvent != nil },
                set: { if !$0 { editingEvent = nil } }
            ), stackLevel: 2) {
                if let editingEvent {
                    PersonalEventEditModalContent(date: date, event: editingEvent, semesterId: semesterId) { event in
                        self.editingEvent = nil
                        Task { await afterEventSaved(event) }
                    }
                }
            }
        }
    }

    private func afterEventSaved(_ event: PersonalEventDto) async {
        await model?.load()
        await onChanged()
    }

    private func suspensionSection(_ detail: DayDetailDto, _ model: DayDetailViewModel) -> some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            if let suspension = detail.timetableSuspension {
                Text("休講中: \(suspension.reason ?? "理由なし")")
                    .font(.atenderSm.weight(.bold))
                    .foregroundStyle(Color.statusCancelled)
                AtenderButton(title: "休講を解除", variant: .ghost, size: .sm) {
                    Task { await model.deleteTimetableSuspension(id: suspension.id) }
                }
            } else {
                Text("この日を休講にする (時間割全体)")
                    .font(.atenderSm.weight(.bold))
                    .foregroundStyle(Color.textSecondary)
                TextField("理由", text: $reason)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: reason) { _, value in reason = String(value.prefix(100)) }
                AtenderButton(title: "この日を休講にする", variant: .primary, size: .sm) {
                    Task {
                        await model.createTimetableSuspension(reason: reason.trimmedNil)
                        reason = ""
                    }
                }
            }
        }
        .padding(Space.s3)
        .background(Color.bgMuted.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous))
    }

    private func occurrencesSection(_ detail: DayDetailDto, _ model: DayDetailViewModel) -> some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("授業 (\(detail.occurrences.count))")
                .font(.atenderBase.weight(.bold))
                .foregroundStyle(Color.textPrimary)
            if detail.occurrences.count > 0 && detail.timetableSuspension == nil {
                DayBulkAttendanceControl(
                    occurrenceCount: DayDetailLogic.occurrenceCount(detail),
                    unrecordedCount: DayDetailLogic.unrecordedCount(detail),
                    isPending: model.isMutating
                ) { status, mode in
                    Task { await model.bulkMark(status: status, mode: mode) }
                }
            }
            if detail.occurrences.isEmpty {
                Text("授業はありません").font(.atenderSm).foregroundStyle(Color.textTertiary)
            } else {
                let suspensions = Dictionary(uniqueKeysWithValues: detail.courseSuspensions.map { ($0.courseId, $0) })
                ForEach(detail.occurrences) { occurrence in
                    DayOccurrenceRow(
                        occurrence: occurrence,
                        timetableSuspended: detail.timetableSuspension != nil,
                        courseSuspension: suspensions[occurrence.courseId],
                        onPatch: { status in Task { await model.patchAttendance(occurrenceId: occurrence.id, status: status) } },
                        onDeleteAttendance: { Task { await model.deleteAttendance(occurrenceId: occurrence.id) } },
                        onCreateCourseSuspension: { Task { await model.createCourseSuspension(courseId: occurrence.courseId) } },
                        onDeleteCourseSuspension: { id in Task { await model.deleteCourseSuspension(courseId: occurrence.courseId, id: id) } }
                    )
                }
            }
        }
    }

    private func personalEventsSection(_ detail: DayDetailDto, _ model: DayDetailViewModel) -> some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            HStack {
                Text("予定 (\(detail.personalEvents.count))")
                    .font(.atenderBase.weight(.bold))
                    .foregroundStyle(Color.textPrimary)
                Spacer()
                AtenderButton(title: "追加", variant: .secondary, size: .sm) { creatingEvent = true }
                    .frame(width: 80)
            }
            if detail.personalEvents.isEmpty {
                Text("予定はありません").font(.atenderSm).foregroundStyle(Color.textTertiary)
            } else {
                ForEach(detail.personalEvents) { event in
                    HStack(spacing: Space.s2) {
                        Circle().fill(Color(hexString: event.color ?? "#10b981")).frame(width: 10, height: 10)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(event.title).font(.atenderSm.weight(.bold)).foregroundStyle(Color.textPrimary)
                            Text(event.isAllDay ? "終日" : "\(TimeFormatting.minutesToTime(event.startMinute ?? 0)) - \(TimeFormatting.minutesToTime(event.endMinute ?? 0))")
                                .font(.atenderXs)
                                .foregroundStyle(Color.textTertiary)
                        }
                        Spacer()
                        iconButton("pencil") { editingEvent = event }
                        iconButton("trash", danger: true) { Task { await model.deletePersonalEvent(id: event.id) } }
                    }
                    .padding(Space.s3)
                    .background(Color.bgElevated)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous).stroke(Color.borderSubtle, lineWidth: 1))
                }
            }
        }
    }

    private func iconButton(_ systemName: String, danger: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.atenderSm.weight(.bold))
                .foregroundStyle(danger ? Color.statusAbsent : Color.textSecondary)
                .frame(width: 32, height: 32)
                .background(Color.bgMuted)
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
    }
}

@MainActor
@Observable
final class DayDetailViewModel {
    @ObservationIgnored private let env: AppEnvironment
    @ObservationIgnored private let onChanged: () async -> Void
    let date: String
    private(set) var detail: DayDetailDto?
    private(set) var isLoading = false
    private(set) var isMutating = false
    var errorMessage: String?

    init(env: AppEnvironment, date: String, onChanged: @escaping () async -> Void) {
        self.env = env
        self.date = date
        self.onChanged = onChanged
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            detail = try await env.dayRepository.dayDetail(date: date, force: true)
        } catch {
            errorMessage = error.userFacingMessage
        }
    }

    func createTimetableSuspension(reason: String?) async { await mutate { _ = try await env.dayRepository.createTimetableSuspension(date: date, reason: reason) } }
    func deleteTimetableSuspension(id: String) async { await mutate { try await env.dayRepository.deleteTimetableSuspension(id: id, date: date) } }
    func patchAttendance(occurrenceId: String, status: AttendanceStatus) async { await mutate { try await env.dayRepository.patchAttendance(occurrenceId: occurrenceId, status: status) } }
    func deleteAttendance(occurrenceId: String) async { await mutate { try await env.dayRepository.deleteAttendance(occurrenceId: occurrenceId) } }
    func createCourseSuspension(courseId: String) async { await mutate { _ = try await env.dayRepository.createCourseSuspension(courseId: courseId, date: date, reason: nil) } }
    func deleteCourseSuspension(courseId: String, id: String) async { await mutate { try await env.dayRepository.deleteCourseSuspension(courseId: courseId, id: id) } }
    func bulkMark(status: AttendanceStatus, mode: BulkMode) async { await mutate { _ = try await env.dayRepository.bulkMark(dates: [date], status: status, mode: mode) } }
    func deletePersonalEvent(id: String) async { await mutate { try await env.personalEventRepository.deletePersonalEvent(id: id, date: date) } }

    private func mutate(_ operation: () async throws -> Void) async {
        isMutating = true
        defer { isMutating = false }
        do {
            try await operation()
            await load()
            await onChanged()
        } catch {
            env.toastCenter.show("保存できませんでした、もう一度試してください")
            errorMessage = error.userFacingMessage
        }
    }
}

struct DayBulkAttendanceControl: View {
    let occurrenceCount: Int
    let unrecordedCount: Int
    let isPending: Bool
    let onMark: (AttendanceStatus, BulkMode) -> Void

    var body: some View {
        let allRecorded = unrecordedCount == 0
        let mode = DayDetailLogic.bulkMode(unrecordedCount: unrecordedCount)
        HStack(spacing: Space.s2) {
            AtenderButton(
                title: allRecorded ? "全部 出席に上書き" : "全部出席にする (\(unrecordedCount))",
                variant: allRecorded ? .secondary : .primary,
                size: .sm,
                isLoading: isPending,
                isEnabled: occurrenceCount > 0
            ) { onMark(.present, mode) }
            Menu {
                ForEach([AttendanceStatus.absent, .excused, .tardy, .earlyLeave], id: \.self) { status in
                    Button(allRecorded ? "全部 \(status.label) に上書き" : "全部 \(status.label) (\(unrecordedCount))") {
                        onMark(status, mode)
                    }
                }
            } label: {
                Image(systemName: "chevron.down")
                    .font(.atenderSm.weight(.bold))
                    .foregroundStyle(Color.textPrimary)
                    .frame(width: 40, height: 40)
                    .background(Color.bgElevated)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(Color.borderDefault, lineWidth: 1))
            }
            .disabled(isPending || occurrenceCount == 0)
        }
    }
}

struct DayOccurrenceRow: View {
    let occurrence: OccurrenceDto
    let timetableSuspended: Bool
    let courseSuspension: CourseSuspensionDto?
    let onPatch: (AttendanceStatus) -> Void
    let onDeleteAttendance: () -> Void
    let onCreateCourseSuspension: () -> Void
    let onDeleteCourseSuspension: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(occurrence.periodIndex)限 \(occurrence.courseName)")
                        .font(.atenderSm.weight(.bold))
                        .foregroundStyle(Color.textPrimary)
                    Text("\(TimeFormatting.minutesToTime(occurrence.startMinute)) - \(TimeFormatting.minutesToTime(occurrence.endMinute))")
                        .font(.atenderXs)
                        .foregroundStyle(Color.textTertiary)
                }
                Spacer()
                if timetableSuspended {
                    badge("休講中 (時間割全体)")
                } else if courseSuspension != nil {
                    badge("科目休講中")
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Space.s2) {
                    statusButton("未", active: occurrence.status == nil, disabled: disabled, action: onDeleteAttendance)
                    ForEach(statuses, id: \.0) { status, label in
                        statusButton(label, active: occurrence.status == status, disabled: disabled) { onPatch(status) }
                    }
                    if let suspension = courseSuspension {
                        statusButton("科目休講解除", active: false, disabled: timetableSuspended) { onDeleteCourseSuspension(suspension.id) }
                    } else {
                        statusButton("科目休講", active: false, disabled: timetableSuspended, action: onCreateCourseSuspension)
                    }
                }
            }
        }
        .padding(Space.s3)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.timetableCell, style: .continuous).stroke(Color.borderSubtle, lineWidth: 1))
    }

    private var disabled: Bool { timetableSuspended || courseSuspension != nil }
    private var statuses: [(AttendanceStatus, String)] {
        [(.present, "出"), (.absent, "欠"), (.excused, "公"), (.tardy, "遅"), (.earlyLeave, "早"), (.cancelled, "休")]
    }

    private func statusButton(_ label: String, active: Bool, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.atenderXs.weight(.bold))
                .foregroundStyle(active ? Color.textOnAccent : Color.textSecondary)
                .padding(.horizontal, Space.s3)
                .frame(height: 30)
                .background(active ? Color.accent500 : Color.bgElevated)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(Color.borderDefault, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.45 : 1)
    }

    private func badge(_ text: String) -> some View {
        Text(text)
            .font(.atenderXs.weight(.bold))
            .foregroundStyle(Color.statusCancelled)
            .padding(.horizontal, Space.s2)
            .frame(height: 24)
            .background(Color.statusCancelled.opacity(0.16))
            .clipShape(Capsule())
    }
}

private extension String {
    var trimmedNil: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
