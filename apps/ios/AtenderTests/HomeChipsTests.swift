import XCTest
@testable import Atender

final class HomeChipsTests: XCTestCase {
    private func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .useDefaultKeys
        return decoder
    }

    private func loadFixture(_ name: String) throws -> Data {
        let bundle = Bundle(for: type(of: self))
        guard let url = bundle.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
            ?? bundle.url(forResource: name, withExtension: "json") else {
            throw XCTSkip("Fixture \(name).json がテストバンドルに含まれていない")
        }
        return try Data(contentsOf: url)
    }

    private func makeRoom(id: String, name: String) throws -> RoomSummaryDto {
        let data = try loadFixture("roomSummary")
        guard var json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            XCTFail("roomSummary.json が JSON object ではない")
            throw XCTSkip("roomSummary.json を RoomSummaryDto 生成に使えない")
        }

        json["id"] = id
        json["name"] = name

        let modifiedData = try JSONSerialization.data(withJSONObject: json)
        return try makeDecoder().decode(RoomSummaryDto.self, from: modifiedData)
    }

    func testItemsWithNoRoomsContainsOnlySelfChip() {
        let items = HomeChips.items(rooms: [])

        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items[0].id, "self")

        if case .selfChip(label: let label) = items[0] {
            XCTAssertEqual(label, "自分")
        } else {
            XCTFail("先頭要素は .selfChip(label: \"自分\") であるべき")
        }
    }

    func testItemsWithRoomsKeepsSelfFirstAndRoomsInInputOrder() throws {
        let roomA = try makeRoom(id: "room_A", name: "A")
        let roomB = try makeRoom(id: "room_B", name: "B")

        let items = HomeChips.items(rooms: [roomA, roomB])

        XCTAssertEqual(items.count, 3)

        if case .selfChip(label: let label) = items[0] {
            XCTAssertEqual(label, "自分")
        } else {
            XCTFail("[0] は .selfChip(label: \"自分\") であるべき")
        }

        if case .room(roomId: let roomId, roomName: let roomName) = items[1] {
            XCTAssertEqual(roomId, roomA.id)
            XCTAssertEqual(roomName, roomA.name)
        } else {
            XCTFail("[1] は roomA の .room chip であるべき")
        }

        if case .room(roomId: let roomId, roomName: let roomName) = items[2] {
            XCTAssertEqual(roomId, roomB.id)
            XCTAssertEqual(roomName, roomB.name)
        } else {
            XCTFail("[2] は roomB の .room chip であるべき")
        }
    }

    func testItemIdsStartWithSelfThenRoomIdsInInputOrder() throws {
        let roomA = try makeRoom(id: "room_A", name: "A")
        let roomB = try makeRoom(id: "room_B", name: "B")

        let ids = HomeChips.items(rooms: [roomA, roomB]).map(\.id)

        XCTAssertEqual(ids, ["self", roomA.id, roomB.id])
    }
}
