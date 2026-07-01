import SwiftUI

@MainActor
@Observable
final class SelfTimetableViewModel {
    @ObservationIgnored private let environment: AppEnvironment
    var me: MeResponse?
    var semesters: [SemesterDto] = []
    var timetables: [UserTimetableDto] = []
    var createdTimetable: UserTimetableDto?
    var isLoading = false

    init(environment: AppEnvironment) {
        self.environment = environment
    }

    let defaultSlots: [DaySlotDto] = [
        .init(periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false),
        .init(periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730, isBreak: false),
        .init(periodIndex: 3, label: "3限", startMinute: 780, endMinute: 870, isBreak: false),
        .init(periodIndex: 4, label: "4限", startMinute: 880, endMinute: 970, isBreak: false),
        .init(periodIndex: 5, label: "5限", startMinute: 980, endMinute: 1070, isBreak: false),
    ]

    func load() async {
        isLoading = true
        defer { isLoading = false }
        if let cached: MeResponse = environment.queryClient.data(for: .me(), as: MeResponse.self) { me = cached }
        async let meResult = environment.meRepository.me()
        async let semestersResult = environment.semesterRepository.semesters()
        async let timetablesResult = environment.timetableRepository.userTimetables()
        me = try? await meResult
        semesters = (try? await semestersResult) ?? semesters
        timetables = (try? await timetablesResult) ?? timetables
    }

    func reloadTimetables() async {
        timetables = (try? await environment.timetableRepository.userTimetables(force: true)) ?? timetables
    }

    func selected(semesterId: String?) -> UserTimetableDto? {
        timetables.first { $0.semesterId == semesterId }
    }

    func emptyTimetable(semesterId: String?) -> UserTimetableDto? {
        let fallback = semesterId ?? me?.user.defaultSemesterId ?? semesters.first?.id
        guard let fallback else { return nil }
        return UserTimetableDto(
            id: "",
            userId: me?.user.id ?? "",
            semesterId: fallback,
            title: "自分の時間割",
            sourceTemplateId: nil,
            daysOfWeek: [1, 2, 3, 4, 5],
            daySlots: defaultSlots,
            courses: [],
            meetings: [],
            createdAt: "",
            updatedAt: ""
        )
    }

    func display(semesterId: String?) -> UserTimetableDto? {
        selected(semesterId: semesterId) ?? createdTimetable ?? emptyTimetable(semesterId: semesterId)
    }

    func ensureTimetable(semesterId: String?) async -> UserTimetableDto? {
        if let selected = selected(semesterId: semesterId) { return selected }
        if let createdTimetable { return createdTimetable }
        guard let empty = emptyTimetable(semesterId: semesterId) else { return nil }
        let input = UserTimetableCreateInput(
            semesterId: empty.semesterId,
            title: "自分の時間割",
            description: nil,
            year: nil,
            term: nil,
            daySlots: defaultSlots.map { .init(periodIndex: $0.periodIndex, label: $0.label, startMinute: $0.startMinute, endMinute: $0.endMinute, isBreak: $0.isBreak) },
            courses: [],
            meetings: []
        )
        if let created = try? await environment.timetableRepository.createUserTimetable(input) {
            createdTimetable = created
            await reloadTimetables()
            return created
        }
        return nil
    }

    func eventInputs(for timetable: UserTimetableDto) -> [TimetableEventInput] {
        timetable.meetings.map { meeting in
            let course = timetable.courses.first { $0.id == meeting.courseId }
            return TimetableEventInput(
                id: meeting.id,
                dayOfWeek: DayConvention.jsToDisplay(meeting.dayOfWeek),
                startPeriodIndex: meeting.startPeriodIndex,
                periodCount: meeting.periodCount,
                color: course?.color ?? "#F97316",
                title: course?.name ?? "授業",
                subtitle: meeting.room,
                mergeKey: meeting.courseId
            )
        }
    }

    func deleteMeeting(_ meeting: MeetingDto) async {
        try? await environment.timetableRepository.deleteMeeting(id: meeting.id)
        await reloadTimetables()
    }
}

struct SelfTimetableView: View {
    @Environment(AppEnvironment.self) private var environment
    @Binding var semesterId: String?
    @State private var viewModel: SelfTimetableViewModel?
    @State private var sheet: (dayOfWeekJs: Int, period: Int)?
    @State private var detailMeeting: MeetingDto?
    @State private var editMeeting: MeetingDto?
    @State private var settingsOpen = false

    var body: some View {
        let model = viewModel
        let display = model?.display(semesterId: semesterId)
        VStack(spacing: Space.s3) {
            if model?.isLoading == true {
                Skeleton(width: 128, height: 20, radius: Radius.full)
                Skeleton(width: nil, height: 360, radius: Radius.md)
            } else if let model, let display {
                HomeSemesterPicker(
                    semesterId: $semesterId,
                    trailing: AnyView(settingsButton)
                )
                TimetableGrid(
                    daySlots: display.daySlots,
                    events: model.eventInputs(for: display),
                    days: DayConvention.resolveDisplayDays(daysOfWeek: display.daysOfWeek, meetings: display.meetings),
                    onEventTap: { id in detailMeeting = display.meetings.first { $0.id == id } },
                    onEmptyCellTap: { displayDow, period in
                        Task {
                            if await model.ensureTimetable(semesterId: semesterId) != nil {
                                sheet = (DayConvention.displayToJs(displayDow), period)
                            }
                        }
                    }
                )
            } else {
                Panel { Text("先に学期を作成してください。").foregroundStyle(Color.textSecondary) }
            }
        }
        .task {
            if viewModel == nil { viewModel = SelfTimetableViewModel(environment: environment) }
            await viewModel?.load()
        }
        .background(sheets(display: display, model: model))
    }

    private var settingsButton: some View {
        Button { settingsOpen = true } label: {
            Image(systemName: "gearshape")
                .font(.atenderSm)
                .foregroundStyle(Color.textSecondary)
                .frame(width: 36, height: 36)
                .background(Color.textPrimary.opacity(0.08))
                .clipShape(Circle())
        }
        .accessibilityLabel("時間割の設定")
    }

    @ViewBuilder
    private func sheets(display: UserTimetableDto?, model: SelfTimetableViewModel?) -> some View {
        if let timetable = model?.selected(semesterId: semesterId) ?? model?.createdTimetable {
            MeetingEditModal(
                isPresented: Binding(get: { sheet != nil }, set: { if !$0 { sheet = nil } }),
                timetable: timetable,
                mode: .create,
                initialDayOfWeekJs: sheet?.dayOfWeekJs ?? DayConvention.todayDayOfWeekJs(),
                initialPeriod: sheet?.period ?? 1,
                meeting: nil,
                onSaved: { Task { await model?.reloadTimetables() } }
            )
        }
        if let display {
            let detailCourse = detailMeeting.flatMap { meeting in display.courses.first { $0.id == meeting.courseId } }
            let detailSlots = detailMeeting.map { meeting in
                display.daySlots.filter { $0.periodIndex >= meeting.startPeriodIndex && $0.periodIndex < meeting.startPeriodIndex + meeting.periodCount }
            } ?? []
            MeetingDetailSheet(
                isPresented: Binding(get: { detailMeeting != nil }, set: { if !$0 { detailMeeting = nil } }),
                meeting: detailMeeting,
                course: detailCourse,
                slots: detailSlots,
                onEdit: {
                    editMeeting = detailMeeting
                    detailMeeting = nil
                },
                onDelete: {
                    if let meeting = detailMeeting {
                        Task { await model?.deleteMeeting(meeting); detailMeeting = nil }
                    }
                }
            )
            MeetingEditModal(
                isPresented: Binding(get: { editMeeting != nil }, set: { if !$0 { editMeeting = nil } }),
                timetable: display,
                mode: .edit,
                initialDayOfWeekJs: nil,
                initialPeriod: nil,
                meeting: editMeeting,
                onSaved: { Task { await model?.reloadTimetables() } }
            )
        }
        TimetableSettingsSheet(
            isPresented: $settingsOpen,
            timetable: model?.selected(semesterId: semesterId) ?? model?.createdTimetable,
            onSaved: { Task { await model?.reloadTimetables() } }
        )
    }
}
