import XCTest
@testable import Atender

final class EventKitTimeMappingTests: XCTestCase {

    private var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        return cal
    }

    private func jst(_ year: Int, _ month: Int, _ day: Int, _ hour: Int, _ minute: Int) -> Date {
        calendar.date(from: DateComponents(timeZone: TimeZone(identifier: "Asia/Tokyo")!,
                                           year: year, month: month, day: day,
                                           hour: hour, minute: minute))!
    }

    // S1
    func testS1TimedEventMapsToJSTDateAndMinutes() {
        let days = EventKitTimeMapping.toPersonalDays(
            start: jst(2026, 7, 23, 9, 0),
            end: jst(2026, 7, 23, 10, 30),
            isAllDay: false
        )

        XCTAssertEqual(days.count, 1, "[S1]")
        XCTAssertEqual(days[0].date, "2026-07-23", "[S1]")
        XCTAssertFalse(days[0].isAllDay, "[S1]")
        XCTAssertEqual(days[0].startMinute, 540, "[S1]")
        XCTAssertEqual(days[0].endMinute, 630, "[S1]")
    }

    // S2
    func testS2EarlyMorningTimedEventUsesJSTCalendarDay() {
        let days = EventKitTimeMapping.toPersonalDays(
            start: jst(2026, 7, 23, 0, 30),
            end: jst(2026, 7, 23, 1, 0),
            isAllDay: false
        )

        XCTAssertEqual(days.count, 1, "[S2]")
        XCTAssertEqual(days[0].date, "2026-07-23", "[S2]")
        XCTAssertEqual(days[0].startMinute, 30, "[S2]")
        XCTAssertEqual(days[0].endMinute, 60, "[S2]")
    }

    // S3
    func testS3SingleAllDayEventMapsToOneAllDayPersonalDay() {
        let days = EventKitTimeMapping.toPersonalDays(
            start: jst(2026, 7, 23, 0, 0),
            end: jst(2026, 7, 24, 0, 0),
            isAllDay: true
        )

        XCTAssertEqual(days.count, 1, "[S3]")
        XCTAssertEqual(days[0].date, "2026-07-23", "[S3]")
        XCTAssertTrue(days[0].isAllDay, "[S3]")
        XCTAssertNil(days[0].startMinute, "[S3]")
        XCTAssertNil(days[0].endMinute, "[S3]")
    }

    // S4
    func testS4MultiDayAllDayEventContainsEveryJSTDayBeforeExclusiveEnd() {
        let days = EventKitTimeMapping.toPersonalDays(
            start: jst(2026, 7, 23, 0, 0),
            end: jst(2026, 7, 26, 0, 0),
            isAllDay: true
        )
        let dates = Set(days.map { $0.date })

        XCTAssertTrue(dates.isSuperset(of: ["2026-07-23", "2026-07-24", "2026-07-25"]), "[S4]")
        for day in days where ["2026-07-23", "2026-07-24", "2026-07-25"].contains(day.date) {
            XCTAssertTrue(day.isAllDay, "[S4]")
            XCTAssertNil(day.startMinute, "[S4]")
            XCTAssertNil(day.endMinute, "[S4]")
        }
    }

    // S5
    func testS5TimedToAbsoluteRoundTripsThroughPersonalDays() {
        let absolute = EventKitTimeMapping.toAbsolute(
            date: "2026-07-23",
            isAllDay: false,
            startMinute: 540,
            endMinute: 630
        )

        XCTAssertEqual(absolute.start, jst(2026, 7, 23, 9, 0), "[S5]")
        XCTAssertEqual(absolute.end, jst(2026, 7, 23, 10, 30), "[S5]")

        let days = EventKitTimeMapping.toPersonalDays(start: absolute.start, end: absolute.end, isAllDay: false)
        XCTAssertEqual(days.count, 1, "[S5]")
        XCTAssertEqual(days[0].date, "2026-07-23", "[S5]")
        XCTAssertEqual(days[0].startMinute, 540, "[S5]")
        XCTAssertEqual(days[0].endMinute, 630, "[S5]")
    }

    // S6
    func testS6AllDayToAbsoluteUsesJSTMidnightAndNextMidnight() {
        let absolute = EventKitTimeMapping.toAbsolute(
            date: "2026-07-23",
            isAllDay: true,
            startMinute: nil,
            endMinute: nil
        )

        XCTAssertEqual(absolute.start, jst(2026, 7, 23, 0, 0), "[S6]")
        XCTAssertEqual(absolute.end, jst(2026, 7, 24, 0, 0), "[S6]")
        XCTAssertEqual(absolute.end.timeIntervalSince(absolute.start), 24 * 60 * 60, "[S6]")
    }
}
