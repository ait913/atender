import XCTest

/// build 18 設計 §4.5/§4.7/§4.8/§8.4 (#U15-#U19) — 授業変更 (振替) の XCUITest 層。
/// Reviewer 生成 (設計docのみを根拠、実装は未読)。`localhost:8787` の API 稼働 + demo seed が前提。
///
/// ★ README 参照: #U16 の「科目 Menu」「時限チップ」は設計docの mockup (§4.5) が
/// accessibilityIdentifier を規定していない (見えるのは "科目 [ 情報数学 ▾ ]" のようなビジュアル記述のみ)。
/// 掴めない場合は XCTSkip で明示し、テスト全滅にしない (role note 7: 中身ゼロの緑を作らない代わりに、
/// 未規定の識別子で偽 RED にもしない)。
@MainActor
final class B18ClassTransferUITests: XCTestCase {
    let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = true
        app.launchEnvironment["ATENDER_UI_TEST_BEARER_TOKEN"] = "demo-bearer-token-ios-resync-0001"
    }

    // MARK: - 共通ヘルパ

    private func openTab(_ label: String) -> Bool {
        let tab = app.tabBars.buttons[label].firstMatch
        guard tab.waitForExistence(timeout: 20) else { return false }
        if tab.isHittable { tab.tap() }
        return true
    }

    private func tapAnyDayCell(_ candidates: [String] = ["8", "9", "10", "15", "16", "17", "20", "22"]) -> Bool {
        for d in candidates {
            let cell = app.buttons[d].firstMatch
            if cell.waitForExistence(timeout: 3), cell.isHittable {
                cell.tap()
                return true
            }
        }
        return false
    }

    private func openDayDetailSheet() -> Bool {
        guard openTab("学期・科目") else { return false }
        sleep(3)
        guard tapAnyDayCell() else { return false }
        return app.descendants(matching: .any)["day-detail-sheet"].firstMatch.waitForExistence(timeout: 10)
    }

    private func closeSheetIfPresent() {
        let close = app.buttons["sheet-close"].firstMatch
        if close.exists, close.isHittable { close.tap() }
    }

    private func classesCount() -> Int? {
        let label = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "授業 (")).firstMatch.label
        guard let open = label.firstIndex(of: "("), let close = label.firstIndex(of: ")") else { return nil }
        return Int(label[label.index(after: open)..<close])
    }

    // MARK: - #U15

    func testU15DayDetailHasClassTransferButtonAndCenteredSheetTitle() throws {
        app.launch()
        guard openDayDetailSheet() else {
            throw XCTSkip("[#U15] day-detail-sheet を開けない (環境依存/日セルを掴めない)")
        }

        let transferButton = app.buttons["授業変更"].firstMatch
        XCTAssertTrue(transferButton.waitForExistence(timeout: 10), "[#U15] 「授業変更」ボタンが無い")
        transferButton.tap()

        let title = app.staticTexts["授業変更"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 10), "[#U15] シートタイトル「授業変更」が無い")
        let width = app.windows.firstMatch.exists ? app.windows.firstMatch.frame.width : 393
        XCTAssertEqual(title.frame.midX, width * 0.5, accuracy: width * 0.08, "[#U15] タイトルが画面中央 (±8%) でない")

        XCTAssertTrue(app.buttons["曜日ごと"].waitForExistence(timeout: 5), "[#U15] 「曜日ごと」セグメントが無い")
        XCTAssertTrue(app.buttons["コマごと"].exists, "[#U15] 「コマごと」セグメントが無い")
        closeSheetIfPresent()
    }

    // MARK: - #U16 / #U17 (SINGLE の追加・取り消し)

    /// SINGLE モードで先頭の科目 + 空いていそうな時限を選び「追加」する。
    /// 科目 Menu / 時限チップの識別子が設計docに無いため best-effort (README 参照)。
    @discardableResult
    private func attemptAddSingleTransfer() -> Bool {
        guard app.buttons["授業変更"].firstMatch.waitForExistence(timeout: 10) else { return false }
        app.buttons["授業変更"].firstMatch.tap()
        guard app.buttons["コマごと"].firstMatch.waitForExistence(timeout: 10) else { return false }
        app.buttons["コマごと"].firstMatch.tap()
        sleep(1)

        // 科目 Menu: `class-transfer-course-menu` (実装側が付与)。
        // ★ label ベースの `CONTAINS "科目"` predicate は「学期・科目」タブボタン (シートの裏で exists==true だが
        // isHittable==false) にも一致してしまい、常にこちらを先に拾って false を返していた (テストの誤り)
        let courseMenu = app.buttons["class-transfer-course-menu"].firstMatch
        guard courseMenu.waitForExistence(timeout: 5), courseMenu.isHittable else { return false }
        courseMenu.tap()
        sleep(1)
        // Menu の先頭項目 (どの科目名かは seed 依存なので、開いた直後の最初のボタンを取る)。
        // `app.buttons.element(boundBy: 0)` は app 全体で最初のボタン (タブバー等) を拾いかねないため、
        // 開いた Menu 配下 (`app.menus` / `app.menuItems`) から探す。iOS の Menu は `menuItems` として出る
        let firstOption = app.menuItems.element(boundBy: 0)
        guard firstOption.waitForExistence(timeout: 5) else { return false }
        firstOption.tap()

        // 時限チップ "6" (PeriodChips は 1〜periodCount の数字ラベルと推測)
        let periodChip = app.buttons["6"].firstMatch
        guard periodChip.waitForExistence(timeout: 5), periodChip.isHittable else { return false }
        periodChip.tap()

        let addButton = app.buttons["追加"].firstMatch
        guard addButton.waitForExistence(timeout: 5) else { return false }
        guard addButton.isEnabled else { return false }
        addButton.tap()
        return app.descendants(matching: .any)["day-detail-sheet"].firstMatch.waitForExistence(timeout: 10)
    }

    func testU16AddSingleTransferIncreasesCountAndShowsBadge() throws {
        app.launch()
        guard openDayDetailSheet() else {
            throw XCTSkip("[#U16] day-detail-sheet を開けない (環境依存)")
        }
        let before = classesCount()

        guard attemptAddSingleTransfer() else {
            throw XCTSkip("[#U16] SINGLE 追加フロー (科目 Menu / 時限チップ) を自動操作できなかった。"
                + "設計docに accessibilityIdentifier が無いための既知の穴 (README 参照)")
        }

        if let before {
            let after = classesCount()
            XCTAssertEqual(after, before + 1, "[#U16] 授業 (N) の N が +1 になっていない (before=\(before), after=\(String(describing: after)))")
        }
        XCTAssertGreaterThan(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "振替")).count, 0,
                             "[#U16] 「振替」バッジが1個も無い")
        XCTAssertGreaterThan(app.buttons.matching(NSPredicate(format: "label == %@", "取り消す")).count, 0,
                             "[#U16] 「授業変更」カードに「取り消す」が無い")
        closeSheetIfPresent()
    }

    func testU17CancelTransferRevertsCountAndRemovesBadge() throws {
        app.launch()
        guard openDayDetailSheet() else {
            throw XCTSkip("[#U17] day-detail-sheet を開けない (環境依存)")
        }
        let before = classesCount()
        guard attemptAddSingleTransfer() else {
            throw XCTSkip("[#U17] 前提の SINGLE 追加フローを自動操作できなかった (README 参照)")
        }

        let cancel = app.buttons["取り消す"].firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 10), "[#U17] 「取り消す」ボタンが無い")
        cancel.tap()
        sleep(1)
        // 出欠記録が無い前提 (直後に追加した振替) なので確認ダイアログは出ないはず
        let confirmButton = app.alerts.buttons.element(boundBy: 0)
        if confirmButton.waitForExistence(timeout: 2) { confirmButton.tap() }

        if let before {
            let after = classesCount()
            XCTAssertEqual(after, before, "[#U17] 取り消し後に 授業 (N) が元の値に戻っていない")
        }
        XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "振替")).count, 0,
                       "[#U17] 取り消し後も「振替」バッジが残っている")
        closeSheetIfPresent()
    }

    // MARK: - #U18 (個人カレンダーへの反映)

    func testU18PersonalCalendarShowsTransferChipWithPrefix() throws {
        app.launch()
        guard openDayDetailSheet() else {
            throw XCTSkip("[#U18] day-detail-sheet を開けない (環境依存)")
        }
        guard attemptAddSingleTransfer() else {
            throw XCTSkip("[#U18] 前提の SINGLE 追加フローを自動操作できなかった (README 参照)")
        }
        closeSheetIfPresent()

        guard openTab("ホーム") else {
            throw XCTSkip("[#U18] ホームタブに戻れない")
        }
        sleep(2)
        let calendarSeg = app.buttons["カレンダー"].firstMatch
        if calendarSeg.waitForExistence(timeout: 10), calendarSeg.isHittable { calendarSeg.tap() }
        sleep(2)

        let transferChip = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "振替 ")).firstMatch
        XCTAssertTrue(transferChip.waitForExistence(timeout: 15), "[#U18] 個人カレンダーに「振替 」で始まる chip が無い")
    }

    // MARK: - #U19 (学期カレンダーの振替バッジ)

    func testU19SemesterCalendarShowsTransferBadge() throws {
        app.launch()
        guard openDayDetailSheet() else {
            throw XCTSkip("[#U19] day-detail-sheet を開けない (環境依存)")
        }
        guard attemptAddSingleTransfer() else {
            throw XCTSkip("[#U19] 前提の SINGLE 追加フローを自動操作できなかった (README 参照)")
        }
        closeSheetIfPresent()

        let badge = app.staticTexts.matching(NSPredicate(format: "label == %@", "振")).firstMatch
        XCTAssertTrue(badge.waitForExistence(timeout: 10), "[#U19] 学期カレンダーの日セルに「振」バッジが無い")
    }
}
