import XCTest
@testable import Atender

final class DeepLinkTests: XCTestCase {

    func testParsesRoomJoinLinks() {
        XCTAssertEqual(
            DeepLink.parse(URL(string: "https://atender.appily.run/rooms/join/ABC")!),
            .roomJoin(code: "ABC")
        )
        XCTAssertEqual(
            DeepLink.parse(URL(string: "atender://rooms/join/ABC")!),
            .roomJoin(code: "ABC")
        )
        XCTAssertEqual(
            DeepLink.parse(URL(string: "https://atender.appily.run/rooms/join/ABC/")!),
            .roomJoin(code: "ABC")
        )
        XCTAssertEqual(
            DeepLink.parse(URL(string: "https://atender.appily.run/rooms/join/ABC?x=1")!),
            .roomJoin(code: "ABC")
        )
    }

    func testParsesFriendAddLinks() {
        XCTAssertEqual(
            DeepLink.parse(URL(string: "https://atender.appily.run/friends/add/XYZ")!),
            .friendAdd(code: "XYZ")
        )
        XCTAssertEqual(
            DeepLink.parse(URL(string: "atender://friends/add/XYZ")!),
            .friendAdd(code: "XYZ")
        )
    }

    func testRejectsUnknownLinks() {
        XCTAssertNil(DeepLink.parse(URL(string: "https://atender.appily.run/")!))
        XCTAssertNil(DeepLink.parse(URL(string: "https://atender.appily.run/unknown/path/x")!))
    }

}
