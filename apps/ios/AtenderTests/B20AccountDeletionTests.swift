import Foundation
import XCTest
@testable import Atender

/// 設計 20261009-build20-account-deletion-legal.md §13.5 (#I1-#I10)。
/// Reviewer が設計 doc だけを根拠に書いたテスト。
private final class RequestLog: @unchecked Sendable {
    private let lock = NSLock()
    private var items: [(path: String, method: String, auth: String?, contentType: String?, body: Data?, hasBody: Bool)] = []

    func append(_ request: URLRequest) {
        lock.lock(); defer { lock.unlock() }
        items.append((
            path: request.url?.path ?? "",
            method: request.httpMethod ?? "",
            auth: request.value(forHTTPHeaderField: "Authorization"),
            contentType: request.value(forHTTPHeaderField: "Content-Type"),
            body: Self.bodyData(request),
            hasBody: request.httpBody != nil || request.httpBodyStream != nil
        ))
    }

    var all: [(path: String, method: String, auth: String?, contentType: String?, body: Data?, hasBody: Bool)] {
        lock.lock(); defer { lock.unlock() }
        return items
    }

    var paths: [String] { all.map { $0.path } }

    func reset() {
        lock.lock(); defer { lock.unlock() }
        items.removeAll()
    }

    static func bodyData(_ request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count > 0 { data.append(buffer, count: count) } else { break }
        }
        return data
    }
}

private let meJSON = #"{"user":{"id":"u1","email":"a@b.c","name":"A","image":null,"handle":"a","inviteCode":"X","defaultSemesterId":"s1","schoolId":"sc1","departmentId":"d1","requiredAttendanceRate":80},"setupStatus":{"hasSchool":true,"hasDepartment":true,"hasSemester":true,"hasUserTimetable":true,"isComplete":true}}"#

@MainActor
final class B20AccountDeletionTests: XCTestCase {

    private let log = RequestLog()

    override func setUp() {
        super.setUp()
        log.reset()
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
        try? KeychainStore().delete()
        super.tearDown()
    }

    private func makeStore() -> (AuthStore, KeychainStore) {
        let keychain = KeychainStore()
        try? keychain.delete()
        return (AuthStore(keychain: keychain, session: StubURLProtocol.makeSession()), keychain)
    }

    /// path で分岐する stub。exchangeStatus が nil のとき exchange は 200 {"stored":true}。
    private func stubAppleFlow(exchangeStatus: Int = 200) {
        let log = self.log
        StubURLProtocol.handler = { request in
            log.append(request)
            let path = request.url?.path ?? ""
            func resp(_ status: Int, _ headers: [String: String] = [:]) -> HTTPURLResponse {
                HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
            }
            switch path {
            case "/api/auth/sign-in/social":
                return (resp(200, ["set-auth-token": "apple_session_token", "Content-Type": "application/json"]), Data("{}".utf8))
            case "/api/me":
                return (resp(200, ["Content-Type": "application/json"]), Data(meJSON.utf8))
            case "/api/auth-apple/exchange":
                if exchangeStatus == 200 {
                    return (resp(200, ["Content-Type": "application/json"]), Data(#"{"stored":true}"#.utf8))
                }
                return (resp(exchangeStatus, ["Content-Type": "application/json"]), Data(#"{"error":{"code":"X","message":"x"}}"#.utf8))
            default:
                return (resp(404), Data())
            }
        }
    }

    private func json(_ data: Data?) throws -> [String: Any] {
        let d = try XCTUnwrap(data, "body should be present")
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: d) as? [String: Any])
    }

    // MARK: #I1 / #I2

    func testI1AuthorizationCodeString() {
        XCTAssertEqual(AppleSignIn.authorizationCodeString(from: "abc".data(using: .utf8)), "abc")
        XCTAssertNil(AppleSignIn.authorizationCodeString(from: nil))
        XCTAssertNil(AppleSignIn.authorizationCodeString(from: Data()))
        XCTAssertNil(AppleSignIn.authorizationCodeString(from: Data([0xFF, 0xFE])))
    }

    func testI2CredentialIsEquatable() {
        XCTAssertEqual(
            AppleSignInCredential(identityToken: "t", authorizationCode: nil),
            AppleSignInCredential(identityToken: "t", authorizationCode: nil)
        )
        XCTAssertNotEqual(
            AppleSignInCredential(identityToken: "t", authorizationCode: nil),
            AppleSignInCredential(identityToken: "t", authorizationCode: "c")
        )
    }

    // MARK: #I3-#I5

    func testI3SignInWithAppleSendsExchangeAfterMe() async throws {
        let (store, _) = makeStore()
        stubAppleFlow()

        try await store.signInWithApple(idToken: "apple_id_token", authorizationCode: "code-1")

        XCTAssertEqual(log.paths, ["/api/auth/sign-in/social", "/api/me", "/api/auth-apple/exchange"])
        let reqs = log.all
        let exchange = reqs[2]
        XCTAssertEqual(exchange.method, "POST")
        XCTAssertEqual(exchange.auth, "Bearer apple_session_token")
        XCTAssertEqual(exchange.contentType, "application/json")
        let body = try json(exchange.body)
        XCTAssertEqual(Set(body.keys), ["authorizationCode"])
        XCTAssertEqual(body["authorizationCode"] as? String, "code-1")

        let signInBody = try json(reqs[0].body)
        XCTAssertNil(signInBody["authorizationCode"], "認可コードは sign-in/social に入れない")
        let rawSignIn = String(data: try XCTUnwrap(reqs[0].body), encoding: .utf8) ?? ""
        XCTAssertFalse(rawSignIn.contains("code-1"))
        XCTAssertEqual(store.state, .signedIn)
    }

    func testI4ExchangeFailureDoesNotAffectSignIn() async throws {
        for status in [500, 401] {
            log.reset()
            let (store, keychain) = makeStore()
            stubAppleFlow(exchangeStatus: status)

            try await store.signInWithApple(idToken: "apple_id_token", authorizationCode: "code-1")

            XCTAssertTrue(log.paths.contains("/api/auth-apple/exchange"), "status \(status): exchange should be attempted")
            XCTAssertEqual(store.state, .signedIn, "status \(status)")
            XCTAssertEqual(store.token, "apple_session_token", "status \(status)")
            XCTAssertEqual(try keychain.load(), "apple_session_token", "status \(status)")
        }
    }

    func testI5NoExchangeWithoutCode() async throws {
        for code in [nil, ""] as [String?] {
            log.reset()
            let (store, _) = makeStore()
            stubAppleFlow()
            if let code {
                try await store.signInWithApple(idToken: "apple_id_token", authorizationCode: code)
            } else {
                try await store.signInWithApple(idToken: "apple_id_token")
            }
            XCTAssertEqual(log.paths, ["/api/auth/sign-in/social", "/api/me"], "code=\(String(describing: code))")
            XCTAssertEqual(store.state, .signedIn)
        }
    }

    // MARK: #I6 / #I7

    func testI6DeleteMeEndpoint() {
        let ep = Endpoints.deleteMe()
        XCTAssertEqual(ep.path, "/api/me")
        XCTAssertEqual(ep.method, .delete)
        XCTAssertNil(ep.body)
        XCTAssertTrue(ep.requiresAuth)
    }

    private func makeRepository(token: String) throws -> (MeRepository, AuthStore) {
        let keychain = KeychainStore()
        try? keychain.delete()
        try keychain.save(token: token)
        let auth = AuthStore(keychain: keychain, session: StubURLProtocol.makeSession())
        let client = APIClient(session: StubURLProtocol.makeSession(), authStore: auth)
        return (MeRepository(client: client, cache: QueryClient()), auth)
    }

    private func respond(status: Int, body: Data = Data()) {
        let log = self.log
        StubURLProtocol.handler = { request in
            log.append(request)
            let headers = body.isEmpty ? [:] : ["Content-Type": "application/json"]
            return (HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!, body)
        }
    }

    func testI7DeleteAccount204() async throws {
        let (repo, _) = try makeRepository(token: "tok_del")
        respond(status: 204)

        try await repo.deleteAccount()

        let reqs = log.all
        XCTAssertEqual(reqs.count, 1)
        XCTAssertEqual(reqs[0].method, "DELETE")
        XCTAssertEqual(reqs[0].path, "/api/me")
        XCTAssertEqual(reqs[0].auth, "Bearer tok_del")
        XCTAssertFalse(reqs[0].hasBody, "DELETE /api/me は body を送らない")
    }

    func testI7DeleteAccount500ThrowsApiError() async throws {
        let (repo, _) = try makeRepository(token: "tok_del")
        respond(status: 500, body: Data(#"{"error":{"code":"INTERNAL","message":"x"}}"#.utf8))
        do {
            try await repo.deleteAccount()
            XCTFail("500 は throw するはず")
        } catch let error as APIError {
            XCTAssertEqual(error, .api(status: 500, code: "INTERNAL", message: "x"))
        }
    }

    func testI7DeleteAccount401ThrowsUnauthorizedAndSignsOut() async throws {
        let (repo, auth) = try makeRepository(token: "tok_del")
        respond(status: 401, body: Data(#"{"error":{"code":"UNAUTHORIZED","message":"no"}}"#.utf8))
        do {
            try await repo.deleteAccount()
            XCTFail("401 は throw するはず")
        } catch let error as APIError {
            XCTAssertEqual(error, .unauthorized)
        }
        XCTAssertEqual(auth.state, .signedOut)
    }

    // MARK: #I8

    func testI8CompleteAccountDeletionClearsLocalStateWithoutNetwork() async throws {
        let (store, keychain) = makeStore()
        stubAppleFlow()
        try await store.signInWithApple(idToken: "apple_id_token")
        XCTAssertEqual(store.state, .signedIn)
        XCTAssertEqual(try keychain.load(), "apple_session_token")
        log.reset()

        store.completeAccountDeletion()

        XCTAssertEqual(store.state, .signedOut)
        XCTAssertNil(store.token)
        XCTAssertNil(store.me)
        XCTAssertNil(try keychain.load())
        XCTAssertEqual(log.all.count, 0, "サインアウト API などサーバーには何も送らない")
    }

    // MARK: #I9 / #I10

    func testI9LegalLinks() {
        XCTAssertEqual(LegalLinks.privacy.absoluteString, "https://atender.appily.run/privacy")
        XCTAssertEqual(LegalLinks.terms.absoluteString, "https://atender.appily.run/terms")
        XCTAssertEqual(LegalLinks.support.absoluteString, "https://atender.appily.run/support")
    }

    func testI10SettingsLogicStrings() {
        XCTAssertEqual(SettingsLogic.deleteAccountTitle, "アカウントを削除しますか?")
        XCTAssertEqual(
            SettingsLogic.deleteAccountMessage,
            "時間割・出欠・予定・友達などのデータはすべて直ちに削除され、元に戻せません。作成したルームは他のメンバーに引き継がれます。ルームに追加した予定と公開した時間割テンプレートは、作成者を伏せて残ります。"
        )
        XCTAssertEqual(SettingsLogic.deletingAccountLabel, "アカウントを削除しています")
        XCTAssertEqual(SettingsLogic.deleteAccountFailedTitle, "アカウントを削除できませんでした")
        XCTAssertEqual(SettingsLogic.deleteAccountFailedMessage, "通信状況を確認して、もう一度お試しください。")
    }
}
