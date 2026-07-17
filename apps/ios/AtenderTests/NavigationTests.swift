import UIKit
import XCTest
@testable import Atender

@MainActor
final class NavigationTests: XCTestCase {

    func testMainTabMetadataMatchesWebNavigation() {
        XCTAssertEqual(MainTab.allCases.count, 5)

        XCTAssertEqual(MainTab.home.label, "ホーム")
        XCTAssertEqual(MainTab.home.symbol, "calendar")

        XCTAssertEqual(MainTab.semester.label, "学期・科目")
        XCTAssertEqual(MainTab.semester.symbol, "graduationcap")

        XCTAssertEqual(MainTab.rooms.label, "ルーム")
        XCTAssertEqual(MainTab.rooms.symbol, "person.2")

        XCTAssertEqual(MainTab.friends.label, "友達")
        XCTAssertEqual(MainTab.friends.symbol, "person.crop.circle")

        XCTAssertEqual(MainTab.settings.label, "設定")
        XCTAssertEqual(MainTab.settings.symbol, "gearshape")
    }

    func testAppRouterInitialAndChangedSelectedTab() {
        let router = AppRouter()

        XCTAssertEqual(router.selectedTab, .home)
        router.selectedTab = .rooms
        XCTAssertEqual(router.selectedTab, .rooms)
        router.selectedTab = .settings
        XCTAssertEqual(router.selectedTab, .settings)
    }

    /// [ui-revamp #S10] 全タブの SF Symbol が実在すること。
    /// 設計 F6: `calendar.fill` は存在しない (UIImage(systemName:) が nil) ため
    /// fill 統一は原理的に不可能 → outline 統一。symbol 名の実在を機械的に守る。
    func testAllMainTabSymbolsExistInSFSymbols() {
        for tab in MainTab.allCases {
            XCTAssertNotNil(UIImage(systemName: tab.symbol),
                            "\(tab) の symbol '\(tab.symbol)' が SF Symbols に存在しない")
        }
    }

    /// [ui-revamp #S10] 負の対照 — UIImage(systemName:) が存在しない名前に nil を返す土俵であること。
    /// F6 が名指しした `calendar.fill` の不在をそのまま assert する。
    func testNonexistentSymbolsResolveToNil() {
        XCTAssertNil(UIImage(systemName: "calendar.fill"),
                     "calendar.fill が存在するなら F6 の前提 (fill 統一不可) が崩れる")
        XCTAssertNil(UIImage(systemName: "this.symbol.does.not.exist.xyz"))
    }
}
