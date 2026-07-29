// 設計doc: .designs/20260729-eventkit-dedicated-calendar-export.md §5.3 / §8 MP
import XCTest
@testable import Atender

final class PersonalExportMappingTests: XCTestCase {
    private func utcIso(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.string(from: date)
    }

    private func occ(
        seriesId: String = "s1",
        occurrenceDate: Date,
        start: Date? = nil,
        end: Date,
        isAllDay: Bool = false,
        title: String = "面談",
        location: String? = nil,
        note: String? = nil,
        source: String = "MANUAL"
    ) -> PersonalEventOccurrenceDto {
        let startDate = start ?? occurrenceDate
        return PersonalEventOccurrenceDto(
            seriesId: seriesId,
            occurrenceDate: utcIso(occurrenceDate),
            start: utcIso(startDate),
            end: utcIso(end),
            days: [OccurrenceDayDto(date: "2026-07-23", startMinute: 0, endMinute: 1440)],
            isAllDay: isAllDay,
            title: title,
            location: location,
            note: note,
            color: nil,
            isRecurringOccurrence: false,
            recurrenceRule: nil,
            recurrenceSpec: nil,
            overrideId: nil,
            source: source,
            ekExternalId: nil,
            ekCalendarId: nil,
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z"
        )
    }

    func testMP1TimedEvent() {
        let start = jstDate("2026-07-23T09:00:00")
        let end = jstDate("2026-07-23T10:30:00")
        let result = PersonalExportMapping.items(occurrences: [
            occ(occurrenceDate: start, end: end, title: "面談", location: "渋谷", note: "資料持参"),
        ])
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].start, start)
        XCTAssertEqual(result[0].end, end)
        XCTAssertEqual(result[0].location, "渋谷")
        XCTAssertEqual(result[0].notes, "資料持参")
        XCTAssertFalse(result[0].isAllDay)
    }

    func testMP2DangerWindowKeyUsesUtc() {
        let start = jstDate("2026-07-23T00:30:00")
        let end = jstDate("2026-07-23T01:00:00")
        let result = PersonalExportMapping.items(occurrences: [occ(occurrenceDate: start, end: end)])
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].key, "atender://p/s1/20260722T153000Z")
        XCTAssertEqual(result[0].start, start)
    }

    func testMP3SingleDayAllDayEndsAtLastSecond() {
        let start = jstDate("2026-07-23T00:00:00")
        let end = jstDate("2026-07-24T00:00:00")
        let result = PersonalExportMapping.items(occurrences: [
            occ(occurrenceDate: start, end: end, isAllDay: true, title: "休み"),
        ])
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].start, start)
        XCTAssertEqual(result[0].end, jstDate("2026-07-23T23:59:59"))
        XCTAssertTrue(result[0].isAllDay)
    }

    func testMP4MultiDayAllDay() {
        let start = jstDate("2026-07-23T00:00:00")
        let end = jstDate("2026-07-26T00:00:00")
        let result = PersonalExportMapping.items(occurrences: [
            occ(occurrenceDate: start, end: end, isAllDay: true, title: "帰省"),
        ])
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].end, jstDate("2026-07-25T23:59:59"))
    }

    func testMP5MultiDayTimedStaysOneItem() {
        let start = jstDate("2026-07-23T22:00:00")
        let end = jstDate("2026-07-25T03:00:00")
        let result = PersonalExportMapping.items(occurrences: [occ(occurrenceDate: start, end: end)])
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].start, start)
        XCTAssertEqual(result[0].end, end)
    }

    func testMP6EventKitMirrorsAreExcluded() {
        let start = jstDate("2026-07-23T09:00:00")
        let end = jstDate("2026-07-23T10:00:00")
        let mirror = occ(seriesId: "s-ek", occurrenceDate: start, end: end, source: "EVENTKIT")
        XCTAssertEqual(PersonalExportMapping.items(occurrences: [mirror]), [])

        let manual = occ(seriesId: "s-manual", occurrenceDate: start, end: end, source: "MANUAL")
        let mixed = PersonalExportMapping.items(occurrences: [mirror, manual])
        XCTAssertEqual(mixed.count, 1)
        XCTAssertEqual(mixed[0].key, "atender://p/s-manual/20260723T000000Z")
    }

    func testMP7RecurringOccurrencesBecomeSeparateItems() {
        let dates = ["2026-07-20T09:00:00", "2026-07-27T09:00:00", "2026-08-03T09:00:00"].map(jstDate)
        let occurrences = dates.map { date in
            occ(occurrenceDate: date, end: date.addingTimeInterval(3600))
        }
        let result = PersonalExportMapping.items(occurrences: occurrences)
        XCTAssertEqual(result.count, 3)
        XCTAssertEqual(Set(result.map(\.key)).count, 3)
    }

    func testMP8OverrideMovesStartButNotKey() {
        let occurrenceDate = jstDate("2026-07-27T09:00:00")
        let start = jstDate("2026-07-27T10:00:00")
        let end = jstDate("2026-07-27T11:00:00")
        let result = PersonalExportMapping.items(occurrences: [
            occ(occurrenceDate: occurrenceDate, start: start, end: end),
        ])
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].key, "atender://p/s1/20260727T000000Z")
        XCTAssertEqual(result[0].start, start)
    }

    func testMP9EmptyTitleFallsBack() {
        let start = jstDate("2026-07-23T09:00:00")
        let result = PersonalExportMapping.items(occurrences: [
            occ(occurrenceDate: start, end: start.addingTimeInterval(3600), title: ""),
        ])
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].title, "予定")
    }

    func testMP10EmptyStringsNormalizeToNil() {
        let start = jstDate("2026-07-23T09:00:00")
        let result = PersonalExportMapping.items(occurrences: [
            occ(occurrenceDate: start, end: start.addingTimeInterval(3600), location: "", note: ""),
        ])
        XCTAssertEqual(result.count, 1)
        XCTAssertNil(result[0].location)
        XCTAssertNil(result[0].notes)
    }

    func testMP11SortedByStart() {
        let later = jstDate("2026-07-23T15:00:00")
        let earlier = jstDate("2026-07-23T09:00:00")
        let result = PersonalExportMapping.items(occurrences: [
            occ(seriesId: "s-late", occurrenceDate: later, end: later.addingTimeInterval(3600)),
            occ(seriesId: "s-early", occurrenceDate: earlier, end: earlier.addingTimeInterval(3600)),
        ])
        XCTAssertEqual(result.map(\.start), [earlier, later])
    }

    func testMP12EmptyInput() {
        XCTAssertEqual(PersonalExportMapping.items(occurrences: []), [])
    }
}
