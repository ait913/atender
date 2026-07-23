import XCTest
@testable import Atender

final class EventKitReconcilerTests: XCTestCase {

    private let decoder = JSONDecoder()

    private func date(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso)!
    }

    private func personalEvent(
        id: String,
        title: String,
        ekExternalId: String?
    ) throws -> PersonalEventDto {
        let externalIdJson = ekExternalId.map { #""\#($0)""# } ?? "null"
        let json = """
        {
          "id": "\(id)",
          "semesterId": null,
          "date": "2026-07-25",
          "title": "\(title)",
          "isAllDay": false,
          "startMinute": 540,
          "endMinute": 630,
          "color": null,
          "note": null,
          "source": "MANUAL",
          "ekExternalId": \(externalIdJson),
          "ekCalendarId": null,
          "ekLastModified": null,
          "createdAt": "2026-07-20T00:00:00.000Z",
          "updatedAt": "2026-07-20T00:00:00.000Z"
        }
        """
        return try decoder.decode(PersonalEventDto.self, from: Data(json.utf8))
    }

    // uploads
    func testUploadsMapsSnapshotsToSyncEvents() {
        let snapshots = [
            EKEventSnapshot(
                externalId: "ek-e1",
                calendarId: "cal-a",
                lastModified: date("2026-07-20T00:00:00Z"),
                date: "2026-07-25",
                title: "timed",
                isAllDay: false,
                startMinute: 30,
                endMinute: 60
            ),
            EKEventSnapshot(
                externalId: "ek-e2",
                calendarId: "cal-b",
                lastModified: nil,
                date: "2026-07-26",
                title: "all-day",
                isAllDay: true,
                startMinute: nil,
                endMinute: nil
            ),
        ]

        let uploads = EventKitReconciler.uploads(from: snapshots)

        XCTAssertEqual(uploads.count, 2, "[uploads]")
        XCTAssertEqual(uploads[0].ekExternalId, "ek-e1", "[uploads]")
        XCTAssertEqual(uploads[0].ekCalendarId, "cal-a", "[uploads]")
        XCTAssertEqual(uploads[0].date, "2026-07-25", "[uploads]")
        XCTAssertEqual(uploads[0].title, "timed", "[uploads]")
        XCTAssertEqual(uploads[0].isAllDay, false, "[uploads]")
        XCTAssertEqual(uploads[0].startMinute, 30, "[uploads]")
        XCTAssertEqual(uploads[0].endMinute, 60, "[uploads]")
        XCTAssertNotNil(uploads[0].ekLastModified, "[uploads]")

        XCTAssertEqual(uploads[1].ekExternalId, "ek-e2", "[uploads]")
        XCTAssertEqual(uploads[1].ekCalendarId, "cal-b", "[uploads]")
        XCTAssertEqual(uploads[1].date, "2026-07-26", "[uploads]")
        XCTAssertEqual(uploads[1].title, "all-day", "[uploads]")
        XCTAssertEqual(uploads[1].isAllDay, true, "[uploads]")
        XCTAssertNil(uploads[1].startMinute, "[uploads]")
        XCTAssertNil(uploads[1].endMinute, "[uploads]")
        XCTAssertNil(uploads[1].ekLastModified, "[uploads]")
    }

    // pushTargets
    func testPushTargetsReturnsAllManualNeedingPushWhenRecentlyWrittenIsEmpty() throws {
        let first = try personalEvent(id: "p1", title: "first", ekExternalId: nil)
        let second = try personalEvent(id: "p2", title: "second", ekExternalId: "ek-e2")

        let targets = EventKitReconciler.pushTargets(
            manualNeedingPush: [first, second],
            recentlyWritten: []
        )

        XCTAssertEqual(targets.map(\.id), ["p1", "p2"], "[pushTargets]")
    }

    // pushTargets
    func testPushTargetsFiltersEventsWhoseExternalIdWasRecentlyWritten() throws {
        let noExternalId = try personalEvent(id: "p1", title: "no external id", ekExternalId: nil)
        let recentlyWritten = try personalEvent(id: "p2", title: "skip", ekExternalId: "ek-skip")
        let untouched = try personalEvent(id: "p3", title: "keep", ekExternalId: "ek-keep")

        let targets = EventKitReconciler.pushTargets(
            manualNeedingPush: [noExternalId, recentlyWritten, untouched],
            recentlyWritten: ["ek-skip"]
        )

        XCTAssertEqual(targets.map(\.id), ["p1", "p3"], "[pushTargets]")
    }
}
