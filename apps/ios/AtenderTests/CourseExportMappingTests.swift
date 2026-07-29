// 設計doc: .designs/20260729-eventkit-dedicated-calendar-export.md §5.2 / §8 MC
import XCTest
@testable import Atender

final class CourseExportMappingTests: XCTestCase {
    // MARK: - fixtures

    private func decodeJson<T: Decodable>(_ type: T.Type, _ dict: [String: Any]) -> T {
        let data = try! JSONSerialization.data(withJSONObject: dict)
        return try! JSONDecoder().decode(type, from: data)
    }

    private func courseSuspension(courseId: String, date: String) -> CourseSuspensionDto {
        decodeJson(CourseSuspensionDto.self, [
            "id": "cs-\(courseId)-\(date)",
            "courseId": courseId,
            "date": date,
            "createdAt": "2026-07-01T00:00:00.000Z",
            "updatedAt": "2026-07-01T00:00:00.000Z",
        ])
    }

    private func timetableSuspension(date: String) -> TimetableSuspensionDto {
        decodeJson(TimetableSuspensionDto.self, [
            "id": "ts-\(date)",
            "userTimetableId": "ut1",
            "date": date,
            "createdAt": "2026-07-01T00:00:00.000Z",
            "updatedAt": "2026-07-01T00:00:00.000Z",
        ])
    }

    private func occurrence(
        id: String = "o1",
        meetingId: String = "mt1",
        courseId: String = "c1",
        courseName: String = "情報数学",
        teacher: String? = "山田",
        room: String? = "301",
        date: String = "2026-07-23",
        periodIndex: Int,
        periodOffset: Int,
        startMinute: Int,
        endMinute: Int,
        status: AttendanceStatus? = nil
    ) -> OccurrenceDto {
        OccurrenceDto(
            id: id, meetingId: meetingId, courseId: courseId, courseName: courseName,
            teacher: teacher, room: room, color: nil, date: date,
            periodIndex: periodIndex, periodOffset: periodOffset,
            startMinute: startMinute, endMinute: endMinute, status: status
        )
    }

    private func items(
        _ occurrences: [OccurrenceDto],
        courseSuspensions: [CourseSuspensionDto] = [],
        timetableSuspensions: [TimetableSuspensionDto] = []
    ) -> [ExportItem] {
        CourseExportMapping.items(
            occurrences: occurrences,
            courseSuspensions: courseSuspensions,
            timetableSuspensions: timetableSuspensions
        )
    }

    private var period1: OccurrenceDto {
        occurrence(id: "o1", periodIndex: 1, periodOffset: 0, startMinute: 540, endMinute: 630)
    }
    private var period2: OccurrenceDto {
        occurrence(id: "o2", periodIndex: 2, periodOffset: 1, startMinute: 640, endMinute: 730)
    }
    private var period3: OccurrenceDto {
        occurrence(id: "o3", periodIndex: 3, periodOffset: 2, startMinute: 780, endMinute: 870)
    }

    // MARK: - MC

    func testMC1SinglePeriod() {
        let result = items([period1])
        XCTAssertEqual(result.count, 1)
        let item = result[0]
        XCTAssertEqual(item.key, "atender://m/mt1/20260723/0")
        XCTAssertEqual(item.title, "情報数学")
        XCTAssertEqual(item.location, "301")
        XCTAssertEqual(item.notes, "1限\n担当: 山田")
        XCTAssertFalse(item.isAllDay)
        XCTAssertEqual(item.start, jstDate("2026-07-23T09:00:00"))
        XCTAssertEqual(item.end, jstDate("2026-07-23T10:30:00"))
    }

    func testMC2ConsecutivePeriodsAreMerged() {
        let result = items([period1, period2])
        XCTAssertEqual(result.count, 1)
        let item = result[0]
        XCTAssertEqual(item.start, jstDate("2026-07-23T09:00:00"))
        XCTAssertEqual(item.end, jstDate("2026-07-23T12:10:00"))
        XCTAssertEqual(item.notes, "1-2限\n担当: 山田")
        XCTAssertEqual(item.key, "atender://m/mt1/20260723/0")
    }

    func testMC3NonConsecutivePeriodsAreSplit() {
        let result = items([period1, period3])
        XCTAssertEqual(result.count, 2)
        XCTAssertEqual(result.map(\.key), [
            "atender://m/mt1/20260723/0",
            "atender://m/mt1/20260723/2",
        ])
    }

    func testMC4DifferentMeetingsAreNotMerged() {
        let other = occurrence(id: "o2", meetingId: "mt2", periodIndex: 2, periodOffset: 1, startMinute: 640, endMinute: 730)
        let result = items([period1, other])
        XCTAssertEqual(result.count, 2)
        XCTAssertEqual(Set(result.map(\.key)), [
            "atender://m/mt1/20260723/0",
            "atender://m/mt2/20260723/1",
        ])
    }

    func testMC5DifferentDatesAreNotMerged() {
        let nextDay = occurrence(id: "o2", date: "2026-07-24", periodIndex: 1, periodOffset: 0, startMinute: 540, endMinute: 630)
        let result = items([period1, nextDay])
        XCTAssertEqual(result.count, 2)
        XCTAssertEqual(result.map(\.key), [
            "atender://m/mt1/20260723/0",
            "atender://m/mt1/20260724/0",
        ])
    }

    func testMC6TimetableSuspensionRemovesTheWholeDay() {
        let result = items([period1, period3], timetableSuspensions: [timetableSuspension(date: "2026-07-23")])
        XCTAssertEqual(result, [])
    }

    func testMC7CourseSuspensionRemovesOnlyThatCourse() {
        let other = occurrence(id: "o2", meetingId: "mt2", courseId: "c2", courseName: "英語",
                               periodIndex: 3, periodOffset: 2, startMinute: 780, endMinute: 870)
        let result = items([period1, other], courseSuspensions: [courseSuspension(courseId: "c1", date: "2026-07-23")])
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].title, "英語")
    }

    func testMC8CourseSuspensionOnAnotherDateDoesNothing() {
        let result = items([period1], courseSuspensions: [courseSuspension(courseId: "c1", date: "2026-07-24")])
        XCTAssertEqual(result.count, 1)
    }

    func testMC9CancelledStatusIsExcludedButAbsentRemains() {
        let cancelled = occurrence(id: "o1", periodIndex: 1, periodOffset: 0, startMinute: 540, endMinute: 630, status: .cancelled)
        let absent = occurrence(id: "o3", periodIndex: 3, periodOffset: 2, startMinute: 780, endMinute: 870, status: .absent)
        let result = items([cancelled, absent])
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].key, "atender://m/mt1/20260723/2")
    }

    func testMC10AbsentGetsNoMarker() {
        let absent = occurrence(id: "o1", periodIndex: 1, periodOffset: 0, startMinute: 540, endMinute: 630, status: .absent)
        let result = items([absent])
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].title, "情報数学")
    }

    func testMC11MissingTeacher() {
        for teacher in [nil, ""] as [String?] {
            let result = items([occurrence(teacher: teacher, periodIndex: 1, periodOffset: 0, startMinute: 540, endMinute: 630)])
            XCTAssertEqual(result.count, 1)
            XCTAssertEqual(result[0].notes, "1限", "[MC11] teacher=\(String(describing: teacher))")
        }
    }

    func testMC12MissingRoomBecomesNil() {
        for room in [nil, ""] as [String?] {
            let result = items([occurrence(room: room, periodIndex: 1, periodOffset: 0, startMinute: 540, endMinute: 630)])
            XCTAssertEqual(result.count, 1)
            XCTAssertNil(result[0].location, "[MC12] room=\(String(describing: room))")
        }
    }

    func testMC13BrokenRowsAreExcluded() {
        let broken = occurrence(id: "o1", periodIndex: 1, periodOffset: 0, startMinute: 630, endMinute: 630)
        let broken2 = occurrence(id: "o2", periodIndex: 2, periodOffset: 1, startMinute: 730, endMinute: 640)
        XCTAssertEqual(items([broken, broken2]), [])
    }

    func testMC14SortedByStart() {
        let result = items([period3, period1])
        XCTAssertEqual(result.count, 2)
        XCTAssertEqual(result.map(\.start), [
            jstDate("2026-07-23T09:00:00"),
            jstDate("2026-07-23T13:00:00"),
        ])
    }

    func testMC15EmptyInput() {
        XCTAssertEqual(items([]), [])
    }
}
