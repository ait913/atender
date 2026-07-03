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
            Set([QueryKey.userTimetables(), QueryKey.me()])
        )
    }
}
