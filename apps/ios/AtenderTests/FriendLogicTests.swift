import XCTest
@testable import Atender

final class FriendLogicTests: XCTestCase {

    private func user(_ id: String) -> FriendshipUserDto {
        FriendshipUserDto(id: id, name: id, handle: id, image: nil)
    }

    private func friendship(
        id: String,
        sender: String,
        receiver: String,
        status: FriendshipStatus
    ) -> FriendshipDto {
        FriendshipDto(
            id: id,
            sender: user(sender),
            receiver: user(receiver),
            status: status,
            createdAt: "2026-07-01T00:00:00.000Z",
            acceptedAt: status == .accepted ? "2026-07-01T01:00:00.000Z" : nil
        )
    }

    func testSplitBucketsForMixedFriendships() {
        let buckets = FriendshipBuckets.split(
            [
                friendship(id: "received", sender: "other_1", receiver: "me", status: .pending),
                friendship(id: "sent", sender: "me", receiver: "other_2", status: .pending),
                friendship(id: "accepted", sender: "other_3", receiver: "me", status: .accepted),
                friendship(id: "blocked_by_me", sender: "me", receiver: "other_4", status: .blocked),
                friendship(id: "declined", sender: "me", receiver: "other_5", status: .declined),
                friendship(id: "blocked_by_other", sender: "other_6", receiver: "me", status: .blocked),
            ],
            meId: "me"
        )

        XCTAssertEqual(buckets.received.map(\.id), ["received"])
        XCTAssertEqual(buckets.sent.map(\.id), ["sent"])
        XCTAssertEqual(buckets.accepted.map(\.id), ["accepted"])
        XCTAssertEqual(buckets.blocked.map(\.id), ["blocked_by_me"])
    }

    func testSplitWithNilMeIdReturnsEmptyBuckets() {
        let buckets = FriendshipBuckets.split(
            [
                friendship(id: "received", sender: "other", receiver: "me", status: .pending),
                friendship(id: "accepted", sender: "other", receiver: "me", status: .accepted),
            ],
            meId: nil
        )

        XCTAssertTrue(buckets.received.isEmpty)
        XCTAssertTrue(buckets.sent.isEmpty)
        XCTAssertTrue(buckets.accepted.isEmpty)
        XCTAssertTrue(buckets.blocked.isEmpty)
    }

    func testOtherUserReturnsReceiverWhenSenderIsMe() {
        let friendship = friendship(id: "f1", sender: "me", receiver: "other", status: .accepted)

        XCTAssertEqual(FriendshipLogic.otherUser(friendship, meId: "me").id, "other")
    }

    func testOtherUserReturnsSenderWhenSenderIsNotMe() {
        let friendship = friendship(id: "f1", sender: "other", receiver: "me", status: .accepted)

        XCTAssertEqual(FriendshipLogic.otherUser(friendship, meId: "me").id, "other")
        XCTAssertEqual(FriendshipLogic.otherUser(friendship, meId: nil).id, "other")
    }
}
