import Foundation
import XCTest
@testable import Atender

@MainActor
final class VersionGateTests: XCTestCase {
    private struct TestResponse: Decodable, Equatable {
        let ok: Bool
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
        try? KeychainStore().delete()
        super.tearDown()
    }

    private var meBody: Data {
        #"{"user":{"id":"u1","email":"a@b.c","name":"A","image":null,"handle":"a","inviteCode":"X","defaultSemesterId":"s1","schoolId":"sc1","departmentId":"d1","requiredAttendanceRate":80},"setupStatus":{"hasSchool":true,"hasDepartment":true,"hasSemester":true,"hasUserTimetable":true,"isComplete":true}}"#
            .data(using: .utf8)!
    }

    private func freshKeychain(token: String? = nil) throws -> KeychainStore {
        let keychain = KeychainStore()
        try? keychain.delete()
        if let token {
            try keychain.save(token: token)
        }
        return keychain
    }

    private func makeAuthStore(token: String? = nil) throws -> AuthStore {
        AuthStore(keychain: try freshKeychain(token: token), session: StubURLProtocol.makeSession())
    }

    private func makeClient(
        token: String? = nil,
        versionStore: VersionStore? = nil
    ) throws -> (APIClient, AuthStore, VersionStore) {
        let authStore = try makeAuthStore(token: token)
        let versionStore = versionStore ?? VersionStore(
            session: StubURLProtocol.makeSession(),
            currentBuild: AppVersion.current
        )
        let client = APIClient(
            session: StubURLProtocol.makeSession(),
            authStore: authStore,
            versionStore: versionStore
        )
        return (client, authStore, versionStore)
    }

    private func respond(status: Int, body: Data = Data(), headers: [String: String] = ["Content-Type": "application/json"]) {
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

    private func respond(json: String, status: Int = 200) {
        respond(status: status, body: json.data(using: .utf8)!)
    }

    private func assertClientHeaderPresent(file: StaticString = #filePath, line: UInt = #line) {
        let value = StubURLProtocol.lastRequest?.value(forHTTPHeaderField: AppVersion.clientHeaderField)
        XCTAssertNotNil(value, file: file, line: line)
        XCTAssertNotNil(
            value?.range(of: #"^ios/\d+$"#, options: .regularExpression),
            "client header must match ^ios/\\d+$",
            file: file,
            line: line
        )
    }

    func test_I1_clientHeaderIsSentThroughAPIClientAndAuthStoreBootstrap() async throws {
        // #I1
        let (client, _, _) = try makeClient(token: "tok")
        respond(json: #"{"ok":true}"#)

        let endpoint = APIEndpoint(path: "/api/version-gate-test", method: .get)
        _ = try await client.send(endpoint, as: TestResponse.self)
        assertClientHeaderPresent()

        StubURLProtocol.lastRequest = nil
        let authStore = try makeAuthStore(token: "tok")
        respond(status: 200, body: meBody)

        await authStore.bootstrap()
        XCTAssertEqual(authStore.state, .signedIn)
        assertClientHeaderPresent()
    }

    func test_I2_appVersionBuildParsesOnlyIntegerBundleVersions() {
        // #I2
        XCTAssertEqual(AppVersion.build(from: "6"), 6)
        XCTAssertEqual(AppVersion.build(from: " 6 "), 6)
        XCTAssertNil(AppVersion.build(from: "1.2.3"))
        XCTAssertNil(AppVersion.build(from: ""))
        XCTAssertNil(AppVersion.build(from: nil))
        XCTAssertNil(AppVersion.build(from: "abc"))
    }

    func test_I3_appVersionCurrentMatchesBundleCFBundleVersion() throws {
        // #I3
        let raw = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String)
        let expected = try XCTUnwrap(Int(raw.trimmingCharacters(in: .whitespaces)))

        XCTAssertNotNil(AppVersion.current)
        XCTAssertEqual(AppVersion.current, expected)
    }

    func test_I4_versionGateBlocksOnlyWhenCurrentBuildIsBelowMinimum() {
        // #I4
        XCTAssertTrue(VersionGate.isBlocked(currentBuild: 6, minIOSBuild: 8))
        XCTAssertFalse(VersionGate.isBlocked(currentBuild: 8, minIOSBuild: 8))
        XCTAssertFalse(VersionGate.isBlocked(currentBuild: 9, minIOSBuild: 8))
        XCTAssertFalse(VersionGate.isBlocked(currentBuild: nil, minIOSBuild: 8))
    }

    func test_I5_versionStoreCheckBlocksAndStoresCommitWhenMinimumExceedsCurrentBuild() async {
        // #I5
        respond(json: #"{"commit":"abc","minIOSBuild":999}"#)
        let store = VersionStore(session: StubURLProtocol.makeSession(), currentBuild: 6)

        await store.check()

        XCTAssertEqual(store.state, .blocked(minBuild: 999))
        XCTAssertEqual(store.apiCommit, "abc")
    }

    func test_I6_versionStoreCheckMarksOkWhenCurrentBuildIsCompatible() async {
        // #I6
        respond(json: #"{"commit":"abc","minIOSBuild":1}"#)
        let store = VersionStore(session: StubURLProtocol.makeSession(), currentBuild: 6)

        await store.check()

        XCTAssertEqual(store.state, .ok)
    }

    func test_I7_versionStoreCheckTransportErrorLeavesStateUnknown() async {
        // #I7
        StubURLProtocol.handler = { _ in
            throw URLError(.notConnectedToInternet)
        }
        let store = VersionStore(session: StubURLProtocol.makeSession(), currentBuild: 6)

        await store.check()

        XCTAssertEqual(store.state, .unknown)
    }

    func test_I7_versionStoreCheckServerErrorLeavesStateUnknown() async {
        // #I7
        respond(json: #"{"error":{"code":"SERVER_ERROR","message":"no"}}"#, status: 500)
        let store = VersionStore(session: StubURLProtocol.makeSession(), currentBuild: 6)

        await store.check()

        XCTAssertEqual(store.state, .unknown)
    }

    func test_I7_versionStoreCheckBrokenJSONLeavesStateUnknown() async {
        // #I7
        respond(json: #"{"commit":"abc","minIOSBuild":"broken"}"#)
        let store = VersionStore(session: StubURLProtocol.makeSession(), currentBuild: 6)

        await store.check()

        XCTAssertEqual(store.state, .unknown)
    }

    func test_I8_handleUpgradeRequiredBlocksAndPreservesKnownMinimumBuild() async {
        // #I8
        let unknownMinimumStore = VersionStore(session: StubURLProtocol.makeSession(), currentBuild: 6)
        unknownMinimumStore.handleUpgradeRequired()
        XCTAssertEqual(unknownMinimumStore.state, .blocked(minBuild: nil))

        respond(json: #"{"commit":"abc","minIOSBuild":999}"#)
        let knownMinimumStore = VersionStore(session: StubURLProtocol.makeSession(), currentBuild: 6)
        await knownMinimumStore.check()

        knownMinimumStore.handleUpgradeRequired()

        XCTAssertEqual(knownMinimumStore.state, .blocked(minBuild: 999))
    }

    func test_I9_successfulCompatibleCheckDoesNotClearExistingBlockedState() async {
        // #I9
        let store = VersionStore(session: StubURLProtocol.makeSession(), currentBuild: 6)
        respond(json: #"{"commit":"abc","minIOSBuild":999}"#)
        await store.check()
        XCTAssertEqual(store.state, .blocked(minBuild: 999))

        respond(json: #"{"commit":"abc","minIOSBuild":1}"#)
        await store.check()

        XCTAssertEqual(store.state, .blocked(minBuild: 999))
    }

    func test_I10_versionGateViewDiagnosticsText() {
        // #I10
        XCTAssertEqual(
            VersionGateView.diagnosticsText(currentBuild: 6, minBuild: 8),
            "ビルド 6 / 必要 8 以上"
        )
        XCTAssertEqual(VersionGateView.diagnosticsText(currentBuild: 6, minBuild: nil), "ビルド 6")
        XCTAssertEqual(VersionGateView.diagnosticsText(currentBuild: nil, minBuild: 8), "必要 8 以上")
        XCTAssertEqual(VersionGateView.diagnosticsText(currentBuild: nil, minBuild: nil), "")
    }

    func test_I11_apiClientSend426ThrowsUpgradeRequiredAndBlocksVersionStore() async throws {
        // #I11
        let versionStore = VersionStore(session: StubURLProtocol.makeSession(), currentBuild: 6)
        let (client, _, _) = try makeClient(token: "tok", versionStore: versionStore)
        respond(
            status: 426,
            body: #"{"error":{"code":"CLIENT_UPGRADE_REQUIRED","message":"upgrade"}}"#.data(using: .utf8)!
        )

        let endpoint = APIEndpoint(path: "/api/me", method: .get)
        do {
            _ = try await client.send(endpoint, as: TestResponse.self)
            XCTFail("426 must throw APIError.upgradeRequired")
        } catch let error as APIError {
            XCTAssertEqual(error, .upgradeRequired)
        }

        XCTAssertEqual(versionStore.state, .blocked(minBuild: nil))
    }

    func test_I12_apiClientSend426DoesNotSignOutAuthStore() async throws {
        // #I12
        let versionStore = VersionStore(session: StubURLProtocol.makeSession(), currentBuild: 6)
        let (client, authStore, _) = try makeClient(token: "tok", versionStore: versionStore)
        respond(
            status: 426,
            body: #"{"error":{"code":"CLIENT_UPGRADE_REQUIRED","message":"upgrade"}}"#.data(using: .utf8)!
        )

        let endpoint = APIEndpoint(path: "/api/me", method: .get)
        do {
            _ = try await client.send(endpoint, as: TestResponse.self)
            XCTFail("426 must throw APIError.upgradeRequired")
        } catch let error as APIError {
            XCTAssertEqual(error, .upgradeRequired)
        }

        XCTAssertNotEqual(authStore.state, .signedOut)
        XCTAssertEqual(versionStore.state, .blocked(minBuild: nil))
    }

    func test_I12_apiClientSend401StillSignsOutAuthStore() async throws {
        // #I12
        let (client, authStore, _) = try makeClient(token: "tok")
        respond(
            status: 401,
            body: #"{"error":{"code":"UNAUTHORIZED","message":"no"}}"#.data(using: .utf8)!
        )

        let endpoint = APIEndpoint(path: "/api/me", method: .get)
        do {
            _ = try await client.send(endpoint, as: TestResponse.self)
            XCTFail("401 must throw APIError.unauthorized")
        } catch let error as APIError {
            XCTAssertEqual(error, .unauthorized)
        }

        XCTAssertEqual(authStore.state, .signedOut)
    }

    func test_I13_upgradeRequiredUserFacingMessage() {
        // #I13
        XCTAssertEqual(
            APIError.upgradeRequired.userFacingMessage,
            "アプリの更新が必要です。TestFlight から最新版に更新してください。"
        )
    }
}
