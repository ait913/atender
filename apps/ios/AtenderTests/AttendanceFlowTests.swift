import XCTest
@testable import Atender

// Reviewer 生成: 設計 §T-8 (出欠楽観更新: AttendanceRepository + QueryClient + ToastCenter) を根拠に検証。
// URLProtocol スタブ + 実 QueryClient/ToastCenter を注入し observable state を assert。
@MainActor
final class AttendanceFlowTests: XCTestCase {

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
        try? KeychainStore().delete()
        super.tearDown()
    }

    private func makeRepo(cache: QueryClient, toast: ToastCenter) throws -> AttendanceRepository {
        let keychain = KeychainStore()
        try? keychain.delete()
        try keychain.save(token: "tok")
        let auth = AuthStore(keychain: keychain, session: StubURLProtocol.makeSession())
        let client = APIClient(session: StubURLProtocol.makeSession(), authStore: auth)
        return AttendanceRepository(client: client, cache: cache, toast: toast)
    }

    private func occ(_ id: String, status: AttendanceStatus?) -> OccurrenceDto {
        OccurrenceDto(id: id, meetingId: "m\(id)", courseId: "c\(id)", courseName: "講義",
                      teacher: nil, room: nil, color: nil, date: "2026-06-08",
                      periodIndex: 1, periodOffset: 0, startMinute: 540, endMinute: 630, status: status)
    }

    private func seedToday(_ cache: QueryClient) -> TodayResponse {
        let today = TodayResponse(date: "2026-06-08", occurrences: [
            occ("1", status: nil),
            occ("2", status: .absent),
        ])
        cache.setData(today, for: .today())
        return today
    }

    // 他タブ key を fresh で仕込み、invalidate で stale に変わることを検証可能にする
    private func seedInvalidatable(_ cache: QueryClient) {
        cache.setData(["x"], for: .stats())
        cache.setData(["x"], for: .semesters())
        cache.setData(["x"], for: QueryKey(["day", "2026-06-08"]))
    }

    private func stub200(_ json: String) {
        StubURLProtocol.handler = { req in
            let resp = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "application/json"])!
            return (resp, json.data(using: .utf8)!)
        }
    }

    private func stubError(_ status: Int, code: String = "INTERNAL") {
        StubURLProtocol.handler = { req in
            let resp = HTTPURLResponse(url: req.url!, statusCode: status, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "application/json"])!
            let body = #"{"error":{"code":"\#(code)","message":"boom"}}"#.data(using: .utf8)!
            return (resp, body)
        }
    }

    // --- markAllPresent 成功: 未記録のみ更新 + invalidate (today は stale でない) ---
    func testMarkAllPresentSuccessUpdatesOnlyUnrecordedAndInvalidates() async throws {
        let cache = QueryClient(); let toast = ToastCenter()
        let repo = try makeRepo(cache: cache, toast: toast)
        _ = seedToday(cache)
        seedInvalidatable(cache)
        stub200(#"{"date":"2026-06-08","markedCount":1,"skippedCount":1}"#)

        await repo.markAllPresent(date: "2026-06-08", status: .present)

        let updated = cache.data(for: .today(), as: TodayResponse.self)
        XCTAssertEqual(updated?.occurrences[0].status, .present, "未記録は present に")
        XCTAssertEqual(updated?.occurrences[1].status, .absent, "既記録は不変")

        XCTAssertTrue(cache.isStale(.stats()), "stats stale")
        XCTAssertTrue(cache.isStale(.semesters()), "semesters stale")
        XCTAssertTrue(cache.isStale(QueryKey(["day", "2026-06-08"])), "day prefix stale")
        XCTAssertFalse(cache.isStale(.today()), "today は invalidate しない (楽観反映済)")
    }

    // --- markAllPresent 失敗: ロールバック + トースト ---
    func testMarkAllPresentFailureRollsBackAndToasts() async throws {
        let cache = QueryClient(); let toast = ToastCenter()
        let repo = try makeRepo(cache: cache, toast: toast)
        let before = seedToday(cache)
        stubError(500)

        await repo.markAllPresent(date: "2026-06-08", status: .present)

        XCTAssertEqual(cache.data(for: .today(), as: TodayResponse.self), before, "呼び出し前スナップショットに復元")
        XCTAssertEqual(toast.message, "保存できませんでした、もう一度試してください")
    }

    // --- patchAttendance 成功: 指定 occurrence のみ置換 + invalidate ---
    func testPatchAttendanceSuccessUpdatesOnlyMatching() async throws {
        let cache = QueryClient(); let toast = ToastCenter()
        let repo = try makeRepo(cache: cache, toast: toast)
        _ = seedToday(cache)
        seedInvalidatable(cache)
        stub200(#"{"record":{"occurrenceId":"1","status":"EXCUSED","note":null,"updatedAt":"2026-06-08T00:00:00Z"}}"#)

        await repo.patchAttendance(occurrenceId: "2", status: .excused)

        let updated = cache.data(for: .today(), as: TodayResponse.self)
        XCTAssertNil(updated?.occurrences[0].status, "occ1 不変")
        XCTAssertEqual(updated?.occurrences[1].status, .excused, "occ2 が excused")

        XCTAssertTrue(cache.isStale(.stats()))
        XCTAssertTrue(cache.isStale(.semesters()))
        XCTAssertTrue(cache.isStale(QueryKey(["day", "2026-06-08"])))
        XCTAssertTrue(cache.isStale(.today()), "T6: patchAttendance は today も invalidate する")
    }

    // --- patchAttendance 失敗: ロールバック + トースト ---
    func testPatchAttendanceFailureRollsBackAndToasts() async throws {
        let cache = QueryClient(); let toast = ToastCenter()
        let repo = try makeRepo(cache: cache, toast: toast)
        let before = seedToday(cache)
        stubError(500)

        await repo.patchAttendance(occurrenceId: "1", status: .present)

        XCTAssertEqual(cache.data(for: .today(), as: TodayResponse.self), before)
        XCTAssertEqual(toast.message, "保存できませんでした、もう一度試してください")
    }

    // --- loadToday 403 SETUP_REQUIRED は APIError を throw ---
    func testLoadToday403SetupRequiredThrows() async throws {
        let cache = QueryClient(); let toast = ToastCenter()
        let repo = try makeRepo(cache: cache, toast: toast)
        stubError(403, code: "SETUP_REQUIRED")

        do {
            _ = try await repo.loadToday()
            XCTFail("403 SETUP_REQUIRED は throw されるべき")
        } catch let error as APIError {
            XCTAssertEqual(error, .api(status: 403, code: "SETUP_REQUIRED", message: "boom"))
        }
    }
}
