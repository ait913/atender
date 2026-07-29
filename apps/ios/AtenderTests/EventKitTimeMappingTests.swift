import XCTest
@testable import Atender

// Reviewer 生成: 設計doc §5.6 / §6.10 を根拠に検証。実装コードは未読。
// 旧 S1-S6 (toPersonalDays = 日単位分解) は §6.8 で削除された。ここは置換テスト。
final class EventKitTimeMappingTests: XCTestCase {

    private func instant(_ iso: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: iso)!
    }

    func testJstDayStartIsJstMidnight() {
        XCTAssertEqual(EventKitTimeMapping.jstDayStart("2026-07-20"),
                       instant("2026-07-19T15:00:00.000Z"),
                       "[§6.10] JST 2026-07-20 00:00 = UTC 前日 15:00")
    }

    func testJstDayStartAcrossMonthAndYearBoundaries() {
        XCTAssertEqual(EventKitTimeMapping.jstDayStart("2026-08-01"),
                       instant("2026-07-31T15:00:00.000Z"), "[§6.10]")
        XCTAssertEqual(EventKitTimeMapping.jstDayStart("2027-01-01"),
                       instant("2026-12-31T15:00:00.000Z"), "[§6.10]")
    }

    func testJstDayStartIsExactly24HoursApartForConsecutiveDays() {
        let a = EventKitTimeMapping.jstDayStart("2026-07-20")
        let b = EventKitTimeMapping.jstDayStart("2026-07-21")

        XCTAssertEqual(b.timeIntervalSince(a), 86400, accuracy: 0.001, "[§6.10] 日本に DST は無い")
    }

    /// §5.6 の削除伝播レンジ: [range.from の JST 00:00, range.to の JST 23:59:59]
    func testRangeBoundsFromJstDayStart() {
        let from = EventKitTimeMapping.jstDayStart("2026-07-20")
        let toExclusive = EventKitTimeMapping.jstDayStart("2026-08-17") // to=2026-08-16 の翌日

        XCTAssertEqual(from, instant("2026-07-19T15:00:00.000Z"), "[§5.6]")
        XCTAssertEqual(toExclusive, instant("2026-08-16T15:00:00.000Z"), "[§5.6]")

        // 危険窓 (JST 00:00〜08:59) の occurrence が範囲に入ること
        let dangerous = instant("2026-07-19T15:30:00.000Z") // JST 2026-07-20 00:30
        XCTAssertGreaterThanOrEqual(dangerous, from, "[§5.6] 危険窓が範囲内")
        XCTAssertLessThan(dangerous, toExclusive, "[§5.6] 危険窓が範囲内")
    }

    func testEKEventSnapshotCarriesOccurrenceWithoutDaySplitting() {
        // §5.6: 複数日 EK イベントは分解しない (1 occurrence = 1 行)
        let snapshot = EKEventSnapshot(
            externalId: "ek-multi",
            calendarId: "cal-a",
            occurrenceStart: instant("2026-07-22T15:00:00.000Z"),
            lastModified: nil,
            start: instant("2026-07-22T15:00:00.000Z"),
            end: instant("2026-07-25T15:00:00.000Z"),
            isAllDay: true,
            title: "旅行",
            location: nil
        )

        let uploads = EventKitReconciler.uploads(from: [snapshot])

        XCTAssertEqual(uploads.count, 1, "[§5.6] 3 日ぶんに分解しない")
        XCTAssertEqual(uploads[0].start, "2026-07-22T15:00:00.000Z", "[§5.6]")
        XCTAssertEqual(uploads[0].end, "2026-07-25T15:00:00.000Z", "[§5.6] 排他 end をそのまま渡す")
        XCTAssertEqual(uploads[0].ekOccurrenceStart, "2026-07-22T15:00:00.000Z", "[§5.6] 鍵は (externalId, occurrenceStart)")
    }

    func testUploadsKeepsSameExternalIdWithDifferentOccurrences() {
        // §9 K11: 同じ ekExternalId で occurrenceStart が違う 2 件は別行
        let base = { (occ: String) in
            EKEventSnapshot(externalId: "ek-same", calendarId: "cal-a",
                            occurrenceStart: self.instant(occ), lastModified: nil,
                            start: self.instant(occ), end: self.instant(occ).addingTimeInterval(3600),
                            isAllDay: false, title: "定例", location: nil)
        }

        let uploads = EventKitReconciler.uploads(from: [
            base("2026-07-23T00:00:00.000Z"),
            base("2026-07-30T00:00:00.000Z"),
        ])

        XCTAssertEqual(uploads.count, 2, "[#K11]")
        XCTAssertEqual(Set(uploads.map(\.ekExternalId)), ["ek-same"], "[#K11]")
        XCTAssertEqual(uploads.map(\.ekOccurrenceStart),
                       ["2026-07-23T00:00:00.000Z", "2026-07-30T00:00:00.000Z"], "[#K11]")
    }
}
