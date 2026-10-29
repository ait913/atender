import XCTest

/// ストア掲載用の素材を、設計書の手順どおりに撮影する。
@MainActor
final class StoreShotsFlow: XCTestCase {
    let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = false
        app.launchEnvironment["ATENDER_UI_TEST_BEARER_TOKEN"] = "store-demo-bearer-token-0001"
    }

    private func snap(_ name: String) {
        let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    /// 要素が現れなければ、対象を明示して撮影を中止する。
    private func waitForElement(_ element: XCUIElement, named name: String,
                                timeout: TimeInterval = 10) -> Bool {
        guard element.waitForExistence(timeout: timeout) else {
            XCTFail("\(timeout)秒以内に「\(name)」が表示されませんでした。")
            return false
        }
        return true
    }

    /// ボタンが存在し、操作可能になるまで待ってからタップする。
    private func tapButton(_ label: String, timeout: TimeInterval = 10) -> Bool {
        tapButton(app.buttons[label].firstMatch, named: label, timeout: timeout)
    }

    private func tapButton(_ button: XCUIElement, named name: String,
                           timeout: TimeInterval = 10) -> Bool {
        let ready = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == true AND hittable == true"),
            object: button
        )
        guard XCTWaiter.wait(for: [ready], timeout: timeout) == .completed else {
            XCTFail("\(timeout)秒以内にボタン「\(name)」が操作可能になりませんでした。")
            return false
        }
        button.tap()
        return true
    }

    func testCaptureStoreShots() {
        // 手順1・2: ホームの出欠タイルを待ち、描画が落ち着いてから撮影する。
        app.launch()
        guard waitForElement(app.buttons["cta-expand-toggle"].firstMatch,
                             named: "cta-expand-toggle") else { return }
        sleep(1)
        snap("s2-home")

        // 手順3・4: 学期全体の出席率を撮影する。
        guard tapButton("学期・科目") else { return }
        guard waitForElement(app.staticTexts["今日までの出席率"].firstMatch,
                             named: "今日までの出席率") else { return }
        sleep(2)
        snap("s1-semester")

        // 手順5: 科目一覧の見出しを画面上部まで移動する。
        let courses = app.staticTexts["科目一覧"].firstMatch
        let targetY = app.frame.height * 0.3
        var swipeCount = 0
        while (!courses.exists || courses.frame.isEmpty || courses.frame.minY >= targetY)
                && swipeCount < 4 {
            app.swipeUp()
            swipeCount += 1
        }
        guard courses.exists, !courses.frame.isEmpty, courses.frame.minY < targetY else {
            XCTFail("4回以内のスクロールで「科目一覧」を画面高の30%より上に移動できませんでした。")
            return
        }
        sleep(1)
        snap("s3-courses")

        // 手順6・7: 公開時間割のカードが表示されてから撮影する。
        guard tapButton("ホーム"),
              tapButton("時間割の設定"),
              tapButton("timetable-settings-import-template") else { return }
        let template = app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier BEGINSWITH %@", "template-card-"))
            .firstMatch
        guard waitForElement(template, named: "template-card-で始まる公開時間割") else { return }
        sleep(2)
        snap("s4-templates")

        // 手順8・9: 再起動でシートを閉じ、ルームの時間割を撮影する。
        app.terminate()
        app.launch()
        let room = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "生わさび"))
            .firstMatch
        guard tapButton(room, named: "生わさびを含むルーム") else { return }
        let timetable = app.descendants(matching: .any)["room-timetable"].firstMatch
        guard waitForElement(timetable, named: "room-timetable") else { return }
        sleep(2)
        snap("s5-room")
    }
}
