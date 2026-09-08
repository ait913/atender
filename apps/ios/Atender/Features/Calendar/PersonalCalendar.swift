import SwiftUI

@MainActor
@Observable
final class PersonalCalendarViewModel {
    @ObservationIgnored private let environment: AppEnvironment
    let store: CalendarMonthStore<[PersonalEventOccurrenceDto]>
    var occurrences: [PersonalEventOccurrenceDto] = []

    convenience init(environment: AppEnvironment) {
        self.init(environment: environment, semesterId: nil)
    }

    init(environment: AppEnvironment, semesterId: String?) {
        self.environment = environment
        let originMonth = CalendarRange.monthFirst(SchoolClock.todayString())
        store = CalendarMonthStore<[PersonalEventOccurrenceDto]>(
            visibleMonth: originMonth,
            semesterId: semesterId
        ) { request in
            async let occurrencesTask = environment.personalEventRepository
                .personalEvents(from: request.rangeStart, to: request.rangeEnd)
            async let timetablesTask = environment.timetableRepository.userTimetables(force: request.force)
            async let semestersTask = environment.semesterRepository.semesters(force: request.force)
            let occurrences = try await occurrencesTask
            let timetables = try await timetablesTask
            let semesters = try await semestersTask

            var events: [CalendarEvent] = []
            var summaries: [String: AttendanceDaySummary] = [:]
            if let semesterId = request.semesterId,
               let timetable = timetables.first(where: { $0.semesterId == semesterId }),
               let semester = semesters.first(where: { $0.id == semesterId }) {
                // §5.2: 出席オーバーレイの失敗は握り潰す。予定は見えるべき。
                let overview = try? await environment.semesterRepository
                    .semesterOverview(id: semesterId, force: request.force)
                summaries = Dictionary((overview?.days ?? []).map { ($0.date, $0) },
                                       uniquingKeysWith: { _, last in last })
                // 振替 (occurrenceRange) の失敗も握り潰す。授業の週パターン表示は生き残る
                let range = try? await environment.calendarExportRepository
                    .occurrenceRange(from: request.rangeStart, to: request.rangeEnd)
                let excluding = TransferDisplay.displacedKeys(range?.transfers ?? [])
                events += MeetingExpansion.expandUserTimetable(
                    meetings: timetable.meetings, courses: timetable.courses, daySlots: timetable.daySlots,
                    rangeStart: request.rangeStart, rangeEnd: request.rangeEnd,
                    semesterStart: semester.startDate, semesterEnd: semester.endDate,
                    statusByDate: summaries.mapValues(\.status), excluding: excluding)
                events += TransferDisplay.calendarEvents(occurrences: range?.occurrences ?? [], courses: timetable.courses)
            }
            events += PersonalEventDisplay.calendarEvents(occurrences: occurrences)
            return .init(events: events.sorted(by: CalendarEventOrder.byDateThenStart),
                         daySummaries: summaries, extra: occurrences)
        }
    }

    /// ★ 日別シートは「可視月のグリッド 42 日」から開かれる。payload は月グリッド全体
    ///   (前後月のはみ出し日を含む) を持つので、**date の月ではなく可視月**で引く。
    ///   date の月で引くと、7 月グリッドの 6/30 を開いたとき未取得の 6 月 payload を
    ///   見にいって中身が空になる。
    func meetings(on date: String) -> [CalendarEvent] {
        store.payload(store.visibleMonth)?.events
            .filter { $0.date == date && $0.kind == .meeting } ?? []
    }

    func occurrences(on date: String) -> [PersonalEventOccurrenceDto] {
        let source = store.payload(store.visibleMonth)?.extra ?? occurrences
        return source
            .filter { $0.days.contains { $0.date == date } }
            .sorted { lhs, rhs in
                let l = lhs.days.first(where: { $0.date == date })?.startMinute ?? 0
                let r = rhs.days.first(where: { $0.date == date })?.startMinute ?? 0
                if l != r { return l < r }
                return lhs.title < rhs.title
            }
    }
}

struct PersonalCalendar: View {
    @Environment(AppEnvironment.self) private var environment
    let semesterId: String?
    let available: CGFloat
    @State private var viewModel: PersonalCalendarViewModel?

    var body: some View {
        Group {
            if let model = viewModel {
                CalendarScreen(
                    store: model.store,
                    options: .personal,
                    available: available,
                    originMonth: CalendarRange.monthFirst(SchoolClock.todayString())
                ) { context in
                    PersonalDaySheet(
                        date: context.date,
                        meetings: model.meetings(on: context.date),
                        occurrences: model.occurrences(on: context.date),
                        path: context.path,
                        onChanged: context.onChanged,
                        onClose: context.onClose
                    )
                }
                .task {
                    await environment.calendarSyncCoordinator.sync(trigger: .calendarScreen)
                }
                .onChange(of: semesterId) { _, newValue in
                    Task { await model.store.setSemester(newValue) }
                }
            } else {
                Color.clear
                    .frame(height: 0)
                    .accessibilityHidden(true)
            }
        }
        .task {
            if viewModel == nil {
                viewModel = PersonalCalendarViewModel(environment: environment, semesterId: semesterId)
            }
        }
    }
}
