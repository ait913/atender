import EventKit
import Foundation
import UIKit

/// EventKit の I/O 境界 (§6.4)。EKEvent / EKCalendar を外へ出さず、Sendable な値型だけを返す。
/// actor にしているのは学期ぶんの授業 (数百件) の save で主スレッドを占有しないため (B8)。
actor EventKitStore {
    private let store = EKEventStore()

    nonisolated static func currentAccess() -> EventKitAccess {
        map(EKEventStore.authorizationStatus(for: .event))
    }

    func requestFullAccess() async -> EventKitAccess {
        _ = try? await store.requestFullAccessToEvents()
        return Self.currentAccess()
    }

    func refreshSources() {
        store.refreshSourcesIfNecessary()
    }

    struct StoreSnapshot: Sendable {
        let calendars: [EKCalendarSnapshot]
        let sources: [EKSourceSnapshot]
        let defaultCalendarSourceId: String?
    }

    func snapshot() -> StoreSnapshot {
        guard Self.currentAccess() == .fullAccess else {
            return StoreSnapshot(calendars: [], sources: [], defaultCalendarSourceId: nil)
        }
        store.refreshSourcesIfNecessary()
        let calendars = store.calendars(for: .event)
            .sorted { "\($0.source.title)\($0.title)" < "\($1.source.title)\($1.title)" }
            .map(Self.calendarSnapshot)
        let sources = store.sources.map(Self.sourceSnapshot)
        return StoreSnapshot(
            calendars: calendars,
            sources: sources,
            defaultCalendarSourceId: store.defaultCalendarForNewEvents?.source.sourceIdentifier
        )
    }

    func createCalendar(title: String, colorHex: String, sourceId: String) throws -> String {
        guard let source = store.sources.first(where: { $0.sourceIdentifier == sourceId }) else {
            throw CalendarSyncError.noWritableSource
        }
        let calendar = EKCalendar(for: .event, eventStore: store)
        calendar.title = title
        calendar.source = source
        if let cgColor = Self.cgColor(hex: colorHex) {
            calendar.cgColor = cgColor
        }
        do {
            try store.saveCalendar(calendar, commit: true)
        } catch {
            throw CalendarSyncError.calendarCreateFailed(error.localizedDescription)
        }
        return calendar.calendarIdentifier
    }

    func fetchExported(calendarId: String, window: DateInterval) -> [ExportedEvent] {
        guard Self.currentAccess() == .fullAccess else { return [] }
        guard let calendar = store.calendar(withIdentifier: calendarId) else { return [] }
        let predicate = store.predicateForEvents(withStart: window.start, end: window.end, calendars: [calendar])
        return store.events(matching: predicate).map { event in
            let urlString = event.url?.absoluteString
            return ExportedEvent(
                key: ExportKey.isOwned(urlString) ? urlString : nil,
                eventIdentifier: event.eventIdentifier ?? "",
                title: event.title ?? "",
                start: event.startDate,
                end: event.endDate,
                isAllDay: event.isAllDay,
                location: event.location,
                notes: event.notes
            )
        }
    }

    func apply(_ plan: ExportPlan, calendarId: String) throws -> ExportSummary {
        guard let calendar = store.calendar(withIdentifier: calendarId) else {
            throw CalendarSyncError.calendarLookupTransient
        }
        guard calendar.allowsContentModifications else { throw CalendarSyncError.calendarReadOnly }

        var summary = ExportSummary(unchanged: plan.unchanged, foreign: plan.foreign)
        do {
            for identifier in plan.deletes {
                guard let event = store.event(withIdentifier: identifier) else { continue }
                try store.remove(event, span: .thisEvent, commit: false)
                summary.deleted += 1
            }
            for update in plan.updates {
                if let event = store.event(withIdentifier: update.eventIdentifier) {
                    Self.applyFields(update.item, to: event)
                    try store.save(event, span: .thisEvent, commit: false)
                    summary.updated += 1
                } else {
                    // 実行中に消えていた → create にフォールバック
                    let event = EKEvent(eventStore: store)
                    Self.applyFields(update.item, to: event)
                    event.calendar = calendar
                    try store.save(event, span: .thisEvent, commit: false)
                    summary.created += 1
                }
            }
            for item in plan.creates {
                let event = EKEvent(eventStore: store)
                Self.applyFields(item, to: event)
                event.calendar = calendar
                try store.save(event, span: .thisEvent, commit: false)
                summary.created += 1
            }
            try store.commit()
        } catch let error as CalendarSyncError {
            store.reset()
            throw error
        } catch {
            store.reset()
            throw CalendarSyncError.applyFailed(error.localizedDescription)
        }
        return summary
    }

    /// 読み込み用 (Atender カレンダーは呼び出し側で除外済み)
    func fetchSnapshots(range: DateInterval, calendarIds: Set<String>) -> [EKEventSnapshot] {
        guard Self.currentAccess() == .fullAccess, !calendarIds.isEmpty else { return [] }
        store.refreshSourcesIfNecessary()
        let calendars = store.calendars(for: .event).filter { calendarIds.contains($0.calendarIdentifier) }
        guard !calendars.isEmpty else { return [] }
        let predicate = store.predicateForEvents(withStart: range.start, end: range.end, calendars: calendars)
        return store.events(matching: predicate).map { event in
            EKEventSnapshot(
                externalId: event.calendarItemExternalIdentifier,
                calendarId: event.calendar.calendarIdentifier,
                occurrenceStart: event.occurrenceDate ?? event.startDate,
                lastModified: event.lastModifiedDate,
                start: event.startDate,
                end: event.endDate,
                isAllDay: event.isAllDay,
                title: (event.title?.isEmpty ?? true) ? "予定" : event.title,
                location: event.location
            )
        }
    }

    /// build 11 以前が既定カレンダーへ push したイベントの掃除
    func removeEvents(externalIds: [String], excludingCalendarId: String?) -> Int {
        guard Self.currentAccess() == .fullAccess, !externalIds.isEmpty else { return 0 }
        var removed = 0
        for externalId in externalIds {
            let events = store.calendarItems(withExternalIdentifier: externalId).compactMap { $0 as? EKEvent }
            for event in events {
                if let excludingCalendarId, event.calendar?.calendarIdentifier == excludingCalendarId { continue }
                if (try? store.remove(event, span: .thisEvent, commit: false)) != nil { removed += 1 }
            }
        }
        if removed > 0 {
            if (try? store.commit()) == nil { store.reset() }
        }
        return removed
    }

    /// Atender カレンダー内の owned だけを全削除する (カレンダー自体は残す)
    func wipeOwned(calendarId: String, window: DateInterval) throws -> Int {
        guard let calendar = store.calendar(withIdentifier: calendarId) else { return 0 }
        let predicate = store.predicateForEvents(withStart: window.start, end: window.end, calendars: [calendar])
        var removed = 0
        do {
            for event in store.events(matching: predicate) where ExportKey.isOwned(event.url?.absoluteString) {
                try store.remove(event, span: .thisEvent, commit: false)
                removed += 1
            }
            try store.commit()
        } catch {
            store.reset()
            throw CalendarSyncError.applyFailed(error.localizedDescription)
        }
        return removed
    }

    // MARK: - private

    private static func applyFields(_ item: ExportItem, to event: EKEvent) {
        event.title = item.title
        event.isAllDay = item.isAllDay
        event.startDate = item.start
        event.endDate = item.end
        event.location = item.location
        event.notes = item.notes
        event.url = URL(string: item.key)
        // alarms / recurrenceRules は触らない (T3 / §5.3-9)
    }

    private static func map(_ status: EKAuthorizationStatus) -> EventKitAccess {
        switch status {
        case .notDetermined: return .notDetermined
        case .restricted: return .restricted
        case .denied: return .denied
        case .writeOnly: return .writeOnly
        case .fullAccess, .authorized: return .fullAccess
        @unknown default: return .denied
        }
    }

    private static func sourceKind(_ type: EKSourceType) -> EKSourceKind {
        switch type {
        case .local: return .local
        case .exchange: return .exchange
        case .calDAV: return .calDAV
        case .mobileMe: return .mobileMe
        case .subscribed: return .subscribed
        case .birthdays: return .birthdays
        @unknown default: return .other
        }
    }

    private static func sourceSnapshot(_ source: EKSource) -> EKSourceSnapshot {
        EKSourceSnapshot(id: source.sourceIdentifier, title: source.title, kind: sourceKind(source.sourceType))
    }

    private static func calendarSnapshot(_ calendar: EKCalendar) -> EKCalendarSnapshot {
        EKCalendarSnapshot(
            id: calendar.calendarIdentifier,
            title: calendar.title,
            sourceId: calendar.source.sourceIdentifier,
            sourceTitle: calendar.source.title,
            colorHex: UIColor(cgColor: calendar.cgColor).atenderHexString,
            allowsModify: calendar.allowsContentModifications,
            allowsEvents: calendar.allowedEntityTypes.contains(.event)
        )
    }

    private static func cgColor(hex: String) -> CGColor? {
        var value = hex
        if value.hasPrefix("#") { value.removeFirst() }
        guard value.count == 6, let rgb = UInt32(value, radix: 16) else { return nil }
        let red = CGFloat((rgb & 0xFF0000) >> 16) / 255
        let green = CGFloat((rgb & 0x00FF00) >> 8) / 255
        let blue = CGFloat(rgb & 0x0000FF) / 255
        return UIColor(red: red, green: green, blue: blue, alpha: 1).cgColor
    }
}

private extension UIColor {
    var atenderHexString: String? {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        guard getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return nil }
        return String(format: "#%02X%02X%02X", Int(red * 255), Int(green * 255), Int(blue * 255))
    }
}
