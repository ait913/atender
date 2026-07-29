import Foundation

extension Error {
    var userFacingMessage: String {
        if let apiError = self as? APIError {
            switch apiError {
            case .unauthorized: return "認証の有効期限が切れています。もう一度サインインしてください。"
            case .upgradeRequired: return "アプリの更新が必要です。TestFlight から最新版に更新してください。"
            case let .api(_, _, message): return message
            // ★ ステータスを必ず出す。Nginx が非 JSON のエラーページを返すと .api に落ちず
            //   ここに来るため、番号が無いと何が起きたか追跡できなくなる (実機で発生)
            case let .http(status): return "サーバーエラー (HTTP \(status))"
            case let .decoding(message): return "応答を解釈できませんでした (\(message))"
            case let .transport(message): return message
            }
        }
        return localizedDescription
    }
}

/// ★ これが無いと `localizedDescription` が NSError の既定表現に落ち、
///   「操作を完了できませんでした。（Atender.APIError エラー1）」という
///   **ユーザーにも開発者にも読めない文字列**になる (実機で発生)。
///   しかも case 番号は宣言順ではなく「associated value を持つ case が先」なので、
///   番号から case を逆引きしようとすると誤読する。
extension APIError: LocalizedError {
    var errorDescription: String? { userFacingMessage }
}
