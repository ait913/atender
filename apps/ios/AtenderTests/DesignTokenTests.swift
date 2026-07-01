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
}
