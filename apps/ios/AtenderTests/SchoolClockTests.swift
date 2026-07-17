import XCTest
@testable import Atender

final class SchoolClockTests: XCTestCase {

    private func jst(_ s: String) -> Date {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.date(from: s)!
    }

    func testC1TodayStringUsesJSTAtEightAM() {
        XCTAssertEqual(SchoolClock.todayString(jst("2026-07-17 08:00")), "2026-07-17", "[ui-revamp #C1]")
    }

    func testC2TodayStringStaysSameAcrossJSTDay() {
        XCTAssertEqual(SchoolClock.todayString(jst("2026-07-17 00:00")), "2026-07-17", "[ui-revamp #C2]")
        XCTAssertEqual(SchoolClock.todayString(jst("2026-07-17 08:59")), "2026-07-17", "[ui-revamp #C2]")
        XCTAssertEqual(SchoolClock.todayString(jst("2026-07-17 09:00")), "2026-07-17", "[ui-revamp #C2]")
        XCTAssertEqual(SchoolClock.todayString(jst("2026-07-17 23:59")), "2026-07-17", "[ui-revamp #C2]")
    }

    func testC3TodayStringChangesAtJSTMidnight() {
        XCTAssertEqual(SchoolClock.todayString(jst("2026-07-18 00:00")), "2026-07-18", "[ui-revamp #C3]")
    }

    func testC4NowMinuteUsesJSTClock() {
        XCTAssertEqual(SchoolClock.nowMinute(jst("2026-07-17 00:00")), 0, "[ui-revamp #C4]")
        XCTAssertEqual(SchoolClock.nowMinute(jst("2026-07-17 08:00")), 480, "[ui-revamp #C4]")
        XCTAssertEqual(SchoolClock.nowMinute(jst("2026-07-17 09:00")), 540, "[ui-revamp #C4]")
        XCTAssertEqual(SchoolClock.nowMinute(jst("2026-07-17 23:59")), 1439, "[ui-revamp #C4]")
    }

    func testC5DisplayDayDoesNotRoundWeekendToMonday() {
        XCTAssertEqual(SchoolClock.displayDay(jst("2026-07-13 12:00")), 1, "[ui-revamp #C5]")
        XCTAssertEqual(SchoolClock.displayDay(jst("2026-07-17 12:00")), 5, "[ui-revamp #C5]")
        XCTAssertEqual(SchoolClock.displayDay(jst("2026-07-18 12:00")), 6, "[ui-revamp #C5]")
        XCTAssertEqual(SchoolClock.displayDay(jst("2026-07-19 12:00")), 7, "[ui-revamp #C5]")
    }

    /// [ui-revamp #C5] 早朝の境界 — displayDay も JST 暦であること。
    /// ★ Reviewer 追記: 12:00 サンプルだけでは UTC 暦への変異を検出できなかった
    ///   (JST 12:00 = UTC 03:00 で曜日が変わらないため)。
    ///   displayDay は §5.3 の「今日の列」を決める関数であり、F3 の症状
    ///   (「月曜の 9 時前にルームの時間割が先週を読む」) はまさにこの窓で出る。
    ///   00:00〜08:59 JST を踏む標本を置いて初めて牙を持つ。
    func testC5DisplayDayUsesJSTInEarlyMorningWindow() {
        // 月 08:00 JST は UTC では日曜 23:00 → UTC 暦なら 7 (日) を返してしまう
        XCTAssertEqual(SchoolClock.displayDay(jst("2026-07-13 08:00")), 1, "[ui-revamp #C5] 月曜 8 時は月曜")
        XCTAssertEqual(SchoolClock.displayDay(jst("2026-07-13 00:00")), 1, "[ui-revamp #C5] 月曜 0 時は月曜")
        // 土 00:30 JST は UTC では金曜 15:30 → UTC 暦なら 5 (金)
        XCTAssertEqual(SchoolClock.displayDay(jst("2026-07-18 00:30")), 6, "[ui-revamp #C5] 土曜 0 時半は土曜")
    }

    func testC6SchoolClockTimeZoneIsFixedToAsiaTokyo() {
        XCTAssertEqual(SchoolClock.timeZone.identifier, "Asia/Tokyo", "[ui-revamp #C6]")
        XCTAssertEqual(SchoolClock.calendar.timeZone.identifier, "Asia/Tokyo", "[ui-revamp #C6]")
    }
}
