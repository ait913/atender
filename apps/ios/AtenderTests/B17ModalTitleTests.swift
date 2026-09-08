import SwiftUI
import UIKit
import XCTest
@testable import Atender

/// build 17 設計 §6.6 (#B50/#B51/#B55) — モーダルタイトルの規格。
/// 設計docのみを根拠に記述 (実装は未読)。
@MainActor
final class B17ModalTitleTests: XCTestCase {

    /// [#B50] タイトル書体は不変
    func testB50TitleFontUnchanged() {
        XCTAssertEqual(ModalHeader.titleFont, Font.atender2xl.weight(.bold), "[#B50] titleFont が変わっている")
    }

    /// [#B51] 最小縮小率は 0.5 (旧 0.75 から変更)
    func testB51MinimumScaleFactorIsHalf() {
        XCTAssertEqual(ModalHeader.titleMinimumScaleFactor, 0.5, accuracy: 0.0001,
                       "[#B51] titleMinimumScaleFactor が 0.5 でない")
        XCTAssertNotEqual(ModalHeader.titleMinimumScaleFactor, 0.75, "[#B51] まだ 0.75 のまま")
    }

    /// タイトル 1 行の自然幅 (pt)。fixedSize で制約を外して実測する
    private func naturalWidth(_ title: String) throws -> CGFloat {
        let view = Text(title)
            .font(ModalHeader.titleFont)
            .lineLimit(1)
            .fixedSize()
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1
        renderer.proposedSize = ProposedViewSize(width: 4000, height: 400)
        let image = try XCTUnwrap(renderer.uiImage, "ImageRenderer が nil")
        return image.size.width
    }

    /// [#B55] 19 文字 (全角) が .principal の幅バジェット 247pt に minimumScaleFactor で収まる
    func testB55NineteenFullWidthCharactersFitInPrincipalBudget() throws {
        let title19 = "カレンダーの取り込み設定を変更する処理"
        XCTAssertEqual(title19.count, 19, "[#B55] 標本が 19 文字でない")
        let scaled = try naturalWidth(title19) * ModalHeader.titleMinimumScaleFactor
        XCTAssertLessThanOrEqual(scaled, 247,
                                 "[#B55] 19 文字が iOS 26 の .principal 幅 247pt に収まらない (縮小後 \(scaled)pt)")
    }

    /// [#B55] 現行最長タイトル「カレンダーを取り込む」(10 文字) は等倍で入る
    func testB55bLongestShippedTitleFitsAtFullScale() throws {
        let natural = try naturalWidth("カレンダーを取り込む")
        XCTAssertLessThanOrEqual(natural, 247,
                                 "[#B55] 現行最長タイトルが等倍で 247pt に入らない (自然幅 \(natural)pt)")
    }

    /// [#B55 対照] 明らかに長すぎる文字列は縮小しても入らない (= 計測が無力でない)
    func testB55cAbsurdlyLongTitleDoesNotFit() throws {
        let long = String(repeating: "あ", count: 40)
        let scaled = try naturalWidth(long) * ModalHeader.titleMinimumScaleFactor
        XCTAssertGreaterThan(scaled, 247, "[#B55] 40 文字でも 247pt に収まる = 幅の計測が効いていない")
    }

    /// [#B51 対照] 0.5 という値が「実際に効く」ことを幅で示す:
    /// 旧 0.75 のままなら 19 文字は 247pt に入らない
    func testB51bOldScaleFactorWouldNotFitNineteen() throws {
        let natural = try naturalWidth("カレンダーの取り込み設定を変更する処理")
        XCTAssertGreaterThan(natural * 0.75, 247,
                             "[#B51] 旧 0.75 でも 19 文字が入る = この定数変更は幅に影響しない (設計の前提が違う)")
    }
}
