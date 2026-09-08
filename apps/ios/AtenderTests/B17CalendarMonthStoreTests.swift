import XCTest
@testable import Atender

/// build 17 設計 §6.4 (#B21-#B34) — 月データのストア。
/// 設計docのみを根拠に記述 (実装は未読)。fake loader で検証する。
@MainActor
final class B17CalendarMonthStoreTests: XCTestCase {

    // MARK: - fake loader

    /// 呼ばれた Request を記録し、月ごとに成功/失敗を切り替えられるローダ
    private final class Recorder {
        var requests: [CalendarMonthStore<Int>.Request] = []
        var failingMonths: Set<String> = []
        var completionOrder: [String] = []
        var delayMonths: Set<String> = []

        struct Boom: Error {}
    }

    private func makeStore(visibleMonth: String = "2026-07-01",
                          semesterId: String? = "s1",
                          recorder: Recorder) -> CalendarMonthStore<Int> {
        CalendarMonthStore<Int>(visibleMonth: visibleMonth, semesterId: semesterId) { request in
            recorder.requests.append(request)
            if recorder.delayMonths.contains(request.monthFirst) {
                // 可視月を先に完了させるための擬似待ち (実時間ではなく再スケジュール)
                await Task.yield()
                await Task.yield()
            }
            if recorder.failingMonths.contains(request.monthFirst) {
                recorder.completionOrder.append("!\(request.monthFirst)")
                throw Recorder.Boom()
            }
            recorder.completionOrder.append(request.monthFirst)
            return .init(events: [], daySummaries: [:], extra: recorder.requests.count)
        }
    }

    private let july = "2026-07-01"
    private let august = "2026-08-01"
    private let june = "2026-06-01"
    private let september = "2026-09-01"

    // MARK: - tests

    /// [#B21] 初期状態
    func testB21InitialState() {
        let rec = Recorder()
        let store = makeStore(recorder: rec)
        XCTAssertTrue(store.payloads.isEmpty, "[#B21] payloads が空でない")
        XCTAssertFalse(store.hasEverLoaded, "[#B21] hasEverLoaded が false でない")
        XCTAssertNil(store.payload(july), "[#B21] payload が nil でない")
        XCTAssertFalse(store.isLoading(july), "[#B21] isLoading が false でない")
        XCTAssertFalse(store.hasFailed(july), "[#B21] hasFailed が false でない")
        XCTAssertEqual(rec.requests.count, 0, "[#B21] 初期化だけで loader が呼ばれている")
    }

    /// [#B22] ensureLoaded は 1 回呼び、成功後の状態が揃う
    func testB22EnsureLoadedSuccess() async {
        let rec = Recorder()
        let store = makeStore(recorder: rec)
        await store.ensureLoaded(july)
        XCTAssertEqual(rec.requests.count, 1, "[#B22] loader が 1 回でない")
        XCTAssertNotNil(store.payload(july), "[#B22] payload が入らない")
        XCTAssertTrue(store.hasEverLoaded, "[#B22] hasEverLoaded が true にならない")
        XCTAssertFalse(store.isLoading(july), "[#B22] isLoading が残っている")
        XCTAssertFalse(store.hasFailed(july), "[#B22] hasFailed が立っている")
    }

    /// [#B23] キャッシュ済はスキップ
    func testB23EnsureLoadedIsCached() async {
        let rec = Recorder()
        let store = makeStore(recorder: rec)
        await store.ensureLoaded(july)
        await store.ensureLoaded(july)
        XCTAssertEqual(rec.requests.count, 1, "[#B23] 取得済の月で loader が再度呼ばれた")
    }

    /// [#B24] force: true は取得済でも呼び、Request.force が true
    func testB24ForceReload() async {
        let rec = Recorder()
        let store = makeStore(recorder: rec)
        await store.ensureLoaded(july)
        await store.ensureLoaded(july, force: true)
        XCTAssertEqual(rec.requests.count, 2, "[#B24] force で再取得されない")
        XCTAssertEqual(rec.requests.first?.force, false, "[#B24] 初回の force が true になっている")
        XCTAssertEqual(rec.requests.last?.force, true, "[#B24] force が loader に渡っていない")
    }

    /// [#B25] 失敗しても直前の payload は残る
    func testB25FailureKeepsPreviousPayload() async {
        let rec = Recorder()
        let store = makeStore(recorder: rec)
        await store.ensureLoaded(july)
        let before = store.payload(july)?.extra
        XCTAssertNotNil(before, "[#B25] 前提の取得に失敗")

        rec.failingMonths.insert(july)
        await store.ensureLoaded(july, force: true)

        XCTAssertTrue(store.hasFailed(july), "[#B25] hasFailed が立たない")
        XCTAssertFalse(store.isLoading(july), "[#B25] isLoading が残っている")
        XCTAssertEqual(store.payload(july)?.extra, before, "[#B25] 失敗で直前の payload が消えた")
    }

    /// [#B26] 失敗はキャッシュしない
    func testB26FailureIsNotCached() async {
        let rec = Recorder()
        let store = makeStore(recorder: rec)
        rec.failingMonths.insert(july)
        await store.ensureLoaded(july)
        XCTAssertEqual(rec.requests.count, 1, "[#B26] 前提: 1 回目が呼ばれていない")
        XCTAssertTrue(store.hasFailed(july), "[#B26] 前提: 失敗していない")

        await store.ensureLoaded(july)
        XCTAssertEqual(rec.requests.count, 2, "[#B26] 失敗した月が再取得されない")
    }

    /// [#B27] setVisible は可視月 + prefetch の 3 ヶ月を読み、可視月が先に完了する
    func testB27SetVisibleLoadsVisibleFirstThenPrefetch() async {
        let rec = Recorder()
        let store = makeStore(recorder: rec)
        await store.setVisible(august, prefetch: [july, september])

        XCTAssertEqual(store.visibleMonth, august, "[#B27] visibleMonth が更新されない")
        XCTAssertEqual(Set(rec.requests.map(\.monthFirst)), [august, july, september],
                       "[#B27] 3 ヶ月ぶんの loader 呼び出しが起きていない")
        XCTAssertEqual(rec.completionOrder.first, august,
                       "[#B27] 可視月の完了が先頭でない (実測順: \(rec.completionOrder))")
    }

    /// [#B28] prefetch 空なら可視月だけ
    func testB28SetVisibleWithoutPrefetch() async {
        let rec = Recorder()
        let store = makeStore(recorder: rec)
        await store.setVisible(august, prefetch: [])
        XCTAssertEqual(rec.requests.map(\.monthFirst), [august], "[#B28] 可視月以外が読まれた")
    }

    /// [#B29] Request の range は CalendarRange.monthGridRange と一致する
    func testB29RequestRangeMatchesMonthGridRange() async {
        let rec = Recorder()
        let store = makeStore(recorder: rec)
        await store.ensureLoaded(august)
        guard let request = rec.requests.first else { return XCTFail("[#B29] Request が無い") }

        let expected = CalendarRange.monthGridRange(anchorMonthFirst: august)
        XCTAssertEqual(request.monthFirst, CalendarRange.monthFirst(august), "[#B29] monthFirst が正規化されていない")
        XCTAssertEqual(request.rangeStart, expected.start, "[#B29] rangeStart が monthGridRange と違う")
        XCTAssertEqual(request.rangeEnd, expected.end, "[#B29] rangeEnd が monthGridRange と違う")
        XCTAssertEqual(request.semesterId, "s1", "[#B29] semesterId が渡っていない")
    }

    /// [#B30/#B30a/#B30b] setSemester は payloads を残して全月 stale + failed クリア + 可視月の読み直し、
    /// 以後の Request に新 semesterId。hasEverLoaded は true のまま (skeleton 全消しに落とさない)
    func testB30SetSemesterResetsAndReloads() async {
        let rec = Recorder()
        let store = makeStore(recorder: rec)
        let farMonth = "2026-11-01"   // july の隣接月ではない (先読みで復活しない月を選ぶ)
        await store.ensureLoaded(july)
        await store.ensureLoaded(farMonth)
        rec.failingMonths.insert("2027-03-01")
        await store.ensureLoaded("2027-03-01")
        store.invalidateAll()
        XCTAssertNotNil(store.payload(farMonth), "[#B30] 前提: payloads がある")
        XCTAssertTrue(store.hasFailed("2027-03-01"), "[#B30] 前提: 失敗がある")
        rec.failingMonths.removeAll()
        let callsBefore = rec.requests.count

        XCTAssertTrue(store.hasEverLoaded, "[#B30a] 前提: hasEverLoaded が true")

        await store.setSemester("s2")

        XCTAssertNotNil(store.payload(farMonth), "[#B30] payloads を全消ししてはいけない (§3.5 グリッドを消さない)")
        XCTAssertTrue(store.hasEverLoaded, "[#B30a] setSemester 後に hasEverLoaded が false に落ちた")
        XCTAssertEqual(
            CalendarScreenLogic.body(hasEverLoaded: store.hasEverLoaded, payloadExists: store.payload(july) != nil, failed: store.hasFailed(july)),
            .grid, "[#B30b] setSemester 直後の body が grid でない"
        )
        XCTAssertNotNil(store.payload(july), "[#B30] 可視月が読み直されていない")
        XCTAssertFalse(store.hasFailed("2027-03-01"), "[#B30] failed が消えていない")
        XCTAssertTrue(store.stale.contains(farMonth), "[#B30] 非可視月が stale になっていない")
        XCTAssertFalse(store.stale.contains(july), "[#B30] 読み直した可視月の stale が残っている")
        XCTAssertGreaterThan(rec.requests.count, callsBefore, "[#B30] 可視月が読み直されていない")
        XCTAssertEqual(rec.requests.last?.semesterId, "s2", "[#B30] 新しい semesterId が渡っていない")
    }

    /// [#B31] 同じ semesterId なら何も起きない
    func testB31SetSemesterWithSameValueIsNoop() async {
        let rec = Recorder()
        let store = makeStore(recorder: rec)
        await store.ensureLoaded(july)
        let callsBefore = rec.requests.count
        let payloadsBefore = store.payloads.count

        await store.setSemester("s1")

        XCTAssertEqual(rec.requests.count, callsBefore, "[#B31] 同値の setSemester で loader が呼ばれた")
        XCTAssertEqual(store.payloads.count, payloadsBefore, "[#B31] 同値の setSemester で payloads が変化した")
    }

    /// [#B32] invalidateAll は payloads を残して stale 化 / 直後の ensureLoaded は force false で呼ぶ
    func testB32InvalidateAllKeepsPayloadsAndMarksStale() async {
        let rec = Recorder()
        let store = makeStore(recorder: rec)
        await store.ensureLoaded(july)
        await store.ensureLoaded(august)
        store.invalidateAll()

        XCTAssertNotNil(store.payload(july), "[#B32] payload が消えた")
        XCTAssertNotNil(store.payload(august), "[#B32] payload が消えた")
        XCTAssertEqual(store.stale, [july, august], "[#B32] 全月が stale になっていない (実測: \(store.stale))")

        let callsBefore = rec.requests.count
        await store.ensureLoaded(july)
        XCTAssertEqual(rec.requests.count, callsBefore + 1, "[#B32] stale な月が再取得されない")
        XCTAssertEqual(rec.requests.last?.force, false, "[#B32] force が true で呼ばれている")
    }

    /// [#B33] refreshVisible は可視月を force 再取得し、他を stale にする
    func testB33RefreshVisible() async {
        let rec = Recorder()
        let store = makeStore(recorder: rec)
        await store.ensureLoaded(july)
        await store.ensureLoaded(august)

        await store.refreshVisible()

        XCTAssertEqual(rec.requests.last?.monthFirst, july, "[#B33] 可視月が読み直されていない")
        XCTAssertEqual(rec.requests.last?.force, true, "[#B33] force: true で読み直していない")
        XCTAssertTrue(store.stale.contains(august), "[#B33] 他の月が stale になっていない")
        XCTAssertFalse(store.stale.contains(july), "[#B33] 読み直した可視月が stale のまま")
    }

    /// [#B34] 取得中の再入で loader は 1 回だけ
    func testB34ReentrantEnsureLoadedIsGuarded() async {
        let rec = Recorder()
        rec.delayMonths.insert(july)
        let store = makeStore(recorder: rec)

        let first = Task { await store.ensureLoaded(july) }
        let second = Task { await store.ensureLoaded(july) }
        _ = await first.value
        _ = await second.value

        XCTAssertEqual(rec.requests.count, 1, "[#B34] 取得中の再入で loader が複数回呼ばれた")
    }
}
