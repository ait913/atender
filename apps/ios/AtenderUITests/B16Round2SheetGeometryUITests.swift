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

    /// シート内の NavigationStack の nav bar (ホームの nav bar と混ざらないよう identifier で選ぶ)
    private var sheetNavBar: XCUIElement {
        app.navigationBars.matching(NSPredicate(format: "identifier CONTAINS %@", "NavigationStackHosting")).firstMatch
    }

    /// 時間割の設定シートを開いて「シート上端 / 画面高」を返す。閉じずに返す
    private func presentAndMeasure() -> CGFloat? {
        let settings = app.buttons["時間割の設定"].firstMatch
        guard settings.waitForExistence(timeout: 25), settings.isHittable else { return nil }
        settings.tap()
        guard app.buttons["sheet-close"].firstMatch.waitForExistence(timeout: 5),
              sheetNavBar.waitForExistence(timeout: 3) else { return nil }
        let screenHeight = app.windows.firstMatch.frame.height
        guard screenHeight > 0 else { return nil }
        return sheetNavBar.frame.minY / screenHeight
    }

    private func closeSheet() {
        let close = app.buttons["sheet-close"].firstMatch
        if close.exists { close.tap() }
        sleep(2)
    }

    /// [round2 fix3] 同じ短いシートを 3 回 提示しても
    /// 上端が動かない = chrome 実測が提示をまたいで汚染されない
    func testChromeMeasurementIsStableAcrossPresentations() {
        app.launch()
        guard let first = presentAndMeasure() else {
            XCTFail("[round2 fix3] 1 回目の提示でシートを測れない (ハーネスの問題)")
            return
        }
        closeSheet()

        guard let second = presentAndMeasure() else {
            XCTFail("[round2 fix3] 2 回目の提示でシートを測れない")
            return
        }
        closeSheet()

        guard let third = presentAndMeasure() else {
            XCTFail("[round2 fix3] 3 回目の提示でシートを測れない")
            return
        }
        closeSheet()

        let message = "top ratios: 1st=\(first) 2nd=\(second) 3rd=\(third)"
        XCTAssertEqual(second, first, accuracy: 0.01, "[round2 fix3] 2 回目の提示で高さが変わる — \(message)")
        XCTAssertEqual(third, first, accuracy: 0.01,
                       "[round2 fix3] 3 回目の提示で高さが変わる — \(message)")
        // hug していること (短いシートが画面の半分より下から始まる)。
        // chrome を過大に溜めると上端が上がる (= 比が下がる) ので、この閾値が直接の指標になる
        XCTAssertGreaterThan(first, 0.50, "[#M18] 短いシートが hug していない — \(message)")
    }
}
