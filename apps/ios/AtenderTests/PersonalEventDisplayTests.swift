import XCTest
@testable import Atender

// Reviewer 生成: 設計doc .designs/20260729-personal-calendar-rebuild.md §6.2 / §9 U1-U5 を根拠に検証。
// 実装コードは未読。型名・シグネチャは設計 §6.1/§6.2 を正典とする。
final class PersonalEventDisplayTests: XCTestCase {

    private func day(_ date: String, _ start: Int, _ end: Int) -> OccurrenceDayDto {
        OccurrenceDayDto(date: date, startMinute: start, endMinute: end)
    }

    private func occurrence(
        seriesId: String = "series-1",
        occurrenceDate: String = "2026-07-22T15:00:00.000Z",
        days: [OccurrenceDayDto],
        title: String = "帰省",
        color: String? = nil,
        isAllDay: Bool = true
    ) -> PersonalEventOccurrenceDto {
        PersonalEventOccurrenceDto(
            seriesId: seriesId,
            occurrenceDate: occurrenceDate,
            start: "2026-07-22T15:00:00.000Z",
            end: "2026-07-25T15:00:00.000Z",
            days: days,
            isAllDay: isAllDay,
            title: title,
            location: nil,
            note: nil,
            color: color,
            isRecurringOccurrence: false,
            recurrenceRule: nil,
            recurrenceSpec: nil,
            overrideId: nil,
            source: "MANUAL",
            ekExternalId: nil,
            ekCalendarId: nil,
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z"
        )
    }

    // MARK: - U1

    func testU1MultiDayOccurrenceBecomesOneEventPerDay() {
        let occ = occurrence(days: [
            day("2026-07-23", 0, 1440),
            day("2026-07-24", 0, 1440),
            day("2026-07-25", 0, 1440),
        ])

        let events = PersonalEventDisplay.calendarEvents(occurrences: [occ])

        XCTAssertEqual(events.count, 3, "[#U1] days の数だけ CalendarEvent ができる")
        XCTAssertEqual(events.map(\.date), ["2026-07-23", "2026-07-24", "2026-07-25"], "[#U1]")
        XCTAssertEqual(events.map(\.startMinute), [0, 0, 0], "[#U1]")
        XCTAssertEqual(events.map(\.endMinute), [1440, 1440, 1440], "[#U1]")
        XCTAssertTrue(events.allSatisfy { $0.kind == .personal }, "[#U1]")
        XCTAssertTrue(events.allSatisfy { $0.title == "帰省" }, "[#U1]")
        XCTAssertTrue(events.allSatisfy { $0.subtitle == "自分" }, "[#U1]")
        XCTAssertTrue(events.allSatisfy { $0.courseId == nil }, "[#U1]")
    }

    func testU1EventIdFormat() {
        let occ = occurrence(days: [day("2026-07-23", 0, 1440), day("2026-07-24", 0, 1440)])

        let events = PersonalEventDisplay.calendarEvents(occurrences: [occ])

        XCTAssertEqual(events.map(\.id), [
            "e:series-1:2026-07-22T15:00:00.000Z:2026-07-23",
            "e:series-1:2026-07-22T15:00:00.000Z:2026-07-24",
        ], "[#U1] id は e:<seriesId>:<occurrenceDate>:<date>")
    }

    func testU1UsesDayMinutesVerbatim() {
        let occ = occurrence(
            days: [day("2026-07-23", 1320, 1440), day("2026-07-24", 0, 180)],
            isAllDay: false
        )

        let events = PersonalEventDisplay.calendarEvents(occurrences: [occ])

        XCTAssertEqual(events.map { [$0.startMinute, $0.endMinute] }, [[1320, 1440], [0, 180]], "[#U1] 日付演算をしない")
    }

    // MARK: - U2

    func testU2ColorFallback() {
        let none = PersonalEventDisplay.calendarEvents(occurrences: [occurrence(days: [day("2026-07-23", 0, 1440)])])
        let custom = PersonalEventDisplay.calendarEvents(
            occurrences: [occurrence(days: [day("2026-07-23", 0, 1440)], color: "#1E96E6")]
        )

        XCTAssertEqual(none.first?.color, "#8b5cf6", "[#U2] color=nil のフォールバック")
        XCTAssertEqual(custom.first?.color, "#1E96E6", "[#U2] 指定色はそのまま")
    }

    // MARK: - U3

    func testU3EmptyInput() {
        XCTAssertTrue(PersonalEventDisplay.calendarEvents(occurrences: []).isEmpty, "[#U3]")
    }

    func testU3OccurrenceWithoutDaysProducesNoEvent() {
        let events = PersonalEventDisplay.calendarEvents(occurrences: [occurrence(days: [])])

        XCTAssertTrue(events.isEmpty, "[#U3] days が空なら描画単位も無い")
    }

    // MARK: - U5 (ソート)

    func testU5SortedByStartMinuteWithinDay() {
        let allDay = occurrence(seriesId: "s-allday", occurrenceDate: "A", days: [day("2026-07-23", 0, 1440)], title: "終日")
        let at13 = occurrence(seriesId: "s-13", occurrenceDate: "B", days: [day("2026-07-23", 780, 870)], title: "13時", isAllDay: false)
        let at8 = occurrence(seriesId: "s-8", occurrenceDate: "C", days: [day("2026-07-23", 480, 570)], title: "8時", isAllDay: false)

        let events = PersonalEventDisplay.calendarEvents(occurrences: [at13, allDay, at8])
            .sorted { $0.date != $1.date ? $0.date < $1.date : $0.startMinute < $1.startMinute }

        XCTAssertEqual(events.map(\.title), ["終日", "8時", "13時"], "[#U5] startMinute 昇順")
    }
}
