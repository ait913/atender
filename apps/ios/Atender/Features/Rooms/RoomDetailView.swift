import SwiftUI
import Observation
import UniformTypeIdentifiers

@MainActor
@Observable
final class RoomDetailViewModel {
    @ObservationIgnored private let env: AppEnvironment
    let roomId: String
    private(set) var room: RoomDto?
    private(set) var isLoading = false

    init(env: AppEnvironment, roomId: String) {
        self.env = env
        self.roomId = roomId
    }

    func load(force: Bool = false) async {
        isLoading = true
        defer { isLoading = false }
        room = try? await env.roomRepository.room(id: roomId, force: force)
    }
}

struct RoomDetailView: View {
    let roomId: String
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var model: RoomDetailViewModel?
    @State private var tab: RoomDetailTab = .calendar
    @State private var settingsOpen = false

    enum RoomDetailTab: String, CaseIterable {
        case calendar, timetable
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            header
            tabPicker
            Group {
                if tab == .calendar {
                    RoomCalendar(roomId: roomId)
                } else {
                    GeometryReader { proxy in
                        RoomTimetable(roomId: roomId, available: proxy.size.height)
                    }
                }
            }
        }
        .padding(Space.pagePxMobile)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.bgBase)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if model == nil { model = RoomDetailViewModel(env: environment, roomId: roomId) }
            await model?.load()
        }
        .sheet(isPresented: $settingsOpen) {
            RoomSettingsSheet(roomId: roomId, isPresented: $settingsOpen) {
                await model?.load(force: true)
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: Space.s3) {
            VStack(alignment: .leading, spacing: Space.s1) {
                Text(model?.room?.name ?? "ルーム")
                    .font(.atender2xl)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(1)
                if let description = model?.room?.description, !description.isEmpty {
                    Text(description)
                        .font(.atenderSm)
                        .foregroundStyle(Color.textSecondary)
                        .lineLimit(2)
                }
            }
            Spacer()
            Button {
                settingsOpen = true
            } label: {
                Image(systemName: "gearshape.fill")
                    .foregroundStyle(Color.textPrimary)
                    .frame(width: 44, height: 44)
                    .background(Color.textPrimary.opacity(0.08))
                    .clipShape(Circle())
            }
        }
    }

    private var tabPicker: some View {
        HStack(spacing: 0) {
            tabItem("カレンダー", .calendar)
            tabItem("時間割", .timetable)
        }
        .padding(4)
        .background(Color.bgMuted)
        .clipShape(Capsule())
        .accessibilityIdentifier("room-detail-tabs")
    }

    private func tabItem(_ label: String, _ value: RoomDetailTab) -> some View {
        Button {
            tab = value
        } label: {
            Text(label)
                .font(.atenderSm)
                .fontWeight(.bold)
                .foregroundStyle(tab == value ? Color.textOnAccent : Color.textSecondary)
                .frame(maxWidth: .infinity)
                .frame(height: 34)
                .background(tab == value ? Color.accent500 : Color.clear)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct RoomCalendar: View {
    let roomId: String
    @Environment(AppEnvironment.self) private var environment
    @State private var viewMode: CalendarViewMode = .day
    @State private var anchor = SchoolClock.todayString()
    @State private var selectedDate = SchoolClock.todayString()
    @State private var expanded = false
    @State private var activeSheet: RoomCalSheet?
    @State private var weeks: [RoomWeekDto] = []
    @State private var isLoading = false
    @State private var loadError = false

    enum RoomCalSheet: Identifiable {
        case event, ics, editEvent(RoomEventDto)
        var id: String {
            switch self {
            case .event: return "event"
            case .ics: return "ics"
            case .editEvent(let event): return "edit-\(event.id)-\(event.occurrenceDate)"
            }
        }
    }

    var body: some View {
        let events = RoomCalendarLogic.buildCalendarEvents(weeks: weeks)
        let eventMap = MeetingExpansion.eventsByDate(events)
        let dayEvents = eventMap[selectedDate] ?? []
        ScrollView {
            VStack(spacing: Space.s3) {
                HStack {
                    PeriodNav(viewMode: viewMode, anchor: anchor) { next in
                        anchor = next
                        if viewMode == .day { selectedDate = next }
                        Task { await reload(force: true) }
                    }
                    Spacer()
                    CalendarSegmented(viewMode: Binding(get: { viewMode }, set: { viewMode = $0; Task { await reload(force: true) } }))
                }
                AvailabilityBar(date: selectedDate, members: weeks.first?.members ?? [], events: dayEvents, expanded: expanded) {
                    expanded.toggle()
                }
                if isLoading {
                    Skeleton(width: nil, height: viewMode == .day ? 620 : 360, radius: Radius.md)
                } else if loadError {
                    Panel { Text("カレンダーを読み込めませんでした。").foregroundStyle(Color.textSecondary) }
                } else {
                    switch viewMode {
                    case .month:
                        CalendarMonth(
                            anchor: anchor,
                            selectedDate: selectedDate,
                            events: events,
                            statusByDate: [:],
                            onSelectDate: { date in
                                selectedDate = date
                                anchor = date
                            },
                            onChangeAnchor: { next in
                                anchor = next
                                Task { await reload(force: true) }
                            },
                            onSelectEvent: { event in
                                selectRoomEvent(event)
                            }
                        )
                        RoomDayEventList(date: selectedDate, events: dayEvents) { event in
                            selectRoomEvent(event)
                        }
                    case .week:
                        CalendarWeek(weekStart: CalendarRange.mondayOf(anchor), selectedDate: selectedDate, eventsByDateMap: eventMap, onSelectDate: { date in
                            selectedDate = date
                            anchor = date
                        }, onSelectEvent: { event in
                            selectRoomEvent(event)
                        })
                    case .day:
                        CalendarDay(date: selectedDate, events: dayEvents) { event in
                            selectRoomEvent(event)
                        }
                    }
                }
            }
        }
        .scrollBounceBehavior(.basedOnSize)
        .accessibilityIdentifier("room-calendar")
        .overlay(alignment: .bottomTrailing) {
            if viewMode != .month {
                VStack(alignment: .trailing, spacing: Space.s3) {
                    Button { activeSheet = .ics } label: {
                        Image(systemName: "arrow.down.doc.fill")
                            .frame(width: 44, height: 44)
                            .foregroundStyle(Color.textPrimary)
                            .background(Color.bgElevated)
                            .clipShape(Circle())
                            .atenderShadow(.card)
                    }
                    .accessibilityIdentifier("room-fab-ics")
                    Button { activeSheet = .event } label: {
                        HStack(spacing: Space.s2) {
                            Image(systemName: "plus")
                            Text("予定を追加")
                        }
                        .font(.atenderSm)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.textOnAccent)
                        .padding(.horizontal, Space.s4)
                        .frame(height: 48)
                        .background(Color.accent500)
                        .clipShape(Capsule())
                        .atenderShadow(.glowSoft)
                    }
                    .accessibilityIdentifier("room-fab-event")
                }
                .padding(.trailing, Space.s4)
                .padding(.bottom, Space.s6)
            }
        }
        .task(id: "\(viewMode.rawValue)-\(anchor)") {
            await reload()
        }
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .event:
                RoomEventCreateSheet(roomId: roomId, defaultDate: selectedDate, isPresented: activeSheetBinding) {
                    await reload(force: true)
                }
            case .ics:
                IcsImportWizard(roomId: roomId, isPresented: activeSheetBinding) {
                    await reload(force: true)
                }
            case .editEvent(let event):
                RoomEventEditSheet(roomId: roomId, event: event, isPresented: activeSheetBinding) {
                    await reload(force: true)
                }
            }
        }
    }

    private var activeSheetBinding: Binding<Bool> {
        Binding(get: { activeSheet != nil }, set: { if !$0 { activeSheet = nil } })
    }

    private func selectRoomEvent(_ event: CalendarEvent) {
        guard let roomEvent = resolveRoomEvent(for: event) else { return }
        activeSheet = .editEvent(roomEvent)
    }

    private func resolveRoomEvent(for event: CalendarEvent) -> RoomEventDto? {
        guard event.kind == .roomEvent, event.id.hasPrefix("room:") else { return nil }
        let parts = event.id.split(separator: ":", maxSplits: 2).map(String.init)
        guard parts.count == 3 else { return nil }
        let seriesId = parts[1]
        let occurrenceDate = parts[2]
        return weeks.flatMap(\.roomEvents).first {
            $0.seriesId == seriesId && $0.occurrenceDate == occurrenceDate
        }
    }

    private func reload(force: Bool = false) async {
        isLoading = true
        loadError = false
        defer { isLoading = false }
        do {
            let starts = CalendarRange.weekStartsFor(viewMode, anchor: anchor)
            var loaded: [RoomWeekDto] = []
            for start in starts {
                let week = try await environment.roomRepository.roomWeek(id: roomId, weekStart: start, force: force)
                loaded.append(week)
            }
            weeks = loaded.sorted { $0.weekStart < $1.weekStart }
        } catch {
            loadError = true
        }
    }
}

struct RoomDayEventList: View {
    let date: String
    let events: [CalendarEvent]
    var onSelectEvent: ((CalendarEvent) -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("\(CalendarRange.format(date, .monthDay)) の予定")
                .font(.atenderXs)
                .foregroundStyle(Color.textTertiary)
            if events.isEmpty {
                Text("予定なし").font(.atenderSm).foregroundStyle(Color.textTertiary)
            } else {
                ForEach(events) { event in
                    eventRow(event)
                }
            }
        }
        .padding(Space.s4)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .atenderShadow(.card)
    }

    @ViewBuilder
    private func eventRow(_ event: CalendarEvent) -> some View {
        let row = HStack(spacing: Space.s2) {
            Capsule().fill(Color(hexString: event.color)).frame(width: 4, height: 28)
            Text(TimeFormatting.minutesToTime(event.startMinute))
                .font(.atenderXs)
                .foregroundStyle(Color(hexString: event.color))
            Text(event.title)
                .font(.atenderSm)
                .fontWeight(.bold)
                .foregroundStyle(Color.textPrimary)
                .lineLimit(1)
            Spacer()
            Text(event.subtitle)
                .font(.caption2)
                .foregroundStyle(Color.textTertiary)
                .lineLimit(1)
        }
        .padding(Space.s2)
        .background(Color(hexString: event.color).opacity(0.15))
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))

        if event.kind == .roomEvent, let onSelectEvent {
            Button { onSelectEvent(event) } label: {
                row
            }
            .buttonStyle(.plain)
        } else {
            row
        }
    }
}

struct AvailabilityBar: View {
    let date: String
    let members: [RoomWeekDto.Member]
    let events: [CalendarEvent]
    let expanded: Bool
    let onToggle: () -> Void

    var body: some View {
        let result = RoomAvailability.compute(members: members, events: events)
        VStack(alignment: .leading, spacing: Space.s3) {
            HStack {
                Text("\(CalendarRange.format(date, .monthDay)) の空き時間")
                    .font(.atenderBase)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.textPrimary)
                Spacer()
                Button(action: onToggle) {
                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .frame(width: 40, height: 40)
                        .background(Color.textPrimary.opacity(0.06))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
            HStack {
                Text("").frame(width: 44)
                ForEach(9...18, id: \.self) { hour in
                    Text("\(hour)").font(.caption2).fontWeight(.bold).foregroundStyle(Color.textTertiary).frame(maxWidth: .infinity)
                }
            }
            BarRow(label: "全員", busyCounts: result.combined, total: max(1, members.count), color: nil)
            if expanded {
                ForEach(members) { member in
                    let busy = result.perMember.first { $0.userId == member.userId }?.busy ?? Array(repeating: false, count: 18)
                    BarRow(label: RoomCalendarLogic.memberName(name: member.name, handle: member.handle), busyCounts: busy.map { $0 ? 1 : 0 }, total: 1, color: member.color)
                }
            }
        }
        .padding(Space.s4)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .atenderShadow(.card)
        .accessibilityIdentifier("availability-bar")
    }
}

private struct BarRow: View {
    let label: String
    let busyCounts: [Int]
    let total: Int
    let color: String?

    var body: some View {
        HStack(spacing: Space.s2) {
            Text(label)
                .font(.caption2).fontWeight(.bold)
                .foregroundStyle(Color.textSecondary)
                .lineLimit(1)
                .frame(width: 44, alignment: .leading)
            HStack(spacing: 1) {
                ForEach(0..<18, id: \.self) { index in
                    let count = index < busyCounts.count ? busyCounts[index] : 0
                    let ratio = total == 0 ? 0 : Double(count) / Double(total)
                    Rectangle()
                        .fill(ratio == 0 ? Color.clear : (color.map { Color(hexString: $0).opacity(ratio) } ?? Color.accent500.opacity(ratio)))
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 20)
            .background(Color.textPrimary.opacity(0.04))
            .clipShape(Capsule())
        }
    }
}

struct RoomTimetable: View {
    let roomId: String
    let available: CGFloat
    @Environment(AppEnvironment.self) private var environment
    @State private var week: RoomWeekDto?
    @State private var daySlots: [DaySlotDto] = RoomTimetableLogic.defaultSlots
    @State private var isLoading = false
    @State private var loadError = false

    var body: some View {
        Group {
            if isLoading {
                Skeleton(width: nil, height: 420, radius: Radius.md)
            } else if loadError {
                Panel { Text("時間割を読み込めませんでした。").foregroundStyle(Color.textSecondary) }
            } else if let week {
                let events = RoomTimetableLogic.buildRecurringEvents(week: week)
                if events.isEmpty {
                    EmptyState(title: week.members.isEmpty ? "メンバーがいません" : "メンバーの時間割がまだありません")
                } else {
                    TimetableGrid(
                        daySlots: daySlots,
                        events: events,
                        days: RoomTimetableLogic.displayDays(events: events),
                        available: available,
                        todayDisplayDay: SchoolClock.displayDay(),
                        currentPeriodIndex: TimetableGridLayout.currentPeriodIndex(daySlots: daySlots, nowMinute: SchoolClock.nowMinute())
                    )
                }
            }
        }
        .accessibilityIdentifier("room-timetable")
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        loadError = false
        defer { isLoading = false }
        do {
            async let roomWeek = environment.roomRepository.roomWeek(id: roomId, weekStart: CalendarRange.mondayOf(SchoolClock.todayString()), force: true)
            async let me = environment.meRepository.me()
            async let timetables = environment.timetableRepository.userTimetables()
            let meResponse = try await me
            daySlots = try await RoomTimetableLogic.resolveDaySlots(defaultSemesterId: meResponse.user.defaultSemesterId, timetables: timetables)
            week = try await roomWeek
        } catch {
            loadError = true
        }
    }
}
