import SwiftUI

struct RoomTimetable: View {
    let roomId: String
    var semesterId: String? = nil
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
                    ScrollView {
                        TimetableGrid(
                            daySlots: daySlots,
                            events: events,
                            days: RoomTimetableLogic.displayDays(events: events),
                            available: available,
                            todayDisplayDay: SchoolClock.displayDay(),
                            currentPeriodIndex: TimetableGridLayout.currentPeriodIndex(daySlots: daySlots, nowMinute: SchoolClock.nowMinute())
                        )
                    }
                    .atenderPageScroll()
                }
            } else {
                // ★ else が無いと Group が EmptyView に解決され SwiftUI がホストを作らないため
                //   .task が一度も発火せず load() が走らない (自己デッドロック)。
                //   RoomCalendar.swift / PersonalCalendar.swift と同じガードを置く。
                Color.clear
                    .frame(height: 0)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityIdentifier("room-timetable")
        .task(id: semesterId) { await load() }
    }

    private func load() async {
        isLoading = true
        loadError = false
        defer { isLoading = false }
        do {
            async let roomWeek = environment.roomRepository.roomWeek(
                id: roomId,
                weekStart: CalendarRange.mondayOf(SchoolClock.todayString()),
                semesterId: semesterId,
                force: true
            )
            async let me = environment.meRepository.me()
            async let timetables = environment.timetableRepository.userTimetables()
            let meResponse = try await me
            daySlots = try await RoomTimetableLogic.resolveDaySlots(
                preferredSemesterId: semesterId,
                defaultSemesterId: meResponse.user.defaultSemesterId,
                timetables: timetables
            )
            week = try await roomWeek
        } catch {
            loadError = true
        }
    }
}
