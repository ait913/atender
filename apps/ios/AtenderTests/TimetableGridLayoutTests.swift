import CoreGraphics
import XCTest
@testable import Atender

final class TimetableGridLayoutTests: XCTestCase {

    private func slot(_ periodIndex: Int, startMinute: Int, endMinute: Int, isBreak: Bool = false) -> DaySlotDto {
        DaySlotDto(periodIndex: periodIndex, label: "\(periodIndex)限",
                   startMinute: startMinute, endMinute: endMinute, isBreak: isBreak)
    }

    func testG1RowHeightUsesAvailableHeightWhenItFits() {
        let expected = (CGFloat(500) - TimetableGridLayout.headerHeight) / CGFloat(5)

        XCTAssertEqual(TimetableGridLayout.rowHeight(available: 500, rowCount: 5), expected, accuracy: 0.001, "[ui-revamp #G1]")
    }

    func testG2RowHeightClampsToMinimumWhenTooSmall() {
        XCTAssertEqual(TimetableGridLayout.rowHeight(available: 200, rowCount: 6),
                       TimetableGridLayout.minRowHeight,
                       accuracy: 0.001,
                       "[ui-revamp #G2]")
    }

    func testG3ZeroRowsReturnMinimumRowHeight() {
        XCTAssertEqual(TimetableGridLayout.rowHeight(available: 500, rowCount: 0),
                       TimetableGridLayout.minRowHeight,
                       accuracy: 0.001,
                       "[ui-revamp #G3]")
    }

    func testG4ContentHeightMatchesAvailableWhenItFits() {
        let rowHeight = (CGFloat(500) - TimetableGridLayout.headerHeight) / CGFloat(5)
        let expected = TimetableGridLayout.headerHeight + rowHeight * CGFloat(5)

        XCTAssertEqual(TimetableGridLayout.contentHeight(available: 500, rowCount: 5), expected, accuracy: 0.001, "[ui-revamp #G4]")
        XCTAssertEqual(TimetableGridLayout.contentHeight(available: 500, rowCount: 5), 500, accuracy: 0.001, "[ui-revamp #G4]")
    }

    func testG5ContentHeightCanExceedAvailableWhenRowsNeedMinimumTapTarget() {
        let expected = TimetableGridLayout.headerHeight + TimetableGridLayout.minRowHeight * CGFloat(6)

        XCTAssertEqual(TimetableGridLayout.contentHeight(available: 200, rowCount: 6), expected, accuracy: 0.001, "[ui-revamp #G5]")
        XCTAssertGreaterThan(TimetableGridLayout.contentHeight(available: 200, rowCount: 6), 200, "[ui-revamp #G5]")
    }

    func testG6RowHeightNeverFallsBelowMinimum() {
        XCTAssertGreaterThanOrEqual(TimetableGridLayout.rowHeight(available: 0, rowCount: 10),
                                    TimetableGridLayout.minRowHeight,
                                    "[ui-revamp #G6]")
        XCTAssertGreaterThanOrEqual(TimetableGridLayout.rowHeight(available: 1, rowCount: 100),
                                    TimetableGridLayout.minRowHeight,
                                    "[ui-revamp #G6]")
    }

    func testG7CurrentPeriodIndexDuringFirstClass() {
        let slots = [
            slot(1, startMinute: 540, endMinute: 630),
            slot(2, startMinute: 640, endMinute: 730),
        ]

        XCTAssertEqual(TimetableGridLayout.currentPeriodIndex(daySlots: slots, nowMinute: 600), 1, "[ui-revamp #G7]")
    }

    func testG8CurrentPeriodIndexIsNilBetweenClasses() {
        let slots = [
            slot(1, startMinute: 540, endMinute: 630),
            slot(2, startMinute: 640, endMinute: 730),
        ]

        XCTAssertNil(TimetableGridLayout.currentPeriodIndex(daySlots: slots, nowMinute: 635), "[ui-revamp #G8]")
    }

    func testG9CurrentPeriodIndexUsesOpenEndClosedStartBoundary() {
        let slots = [
            slot(1, startMinute: 540, endMinute: 630),
            slot(2, startMinute: 640, endMinute: 730),
        ]

        XCTAssertNil(TimetableGridLayout.currentPeriodIndex(daySlots: slots, nowMinute: 630), "[ui-revamp #G9]")
        XCTAssertEqual(TimetableGridLayout.currentPeriodIndex(daySlots: slots, nowMinute: 640), 2, "[ui-revamp #G9]")
    }

    func testG10EmptyDaySlotsReturnNil() {
        XCTAssertNil(TimetableGridLayout.currentPeriodIndex(daySlots: [], nowMinute: 600), "[ui-revamp #G10]")
    }

    func testG11BreakSlotsAreIncluded() {
        let slots = [slot(99, startMinute: 630, endMinute: 640, isBreak: true)]

        XCTAssertEqual(TimetableGridLayout.currentPeriodIndex(daySlots: slots, nowMinute: 635), 99, "[ui-revamp #G11]")
    }

    func testG12DaySlotsAreSortedByPeriodIndex() {
        let slots = [
            slot(2, startMinute: 640, endMinute: 730),
            slot(1, startMinute: 540, endMinute: 630),
        ]

        XCTAssertEqual(TimetableGridLayout.currentPeriodIndex(daySlots: slots, nowMinute: 600), 1, "[ui-revamp #G12]")
    }
}
