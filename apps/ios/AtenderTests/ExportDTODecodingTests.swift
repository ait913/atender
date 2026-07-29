// 設計doc: .designs/20260729-eventkit-dedicated-calendar-export.md §6.6 / §9 (DTO decode)
import XCTest
@testable import Atender

final class ExportDTODecodingTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    func testOccurrenceRangeResponseDecodes() throws {
        let json = """
        {
          "from": "2026-07-20",
          "to": "2026-08-16",
          "hasActiveTimetable": true,
          "occurrences": [{
            "id": "o1", "meetingId": "mt1", "courseId": "c1", "courseName": "情報数学",
            "teacher": "山田", "room": "301", "color": null, "date": "2026-07-23",
            "periodIndex": 1, "periodOffset": 0, "startMinute": 540, "endMinute": 630, "status": null
          }],
          "courseSuspensions": [{
            "id": "cs1", "courseId": "c1", "date": "2026-07-30",
            "createdAt": "2026-07-01T00:00:00.000Z", "updatedAt": "2026-07-01T00:00:00.000Z"
          }],
          "timetableSuspensions": [{
            "id": "ts1", "userTimetableId": "ut1", "date": "2026-07-23",
            "createdAt": "2026-07-01T00:00:00.000Z", "updatedAt": "2026-07-01T00:00:00.000Z"
          }]
        }
        """
        let dto = try decode(OccurrenceRangeResponse.self, json)
        XCTAssertEqual(dto.from, "2026-07-20")
        XCTAssertEqual(dto.to, "2026-08-16")
        XCTAssertTrue(dto.hasActiveTimetable)
        XCTAssertEqual(dto.occurrences.count, 1)
        XCTAssertEqual(dto.courseSuspensions.count, 1)
        XCTAssertEqual(dto.timetableSuspensions.count, 1)
    }

    func testLegacyEkPushDtosDecode() throws {
        let list = try decode(LegacyEkPushListResponse.self, #"{"externalIds":["X","Y"]}"#)
        XCTAssertEqual(list.externalIds, ["X", "Y"])
        let cleared = try decode(LegacyEkPushClearResponse.self, #"{"clearedCount":2}"#)
        XCTAssertEqual(cleared.clearedCount, 2)
    }

    func testEventKitSyncResponseDecodesWithoutManualNeedingPush() throws {
        let response = try decode(EventKitSyncResponse.self, #"{"mirrors":[]}"#)
        XCTAssertEqual(response.mirrors.count, 0)
    }
}
