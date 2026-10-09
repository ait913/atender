import XCTest

/// build 20 設計 §13.8 (#S1-#S3)。Reviewer 生成 (設計docのみを根拠、実装は未読)。
/// 前提: `localhost:8787` の API + **各テストの直前に seed-demo-user.ts を再実行** (S2 が削除検証ユーザーを消す)。
/// token: demo-bearer-token-ios-delete-0003
@MainActor
final class B20AccountDeletionUITests: XCTestCase {
    let app = XCUIApplication()
    private let deleteToken = "demo-bearer-token-ios-delete-0003"
    private let loginMarker = "下記のアカウントを使用してログイン"

    override func setUp() {
        continueAfterFailure = true
    }

    private func launch() {
        app.launchEnvironment["ATENDER_UI_TEST_BEARER_TOKEN"] = deleteToken
        app.launch()
    }

    private func anyElement(_ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    /// 設定タブを開き、指定 id の行までスクロールして返す。
    private func openSettingsAndFind(_ rowId: String) -> XCUIElement {
        let tab = app.tabBars.buttons["設定"].firstMatch
        XCTAssertTrue(tab.waitForExistence(timeout: 20), "[#S] 設定タブが無い")
        // 起動直後の最初のタップは落ちることがある (gotcha/xcuitest-first-taps-after-launch-are-lost) → 設定画面の行が出るまで再タップ
        let row = anyElement(rowId)
        for _ in 0..<4 {
            if tab.isHittable { tab.tap() }
            if row.waitForExistence(timeout: 4) { break }
            if anyElement("settings-row-signout").exists { break }
        }
        var swipes = 0
        while (!row.exists || !row.isHittable) && swipes < 8 {
            app.swipeUp()
            swipes += 1
        }
        return row
    }

    /// 行をタップ → 期待要素が出なければ再タップ (最大 3 回)
    private func tapRow(_ row: XCUIElement, until target: XCUIElement) -> Bool {
        for _ in 0..<3 {
            if row.exists, row.isHittable { row.tap() }
            if target.waitForExistence(timeout: 5) { return true }
        }
        return false
    }

    private func tapButtonUntilGone(_ button: XCUIElement, gone: XCUIElement) {
        for attempt in 1...3 {
            guard button.exists else { return }
            button.tap()
            if gone.waitForNonExistence(timeout: 3) { print("TAPINFO attempts=\(attempt)"); return }
        }
    }

    func testS1CancelKeepsAccount() {
        launch()
        let row = openSettingsAndFind("settings-row-delete-account")
        XCTAssertTrue(row.exists, "[#S1] settings-row-delete-account が無い\n\(app.debugDescription)")
        let confirm = app.buttons["削除する"].firstMatch
        XCTAssertTrue(tapRow(row, until: confirm), "[#S1] 確認ダイアログの「削除する」が 5 秒以内に出ない")
        XCTAssertTrue(app.staticTexts["アカウントを削除しますか?"].firstMatch.exists || app.sheets["アカウントを削除しますか?"].exists || app.popovers.firstMatch.exists, "[#S1] タイトルが無い")

        // iOS 26 の confirmationDialog は iPhone でも Popover 表示になり「キャンセル」ボタンが出ない
        // (accessibility は PopoverDismissRegion のみ)。ボタンがあればそれを、無ければ外側タップで閉じる。
        let cancel = app.buttons["キャンセル"].firstMatch
        if cancel.waitForExistence(timeout: 3) {
            print("S1-CANCEL-MODE button")
            tapButtonUntilGone(cancel, gone: confirm)
        } else {
            print("S1-CANCEL-MODE popover-dismiss-region")
            for _ in 0..<3 {
                app.otherElements["PopoverDismissRegion"].firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.95)).tap()
                if confirm.waitForNonExistence(timeout: 3) { break }
            }
        }
        XCTAssertFalse(confirm.exists, "[#S1] キャンセル後もダイアログが残っている")
        XCTAssertTrue(anyElement("settings-row-delete-account").waitForExistence(timeout: 5), "[#S1] キャンセル後に設定へ戻らない")
        XCTAssertFalse(app.staticTexts[loginMarker].firstMatch.exists, "[#S1] キャンセルでログイン画面になっている")
    }

    func testS2DeleteSignsOutAndTokenIsDead() {
        launch()
        let row = openSettingsAndFind("settings-row-delete-account")
        let confirm = app.buttons["削除する"].firstMatch
        XCTAssertTrue(tapRow(row, until: confirm), "[#S2] 確認ダイアログが開かない")
        tapButtonUntilGone(confirm, gone: confirm)

        XCTAssertTrue(app.staticTexts[loginMarker].firstMatch.waitForExistence(timeout: 15), "[#S2] 削除後にログイン画面が出ない")

        app.terminate()
        launch()
        XCTAssertTrue(app.staticTexts[loginMarker].firstMatch.waitForExistence(timeout: 15), "[#S2] 再起動後 (同じ token) にログイン画面が出ない = token が 401 になっていない")
        XCTAssertFalse(app.tabBars.firstMatch.exists, "[#S2] 再起動後にタブバーが出ている (削除されていない)")
    }

    func testS3PrivacyLinkOpensSafari() {
        launch()
        let row = openSettingsAndFind("settings-row-privacy")
        XCTAssertTrue(row.exists, "[#S3] settings-row-privacy が無い")
        row.tap()
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 15), "[#S3] Safari が前面に来ない")
    }
}
