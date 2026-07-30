import Foundation
import XCTest

final class BuildVersionTests: XCTestCase {
    private var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    func testV1BundleVersionIs16() throws {
        let projectYAML = try readText("apps/ios/project.yml")

        XCTAssertTrue(
            projectYAML.contains(#"CFBundleVersion: "16""#),
            "apps/ios/project.yml must contain CFBundleVersion: \"16\""
        )
        XCTAssertTrue(
            projectYAML.contains(#"CFBundleShortVersionString: "1.0""#),
            "apps/ios/project.yml must contain CFBundleShortVersionString: \"1.0\""
        )
    }

    func testV2MinIOSBuildDoesNotExceedBundleVersion() throws {
        let projectYAML = try readText("apps/ios/project.yml")
        let clientVersion = try readText("apps/api/src/lib/clientVersion.ts")
        let bundleVersion = try extractInteger(
            pattern: #"CFBundleVersion:\s*"(\d+)""#,
            from: projectYAML,
            fileName: "apps/ios/project.yml"
        )
        let minIOSBuild = try extractInteger(
            pattern: #"MIN_IOS_BUILD\s*=\s*(\d+)"#,
            from: clientVersion,
            fileName: "apps/api/src/lib/clientVersion.ts"
        )

        XCTAssertLessThanOrEqual(
            minIOSBuild,
            bundleVersion,
            "MIN_IOS_BUILD \(minIOSBuild) must be <= CFBundleVersion \(bundleVersion)"
        )
    }

    func testV3InfoPlistKeepsXcodegenManagedKeys() throws {
        let projectYAML = try readText("apps/ios/project.yml")
        let bundleVersion = try extractInteger(
            pattern: #"CFBundleVersion:\s*"(\d+)""#,
            from: projectYAML,
            fileName: "apps/ios/project.yml"
        )
        let plistURL = repoRoot.appendingPathComponent("apps/ios/Atender/Info.plist")
        let data = try Data(contentsOf: plistURL)
        let rawPlist = try PropertyListSerialization.propertyList(from: data, options: [], format: nil)
        let plist = try XCTUnwrap(rawPlist as? [String: Any], "apps/ios/Atender/Info.plist must be a dictionary")

        XCTAssertNotNil(
            plist["ITSAppUsesNonExemptEncryption"],
            "apps/ios/Atender/Info.plist is missing ITSAppUsesNonExemptEncryption"
        )
        XCTAssertNotNil(
            plist["ATENDER_API_HOST"],
            "apps/ios/Atender/Info.plist is missing ATENDER_API_HOST"
        )

        let fonts = plist["UIAppFonts"] as? [Any]
        XCTAssertEqual(fonts?.isEmpty, false, "apps/ios/Atender/Info.plist UIAppFonts must be a non-empty array; actual=\(String(describing: fonts))")

        let schemes = plist["LSApplicationQueriesSchemes"] as? [Any]
        XCTAssertEqual(
            schemes?.isEmpty,
            false,
            "apps/ios/Atender/Info.plist LSApplicationQueriesSchemes must be a non-empty array; actual=\(String(describing: schemes))"
        )

        let plistBundleVersion = try XCTUnwrap(
            plist["CFBundleVersion"] as? String,
            "apps/ios/Atender/Info.plist is missing string CFBundleVersion"
        )
        XCTAssertEqual(
            plistBundleVersion,
            String(bundleVersion),
            "Info.plist CFBundleVersion \(plistBundleVersion) must match project.yml CFBundleVersion \(bundleVersion)"
        )
    }

    private func readText(_ relativePath: String) throws -> String {
        let url = repoRoot.appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func extractInteger(pattern: String, from text: String, fileName: String) throws -> Int {
        let regex = try NSRegularExpression(pattern: pattern)
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        let match = try XCTUnwrap(regex.firstMatch(in: text, range: range), "\(fileName) did not match \(pattern)")
        let valueRange = try XCTUnwrap(Range(match.range(at: 1), in: text), "\(fileName) match for \(pattern) did not include capture group 1")
        let value = String(text[valueRange])
        return try XCTUnwrap(Int(value), "\(fileName) value \(value) is not an integer")
    }
}
