import XCTest
@testable import Atender

// Reviewer 生成: 設計doc §6.6 (RecurrenceSpecPicker / 表示文の正典) / §9 U9-U11 を根拠に検証。
// 実装コードは未読。表示文は Web の describeSpec と 1 文字も違わないこと (設計 §6.6)。
final class RecurrenceSpecLogicTests: XCTestCase {

    /// ISO8601 instant (エポック直書きは間違えるので文字列から起こす)
    private func instant(_ iso: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let d = f.date(from: iso) else {
            XCTFail("bad instant \(iso)")
            return Date(timeIntervalSince1970: 0)
        }
        return d
    }

    /// 2026-07-23 (木) 09:00 JST
    private var start: Date { instant("2026-07-23T00:00:00.000Z") }
    /// 2026-07-30 (木・第 5 木曜) 09:00 JST
    private var startLastThursday: Date { instant("2026-07-30T00:00:00.000Z") }

    private func spec(
        _ freq: String,
        interval: Int = 1,
        byDay: [String] = [],
        monthlyMode: String? = nil,
        end: RecurrenceEndDto = RecurrenceEndDto(kind: "never")
    ) -> RecurrenceSpecDto {
        RecurrenceSpecDto(freq: freq, interval: interval, byDay: byDay, monthlyMode: monthlyMode, end: end)
    }

    // MARK: - U9 プリセット → spec

    func testU9WeeklyUsesStartWeekday() {
        let s = RecurrenceSpecLogic.spec(for: .weekly, start: start)

        XCTAssertEqual(s?.freq, "WEEKLY", "[#U9]")
        XCTAssertEqual(s?.byDay, ["TH"], "[#U9] 2026-07-23 は木曜")
        XCTAssertEqual(s?.interval, 1, "[#U9]")
        XCTAssertEqual(s?.end.kind, "never", "[#U9]")
    }

    func testU9WeekdayPreset() {
        let s = RecurrenceSpecLogic.spec(for: .weekday, start: start)

        XCTAssertEqual(s?.freq, "WEEKLY", "[#U9]")
        XCTAssertEqual(s?.byDay, ["MO", "TU", "WE", "TH", "FR"], "[#U9]")
    }

    func testU9MonthlyByDayPreset() {
        let s = RecurrenceSpecLogic.spec(for: .monthlyByDay, start: start)

        XCTAssertEqual(s?.freq, "MONTHLY", "[#U9]")
        XCTAssertEqual(s?.monthlyMode, "BYDAY", "[#U9]")
    }

    func testU9MonthlyByMonthDayAndDailyAndYearly() {
        XCTAssertEqual(RecurrenceSpecLogic.spec(for: .monthlyByMonthDay, start: start)?.monthlyMode, "BYMONTHDAY", "[#U9]")
        XCTAssertEqual(RecurrenceSpecLogic.spec(for: .daily, start: start)?.freq, "DAILY", "[#U9]")
        XCTAssertEqual(RecurrenceSpecLogic.spec(for: .yearly, start: start)?.freq, "YEARLY", "[#U9]")
    }

    func testU9NoneAndCustomReturnNil() {
        XCTAssertNil(RecurrenceSpecLogic.spec(for: .none, start: start), "[#U9]")
        XCTAssertNil(RecurrenceSpecLogic.spec(for: .custom, start: start), "[#U9]")
    }

    func testU9DangerWindowUsesJstWeekday() {
        // JST 2026-07-23 (木) 00:30 = UTC 2026-07-22 15:30 (§9 前文が必須と定める危険窓)
        let dangerous = instant("2026-07-22T15:30:00.000Z")

        XCTAssertEqual(RecurrenceSpecLogic.spec(for: .weekly, start: dangerous)?.byDay, ["TH"],
                       "[#U9] UTC 暦で曜日を採ると WE になって落ちる")
        XCTAssertEqual(RecurrenceSpecLogic.describe(RecurrenceSpecLogic.spec(for: .weekly, start: dangerous), start: dangerous),
                       "毎週 木", "[#U9]")
    }

    func testU9DangerWindowMonthlyAndYearlyUseJstDate() {
        // JST 2026-08-01 (土) 03:00 = UTC 2026-07-31 18:00
        let dangerous = instant("2026-07-31T18:00:00.000Z")

        let monthly = spec("MONTHLY", monthlyMode: "BYMONTHDAY")
        let yearly = spec("YEARLY")

        XCTAssertEqual(RecurrenceSpecLogic.describe(monthly, start: dangerous), "毎月 1日",
                       "[#U9] UTC 暦だと 31日 になって落ちる")
        XCTAssertEqual(RecurrenceSpecLogic.describe(yearly, start: dangerous), "毎年 8月1日",
                       "[#U9] UTC 暦だと 7月31日 になって落ちる")
    }

    // MARK: - U10 逆写像

    func testU10PresetRoundTrip() {
        for preset in [RecurrencePresetKind.daily, .weekly, .weekday, .monthlyByMonthDay, .monthlyByDay, .yearly] {
            let s = RecurrenceSpecLogic.spec(for: preset, start: start)
            XCTAssertEqual(RecurrenceSpecLogic.preset(for: s, start: start), preset, "[#U10] \(preset)")
        }
    }

    func testU10NilIsNone() {
        XCTAssertEqual(RecurrenceSpecLogic.preset(for: nil, start: start), .none, "[#U10]")
    }

    func testU10UnmatchedSpecIsCustom() {
        let s = spec("WEEKLY", interval: 2, byDay: ["MO"])

        XCTAssertEqual(RecurrenceSpecLogic.preset(for: s, start: start), .custom, "[#U10]")
    }

    // MARK: - U11 describe (§6.6 表の全行)

    func testU11DescribeTable() {
        let cases: [(RecurrenceSpecDto?, Date, String)] = [
            (nil, start, "繰り返しなし"),
            (spec("DAILY"), start, "毎日"),
            (spec("DAILY", interval: 3), start, "3日ごと"),
            (spec("WEEKLY", byDay: ["MO", "TU", "WE", "TH", "FR"]), start, "毎週 平日"),
            (spec("WEEKLY", byDay: ["MO", "WE"]), start, "毎週 月, 水"),
            (spec("WEEKLY", interval: 2, byDay: ["MO", "WE"]), start, "2週ごと 月, 水"),
            (spec("MONTHLY", monthlyMode: "BYMONTHDAY"), start, "毎月 23日"),
            (spec("MONTHLY", monthlyMode: "BYDAY"), start, "毎月 第4木曜"),
            (spec("MONTHLY", monthlyMode: "BYDAY"), startLastThursday, "毎月 最終木曜"),
            (spec("MONTHLY", interval: 2, monthlyMode: "BYMONTHDAY"), start, "2ヶ月ごと 23日"),
            (spec("YEARLY"), start, "毎年 7月23日"),
            (spec("YEARLY", interval: 3), start, "3年ごと 7月23日"),
            (spec("DAILY", end: RecurrenceEndDto(kind: "until", date: "2026-12-31")), start, "毎日 ・2026/12/31 まで"),
            (spec("DAILY", end: RecurrenceEndDto(kind: "count", count: 10)), start, "毎日 ・10回"),
        ]

        for (value, at, expected) in cases {
            XCTAssertEqual(RecurrenceSpecLogic.describe(value, start: at), expected, "[#U11] \(expected)")
        }
    }

    func testU11CompositeExample() {
        let s = spec("WEEKLY", byDay: ["MO", "WE"], end: RecurrenceEndDto(kind: "count", count: 10))

        XCTAssertEqual(RecurrenceSpecLogic.describe(s, start: start), "毎週 月, 水 ・10回", "[#U11]")
    }
}
