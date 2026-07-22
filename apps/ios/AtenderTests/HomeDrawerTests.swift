import Foundation
import XCTest
@testable import Atender

final class HomeDrawerTests: XCTestCase {
    func testD1SelfWithRoomsShowsSemesterAndContextChips() {
        XCTAssertEqual(
            HomeDrawer.sections(context: .self, hasRooms: true),
            [.semester, .contextChips],
            "[#D1]"
        )
    }

    func testD2SelfWithoutRoomsShowsSemesterOnly() {
        XCTAssertEqual(
            HomeDrawer.sections(context: .self, hasRooms: false),
            [.semester],
            "[#D2]"
        )
    }

    func testD3RoomWithRoomsShowsContextChipsOnly() {
        XCTAssertEqual(
            HomeDrawer.sections(context: .room(roomId: "r1"), hasRooms: true),
            [.contextChips],
            "[#D3]"
        )
    }

    func testD4RoomWithoutRoomsShowsNoSections() {
        XCTAssertEqual(
            HomeDrawer.sections(context: .room(roomId: "r1"), hasRooms: false),
            [],
            "[#D4]"
        )
    }

    func testD5CollapsedDownwardDragPastThresholdOpens() {
        XCTAssertTrue(
            HomeDrawer.resolve(isExpanded: false, translationHeight: 60, translationWidth: 0),
            "[#D5]"
        )
    }

    func testD6CollapsedDownwardDragBelowThresholdKeepsCollapsed() {
        XCTAssertFalse(
            HomeDrawer.resolve(isExpanded: false, translationHeight: 30, translationWidth: 0),
            "[#D6]"
        )
    }

    func testD7ExpandedUpwardDragPastThresholdCollapses() {
        XCTAssertFalse(
            HomeDrawer.resolve(isExpanded: true, translationHeight: -60, translationWidth: 0),
            "[#D7]"
        )
    }

    func testD8ExpandedUpwardDragBelowThresholdKeepsExpanded() {
        XCTAssertTrue(
            HomeDrawer.resolve(isExpanded: true, translationHeight: -30, translationWidth: 0),
            "[#D8]"
        )
    }

    func testD9CollapsedHorizontalDominantDragIsIgnored() {
        XCTAssertFalse(
            HomeDrawer.resolve(isExpanded: false, translationHeight: 50, translationWidth: 120),
            "[#D9]"
        )
    }

    func testD10ExpandedHorizontalDominantDragIsIgnored() {
        XCTAssertTrue(
            HomeDrawer.resolve(isExpanded: true, translationHeight: -50, translationWidth: 120),
            "[#D10]"
        )
    }

    func testD11TapTogglesDrawerState() {
        XCTAssertTrue(HomeDrawer.toggled(false), "[#D11]")
        XCTAssertFalse(HomeDrawer.toggled(true), "[#D11]")
    }
}
