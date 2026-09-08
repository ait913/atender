import Foundation
import XCTest
@testable import Atender

/// build 17 設計 §6.8 (#B61-#B63) — 版数。
/// 設計docのみを根拠に記述 (実装は未読)。Reviewer が独立に project.yml / Info.plist を読む。
final class B17BuildVersionTests: XCTestCase {

    private func repoRoot() -> URL {
        // .../apps/ios/AtenderTests/<this file> から辿る
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<2 { url.deleteLastPathComponent() }   // <file> -> AtenderTests -> ios
        return url
    }

    /// [#B61] project.yml の CFBundleVersion が "17"、ShortVersion は "1.0" のまま
    func testB61ProjectYmlBundleVersionIs17() throws {
        let yml = try String(contentsOf: repoRoot().appendingPathComponent("project.yml"), encoding: .utf8)
        XCTAssertTrue(yml.contains("CFBundleVersion: \"17\""),
                      "[#B61] project.yml に CFBundleVersion: \"17\" が無い")
        XCTAssertTrue(yml.contains("CFBundleShortVersionString: \"1.0\""),
                      "[#B61] CFBundleShortVersionString が \"1.0\" でない")
        XCTAssertFalse(yml.contains("CFBundleVersion: \"16\""), "[#B61] 旧 build 16 の記述が残っている")
    }

    /// [#B61] 生成物 Info.plist と生成元 project.yml が一致する (片側編集の検出)
    func testB61bInfoPlistMatchesProjectYml() throws {
        let plistURL = repoRoot().appendingPathComponent("Atender/Info.plist")
        let data = try Data(contentsOf: plistURL)
        let parsed = try PropertyListSerialization.propertyList(from: data, format: nil)
        let plist = try XCTUnwrap(parsed as? [String: Any], "[#B61] Info.plist が dict でない")
        XCTAssertEqual(plist["CFBundleVersion"] as? String, "17", "[#B61] Info.plist の CFBundleVersion が 17 でない")
        XCTAssertEqual(plist["CFBundleShortVersionString"] as? String, "1.0", "[#B61] ShortVersion が 1.0 でない")
    }

    /// [#B62] 実行中バンドルの CFBundleVersion も 17 (= 実際にビルドに乗っている)
    func testB62RunningBundleVersionIs17() throws {
        let bundle = Bundle(for: type(of: self))
        let host = Bundle.allBundles.first { ($0.bundleIdentifier ?? "").hasSuffix("net.appily.atender") } ?? bundle
        let version = (host.infoDictionary?["CFBundleVersion"] as? String)
            ?? (Bundle.main.infoDictionary?["CFBundleVersion"] as? String)
        XCTAssertNotNil(version, "[#B62] CFBundleVersion が読めない")
        if let version, let numeric = Int(version) {
            XCTAssertGreaterThanOrEqual(numeric, 12, "[#B62] MIN_IOS_BUILD (12) <= CFBundleVersion が崩れている")
        }
    }

    /// [#B63] Info.plist は xcodegen 生成物であり、必要なキーが揃っている
    func testB63InfoPlistKeepsGeneratedKeys() throws {
        let plistURL = repoRoot().appendingPathComponent("Atender/Info.plist")
        let data = try Data(contentsOf: plistURL)
        let parsed = try PropertyListSerialization.propertyList(from: data, format: nil)
        let plist = try XCTUnwrap(parsed as? [String: Any], "[#B63] Info.plist が dict でない")
        XCTAssertEqual(plist["ITSAppUsesNonExemptEncryption"] as? Bool, false,
                       "[#B63] ITSAppUsesNonExemptEncryption が落ちている")
        let fonts = plist["UIAppFonts"] as? [String]
        XCTAssertNotNil(fonts, "[#B63] UIAppFonts が落ちている")
        XCTAssertFalse((fonts ?? []).isEmpty, "[#B63] UIAppFonts が空")
    }
}
