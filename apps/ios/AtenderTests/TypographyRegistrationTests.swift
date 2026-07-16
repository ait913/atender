import SwiftUI
import UIKit
import XCTest
@testable import Atender

final class TypographyRegistrationTests: XCTestCase {
    func testRegisteredFontPostScriptNamesResolveWithUIFont() {
        XCTAssertNil(UIFont(name: "ThisFontIsNotRegistered-XYZ", size: 14))

        XCTAssertNotNil(UIFont(name: "Inter-Regular", size: 14))
        XCTAssertNotNil(UIFont(name: "Inter-Medium", size: 14))
        XCTAssertNotNil(UIFont(name: "Inter-SemiBold", size: 14))
        XCTAssertNotNil(UIFont(name: "Inter-Bold", size: 14))
        XCTAssertNotNil(UIFont(name: "Inter-Black", size: 14))

        XCTAssertEqual(UIFont(name: "Inter-Bold", size: 14)?.fontName, "Inter-Bold")

        let mappedWeights: [Font.Weight] = [.regular, .medium, .semibold, .bold, .black, .heavy]
        for weight in mappedWeights {
            XCTAssertNotNil(
                UIFont(name: Font.interPostScriptName(for: weight), size: 14),
                "\(weight) の PostScript 名が未登録"
            )
        }

        XCTAssertEqual(Font.interPostScriptName(for: .light), "Inter-Regular")
        XCTAssertEqual(Font.interPostScriptName(for: .heavy), "Inter-Black")
        XCTAssertEqual(Font.interPostScriptName(for: .semibold), "Inter-SemiBold")

        XCTAssertNotNil(UIFont(name: "NotoSansJP-Thin", size: 14))
        XCTAssertNil(UIFont(name: "NotoSansJP-Regular", size: 14))
    }

    func testUIAppFontsPlistContainsBundledFontFiles() throws {
        guard let fontFiles = Bundle.main.object(forInfoDictionaryKey: "UIAppFonts") as? [String] else {
            throw XCTSkip("Bundle.main から UIAppFonts を取得できないため plist 検査をスキップ")
        }

        let expectedFontFiles = [
            "Inter-Regular.ttf",
            "Inter-Medium.ttf",
            "Inter-SemiBold.ttf",
            "Inter-Bold.ttf",
            "Inter-Black.ttf",
            "NotoSansJP-VariableFont_wght.ttf"
        ]

        XCTAssertEqual(fontFiles.count, 6)
        for file in expectedFontFiles {
            XCTAssertTrue(fontFiles.contains(file), "UIAppFonts に \(file) が含まれていない")
        }
    }
}
