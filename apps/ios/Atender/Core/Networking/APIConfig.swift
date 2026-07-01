import Foundation

enum APIConfig {
    static let baseURL: URL = {
        // scheme と host は別キーで持つ。xcconfig は `//` をコメント扱いするため
        // BASE_URL を `scheme://host` で組むと host が欠落する (knowledge: xcconfig-double-slash-comment-truncates-url)。
        let scheme = (Bundle.main.object(forInfoDictionaryKey: "ATENDER_API_SCHEME") as? String)?
            .replacingOccurrences(of: ":", with: "")
        let host = Bundle.main.object(forInfoDictionaryKey: "ATENDER_API_HOST") as? String
        if let scheme, !scheme.isEmpty, let host, !host.isEmpty,
           let url = URL(string: "\(scheme)://\(host)"), url.host != nil {
            return url
        }
        #if DEBUG
        return URL(string: "http://localhost:8787")!
        #else
        return URL(string: "https://atender-api.appily.run")!
        #endif
    }()

    static let authCallbackScheme = "atender"
}
