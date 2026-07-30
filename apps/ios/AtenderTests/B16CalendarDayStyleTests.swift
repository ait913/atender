import SwiftUI
import UIKit
import XCTest
@testable import Atender

final class B16CalendarDayStyleTests: XCTestCase {

    func testC1Today() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-07-17",
                                                 todayString: "2026-07-17",
                                                 monthFirst: "2026-07-01"),
                       .today,
                       "[build16 #C1]")
    }

    func testC2TodayWinsOverOutsideMonth() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-06-30",
                                                 todayString: "2026-06-30",
                                                 monthFirst: "2026-07-01"),
                       .today,
                       "[build16 #C2]")
    }

    func testC3OutsideMonth() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-06-30",
                                                 todayString: "2026-07-17",
                                                 monthFirst: "2026-07-01"),
                       .outsideMonth,
                       "[build16 #C3]")
    }

    func testC4Normal() {
        XCTAssertEqual(CalendarDayStyle.emphasis(date: "2026-07-16",
                                                 todayString: "2026-07-17",
                                                 monthFirst: "2026-07-01"),
                       .normal,
                       "[build16 #C4]")
    }

    func testC5SelectedDateMatches() {
        XCTAssertTrue(CalendarDayStyle.isSelected(date: "2026-07-15",
                                                  selectedDate: "2026-07-15"),
                      "[build16 #C5]")
    }

    func testC6SelectedDateDoesNotMatch() {
        XCTAssertFalse(CalendarDayStyle.isSelected(date: "2026-07-15",
                                                   selectedDate: "2026-07-16"),
                       "[build16 #C6]")
    }

    func testC7EmptyDateIsNotSelected() {
        XCTAssertFalse(CalendarDayStyle.isSelected(date: "",
                                                   selectedDate: ""),
                       "[build16 #C7]")
        XCTAssertFalse(CalendarDayStyle.isSelected(date: "2026-07-15",
                                                   selectedDate: ""),
                       "[build16 #C7] selectedDate が空なら選択扱いにしない")
        XCTAssertFalse(CalendarDayStyle.isSelected(date: "",
                                                   selectedDate: "2026-07-15"),
                       "[build16 #C7] date が空なら選択扱いにしない")
    }

    func testC8OutsideMonthCanBeSelected() {
        XCTAssertTrue(CalendarDayStyle.isSelected(date: "2026-06-30",
                                                  selectedDate: "2026-06-30"),
                      "[build16 #C8]")
    }
}
