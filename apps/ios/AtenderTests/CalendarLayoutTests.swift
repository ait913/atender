import CoreGraphics
import XCTest
@testable import Atender

final class CalendarLayoutTests: XCTestCase {

    func testCA1RowHeightUsesAvailableCalendarSpace() {
        let expected = (CGFloat(700) - CalendarMonthLayout.weekdayHeaderHeight - CalendarMonthLayout.agendaHeight) / CGFloat(CalendarMonthLayout.rowCount)

        XCTAssertEqual(CalendarMonthLayout.rowHeight(available: 700), expected, accuracy: 0.001, "[ui-revamp #CA1]")
    }

    func testCA2RowHeightClampsToMinimumWhenTooSmall() {
        XCTAssertEqual(CalendarMonthLayout.rowHeight(available: 300),
                       CalendarMonthLayout.minRowHeight,
                       accuracy: 0.001,
                       "[ui-revamp #CA2]")
    }

    func testCA3ContentHeightUsesHeaderAndRowsOnly() {
        let rowHeight = CalendarMonthLayout.rowHeight(available: 700)
        let expected = CalendarMonthLayout.weekdayHeaderHeight + rowHeight * CGFloat(CalendarMonthLayout.rowCount)

        XCTAssertEqual(CalendarMonthLayout.contentHeight(available: 700), expected, accuracy: 0.001, "[ui-revamp #CA3]")
    }

    func testCA4RowHeightNeverFallsBelowMinimum() {
        XCTAssertGreaterThanOrEqual(CalendarMonthLayout.rowHeight(available: 0),
                                    CalendarMonthLayout.minRowHeight,
                                    "[ui-revamp #CA4]")
        XCTAssertGreaterThanOrEqual(CalendarMonthLayout.rowHeight(available: 1),
                                    CalendarMonthLayout.minRowHeight,
                                    "[ui-revamp #CA4]")
    }

    func testCA5SelectedWinsOverToday() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-07-17",
                                                 todayString: "2026-07-17",
                                                 selectedDate: "2026-07-17",
                                                 monthFirst: "2026-07-01"),
                       .selected,
                       "[ui-revamp #CA5]")
    }

    func testCA6TodayInCurrentMonth() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-07-17",
                                                 todayString: "2026-07-17",
                                                 selectedDate: "2026-07-16",
                                                 monthFirst: "2026-07-01"),
                       .today,
                       "[ui-revamp #CA6]")
    }

    func testCA7TodayWinsOverOutsideMonth() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-06-30",
                                                 todayString: "2026-06-30",
                                                 selectedDate: "2026-07-01",
                                                 monthFirst: "2026-07-01"),
                       .today,
                       "[ui-revamp #CA7]")
    }

    func testCA8OutsideMonthWhenNotSelectedOrToday() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-06-30",
                                                 todayString: "2026-07-17",
                                                 selectedDate: "2026-07-01",
                                                 monthFirst: "2026-07-01"),
                       .outsideMonth,
                       "[ui-revamp #CA8]")
    }

    func testCA9NormalCurrentMonthDay() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-07-16",
                                                 todayString: "2026-07-17",
                                                 selectedDate: "2026-07-01",
                                                 monthFirst: "2026-07-01"),
                       .normal,
                       "[ui-revamp #CA9]")
    }

    func testCA10SelectedWinsForOutsideMonth() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-06-30",
                                                 todayString: "2026-07-17",
                                                 selectedDate: "2026-06-30",
                                                 monthFirst: "2026-07-01"),
                       .selected,
                       "[ui-revamp #CA10]")
    }
}
