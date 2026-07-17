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

    /// iOS は `Authorization: Bearer` で認証する (better-auth bearer plugin)。
    /// `URLSession.shared` はグローバルの `HTTPCookieStorage` を共有するため、API の `Set-Cookie` が
    /// 自動保存され以降の全リクエストに cookie が付く。better-auth の originCheckMiddleware は
    /// **cookie 付きリクエストだけ Origin を検証する**ので、Origin を送らないネイティブは 403
    /// (`MISSING_OR_NULL_ORIGIN`) になる。cookie を一切持たないことが本来の設計。
    static func makeSession(protocolClasses: [AnyClass]? = nil) -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpCookieStorage = nil
        if let value = AppVersion.clientHeaderValue(build: AppVersion.current) {
            configuration.httpAdditionalHeaders = [AppVersion.clientHeaderField: value]
        }
        if let protocolClasses {
            configuration.protocolClasses = protocolClasses
        }
        return URLSession(configuration: configuration)
    }

    static let apiSession: URLSession = makeSession()
}
