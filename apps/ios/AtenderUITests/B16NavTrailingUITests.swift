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

    /// 月カレンダーの日セル (ラベルは "15" または "15、予定名" の複合)
    private func dayCell(matching prefixes: [String]) -> XCUIElement? {
        for prefix in prefixes {
            let query = app.buttons.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@",
                                                         prefix, prefix + "、"))
            for index in 0..<query.count {
                let element = query.element(boundBy: index)
                if element.exists, element.isHittable, element.frame.height > 40 {
                    return element
                }
            }
        }
        return nil
    }

    private func openHomeCalendar() -> Bool {
        let calendar = app.buttons["カレンダー"].firstMatch
        guard calendar.waitForExistence(timeout: 25) else { return false }
        if calendar.isHittable { calendar.tap() }
        sleep(3)
        return true
    }

    /// 月グリッドが出るまで粘る (データ読込のタイミングで 1 回目のトグルが空振りすることがある)
    private func waitForDayCell(_ prefixes: [String], attempts: Int = 5) -> XCUIElement? {
        for attempt in 0..<attempts {
            if let cell = dayCell(matching: prefixes) { return cell }
            let calendar = app.buttons["カレンダー"].firstMatch
            if calendar.exists, calendar.isHittable, attempt % 2 == 1 { calendar.tap() }
            sleep(3)
        }
        return dayCell(matching: prefixes)
    }


    /// 日別シート (一覧ページ) が出ているか。★ 設計 §5.2 の `calendar-day-sheet` は
    /// アクセシビリティツリーに出ないので (adapter 側の identifier が上書き)、
    /// nav bar のタイトル (「7月15日 (水)」形式) で判定する。
    private var daySheetListTitle: XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "^[0-9]+月[0-9]+日.*")).firstMatch
    }


    /// 指定の予定名を chip に持つ日セル (当月内)。ラベルは "30、データベース、バイト" のような複合
    private func waitForEventDayCell(containing needle: String, attempts: Int = 5) -> XCUIElement? {
        for attempt in 0..<attempts {
            let query = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", needle))
            for index in 0..<query.count {
                let element = query.element(boundBy: index)
                if element.exists, element.isHittable, element.frame.height > 40, element.frame.width < 80 {
                    return element
                }
            }
            let calendar = app.buttons["カレンダー"].firstMatch
            if calendar.exists, calendar.isHittable, attempt % 2 == 1 { calendar.tap() }
            sleep(3)
        }
        return nil
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
        XCTAssertTrue(openTab("ルーム"), "ルームタブに到達できない (ハーネスの問題)")

        let add = app.buttons["rooms-add"]
        XCTAssertTrue(add.waitForExistence(timeout: 15), "[build16 #N5] rooms-add が存在しない")
        // ★ Menu のラベルは isHittable == false と報告される (XCUITest の癖)。
        //   位置と「押したら開く」で担保する。
        XCTAssertLessThan(add.frame.minY, 160, "[build16 #N5] rooms-add が nav bar の位置に無い")
        XCTAssertGreaterThan(add.frame.width, 20, "[build16 #N5] rooms-add に描画サイズが無い")
        XCTAssertEqual(app.buttons.matching(identifier: "rooms-add").count, 1,
                       "[build16 #N5] rooms-add が 1 個ではない")

        // #N6: 「みんなの時間割」への導線が無い
        XCTAssertFalse(app.buttons["rooms-templates"].exists, "[build16 #N6] rooms-templates が残っている")
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "みんなの時間割")).count, 0,
                       "[build16 #N6] 「みんなの時間割」導線が残っている")

        assertNoBodyHeading("ルーム", tag: "[build16 #N4]")

        // #N7: メニューに 2 項目、それぞれシートが開く
        add.tap()
        let create = app.buttons["ルームを作成"].firstMatch
        let join = app.buttons["リンクで参加"].firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 10), "[build16 #N7] 「ルームを作成」が無い")
        XCTAssertTrue(join.exists, "[build16 #N7] 「リンクで参加」が無い")
        create.tap()
        XCTAssertTrue(app.buttons["sheet-close"].waitForExistence(timeout: 10),
                      "[build16 #N7] 「ルームを作成」でシートが開かない")
        app.buttons["sheet-close"].tap()
    }

    // MARK: - 日別シート (#D16 / #D20 / #M8)

    func testD16D20DaySheetOpensFromDayCell() {
        app.launch()
        XCTAssertTrue(openHomeCalendar(), "ホームの表示モード切替に到達できない (ハーネスの問題)")

        guard let cell = waitForDayCell(["15", "16", "17", "10", "20"]) else {
            XCTFail("[build16 #D16] 日セルを掴めない (ハーネスの問題)")
            return
        }
        cell.tap()

        // #D16: ヘッダのタイトルが "7月15日 (水)" 形式
        XCTAssertTrue(daySheetListTitle.waitForExistence(timeout: 10),
                      "[build16 #D16] 日セル tap で日別シート (日付見出し) が出ない")
        XCTAssertTrue(app.buttons["sheet-close"].waitForExistence(timeout: 5),
                      "[build16 #D16/#M4] sheet-close が無い")

        // #M8: 1 段目には back が出ない
        XCTAssertFalse(app.buttons["sheet-back"].exists, "[build16 #M8] 一覧 (1 段目) に戻るボタンが出ている")

        // 授業行は非タップ (StaticText)、予定セクションは常に出る
        XCTAssertGreaterThan(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "予定 (")).count, 0,
                             "[build16 #D6] 予定セクションが無い")

        // #D20: ✕ 1 回でシート全体が閉じる
        app.buttons["sheet-close"].firstMatch.tap()
        XCTAssertFalse(app.buttons["sheet-close"].waitForExistence(timeout: 3),
                       "[build16 #D20] ✕ でシートが閉じない")
    }

    /// ★ 設計 §5.2 / §7.3-c が検証フックとして名指しした identifier が実際に掴めるか
    func testDesignIdentifiersOnDaySheetAreReachable() {
        app.launch()
        XCTAssertTrue(openHomeCalendar(), "ホームの表示モード切替に到達できない (ハーネスの問題)")
        guard let cell = waitForDayCell(["15", "16", "17", "10", "20"]) else {
            XCTFail("識別子検証: 日セルを掴めない (ハーネスの問題)")
            return
        }
        cell.tap()
        XCTAssertTrue(daySheetListTitle.waitForExistence(timeout: 10), "識別子検証: シートが開かない")

        XCTAssertGreaterThan(app.descendants(matching: .any).matching(identifier: "calendar-day-sheet").count, 0,
                             "[build16 §5.2] calendar-day-sheet がアクセシビリティツリーに無い")
        XCTAssertGreaterThan(app.descendants(matching: .any).matching(identifier: "day-sheet-add").count, 0,
                             "[build16 §5.2] day-sheet-add がアクセシビリティツリーに無い")
    }

    /// #D17 長押しで editor から開く / #M6 back で一覧に戻る / #M8 の対
    func testD17LongPressOpensEditorAndBackReturnsToList() {
        app.launch()
        XCTAssertTrue(openHomeCalendar(), "ホームの表示モード切替に到達できない (ハーネスの問題)")

        guard let cell = waitForDayCell(["15", "16", "17", "10", "20"]) else {
            XCTFail("[build16 #D17] 日セルを掴めない (ハーネスの問題)")
            return
        }
        cell.press(forDuration: 1.0)

        let title = app.staticTexts["予定を追加"]
        XCTAssertTrue(title.waitForExistence(timeout: 10),
                      "[build16 #D17] 長押しで editor (予定を追加) から開かない")

        // iOS 18.2 では自前 back (sheet-back)。iOS 26 はシステム back なのでこの assert は 18.2 専用
        let back = app.buttons["sheet-back"].firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 5), "[build16 #M6] 自前 back (sheet-back) が無い")
        back.tap()
        XCTAssertTrue(daySheetListTitle.waitForExistence(timeout: 8),
                      "[build16 #D18] back で一覧に戻らない")
        XCTAssertFalse(app.staticTexts["予定を追加"].exists, "[build16 #D18] editor が残っている")
        app.buttons["sheet-close"].firstMatch.tap()
    }

    /// #D21 room の日セル tap で日別シートが開く
    func testD21RoomDayCellOpensDaySheet() {
        app.launch()
        XCTAssertTrue(openTab("ルーム"), "ルームタブに到達できない (ハーネスの問題)")

        let card = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "情報処理科")).firstMatch
        guard card.waitForExistence(timeout: 15) else {
            XCTFail("[build16 #D21] ルームカードを掴めない (ハーネス/データの問題)")
            return
        }
        card.tap()
        sleep(3)

        let calendarSegment = app.buttons["カレンダー"].firstMatch
        if calendarSegment.waitForExistence(timeout: 8), calendarSegment.isHittable {
            calendarSegment.tap()
            sleep(3)
        }

        guard let cell = waitForDayCell(["15", "16", "17", "10", "20"]) else {
            XCTFail("[build16 #D21] ルームの日セルを掴めない (ハーネスの問題)")
            return
        }
        cell.tap()
        XCTAssertTrue(daySheetListTitle.waitForExistence(timeout: 10),
                      "[build16 #D21] room の日セル tap で日別シートが開かない")
        let close = app.buttons["sheet-close"].firstMatch
        XCTAssertTrue(close.waitForExistence(timeout: 5), "[build16 #D21] sheet-close が無い")
        close.tap()
    }

    /// #D18 予定行の tap で editor が push され、back で戻る (デモの 7/30 に「バイト」がある日を使う)
    func testD18EventRowTapPushesEditor() {
        app.launch()
        XCTAssertTrue(openHomeCalendar(), "ホームの表示モード切替に到達できない (ハーネスの問題)")

        guard let cell = waitForEventDayCell(containing: "バイト") else {
            XCTFail("[build16 #D18] 予定 chip を持つ日セルを掴めない (ハーネス/データの問題)")
            return
        }
        cell.tap()
        XCTAssertTrue(daySheetListTitle.waitForExistence(timeout: 10), "[build16 #D18] シートが開かない")

        let row = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "バイト")).firstMatch
        guard row.waitForExistence(timeout: 5) else {
            XCTFail("[build16 #D18] 予定行が Button として出ていない (デモデータ or 非タップ化)")
            return
        }
        row.tap()
        XCTAssertTrue(app.staticTexts["予定を編集"].waitForExistence(timeout: 8),
                      "[build16 #D18] 行 tap で editor (予定を編集) が push されない")
        let back = app.buttons["sheet-back"].firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 5), "[build16 #M6] sheet-back が無い")
        back.tap()
        XCTAssertTrue(daySheetListTitle.waitForExistence(timeout: 8), "[build16 #D18] back で一覧に戻らない")
        app.buttons["sheet-close"].firstMatch.tap()
    }

    /// #D25 当月外の日 (グリッド先頭行) を tap → 再取得後にシートが開く
    func testD25OutsideMonthDayOpensSheetAfterReload() {
        app.launch()
        XCTAssertTrue(openHomeCalendar(), "ホームの表示モード切替に到達できない (ハーネスの問題)")
        guard waitForDayCell(["15", "16", "17"]) != nil else {
            XCTFail("[build16 #D25] 月グリッドが出ない (ハーネスの問題)")
            return
        }
        // 先頭行の当月外セルを y 座標で選ぶ (最初の行に居る = 当月外)
        let query = app.buttons.matching(NSPredicate(format: "label MATCHES %@", "^[0-9]{1,2}(、.*)?$"))
        var topRowY = CGFloat.greatestFiniteMagnitude
        for index in 0..<query.count {
            let element = query.element(boundBy: index)
            guard element.exists, element.frame.height > 40 else { continue }
            topRowY = min(topRowY, element.frame.minY)
        }
        var outside: XCUIElement?
        for index in 0..<query.count {
            let element = query.element(boundBy: index)
            guard element.exists, element.frame.height > 40 else { continue }
            if abs(element.frame.minY - topRowY) < 2, element.isHittable {
                outside = element
                break
            }
        }
        guard let cell = outside else {
            XCTFail("[build16 #D25] 先頭行のセルを掴めない (ハーネスの問題)")
            return
        }
        cell.tap()
        XCTAssertTrue(daySheetListTitle.waitForExistence(timeout: 12),
                      "[build16 #D25] 当月外の日 tap でシートが開かない (label=\(cell.label))")
        app.buttons["sheet-close"].firstMatch.tap()
    }

    /// #H3 予定 chip の真上をタップしても chip がタップを食わず、その日の日別シートが開く
    ///
    /// ★ この sim では「読み込み直後の最初の 1〜2 タップが失われる」ため、
    ///   まず日番号の帯 (dy=0.2) を対照として retry で開き (= セルが押せることの証明 + 空振り消費)、
    ///   そのうえで chip 帯 (dy=0.85) を **1 回** タップして判定する。
    ///   対照が通って subject が落ちたときだけ「chip がタップを食っている」と言える。
    func testH3ChipAreaTapOpensDaySheet() {
        app.launch()
        XCTAssertTrue(openHomeCalendar(), "ホームの表示モード切替に到達できない (ハーネスの問題)")
        guard let cell = waitForEventDayCell(containing: "バイト") else {
            XCTFail("[build16 #H3] 予定 chip を持つ日セルを掴めない (ハーネス/データの問題)")
            return
        }

        // 対照: 日番号の帯をタップすればシートが開く (最初の空振りを吸収するため最大 4 回)
        var controlOpened = false
        for _ in 0..<4 {
            cell.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2)).tap()
            if daySheetListTitle.waitForExistence(timeout: 4) {
                controlOpened = true
                break
            }
        }
        XCTAssertTrue(controlOpened, "[build16 #H3] 対照 (日番号の帯) でもシートが開かない = ハーネスの問題")
        let close = app.buttons["sheet-close"].firstMatch
        if close.exists { close.tap() }
        sleep(2)

        // subject: chip が並ぶ帯を 1 回タップ
        cell.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85)).tap()
        XCTAssertTrue(daySheetListTitle.waitForExistence(timeout: 10),
                      "[build16 #H3] chip の上をタップすると日別シートが開かない (chip がタップを食っている)")
        let close2 = app.buttons["sheet-close"].firstMatch
        if close2.exists { close2.tap() }
    }
}
