import XCTest

/// build 17 設計 §6.5 (#B45-#B49) / §6.6 (#B52-#B54) の XCUITest 層 +
/// Leader 重点 (ページャ由来の a11y 汚染 / ヘッダー帯がページャの外 / ルーム機能の対応表)。
/// 設計docのみを根拠に記述 (実装は未読)。`localhost:8787` の API 稼働が前提。
@MainActor
final class B17CalendarUITests: XCTestCase {
    let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = true
        app.launchEnvironment["ATENDER_UI_TEST_BEARER_TOKEN"] = "demo-bearer-token-ios-resync-0001"
    }

    // MARK: - 共通ヘルパ

    private var screenWidth: CGFloat {
        let window = app.windows.firstMatch
        return window.exists ? window.frame.width : 393
    }

    private func monthHeaderText() -> String? {
        let query = app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "^[0-9]{4}年\\s?[0-9]{1,2}月$"))
        for index in 0..<query.count {
            let element = query.element(boundBy: index)
            if element.exists { return element.label }
        }
        return nil
    }

    private func dayCells() -> XCUIElementQuery {
        app.buttons.matching(NSPredicate(format: "label MATCHES %@", "^[0-9]{1,2}(、.*)?$"))
    }

    /// ★ ページャの非可視ページも a11y ツリーに出る (#P1 参照) ので、画面内 (0 <= x <= width) の
    ///   セルだけを返す。そうしないと画面外のセルを掴んで "Not hittable" になる
    private func anyDayCell() -> XCUIElement? {
        let query = dayCells()
        let width = screenWidth
        for index in 0..<query.count {
            let element = query.element(boundBy: index)
            guard element.exists, element.frame.height > 40 else { continue }
            guard element.frame.minX >= -1, element.frame.maxX <= width + 1 else { continue }
            return element
        }
        return nil
    }



    private func openTab(_ label: String) -> Bool {
        let tab = app.tabBars.buttons[label].firstMatch
        guard tab.waitForExistence(timeout: 25) else { return false }
        if tab.isHittable { tab.tap() }
        return true
    }

    private func openHomeCalendar() -> Bool {
        let calendar = app.buttons["カレンダー"].firstMatch
        guard calendar.waitForExistence(timeout: 25) else { return false }
        if calendar.isHittable { calendar.tap() }
        sleep(3)
        for attempt in 0..<5 {
            if anyDayCell() != nil { return true }
            if attempt % 2 == 1, calendar.exists, calendar.isHittable { calendar.tap() }
            sleep(3)
        }
        return anyDayCell() != nil
    }

    private func monthNumber(_ text: String) -> Int? {
        let compact = text.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "\u{3000}", with: "")
        let parts = compact.replacingOccurrences(of: "月", with: "").split(separator: "年")
        guard parts.count == 2 else { return nil }
        guard let year = Int(parts[0]), let month = Int(parts[1]) else { return nil }
        return year * 12 + month
    }

    private func openRoomDetail() -> Bool {
        guard openTab("ホーム") else { return false }
        sleep(2)
        let chip = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "情報処理科")).firstMatch
        guard chip.waitForExistence(timeout: 15) else { return false }
        if chip.isHittable { chip.tap() }
        sleep(3)
        return app.descendants(matching: .any)["home-mode-picker"].firstMatch.waitForExistence(timeout: 15)
    }

    // MARK: - #B45 / #B46 月めくり

    /// [#B45] 左スワイプ 2 回・右スワイプ 2 回で、月ヘッダーが 1 ヶ月ずつ動く (2 段飛びしない)
    /// [#B46] スワイプ直後にグリッドが消えない
    func testB45MonthPagerAdvancesOneMonthPerSwipe() throws {
        app.launch()
        XCTAssertTrue(openHomeCalendar(), "[#B45] ホームのカレンダーが開けない (API 停止 = 環境依存)")
        let start = try XCTUnwrap(monthHeaderText(), "[#B45] 月ヘッダーが見つからない")
        var previous = try XCTUnwrap(monthNumber(start), "[#B45] 月ヘッダーが解析できない: \(start)")
        let grid = try XCTUnwrap(anyDayCell(), "[#B45] 日セルが無い")
        let origin = grid.frame

        for step in 1...2 {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0))
                .withOffset(CGVector(dx: 0, dy: origin.midY))
                .press(forDuration: 0.05,
                       thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0))
                        .withOffset(CGVector(dx: 0, dy: origin.midY)))
            usleep(300_000)
            XCTAssertNotNil(anyDayCell(), "[#B46] 左スワイプ \(step) 回目の 0.3 秒後に日セルが 1 つも無い")
            sleep(1)
            let text = try XCTUnwrap(monthHeaderText(), "[#B45] 左スワイプ \(step) 回目で月ヘッダーが消えた")
            let current = try XCTUnwrap(monthNumber(text), "[#B45] 解析できない月: \(text)")
            XCTAssertEqual(current - previous, 1, "[#B45] 左スワイプ \(step) 回目が +1 ヶ月でない (\(previous) -> \(current))")
            previous = current
        }

        for step in 1...2 {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0))
                .withOffset(CGVector(dx: 0, dy: origin.midY))
                .press(forDuration: 0.05,
                       thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0))
                        .withOffset(CGVector(dx: 0, dy: origin.midY)))
            usleep(300_000)
            XCTAssertNotNil(anyDayCell(), "[#B46] 右スワイプ \(step) 回目の 0.3 秒後に日セルが 1 つも無い")
            sleep(1)
            let text = try XCTUnwrap(monthHeaderText(), "[#B45] 右スワイプ \(step) 回目で月ヘッダーが消えた")
            let current = try XCTUnwrap(monthNumber(text), "[#B45] 解析できない月: \(text)")
            XCTAssertEqual(current - previous, -1, "[#B45] 右スワイプ \(step) 回目が -1 ヶ月でない (\(previous) -> \(current))")
            previous = current
        }
    }

    /// [#P1] ページャ由来の a11y 汚染が無い: 「同じ日番号のセル」がツリーに 1 個しか出ない
    /// (49 ページを並べる設計なので、非可視ページを隠していないと同じ番号が何個も出る)
    func testP1PagerDoesNotPolluteAccessibilityTree() throws {
        app.launch()
        XCTAssertTrue(openHomeCalendar(), "[#P1] ホームのカレンダーが開けない (環境依存)")
        for number in ["10", "15", "20"] {
            let query = app.buttons.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@",
                                                         number, number + "、"))
            XCTAssertLessThanOrEqual(query.count, 1,
                                     "[#P1] 日番号 \(number) のセルが \(query.count) 個ある = 非可視ページが a11y ツリーに漏れている")
        }
        let total = dayCells().count
        XCTAssertLessThanOrEqual(total, 42,
                                 "[#P1] 日セルが \(total) 個 (1 ヶ月 42 セルを超える) = 隣接ページが漏れている")
    }

    /// [#P2] 曜日ヘッダー帯はページャの外側: スワイプしても位置が動かない
    func testP2WeekdayHeaderStaysOutsideThePager() throws {
        app.launch()
        XCTAssertTrue(openHomeCalendar(), "[#P2] ホームのカレンダーが開けない (環境依存)")
        let monday = app.staticTexts["月"].firstMatch
        XCTAssertTrue(monday.waitForExistence(timeout: 10), "[#P2] 曜日ヘッダー「月」が見つからない")
        let before = monday.frame
        let grid = try XCTUnwrap(anyDayCell(), "[#P2] 日セルが無い")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0))
            .withOffset(CGVector(dx: 0, dy: grid.frame.midY))
            .press(forDuration: 0.05,
                   thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0))
                    .withOffset(CGVector(dx: 0, dy: grid.frame.midY)))
        sleep(2)
        let after = app.staticTexts["月"].firstMatch.frame
        XCTAssertEqual(before.minX, after.minX, accuracy: 1.0, "[#P2] スワイプで曜日ヘッダーが動いた = ページャの内側にある")
        XCTAssertEqual(before.minY, after.minY, accuracy: 1.0, "[#P2] スワイプで曜日ヘッダーが縦にずれた")
    }

    /// [#P3 / §3.4] 窓の端 (origin−24ヶ月) で `‹` が disabled になる。押しても何も起きない状態を作らない
    func testP3ChevronBecomesDisabledAtWindowEdge() throws {
        app.launch()
        XCTAssertTrue(openHomeCalendar(), "[#P3] ホームのカレンダーが開けない (環境依存)")
        let previous = app.buttons["chevron.left"].firstMatch
        XCTAssertTrue(previous.waitForExistence(timeout: 10), "[#P3] 前の月ボタンが無い")
        XCTAssertTrue(previous.isEnabled, "[#P3] 起点の月で既に disabled になっている")

        let start = try XCTUnwrap(monthHeaderText().flatMap(monthNumber), "[#P3] 月ヘッダーが読めない")
        for _ in 0..<24 {
            guard previous.isEnabled else { break }
            previous.tap()
            usleep(150_000)
        }
        sleep(2)
        let end = try XCTUnwrap(monthHeaderText().flatMap(monthNumber), "[#P3] 月ヘッダーが読めない")
        XCTAssertEqual(start - end, 24, "[#P3] 24 回押して 24 ヶ月戻っていない (\(start) -> \(end))")
        XCTAssertFalse(app.buttons["chevron.left"].firstMatch.isEnabled,
                       "[#P3] 窓の下端 (origin-24ヶ月) で ‹ が disabled になっていない")
        XCTAssertTrue(app.buttons["chevron.right"].firstMatch.isEnabled, "[#P3] 反対側の › まで disabled になっている")
    }

    // MARK: - #B47 / #B48 / #B49 ルーム側

    /// [#B47] ルームの FAB 2 個が消え、ヘッダーの room-ics-import が居る
    func testB47RoomFabsAreGoneAndIcsMovedToHeader() throws {
        app.launch()
        XCTAssertTrue(openRoomDetail(), "[#B47] ルーム詳細に入れない (環境依存)")
        XCTAssertFalse(app.descendants(matching: .any)["room-fab-event"].exists, "[#B47] room-fab-event が残っている")
        XCTAssertFalse(app.descendants(matching: .any)["room-fab-ics"].exists, "[#B47] room-fab-ics が残っている")

        let calendar = app.buttons["カレンダー"].firstMatch
        if calendar.waitForExistence(timeout: 10), calendar.isHittable { calendar.tap() }
        sleep(3)
        let ics = app.descendants(matching: .any)["room-ics-import"].firstMatch
        XCTAssertTrue(ics.waitForExistence(timeout: 10), "[#B47] room-ics-import がヘッダーに無い (§7.1 #1 の ICS 取り込みが失われた)")
    }

    /// [#B48] ルーム詳細のセグメント: 既定は「時間割」、「カレンダー」で月グリッドが出る
    func testB48RoomDetailTabsDefaultToTimetable() throws {
        app.launch()
        XCTAssertTrue(openRoomDetail(), "[#B48] ルーム詳細に入れない (環境依存)")
        let tabs = app.descendants(matching: .any)["home-mode-picker"].firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 15), "[#B48] room-detail-tabs が無い")

        let timetable = app.buttons["時間割"].firstMatch
        XCTAssertTrue(timetable.waitForExistence(timeout: 10), "[#B48] 「時間割」セグメントが無い")
        XCTAssertTrue(timetable.isSelected, "[#B48] 既定選択が「時間割」でない (Home と既定値が揃っていない)")

        let calendar = app.buttons["カレンダー"].firstMatch
        XCTAssertTrue(calendar.exists, "[#B48] 「カレンダー」セグメントが無い")
        if calendar.isHittable { calendar.tap() }
        sleep(3)
        XCTAssertNotNil(anyDayCell(), "[#B48] カレンダーに切り替えても月グリッドが出ない")
    }

    /// [#B49] ルームの日セル長押しで `予定を追加` の editor まで開く (個人と同じ経路 / §7.1 #2 の維持)
    func testB49RoomLongPressOpensEditor() throws {
        app.launch()
        XCTAssertTrue(openRoomDetail(), "[#B49] ルーム詳細に入れない (環境依存)")
        let calendar = app.buttons["カレンダー"].firstMatch
        if calendar.waitForExistence(timeout: 10), calendar.isHittable { calendar.tap() }
        sleep(3)

        // 起動直後の 1〜2 タップは失われる (gotcha/xcuitest-first-taps-after-launch-are-lost)
        var opened = false
        for _ in 0..<4 {
            guard let cell = anyDayCell() else {
                sleep(2)
                continue
            }
            cell.press(forDuration: 0.9)
            if app.staticTexts["予定を追加"].waitForExistence(timeout: 6) {
                opened = true
                break
            }
            sleep(1)
        }
        XCTAssertTrue(opened, "[#B49] ルームの長押しで editor (タイトル「予定を追加」) が開かない")
        XCTAssertTrue(app.textFields.firstMatch.exists, "[#B49] editor にタイトル入力欄が無い")
        XCTAssertTrue(app.descendants(matching: .any)["sheet-close"].exists, "[#B49] モーダルの閉じるボタンが無い")
    }

    /// [#R2 / §7.1 #2] ルームの日セル **タップ**で日別シートが開き、`予定を追加` の導線がある
    func testR2RoomTapOpensDaySheetWithAddAction() throws {
        app.launch()
        XCTAssertTrue(openRoomDetail(), "[#R2] ルーム詳細に入れない (環境依存)")
        let calendar = app.buttons["カレンダー"].firstMatch
        if calendar.waitForExistence(timeout: 10), calendar.isHittable { calendar.tap() }
        sleep(3)

        var opened = false
        for _ in 0..<4 {
            guard let cell = anyDayCell() else {
                sleep(2)
                continue
            }
            cell.tap()
            sleep(2)
            let add = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "予定を追加")).firstMatch
            if add.waitForExistence(timeout: 5) {
                opened = true
                break
            }
        }
        XCTAssertTrue(opened, "[#R2] ルームの日セルタップで日別シートの「予定を追加」導線が出ない (§7.1 #2 が失われた)")
    }

    // MARK: - #B52 / #B53 / #B54 モーダルタイトル

    /// 個人カレンダーの日セル長押し → editor (設計 #B52 の経路)
    private func openPersonalDayEditor() -> Bool {
        guard openHomeCalendar() else { return false }
        for _ in 0..<4 {
            guard let cell = anyDayCell() else {
                sleep(2)
                continue
            }
            cell.press(forDuration: 0.9)
            if app.staticTexts["予定を追加"].waitForExistence(timeout: 6) { return true }
            sleep(1)
        }
        return app.staticTexts["予定を追加"].exists
    }

    /// [#B52] タイトルが中央 (.principal) にあり、幅が 60pt 以上
    /// [#B53] 5 文字が省略されず全部出ている
    func testB52ModalTitleIsCenteredAndWideEnough() throws {
        app.launch()
        XCTAssertTrue(openPersonalDayEditor(), "[#B52] 個人カレンダーの editor が開けない (環境依存)")
        let title = app.staticTexts["予定を追加"].firstMatch
        XCTAssertTrue(title.exists, "[#B53] タイトル「予定を追加」が staticTexts に無い (省略されている)")
        let frame = title.frame
        XCTAssertGreaterThanOrEqual(frame.width, 60,
                                    "[#B52] タイトル幅が 60pt 未満 (\(frame.width)) = topBarLeading の 31pt バジェットに戻っている")
        let ratio = frame.midX / screenWidth
        XCTAssertEqual(ratio, 0.5, accuracy: 0.08,
                       "[#B52] タイトルが中央にない (midX 比 \(ratio) / 画面幅 \(screenWidth))")
    }

    /// [#B52 補] fixedSize() を使っていない: タイトルが toolbar のボタンと重ならない
    func testB52bModalTitleDoesNotOverlapToolbarButtons() throws {
        app.launch()
        XCTAssertTrue(openPersonalDayEditor(), "[#B52] 個人カレンダーの editor が開けない (環境依存)")
        let title = app.staticTexts["予定を追加"].firstMatch
        XCTAssertTrue(title.exists, "[#B52] タイトルが無い")
        let titleFrame = title.frame
        XCTAssertLessThan(titleFrame.width, screenWidth - 60,
                          "[#B52] タイトル幅が画面幅 - 60pt 以上 (\(titleFrame.width)) = fixedSize() 相当に膨らんでいる")

        let bar = app.navigationBars.firstMatch
        guard bar.exists else { return }
        let buttons = bar.buttons
        for index in 0..<buttons.count {
            let button = buttons.element(boundBy: index)
            guard button.exists, button.frame.width > 1 else { continue }
            XCTAssertFalse(button.frame.intersects(titleFrame),
                           "[#B52] タイトルが toolbar ボタン「\(button.label)」と重なっている (fixedSize の症状)")
        }
    }

    /// [#B54] ルームの ICS モーダルのタイトル 10 文字が全部出る
    func testB54RoomIcsModalTitleIsFullyVisible() throws {
        app.launch()
        XCTAssertTrue(openRoomDetail(), "[#B54] ルーム詳細に入れない (環境依存)")
        let calendar = app.buttons["カレンダー"].firstMatch
        if calendar.waitForExistence(timeout: 10), calendar.isHittable { calendar.tap() }
        sleep(3)
        let ics = app.descendants(matching: .any)["room-ics-import"].firstMatch
        XCTAssertTrue(ics.waitForExistence(timeout: 10), "[#B54] room-ics-import が無い")
        if ics.isHittable { ics.tap() }
        sleep(3)
        let title = app.staticTexts["カレンダーを取り込む"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 10), "[#B54] ICS モーダルのタイトル 10 文字が全部出ていない")
        let ratio = title.frame.midX / screenWidth
        XCTAssertEqual(ratio, 0.5, accuracy: 0.08, "[#B54] ICS モーダルのタイトルが中央にない (midX 比 \(ratio))")
    }
}
