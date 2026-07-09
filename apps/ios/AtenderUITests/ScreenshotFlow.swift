import XCTest

/// 検証ハーネス: デモ bearer token で起動し Phase の画面/操作を辿ってスクショを attachment 化。
@MainActor
final class ScreenshotFlow: XCTestCase {
    let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = true
        app.launchEnvironment["ATENDER_UI_TEST_BEARER_TOKEN"] = "demo-bearer-token-ios-resync-0001"
    }

    private func snap(_ name: String) {
        let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    /// button を存在かつ hittable なら tap (hard fail しない)
    @discardableResult
    private func tapButton(_ label: String, timeout: TimeInterval = 3) -> Bool {
        let b = app.buttons[label].firstMatch
        if b.waitForExistence(timeout: timeout), b.isHittable {
            b.tap()
            return true
        }
        return false
    }

    private func tapAt(_ dx: Double, _ dy: Double) {
        app.coordinate(withNormalizedOffset: CGVector(dx: dx, dy: dy)).tap()
    }

    func testPhaseBFlow() {
        app.launch()
        sleep(6)
        snap("01-home-timetable")

        // 表示モード: カレンダーへ
        let calOK = tapButton("カレンダー")
        sleep(3)
        snap("02-home-calendar_ok=\(calOK)")

        // 時間割へ戻す
        tapButton("時間割")
        sleep(2)
        snap("03-home-timetable-again")

        // 授業タップ → 詳細シート
        let meetingOK = tapButton("プログラミング演習")
        sleep(3)
        snap("04-meeting-detail_ok=\(meetingOK)")
        tapAt(0.5, 0.05)   // シート外で閉じる
        sleep(2)

        // 時間割設定シート
        let setOK = tapButton("時間割の設定")
        sleep(2)
        snap("05-timetable-settings_ok=\(setOK)")
        tapAt(0.5, 0.05)
        sleep(2)

        // 出欠CTA 展開 (∧ トグル → 出欠パネル)
        var upOK = false
        let expandToggle = app.buttons["cta-expand-toggle"].firstMatch
        if expandToggle.waitForExistence(timeout: 3), expandToggle.isHittable {
            expandToggle.tap(); upOK = true
        }
        sleep(2)
        snap("06-cta-expanded_ok=\(upOK)")

        // 出欠マーク: 今日は全出席
        let markOK = tapButton("今日は全出席 (1)", timeout: 2)
        sleep(3)
        snap("07-attendance-marked_ok=\(markOK)")

        // 各タブ (プレースホルダ確認)
        var idx = 8
        for label in ["学期・科目", "ルーム", "友達", "設定"] {
            tapButton(label)
            sleep(2)
            snap(String(format: "%02d-tab-", idx) + label)
            idx += 1
        }
    }

    private func dump(_ name: String) {
        let texts = app.staticTexts.allElementsBoundByIndex.prefix(60).map { $0.label }
        let buttons = app.buttons.allElementsBoundByIndex.prefix(60).map { $0.label }
        let d = XCTAttachment(string: "STATICTEXTS:\n" + texts.joined(separator: " | ") + "\n\nBUTTONS:\n" + buttons.joined(separator: " | "))
        d.name = name
        d.lifetime = .keepAlways
        add(d)
    }

    func testCtaExpanded() {
        app.launch()
        sleep(6)
        snap("X00-home-before-expand")
        let toggle = app.buttons["cta-expand-toggle"].firstMatch
        var ok = false
        if toggle.waitForExistence(timeout: 5) {
            toggle.tap(); ok = true
        }
        sleep(2)
        snap("X01-cta-expanded_ok=\(ok)")
        // 一括メニュー (chevron.up.chevron.down) も開く
        let bulk = app.buttons["今日は全出席 (1)"].firstMatch
        _ = bulk
        snap("X02-cta-expanded-again")
    }

    func testFormSheet() {
        app.launch()
        sleep(6)
        tapButton("学期・科目")
        sleep(4)
        var dayOK = false
        for d in ["9", "10", "8"] {
            let db = app.buttons[d].firstMatch
            if db.waitForExistence(timeout: 2) { db.tap(); dayOK = true; break }
        }
        sleep(3)
        snap("F00-day-detail_ok=\(dayOK)")
        // 予定を追加フォーム (テキスト入力を含む BottomSheet)
        let addOK = tapButton("追加", timeout: 3)
        sleep(2)
        snap("F01-personal-event-form_ok=\(addOK)")
    }

    func testDayDetailOnly() {
        app.launch()
        sleep(6)
        tapButton("学期・科目")
        sleep(4)
        var dayOK = false
        for d in ["9", "10", "8", "16"] {
            let db = app.buttons[d].firstMatch
            if db.waitForExistence(timeout: 2) { db.tap(); dayOK = true; break }
        }
        sleep(3)
        snap("D01-day-detail_ok=\(dayOK)")
    }

    func testPhaseCFlow() {
        app.launch()
        sleep(6)
        // 学期・科目タブへ
        tapButton("学期・科目")
        sleep(4)
        snap("C01-semester-overview")
        dump("C00-semester-dump")

        // 科目タップ → CourseDetailModal (ボタンラベルは複合文字列なので CONTAINS で狙う)
        let courseBtn = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "英語")).firstMatch
        var courseOK = false
        if courseBtn.waitForExistence(timeout: 3) { courseBtn.tap(); courseOK = true }
        sleep(3)
        snap("C02-course-detail_ok=\(courseOK)")
        _ = tapButton("閉じる", timeout: 2)
        _ = tapButton("×", timeout: 1)
        tapAt(0.5, 0.03)
        sleep(2)

        // カレンダーの日タップ → DayDetailSheet (auto-scroll で tap、isHittableゲート無し)
        var dayOK = false
        for d in ["9", "10", "8"] {
            let db = app.buttons[d].firstMatch
            if db.waitForExistence(timeout: 2) {
                db.tap(); dayOK = true; break
            }
        }
        sleep(3)
        snap("C03-day-detail_ok=\(dayOK)")
        _ = tapButton("閉じる", timeout: 2)
        tapAt(0.5, 0.03)
        sleep(2)

        // 複数選択モード
        let multiOK = tapButton("複数選択", timeout: 2)
        sleep(2)
        snap("C04-multiselect_ok=\(multiOK)")
    }

    func testPhaseDFlow() {
        app.launch()
        sleep(6)
        // ルームタブ
        tapButton("ルーム")
        sleep(3)
        snap("E01-rooms-list")
        dump("E00-rooms-dump")

        // ルームを開く (CONTAINS でカード)
        let roomBtn = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "情報処理科")).firstMatch
        var roomOK = false
        if roomBtn.waitForExistence(timeout: 3) { roomBtn.tap(); roomOK = true }
        sleep(3)
        snap("E02-room-detail_ok=\(roomOK)")
        // 時間割トグル
        _ = tapButton("時間割", timeout: 2)
        sleep(2)
        snap("E03-room-timetable")
        // 戻る
        tapAt(0.06, 0.05)
        sleep(2)

        // 友達タブ
        tapButton("友達")
        sleep(3)
        snap("E04-friends")
        dump("E04b-friends-dump")
    }
}
