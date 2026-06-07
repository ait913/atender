import Foundation

struct APIEndpoint {
    let path: String
    let method: HTTPMethod
    var query: [String: String] = [:]
    var body: Encodable? = nil
    var requiresAuth: Bool = true
}

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case patch = "PATCH"
    case delete = "DELETE"
}
