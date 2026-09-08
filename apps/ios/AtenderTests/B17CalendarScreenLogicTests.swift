import XCTest
@testable import Atender

/// build 17 設計 §6.5 (#B35-#B44) — 殻の状態→描画の写像 + オプション。
/// 設計docのみを根拠に記述 (実装は未読)。
final class B17CalendarScreenLogicTests: XCTestCase {

    /// [#B35] 一度も読めていない × 失敗なし → skeleton
    func testB35SkeletonBeforeFirstLoad() {
        XCTAssertEqual(CalendarScreenLogic.body(hasEverLoaded: false, payloadExists: false, failed: false),
                       .skeleton, "[#B35] 初回ロード前が skeleton でない")
    }

    /// [#B36] 初回から失敗 → error
    func testB36ErrorOnFirstFailure() {
        XCTAssertEqual(CalendarScreenLogic.body(hasEverLoaded: false, payloadExists: false, failed: true),
                       .error, "[#B36] 初回失敗が error でない")
    }

    /// [#B37] 一度読めていれば、未取得でも skeleton にしない (要望3の核心)
    func testB37GridWhileRefetching() {
        XCTAssertEqual(CalendarScreenLogic.body(hasEverLoaded: true, payloadExists: false, failed: false),
                       .grid, "[#B37] 再取得中に skeleton へ戻っている")
    }

    /// [#B38] 一度読めていれば、失敗しても直前の画面を消さない
    func testB38GridEvenWhenFailedAfterFirstLoad() {
        XCTAssertEqual(CalendarScreenLogic.body(hasEverLoaded: true, payloadExists: false, failed: true),
                       .grid, "[#B38] 失敗でグリッドが消えている")
    }

    /// [#B39] 通常
    func testB39GridWhenLoaded() {
        XCTAssertEqual(CalendarScreenLogic.body(hasEverLoaded: true, payloadExists: true, failed: false),
                       .grid, "[#B39] 取得済が grid でない")
    }

    /// [#B37/#B38 補] hasEverLoaded が true なら payload/failed の 4 通り全てで grid
    func testB37bGridForAllStatesAfterFirstLoad() {
        for payloadExists in [true, false] {
            for failed in [true, false] {
                XCTAssertEqual(CalendarScreenLogic.body(hasEverLoaded: true, payloadExists: payloadExists, failed: failed),
                               .grid,
                               "[#B37/#B38] hasEverLoaded=true payload=\(payloadExists) failed=\(failed) が grid でない")
            }
        }
    }

    /// [#B40] 再取得中 → refreshing
    func testB40HeaderRefreshing() {
        XCTAssertEqual(CalendarScreenLogic.headerState(payloadExists: true, loading: true, failed: false),
                       .refreshing, "[#B40] refreshing にならない")
    }

    /// [#B41] 失敗 → retryable
    func testB41HeaderRetryable() {
        XCTAssertEqual(CalendarScreenLogic.headerState(payloadExists: true, loading: false, failed: true),
                       .retryable, "[#B41] retryable にならない")
    }

    /// [#B42] 平常 → idle
    func testB42HeaderIdle() {
        XCTAssertEqual(CalendarScreenLogic.headerState(payloadExists: true, loading: false, failed: false),
                       .idle, "[#B42] idle にならない")
    }

    /// [#B43] personal のオプション
    func testB43PersonalOptions() {
        let options = CalendarScreenOptions.personal
        XCTAssertEqual(options.identifier, "personal-calendar", "[#B43] identifier が違う")
        XCTAssertTrue(options.showsSyncBanner, "[#B43] showsSyncBanner が false")
        XCTAssertTrue(options.showsSyncWarningGlyph, "[#B43] showsSyncWarningGlyph が false")
        XCTAssertTrue(options.allowsLongPressCreate, "[#B43] allowsLongPressCreate が false")
    }

    /// [#B44] room のオプション (§7.2: 同期バナー・警告グリフは無効、長押し作成は有効)
    func testB44RoomOptions() {
        let options = CalendarScreenOptions.room
        XCTAssertEqual(options.identifier, "room-calendar", "[#B44] identifier が違う")
        XCTAssertFalse(options.showsSyncBanner, "[#B44] ルームで同期バナーが有効になっている")
        XCTAssertFalse(options.showsSyncWarningGlyph, "[#B44] ルームで同期警告グリフが有効になっている")
        XCTAssertTrue(options.allowsLongPressCreate, "[#B44] ルームで長押し作成が無効 (§7.2 #3 に反する)")
    }

    /// [#B43/#B44 補] personal と room は別物 (取り違え防止)
    func testB43bPersonalAndRoomDiffer() {
        XCTAssertNotEqual(CalendarScreenOptions.personal, CalendarScreenOptions.room,
                          "[#B43/#B44] personal と room が同一")
    }
}
