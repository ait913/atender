import Foundation

struct ReconcilePlan: Equatable {
    var uploads: [EventKitSyncEvent]
    var pushToEK: [PersonalEventDto]
}

enum EventKitReconciler {
    static func uploads(from snapshots: [EKEventSnapshot]) -> [EventKitSyncEvent] {
        snapshots.map {
            EventKitSyncEvent(
                ekExternalId: $0.externalId,
                ekCalendarId: $0.calendarId,
                ekLastModified: $0.lastModified.map(Self.iso),
                date: $0.date,
                title: $0.title,
                isAllDay: $0.isAllDay,
                startMinute: $0.startMinute,
                endMinute: $0.endMinute
            )
        }
    }

    static func pushTargets(manualNeedingPush: [PersonalEventDto], recentlyWritten: Set<String>) -> [PersonalEventDto] {
        manualNeedingPush.filter { event in
            guard let externalId = event.ekExternalId else { return true }
            return !recentlyWritten.contains(externalId)
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
