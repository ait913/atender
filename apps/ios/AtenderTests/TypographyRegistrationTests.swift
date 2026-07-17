import SwiftUI
import UIKit
import XCTest
@testable import Atender

/// Reviewer 生成: 設計 §8.7 (S 系) を根拠に検証。
/// ★ 検証は必ず `UIFont(name:)` で書く。`Font.custom` は解決失敗を無言でシステムフォントに
///   フォールバックするので、登録漏れを検出できない
///   (gotcha/swiftui-font-custom-silent-fallback-hides-missing-uiappfonts.md)。
final class TypographyRegistrationTests: XCTestCase {

    /// [ui-revamp #S5] 負の対照 — assert が vacuous でないこと。
    /// UIFont(name:) が未登録名に対して確かに nil を返す土俵であることを先に示す。
    func testUnregisteredFontNameResolvesToNil() {
        XCTAssertNil(UIFont(name: "ThisFontIsNotRegistered-XYZ", size: 14),
                     "未登録名が nil を返さないなら、以下の #S6/#S7 の assert は全て vacuous")
    }

    /// [ui-revamp #S4] Google サインインボタンのブランド資産が生きている。
    /// AuthProviderButton が Font.custom("GoogleSans-Medium") で現に使用中 (設計 §3.1)。
    func testGoogleSansRemainsRegistered() {
        XCTAssertNotNil(UIFont(name: "GoogleSans-Medium", size: 17),
                        "GoogleSans-Medium が未登録 — Google のブランド規約を満たせない")
    }

    /// [ui-revamp #S6] Inter が登録解除されたことの証明。誰かが UIAppFonts に戻したら落ちる。
    func testInterIsNoLongerRegistered() {
        for name in ["Inter-Regular", "Inter-Medium", "Inter-SemiBold", "Inter-Bold", "Inter-Black"] {
            XCTAssertNil(UIFont(name: name, size: 14), "\(name) がまだ登録されている (設計 §3.1 で削除のはず)")
        }
    }

    /// [ui-revamp #S7] Noto も登録解除。
    func testNotoSansJPIsNoLongerRegistered() {
        XCTAssertNil(UIFont(name: "NotoSansJP-Thin", size: 14))
        XCTAssertNil(UIFont(name: "NotoSansJP-Regular", size: 14))
    }

    /// [ui-revamp #S8] UIAppFonts の不変条件。件数のマジックナンバーでは書かない。
    func testUIAppFontsPlistContainsBundledFontFiles() throws {
        guard let fontFiles = Bundle.main.object(forInfoDictionaryKey: "UIAppFonts") as? [String] else {
            throw XCTSkip("Bundle.main から UIAppFonts を取得できないため plist 検査をスキップ")
        }

        let expectedFontFiles = ["GoogleSans-Medium-Latin.ttf"]
        for file in expectedFontFiles {
            XCTAssertTrue(fontFiles.contains(file), "UIAppFonts に \(file) が含まれていない")
        }

        // 件数のマジックナンバーでなく「全エントリが実在ファイルを指す」不変条件で検証する。
        // UIAppFonts の値は .app 直下のベアファイル名でなければならず、パス付き
        // (例 "Resources/Fonts/X.ttf") にすると iOS は例外も警告も出さずに未登録のまま
        // システムフォントへフォールバックする。この assert がその誤りを検出する。
        for file in fontFiles {
            let name = (file as NSString).deletingPathExtension
            let ext = (file as NSString).pathExtension
            XCTAssertEqual(file, (file as NSString).lastPathComponent,
                           "UIAppFonts の値にパスが含まれている: \(file) — .app 直下のファイル名のみにすること")
            XCTAssertNotNil(Bundle.main.url(forResource: name, withExtension: ext),
                            "UIAppFonts の \(file) がバンドル内に実在しない")
        }

        // 設計 §3.1: 削除した 6 ファイルが UIAppFonts に残っていないこと
        for stale in ["Inter-Regular.ttf", "Inter-Medium.ttf", "Inter-SemiBold.ttf",
                      "Inter-Bold.ttf", "Inter-Black.ttf", "NotoSansJP-VariableFont_wght.ttf"] {
            XCTAssertFalse(fontFiles.contains(stale), "UIAppFonts に削除済のはずの \(stale) が残っている")
        }
    }
}
