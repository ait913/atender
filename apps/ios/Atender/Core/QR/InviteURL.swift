import Foundation

enum InviteURL {
    private static let baseURL = "https://atender.appily.run"

    /// "https://atender.appily.run/rooms/join/<inviteCode>"
    static func room(inviteCode: String) -> String {
        "\(baseURL)/rooms/join/\(inviteCode)"
    }

    /// "https://atender.appily.run/friends/add/<inviteCode>"
    static func friend(inviteCode: String) -> String {
        "\(baseURL)/friends/add/\(inviteCode)"
    }
}
