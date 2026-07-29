import Foundation

struct ReconcilePlan: Equatable {
    var uploads: [EventKitSyncEvent]
}

enum EventKitReconciler {
    static func uploads(from snapshots: [EKEventSnapshot]) -> [EventKitSyncEvent] {
        snapshots.map {
            EventKitSyncEvent(
                ekExternalId: $0.externalId,
                ekCalendarId: $0.calendarId,
                ekOccurrenceStart: Self.iso($0.occurrenceStart),
                ekLastModified: $0.lastModified.map(Self.iso),
                start: Self.iso($0.start),
                end: Self.iso($0.end),
                isAllDay: $0.isAllDay,
                title: $0.title,
                location: $0.location
            )
        }
    }

    static func iso(_ date: Date) -> String {
        ISO8601DateFormatter.internet.string(from: date)
    }
}

extension ISO8601DateFormatter {
    nonisolated(unsafe) static let internet: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
