import Foundation
import XCTest
@testable import Atender

@MainActor
final class AuthStoreCallbackTests: XCTestCase {

    private func freshKeychain() -> KeychainStore {
        let keychain = KeychainStore()
        try? keychain.delete()
        return keychain
    }

    private func makeStore() -> (AuthStore, KeychainStore) {
        let keychain = freshKeychain()
        let store = AuthStore(keychain: keychain, session: StubURLProtocol.makeSession())
        return (store, keychain)
    }

    private func respond(status: Int, headers: [String: String] = [:], body: Data = Data()) {
        StubURLProtocol.handler = { request in
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: status,
                httpVersion: "HTTP/1.1",
                headerFields: headers
            )!
            return (response, body)
        }
    }

    private func requestBodyData(_ request: URLRequest?) -> Data? {
        if let body = request?.httpBody {
            return body
        }

        guard let stream = request?.httpBodyStream else {
            return nil
        }

        stream.open()
        defer { stream.close() }

        var data = Data()
        let bufferSize = 1024
        var buffer = [UInt8](repeating: 0, count: bufferSize)

        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: bufferSize)
            if count > 0 {
                data.append(buffer, count: count)
            } else {
                break
            }
        }

        return data
    }

    private func jsonBody(_ request: URLRequest?) throws -> [String: Any] {
        let data = try XCTUnwrap(requestBodyData(request), "request body should be present")
        let object = try JSONSerialization.jsonObject(with: data)
        return try XCTUnwrap(object as? [String: Any], "request body should be a JSON object")
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
        try? KeychainStore().delete()
        super.tearDown()
    }

    func testCompleteTokenSignInRejectsWrongScheme() throws {
        let (store, keychain) = makeStore()
        let url = URL(string: "https://auth#token=abc")!

        XCTAssertThrowsError(try store.completeTokenSignIn(callbackURL: url))
        XCTAssertNotEqual(store.state, .signedIn)
        XCTAssertNil(store.token)
        XCTAssertNil(try? keychain.load())
    }

    func testIsAuthCallbackOnlyAcceptsAtenderAuthHost() {
        let (store, _) = makeStore()

        XCTAssertTrue(store.isAuthCallback(URL(string: "atender://auth")!))
        XCTAssertFalse(store.isAuthCallback(URL(string: "atender://rooms/join/x")!))
        XCTAssertFalse(store.isAuthCallback(URL(string: "https://atender-api.appily.run/api/auth/native/callback")!))
    }

    func testStartMagicLinkPostsNativeCallbackURL() async throws {
        let (store, _) = makeStore()
        respond(status: 200, headers: ["Content-Type": "application/json"])

        try await store.startMagicLink(email: "student@example.com")

        let request = try XCTUnwrap(StubURLProtocol.lastRequest)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/auth/sign-in/magic-link")

        let body = try jsonBody(request)
        XCTAssertEqual(body["email"] as? String, "student@example.com")

        let callbackURL = try XCTUnwrap(body["callbackURL"] as? String)
        XCTAssertTrue(
            callbackURL.contains("/api/auth/native/callback?next=atender://auth"),
            "Magic Link should use the native callback relay with atender://auth"
        )
    }

    func testStartMagicLinkThrowsAPIErrorOnServerError() async throws {
        let (store, _) = makeStore()
        respond(
            status: 500,
            headers: ["Content-Type": "application/json"],
            body: #"{"error":{"code":"MAGIC_LINK_FAILED","message":"failed"}}"#.data(using: .utf8)!
        )

        do {
            try await store.startMagicLink(email: "student@example.com")
            XCTFail("startMagicLink should throw APIError for non-2xx responses")
        } catch let error as APIError {
            XCTAssertEqual(error, .api(status: 500, code: "MAGIC_LINK_FAILED", message: "failed"))
        }
    }

    func testSignInWithAppleStoresSetAuthTokenAndSignsIn() async throws {
        let (store, keychain) = makeStore()
        respond(
            status: 200,
            headers: ["set-auth-token": "apple_session_token", "Content-Type": "application/json"],
            body: #"{"user":{"id":"u1","email":"a@b.c","name":"A","image":null,"handle":"a","inviteCode":"X","defaultSemesterId":"s1","schoolId":"sc1","departmentId":"d1","requiredAttendanceRate":80},"setupStatus":{"hasSchool":true,"hasDepartment":true,"hasSemester":true,"hasUserTimetable":true,"isComplete":true}}"#.data(using: .utf8)!
        )

        try await store.signInWithApple(idToken: "apple_id_token")

        XCTAssertEqual(store.state, .signedIn)
        XCTAssertEqual(store.token, "apple_session_token")
        XCTAssertEqual(try keychain.load(), "apple_session_token")
    }

    func testSignInWithAppleThrowsTokenMissingWhenHeaderMissing() async throws {
        let (store, keychain) = makeStore()
        respond(status: 200)

        do {
            try await store.signInWithApple(idToken: "apple_id_token")
            XCTFail("signInWithApple should throw TOKEN_MISSING when set-auth-token is absent")
        } catch let error as APIError {
            XCTAssertEqual(
                error,
                .api(
                    status: 200,
                    code: "TOKEN_MISSING",
                    message: "Authentication token was not returned."
                )
            )
        }

        XCTAssertNotEqual(store.state, .signedIn)
        XCTAssertNil(store.token)
        XCTAssertNil(try? keychain.load())
    }
}
