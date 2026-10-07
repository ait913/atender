import XCTest

/// build 19 設計 §8.4 (#S1-#S4)。Reviewer 生成 (設計docのみを根拠、実装は未読)。
/// 前提: `localhost:8787` の API + **各テストの直前に seed-demo-user.ts を再実行** (S1/S2 は seed を書き換える)。
@MainActor
final class B19SemesterRolloverUITests: XCTestCase {
    let app = XCUIApplication()
    private let demoToken = "demo-bearer-token-ios-resync-0001"
    private let endedToken = "demo-bearer-token-ios-ended-0002"

    override func setUp() {
        continueAfterFailure = true
    }

    private func launch(token: String, reset: Bool) {
        app.launchEnvironment["ATENDER_UI_TEST_BEARER_TOKEN"] = token
        if reset { app.launchEnvironment["ATENDER_UI_TEST_RESET_ROLLOVER"] = "1" }
        else { app.launchEnvironment.removeValue(forKey: "ATENDER_UI_TEST_RESET_ROLLOVER") }
        app.launch()
    }

    private func anyElement(_ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    private func textField(labelled name: String) -> XCUIElement {
        let byId = app.textFields[name].firstMatch
        if byId.exists { return byId }
        return app.textFields.containing(NSPredicate(format: "label == %@ OR placeholderValue == %@", name, name)).firstMatch
    }

    /// 起動直後の 1〜2 タップ落ち対策のため、タップ後に期待要素が出なければ再タップする
    private func tapUntil(_ target: XCUIElement, tap: XCUIElement, attempts: Int = 3, timeout: TimeInterval = 5) -> Bool {
        for _ in 0..<attempts {
            if tap.waitForExistence(timeout: 10), tap.isHittable { tap.tap() }
            if target.waitForExistence(timeout: timeout) { return true }
        }
        return false
    }

    /// alert のボタンは 1 回目のタップが落ちることがある (gotcha/xcuitest-first-taps-after-launch-are-lost)。残っていれば再タップ (最大 3 回)
    private func tapAlertButton(_ alert: XCUIElement, _ label: String) {
        for attempt in 1...3 {
            let b = alert.buttons[label]
            guard alert.exists, b.exists else { return }
            b.tap()
            if alert.waitForNonExistence(timeout: 3) { print("TAPINFO \(label) attempts=\(attempt)"); return }
        }
    }

    private func openAddCourseSheetFromCell() {
        let cell = anyElement("timetable-cell-1-1")
        XCTAssertTrue(cell.waitForExistence(timeout: 15), "[#S] timetable-cell-1-1 が無い")
        let title = app.staticTexts["授業を追加"].firstMatch
        XCTAssertTrue(tapUntil(title, tap: cell), "[#S] 「授業を追加」シートが開かない")
        let add = app.buttons["＋ 科目を追加"].firstMatch
        XCTAssertTrue(add.waitForExistence(timeout: 10), "[#S] 「＋ 科目を追加」ボタンが無い")
        add.tap()
        XCTAssertTrue(app.staticTexts["科目を追加"].firstMatch.waitForExistence(timeout: 5),
                      "[#S] ★F3: 「＋ 科目を追加」で科目追加シートが 5 秒以内に開かない")
    }

    // MARK: - #S1
    func testS1CarryOverDisplayAndAddCourseSheetOpens() {
        launch(token: demoToken, reset: false)
        let menu = anyElement("home-semester-menu")
        XCTAssertTrue(menu.waitForExistence(timeout: 20), "[#S1] home-semester-menu が無い")
        // 学期メニューを開いて「次学期」を選ぶ。タップが落ちることがあるので、メニューの label が切り替わるまで最大 3 回
        var switched = false
        for _ in 0..<3 {
            if menu.exists, menu.isHittable { menu.tap() }
            let next = app.buttons["次学期"].firstMatch
            let nextItem = app.menuItems["次学期"].firstMatch
            if next.waitForExistence(timeout: 5) { next.tap() }
            else if nextItem.waitForExistence(timeout: 3) { nextItem.tap() }
            let label = anyElement("home-semester-menu")
            let deadline = Date().addingTimeInterval(8)
            while Date() < deadline, !label.label.contains("次学期") { usleep(300_000) }
            if label.label.contains("次学期") { switched = true; break }
        }
        XCTAssertTrue(switched, "[#S1] 学期メニューで「次学期」に切り替わらない (label: \(anyElement("home-semester-menu").label))")

        XCTAssertTrue(anyElement("timetable-period-4").waitForExistence(timeout: 15), "[#S1] timetable-period-4 が無い (引継ぎ 4 コマ)")
        XCTAssertFalse(anyElement("timetable-period-5").exists, "[#S1] timetable-period-5 が存在する (5 コマ既定に戻っている)")

        openAddCourseSheetFromCell()

        let nameField = textField(labelled: "科目名")
        XCTAssertTrue(nameField.waitForExistence(timeout: 5), "[#S1] 科目名 textField が無い")
        nameField.tap()
        nameField.typeText("テスト科目")
        let save = app.buttons["保存"].firstMatch
        XCTAssertTrue(save.waitForExistence(timeout: 5), "[#S1] 保存ボタンが無い")
        for _ in 0..<3 {
            if save.exists, save.isHittable { save.tap() }
            if app.staticTexts["科目を追加"].firstMatch.waitForNonExistence(timeout: 8) { break }
        }
        XCTAssertTrue(app.staticTexts["科目を追加"].firstMatch.waitForNonExistence(timeout: 20), "[#S1] 保存後も科目追加シートが閉じない")
        let withName = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "テスト科目")).firstMatch
        XCTAssertTrue(withName.waitForExistence(timeout: 5), "[#S1] Menu ラベルに新科目「テスト科目」が反映されない")
        let close = app.buttons["sheet-close"].firstMatch
        if close.exists { close.tap() }
    }

    // MARK: - #S2
    func testS2EndedUserRolloverEndToEnd() {
        launch(token: endedToken, reset: true)
        let alert = app.alerts["前回の学期が終了しました"]
        let t0 = Date()
        let appeared = alert.waitForExistence(timeout: 15)
        if !appeared {
            // 診断: 15 秒を超えて出るのか、そもそも出ないのかを区別する
            let late = alert.waitForExistence(timeout: 45)
            print("ALERT-LATE appearedAfter15=\(late) elapsed=\(Date().timeIntervalSince(t0))")
        }
        XCTAssertTrue(appeared, "[#S2] alert が 15 秒以内に出ない")
        XCTAssertTrue(alert.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "2026 前期")).firstMatch.exists,
                      "[#S2] alert の message に「2026 前期」が無い")
        tapAlertButton(alert, "作成する")
        XCTAssertTrue(anyElement("semester-create-sheet").waitForExistence(timeout: 10), "[#S2] semester-create-sheet が出ない")

        // 期待既定値 (§4.4): previous.endDate = 昨日 → start = 今日 (JST)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let comps = cal.dateComponents([.year, .month], from: Date())
        let expectedName = "\(comps.year!) \((4...9).contains(comps.month!) ? "前期" : "後期")"
        // 外側の identifier "semester-create-sheet" が内側の TextField の label を潰す (設計 §4.3 が予告)。シート内の唯一の TextField = 学期名
        let nameField = app.textFields["semester-create-sheet"].firstMatch
        XCTAssertTrue(nameField.waitForExistence(timeout: 5), "[#S2] 学期名 textField が無い")
        XCTAssertEqual(nameField.value as? String, expectedName, "[#S2] 既定の学期名が §4.4 と違う")

        let create = app.buttons["学期を作成"].firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 5) && create.isEnabled, "[#S2] 学期を作成が無効")
        // 1 回目のタップが落ちることがある → 無効化 (送信中) にもシート消滅にもなっていなければ再タップ
        for attempt in 1...3 {
            create.tap()
            print("TAPINFO 学期を作成 attempt=\(attempt)")
            if anyElement("semester-create-sheet").waitForNonExistence(timeout: 8) { break }
            if !create.exists || !create.isEnabled { break }
        }
        XCTAssertTrue(anyElement("semester-create-sheet").waitForNonExistence(timeout: 30), "[#S2] 学期を作成後もシートが閉じない")

        let menu = anyElement("home-semester-menu")
        XCTAssertTrue(menu.waitForExistence(timeout: 10))
        XCTAssertTrue(menu.label.contains(expectedName), "[#S2] home-semester-menu の label が新学期名でない (実測: \(menu.label))")
        XCTAssertTrue(anyElement("timetable-period-8").waitForExistence(timeout: 15), "[#S2] timetable-period-8 が無い (8 コマ引継ぎ)")
        XCTAssertFalse(anyElement("timetable-period-9").exists)
        XCTAssertTrue(app.staticTexts["土"].firstMatch.exists, "[#S2] 曜日ヘッダ「土」が無い (daysOfWeek 引継ぎ)")

        openAddCourseSheetFromCell()
    }

    // MARK: - #S3
    func testS3DismissIsRemembered() {
        launch(token: endedToken, reset: true)
        let alert = app.alerts["前回の学期が終了しました"]
        XCTAssertTrue(alert.waitForExistence(timeout: 15), "[#S3] alert が出ない")
        tapAlertButton(alert, "あとで")
        XCTAssertTrue(alert.waitForNonExistence(timeout: 5), "[#S3] alert が消えない")

        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertFalse(app.alerts["前回の学期が終了しました"].waitForExistence(timeout: 5), "[#S3] フォアグラウンド復帰で alert が再出現")

        app.terminate()
        launch(token: endedToken, reset: false)
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        XCTAssertFalse(app.alerts["前回の学期が終了しました"].waitForExistence(timeout: 5), "[#S3] 再起動で alert が再出現 (却下が永続化されていない)")
    }

    // MARK: - #S4
    func testS4NoAlertForLiveSemester() {
        launch(token: demoToken, reset: true)
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        XCTAssertFalse(app.alerts.firstMatch.waitForExistence(timeout: 10), "[#S4] 終了していない学期なのに alert が出た")
    }
}
