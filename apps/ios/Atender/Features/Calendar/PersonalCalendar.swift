import SwiftUI

@MainActor
@Observable
final class PersonalCalendarViewModel {
    @ObservationIgnored private let environment: AppEnvironment
    var viewMode: CalendarViewMode = .month
    var anchor = CalendarRange.todayString()
    var selectedDate = CalendarRange.todayString()
    var timetables: [UserTimetableDto] = []
    var semesters: [SemesterDto] = []
    var overview: SemesterOverviewDto?
    var personalEvents: [PersonalEventDto] = []
    var isLoading = false
    var hasError = false

    init(environment: AppEnvironment) {
        self.environment = environment
    }

    func load(semesterId: String?) async {
        guard let semesterId else { return }
        isLoading = true
        hasError = false
        defer { isLoading = false }
        do {
            async let tt = environment.timetableRepository.userTimetables()
            async let sem = environment.semesterRepository.semesters()
            async let ov = environment.semesterRepository.semesterOverview(id: semesterId)
            timetables = try await tt
            semesters = try await sem
            overview = try await ov
            let range = currentRange
            personalEvents = try await environment.personalEventRepository.personalEvents(from: range.start, to: range.end, semesterId: semesterId)
        } catch {
            hasError = true
        }
    }

    var currentRange: (start: String, end: String) {
        switch viewMode {
        case .month:
            return CalendarRange.monthGridRange(anchorMonthFirst: CalendarRange.monthFirst(anchor))
        case .week:
            let start = CalendarRange.mondayOf(anchor)
            return (start, CalendarRange.addDays(start, 6))
        case .day:
            return (selectedDate, selectedDate)
        }
    }

    func events(semesterId: String?) -> [CalendarEvent] {
        guard let semesterId,
              let timetable = timetables.first(where: { $0.semesterId == semesterId }),
              let semester = semesters.first(where: { $0.id == semesterId })
        else { return [] }
        let statusByDate = Dictionary(uniqueKeysWithValues: (overview?.days ?? []).map { ($0.date, $0.status) })
        let range = currentRange
        let meetings = MeetingExpansion.expandUserTimetable(
            meetings: timetable.meetings,
            courses: timetable.courses,
            daySlots: timetable.daySlots,
            rangeStart: range.start,
            rangeEnd: range.end,
            semesterStart: semester.startDate,
            semesterEnd: semester.endDate,
            statusByDate: statusByDate
        )
        let own = personalEvents.map { event in
            CalendarEvent(
                kind: .personal,
                id: "e:\(event.id)",
                date: event.date,
                title: event.title,
                startMinute: event.isAllDay ? 0 : event.startMinute ?? 0,
                endMinute: event.isAllDay ? 1440 : event.endMinute ?? event.startMinute ?? 0,
                color: event.color ?? "#8b5cf6",
                subtitle: "自分",
                courseId: nil
            )
        }
        return (meetings + own).sorted {
            if $0.date != $1.date { return $0.date < $1.date }
            return $0.startMinute < $1.startMinute
        }
    }

    func selectDate(_ date: String) {
        selectedDate = date
        anchor = date
    }

    func statusByDate() -> [String: AttendanceDayStatus] {
        Dictionary(uniqueKeysWithValues: (overview?.days ?? []).map { ($0.date, $0.status) })
    }
}

struct PersonalCalendar: View {
    @Environment(AppEnvironment.self) private var environment
    let semesterId: String?
    @State private var viewModel: PersonalCalendarViewModel?
    @State private var loadRevision = 0

    var body: some View {
        Group {
            if semesterId == nil {
                Panel { Text("学期を選択してください。").foregroundStyle(Color.textSecondary) }
            } else if let model = viewModel {
                content(model)
            } else {
                Color.clear
                    .frame(height: 0)
                    .accessibilityHidden(true)
            }
        }
        .task(id: semesterId) {
            if viewModel == nil { viewModel = PersonalCalendarViewModel(environment: environment) }
            await viewModel?.load(semesterId: semesterId)
            loadRevision += 1
        }
    }

    @ViewBuilder
    private func content(_ model: PersonalCalendarViewModel) -> some View {
        let events = model.events(semesterId: semesterId)
        let eventMap = MeetingExpansion.eventsByDate(events)
        if model.isLoading {
            VStack(spacing: Space.s3) {
                Skeleton(width: nil, height: 40, radius: Radius.md)
                Skeleton(width: nil, height: 360, radius: Radius.md)
            }
        } else if model.hasError {
            Panel { Text("カレンダーを読み込めませんでした。").foregroundStyle(Color.textSecondary) }
        } else if semesterId != nil && model.timetables.first(where: { $0.semesterId == semesterId }) == nil {
            Panel { Text("この学期の時間割がありません").foregroundStyle(Color.textSecondary) }
        } else if semesterId != nil && model.semesters.first(where: { $0.id == semesterId }) == nil {
            Panel { Text("学期を読み込めませんでした。").foregroundStyle(Color.textSecondary) }
        } else {
            VStack(spacing: Space.s3) {
                HStack {
                    PeriodNav(viewMode: model.viewMode, anchor: model.anchor) { next in
                        model.anchor = next
                        if model.viewMode == .day { model.selectedDate = next }
                        Task { await model.load(semesterId: semesterId) }
                    }
                    Spacer()
                    CalendarSegmented(viewMode: Binding(get: { model.viewMode }, set: { model.viewMode = $0; Task { await model.load(semesterId: semesterId) } }))
                }
                switch model.viewMode {
                case .month:
                    CalendarMonth(anchor: model.anchor, selectedDate: model.selectedDate, events: events, statusByDate: model.statusByDate()) { date in
                        model.selectDate(date)
                    }
                    DayAgendaPanel(date: model.selectedDate, events: eventMap[model.selectedDate] ?? [])
                case .week:
                    CalendarWeek(weekStart: CalendarRange.mondayOf(model.anchor), selectedDate: model.selectedDate, eventsByDateMap: eventMap) { date in
                        model.selectDate(date)
                    }
                case .day:
                    CalendarDay(date: model.selectedDate, events: eventMap[model.selectedDate] ?? [])
                }
            }
        }
    }
}

struct CalendarSegmented: View {
    @Binding var viewMode: CalendarViewMode
    var body: some View {
        HStack(spacing: 0) {
            item("日", .day)
            item("週", .week)
            item("月", .month)
        }
        .padding(3)
        .background(Color.bgMuted)
        .clipShape(Capsule())
    }
    private func item(_ label: String, _ mode: CalendarViewMode) -> some View {
        Button { viewMode = mode } label: {
            Text(label)
                .font(.atenderXs)
                .fontWeight(.bold)
                .foregroundStyle(viewMode == mode ? Color.textOnAccent : Color.textSecondary)
                .frame(width: 38, height: 30)
                .background(viewMode == mode ? Color.accent500 : Color.clear)
                .clipShape(Capsule())
        }.buttonStyle(.plain)
    }
}

struct PeriodNav: View {
    let viewMode: CalendarViewMode
    let anchor: String
    let onChange: (String) -> Void

    var body: some View {
        HStack(spacing: Space.s2) {
            Button { onChange(shift(-1)) } label: { Image(systemName: "chevron.left") }
            Text(title)
                .font(.atenderSm)
                .fontWeight(.bold)
                .foregroundStyle(Color.textPrimary)
                .frame(minWidth: 138)
            Button { onChange(shift(1)) } label: { Image(systemName: "chevron.right") }
        }
        .buttonStyle(.plain)
    }

    private var title: String {
        switch viewMode {
        case .day: return CalendarRange.format(anchor, .yearMonthDay)
        case .week:
            let start = CalendarRange.mondayOf(anchor)
            return "\(CalendarRange.format(start, .monthDay)) - \(CalendarRange.format(CalendarRange.addDays(start, 6), .monthDay)) (週)"
        case .month: return CalendarRange.format(CalendarRange.monthFirst(anchor), .yearMonth)
        }
    }

    private func shift(_ amount: Int) -> String {
        switch viewMode {
        case .day: return CalendarRange.addDays(anchor, amount)
        case .week: return CalendarRange.addDays(anchor, amount * 7)
        case .month: return CalendarRange.addMonths(anchor, amount)
        }
    }
}

struct CalendarMonth: View {
    let anchor: String
    let selectedDate: String
    let events: [CalendarEvent]
    let statusByDate: [String: AttendanceDayStatus]
    let onSelectDate: (String) -> Void

    private let labels = ["月", "火", "水", "木", "金", "土", "日"]
    var body: some View {
        let range = CalendarRange.monthGridRange(anchorMonthFirst: CalendarRange.monthFirst(anchor))
        let dates = (0..<42).map { CalendarRange.addDays(range.start, $0) }
        let eventMap = MeetingExpansion.eventsByDate(events)
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(labels, id: \.self) { label in
                    Text(label).font(.atenderXs).fontWeight(.bold).foregroundStyle(Color.textTertiary).frame(maxWidth: .infinity).frame(height: 26)
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 0) {
                ForEach(dates, id: \.self) { date in
                    dayCell(date, events: eventMap[date] ?? [])
                }
            }
        }
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).stroke(Color.borderSubtle, lineWidth: 1))
    }

    private func dayCell(_ date: String, events: [CalendarEvent]) -> some View {
        let inMonth = date.prefix(7) == CalendarRange.monthFirst(anchor).prefix(7)
        return Button { onSelectDate(date) } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(String(date.suffix(2)).trimmingCharacters(in: CharacterSet(charactersIn: "0")))
                        .font(.atenderXs)
                        .fontWeight(.bold)
                        .foregroundStyle(selectedDate == date ? Color.textOnAccent : (inMonth ? Color.textPrimary : Color.textTertiary))
                        .frame(width: 24, height: 24)
                        .background(selectedDate == date ? Color.accent500 : Color.clear)
                        .clipShape(Circle())
                    Spacer()
                    if let status = statusByDate[date], status != .noClass {
                        Circle().fill(CalendarEventDisplay.dayStatusColor(status)).frame(width: 6, height: 6)
                    }
                }
                ForEach(Array(events.prefix(3))) { event in
                    Text(CalendarEventDisplay.eventTitle(event))
                        .font(.atender(9, .semibold))
                        .lineLimit(1)
                        .foregroundStyle(Color.textPrimary)
                        .padding(.horizontal, 3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(hexString: event.color).opacity(0.18))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
                if events.count > 3 {
                    Text("+\(events.count - 3)")
                        .font(.atender(9, .bold))
                        .foregroundStyle(Color.textTertiary)
                }
                Spacer(minLength: 0)
            }
            .padding(4)
            .frame(height: 86)
            .background(inMonth ? Color.bgElevated : Color.bgMuted.opacity(0.45))
            .overlay(alignment: .top) { Rectangle().fill(Color.borderSubtle).frame(height: 1) }
            .overlay(alignment: .leading) { Rectangle().fill(Color.borderSubtle).frame(width: 1) }
        }
        .buttonStyle(.plain)
    }
}

struct CalendarWeek: View {
    let weekStart: String
    let selectedDate: String
    let eventsByDateMap: [String: [CalendarEvent]]
    let onSelectDate: (String) -> Void

    var body: some View {
        VStack(spacing: Space.s2) {
            ForEach((0..<7).map { CalendarRange.addDays(weekStart, $0) }, id: \.self) { date in
                let events = eventsByDateMap[date] ?? []
                Button { onSelectDate(date) } label: {
                    VStack(alignment: .leading, spacing: Space.s2) {
                        HStack {
                            Text(CalendarRange.format(date, .monthDay))
                                .font(.atenderBase)
                                .fontWeight(.bold)
                                .foregroundStyle(selectedDate == date ? Color.accent500 : Color.textPrimary)
                            Spacer()
                            Text("\(events.count)件").font(.atenderXs).foregroundStyle(Color.textTertiary)
                        }
                        if events.isEmpty {
                            Text("予定なし").font(.atenderSm).foregroundStyle(Color.textTertiary)
                        } else {
                            ForEach(events) { event in
                                EventTile(title: event.title, color: event.color, subtitle: event.subtitle, meta: TimeFormatting.minutesToTime(event.startMinute))
                                    .frame(height: 48)
                            }
                        }
                    }
                    .padding(Space.s3)
                    .background(Color.bgElevated)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                }.buttonStyle(.plain)
            }
        }
    }
}

struct CalendarDay: View {
    let date: String
    let events: [CalendarEvent]
    var body: some View {
        let laned = CalendarLane.assignLanes(events)
        GeometryReader { proxy in
            let height = proxy.size.height
            ZStack(alignment: .topLeading) {
                ForEach(9...21, id: \.self) { hour in
                    let y = CGFloat(hour - 9) / 12 * height
                    Text("\(hour):00")
                        .font(.atender(9))
                        .foregroundStyle(Color.textTertiary)
                        .position(x: 24, y: y + 8)
                    Rectangle().fill(Color.borderSubtle).frame(height: 1).position(x: proxy.size.width / 2 + 28, y: y)
                }
                ForEach(laned, id: \.event.id) { item in
                    let top = CGFloat(max(540, item.event.startMinute) - 540) / 720 * height
                    let eventHeight = max(28, CGFloat(min(1260, item.event.endMinute) - max(540, item.event.startMinute)) / 720 * height)
                    let laneWidth = (proxy.size.width - 62) / CGFloat(max(1, item.laneCount))
                    EventTile(title: item.event.title, color: item.event.color, subtitle: "\(item.event.subtitle) · \(TimeFormatting.minutesToTime(item.event.startMinute))", leadingSystemImage: item.event.source == .googleOauth ? "cloud.fill" : (item.event.source == .icsFile || item.event.source == .icsUrl ? "calendar.badge.arrow.down" : nil))
                        .frame(width: laneWidth - 2, height: eventHeight)
                        .position(x: 58 + laneWidth * CGFloat(item.lane) + laneWidth / 2, y: top + eventHeight / 2)
                }
            }
        }
        .frame(height: 620)
        .padding(Space.s3)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }
}

struct DayAgendaPanel: View {
    let date: String
    let events: [CalendarEvent]
    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("\(CalendarRange.format(date, .monthDay)) の予定")
                .font(.atenderBase)
                .fontWeight(.bold)
                .foregroundStyle(Color.textPrimary)
            if events.isEmpty {
                Text("予定はありません")
                    .font(.atenderSm)
                    .foregroundStyle(Color.textTertiary)
            } else {
                ForEach(events) { event in
                    HStack(spacing: Space.s2) {
                        Circle().fill(Color(hexString: event.color)).frame(width: 8, height: 8)
                        Text(event.title).font(.atenderSm).fontWeight(.bold)
                        Spacer()
                        Text("\(TimeFormatting.minutesToTime(event.startMinute))-\(TimeFormatting.minutesToTime(event.endMinute))")
                            .font(.atenderXs)
                            .foregroundStyle(Color.textTertiary)
                    }
                }
            }
        }
        .padding(Space.s4)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .atenderShadow(.card)
    }
}
