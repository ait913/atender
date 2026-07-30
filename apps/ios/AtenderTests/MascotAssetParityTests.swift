import Foundation
import XCTest

/// §3.6.4: iOS asset catalog の mascot-hello-1024.png と web の同名ファイルは「同一ファイル」。
/// 片方だけ差し替えた状態を検出する (穴の判定は両方緑になるので #A1/#A2 では捕まらない)。
final class MascotAssetParityTests: XCTestCase {
    private var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    func testA4bHelloAssetIsByteIdenticalBetweenIOSAndWeb() throws {
        let iosURL = repoRoot.appendingPathComponent(
            "apps/ios/Atender/Assets.xcassets/mascot-hello.imageset/mascot-hello-1024.png")
        let webURL = repoRoot.appendingPathComponent("apps/web/public/character/mascot-hello-1024.png")
        let ios = try Data(contentsOf: iosURL)
        let web = try Data(contentsOf: webURL)
        XCTAssertEqual(
            ios, web,
            "mascot-hello-1024.png must be identical in iOS assets (\(ios.count) bytes) and web public/character (\(web.count) bytes)")
    }
}
