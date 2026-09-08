import SwiftUI

@MainActor
@Observable
private final class RoomCalendarViewModel {
    @ObservationIgnored private let environment: AppEnvironment
    let roomId: String
    let store: CalendarMonthStore<[RoomWeekDto]>

    /// ★ ルームカレンダーは `semesterId` を使わない (§7.2 表 4: 「ルームカレンダーは日付ベースの
    ///   occurrence なので学期に依存しない」)。`buildCalendarEvents` は `week.meetings` と
    ///   `week.roomEvents` しか読まず `recurringMeetings` を参照しないため、`semesterId` を
    ///   流すと表示は 1 ピクセルも変わらないまま `RoomRepository` のキャッシュキー
    ///   (`rooms/<id>/week/<weekStart>/<semesterId ?? "-">`) だけが分割され、
    ///   ホーム経路 (semesterId あり) とルーム詳細経路 (nil) で同じ週を 2 回取りに行く。
    init(environment: AppEnvironment, roomId: String) {
        self.environment = environment
        self.roomId = roomId
        let originMonth = CalendarRange.monthFirst(SchoolClock.todayString())
        store = CalendarMonthStore<[RoomWeekDto]>(
            visibleMonth: originMonth,
            semesterId: nil
        ) { request in
            let starts = CalendarRange.weekStartsFor(.month, anchor: request.monthFirst)
            var weeks: [RoomWeekDto] = []
            for start in starts {
                weeks.append(try await environment.roomRepository.roomWeek(
                    id: roomId, weekStart: start, semesterId: nil, force: request.force))
            }
            weeks.sort { $0.weekStart < $1.weekStart }
            return .init(events: RoomCalendarLogic.buildCalendarEvents(weeks: weeks),
                         daySummaries: [:],
                         extra: weeks)
        }
    }

    /// ★ 日別シートは「可視月のグリッド 42 日」から開かれる。payload は月グリッド全体
    ///   (前後月のはみ出し日を含む 6 週) を持つので、**date の月ではなく可視月**で引く。
    func events(on date: String) -> [CalendarEvent] {
        store.payload(store.visibleMonth)?.events.filter { $0.date == date } ?? []
    }

    func resolveRoomEvent(rowId: String) -> RoomEventDto? {
        guard let key = RoomCalendarLogic.parseRoomEventKey(rowId) else { return nil }
        return (store.payload(store.visibleMonth)?.extra ?? [])
            .flatMap(\.roomEvents)
            .first { $0.seriesId == key.seriesId && $0.occurrenceDate == key.occurrenceDate }
    }
}

struct RoomCalendar: View {
    let roomId: String
    /// §7.2 表 4: ルームカレンダーは学期に依存しない。API 互換のため受け取りだけ残し、
    /// ストア / キャッシュキーには流さない (流すと同じ週を 2 度取りに行く)。
    var semesterId: String? = nil
    let available: CGFloat
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: RoomCalendarViewModel?
    @State private var icsOpen = false

    var body: some View {
        Group {
            if let model = viewModel {
                CalendarScreen(
                    store: model.store,
                    options: .room,
                    available: available,
                    originMonth: CalendarRange.monthFirst(SchoolClock.todayString())
                ) { context in
                    RoomDaySheet(
                        roomId: roomId,
                        date: context.date,
                        events: model.events(on: context.date),
                        resolveRoomEvent: { model.resolveRoomEvent(rowId: $0) },
                        path: context.path,
                        onChanged: context.onChanged,
                        onClose: context.onClose
                    )
                } headerAccessory: {
                    Button {
                        icsOpen = true
                    } label: {
                        Image(systemName: "arrow.down.doc")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Color.accent500)
                            .frame(width: 32, height: 32)
                            .background(Color.bgElevated, in: Circle())
                            .overlay(Circle().stroke(Color.borderSubtle, lineWidth: 1))
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("room-ics-import")
                    .accessibilityLabel("カレンダーを取り込む")
                }
                .sheet(isPresented: $icsOpen) {
                    IcsImportWizard(roomId: roomId, isPresented: $icsOpen) {
                        await model.store.refreshVisible()
                    }
                }
            } else {
                Color.clear
                    .frame(height: 0)
                    .accessibilityHidden(true)
            }
        }
        .task {
            if viewModel == nil {
                viewModel = RoomCalendarViewModel(environment: environment, roomId: roomId)
            }
        }
    }
}
