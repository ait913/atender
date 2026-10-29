import SwiftUI
import UIKit
import XCTest
@testable import Atender

final class B16SymbolAndTokenTests: XCTestCase {

    func testN9ToolbarSymbolsExist() {
        XCTAssertNotNil(UIImage(systemName: "person.badge.plus"), "[build16 #N9]")
        XCTAssertNotNil(UIImage(systemName: "plus"), "[build16 #N9]")
    }

    private func assertResolvedColor(_ color: UIColor,
                                     equals expected: UIColor,
                                     trait: UITraitCollection,
                                     tag: String) {
        let actualComponents = rgba(color.resolvedColor(with: trait))
        let expectedComponents = rgba(expected.resolvedColor(with: trait))

        XCTAssertEqual(actualComponents.red, expectedComponents.red, accuracy: 0.001, "\(tag) red")
        XCTAssertEqual(actualComponents.green, expectedComponents.green, accuracy: 0.001, "\(tag) green")
        XCTAssertEqual(actualComponents.blue, expectedComponents.blue, accuracy: 0.001, "\(tag) blue")
        XCTAssertEqual(actualComponents.alpha, expectedComponents.alpha, accuracy: 0.001, "\(tag) alpha")
    }

    private func rgba(_ color: UIColor) -> (red: CGFloat, green: CGFloat, blue: CGFloat, alpha: CGFloat) {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return (red, green, blue, alpha)
    }
}
