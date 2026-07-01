import Foundation
import Observation

@MainActor
@Observable
final class APIClient {
    @ObservationIgnored private let session: URLSession
    @ObservationIgnored private let authStore: AuthStore
    @ObservationIgnored private let decoder: JSONDecoder
    @ObservationIgnored private let encoder: JSONEncoder

    init(session: URLSession = .shared, authStore: AuthStore) {
        self.session = session
        self.authStore = authStore
        self.decoder = JSONDecoder()
        self.decoder.keyDecodingStrategy = .useDefaultKeys
        self.encoder = JSONEncoder()
        self.encoder.keyEncodingStrategy = .useDefaultKeys
    }

    func send<T: Decodable>(_ endpoint: APIEndpoint, as type: T.Type) async throws -> T {
        let (data, response) = try await perform(endpoint)
        let status = response.statusCode

        if status == 401 {
            authStore.handleUnauthorized()
            throw APIError.unauthorized
        }

        guard (200...299).contains(status) else {
            throw decodeHTTPError(data: data, status: status)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error.localizedDescription)
        }
    }

    func send(_ endpoint: APIEndpoint) async throws {
        let (data, response) = try await perform(endpoint)
        let status = response.statusCode

        if status == 401 {
            authStore.handleUnauthorized()
            throw APIError.unauthorized
        }

        guard (200...299).contains(status) else {
            throw decodeHTTPError(data: data, status: status)
        }
    }

    func upload<T: Decodable>(
        path: String,
        fileData: Data,
        filename: String,
        fieldName: String = "file",
        contentType: String = "text/calendar",
        as type: T.Type
    ) async throws -> T {
        let boundary = "Boundary-\(UUID().uuidString)"
        let cleanPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let url = APIConfig.baseURL.appending(path: cleanPath)
        var request = URLRequest(url: url)
        request.httpMethod = HTTPMethod.post.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let token = authStore.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(contentType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.transport("Invalid HTTP response")
            }
            if httpResponse.statusCode == 401 {
                authStore.handleUnauthorized()
                throw APIError.unauthorized
            }
            guard (200...299).contains(httpResponse.statusCode) else {
                throw decodeHTTPError(data: data, status: httpResponse.statusCode)
            }
            return try decoder.decode(T.self, from: data)
        } catch let error as APIError {
            throw error
        } catch let error as DecodingError {
            throw APIError.decoding(error.localizedDescription)
        } catch {
            throw APIError.transport(error.localizedDescription)
        }
    }

    private func perform(_ endpoint: APIEndpoint) async throws -> (Data, HTTPURLResponse) {
        let request: URLRequest
        do {
            request = try makeRequest(endpoint)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.transport(error.localizedDescription)
        }

        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.transport("Invalid HTTP response")
            }
            return (data, httpResponse)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.transport(error.localizedDescription)
        }
    }

    private func makeRequest(_ endpoint: APIEndpoint) throws -> URLRequest {
        let cleanPath = endpoint.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let base = APIConfig.baseURL.appending(path: cleanPath)
        guard var components = URLComponents(url: base, resolvingAgainstBaseURL: false) else {
            throw APIError.transport("Invalid URL")
        }
        if !endpoint.query.isEmpty {
            components.queryItems = endpoint.query
                .sorted { $0.key < $1.key }
                .map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components.url else {
            throw APIError.transport("Invalid URL components")
        }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if endpoint.requiresAuth, let token = authStore.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = endpoint.body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        return request
    }

    private func decodeHTTPError(data: Data, status: Int) -> APIError {
        if let errorResponse = try? decoder.decode(ErrorResponse.self, from: data) {
            return .api(status: status, code: errorResponse.error.code, message: errorResponse.error.message)
        }
        return .http(status: status)
    }
}

private struct AnyEncodable: Encodable {
    private let encodeValue: (Encoder) throws -> Void

    init(_ value: Encodable) {
        self.encodeValue = value.encode(to:)
    }

    func encode(to encoder: Encoder) throws {
        try encodeValue(encoder)
    }
}
