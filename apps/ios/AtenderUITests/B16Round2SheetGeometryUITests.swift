import XCTest

/// build 16 round 2 の負のコントロール用。
/// 対象は §3.4.4 / #M18「短いシートが内容高に hug する」の **提示をまたいだ安定性**。
/// (round 1 の `chromeHeight = max(前回, 今回)` は一度大きく測ると縮まないので、
///  2 回目以降の提示でシートが余分に高くなる = hug が壊れる方向に倒れる)
/// 判定は detent の実測でなく **シート上端 (シート内 nav bar の minY) / 画面高** で見る。
@MainActor
final class B16Round2SheetGeometryUITests: XCTestCase {
    let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = true
        app.launchEnvironment["ATENDER_UI_TEST_BEARER_TOKEN"] = "demo-bearer-token-ios-resync-0001"
    }

    private var daySheetListTitle: XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "^[0-9]+月[0-9]+日.*")).firstMatch
    }

    /// シート内の NavigationStack の nav bar (ホームの nav bar と混ざらないよう identifier で選ぶ)
    private var sheetNavBar: XCUIElement {
        app.navigationBars.matching(NSPredicate(format: "identifier CONTAINS %@", "NavigationStackHosting")).firstMatch
    }

    private func dayCell() -> XCUIElement? {
        let query = app.buttons.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", "15", "15、"))
        for index in 0..<query.count {
            let element = query.element(boundBy: index)
            if element.exists, element.isHittable, element.frame.height > 40, element.frame.width < 80 {
                return element
            }
        }
        return nil
    }

    private func waitForDayCell(attempts: Int = 6) -> XCUIElement? {
        for attempt in 0..<attempts {
            if let cell = dayCell() { return cell }
            let calendar = app.buttons["カレンダー"].firstMatch
            if calendar.exists, calendar.isHittable, attempt % 2 == 1 { calendar.tap() }
            sleep(3)
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

    /// 日別シートを開いて「シート上端 / 画面高」を返す。閉じずに返す
    private func presentAndMeasure(_ cell: XCUIElement, retries: Int = 4) -> CGFloat? {
        for _ in 0..<retries {
            cell.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2)).tap()
            if daySheetListTitle.waitForExistence(timeout: 5) {
                guard sheetNavBar.waitForExistence(timeout: 3) else { return nil }
                let screenHeight = app.windows.firstMatch.frame.height
                guard screenHeight > 0 else { return nil }
                return sheetNavBar.frame.minY / screenHeight
            }
        }
        return nil
    }

    private func closeSheet() {
        let close = app.buttons["sheet-close"].firstMatch
        if close.exists { close.tap() }
        sleep(2)
    }

    /// [round2 fix3] 同じ短いシートを 3 回 (素 / 連続再提示 / editor を push → back → close の後) 提示しても
    /// 上端が動かない = chrome 実測が提示をまたいで汚染されない
    func testChromeMeasurementIsStableAcrossPresentations() {
        app.launch()
        XCTAssertTrue(openHomeCalendar(), "ホームの表示モード切替に到達できない (ハーネスの問題)")
        guard let cell = waitForDayCell() else {
            XCTFail("[round2 fix3] 日セルを掴めない (ハーネスの問題)")
            return
        }

        guard let first = presentAndMeasure(cell) else {
            XCTFail("[round2 fix3] 1 回目の提示でシートを測れない (ハーネスの問題)")
            return
        }
        closeSheet()

        guard let second = presentAndMeasure(cell) else {
            XCTFail("[round2 fix3] 2 回目の提示でシートを測れない")
            return
        }
        // editor を push してから戻して閉じる (push 中は 92% 天井 = 大きい値を経験させる)
        let addButton = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "予定を追加")).firstMatch
        if addButton.waitForExistence(timeout: 5), addButton.isHittable {
            addButton.tap()
            _ = app.staticTexts["予定を追加"].waitForExistence(timeout: 8)
            let back = app.buttons["sheet-back"].firstMatch
            if back.waitForExistence(timeout: 5) { back.tap() }
            _ = daySheetListTitle.waitForExistence(timeout: 8)
        }
        closeSheet()

        guard let third = presentAndMeasure(cell) else {
            XCTFail("[round2 fix3] 3 回目の提示でシートを測れない")
            return
        }
        closeSheet()

        let message = "top ratios: 1st=\(first) 2nd=\(second) 3rd=\(third)"
        XCTAssertEqual(second, first, accuracy: 0.01, "[round2 fix3] 2 回目の提示で高さが変わる — \(message)")
        XCTAssertEqual(third, first, accuracy: 0.01,
                       "[round2 fix3] editor を push した後の再提示で高さが変わる — \(message)")
        // hug していること (短いシートが画面の半分より下から始まる)。
        // chrome を過大に溜めると上端が上がる (= 比が下がる) ので、この閾値が直接の指標になる
        XCTAssertGreaterThan(first, 0.50, "[#M18] 短いシートが hug していない — \(message)")
    }
}
