import UIKit
import XCTest
@testable import Atender

/// Reviewer 生成: 設計 §8.7 (#S1-#S3) を根拠に検証。
/// 設計 F1/F2: project.yml の options.developmentLanguage: ja により
/// .lproj を 1 つも足さずに UIKit の "Back" が「戻る」になる。
/// ★ 負の対照 (§10.1-4): developmentLanguage を外すと 3 本とも赤くなること。
final class LocalizationTests: XCTestCase {

    /// [ui-revamp #S1]
    func testPreferredLocalizationsIsJapanese() {
        XCTAssertEqual(Bundle.main.preferredLocalizations, ["ja"])
    }

    /// [ui-revamp #S2]
    func testCFBundleDevelopmentRegionIsJa() {
        let region = Bundle.main.object(forInfoDictionaryKey: "CFBundleDevelopmentRegion") as? String
        XCTAssertEqual(region, "ja")
    }

    /// [ui-revamp #S3] システムの back が日本語になる
    /// = BackHeaderButton が不要になったことの直接証拠 (設計 §4.3)。
    func testSystemBackButtonIsLocalizedToJapanese() {
        let uiKit = Bundle(for: UIViewController.self)
        XCTAssertEqual(uiKit.localizedString(forKey: "Back", value: "?", table: nil), "戻る")
    }
}
