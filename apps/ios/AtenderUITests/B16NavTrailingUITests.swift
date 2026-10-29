import XCTest

/// build 16 設計 §6.6 (#N1〜#N7) / §6.5 の識別子 (#M4 / #M8) / §6.4 (#D16〜#D22) の
/// 「当たり判定 / 遷移」層。§7.3-c に従い判定は waitForExistence で書き、
/// スクショの byte 一致では判定しない (gotcha/screenshot-byte-identity-…)。
@MainActor
final class B16NavTrailingUITests: XCTestCase {
    let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = true
        app.launchEnvironment["ATENDER_UI_TEST_BEARER_TOKEN"] = "demo-bearer-token-ios-resync-0001"
    }

    private func openTab(_ label: String) -> Bool {
        let tab = app.tabBars.buttons[label].firstMatch
        if tab.waitForExistence(timeout: 20) {
            tab.tap()
            return true
        }
        return false
    }

    /// nav bar より下に同じ文字列の静的テキストが無いこと (= 本文の重複見出しが消えた)
    private func assertNoBodyHeading(_ text: String, tag: String) {
        let bar = app.navigationBars.firstMatch
        let barBottom = bar.exists ? bar.frame.maxY : 120
        let matches = app.staticTexts.matching(NSPredicate(format: "label == %@", text))
        var bodyHits = 0
        for index in 0..<matches.count {
            let element = matches.element(boundBy: index)
            guard element.exists else { continue }
            if element.frame.minY > barBottom + 2 { bodyHits += 1 }
        }
        XCTAssertEqual(bodyHits, 0, "\(tag) 本文に見出し「\(text)」が残っている (barBottom=\(barBottom))")
    }

    // MARK: - 友達 (#N1 / #N2 / #N3)

    func testN1N2N3FriendsTrailingButton() {
        app.launch()
        XCTAssertTrue(openTab("友達"), "友達タブに到達できない (ハーネスの問題)")

        let add = app.buttons["friends-add"]
        XCTAssertTrue(add.waitForExistence(timeout: 15), "[build16 #N2] friends-add が存在しない")
        XCTAssertTrue(add.isHittable, "[build16 #N2] friends-add がタップできない")

        // #N3: 「友達を追加」ラベルを持つボタンは 1 個だけ (全幅ボタンが消えた)
        let labelled = app.buttons.matching(NSPredicate(format: "label == %@", "友達を追加"))
        XCTAssertEqual(labelled.count, 1, "[build16 #N3] 「友達を追加」ボタンが 1 個ではない")
        XCTAssertLessThan(add.frame.minY, 160, "[build16 #N2] friends-add が nav bar の位置に無い")
        XCTAssertLessThan(add.frame.width, 120, "[build16 #N3] friends-add が全幅ボタンのまま")

        assertNoBodyHeading("友達", tag: "[build16 #N1]")

        // #N2 + #M4: 押すと AddFriendSheet が開き、標準の閉じるボタンが居る
        add.tap()
        let close = app.buttons["sheet-close"]
        XCTAssertTrue(close.waitForExistence(timeout: 10), "[build16 #N2/#M4] sheet-close が出ない")
        // §9.1「ScreenshotFlow の tapButton("閉じる") が生きる」= sheet-close 自身のラベルが 閉じる
        XCTAssertEqual(close.label, "閉じる",
                       "[build16 §9.1] sheet-close のラベルが「閉じる」でない (ScreenshotFlow が死ぬ)")
        close.tap()
        XCTAssertFalse(app.buttons["sheet-close"].waitForExistence(timeout: 3),
                       "[build16 #M4] 閉じるボタンでシートが閉じない")
    }

    // MARK: - ルーム (#N4 / #N5 / #N6 / #N7)

    func testN4N5N6N7RoomsTrailingMenu() {
        app.launch()
        let chips = app.descendants(matching: .any)["context-chips"].firstMatch
        XCTAssertTrue(chips.waitForExistence(timeout: 15), "[build16 #N5] context-chips が存在しない")

        let add = app.buttons["rooms-add"]
        XCTAssertTrue(add.waitForExistence(timeout: 15), "[build16 #N5] rooms-add が存在しない")
        // ★ Menu のラベルは isHittable == false と報告される (XCUITest の癖)。
        //   位置と「押したら開く」で担保する。
        XCTAssertTrue(chips.buttons["rooms-add"].waitForExistence(timeout: 10), "[build16 #N5] rooms-add が chip 行の中に無い")
        XCTAssertGreaterThan(add.frame.width, 20, "[build16 #N5] rooms-add に描画サイズが無い")
        XCTAssertEqual(app.buttons.matching(identifier: "rooms-add").count, 1,
                       "[build16 #N5] rooms-add が 1 個ではない")

        // #N6: 「みんなの時間割」への導線が無い
        XCTAssertFalse(app.buttons["rooms-templates"].exists, "[build16 #N6] rooms-templates が残っている")
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "みんなの時間割")).count, 0,
                       "[build16 #N6] 「みんなの時間割」導線が残っている")

        // #N7: メニューに 3 項目、作成からシートが開く
        add.tap()
        let create = app.buttons["ルームを作成"].firstMatch
        let join = app.buttons["リンクで参加"].firstMatch
        let scanQR = app.buttons["QR で参加"].firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 10), "[build16 #N7] 「ルームを作成」が無い")
        XCTAssertTrue(join.exists, "[build16 #N7] 「リンクで参加」が無い")
        XCTAssertTrue(scanQR.exists, "[build16 #N7] 「QR で参加」が無い")
        create.tap()
        XCTAssertTrue(app.buttons["sheet-close"].waitForExistence(timeout: 10),
                      "[build16 #N7] 「ルームを作成」でシートが開かない")
        app.buttons["sheet-close"].tap()
    }

}
