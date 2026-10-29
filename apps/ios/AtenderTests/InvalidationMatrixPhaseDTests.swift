import XCTest
@testable import Atender

final class InvalidationMatrixPhaseDTests: XCTestCase {

    func testRoomMemberRemoveInvalidatesRoomsMembersAndRoomDetail() {
        XCTAssertEqual(
            Set(invalidationTargets(for: .roomMemberRemove(id: "r1"))),
            Set([QueryKey.rooms(), QueryKey.roomMembers("r1"), QueryKey.room("r1")])
        )
    }

    func testTemplateCopyInvalidatesUserTimetablesAndMe() {
        XCTAssertEqual(
            Set(invalidationTargets(for: .templateCopy)),
            Set([QueryKey.userTimetables(), QueryKey.me(), QueryKey(["today"]), QueryKey(["stats"]), QueryKey.semesters(), QueryKey.dayPrefix()])  // build 21: 取り込み (置換) は今日・統計・学期・日別にも効く (設計 doc §5.2.4)
        )
    }
}
