import Foundation
import Observation

@MainActor
@Observable
final class CalendarSyncCoordinator {
    @ObservationIgnored private let eventKit: EventKitService
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient
    @ObservationIgnored private var recentlyWritten: Set<String> = []

    var lastError: String?
    var isSyncing = false

    var access: EventKitService.Access { eventKit.currentAccess() }

    var linkedCalendarIds: Set<String> {
        get { Set(UserDefaults.standard.stringArray(forKey: Keys.linkedCalendarIds) ?? []) }
        set { UserDefaults.standard.set(Array(newValue), forKey: Keys.linkedCalendarIds) }
    }

    var writeTargetCalendarId: String? {
        get { UserDefaults.standard.string(forKey: Keys.writeTargetCalendarId) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.writeTargetCalendarId) }
    }

    init(eventKit: EventKitService, client: APIClient, cache: QueryClient) {
        self.eventKit = eventKit
        self.client = client
        self.cache = cache
        eventKit.startObserving { [weak self] in
            guard let self else { return }
            Task { await self.syncCurrentMonth() }
        }
    }

    func requestFullAccess() async -> EventKitService.Access {
        let next = await eventKit.requestFullAccess()
        if next == .fullAccess, writeTargetCalendarId == nil {
            writeTargetCalendarId = eventKit.defaultWriteCalendarId()
        }
        return next
    }

    func availableCalendars() -> [EKCalendarInfo] {
        eventKit.availableCalendars()
    }

    func syncCurrentMonth() async {
        let range = CalendarRange.monthGridRange(anchorMonthFirst: CalendarRange.monthFirst(SchoolClock.todayString()))
        await sync(range: dateInterval(from: range.start, to: range.end))
    }

    func sync(range: DateInterval) async {
        guard eventKit.currentAccess() == .fullAccess else { return }
        guard !linkedCalendarIds.isEmpty else { return }
        isSyncing = true
        lastError = nil
        defer { isSyncing = false }

        do {
            let snapshots = eventKit.fetchSnapshots(range: range, calendarIds: linkedCalendarIds)
            let input = EventKitSyncInput(
                range: .init(from: SchoolClock.todayString(range.start), to: SchoolClock.todayString(range.end.addingTimeInterval(-1))),
                events: EventKitReconciler.uploads(from: snapshots)
            )
            let response = try await client.send(Endpoints.eventKitSync(input), as: EventKitSyncResponse.self)
            for event in EventKitReconciler.pushTargets(manualNeedingPush: response.manualNeedingPush, recentlyWritten: recentlyWritten) {
                try await pushManualEvent(event)
            }
            cache.invalidate(prefixes: [.personalEvents()])
        } catch {
            lastError = error.localizedDescription
        }
    }

    func pushManualEvent(_ event: PersonalEventDto) async throws {
        guard event.ekExternalId == nil, eventKit.currentAccess() == .fullAccess else { return }
        let target = writeTargetCalendarId ?? eventKit.defaultWriteCalendarId()
        guard let target else { return }
        let externalId = try eventKit.createEvent(event, in: target)
        recentlyWritten.insert(externalId)
        _ = try await client.send(
            Endpoints.updatePersonalEvent(id: event.id, PersonalEventUpdateInput(
                ekExternalId: externalId,
                ekCalendarId: target
            )),
            as: PersonalEventResponse.self
        )
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            await MainActor.run { self?.recentlyWritten.remove(externalId) }
        }
        cache.invalidate(prefixes: [.personalEvents()])
    }

    private func dateInterval(from: String, to: String) -> DateInterval {
        let start = EventKitTimeMapping.toAbsolute(date: from, isAllDay: true, startMinute: nil, endMinute: nil).start
        let end = EventKitTimeMapping.toAbsolute(date: CalendarRange.addDays(to, 1), isAllDay: true, startMinute: nil, endMinute: nil).start
        return DateInterval(start: start, end: end)
    }

    private enum Keys {
        static let linkedCalendarIds = "atender.eventkit.linkedCalendarIds"
        static let writeTargetCalendarId = "atender.eventkit.writeTargetCalendarId"
    }
}
