import Foundation

enum APIConfig {
    static let baseURL: URL = {
        if let value = Bundle.main.object(forInfoDictionaryKey: "ATENDER_API_BASE_URL") as? String,
           let url = URL(string: value),
           !value.isEmpty {
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
