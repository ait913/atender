import SwiftUI

/// 授業変更 (振替) の作成シート。`DayDetailSheet` の `BottomSheet` の中身として使う
/// (`PersonalEventEditorContent` と同じ、シート自体は持たないコンテンツ view)。
struct ClassTransferSheet: View {
    let date: String
    let semesterId: String?
    let existingOccurrences: [OccurrenceDto]
    let targetIsSuspended: Bool
    let onSaved: () async -> Void

    @Environment(AppEnvironment.self) private var environment

    @State private var mode: ClassTransferMode = .moveDay
    @State private var timetable: UserTimetableDto?
    @State private var semesterStart: String?
    @State private var semesterEnd: String?
    @State private var isLoadingTimetable = true

    // 曜日ごと
    @State private var sourceDayOfWeek: Int?
    @State private var suspendSourceDate = true
    @State private var sourceDate = ""

    // コマごと
    @State private var courseId = ""
    @State private var periodIndexes: [Int] = []

    @State private var isPending = false
    @State private var errorText: String?

    private let weekdayShortLabels = ["日", "月", "火", "水", "木", "金", "土"]

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            Picker("", selection: $mode) {
                ForEach(ClassTransferMode.allCases, id: \.self) { item in
                    Text(item.label).tag(item)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            if isLoadingTimetable {
                ProgressView().frame(maxWidth: .infinity)
            } else if timetable == nil {
                Text("時間割がありません")
                    .font(.atenderSm)
                    .foregroundStyle(Color.textTertiary)
            } else {
                switch mode {
                case .moveDay: moveDaySection
                case .single: singleSection
                }
                if let errorText {
                    Text(errorText).font(.atenderSm).foregroundStyle(Color.statusAbsent)
                }
                AtenderButton(
                    title: mode == .moveDay ? "この日に反映" : "追加",
                    variant: .primary,
                    isLoading: isPending,
                    isEnabled: canSubmit
                ) { submit() }
            }
        }
        .task { await load() }
    }

    // MARK: - 曜日ごと

    private var moveDaySection: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            label("曜日")
            Picker("曜日", selection: sourceDayDisplayBinding) {
                ForEach(1...7, id: \.self) { display in
                    Text(weekdayShortLabels[DayConvention.displayToJs(display)]).tag(display)
                }
            }
            .pickerStyle(.segmented)

            label("この日に置く授業")
            if let message = moveDayMessage {
                Text(message).font(.atenderSm).foregroundStyle(Color.textTertiary)
            } else {
                ForEach(previewRows) { row in previewRowView(row) }
            }

            Toggle("元の日を休講にする", isOn: $suspendSourceDate)
                .font(.atenderSm)
                .foregroundStyle(Color.textSecondary)
            if suspendSourceDate {
                DatePicker("", selection: Binding(
                    get: { SemesterDateBinding.date(from: sourceDate) },
                    set: { sourceDate = SemesterDateBinding.string(from: $0) }
                ), in: semesterDateRange, displayedComponents: .date)
                .datePickerStyle(.compact)
                .labelsHidden()
            }
            if targetIsSuspended {
                Text("この日の休講は解除されます")
                    .font(.atenderXs)
                    .foregroundStyle(Color.textTertiary)
            }
        }
        .onChange(of: sourceDayOfWeek) { _, newValue in
            guard suspendSourceDate, let newValue, let semesterStart else { return }
            sourceDate = ClassTransferLogic.defaultSourceDate(targetDate: date, sourceDayOfWeek: newValue, semesterStart: semesterStart)
        }
    }

    private var sourceDayDisplayBinding: Binding<Int> {
        Binding(
            get: { sourceDayOfWeek.map(DayConvention.jsToDisplay) ?? 1 },
            set: { sourceDayOfWeek = DayConvention.displayToJs($0) }
        )
    }

    private var moveDayMessage: String? {
        guard let sourceDayOfWeek else { return "この曜日に授業はありません" }
        if sourceDayOfWeek == targetJsDay { return "この日と同じ曜日です" }
        if previewRows.isEmpty { return "この曜日に授業はありません" }
        return nil
    }

    // MARK: - コマごと

    private var singleSection: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            label("科目")
            Menu {
                ForEach(coursesWithMeetings) { course in
                    Button(course.name) { courseId = course.id; periodIndexes = [] }
                }
            } label: {
                HStack {
                    Text(selectedCourseName)
                        .font(.atenderBase)
                        .foregroundStyle(courseId.isEmpty ? Color.textSecondary : Color.textPrimary)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.atenderSm)
                        .foregroundStyle(Color.textSecondary)
                }
                .padding(Space.s3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.bgMuted)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            }

            label("時限")
            if let timetable {
                PeriodChips(value: $periodIndexes, periodCount: timetable.daySlots.count)
            }
            ForEach(previewRows) { row in previewRowView(row) }
        }
    }

    private var coursesWithMeetings: [CourseDto] {
        guard let timetable else { return [] }
        let ids = Set(timetable.meetings.map(\.courseId))
        return timetable.courses.filter { ids.contains($0.id) }
    }

    private var selectedCourseName: String {
        coursesWithMeetings.first { $0.id == courseId }?.name ?? "科目を選択"
    }

    // MARK: - 共通

    private func label(_ text: String) -> some View {
        Text(text)
            .font(.atenderSm)
            .fontWeight(.bold)
            .foregroundStyle(Color.textSecondary)
    }

    private func previewRowView(_ row: ClassTransferPreviewRow) -> some View {
        HStack {
            Text(periodLabel(row))
                .font(.atenderSm.weight(.bold))
                .foregroundStyle(Color.textPrimary)
            Text(row.courseName)
                .font(.atenderSm)
                .foregroundStyle(Color.textPrimary)
            Spacer()
            if let blockedBy = row.blockedBy {
                Text(blockedBy).font(.atenderXs).foregroundStyle(Color.statusAbsent)
            } else if let replaces = row.replaces {
                Text("→ \(replaces)").font(.atenderXs).foregroundStyle(Color.textSecondary)
            }
        }
    }

    private func periodLabel(_ row: ClassTransferPreviewRow) -> String {
        row.periodCount <= 1 ? "\(row.periodIndex)限" : "\(row.periodIndex)-\(row.periodIndex + row.periodCount - 1)限"
    }

    private var targetJsDay: Int? {
        guard let parsed = CalendarRange.parse(date) else { return nil }
        return CalendarRange.utcCalendar.component(.weekday, from: parsed) - 1
    }

    private var previewRows: [ClassTransferPreviewRow] {
        guard let timetable else { return [] }
        switch mode {
        case .moveDay:
            guard let sourceDayOfWeek, sourceDayOfWeek != targetJsDay else { return [] }
            return ClassTransferLogic.previewMoveDay(targetDate: date, sourceDayOfWeek: sourceDayOfWeek, timetable: timetable, existing: existingOccurrences)
        case .single:
            return ClassTransferLogic.previewSingle(periodIndexes: periodIndexes, courseId: courseId, timetable: timetable, existing: existingOccurrences)
        }
    }

    private var semesterDateRange: ClosedRange<Date> {
        let start = semesterStart.map(SemesterDateBinding.date(from:)) ?? Date.distantPast
        let end = semesterEnd.map(SemesterDateBinding.date(from:)) ?? Date.distantFuture
        return start...end
    }

    private var canSubmit: Bool {
        guard !isPending, timetable != nil else { return false }
        switch mode {
        case .moveDay:
            guard let sourceDayOfWeek, sourceDayOfWeek != targetJsDay else { return false }
            if suspendSourceDate && sourceDate.isEmpty { return false }
            return ClassTransferLogic.canSubmit(previewRows)
        case .single:
            guard !courseId.isEmpty, !periodIndexes.isEmpty else { return false }
            return ClassTransferLogic.canSubmit(previewRows)
        }
    }

    private func load() async {
        isLoadingTimetable = true
        defer { isLoadingTimetable = false }
        do {
            let timetables = try await environment.timetableRepository.userTimetables()
            let semesters = try await environment.semesterRepository.semesters()
            let resolved = semesterId.flatMap { id in timetables.first { $0.semesterId == id } } ?? timetables.first
            timetable = resolved
            if let resolved {
                let semester = semesters.first { $0.id == resolved.semesterId }
                semesterStart = semester?.startDate
                semesterEnd = semester?.endDate
                if sourceDayOfWeek == nil {
                    sourceDayOfWeek = ClassTransferLogic.defaultSourceDay(targetDate: date, meetings: resolved.meetings)
                }
                if let sourceDayOfWeek, let semesterStart {
                    sourceDate = ClassTransferLogic.defaultSourceDate(targetDate: date, sourceDayOfWeek: sourceDayOfWeek, semesterStart: semesterStart)
                }
            }
        } catch {
            errorText = error.userFacingMessage
        }
    }

    private func submit() {
        guard timetable != nil else { return }
        isPending = true
        errorText = nil
        let input: ClassTransferCreateInput
        switch mode {
        case .moveDay:
            input = ClassTransferCreateInput(
                kind: .moveDay,
                date: date,
                semesterId: semesterId,
                sourceDayOfWeek: sourceDayOfWeek,
                suspendSourceDate: suspendSourceDate,
                sourceDate: suspendSourceDate ? sourceDate : nil,
                liftTargetSuspension: targetIsSuspended
            )
        case .single:
            input = ClassTransferCreateInput(
                kind: .single,
                date: date,
                semesterId: semesterId,
                courseId: courseId,
                periodIndexes: Array(Set(periodIndexes)).sorted(),
                liftTargetSuspension: targetIsSuspended
            )
        }
        Task {
            do {
                _ = try await environment.dayRepository.createClassTransfer(input)
                isPending = false
                await onSaved()
            } catch {
                isPending = false
                errorText = mappedErrorMessage(error)
            }
        }
    }

    /// PERIOD_CONFLICT / DISPLACED_HAS_RECORD / DAY_SUSPENDED は日本語化。
    /// details (conflictPeriod / meetingId / courseName) は wire (`ErrorResponse`) に
    /// 乗っていないため、動的な値は出さない。他は `error.userFacingMessage` に委譲
    private func mappedErrorMessage(_ error: Error) -> String {
        if let apiError = error as? APIError, case let .api(_, code, _) = apiError {
            switch code {
            case "PERIOD_CONFLICT": return "その時限には既に授業変更があります"
            case "DISPLACED_HAS_RECORD": return "出欠記録がある授業を置き換えることはできません。先に記録を消してください"
            case "DAY_SUSPENDED": return "この日は休講です"
            default: break
            }
        }
        return error.userFacingMessage
    }
}
