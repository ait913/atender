import SwiftUI

@MainActor
@Observable
final class PersonalCalendarViewModel {
    @ObservationIgnored private let environment: AppEnvironment
    var anchor = SchoolClock.todayString()
    var selectedDate = SchoolClock.todayString()
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
        CalendarRange.monthGridRange(anchorMonthFirst: CalendarRange.monthFirst(anchor))
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
    let available: CGFloat
    @State private var viewModel: PersonalCalendarViewModel?
    @State private var loadRevision = 0
    @State private var isAddingPersonalEvent = false

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
            if let range = viewModel?.currentRange {
                await environment.calendarSyncCoordinator.sync(range: eventKitInterval(from: range.start, to: range.end))
            }
            loadRevision += 1
        }
    }

    @ViewBuilder
    private func content(_ model: PersonalCalendarViewModel) -> some View {
        let events = model.events(semesterId: semesterId)
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
            ScrollView {
                VStack(spacing: Space.s3) {
                    HStack {
                        PeriodNav(viewMode: .month, anchor: model.anchor) { next in
                            model.anchor = next
                            Task { await model.load(semesterId: semesterId) }
                        }
                        Spacer()
                    }
                    CalendarMonth(
                        anchor: model.anchor,
                        selectedDate: model.selectedDate,
                        events: events,
                        statusByDate: model.statusByDate(),
                        available: available,
                        onSelectDate: { date in
                            model.selectDate(date)
                        },
                        onChangeAnchor: { next in
                            model.anchor = next
                            Task { await model.load(semesterId: semesterId) }
                        }
                    )
                }
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollClipDisabled()
            .overlay {
                PersonalEventEditModal(
                    date: model.selectedDate,
                    event: nil,
                    semesterId: semesterId,
                    onSaved: { saved in
                        Task {
                            try? await environment.calendarSyncCoordinator.pushManualEvent(saved)
                            await model.load(semesterId: semesterId)
                        }
                    },
                    isPresented: $isAddingPersonalEvent,
                    stackLevel: 2
                )
            }
        }
    }

    private func eventKitInterval(from: String, to: String) -> DateInterval {
        let start = EventKitTimeMapping.toAbsolute(date: from, isAllDay: true, startMinute: nil, endMinute: nil).start
        let end = EventKitTimeMapping.toAbsolute(date: CalendarRange.addDays(to, 1), isAllDay: true, startMinute: nil, endMinute: nil).start
        return DateInterval(start: start, end: end)
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
        .frame(maxWidth: .infinity)
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

enum CalendarMonthChrome {
    case card
    case fullBleed
}

struct CalendarMonth: View {
    let anchor: String
    let selectedDate: String
    let events: [CalendarEvent]
    let statusByDate: [String: AttendanceDayStatus]
    var available: CGFloat? = nil
    var chrome: CalendarMonthChrome = .fullBleed
    let onSelectDate: (String) -> Void
    var onChangeAnchor: ((String) -> Void)? = nil
    var onSelectEvent: ((CalendarEvent) -> Void)? = nil

    private let labels = ["月", "火", "水", "木", "金", "土", "日"]
    var body: some View {
        let monthFirst = CalendarRange.monthFirst(anchor)
        let range = CalendarRange.monthGridRange(anchorMonthFirst: monthFirst)
        let dates = (0..<42).map { CalendarRange.addDays(range.start, $0) }
        let eventMap = MeetingExpansion.eventsByDate(events)
        let rowHeight = available.map { CalendarMonthLayout.rowHeight(available: $0) } ?? 86
        monthGrid(dates: dates, eventMap: eventMap, monthFirst: monthFirst, rowHeight: rowHeight)
            .gesture(
                DragGesture(minimumDistance: 20)
                    .onEnded { value in
                        guard abs(value.translation.width) > abs(value.translation.height) else { return }
                        if value.translation.width < -50 {
                            onChangeAnchor?(CalendarRange.addMonths(anchor, 1))
                        } else if value.translation.width > 50 {
                            onChangeAnchor?(CalendarRange.addMonths(anchor, -1))
                        }
                    }
            )
            .sensoryFeedback(.selection, trigger: anchor)
    }

    @ViewBuilder
    private func monthGrid(dates: [String], eventMap: [String: [CalendarEvent]], monthFirst: String, rowHeight: CGFloat) -> some View {
        let content = VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                    Text(label)
                        .font(.atenderXs)
                        .fontWeight(.bold)
                        .foregroundStyle(weekdayColor(index: index, outsideMonth: false))
                        .frame(maxWidth: .infinity)
                        .frame(height: CalendarMonthLayout.weekdayHeaderHeight)
                }
            }
            VStack(spacing: 0) {
                ForEach(0..<CalendarMonthLayout.rowCount, id: \.self) { row in
                    HStack(spacing: 0) {
                        ForEach(0..<7, id: \.self) { column in
                            let date = dates[row * 7 + column]
                            dayCell(
                                date,
                                events: eventMap[date] ?? [],
                                monthFirst: monthFirst,
                                rowHeight: rowHeight,
                                column: column
                            )
                        }
                    }
                }
            }
        }

        switch chrome {
        case .card:
            content
                .padding(Space.s2)
                .background(Color.bgElevated)
                .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                .atenderShadow(.card)
        case .fullBleed:
            GeometryReader { proxy in
                content
                    .frame(width: proxy.size.width + Space.pagePxMobile * 2)
                    .background(Color.bgElevated)
                    .offset(x: -Space.pagePxMobile)
            }
            .frame(height: CalendarMonthLayout.weekdayHeaderHeight + rowHeight * CGFloat(CalendarMonthLayout.rowCount))
        }
    }

    private func dayCell(_ date: String, events: [CalendarEvent], monthFirst: String, rowHeight: CGFloat, column: Int) -> some View {
        let emphasis = CalendarDayStyle.emphasis(date: date, todayString: SchoolClock.todayString(), selectedDate: selectedDate, monthFirst: monthFirst)
        return Button { onSelectDate(date) } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(String(Int(date.suffix(2)) ?? 0))
                        .font(.atenderSm)
                        .fontWeight(emphasis == .today ? .bold : .semibold)
                        .foregroundStyle(dayNumberColor(date: date, emphasis: emphasis))
                        .frame(width: 24, height: 24)
                        .background(emphasis == .today ? Color.accent500 : Color.clear)
                        .overlay {
                            if emphasis == .selected {
                                Circle().stroke(Color.accent500, lineWidth: 1.5)
                            }
                        }
                        .clipShape(Circle())
                    Spacer()
                    if let status = statusByDate[date], status != .noClass {
                        Circle().fill(CalendarEventDisplay.dayStatusColor(status)).frame(width: 6, height: 6)
                    }
                }
                .frame(height: 24)

                // イベント領域は最大 2 行。溢れる日 (>2) は chip を 1 個に減らし、
                // 残り 1 行を「+N」に充てる (番号 + chip1 + +N はどの端末でも rowHeight に収まる)。
                // これで「+N」がセル枠 clip で切れず必ず読める (標準カレンダーの more 表記と同じ)。
                let overflow = events.count > 2
                let visibleCount = overflow ? 1 : 2
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(Array(events.prefix(visibleCount))) { event in
                        Text(CalendarEventDisplay.eventTitle(event))
                            .font(.caption2)
                            .fontWeight(.semibold)
                            .lineLimit(1)
                            .foregroundStyle(Color.textPrimary)
                            .padding(.leading, 5)
                            .padding(.trailing, 4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .frame(height: 14)
                            .background(Color.opaqueTint(hex: event.color, ratio: Color.surfaceTintRatio, base: .bgElevated))
                            .overlay(alignment: .leading) {
                                Capsule()
                                    .fill(Color(hexString: event.color))
                                    .frame(width: 2)
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                            .contentShape(Rectangle())
                            .simultaneousGesture(TapGesture().onEnded {
                                if event.kind == .roomEvent {
                                    onSelectEvent?(event)
                                }
                            })
                    }
                    if overflow {
                        Text("+\(events.count - visibleCount)")
                            .font(.caption2)
                            .fontWeight(.semibold)
                            .foregroundStyle(Color.textTertiary)
                            .padding(.horizontal, 3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .clipped()
            }
            .padding(.horizontal, 3)
            .padding(.vertical, 2)
            .frame(maxWidth: .infinity)
            .frame(height: max(44, rowHeight))
            .background(emphasis == .outsideMonth ? Color.bgMuted : Color.bgElevated)
            .overlay(alignment: .top) {
                Rectangle().fill(Color.borderSubtle).frame(height: 0.5)
            }
            .overlay(alignment: .leading) {
                if column > 0 {
                    Rectangle().fill(Color.borderSubtle).frame(width: 0.5)
                }
            }
            .clipped()
        }
        .buttonStyle(.plain)
    }

    private func dayNumberColor(date: String, emphasis: CalendarDayEmphasis) -> Color {
        switch emphasis {
        case .today: return Color.textOnAccent
        case .selected: return Color.accent500
        case .outsideMonth: return weekdayColor(index: weekdayIndex(date), outsideMonth: true)
        case .normal: return weekdayColor(index: weekdayIndex(date), outsideMonth: false)
        }
    }

    private func weekdayColor(index: Int, outsideMonth: Bool) -> Color {
        let color: Color
        switch index {
        case 5:
            color = Color(hexString: "#0091FF")
        case 6:
            color = Color(hexString: "#E5484D")
        default:
            color = Color.textPrimary
        }
        return outsideMonth ? color.opacity(0.38) : color
    }

    private func weekdayIndex(_ date: String) -> Int {
        guard let parsed = CalendarRange.parse(date) else { return 0 }
        let weekday = CalendarRange.utcCalendar.component(.weekday, from: parsed)
        return weekday == 1 ? 6 : weekday - 2
    }
}

struct DayAgendaPanel: View {
    let date: String
    let events: [CalendarEvent]
    var onAdd: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            HStack {
                Text("\(CalendarRange.format(date, .monthDay)) の予定")
                    .font(.atenderBase)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.textPrimary)
                Spacer()
                if let onAdd {
                    Button(action: onAdd) {
                        Image(systemName: "plus")
                            .font(.atenderSm)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.textPrimary)
                            .frame(width: 36, height: 36)
                            .background(Color.textPrimary.opacity(0.08))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("予定を追加")
                }
            }
            ScrollView {
                if events.isEmpty {
                    Text("予定はありません")
                        .font(.atenderSm)
                        .foregroundStyle(Color.textTertiary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, Space.s1)
                } else {
                    VStack(spacing: Space.s2) {
                        ForEach(events) { event in
                            HStack(spacing: Space.s2) {
                                Circle().fill(Color(hexString: event.color)).frame(width: 8, height: 8)
                                Text(event.title)
                                    .font(.atenderSm)
                                    .fontWeight(.bold)
                                    .foregroundStyle(Color.textPrimary)
                                    .lineLimit(1)
                                Spacer()
                                Text("\(TimeFormatting.minutesToTime(event.startMinute))-\(TimeFormatting.minutesToTime(event.endMinute))")
                                    .font(.atenderXs)
                                    .foregroundStyle(Color.textTertiary)
                            }
                        }
                    }
                }
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .padding(.horizontal, Space.pagePxMobile)
        .padding(.vertical, Space.s3)
        .background(Color.bgBase)
        .padding(.horizontal, -Space.pagePxMobile)
    }
}

struct CalendarWeek: View {
    let weekStart: String
    let selectedDate: String
    let eventsByDateMap: [String: [CalendarEvent]]
    let onSelectDate: (String) -> Void
    var onSelectEvent: ((CalendarEvent) -> Void)? = nil

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
                                    .contentShape(Rectangle())
                                    .simultaneousGesture(TapGesture().onEnded {
                                        if event.kind == .roomEvent {
                                            onSelectEvent?(event)
                                        }
                                    })
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
    var onSelectEvent: ((CalendarEvent) -> Void)? = nil

    var body: some View {
        let laned = CalendarLane.assignLanes(events)
        GeometryReader { proxy in
            let height = proxy.size.height
            ZStack(alignment: .topLeading) {
                ForEach(9...21, id: \.self) { hour in
                    let y = CGFloat(hour - 9) / 12 * height
                    Text("\(hour):00")
                        .font(.caption2)
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
                        .contentShape(Rectangle())
                        .simultaneousGesture(TapGesture().onEnded {
                            if item.event.kind == .roomEvent {
                                onSelectEvent?(item.event)
                            }
                        })
                }
            }
        }
        .frame(height: 620)
        .padding(Space.s3)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }
}
