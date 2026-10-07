import XCTest
@testable import Atender

// Reviewer 生成: build 19 設計 §8.3 (#P1-#P12) のみを根拠 (実装は未読)。
final class B19SemesterRolloverTests: XCTestCase {

    private let a = SemesterDto(id: "A", name: "2026 前期", startDate: "2026-04-01", endDate: "2026-09-30")
    private let b = SemesterDto(id: "B", name: "2026 後期", startDate: "2026-10-01", endDate: "2027-03-31")

    private func date(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso)!
    }

    func testP1Latest() {
        XCTAssertEqual(SemesterRollover.latest([a, b]), b)
        XCTAssertEqual(SemesterRollover.latest([b, a]), b)
        XCTAssertNil(SemesterRollover.latest([]))
        let longer = SemesterDto(id: "Z", name: "z", startDate: "2026-04-01", endDate: "2026-12-31")
        XCTAssertEqual(SemesterRollover.latest([a, longer]), longer)
        let a0 = SemesterDto(id: "A0", name: "a0", startDate: "2026-04-01", endDate: "2026-09-30")
        // 設計 #P1 の例示は「→ A0」だが、規範 (§0/§7.3 "id 昇順の先頭") では "A" < "A0" で A。規範を採る (設計の例示ミスとして報告)
        XCTAssertEqual(SemesterRollover.latest([a, a0]), a)
        XCTAssertEqual(SemesterRollover.latest([a0, a]), a)
    }

    func testP2AllEnded() {
        XCTAssertTrue(SemesterRollover.allEnded([a], today: "2026-10-01"))
        XCTAssertFalse(SemesterRollover.allEnded([a], today: "2026-09-30"))
        XCTAssertFalse(SemesterRollover.allEnded([a, b], today: "2026-10-01"))
        XCTAssertFalse(SemesterRollover.allEnded([], today: "2026-10-01"))
    }

    func testP3PromptTarget() {
        XCTAssertEqual(SemesterRollover.promptTarget(semesters: [a], today: "2026-10-01", dismissedSemesterId: nil), a)
        XCTAssertNil(SemesterRollover.promptTarget(semesters: [a], today: "2026-10-01", dismissedSemesterId: "A"))
        XCTAssertEqual(SemesterRollover.promptTarget(semesters: [a], today: "2026-10-01", dismissedSemesterId: "zzz"), a)
        XCTAssertNil(SemesterRollover.promptTarget(semesters: [a, b], today: "2026-10-01", dismissedSemesterId: nil))
        XCTAssertNil(SemesterRollover.promptTarget(semesters: [], today: "2026-10-01", dismissedSemesterId: nil))
        XCTAssertEqual(SemesterRollover.promptTarget(semesters: [a, b], today: "2027-04-01", dismissedSemesterId: "A"), b)
    }

    func testP4JSTBoundary() {
        let before = SchoolClock.todayString(date("2026-09-30T14:59:00Z"))
        XCTAssertEqual(before, "2026-09-30")
        XCTAssertNil(SemesterRollover.promptTarget(semesters: [a], today: before, dismissedSemesterId: nil))
        let after = SchoolClock.todayString(date("2026-09-30T15:00:00Z"))
        XCTAssertEqual(after, "2026-10-01")
        XCTAssertEqual(SemesterRollover.promptTarget(semesters: [a], today: after, dismissedSemesterId: nil), a)
    }

    func testP5() {
        XCTAssertEqual(SemesterRollover.proposal(after: a, today: "2026-10-01"),
                       SemesterProposal(name: "2026 後期", startDate: "2026-10-01", endDate: "2027-03-31"))
    }

    func testP6() {
        XCTAssertEqual(SemesterRollover.proposal(after: b, today: "2027-04-05"),
                       SemesterProposal(name: "2027 前期", startDate: "2027-04-01", endDate: "2027-09-30"))
    }

    func testP7Abandoned() {
        let old = SemesterDto(id: "old", name: "old", startDate: "2025-04-01", endDate: "2025-09-30")
        XCTAssertEqual(SemesterRollover.proposal(after: old, today: "2026-10-07"),
                       SemesterProposal(name: "2026 後期", startDate: "2026-10-01", endDate: "2027-03-31"))
    }

    func testP8MonthEnd() {
        let x = SemesterDto(id: "x", name: "x", startDate: "2026-03-01", endDate: "2026-08-31")
        XCTAssertEqual(SemesterRollover.proposal(after: x, today: "2026-09-01"),
                       SemesterProposal(name: "2026 前期", startDate: "2026-09-01", endDate: "2027-02-28"))
    }

    func testP9AlertMessage() {
        XCTAssertEqual(SemesterRollover.alertMessage(previous: a),
                       "「2026 前期」は 2026年 9月30日 に終了しました。新しい学期を作成しますか?")
    }

    func testP10CanCreate() {
        XCTAssertFalse(SemesterRollover.canCreate(name: " ", startDate: "2026-10-01", endDate: "2027-03-31"))
        XCTAssertFalse(SemesterRollover.canCreate(name: "x", startDate: "2027-04-01", endDate: "2027-03-31"))
        XCTAssertTrue(SemesterRollover.canCreate(name: "x", startDate: "2026-10-01", endDate: "2026-10-01"))
        XCTAssertTrue(SemesterRollover.canCreate(name: " 2026 後期 ", startDate: "2026-10-01", endDate: "2027-03-31"))
    }

    func testP11Store() {
        var store = SemesterRolloverStore(defaults: UserDefaults(suiteName: "test-\(UUID())")!)
        XCTAssertNil(store.dismissedSemesterId)
        store.dismissedSemesterId = "A"
        XCTAssertEqual(store.dismissedSemesterId, "A")
        store.dismissedSemesterId = nil
        XCTAssertNil(store.dismissedSemesterId)
        XCTAssertEqual(SemesterRolloverStore.key, "atender.semesterRollover.dismissedSemesterId")
    }

    func testP12HomeSheetId() {
        let p = SemesterProposal(name: "n", startDate: "2026-10-01", endDate: "2027-03-31")
        XCTAssertEqual(HomeSheet.semesterCreate(p).id, "semester-create")
    }
}
