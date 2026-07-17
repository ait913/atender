import Foundation

enum APIError: Error, Equatable {
    case unauthorized
    case upgradeRequired
    case api(status: Int, code: String, message: String)
    case http(status: Int)
    case decoding(String)
    case transport(String)
}
