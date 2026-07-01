import Foundation

enum DeepLink: Equatable {
    case roomJoin(code: String)
    case friendAdd(code: String)

    static func parse(_ url: URL) -> DeepLink? {
        var components: [String] = []
        if let host = url.host, !host.isEmpty {
            components.append(host)
        }
        components.append(contentsOf: url.pathComponents.filter { $0 != "/" })
        guard components.count >= 3 else { return nil }
        for index in 0...(components.count - 3) {
            let slice = Array(components[index..<(index + 3)])
            if slice[0] == "rooms", slice[1] == "join" {
                return .roomJoin(code: slice[2])
            }
            if slice[0] == "friends", slice[1] == "add" {
                return .friendAdd(code: slice[2])
            }
        }
        return nil
    }
}
