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
}
