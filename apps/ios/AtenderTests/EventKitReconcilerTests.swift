import XCTest
@testable import Atender

final class EventKitReconcilerTests: XCTestCase {

    private func date(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso)!
    }

    // uploads
    func testUploadsMapsSnapshotsToSyncEvents() {
        let snapshots = [
            EKEventSnapshot(
                externalId: "ek-e1",
                calendarId: "cal-a",
                occurrenceStart: date("2026-07-25T00:30:00Z"),
                lastModified: date("2026-07-20T00:00:00Z"),
                start: date("2026-07-25T00:30:00Z"),
                end: date("2026-07-25T01:00:00Z"),
                isAllDay: false,
                title: "timed",
                location: "渋谷"
            ),
            EKEventSnapshot(
                externalId: "ek-e2",
                calendarId: "cal-b",
                occurrenceStart: date("2026-07-25T15:00:00Z"),
                lastModified: nil,
                start: date("2026-07-25T15:00:00Z"),
                end: date("2026-07-26T15:00:00Z"),
                isAllDay: true,
                title: "all-day",
                location: nil
            ),
        ]

        let uploads = EventKitReconciler.uploads(from: snapshots)

        XCTAssertEqual(uploads.count, 2, "[uploads]")
        XCTAssertEqual(uploads[0].ekExternalId, "ek-e1", "[uploads]")
        XCTAssertEqual(uploads[0].ekCalendarId, "cal-a", "[uploads]")
        XCTAssertEqual(uploads[0].ekOccurrenceStart, "2026-07-25T00:30:00.000Z", "[uploads]")
        XCTAssertEqual(uploads[0].start, "2026-07-25T00:30:00.000Z", "[uploads]")
        XCTAssertEqual(uploads[0].end, "2026-07-25T01:00:00.000Z", "[uploads]")
        XCTAssertEqual(uploads[0].title, "timed", "[uploads]")
        XCTAssertEqual(uploads[0].location, "渋谷", "[uploads]")
        XCTAssertEqual(uploads[0].isAllDay, false, "[uploads]")
        XCTAssertNotNil(uploads[0].ekLastModified, "[uploads]")

        XCTAssertEqual(uploads[1].ekExternalId, "ek-e2", "[uploads]")
        XCTAssertEqual(uploads[1].ekCalendarId, "cal-b", "[uploads]")
        XCTAssertEqual(uploads[1].isAllDay, true, "[uploads]")
        XCTAssertNil(uploads[1].location, "[uploads]")
        XCTAssertNil(uploads[1].ekLastModified, "[uploads]")
    }
}
