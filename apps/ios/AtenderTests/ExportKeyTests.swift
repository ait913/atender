// 設計doc: .designs/20260729-eventkit-dedicated-calendar-export.md §4.1 / §8 KEY
import XCTest
@testable import Atender

func jstDate(_ literal: String) -> Date {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    guard let date = formatter.date(from: "\(literal)+09:00") else {
        fatalError("bad JST literal: \(literal)")
    }
    return date
}

final class ExportKeyTests: XCTestCase {
    func testKEY1MeetingKey() {
        XCTAssertEqual(
            ExportKey.meeting(meetingId: "mt1", date: "2026-07-23", firstPeriodOffset: 0),
            "atender://m/mt1/20260723/0"
        )
    }

    func testKEY2PersonalKeyUsesUtcInDangerWindow() {
        XCTAssertEqual(
            ExportKey.personal(seriesId: "s1", occurrenceDate: jstDate("2026-07-23T00:30:00")),
            "atender://p/s1/20260722T153000Z"
        )
    }

    func testKEY3PersonalKeyUtcBasic() {
        XCTAssertEqual(
            ExportKey.personal(seriesId: "s1", occurrenceDate: jstDate("2026-07-23T09:00:00")),
            "atender://p/s1/20260723T000000Z"
        )
    }

    func testKEY4KindOfOwnedKeys() {
        XCTAssertEqual(ExportKey.kind(of: "atender://m/mt1/20260723/0"), .meeting)
        XCTAssertEqual(ExportKey.kind(of: "atender://p/s1/20260723T000000Z"), .personal)
    }

    func testKEY5KindOfForeignKeys() {
        XCTAssertNil(ExportKey.kind(of: "https://example.com"))
        XCTAssertNil(ExportKey.kind(of: "atender://x/1"))
        XCTAssertNil(ExportKey.kind(of: ""))
        XCTAssertNil(ExportKey.kind(of: nil))
    }

    func testKEY6IsOwned() {
        XCTAssertTrue(ExportKey.isOwned("atender://m/mt1/20260723/0"))
        XCTAssertFalse(ExportKey.isOwned(nil))
        XCTAssertFalse(ExportKey.isOwned("teams://meeting/1"))
    }

    func testKEY7KeysAreValidUrls() {
        let keys = [
            ExportKey.meeting(meetingId: "mt1", date: "2026-07-23", firstPeriodOffset: 0),
            ExportKey.personal(seriesId: "s1", occurrenceDate: jstDate("2026-07-23T00:30:00")),
            ExportKey.personal(seriesId: "s1", occurrenceDate: jstDate("2026-07-23T09:00:00")),
        ]
        for key in keys {
            XCTAssertNotNil(URL(string: key), "[KEY7] \(key)")
        }
    }
}
