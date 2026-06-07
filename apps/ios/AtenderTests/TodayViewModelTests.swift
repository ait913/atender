import XCTest
@testable import Atender

// Reviewer 生成: 設計doc §2.5 + §7.4 + §7.7 を根拠に検証。
// 検証対象: 出席タップ → 楽観更新 → API 失敗 → ロールバック (§2.5「楽観的更新は出席記録ループのみ」)。
//
// !! 設計の曖昧さ (報告): §7.7 は挙動のみで TodayViewModel の public API が設計に未記載。
//   コンパイラ確認で判明した実シグネチャ: init(apiClient:) / var occurrences: [OccurrenceDto] /
//   func load() async / func mark(_ occurrence: OccurrenceDto, status: AttendanceStatus) async。
//   設計に ViewModel の API を明記すべき (設計の穴)。
//
// ViewModel/AuthStore は @MainActor。テストクラスも @MainActor。

@MainActor
final class TodayViewModelTests: XCTestCase {

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
        try? KeychainStore().delete()
        super.tearDown()
    }

    private func makeViewModel() throws -> TodayViewModel {
        let keychain = KeychainStore()
        try? keychain.delete()
        try keychain.save(token: "tok")
        let auth = AuthStore(keychain: keychain, session: StubURLProtocol.makeSession())
        let client = APIClient(session: StubURLProtocol.makeSession(), authStore: auth)
        return TodayViewModel(apiClient: client)
    }

    // GET /api/today を返すスタブ (occ_01 = PRESENT)
    private func stubToday() {
        let body = #"""
        {"date":"2026-06-08","occurrences":[
          {"id":"occ_01","meetingId":"m1","courseId":"c1","courseName":"情報デザイン","teacher":"佐藤先生","room":"A-201","color":"#F97316","date":"2026-06-08","periodIndex":1,"periodOffset":0,"startMinute":540,"endMinute":630,"status":"PRESENT"}
        ]}
        """#.data(using: .utf8)!
        StubURLProtocol.handler = { req in
            let resp = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "application/json"])!
            return (resp, body)
        }
    }

    // §7.7: load で occurrences を取得
    func testLoadPopulatesOccurrences() async throws {
        let vm = try makeViewModel()
        stubToday()
        await vm.load()
        XCTAssertEqual(vm.occurrences.count, 1)
        XCTAssertEqual(vm.occurrences.first?.id, "occ_01")
        XCTAssertEqual(vm.occurrences.first?.status, .present)
    }

    // §2.5/§7.4: タップ → 楽観更新 → API 失敗 → ロールバック
    func testOptimisticUpdateRollsBackOnFailure() async throws {
        let vm = try makeViewModel()
        stubToday()
        await vm.load()
        let occ = try XCTUnwrap(vm.occurrences.first)
        XCTAssertEqual(occ.status, .present, "初期 status は PRESENT")

        // mark の POST を 500 で失敗させる
        StubURLProtocol.handler = { req in
            let resp = HTTPURLResponse(url: req.url!, statusCode: 500, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "application/json"])!
            let data = #"{"error":{"code":"INTERNAL","message":"boom"}}"#.data(using: .utf8)!
            return (resp, data)
        }

        await vm.mark(occ, status: .absent)

        XCTAssertEqual(vm.occurrences.first?.status, .present,
                       "API 失敗時は楽観更新をロールバックし元の status に戻す (§2.5)")
    }

    // §2.5/§7.4: API 成功時は新 status が確定保持される
    func testOptimisticUpdateKeepsNewStatusOnSuccess() async throws {
        let vm = try makeViewModel()
        stubToday()
        await vm.load()
        let occ = try XCTUnwrap(vm.occurrences.first)

        StubURLProtocol.handler = { req in
            let resp = HTTPURLResponse(url: req.url!, statusCode: 204, httpVersion: "HTTP/1.1",
                                       headerFields: [:])!
            return (resp, Data())
        }

        await vm.mark(occ, status: .absent)
        XCTAssertEqual(vm.occurrences.first?.status, .absent,
                       "API 成功時は新 status を保持する")
    }
}
