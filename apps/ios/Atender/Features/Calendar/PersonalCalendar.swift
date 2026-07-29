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
    var occurrences: [PersonalEventOccurrenceDto] = []
    var isLoading = false
    var hasError = false

    init(environment: AppEnvironment) {
        self.environment = environment
    }

    func load(semesterId: String?) async {
        isLoading = true
        hasError = false
        defer { isLoading = false }
        let range = currentRange
        do {
            async let occ = environment.personalEventRepository.personalEvents(from: range.start, to: range.end)
            async let tt = environment.timetableRepository.userTimetables()
            async let sem = environment.semesterRepository.semesters()
            occurrences = try await occ
            timetables = try await tt
            semesters = try await sem
        } catch {
            hasError = true
            return
        }
        // 出席オーバーレイは学期があるときだけ。失敗しても hasError を立てない (予定は見えるべき)
        if let semesterId {
            overview = try? await environment.semesterRepository.semesterOverview(id: semesterId)
        } else {
            overview = nil
        }
    }

    var currentRange: (start: String, end: String) {
        CalendarRange.monthGridRange(anchorMonthFirst: CalendarRange.monthFirst(anchor))
    }

    func events(semesterId: String?) -> [CalendarEvent] {
        var out: [CalendarEvent] = []
        if let semesterId,
           let timetable = timetables.first(where: { $0.semesterId == semesterId }),
           let semester = semesters.first(where: { $0.id == semesterId }) {
            let statusByDate = Dictionary(uniqueKeysWithValues: (overview?.days ?? []).map { ($0.date, $0.status) })
            let range = currentRange
            out += MeetingExpansion.expandUserTimetable(
                meetings: timetable.meetings,
                courses: timetable.courses,
                daySlots: timetable.daySlots,
                rangeStart: range.start,
                rangeEnd: range.end,
                semesterStart: semester.startDate,
                semesterEnd: semester.endDate,
                statusByDate: statusByDate
            )
        }
        out += PersonalEventDisplay.calendarEvents(occurrences: occurrences)
        return out.sorted {
            if $0.date != $1.date { return $0.date < $1.date }
            return $0.startMinute < $1.startMinute
        }
    }

    func occurrences(on date: String) -> [PersonalEventOccurrenceDto] {
        occurrences
            .filter { $0.days.contains { $0.date == date } }
            .sorted { lhs, rhs in
                let l = lhs.days.first(where: { $0.date == date })?.startMinute ?? 0
                let r = rhs.days.first(where: { $0.date == date })?.startMinute ?? 0
                if l != r { return l < r }
                return lhs.title < rhs.title
            }
    }

    func selectDate(_ date: String) {
        selectedDate = date
        anchor = date
    }

    func statusByDate() -> [String: AttendanceDayStatus] {
        Dictionary(uniqueKeysWithValues: (overview?.days ?? []).map { ($0.date, $0.status) })
    }

    /// CalendarMonth のドット用。日別の内訳をそのまま渡す (D1 §2.6)
    func daySummaries() -> [String: AttendanceDaySummary] {
        Dictionary((overview?.days ?? []).map { ($0.date, $0) }, uniquingKeysWith: { _, last in last })
    }
}

enum PersonalCalendarSheet: Equatable {
    case day(String)
    /// 日付セルの長押しから、その日の予定作成を直接開く (旧「+」ボタンの置き換え)
    case addEvent(String)

    var date: String {
        switch self {
        case .day(let date), .addEvent(let date): return date
        }
    }
}

struct PersonalCalendar: View {
    @Environment(AppEnvironment.self) private var environment
    let semesterId: String?
    let available: CGFloat
    @State private var viewModel: PersonalCalendarViewModel?
    @State private var loadRevision = 0
    @State private var activeSheet: PersonalCalendarSheet?

    var body: some View {
        Group {
            if let model = viewModel {
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
            await environment.calendarSyncCoordinator.sync(trigger: .calendarScreen)
            loadRevision += 1
        }
    }

    private var activeSheetBinding: Binding<Bool> {
        Binding(get: { activeSheet != nil }, set: { if !$0 { activeSheet = nil } })
    }

    @ViewBuilder
    private func sheetHost(_ model: PersonalCalendarViewModel) -> some View {
        if let activeSheet {
            let date = activeSheet.date
            BottomSheet(title: nil, isPresented: activeSheetBinding, stackLevel: 1) {
                PersonalDaySheet(
                    date: date,
                    meetings: model.events(semesterId: semesterId).filter { $0.date == date ? $0.kind == .meeting : false },
                    occurrences: model.occurrences(on: date),
                    initialMode: {
                        if case .addEvent = activeSheet {
                            return .editor(.init(occurrence: nil, defaultDate: date))
                        }
                        return .list
                    }(),
                    onChanged: { await model.load(semesterId: semesterId) },
                    onClose: { self.activeSheet = nil }
                )
            }
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
            Panel {
                VStack(spacing: Space.s3) {
                    Text("カレンダーを読み込めませんでした。").foregroundStyle(Color.textSecondary)
                    AtenderButton(title: "再試行", variant: .secondary, size: .sm) {
                        Task { await model.load(semesterId: semesterId) }
                    }
                }
            }
        } else {
            ScrollView {
                VStack(spacing: Space.s2) {
                    CalendarSyncBanner()
                    CalendarMonthHeader(anchor: model.anchor) { next in
                        model.anchor = next
                        Task { await model.load(semesterId: semesterId) }
                    }
                    CalendarMonth(
                        anchor: model.anchor,
                        selectedDate: model.selectedDate,
                        events: events,
                        daySummaries: model.daySummaries(),
                        available: available,
                        onSelectDate: { date in
                            let needsReload = PersonalCalendarLogic.monthChanged(anchor: model.anchor, date: date)
                            model.selectDate(date)
                            if needsReload {
                                Task {
                                    await model.load(semesterId: semesterId)
                                    activeSheet = .day(date)
                                }
                            } else {
                                activeSheet = .day(date)
                            }
                        },
                        onChangeAnchor: { next in
                            model.anchor = next
                            Task { await model.load(semesterId: semesterId) }
                        },
                        onLongPressDate: { date in
                            model.selectDate(date)
                            activeSheet = .addEvent(date)
                        }
                    )
                }
            }
            .scrollBounceBehavior(.basedOnSize)
            // ★ scrollClipDisabled は付けない。付けるとスクロール中の中身が
            //   ルーム選択チップや「時間割/カレンダー」ピッカーの上に描画される (実機 FB)。
            .overlay { sheetHost(model) }
        }
    }

}

/// 月の移動ヘッダー。
///
/// ★ 旧実装は `PeriodNav` を 44pt の行に置き、右端に 44×44 の「+」を並べていた。
///   実機 FB「余計に縦幅を取ってカレンダー自体が小さい / ボタンが質素」を受けて:
///   - 高さを 32pt に詰め、月名を主役 (title3 bold) にした
///   - 「+」は廃止し、**日付セルの長押し**に移した (タップは従来どおり日別シート)
///   - 書き出しエラーはここの警告グリフに集約 (バナーで縦幅を食わない)
struct CalendarMonthHeader: View {
    let anchor: String
    let onChange: (String) -> Void

    var body: some View {
        HStack(spacing: Space.s2) {
            Text(CalendarRange.format(CalendarRange.monthFirst(anchor), .yearMonth))
                .font(.title3)
                .fontWeight(.bold)
                .foregroundStyle(Color.textPrimary)
                .contentTransition(.numericText())
            CalendarSyncWarningButton()
            Spacer(minLength: Space.s2)
            Button { onChange(CalendarRange.addMonths(anchor, -1)) } label: {
                chevron("chevron.left")
            }
            .accessibilityLabel("前の月")
            Button { onChange(CalendarRange.addMonths(anchor, 1)) } label: {
                chevron("chevron.right")
            }
            .accessibilityLabel("次の月")
        }
        .buttonStyle(.plain)
        .frame(height: 32)
    }

    private func chevron(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Color.accent500)
            .frame(width: 32, height: 32)
            .background(Color.bgElevated, in: Circle())
            .overlay(Circle().stroke(Color.borderSubtle, lineWidth: 1))
            .contentShape(Circle())
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

struct CalendarMonth: View {
    let anchor: String
    let selectedDate: String
    let events: [CalendarEvent]
    let daySummaries: [String: AttendanceDaySummary]
    var available: CGFloat? = nil
    let onSelectDate: (String) -> Void
    var onChangeAnchor: ((String) -> Void)? = nil
    var onSelectEvent: ((CalendarEvent) -> Void)? = nil
    /// 日付セルの長押し。予定の新規作成に使う (旧「+」ボタンの置き換え)
    var onLongPressDate: ((String) -> Void)? = nil

    private let labels = ["月", "火", "水", "木", "金", "土", "日"]
    var body: some View {
        let monthFirst = CalendarRange.monthFirst(anchor)
        let range = CalendarRange.monthGridRange(anchorMonthFirst: monthFirst)
        let dates = (0..<42).map { CalendarRange.addDays(range.start, $0) }
        let eventMap = MeetingExpansion.eventsByDate(events)
        let rowHeight = available.map { CalendarMonthLayout.rowHeight(available: CalendarMonthLayout.gridAvailable(available: $0)) } ?? 86
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

        content
            .padding(Space.s2)
            .background(Color.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
            .atenderShadow(.card)
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
                    // §2.6: ホームは「ドットのみ」。severity 順に最大 3 個
                    HStack(spacing: 2) {
                        ForEach(Array(AttendanceDayVisual.dayVisual(summary: daySummaries[date], isFuture: false).marks.prefix(3)), id: \.kind) { mark in
                            Circle().fill(mark.dotColor).frame(width: 6, height: 6)
                        }
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
            // ★ マス全体をタップ範囲にする。これが無いと描画されている要素
            //   (日付の丸・イベント chip) の上でしか反応せず、
            //   「日付表示の上部分しか押せない」状態になる (実機 FB)
            .contentShape(Rectangle())
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
        .conditional(onLongPressDate != nil) { view in
            view.onLongPressGesture(minimumDuration: 0.4) {
                onLongPressDate?(date)
            }
        }
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
