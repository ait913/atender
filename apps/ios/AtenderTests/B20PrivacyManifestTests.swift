import Foundation
import XCTest
@testable import Atender

/// 設計 20261009-build20-account-deletion-legal.md §13.6 (#P1-#P4) / §13.7 (#V1-#V3)。
final class B20PrivacyManifestTests: XCTestCase {
    private var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func manifest() throws -> [String: Any] {
        let url = repoRoot.appendingPathComponent("apps/ios/Atender/PrivacyInfo.xcprivacy")
        let data = try Data(contentsOf: url)
        let obj = try PropertyListSerialization.propertyList(from: data, options: [], format: nil)
        return try XCTUnwrap(obj as? [String: Any], "PrivacyInfo.xcprivacy must be a dict")
    }

    func testP1TrackingIsOffAndNoDomains() throws {
        let m = try manifest()
        XCTAssertEqual(m["NSPrivacyTracking"] as? Bool, false)
        let domains = try XCTUnwrap(m["NSPrivacyTrackingDomains"] as? [Any])
        XCTAssertTrue(domains.isEmpty)
    }

    func testP2CollectedDataTypes() throws {
        let m = try manifest()
        let items = try XCTUnwrap(m["NSPrivacyCollectedDataTypes"] as? [[String: Any]])
        let types = items.compactMap { $0["NSPrivacyCollectedDataType"] as? String }
        XCTAssertEqual(items.count, 4)
        XCTAssertEqual(
            Set(types),
            [
                "NSPrivacyCollectedDataTypeEmailAddress",
                "NSPrivacyCollectedDataTypeName",
                "NSPrivacyCollectedDataTypeUserID",
                "NSPrivacyCollectedDataTypeOtherUserContent",
            ]
        )
        for item in items {
            XCTAssertEqual(item["NSPrivacyCollectedDataTypeLinked"] as? Bool, true, "\(item)")
            XCTAssertEqual(item["NSPrivacyCollectedDataTypeTracking"] as? Bool, false, "\(item)")
            XCTAssertEqual(
                item["NSPrivacyCollectedDataTypePurposes"] as? [String],
                ["NSPrivacyCollectedDataTypePurposeAppFunctionality"],
                "\(item)"
            )
        }
    }

    func testP3AccessedAPITypes() throws {
        let m = try manifest()
        let items = try XCTUnwrap(m["NSPrivacyAccessedAPITypes"] as? [[String: Any]])
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items[0]["NSPrivacyAccessedAPIType"] as? String, "NSPrivacyAccessedAPICategoryUserDefaults")
        XCTAssertEqual(items[0]["NSPrivacyAccessedAPITypeReasons"] as? [String], ["CA92.1"])
    }

    func testP4ManifestIsBundledInHostApp() {
        XCTAssertNotNil(Bundle.main.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"))
    }

    // MARK: #V

    private func readText(_ rel: String) throws -> String {
        try String(contentsOf: repoRoot.appendingPathComponent(rel), encoding: .utf8)
    }

    func testV1ProjectYmlIsBuild20() throws {
        let yml = try readText("apps/ios/project.yml")
        XCTAssertTrue(yml.contains(#"CFBundleVersion: "20""#))
        XCTAssertFalse(yml.contains(#"CFBundleVersion: "19""#))
        XCTAssertFalse(yml.contains(#""19""#), "project.yml に \"19\" が残っていない")
        XCTAssertTrue(yml.contains(#"CFBundleShortVersionString: "1.0""#))
    }

    func testV2MinIOSBuildStays12AndNotAboveBundleVersion() throws {
        let ts = try readText("apps/api/src/lib/clientVersion.ts")
        let regex = try NSRegularExpression(pattern: #"MIN_IOS_BUILD\s*=\s*(\d+)"#)
        let m = try XCTUnwrap(regex.firstMatch(in: ts, range: NSRange(ts.startIndex..., in: ts)))
        let value = Int(String(ts[try XCTUnwrap(Range(m.range(at: 1), in: ts))]))
        XCTAssertEqual(value, 12, "設計 §12: MIN_IOS_BUILD は 12 据え置き")
        XCTAssertLessThanOrEqual(try XCTUnwrap(value), 20)
    }

    func testV3InfoPlistBuild20() throws {
        let data = try Data(contentsOf: repoRoot.appendingPathComponent("apps/ios/Atender/Info.plist"))
        let plist = try XCTUnwrap(try PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any])
        XCTAssertEqual(plist["CFBundleVersion"] as? String, "20")
        XCTAssertEqual(Bundle.main.infoDictionary?["CFBundleVersion"] as? String, "20")
    }
}
