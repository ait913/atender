import XCTest
@testable import Atender

// Reviewer 生成: 契約仕様のみを根拠に検証。実装コード (RoomRepositories.swift / DTOs.swift) は未読。
//
// このファイルの存在理由:
//   既存 DTODecodingTests:326 は `decode(RoomWeekDto.self, from: fixture)` と **型を直書き** しており、
//   repository が client.send(_, as:) に実際に渡す型を一度も実行していなかった。
//   よって DTO 層・APIClient 層が individually 正しくても、両者を繋ぐ配線のバグが緑のまま通っていた。
//   ここでは URLProtocol スタブ + 実 APIClient + 実 RoomRepository を通し、**配線そのもの** を実行する。
//
// スタブに食わせる JSON は手打ちせず、稼働中の実 API (localhost:8787) から採取した
// Fixtures/*Live.json をそのまま使う (手打ちは必須キー漏れで偽 fail を生むため)。
//   実測: /api/rooms/:id/week -> ["weekStart","weekEnd","members","meetings","roomEvents"] (ラッパー無し)
//         /api/rooms -> {rooms} / /api/rooms/:id -> {room} / /api/rooms/:id/members -> {members} (包む)

@MainActor
final class RoomWeekContractTests: XCTestCase {

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
        try? KeychainStore().delete()
        super.tearDown()
    }

    private func makeClient() throws -> APIClient {
        let keychain = KeychainStore()
        try? keychain.delete()
        try keychain.save(token: "tok")
        let auth = AuthStore(keychain: keychain, session: StubURLProtocol.makeSession())
        return APIClient(session: StubURLProtocol.makeSession(), authStore: auth)
    }

    /// 実 API から採取した生レスポンス
    private func liveFixture(_ name: String) throws -> String {
        let bundle = Bundle(for: type(of: self))
        guard let url = bundle.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
            ?? bundle.url(forResource: name, withExtension: "json") else {
            throw XCTSkip("Fixture \(name).json がテストバンドルに無い")
        }
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func respond(status: Int = 200, json: String) {
        StubURLProtocol.handler = { request in
            let resp = HTTPURLResponse(url: request.url!, statusCode: status,
                                       httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "application/json"])!
            return (resp, json.data(using: .utf8)!)
        }
    }

    // MARK: - 契約1: ラッパー無しの実 API レスポンスを repository が decode できる

    func testRoomWeekRepositoryDecodesUnwrappedLiveResponse() async throws {
        let repo = RoomRepository(client: try makeClient(), cache: QueryClient())
        respond(json: try liveFixture("roomWeekLive"))

        let week = try await repo.roomWeek(id: "room_1", weekStart: "2026-07-13", force: true)

        XCTAssertFalse(week.members.isEmpty, "members が読めること")
        XCTAssertFalse(week.meetings.isEmpty, "meetings が読めること")
        XCTAssertFalse(week.roomEvents.isEmpty, "roomEvents が読めること")
        XCTAssertEqual(week.members[0].userId, "demo-user-ios")
        XCTAssertEqual(week.meetings[0].courseName, "プログラミング演習")
        XCTAssertEqual(week.meetings[0].startMinute, 540, accuracy: 0.0001)
        XCTAssertFalse(week.recurringMeetings.isEmpty, "recurringMeetings が読めること")
        XCTAssertEqual(week.recurringMeetings[0].courseName, "プログラミング演習")
        XCTAssertEqual(week.recurringMeetings[0].dayOfWeek, 1)
        XCTAssertEqual(week.recurringMeetings[0].startPeriodIndex, 1)
        XCTAssertEqual(week.roomEvents[0].title, "合同勉強会")
        XCTAssertEqual(week.roomEvents[0].source, .manual)
    }

    func testRoomWeekDecodeDefaultsMissingRecurringMeetingsToEmptyArray() throws {
        let json = """
        {
          "weekStart": "2026-07-12T15:00:00.000Z",
          "weekEnd": "2026-07-19T14:59:59.999Z",
          "members": [
            {"userId": "demo-user-ios", "name": "デモ太郎", "handle": null, "image": null, "color": "hsl(301 70% 45%)"}
          ],
          "meetings": [
            {"userId": "demo-user-ios", "occurrenceId": "occ_1", "courseId": "course_1", "courseName": "プログラミング演習", "courseColor": "#3B82F6", "date": "2026-07-13", "startMinute": 540, "endMinute": 630}
          ],
          "roomEvents": []
        }
        """

        let week = try JSONDecoder().decode(RoomWeekDto.self, from: Data(json.utf8))

        XCTAssertEqual(week.recurringMeetings, [])
        XCTAssertEqual(week.members[0].userId, "demo-user-ios")
        XCTAssertEqual(week.meetings[0].courseName, "プログラミング演習")
    }

    /// 負のコントロール: `week` ラッパー付きは契約違反なので decode 失敗すべき。
    /// これが pass することで「repository がラッパーを期待していない」= 修正済みが示される。
    func testRoomWeekRepositoryRejectsWrappedResponse() async throws {
        let repo = RoomRepository(client: try makeClient(), cache: QueryClient())
        respond(json: "{\"week\": \(try liveFixture("roomWeekLive"))}")

        do {
            let week = try await repo.roomWeek(id: "room_1", weekStart: "2026-07-13", force: true)
            XCTFail("`week` ラッパー付きを decode 成功してはならない (members=\(week.members.count))")
        } catch {
            // 期待どおり
        }
    }

    // MARK: - 契約2: 読み込みがエラーにならない (RoomDetailView.load() の loadError=true 経路)

    func testRoomWeekLoadDoesNotThrowForLiveShape() async throws {
        let repo = RoomRepository(client: try makeClient(), cache: QueryClient())
        respond(json: try liveFixture("roomWeekLive"))

        do {
            _ = try await repo.roomWeek(id: "room_1", weekStart: "2026-07-13", force: true)
        } catch {
            XCTFail("実 API 形状で throw → RoomDetailView.load() が loadError=true になる: \(error)")
        }
    }

    // MARK: - 契約3: キャッシュ経路も同じ型で整合する

    func testRoomWeekCacheHitReturnsSameDtoWithoutNetwork() async throws {
        let repo = RoomRepository(client: try makeClient(), cache: QueryClient())
        respond(json: try liveFixture("roomWeekLive"))
        let fresh = try await repo.roomWeek(id: "room_1", weekStart: "2026-07-13", force: true)

        // 以降ネットワークが使われたら 500 で失敗する状態にする
        respond(status: 500, json: "{\"error\":{\"code\":\"BOOM\",\"message\":\"network used\"}}")
        let cached = try await repo.roomWeek(id: "room_1", weekStart: "2026-07-13", force: false)

        XCTAssertEqual(cached.members.count, fresh.members.count, "キャッシュ経路も同じ RoomWeekDto")
        XCTAssertEqual(cached.meetings.count, fresh.meetings.count)
        XCTAssertEqual(cached.roomEvents.count, fresh.roomEvents.count)
        XCTAssertEqual(cached.members[0].userId, fresh.members[0].userId)
        XCTAssertEqual(cached.roomEvents[0].title, fresh.roomEvents[0].title)
    }

    func testRoomWeekForceRefetchesFromNetwork() async throws {
        let repo = RoomRepository(client: try makeClient(), cache: QueryClient())
        respond(json: try liveFixture("roomWeekLive"))
        _ = try await repo.roomWeek(id: "room_1", weekStart: "2026-07-13", force: true)

        respond(status: 500, json: "{\"error\":{\"code\":\"BOOM\",\"message\":\"boom\"}}")
        do {
            _ = try await repo.roomWeek(id: "room_1", weekStart: "2026-07-13", force: true)
            XCTFail("force:true はネットワークを叩くので 500 が伝播するはず")
        } catch {
            // 期待どおり
        }
    }

    // MARK: - 契約4: 兄弟エンドポイントは **包む** 契約のまま (week だけが例外)

    func testRoomsListKeepsRoomsWrapper() async throws {
        let repo = RoomRepository(client: try makeClient(), cache: QueryClient())
        respond(json: try liveFixture("roomsLive"))

        let rooms = try await repo.rooms(force: true)
        XCTAssertFalse(rooms.isEmpty, "/api/rooms は {rooms} 包みのまま decode できること")
    }

    func testRoomsListRejectsUnwrappedArray() async throws {
        let repo = RoomRepository(client: try makeClient(), cache: QueryClient())
        // {rooms:[...]} から配列だけを剥がした形 = 契約違反
        let unwrapped = try liveFixture("roomsLive")
            .replacingOccurrences(of: "{\"rooms\":", with: "")
            .replacingOccurrences(of: "}", with: "", range: nil)
        respond(json: unwrapped)
        do {
            _ = try await repo.rooms(force: true)
            XCTFail("/api/rooms のラッパー無しを decode 成功してはならない")
        } catch {}
    }

    func testRoomDetailKeepsRoomWrapper() async throws {
        let repo = RoomRepository(client: try makeClient(), cache: QueryClient())
        respond(json: try liveFixture("roomLive"))

        let room = try await repo.room(id: "room_1", force: true)
        XCTAssertEqual(room.id, "cmrokpujf0085elth2tl8z8c3", "/api/rooms/:id は {room} 包みのまま")
    }

    func testRoomMembersKeepsMembersWrapper() async throws {
        let repo = RoomRepository(client: try makeClient(), cache: QueryClient())
        respond(json: try liveFixture("roomMembersLive"))

        let members = try await repo.roomMembers(id: "room_1", force: true)
        XCTAssertFalse(members.isEmpty, "/api/rooms/:id/members は {members} 包みのまま")
    }
}
