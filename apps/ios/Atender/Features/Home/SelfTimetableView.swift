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
                color: course?.color ?? "#1E96E6",
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
    @Binding var showSettings: Bool
    let available: CGFloat
    @State private var viewModel: SelfTimetableViewModel?
    @State private var activeSheet: TimetableActiveSheet?

    private enum TimetableActiveSheet: Identifiable {
        case create(dayOfWeekJs: Int, period: Int)
        case detail(MeetingDto)
        case edit(MeetingDto)
        case settings

        var id: String {
            switch self {
            case .create(let dayOfWeekJs, let period):
                return "create-\(dayOfWeekJs)-\(period)"
            case .detail(let meeting):
                return "detail-\(meeting.id)"
            case .edit(let meeting):
                return "edit-\(meeting.id)"
            case .settings:
                return "settings"
            }
        }
    }

    var body: some View {
        let model = viewModel
        let display = model?.display(semesterId: semesterId)
        VStack(spacing: Space.s3) {
            if model?.isLoading == true {
                Skeleton(width: 128, height: 20, radius: Radius.full)
                Skeleton(width: nil, height: 360, radius: Radius.md)
            } else if let model, let display {
                ScrollView {
                    TimetableGrid(
                        daySlots: display.daySlots,
                        events: model.eventInputs(for: display),
                        days: DayConvention.resolveDisplayDays(daysOfWeek: display.daysOfWeek, meetings: display.meetings),
                        onEventTap: { id in
                            if let meeting = display.meetings.first(where: { $0.id == id }) {
                                activeSheet = .detail(meeting)
                            }
                        },
                        onEmptyCellTap: { displayDow, period in
                            Task {
                                if await model.ensureTimetable(semesterId: semesterId) != nil {
                                    activeSheet = .create(dayOfWeekJs: DayConvention.displayToJs(displayDow), period: period)
                                }
                            }
                        },
                        available: available,
                        todayDisplayDay: SchoolClock.displayDay(),
                        currentPeriodIndex: TimetableGridLayout.currentPeriodIndex(daySlots: display.daySlots, nowMinute: SchoolClock.nowMinute())
                    )
                }
                .scrollBounceBehavior(.basedOnSize)
                .scrollClipDisabled()
            } else {
                Panel { Text("先に学期を作成してください。").foregroundStyle(Color.textSecondary) }
            }
        }
        .task {
            if viewModel == nil { viewModel = SelfTimetableViewModel(environment: environment) }
            await viewModel?.load()
        }
        .onChange(of: showSettings) { _, newValue in
            if newValue { activeSheet = .settings }
        }
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .create(let dayOfWeekJs, let period):
                if let timetable = model?.selected(semesterId: semesterId) ?? model?.createdTimetable {
                    MeetingEditModal(
                        isPresented: activeSheetBinding,
                        timetable: timetable,
                        mode: .create,
                        initialDayOfWeekJs: dayOfWeekJs,
                        initialPeriod: period,
                        meeting: nil,
                        onSaved: { Task { await model?.reloadTimetables() } }
                    )
                }
            case .detail(let meeting):
                if let display {
                    let detailCourse = display.courses.first { $0.id == meeting.courseId }
                    let detailSlots = display.daySlots.filter { $0.periodIndex >= meeting.startPeriodIndex && $0.periodIndex < meeting.startPeriodIndex + meeting.periodCount }
                    MeetingDetailSheet(
                        isPresented: activeSheetBinding,
                        meeting: meeting,
                        course: detailCourse,
                        slots: detailSlots,
                        onEdit: { activeSheet = .edit(meeting) },
                        onDelete: {
                            Task {
                                await model?.deleteMeeting(meeting)
                                activeSheet = nil
                            }
                        }
                    )
                }
            case .edit(let meeting):
                if let display {
                    MeetingEditModal(
                        isPresented: activeSheetBinding,
                        timetable: display,
                        mode: .edit,
                        initialDayOfWeekJs: nil,
                        initialPeriod: nil,
                        meeting: meeting,
                        onSaved: { Task { await model?.reloadTimetables() } }
                    )
                }
            case .settings:
                TimetableSettingsSheet(
                    isPresented: activeSheetBinding,
                    timetable: model?.selected(semesterId: semesterId) ?? model?.createdTimetable,
                    onSaved: { Task { await model?.reloadTimetables() } }
                )
            }
        }
    }

    private var activeSheetBinding: Binding<Bool> {
        Binding(
            get: { activeSheet != nil },
            set: {
                if !$0 {
                    activeSheet = nil
                    showSettings = false
                }
            }
        )
    }
}
