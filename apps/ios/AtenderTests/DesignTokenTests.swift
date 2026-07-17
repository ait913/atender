import SwiftUI
import XCTest
@testable import Atender

final class DesignTokenTests: XCTestCase {

    func testSpacingAndRadiusTokens() {
        XCTAssertEqual(Radius.full, 9999)
        XCTAssertEqual(Space.s20, 80)
        XCTAssertEqual(Space.tabBarHeight, 64)
        XCTAssertEqual(Space.selfTtChrome, 352)
    }

    func testThemePreferenceColorSchemes() {
        XCTAssertEqual(ThemePreference.dark.colorScheme, .dark)
        XCTAssertNil(ThemePreference.auto.colorScheme)
        XCTAssertEqual(ThemePreference.light.colorScheme, .light)
    }

    func testAccentColorAssetMatchesToken() throws {
        func rgbaComponents(of color: UIColor, file: StaticString = #filePath, line: UInt = #line) throws -> (red: CGFloat, green: CGFloat, blue: CGFloat, alpha: CGFloat) {
            var red: CGFloat = 0
            var green: CGFloat = 0
            var blue: CGFloat = 0
            var alpha: CGFloat = 0
            XCTAssertTrue(color.getRed(&red, green: &green, blue: &blue, alpha: &alpha), file: file, line: line)
            return (red, green, blue, alpha)
        }

        func assertEqualRGBA(
            _ actual: UIColor,
            _ expected: UIColor,
            file: StaticString = #filePath,
            line: UInt = #line
        ) throws {
            let actualComponents = try rgbaComponents(of: actual, file: file, line: line)
            let expectedComponents = try rgbaComponents(of: expected, file: file, line: line)

            XCTAssertEqual(actualComponents.red, expectedComponents.red, accuracy: 0.001, file: file, line: line)
            XCTAssertEqual(actualComponents.green, expectedComponents.green, accuracy: 0.001, file: file, line: line)
            XCTAssertEqual(actualComponents.blue, expectedComponents.blue, accuracy: 0.001, file: file, line: line)
            XCTAssertEqual(actualComponents.alpha, expectedComponents.alpha, accuracy: 0.001, file: file, line: line)
        }

        let assetColor = try XCTUnwrap(UIColor(named: "AccentColor"))
        let tokenColor = UIColor(Color.accent500)
        let lightTrait = UITraitCollection(userInterfaceStyle: .light)
        let darkTrait = UITraitCollection(userInterfaceStyle: .dark)

        let lightAssetColor = assetColor.resolvedColor(with: lightTrait)
        let darkAssetColor = assetColor.resolvedColor(with: darkTrait)

        try assertEqualRGBA(lightAssetColor, tokenColor.resolvedColor(with: lightTrait))
        try assertEqualRGBA(darkAssetColor, tokenColor.resolvedColor(with: darkTrait))

        let lightAssetComponents = try rgbaComponents(of: lightAssetColor)
        let darkAssetComponents = try rgbaComponents(of: darkAssetColor)
        XCTAssertFalse(
            abs(lightAssetComponents.red - darkAssetComponents.red) <= 0.001
                && abs(lightAssetComponents.green - darkAssetComponents.green) <= 0.001
                && abs(lightAssetComponents.blue - darkAssetComponents.blue) <= 0.001
                && abs(lightAssetComponents.alpha - darkAssetComponents.alpha) <= 0.001
        )
    }
}
