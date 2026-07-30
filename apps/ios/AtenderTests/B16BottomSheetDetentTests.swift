import SwiftUI
import UIKit
import XCTest
@testable import Atender

final class B16BottomSheetDetentTests: XCTestCase {

    func testM1ModalHeaderTitleFont() throws {
        XCTAssertEqual(ModalHeader.titleFont,
                       Font.atender2xl.weight(.bold),
                       "[build16 #M1]")
    }

    func testConstants() throws {
        XCTAssertEqual(BottomSheetDetent.minHeight, 180, accuracy: 0.0001, "[build16 constants] minHeight")
        XCTAssertEqual(BottomSheetDetent.maxScreenRatio, 0.92, accuracy: 0.0001, "[build16 constants] maxScreenRatio")
        XCTAssertEqual(BottomSheetDetent.bottomInset, 8, accuracy: 0.0001, "[build16 constants] bottomInset")
        XCTAssertEqual(BottomSheetDetent.maxChromeHeight, 160, accuracy: 0.0001, "[build16 constants] maxChromeHeight")
    }

    func testM10ClampChrome() throws {
        XCTAssertEqual(BottomSheetDetent.clampChrome(0), 0, accuracy: 0.0001, "[build16 #M10]")
        XCTAssertEqual(BottomSheetDetent.clampChrome(-5), 0, accuracy: 0.0001, "[build16 #M10]")
        XCTAssertEqual(BottomSheetDetent.clampChrome(.nan), 0, accuracy: 0.0001, "[build16 #M10]")
        XCTAssertEqual(BottomSheetDetent.clampChrome(69), 69, accuracy: 0.0001, "[build16 #M10]")
        XCTAssertEqual(BottomSheetDetent.clampChrome(500), 160, accuracy: 0.0001, "[build16 #M10]")
    }

    func testAdditionalClampChromeBoundaries() throws {
        XCTAssertEqual(BottomSheetDetent.clampChrome(160), 160, accuracy: 0.0001, "[build16 clamp boundary]")
        XCTAssertEqual(BottomSheetDetent.clampChrome(160.5), 160, accuracy: 0.0001, "[build16 clamp boundary]")
    }

    func testM11UnmeasuredChromeFallsBack() throws {
        XCTAssertNil(BottomSheetDetent.fittedHeight(chrome: 0,
                                                    content: 300,
                                                    footer: 0,
                                                    screenHeight: 800,
                                                    isPushed: false),
                     "[build16 #M11]")
    }

    func testM12UnmeasuredContentFallsBack() throws {
        XCTAssertNil(BottomSheetDetent.fittedHeight(chrome: 69,
                                                    content: 0,
                                                    footer: 0,
                                                    screenHeight: 800,
                                                    isPushed: false),
                     "[build16 #M12]")
    }

    func testM13FittedHeightUsesMeasuredParts() throws {
        XCTAssertEqual(try XCTUnwrap(BottomSheetDetent.fittedHeight(chrome: 69,
                                                      content: 200,
                                                      footer: 60,
                                                      screenHeight: 800,
                                                      isPushed: false)),
                       337,
                       accuracy: 0.0001,
                       "[build16 #M13]")
    }

    func testM14FittedHeightAppliesMinimum() throws {
        XCTAssertEqual(try XCTUnwrap(BottomSheetDetent.fittedHeight(chrome: 69,
                                                      content: 20,
                                                      footer: 0,
                                                      screenHeight: 800,
                                                      isPushed: false)),
                       180,
                       accuracy: 0.0001,
                       "[build16 #M14]")
    }

    func testM15FittedHeightAppliesCeiling() throws {
        XCTAssertEqual(try XCTUnwrap(BottomSheetDetent.fittedHeight(chrome: 69,
                                                      content: 2000,
                                                      footer: 0,
                                                      screenHeight: 800,
                                                      isPushed: false)),
                       736,
                       accuracy: 0.0001,
                       "[build16 #M15]")
    }

    func testM16PushedStateUsesCeilingWithoutMeasurements() throws {
        XCTAssertEqual(try XCTUnwrap(BottomSheetDetent.fittedHeight(chrome: 0,
                                                      content: 0,
                                                      footer: 0,
                                                      screenHeight: 800,
                                                      isPushed: true)),
                       736,
                       accuracy: 0.0001,
                       "[build16 #M16]")
    }

    func testM17ZeroScreenHeightReturnsNil() throws {
        XCTAssertNil(BottomSheetDetent.fittedHeight(chrome: 0,
                                                    content: 0,
                                                    footer: 0,
                                                    screenHeight: 0,
                                                    isPushed: true),
                     "[build16 #M17]")
    }

    func testAdditionalFittedHeightAtMinimumBoundary() throws {
        XCTAssertEqual(try XCTUnwrap(BottomSheetDetent.fittedHeight(chrome: 69,
                                                      content: 103,
                                                      footer: 0,
                                                      screenHeight: 800,
                                                      isPushed: false)),
                       180,
                       accuracy: 0.0001,
                       "[build16 fitted boundary]")
    }
}
