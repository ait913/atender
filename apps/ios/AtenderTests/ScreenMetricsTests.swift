import UIKit
import XCTest
@testable import Atender

/// Reviewer 生成: 設計 §3.6 (ScreenMetrics / F8 の帰結) を根拠に検証。
///
/// ★ Developer が設計の逐語コードに `@MainActor` を足している (申告済の逸脱)。
///   本テストは「値の契約」が設計 §3.6 の式と一致することを示す。
///   「呼び出し契約」の変化 (nonisolated からは呼べなくなる) は別途 Reviewer が
///   compile プローブで確認済 — Leader への報告参照。
@MainActor
final class ScreenMetricsTests: XCTestCase {

    /// 設計 §3.6 の式をテスト側で独立に再構成し、実装の戻り値と突合する。
    /// (実装ボディは読まず、doc のコード片からのみ導出)
    func testHeightMatchesFirstWindowSceneScreenHeight() {
        let expected: CGFloat = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.screen.bounds.height ?? 0

        XCTAssertEqual(ScreenMetrics.height, expected, accuracy: 0.001,
                       "設計 §3.6 の式と戻り値が一致しない")
    }

    /// `?? 0` の契約 — window scene が取れなくても負値やクラッシュにならない。
    func testHeightIsNeverNegative() {
        XCTAssertGreaterThanOrEqual(ScreenMetrics.height, 0)
    }

    /// F8 の本題: UIScreen.main を使っていないこと自体は静的には測れないが、
    /// windowScene 経由の値が実機同等 (シミュレータの画面高) であることは測れる。
    /// テストホストは iPhone 16 なので 0 より大きい画面高が取れるはず。
    func testHeightIsPositiveInHostedTestEnvironment() throws {
        let hasWindowScene = UIApplication.shared.connectedScenes
            .contains { $0 is UIWindowScene }
        try XCTSkipUnless(hasWindowScene, "window scene が無い環境ではスキップ (契約上 0 が正)")
        XCTAssertGreaterThan(ScreenMetrics.height, 0)
    }
}
