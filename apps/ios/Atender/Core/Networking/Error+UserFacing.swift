import Foundation

extension Error {
    var userFacingMessage: String {
        if let apiError = self as? APIError {
            switch apiError {
            case .unauthorized: return "認証の有効期限が切れています。もう一度サインインしてください。"
            case let .api(_, _, message): return message
            case let .http(status): return "HTTP \(status)"
            case let .decoding(message), let .transport(message): return message
            }
        }
        return localizedDescription
    }
}
