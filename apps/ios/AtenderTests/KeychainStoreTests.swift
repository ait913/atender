import XCTest
@testable import Atender

// Reviewer 生成: 設計doc §3.3 (KeychainStore) を根拠に検証。
// シグネチャ: save(token:) throws / load() throws -> String? / delete() throws。
// service = "net.appily.atender.auth", account = "session-token"。
// Simulator Keychain を使用、テスト後クリーンアップ。

final class KeychainStoreTests: XCTestCase {

    private let store = KeychainStore()

    override func setUp() {
        super.setUp()
        try? store.delete()  // 前回残骸を除去
    }

    override func tearDown() {
        try? store.delete()  // クリーンアップ (§9.1)
        super.tearDown()
    }

    // §3.3: save → load 往復
    func testSaveThenLoad() throws {
        try store.save(token: "session_xyz")
        XCTAssertEqual(try store.load(), "session_xyz")
    }

    // §3.3: save → update (SecItemUpdate 経路) → load で新値
    func testSaveOverwrite() throws {
        try store.save(token: "first")
        try store.save(token: "second")
        XCTAssertEqual(try store.load(), "second", "既存トークンは上書きされる (SecItemUpdate)")
    }

    // §3.3: delete 後は load が nil
    func testDeleteThenLoadNil() throws {
        try store.save(token: "to_delete")
        try store.delete()
        XCTAssertNil(try store.load(), "delete 後は load が nil")
    }

    // §3.3: 未保存状態の load は nil (item なしは throw でなく nil)
    func testLoadWhenEmptyReturnsNil() throws {
        try? store.delete()
        XCTAssertNil(try store.load(), "保存が無ければ nil を返す (SecItemCopyMatching の itemNotFound)")
    }

    // §3.3: 未保存状態の delete は throw しない (冪等)
    func testDeleteWhenEmptyDoesNotThrow() {
        try? store.delete()
        XCTAssertNoThrow(try store.delete(), "item なしの delete は冪等であるべき")
    }
}
