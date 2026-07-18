import XCTest
import SwiftUI
import UIKit
@testable import Atender

final class ColorTintTests: XCTestCase {
    private func rgba(
        _ color: Color,
        userInterfaceStyle: UIUserInterfaceStyle,
        file: StaticString = #filePath,
        line: UInt = #line
    ) -> (red: CGFloat, green: CGFloat, blue: CGFloat, alpha: CGFloat) {
        let trait = UITraitCollection(userInterfaceStyle: userInterfaceStyle)
        let resolvedColor = UIColor(color).resolvedColor(with: trait)

        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0

        XCTAssertTrue(
            resolvedColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha),
            "Expected UIColor.getRed(_:green:blue:alpha:) to extract RGBA components",
            file: file,
            line: line
        )

        return (red, green, blue, alpha)
    }

    func test_T1_opaqueTintIsAlphaOne() {
        let light = rgba(
            .opaqueTint(hex: "#FF0000", ratio: 0.15, base: .bgElevated),
            userInterfaceStyle: .light
        )
        let dark = rgba(
            .opaqueTint(hex: "#FF0000", ratio: 0.15, base: .bgElevated),
            userInterfaceStyle: .dark
        )

        XCTAssertEqual(light.alpha, 1.0, accuracy: 0.001)
        XCTAssertEqual(dark.alpha, 1.0, accuracy: 0.001)
    }

    func test_T2_ratioZeroMatchesBaseColor() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let tinted = rgba(
                .opaqueTint(hex: "#FF0000", ratio: 0, base: .bgElevated),
                userInterfaceStyle: style
            )
            let base = rgba(.bgElevated, userInterfaceStyle: style)

            XCTAssertEqual(tinted.red, base.red, accuracy: 0.01)
            XCTAssertEqual(tinted.green, base.green, accuracy: 0.01)
            XCTAssertEqual(tinted.blue, base.blue, accuracy: 0.01)
        }
    }

    func test_T3_ratioOneMatchesSubjectColor() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let tinted = rgba(
                .opaqueTint(hex: "#FF0000", ratio: 1, base: .bgElevated),
                userInterfaceStyle: style
            )

            XCTAssertEqual(tinted.red, 1.0, accuracy: 0.01)
            XCTAssertEqual(tinted.green, 0.0, accuracy: 0.01)
            XCTAssertEqual(tinted.blue, 0.0, accuracy: 0.01)
        }
    }

    func test_T4_opaqueTintPreservesDynamicBaseResolution() {
        let light = rgba(
            .opaqueTint(hex: "#FF0000", ratio: 0.15, base: .bgElevated),
            userInterfaceStyle: .light
        )
        let dark = rgba(
            .opaqueTint(hex: "#FF0000", ratio: 0.15, base: .bgElevated),
            userInterfaceStyle: .dark
        )

        let differsByRGBComponent =
            abs(light.red - dark.red) > 0.01 ||
            abs(light.green - dark.green) > 0.01 ||
            abs(light.blue - dark.blue) > 0.01

        XCTAssertTrue(differsByRGBComponent)
    }
}
