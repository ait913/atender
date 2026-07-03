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

    func testIcsUploadResponseDecodes() throws {
        let data = Data(#"{"import":{"id":"imp_1"},"parsedCount":12,"dedup":true}"#.utf8)

        let response = try JSONDecoder().decode(IcsUploadResponse.self, from: data)

        XCTAssertEqual(response.import.id, "imp_1")
        XCTAssertEqual(response.parsedCount, 12)
        XCTAssertTrue(response.dedup)
    }
}
