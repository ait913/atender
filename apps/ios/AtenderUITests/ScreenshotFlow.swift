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

        // 出欠CTA 展開 (Go Up chevron)
        let upOK = tapButton("Go Up", timeout: 2)
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
}
