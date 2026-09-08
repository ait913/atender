import XCTest

/// build 18 設計 §3/§8.1 (#R9-#R17) — ルームタブ廃止 / ホーム集約の XCUITest 層。
/// Reviewer 生成 (設計docのみを根拠、実装は未読)。`localhost:8787` の API 稼働 + demo seed が前提。
@MainActor
final class B18HomeRoomsUITests: XCTestCase {
    let app = XCUIApplication()
    private let demoBearerToken = "demo-bearer-token-ios-resync-0001"

    override func setUp() {
        continueAfterFailure = true
        app.launchEnvironment["ATENDER_UI_TEST_BEARER_TOKEN"] = demoBearerToken
    }

    // MARK: - 共通ヘルパ (既存 UI テストの慣行を踏襲)

    private func waitAny(_ element: XCUIElement, timeout: TimeInterval = 15) -> Bool {
        element.waitForExistence(timeout: timeout)
    }

    /// seed のルームチップ ("情報処理科" を含むラベル)
    private var roomChip: XCUIElement {
        app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "情報処理科")).firstMatch
    }

    private var selfChip: XCUIElement {
        app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "自分")).firstMatch
    }

    private func closeSheetIfPresent() {
        let close = app.buttons["sheet-close"].firstMatch
        if close.exists, close.isHittable { close.tap() }
    }

    // MARK: - #R9

    func testR9TabBarHasFourLabelsAndNoRooms() {
        app.launch()
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(waitAny(tabBar), "[#R9] タブバーが出ない (環境依存の可能性)")

        var labels: Set<String> = []
        let buttons = tabBar.buttons
        for index in 0..<buttons.count {
            let element = buttons.element(boundBy: index)
            if element.exists { labels.insert(element.label) }
        }
        XCTAssertEqual(labels, ["ホーム", "学期・科目", "友達", "設定"], "[#R9] タブラベル集合が設計と違う (実測 \(labels))")
        XCTAssertFalse(labels.contains("ルーム"), "[#R9] 「ルーム」タブが残っている")
    }

    // MARK: - #R10

    func testR10ContextChipsAndAddButtonAlwaysVisible() {
        app.launch()
        let chips = app.descendants(matching: .any)["context-chips"].firstMatch
        XCTAssertTrue(waitAny(chips), "[#R10] context-chips が存在しない")

        let add = app.buttons["rooms-add"].firstMatch
        XCTAssertTrue(waitAny(add, timeout: 10), "[#R10] rooms-add が存在しない")
        XCTAssertEqual(app.buttons.matching(identifier: "rooms-add").count, 1, "[#R10] rooms-add が1個でない")
        XCTAssertGreaterThan(add.frame.width, 20, "[#R10] rooms-add に描画サイズが無い")
    }

    // MARK: - #R11 (ソース走査。§8.1 は XCUITest 節に置くが simulator は不要)

    func testR11HomeChipsIsVisibleGateIsGoneFromSource() throws {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<2 { url.deleteLastPathComponent() }   // <file> を消す → AtenderUITests/ を消す → apps/ios/ (Leader 修正: 3 回では apps/ まで上がる)
        let homeCoreURL = url.appendingPathComponent("Atender/Features/Home/HomeCore.swift")
        let text = try String(contentsOf: homeCoreURL, encoding: .utf8)
        XCTAssertFalse(text.contains("isVisible(rooms:"), "[#R11] HomeCore.swift に isVisible(rooms: の呼び出しが残っている (chip 行が常時表示になっていない)")
    }

    // MARK: - #R12

    func testR12AddButtonMenuOpensCreateSheet() {
        app.launch()
        let add = app.buttons["rooms-add"].firstMatch
        XCTAssertTrue(waitAny(add, timeout: 15), "[#R12] rooms-add が無い")
        add.tap()

        let create = app.buttons["ルームを作成"].firstMatch
        let join = app.buttons["リンクで参加"].firstMatch
        let scanQR = app.buttons["QR で参加"].firstMatch
        XCTAssertTrue(waitAny(create, timeout: 10), "[#R12] 「ルームを作成」が無い")
        XCTAssertTrue(join.exists, "[#R12] 「リンクで参加」が無い")
        XCTAssertTrue(scanQR.exists, "[#R12] 「QR で参加」が無い")

        create.tap()
        let createSheet = app.descendants(matching: .any)["room-create-sheet"].firstMatch
        XCTAssertTrue(waitAny(createSheet, timeout: 10), "[#R12] room-create-sheet が出ない")
        closeSheetIfPresent()
        XCTAssertFalse(app.buttons["sheet-close"].waitForExistence(timeout: 3), "[#R12] sheet-close で閉じない")
    }

    // MARK: - #R13

    func testR13AddButtonMenuJoinByCodeSheet() {
        app.launch()
        let add = app.buttons["rooms-add"].firstMatch
        XCTAssertTrue(waitAny(add, timeout: 15), "[#R13] rooms-add が無い")
        add.tap()
        let join = app.buttons["リンクで参加"].firstMatch
        XCTAssertTrue(waitAny(join, timeout: 10), "[#R13] 「リンクで参加」が無い")
        join.tap()

        let joinSheet = app.descendants(matching: .any)["join-by-code-sheet"].firstMatch
        XCTAssertTrue(waitAny(joinSheet, timeout: 10), "[#R13] join-by-code-sheet が出ない")

        let submit = app.buttons["参加"].firstMatch
        if submit.waitForExistence(timeout: 5) {
            XCTAssertFalse(submit.isEnabled, "[#R13] code 空なのに「参加」が有効になっている")
        }
        closeSheetIfPresent()
    }

    // MARK: - #R14

    func testR14RoomChipShowsGearRoomSettingsSelfChipHidesIt() {
        app.launch()
        XCTAssertTrue(waitAny(roomChip, timeout: 15), "[#R14] 情報処理科チップが無い (seed 前提)")
        roomChip.tap()

        let gear = app.descendants(matching: .any)["home-room-settings"].firstMatch
        XCTAssertTrue(waitAny(gear, timeout: 10), "[#R14] ルーム選択中に home-room-settings が出ない")

        XCTAssertTrue(waitAny(selfChip, timeout: 10), "[#R14] 自分チップが無い")
        selfChip.tap()
        XCTAssertFalse(app.descendants(matching: .any)["home-room-settings"].waitForExistence(timeout: 5),
                       "[#R14] 自分に戻っても home-room-settings が残っている")

        let timetableSettings = app.buttons["時間割の設定"].firstMatch
        XCTAssertTrue(waitAny(timetableSettings, timeout: 10), "[#R14] 自分×時間割で「時間割の設定」が出ない")

        let calendarSeg = app.buttons["カレンダー"].firstMatch
        if calendarSeg.waitForExistence(timeout: 5), calendarSeg.isHittable {
            calendarSeg.tap()
            XCTAssertFalse(app.buttons["時間割の設定"].waitForExistence(timeout: 5),
                           "[#R14] 自分×カレンダーで「時間割の設定」が出ている (歯車なしのはず)")
        }
    }

    // MARK: - #R15

    func testR15RoomSettingsSheetHasMembersAndNameField() {
        app.launch()
        XCTAssertTrue(waitAny(roomChip, timeout: 15), "[#R15] 情報処理科チップが無い")
        roomChip.tap()
        let gear = app.descendants(matching: .any)["home-room-settings"].firstMatch
        XCTAssertTrue(waitAny(gear, timeout: 10), "[#R15] home-room-settings が無い")
        gear.tap()

        let sheet = app.descendants(matching: .any)["room-settings-sheet"].firstMatch
        XCTAssertTrue(waitAny(sheet, timeout: 10), "[#R15] room-settings-sheet が出ない")
        XCTAssertGreaterThan(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "メンバー")).count, 0,
                             "[#R15] 「メンバー」を含む要素が無い")
        XCTAssertGreaterThan(app.textFields.matching(NSPredicate(format: "label CONTAINS %@", "ルーム名")).count
                            + app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "ルーム名")).count, 0,
                             "[#R15] 「ルーム名」の入力/表示が無い")
        closeSheetIfPresent()
    }

    // MARK: - #R16

    func testR16RoomChipCalendarShowsGridAndIcsImportNoRoomDetailTabs() {
        app.launch()
        XCTAssertTrue(waitAny(roomChip, timeout: 15), "[#R16] 情報処理科チップが無い")
        roomChip.tap()

        let picker = app.descendants(matching: .any)["home-mode-picker"].firstMatch
        XCTAssertTrue(waitAny(picker, timeout: 10), "[#R16] home-mode-picker が無い")
        let calendarSeg = app.buttons["カレンダー"].firstMatch
        if calendarSeg.waitForExistence(timeout: 5), calendarSeg.isHittable { calendarSeg.tap() }
        sleep(2)

        let ics = app.descendants(matching: .any)["room-ics-import"].firstMatch
        XCTAssertTrue(waitAny(ics, timeout: 10), "[#R16] room-ics-import がヘッダーに無い")
        XCTAssertFalse(app.descendants(matching: .any)["room-detail-tabs"].exists, "[#R16] room-detail-tabs がどこかに残っている")
    }

    // MARK: - #R17 (deep link 着地。simctl が使えない環境ではベストエフォート)

    func testR17DeepLinkLandsOnHomeWithJoinSheet() throws {
        app.launch()
        XCTAssertTrue(waitAny(app.tabBars.firstMatch, timeout: 15), "[#R17] 起動直後にタブバーが出ない")

        guard let inviteCode = fetchAnyInviteCode() else {
            throw XCTSkip("[#R17] seed のルーム inviteCode を /api/rooms から取得できなかった (環境依存)")
        }

        // iOS の UI テストターゲットには Process が無いので、XCUIApplication.open(_:) (iOS 16.4+) で deep link を開く
        guard let url = URL(string: "atender://rooms/join/\(inviteCode)") else {
            throw XCTSkip("[#R17] deep link URL を組めなかった")
        }
        app.open(url)

        XCTAssertTrue(app.tabBars.buttons["ホーム"].firstMatch.waitForExistence(timeout: 10), "[#R17] deep link 後にホームタブが無い")
        let joinSheet = app.descendants(matching: .any)["join-by-code-sheet"].firstMatch
        XCTAssertTrue(joinSheet.waitForExistence(timeout: 10), "[#R17] deep link 後に join-by-code-sheet が出ない")
    }

    /// `/api/rooms` をブラックボックスで叩き、レスポンス JSON から "inviteCode" キーを再帰的に探す
    /// (DTO の Swift 型を経由しない黒箱 probe。role note 8)
    private func fetchAnyInviteCode() -> String? {
        guard let url = URL(string: "http://localhost:8787/api/rooms") else { return nil }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(demoBearerToken)", forHTTPHeaderField: "Authorization")

        let semaphore = DispatchSemaphore(value: 0)
        var result: Any?
        URLSession.shared.dataTask(with: request) { data, _, _ in
            if let data, let json = try? JSONSerialization.jsonObject(with: data) {
                result = json
            }
            semaphore.signal()
        }.resume()
        _ = semaphore.wait(timeout: .now() + 10)

        return findInviteCode(in: result)
    }

    private func findInviteCode(in value: Any?) -> String? {
        if let dict = value as? [String: Any] {
            if let code = dict["inviteCode"] as? String { return code }
            for v in dict.values {
                if let found = findInviteCode(in: v) { return found }
            }
        } else if let array = value as? [Any] {
            for v in array {
                if let found = findInviteCode(in: v) { return found }
            }
        }
        return nil
    }
}
