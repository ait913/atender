import XCTest
import SwiftUI
@testable import Atender

final class SemesterLogicTests: XCTestCase {

    // MARK: - AttendanceDayVisual

    func testAttendanceDayVisualForPastStatuses() {
        assertVisual(
            AttendanceDayVisual.of(status: .allPresent, isFuture: false),
            icon: .check,
            iconColor: .statusPresent,
            bgStatusColor: .statusPresent,
            bgFraction: 0.20,
            dashed: false
        )
        assertVisual(
            AttendanceDayVisual.of(status: .hasAbsent, isFuture: false),
            icon: .x,
            iconColor: .statusAbsent,
            bgStatusColor: .statusAbsent,
            bgFraction: 0.26,
            dashed: false
        )
        assertVisual(
            AttendanceDayVisual.of(status: .hasTardy, isFuture: false),
            icon: .clock,
            iconColor: .statusTardy,
            bgStatusColor: .statusTardy,
            bgFraction: 0.24,
            dashed: false
        )
        assertVisual(
            AttendanceDayVisual.of(status: .allSuspended, isFuture: false),
            icon: .ban,
            iconColor: .statusSuspended,
            bgStatusColor: .statusSuspended,
            bgFraction: 0.20,
            dashed: false
        )
        assertVisual(
            AttendanceDayVisual.of(status: .partialUnrecorded, isFuture: false),
            icon: .minus,
            iconColor: .textTertiary,
            bgStatusColor: .statusNone,
            bgFraction: 0.12,
            dashed: true
        )
    }

    func testAttendanceDayVisualForNoClassNilAndUnknown() {
        assertNoBackgroundVisual(AttendanceDayVisual.of(status: .noClass, isFuture: false))
        assertNoBackgroundVisual(AttendanceDayVisual.of(status: nil, isFuture: false))
        assertNoBackgroundVisual(AttendanceDayVisual.of(status: .unknown, isFuture: false))
    }

    func testAttendanceDayVisualFuturePriorityKeepsOnlyAllSuspended() {
        assertNoBackgroundVisual(AttendanceDayVisual.of(status: .allPresent, isFuture: true))
        assertNoBackgroundVisual(AttendanceDayVisual.of(status: .hasAbsent, isFuture: true))
        assertVisual(
            AttendanceDayVisual.of(status: .allSuspended, isFuture: true),
            icon: .ban,
            iconColor: .statusSuspended,
            bgStatusColor: .statusSuspended,
            bgFraction: 0.20,
            dashed: false
        )
    }

    // MARK: - SemesterCalendarGrid

    func testSemesterCalendarGridCellsForJuly2026() throws {
        let cells = SemesterCalendarGrid.cells(monthAnchor: "2026-07-01")

        XCTAssertEqual(cells.first, "2026-06-28")
        XCTAssertEqual(cells.last, "2026-08-01")
        XCTAssertTrue(cells.contains("2026-08-01"))
        XCTAssertTrue([35, 42].contains(cells.count))
        XCTAssertEqual(weekday(cells[0]), 1)
        XCTAssertEqual(weekday(try XCTUnwrap(cells.last)), 7)

        for index in cells.indices.dropFirst() {
            XCTAssertEqual(
                cells[index],
                day(after: cells[index - 1]),
                "cells[\(index)] should be the day after cells[\(index - 1)]"
            )
        }
    }

    func testSemesterCalendarGridClampMonth() {
        XCTAssertEqual(
            SemesterCalendarGrid.clampMonth("2026-05-15", start: "2026-06-01", end: "2026-08-31"),
            "2026-06-01"
        )
        XCTAssertEqual(
            SemesterCalendarGrid.clampMonth("2026-07-15", start: "2026-06-01", end: "2026-08-31"),
            "2026-07-01"
        )
        XCTAssertEqual(
            SemesterCalendarGrid.clampMonth("2026-09-10", start: "2026-06-01", end: "2026-08-31"),
            "2026-08-01"
        )
    }

    func testSemesterCalendarGridBounds() {
        XCTAssertTrue(SemesterCalendarGrid.atStart(anchor: "2026-06-10", start: "2026-06-01"))
        XCTAssertFalse(SemesterCalendarGrid.atStart(anchor: "2026-07-01", start: "2026-06-01"))

        XCTAssertTrue(SemesterCalendarGrid.atEnd(anchor: "2026-08-20", end: "2026-08-31"))
        XCTAssertFalse(SemesterCalendarGrid.atEnd(anchor: "2026-07-01", end: "2026-08-31"))
    }

    func testSemesterCalendarGridSundayOf() {
        XCTAssertEqual(SemesterCalendarGrid.sundayOf("2026-07-01"), "2026-06-28")
        XCTAssertEqual(SemesterCalendarGrid.sundayOf("2026-06-28"), "2026-06-28")
    }

    // MARK: - DayDetailLogic

    func testDayDetailLogicExcludesCourseSuspensions() throws {
        let dto = try decodeDayDetail(
            occurrences: [
                occurrenceJSON(id: "occ-a", courseId: "c1", status: #""PRESENT""#),
                occurrenceJSON(id: "occ-b", courseId: "c2", status: "null"),
                occurrenceJSON(id: "occ-c", courseId: "c3", status: "null"),
                occurrenceJSON(id: "occ-d", courseId: "c4", status: "null")
            ],
            courseSuspensions: [
                courseSuspensionJSON(id: "susp-d", courseId: "c4")
            ]
        )

        XCTAssertEqual(DayDetailLogic.courseSuspendedIds(dto), Set(["c4"]))
        XCTAssertEqual(DayDetailLogic.unrecordedCount(dto), 2)
        XCTAssertEqual(DayDetailLogic.occurrenceCount(dto), 3)
    }

    func testDayDetailLogicRecordedOccurrencesHaveNoUnrecordedCount() throws {
        let dto = try decodeDayDetail(
            occurrences: [
                occurrenceJSON(id: "occ-a", courseId: "c1", status: #""PRESENT""#),
                occurrenceJSON(id: "occ-b", courseId: "c2", status: #""ABSENT""#),
                occurrenceJSON(id: "occ-c", courseId: "c3", status: #""TARDY""#)
            ],
            courseSuspensions: []
        )

        XCTAssertEqual(DayDetailLogic.unrecordedCount(dto), 0)
    }

    func testDayDetailLogicBulkMode() {
        XCTAssertEqual(DayDetailLogic.bulkMode(unrecordedCount: 0), .overwrite)
        XCTAssertEqual(DayDetailLogic.bulkMode(unrecordedCount: 3), .fill)
    }

    // MARK: - BulkToast

    func testBulkToastFormatDateList() {
        XCTAssertEqual(BulkToast.formatDateList(["2026-07-01", "2026-07-15"]), "7/1, 7/15")
        XCTAssertEqual(BulkToast.formatDateList(["2026-12-05"]), "12/5")
    }

    func testBulkToastCreateSuspensions() {
        XCTAssertEqual(BulkToast.createSuspensions(created: 3, skipped: 0), "3日 休講登録")
        XCTAssertEqual(BulkToast.createSuspensions(created: 2, skipped: 1), "2日 休講登録 (1日 登録済み)")
    }

    // MARK: - Helpers

    private func assertVisual(
        _ visual: AttendanceDayVisual.Visual,
        icon: AttendanceDayVisual.Icon,
        iconColor: Color,
        bgStatusColor: Color,
        bgFraction: Double,
        dashed: Bool,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertEqual(visual.icon, icon, file: file, line: line)
        XCTAssertEqual(visual.iconColor, iconColor, file: file, line: line)
        guard let actualBgStatusColor = visual.bgStatusColor else {
            XCTFail("bgStatusColor should not be nil", file: file, line: line)
            return
        }
        XCTAssertEqual(actualBgStatusColor, bgStatusColor, file: file, line: line)
        XCTAssertEqual(visual.bgFraction, bgFraction, accuracy: 0.0001, file: file, line: line)
        XCTAssertEqual(visual.dashed, dashed, file: file, line: line)
    }

    private func assertNoBackgroundVisual(
        _ visual: AttendanceDayVisual.Visual,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertEqual(visual.icon, .none, file: file, line: line)
        XCTAssertEqual(visual.iconColor, .statusNone, file: file, line: line)
        XCTAssertNil(visual.bgStatusColor, file: file, line: line)
        XCTAssertFalse(visual.dashed, file: file, line: line)
    }

    private func decodeDayDetail(occurrences: [String], courseSuspensions: [String]) throws -> DayDetailDto {
        let json = """
        {
          "date": "2026-07-01",
          "occurrences": [
            \(occurrences.joined(separator: ",\n"))
          ],
          "courseSuspensions": [
            \(courseSuspensions.joined(separator: ",\n"))
          ],
          "timetableSuspension": null,
          "personalEvents": []
        }
        """
        return try JSONDecoder().decode(DayDetailDto.self, from: Data(json.utf8))
    }

    private func occurrenceJSON(id: String, courseId: String, status: String) -> String {
        """
        {
          "id": "\(id)",
          "meetingId": "meeting-\(id)",
          "courseId": "\(courseId)",
          "courseName": "Course \(courseId)",
          "teacher": null,
          "room": null,
          "color": null,
          "date": "2026-07-01",
          "periodIndex": 1,
          "periodOffset": 0,
          "startMinute": 540,
          "endMinute": 630,
          "status": \(status)
        }
        """
    }

    private func courseSuspensionJSON(id: String, courseId: String) -> String {
        """
        {
          "id": "\(id)",
          "courseId": "\(courseId)",
          "date": "2026-07-01",
          "reason": null,
          "createdAt": "2026-07-01T00:00:00.000Z",
          "updatedAt": "2026-07-01T00:00:00.000Z"
        }
        """
    }

    private func day(after value: String) -> String {
        let date = parseDate(value)
        let next = calendar.date(byAdding: .day, value: 1, to: date)!
        return dateFormatter.string(from: next)
    }

    private func weekday(_ value: String) -> Int {
        calendar.component(.weekday, from: parseDate(value))
    }

    private func parseDate(_ value: String) -> Date {
        dateFormatter.date(from: value)!
    }

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private var dateFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)!
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }
}
