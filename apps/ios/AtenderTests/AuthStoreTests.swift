import XCTest
@testable import Atender

// Reviewer 生成: 設計doc §3.4 (AuthStore) を根拠に検証。
// §3.4 の public メソッド: bootstrap() async / completeGoogleSignIn(callbackURL:) throws /
//   handleUnauthorized() / signOut() async。State: unknown/signedOut/signedIn。
//
// !! 設計の食い違い (報告):
//   1. §3.4 のクラス定義は init 未記載だが、実装は `init(keychain:session:)` (= /api/me 検証用に
//      URLSession を注入)。設計に init シグネチャを書くべき。
//   2. §9.1 は「Keychain と APIClient はプロトコル化してモック」を要求するが、AuthStore は final/
//      @MainActor。bootstrap の APIClient 呼び出しは AuthStore 内部で完結し外部注入できないため、
//      URLProtocol スタブ session を init に渡して /api/me を差し替える形でテストする。
//
// AuthStore は @MainActor 隔離なのでテストクラスも @MainActor。

@MainActor
final class AuthStoreTests: XCTestCase {

    private func freshKeychain() -> KeychainStore {
        let k = KeychainStore()
        try? k.delete()
        return k
    }

    // /api/me を任意ステータスで返すスタブ session
    private func stubSession(status: Int, body: Data = Data()) -> URLSession {
        StubURLProtocol.handler = { req in
            let resp = HTTPURLResponse(url: req.url!, statusCode: status, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "application/json"])!
            return (resp, body)
        }
        return StubURLProtocol.makeSession()
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        try? KeychainStore().delete()
        super.tearDown()
    }

    // §3.4 bootstrap: token なし → 即 signedOut
    func testBootstrapNoTokenSignsOut() async throws {
        let keychain = freshKeychain()
        try keychain.delete()
        let store = AuthStore(keychain: keychain, session: stubSession(status: 200))

        await store.bootstrap()
        XCTAssertEqual(store.state, .signedOut, "Keychain に token が無ければ signedOut (§3.4)")
    }

    // §3.4 bootstrap: token あり + /api/me 200 → signedIn
    func testBootstrapTokenValidSignsIn() async throws {
        let keychain = freshKeychain()
        try keychain.save(token: "valid_tok")
        let meBody = #"{"user":{"id":"u1","email":"a@b.c","name":"A","image":null,"handle":"a","inviteCode":"X","defaultSemesterId":"s1","schoolId":"sc1","departmentId":"d1"},"setupStatus":{"hasSchool":true,"hasDepartment":true,"hasSemester":true,"hasUserTimetable":true,"isComplete":true}}"#.data(using: .utf8)!
        let store = AuthStore(keychain: keychain, session: stubSession(status: 200, body: meBody))

        await store.bootstrap()
        XCTAssertEqual(store.state, .signedIn, "token あり + /api/me 200 → signedIn (§3.4)")
    }

    // §3.4 bootstrap: token あり + /api/me 401 → signedOut (token 破棄)
    func testBootstrapToken401SignsOut() async throws {
        let keychain = freshKeychain()
        try keychain.save(token: "stale_tok")
        let errBody = #"{"error":{"code":"UNAUTHORIZED","message":"no"}}"#.data(using: .utf8)!
        let store = AuthStore(keychain: keychain, session: stubSession(status: 401, body: errBody))

        await store.bootstrap()
        XCTAssertEqual(store.state, .signedOut, "/api/me 401 なら token 破棄して signedOut (§3.4)")
        XCTAssertNil(store.token, "401 検証失敗で token は破棄される")
    }

    // §3.4 handleUnauthorized: token 破棄 → signedOut
    func testHandleUnauthorizedSignsOut() throws {
        let keychain = freshKeychain()
        try keychain.save(token: "tok_to_be_dropped")
        let store = AuthStore(keychain: keychain, session: StubURLProtocol.makeSession())

        store.handleUnauthorized()
        XCTAssertEqual(store.state, .signedOut, "401 受信時は signedOut へ (§3.4)")
        XCTAssertNil(store.token, "token は破棄される")
    }

    // §3.4 completeGoogleSignIn: atender://auth#token=abc 解析 → Keychain 保存 → signedIn
    func testCompleteGoogleSignInParsesFragmentTokenAndSignsIn() throws {
        let keychain = freshKeychain()
        let store = AuthStore(keychain: keychain, session: StubURLProtocol.makeSession())

        let url = URL(string: "atender://auth#token=abc")!
        try store.completeGoogleSignIn(callbackURL: url)

        XCTAssertEqual(store.state, .signedIn, "fragment の token を取り込み signedIn (§3.4)")
        XCTAssertEqual(store.token, "abc", "fragment token=abc を Keychain に保存")
        XCTAssertEqual(try keychain.load(), "abc", "Keychain に保存される")
    }

    // §3.4 completeGoogleSignIn: token が fragment に無ければ throw (signedIn にしない)
    func testCompleteGoogleSignInMissingTokenThrows() throws {
        let keychain = freshKeychain()
        let store = AuthStore(keychain: keychain, session: StubURLProtocol.makeSession())

        let url = URL(string: "atender://auth")!
        XCTAssertThrowsError(try store.completeGoogleSignIn(callbackURL: url),
                             "token fragment が無ければ throw するはず")
        XCTAssertNotEqual(store.state, .signedIn)
    }
}
