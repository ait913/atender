import XCTest
@testable import Atender

// Reviewer 生成: 設計doc §2.3 (APIClient) / §2.4 (APIError) を根拠に検証。
// HTTP は URLProtocol スタブで差し替え。
//
// !! 設計の食い違い (報告): §9.1 は「AuthStore/Keychain はプロトコル化してモック」を要求するが、
//   実装の AuthStore は `final class` (= サブクラス不可) かつ `@MainActor` 隔離。よって AuthStore を
//   差し替えるモックは作れない。代わりに実 AuthStore を使い:
//     - Bearer 付与の検証: Keychain に token を保存し AuthStore.token 経由で供給
//     - 401 ハンドリング: 401 受信後に AuthStore.state が .signedOut になることで
//       handleUnauthorized() が呼ばれたことを間接検証 (§3.4: handleUnauthorized → signedOut)
//   AuthStore を final/MainActor にした設計判断と §9.1 のモック前提が矛盾している点を報告。

// MARK: - URLProtocol スタブ

final class StubURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?
    nonisolated(unsafe) static var lastRequest: URLRequest?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        StubURLProtocol.lastRequest = request
        guard let handler = StubURLProtocol.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }
    override func stopLoading() {}

    static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: config)
    }
}

@MainActor
final class APIClientTests: XCTestCase {

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
        try? KeychainStore().delete()
        super.tearDown()
    }

    // 実 AuthStore + Keychain。token を Keychain に入れて Bearer 供給。
    private func makeClient(token: String?) throws -> (APIClient, AuthStore) {
        let keychain = KeychainStore()
        try? keychain.delete()
        if let token { try keychain.save(token: token) }
        // AuthStore も URLProtocol スタブ session を使う (bootstrap 等の /api/me も差し替え可能に)
        let auth = AuthStore(keychain: keychain, session: StubURLProtocol.makeSession())
        let client = APIClient(session: StubURLProtocol.makeSession(), authStore: auth)
        return (client, auth)
    }

    private func respond(status: Int, headers: [String: String] = [:], body: Data = Data()) {
        StubURLProtocol.handler = { request in
            let resp = HTTPURLResponse(url: request.url!, statusCode: status,
                                       httpVersion: "HTTP/1.1", headerFields: headers)!
            return (resp, body)
        }
    }

    // §2.3: requiresAuth=true で Authorization: Bearer <token> が付く
    func testBearerHeaderAddedWhenRequiresAuth() async throws {
        let (client, _) = try makeClient(token: "tok_abc")
        respond(status: 200, headers: ["Content-Type": "application/json"],
                body: #"{"date":"2026-06-08","occurrences":[]}"#.data(using: .utf8)!)

        let ep = APIEndpoint(path: "/api/today", method: .get)
        _ = try await client.send(ep, as: TodayResponse.self)

        let auth = StubURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization")
        XCTAssertEqual(auth, "Bearer tok_abc")
    }

    // §2.3: requiresAuth=false では Authorization を付けない
    func testNoBearerWhenRequiresAuthFalse() async throws {
        let (client, _) = try makeClient(token: "tok_abc")
        respond(status: 200, headers: ["Content-Type": "application/json"],
                body: #"{"date":"2026-06-08","occurrences":[]}"#.data(using: .utf8)!)

        var ep = APIEndpoint(path: "/api/auth/sign-in/social", method: .post)
        ep.requiresAuth = false
        _ = try await client.send(ep, as: TodayResponse.self)

        let auth = StubURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization")
        XCTAssertNil(auth, "requiresAuth=false では Bearer を付けない")
    }

    // §2.3: 204 はボディなし版で成功 (throw しない)
    func testNoContent204Succeeds() async throws {
        let (client, _) = try makeClient(token: "tok")
        respond(status: 204)
        let ep = APIEndpoint(path: "/api/attendance/occ_01", method: .post)
        do {
            try await client.send(ep)
        } catch {
            XCTFail("204 は成功扱いのはず: \(error)")
        }
    }

    // §2.3: 401 → APIError.unauthorized throw + handleUnauthorized 副作用 (signedOut)
    func testUnauthorized401() async throws {
        let (client, auth) = try makeClient(token: "tok")
        respond(status: 401, headers: ["Content-Type": "application/json"],
                body: #"{"error":{"code":"UNAUTHORIZED","message":"no"}}"#.data(using: .utf8)!)

        let ep = APIEndpoint(path: "/api/me", method: .get)
        do {
            _ = try await client.send(ep, as: MeResponse.self)
            XCTFail("401 は throw するはず")
        } catch let error as APIError {
            XCTAssertEqual(error, .unauthorized)
            // §2.3/§3.4: 401 で handleUnauthorized() → state = .signedOut
            XCTAssertEqual(auth.state, .signedOut,
                           "401 受信時に authStore.handleUnauthorized() が呼ばれ signedOut になる")
        }
    }

    // §2.3: その他ステータス + {error:{code,message}} を APIError.api にデコード
    func testErrorBodyDecodedToApiError() async throws {
        let (client, _) = try makeClient(token: "tok")
        respond(status: 403, headers: ["Content-Type": "application/json"],
                body: #"{"error":{"code":"SETUP_REQUIRED","message":"setup needed"}}"#.data(using: .utf8)!)

        let ep = APIEndpoint(path: "/api/today", method: .get)
        do {
            _ = try await client.send(ep, as: TodayResponse.self)
            XCTFail("403 は throw するはず")
        } catch let error as APIError {
            XCTAssertEqual(error, .api(status: 403, code: "SETUP_REQUIRED", message: "setup needed"))
        }
    }

    // §2.3: body があれば JSON encode + Content-Type: application/json
    func testRequestBodyContentTypeJSON() async throws {
        let (client, _) = try makeClient(token: "tok")
        respond(status: 204)

        struct Input: Encodable { let status: String }
        var ep = APIEndpoint(path: "/api/attendance/occ_01", method: .post)
        ep.body = Input(status: "PRESENT")
        try await client.send(ep)

        let ct = StubURLProtocol.lastRequest?.value(forHTTPHeaderField: "Content-Type")
        XCTAssertEqual(ct, "application/json")
        XCTAssertEqual(StubURLProtocol.lastRequest?.httpMethod, "POST")
    }
}
