import EventKit
import Foundation
import Observation
import UIKit

struct EKCalendarInfo: Identifiable, Equatable {
    let id: String
    let title: String
    let sourceTitle: String
    let colorHex: String?
    let allowsModify: Bool
}

@MainActor
@Observable
final class EventKitService {
    enum Access: Equatable {
        case notDetermined
        case denied
        case restricted
        case writeOnly
        case fullAccess
    }

    private(set) var access: Access
    @ObservationIgnored private let store = EKEventStore()
    @ObservationIgnored private var observer: NSObjectProtocol?
    @ObservationIgnored private var foregroundObserver: NSObjectProtocol?

    init() {
        access = Self.map(EKEventStore.authorizationStatus(for: .event))
    }

    func currentAccess() -> Access {
        access = Self.map(EKEventStore.authorizationStatus(for: .event))
        return access
    }

    func requestFullAccess() async -> Access {
        do {
            _ = try await store.requestFullAccessToEvents()
        } catch {
            access = currentAccess()
            return access
        }
        access = currentAccess()
        return access
    }

    func availableCalendars() -> [EKCalendarInfo] {
        guard currentAccess() == .fullAccess else { return [] }
        store.refreshSourcesIfNecessary()
        return store.calendars(for: .event)
            .sorted { "\($0.source.title)\($0.title)" < "\($1.source.title)\($1.title)" }
            .map(Self.calendarInfo)
    }

    func defaultWriteCalendarId() -> String? {
        guard currentAccess() == .fullAccess else { return nil }
        return store.defaultCalendarForNewEvents?.calendarIdentifier
    }

    func fetchSnapshots(range: DateInterval, calendarIds: Set<String>) -> [EKEventSnapshot] {
        guard currentAccess() == .fullAccess, !calendarIds.isEmpty else { return [] }
        store.refreshSourcesIfNecessary()
        let calendars = store.calendars(for: .event).filter { calendarIds.contains($0.calendarIdentifier) }
        guard !calendars.isEmpty else { return [] }
        let predicate = store.predicateForEvents(withStart: range.start, end: range.end, calendars: calendars)
        return store.events(matching: predicate).flatMap { event in
            EventKitTimeMapping.toPersonalDays(start: event.startDate, end: event.endDate, isAllDay: event.isAllDay).map { day in
                EKEventSnapshot(
                    externalId: event.calendarItemExternalIdentifier,
                    calendarId: event.calendar.calendarIdentifier,
                    lastModified: event.lastModifiedDate,
                    date: day.date,
                    title: event.title.isEmpty ? "予定" : event.title,
                    isAllDay: day.isAllDay,
                    startMinute: day.startMinute,
                    endMinute: day.endMinute
                )
            }
        }
    }

    func createEvent(_ pe: PersonalEventDto, in calendarId: String) throws -> String {
        guard currentAccess() == .fullAccess else { throw EventKitServiceError.accessDenied }
        guard let calendar = store.calendar(withIdentifier: calendarId) ?? store.defaultCalendarForNewEvents else {
            throw EventKitServiceError.calendarNotFound
        }
        guard calendar.allowsContentModifications else { throw EventKitServiceError.calendarReadOnly }
        let event = EKEvent(eventStore: store)
        apply(pe, to: event)
        event.calendar = calendar
        try store.save(event, span: .thisEvent, commit: true)
        return event.calendarItemExternalIdentifier
    }

    func updateEvent(externalId: String, _ pe: PersonalEventDto) throws {
        guard currentAccess() == .fullAccess else { throw EventKitServiceError.accessDenied }
        guard let event = findEvent(externalId: externalId) else { throw EventKitServiceError.eventNotFound }
        apply(pe, to: event)
        try store.save(event, span: .thisEvent, commit: true)
    }

    func deleteEvent(externalId: String) throws {
        guard currentAccess() == .fullAccess else { throw EventKitServiceError.accessDenied }
        guard let event = findEvent(externalId: externalId) else { return }
        try store.remove(event, span: .thisEvent, commit: true)
    }

    func startObserving(_ onChange: @escaping @MainActor @Sendable () -> Void) {
        if observer == nil {
            observer = NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: store, queue: .main) { _ in
                Task { @MainActor in onChange() }
            }
        }
        if foregroundObserver == nil {
            foregroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { _ in
                Task { @MainActor in onChange() }
            }
        }
    }

    private func apply(_ pe: PersonalEventDto, to event: EKEvent) {
        let absolute = EventKitTimeMapping.toAbsolute(date: pe.date, isAllDay: pe.isAllDay, startMinute: pe.startMinute, endMinute: pe.endMinute)
        event.title = pe.title
        event.notes = pe.note
        event.isAllDay = pe.isAllDay
        event.startDate = absolute.start
        event.endDate = absolute.end
    }

    private func findEvent(externalId: String) -> EKEvent? {
        store.calendarItems(withExternalIdentifier: externalId).compactMap { $0 as? EKEvent }.first
    }

    private static func map(_ status: EKAuthorizationStatus) -> Access {
        switch status {
        case .notDetermined: return .notDetermined
        case .restricted: return .restricted
        case .denied: return .denied
        case .writeOnly: return .writeOnly
        case .fullAccess, .authorized: return .fullAccess
        @unknown default: return .denied
        }
    }

    private static func calendarInfo(_ calendar: EKCalendar) -> EKCalendarInfo {
        EKCalendarInfo(
            id: calendar.calendarIdentifier,
            title: calendar.title,
            sourceTitle: calendar.source.title,
            colorHex: UIColor(cgColor: calendar.cgColor).hexString,
            allowsModify: calendar.allowsContentModifications
        )
    }
}

enum EventKitServiceError: Error {
    case accessDenied
    case calendarNotFound
    case calendarReadOnly
    case eventNotFound
}

private extension UIColor {
    var hexString: String? {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        guard getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return nil }
        return String(format: "#%02X%02X%02X", Int(red * 255), Int(green * 255), Int(blue * 255))
    }
}
