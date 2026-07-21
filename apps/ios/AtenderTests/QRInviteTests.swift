import AVFoundation
import XCTest
@testable import Atender

final class QRInviteTests: XCTestCase {

    func testInviteURLGeneratesRoomAndFriendLinks() {
        // U1
        XCTAssertEqual(
            InviteURL.room(inviteCode: "ABC"),
            "https://atender.appily.run/rooms/join/ABC"
        )

        // U2
        XCTAssertEqual(
            InviteURL.friend(inviteCode: "XYZ"),
            "https://atender.appily.run/friends/add/XYZ"
        )
    }

    func testInviteURLRoundTripsThroughDeepLinkParser() {
        // U3
        XCTAssertEqual(
            DeepLink.parse(URL(string: InviteURL.room(inviteCode: "ABC"))!),
            .roomJoin(code: "ABC")
        )

        // U4
        XCTAssertEqual(
            DeepLink.parse(URL(string: InviteURL.friend(inviteCode: "XYZ"))!),
            .friendAdd(code: "XYZ")
        )
    }

    func testQRCodeGeneratorCreatesImageForValidString() {
        // G1
        let image = QRCodeGenerator.image(from: "https://atender.appily.run/rooms/join/ABC")

        XCTAssertNotNil(image)
        XCTAssertGreaterThan(image?.size.width ?? 0, 0)
        XCTAssertGreaterThan(image?.size.height ?? 0, 0)
    }

    func testQRCodeGeneratorRejectsEmptyString() {
        // G2
        XCTAssertNil(QRCodeGenerator.image(from: ""))
    }

    func testQRCodeGeneratorReturnsDeterministicSizeForSameInput() {
        // G3
        let first = QRCodeGenerator.image(from: "https://atender.appily.run/rooms/join/ABC")
        let second = QRCodeGenerator.image(from: "https://atender.appily.run/rooms/join/ABC")

        XCTAssertNotNil(first)
        XCTAssertEqual(first?.size, second?.size)
    }

    func testQRScanResultAcceptsRoomInviteURL() {
        // S1
        let url = QRScanResult.deepLink(from: "https://atender.appily.run/rooms/join/ABC")

        XCTAssertNotNil(url)
        XCTAssertEqual(url.flatMap(DeepLink.parse), .roomJoin(code: "ABC"))
    }

    func testQRScanResultAcceptsFriendInviteURL() {
        // S2
        let url = QRScanResult.deepLink(from: "https://atender.appily.run/friends/add/XYZ")

        XCTAssertNotNil(url)
        XCTAssertEqual(url.flatMap(DeepLink.parse), .friendAdd(code: "XYZ"))
    }

    func testQRScanResultAcceptsCustomSchemeFriendInviteURL() {
        // S3
        let url = QRScanResult.deepLink(from: "atender://friends/add/XYZ")

        XCTAssertNotNil(url)
        XCTAssertEqual(url.flatMap(DeepLink.parse), .friendAdd(code: "XYZ"))
    }

    func testQRScanResultRejectsInvalidPayloads() {
        // S4
        XCTAssertNil(QRScanResult.deepLink(from: "https://example.com/foo/bar"))

        // S5
        XCTAssertNil(QRScanResult.deepLink(from: "https://atender.appily.run/unknown/path/x"))

        // S6
        XCTAssertNil(QRScanResult.deepLink(from: ""))

        // S7
        XCTAssertNil(QRScanResult.deepLink(from: "ただのテキスト メモ"))
    }

    func testQRScannerStateLogicResolvesSupportedPermissionStates() {
        // V1
        XCTAssertEqual(
            QRScannerStateLogic.resolve(isSupported: true, permission: .authorized),
            .scanning
        )

        // V2
        XCTAssertEqual(
            QRScannerStateLogic.resolve(isSupported: true, permission: .notDetermined),
            .checkingPermission
        )

        // V3
        XCTAssertEqual(
            QRScannerStateLogic.resolve(isSupported: true, permission: .denied),
            .permissionDenied
        )

        // V4
        XCTAssertEqual(
            QRScannerStateLogic.resolve(isSupported: true, permission: .restricted),
            .permissionDenied
        )
    }

    func testQRScannerStateLogicPrioritizesUnsupportedDevices() {
        // V5
        XCTAssertEqual(
            QRScannerStateLogic.resolve(isSupported: false, permission: .authorized),
            .unsupported
        )

        // V6
        XCTAssertEqual(
            QRScannerStateLogic.resolve(isSupported: false, permission: .denied),
            .unsupported
        )
    }
}
