// build 18 設計 §3/§7.2/§8.1 (#R1-#R8) + §8.5 (#V1-#V3) — ホーム集約 (ユニットで到達できる範囲) + 版数。
// Reviewer 生成 (設計docのみを根拠、実装は未読)。
import Foundation
import UIKit
import XCTest
@testable import Atender

@MainActor
final class B18HomeAndVersionTests: XCTestCase {

    // MARK: - #R1

    func testR1MainTabHasFourCasesInDesignedOrder() {
        XCTAssertEqual(MainTab.allCases.count, 4, "[#R1] MainTab は4 caseのはず (.rooms 廃止)")
        XCTAssertEqual(MainTab.allCases, [.home, .semester, .friends, .settings], "[#R1] 順序が設計と違う")
    }

    // MARK: - #R2

    func testR2TabMetadataUnchangedValues() {
        XCTAssertEqual(MainTab.friends.label, "友達")
        XCTAssertEqual(MainTab.friends.symbol, "person.crop.circle")
        XCTAssertEqual(MainTab.settings.label, "設定")
        XCTAssertEqual(MainTab.settings.symbol, "gearshape")
        for tab in MainTab.allCases {
            XCTAssertNotNil(UIImage(systemName: tab.symbol), "[#R2] \(tab) の symbol '\(tab.symbol)' が SF Symbols に存在しない")
        }
    }

    // MARK: - #R3

    func testR3AppRouterInitialState() {
        let router = AppRouter()
        XCTAssertEqual(router.selectedTab, .home, "[#R3] 初期タブが .home でない")
        XCTAssertNil(router.pendingRoomJoinCode, "[#R3] pendingRoomJoinCode の初期値が nil でない")
        XCTAssertTrue(router.homePath.isEmpty, "[#R3] homePath の初期値が空でない")
    }

    // MARK: - #R4

    func testR4HandleDeepLinkRoomJoinLandsOnHomeRootWithPendingCode() {
        let router = AppRouter()
        router.homePath.append("filler")
        XCTAssertFalse(router.homePath.isEmpty, "[#R4] 前提: homePath に要素を積めていない")

        router.handleDeepLink(URL(string: "atender://rooms/join/ABC")!, canNavigate: true)

        XCTAssertEqual(router.selectedTab, .home, "[#R4] selectedTab が .home でない")
        XCTAssertEqual(router.pendingRoomJoinCode, "ABC", "[#R4] pendingRoomJoinCode に code が入っていない")
        XCTAssertTrue(router.homePath.isEmpty, "[#R4] homePath がホームの root に戻っていない")
    }

    // MARK: - #R5

    func testR5CanNavigateFalseDefersThenApplies() {
        let router = AppRouter()
        let initialTab = router.selectedTab

        router.handleDeepLink(URL(string: "atender://rooms/join/ABC")!, canNavigate: false)

        XCTAssertEqual(router.pendingDeepLink, .roomJoin(code: "ABC"), "[#R5] pendingDeepLink に積まれていない")
        XCTAssertNil(router.pendingRoomJoinCode, "[#R5] canNavigate: false なのに pendingRoomJoinCode が即セットされている")
        XCTAssertEqual(router.selectedTab, initialTab, "[#R5] canNavigate: false なのに selectedTab が変わっている")

        router.applyPendingDeepLinkIfPossible(canNavigate: true)

        XCTAssertEqual(router.selectedTab, .home, "[#R5] 遅延適用後に selectedTab が .home でない")
        XCTAssertEqual(router.pendingRoomJoinCode, "ABC", "[#R5] 遅延適用後に pendingRoomJoinCode が入っていない")
        XCTAssertNil(router.pendingDeepLink, "[#R5] 遅延適用後も pendingDeepLink が残っている")
    }

    // MARK: - #R6

    func testR6FriendAddLinkDoesNotLeakIntoRoomJoinPath() {
        let router = AppRouter()
        router.handleDeepLink(URL(string: "https://atender.appily.run/friends/add/XYZ")!, canNavigate: true)

        XCTAssertEqual(router.selectedTab, .friends, "[#R6] friends deep link で selectedTab が .friends でない")
        XCTAssertEqual(router.friendsPath.count, 1, "[#R6] friendsPath に push されていない")
        XCTAssertNil(router.pendingRoomJoinCode, "[#R6] friends deep link なのに pendingRoomJoinCode が入っている")
    }

    // MARK: - #R7

    func testR7HomeChipsItemsWithNoRoomsStillOnlySelf() {
        let items = HomeChips.items(rooms: [])
        XCTAssertEqual(items.count, 1, "[#R7] ルーム0件で self chip 以外が混ざっている")
        if case .selfChip(let label) = items[0] {
            XCTAssertEqual(label, "自分")
        } else {
            XCTFail("[#R7] 先頭要素が .selfChip(label: \"自分\") でない")
        }
    }

    // MARK: - #R8

    func testR8HomeSheetIdentity() {
        XCTAssertEqual(HomeSheet.roomJoin(initialCode: nil).id, HomeSheet.roomJoin(initialCode: "ABC").id,
                        "[#R8] initialCode の有無で .roomJoin の id (identity) が変わっている")
        XCTAssertEqual(HomeSheet.roomSettings(roomId: "r1").id, "settings:r1", "[#R8] roomSettings の id 形式")
        XCTAssertEqual(HomeSheet.roomCreate.id, "create", "[#R8] roomCreate の id")
    }

    // MARK: - #V1-#V3 (版数)

    private func repoRoot() -> URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { url.deleteLastPathComponent() }   // <file> -> AtenderTests -> ios -> apps -> <root>
        return url
    }

    /// [#V1] project.yml が CFBundleVersion: "18" を含み "17" を含まない。ShortVersion は不変
    func testV1ProjectYmlBundleVersionIs18() throws {
        let yml = try String(contentsOf: repoRoot().appendingPathComponent("apps/ios/project.yml"), encoding: .utf8)
        XCTAssertTrue(yml.contains(#"CFBundleVersion: "18""#), "[#V1] CFBundleVersion: \"18\" が無い")
        XCTAssertFalse(yml.contains(#"CFBundleVersion: "17""#), "[#V1] 旧 build 17 の記述が残っている")
        XCTAssertTrue(yml.contains(#"CFBundleShortVersionString: "1.0""#), "[#V1] ShortVersion が 1.0 でない")
    }

    /// [#V2] MIN_IOS_BUILD (12 のまま) <= CFBundleVersion (18)
    func testV2MinIOSBuildDoesNotExceedBundleVersion() throws {
        let yml = try String(contentsOf: repoRoot().appendingPathComponent("apps/ios/project.yml"), encoding: .utf8)
        let clientVersion = try String(contentsOf: repoRoot().appendingPathComponent("apps/api/src/lib/clientVersion.ts"), encoding: .utf8)

        let versionRegex = try NSRegularExpression(pattern: #"CFBundleVersion:\s*"(\d+)""#)
        let versionMatch = try XCTUnwrap(versionRegex.firstMatch(in: yml, range: NSRange(yml.startIndex..., in: yml)))
        let versionRange = try XCTUnwrap(Range(versionMatch.range(at: 1), in: yml))
        let bundleVersion = try XCTUnwrap(Int(yml[versionRange]))

        let minRegex = try NSRegularExpression(pattern: #"MIN_IOS_BUILD\s*=\s*(\d+)"#)
        let minMatch = try XCTUnwrap(minRegex.firstMatch(in: clientVersion, range: NSRange(clientVersion.startIndex..., in: clientVersion)))
        let minRange = try XCTUnwrap(Range(minMatch.range(at: 1), in: clientVersion))
        let minIOSBuild = try XCTUnwrap(Int(clientVersion[minRange]))

        XCTAssertLessThanOrEqual(minIOSBuild, bundleVersion, "[#V2] MIN_IOS_BUILD (\(minIOSBuild)) が CFBundleVersion (\(bundleVersion)) を超えている")
    }

    /// [#V3] Info.plist は xcodegen 生成物であり CFBundleVersion == "18" (project.yml との手編集ズレが無い)
    func testV3InfoPlistMatchesProjectYmlVersion() throws {
        let plistURL = repoRoot().appendingPathComponent("apps/ios/Atender/Info.plist")
        let data = try Data(contentsOf: plistURL)
        let parsed = try PropertyListSerialization.propertyList(from: data, format: nil)
        let plist = try XCTUnwrap(parsed as? [String: Any], "[#V3] Info.plist が dict でない")
        XCTAssertEqual(plist["CFBundleVersion"] as? String, "18", "[#V3] Info.plist の CFBundleVersion が 18 でない")
    }
}
