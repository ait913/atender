import Foundation

enum FriendshipBuckets {
    struct Buckets: Equatable {
        let received: [FriendshipDto]
        let sent: [FriendshipDto]
        let accepted: [FriendshipDto]
        let blocked: [FriendshipDto]
    }

    static func split(_ list: [FriendshipDto], meId: String?) -> Buckets {
        guard let meId else {
            return .init(received: [], sent: [], accepted: [], blocked: [])
        }
        return .init(
            received: list.filter { $0.status == .pending && $0.receiver.id == meId },
            sent: list.filter { $0.status == .pending && $0.sender.id == meId },
            accepted: list.filter { $0.status == .accepted },
            blocked: list.filter { $0.status == .blocked && $0.sender.id == meId }
        )
    }
}

enum FriendshipLogic {
    static func otherUser(_ f: FriendshipDto, meId: String?) -> FriendshipUserDto {
        f.sender.id == meId ? f.receiver : f.sender
    }
}
