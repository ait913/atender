import Foundation
import XCTest
@testable import Atender

/// 設計 .designs/20261029-build21-calendar-removal-course-rules-template-import.md
/// §3.1-§3.9 / §7.A (A1-A28 の iOS 項目) / §8.2。設計 doc だけを根拠に書いたテスト (実装は読んでいない)。
/// 純ロジックの契約 (A13/A14/A20/A21/A25/A26/A7/A28) と、ファイル一覧・文字列走査による撤去確認 (A1/A4-A6/A8-A10/A23/A27)。
/// View の挙動 (A2/A3/A24 など) と coordinator の sync/移行の副作用 (A11/A12/A15-A19/A22) は
/// ユニットテストでは到達できない (UITest / 実機ゲート)。
final class B21CalendarRemovalTests: XCTestCase {
    // MARK: - helpers

    private var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // AtenderTests
            .deletingLastPathComponent() // ios
            .deletingLastPathComponent() // apps
            .deletingLastPathComponent() // repo
    }
    private var iosRoot: URL { repoRoot.appendingPathComponent("apps/ios") }
    private var appRoot: URL { iosRoot.appendingPathComponent("Atender") }
    private var testsRoot: URL { iosRoot.appendingPathComponent("AtenderTests") }

    private func exists(_ relative: String, under base: URL? = nil) -> Bool {
        FileManager.default.fileExists(atPath: (base ?? appRoot).appendingPathComponent(relative).path)
    }

    private func swiftFiles(under base: URL) -> [URL] {
        guard let e = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil) else { return [] }
        return (e.allObjects as? [URL] ?? []).filter { $0.pathExtension == "swift" }
    }

    private func read(_ relative: String) throws -> String {
        try String(contentsOf: appRoot.appendingPathComponent(relative), encoding: .utf8)
    }

    /// (相対パス, 行) の一覧。`regex` に一致する行 (除外関数が true を返す行は除く)
    private func hits(_ pattern: String, options: NSRegularExpression.Options = [], skip: (String, String) -> Bool = { _, _ in false }) throws -> [String] {
        let re = try NSRegularExpression(pattern: pattern, options: options)
        var out: [String] = []
        for url in swiftFiles(under: appRoot) {
            let rel = url.path.replacingOccurrences(of: appRoot.path + "/", with: "")
            let text = try String(contentsOf: url, encoding: .utf8)
            for (i, line) in text.components(separatedBy: "\n").enumerated() {
                let r = NSRange(line.startIndex..., in: line)
                if re.firstMatch(in: line, range: r) != nil, !skip(rel, line) {
                    out.append("\(rel):\(i + 1): \(line.trimmingCharacters(in: .whitespaces))")
                }
            }
        }
        return out
    }

    private func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .useDefaultKeys
        return d
    }

    // MARK: - §3.1 ファイル一覧 (削除 / 改名 / 残す)

    func testR1DeletedFilesAreGone() {
        let deleted = [
            "Features/Calendar/CalendarScreen.swift", "Features/Calendar/CalendarMonth.swift",
            "Features/Calendar/CalendarDaySheet.swift", "Features/Calendar/PersonalCalendar.swift",
            "Features/Calendar/PersonalDaySheet.swift", "Features/Calendar/PersonalEventEditor.swift",
            "Features/Calendar/RecurrenceSpecPicker.swift", "Features/Calendar/CalendarSyncBanner.swift",
            "Core/Data/CalendarMonthStore.swift",
            "Core/Timetable/CalendarDaySheetLogic.swift", "Core/Timetable/CalendarMonthLayout.swift",
            "Core/Timetable/CalendarWindow.swift",
            "Features/Rooms/RoomCalendar.swift", "Features/Rooms/RoomDaySheet.swift",
            "Features/Rooms/AvailabilityBar.swift", "Features/Rooms/IcsTitleRuleEditorSheet.swift",
            "Core/Sync/PersonalExportMapping.swift", "Core/Sync/EventKitReconciler.swift",
            "Features/SemesterOverview/BulkAndPersonalEventSheets.swift",
        ]
        for f in deleted {
            XCTAssertFalse(exists(f), "[§3.1] \(f) は削除されているはず")
        }
        XCTAssertFalse(exists("Features/Calendar"), "[A27] Features/Calendar/ ディレクトリが存在しない")
    }

    func testR2RenamedAndKeptFilesExist() {
        XCTAssertTrue(exists("Features/SemesterOverview/BulkEditSheet.swift"), "[§3.1] BulkEditSheet.swift へ改名")
        let kept = [
            "Core/Sync/ExportKey.swift", "Core/Sync/CalendarExportPlanner.swift", "Core/Sync/CourseExportMapping.swift",
            "Core/Sync/AtenderCalendarResolver.swift", "Core/Sync/AtenderCalendarSpec.swift",
            "Core/Sync/EventKitTimeMapping.swift", "Core/Sync/EventKitStore.swift",
            "Core/Sync/CalendarSyncCoordinator.swift", "Core/Sync/CalendarSyncStatus.swift",
            "Core/Sync/CalendarSyncTrigger.swift", "Core/Data/CalendarExportRepository.swift",
            "Features/Settings/CalendarSyncSettingsSheet.swift",
            "Features/Rooms/RoomTimetable.swift", "Features/Rooms/RoomJoinSheets.swift",
            "Features/SemesterOverview/ClassTransferSheet.swift",
        ]
        for f in kept {
            XCTAssertTrue(exists(f), "[§3.1] \(f) は残るはず")
        }
    }

    func testR3NewFilesExist() {
        XCTAssertTrue(exists("Core/Sync/CalendarSyncMigration.swift"), "[§3.3]")
        XCTAssertTrue(exists("Features/Settings/CalendarExportRowLogic.swift"), "[§3.4.1]")
    }

    func testR4DeletedTestFilesAreGone() {
        let deletedTests = [
            "B16CalendarDaySheetLogicTests", "B16CalendarDayStyleTests", "B16CalendarSelectionRenderTests",
            "B17CalendarGridRenderTests", "B17CalendarMonthStoreTests", "B17CalendarScreenLogicTests",
            "B17CalendarWindowTests", "B17GridTokenAndGeometryTests", "CalendarEventDisplayTests",
            "CalendarLaneTests", "CalendarLayoutTests", "CalendarMonthRenderTests", "PersonalCalendarLogicTests",
            "PersonalEventDisplayTests", "MeetingExpansionTests", "B17RoomFeatureParityTests",
            "PersonalEventContractTests", "RecurrenceSpecLogicTests", "PersonalExportMappingTests",
            "EventKitReconcilerTests", "ExportDTODecodingTests",
        ]
        for t in deletedTests {
            XCTAssertFalse(exists("\(t).swift", under: testsRoot), "[§8.2] \(t).swift は削除")
        }
        XCTAssertFalse(exists("B17CalendarUITests.swift", under: iosRoot.appendingPathComponent("AtenderUITests")), "[§8.2]")
    }

    /// 残す書き出しエンジンの既存テストが残存している (vacuous green でない)
    func testR5EngineTestsRemain() {
        for t in ["CalendarExportPlannerTests", "ExportKeyTests", "CourseExportMappingTests", "EventKitTimeMappingTests",
                  "AtenderCalendarResolverTests", "CalendarSyncStatusTests", "CalendarSyncTriggerTests", "B18ExportMappingTests"] {
            XCTAssertTrue(exists("\(t).swift", under: testsRoot), "[§8.2] \(t) は残る")
        }
    }

    // MARK: - A27 ソース走査

    func testA27ForbiddenVocabularyIsGone() throws {
        let pattern = "PersonalEvent|RoomEventDto|IcsImport|eventKitSync|linkedCalendarIds|CalendarModePicker|HomeViewMode|upcomingEvent"
        let found = try hits(pattern) { rel, line in
            // Developer 申し送り + §3.3: 移行で消す UserDefaults キー文字列 1 件だけ許容
            rel == "Core/Sync/CalendarSyncMigration.swift" && line.contains("\"atender.eventkit.linkedCalendarIds\"")
        }
        XCTAssertEqual(found, [], "[A27] 撤去語彙が残っている")
    }

    /// A27 の拡張 (大文字小文字区別なし・DTO/型/リポジトリ名)
    func testA27bRemovedTypeNamesAreGone() throws {
        let names = [
            "RecurrenceEndDto", "RecurrenceSpecDto", "OccurrenceDayDto", "PersonalEventSeriesDto",
            "EventKitSyncEvent", "EventKitSyncInput", "EventKitSyncResponse", "LegacyEkPush", "LegacyEkPushListResponse",
            "RoomEventDto", "CreateRoomEventInput", "UpdateRoomEventInput", "PersonalCalendarShare", "SharePutInput",
            "SharePatchInput", "IcsImportDto", "IcsTitleRuleDto", "IcsUploadResponse",
            "VisibilityMode", "RoomEventSource", "IcsSource", "IcsImportStatus", "IcsMatchType",
            "CalendarEventKind", "CalendarEvent", "MeetingExpansion", "CalendarViewMode", "PersonalEventDisplay",
            "PersonalCalendarLogic", "CalendarLane", "CalendarEventDisplay", "CalendarMonthStore", "CalendarEventOrder",
            "CalendarDaySheetLogic", "CalendarMonthLayout", "CalendarDayStyle", "CalendarWindow",
            "RoomCalendarLogic", "RoomEventTiming", "RoomAvailability", "RecurrencePresetLogic", "RoomCardLogic",
            "TransferDisplay", "PersonalExportMapping", "EventKitReconciler", "EKEventSnapshot",
            "PersonalDaySheetFormat", "PersonalEventTimeMath", "CalendarSyncBanner", "CalendarSyncBannerKind",
            "CalendarSyncBannerLogic", "CalendarSyncWarningButton", "AvailabilityBar", "IcsTitleRuleEditorSheet",
            "RecurrenceSpecPicker", "RecurrencePicker", "IcsImportWizard", "RoomEventEditorContent",
            "PersonalEventRepository", "RoomEventRepository", "IcsImportRepository",
            "personalEventRepository", "roomEventRepository", "icsImportRepository",
        ]
        let pattern = "\\b(" + names.joined(separator: "|") + ")\\b"
        let found = try hits(pattern)
        XCTAssertEqual(found, [], "[§3.1/§3.8] 削除対象の型が残っている")
    }

    func testA27cRemovedCoordinatorMembersAreGone() throws {
        // §3.2: 削除するメンバ。移行関数内のキー文字列 (CalendarSyncMigration.swift) だけ許容
        let pattern = "\\b(exportCourses|exportPersonal|promptDismissed|legacyPushCleanupDone|availableCalendars|cleanUpLegacyPushes|legacyEkPushes|clearLegacyEkPushes|fetchSnapshots|removeEvents)\\b"
        let found = try hits(pattern) { rel, _ in rel == "Core/Sync/CalendarSyncMigration.swift" }
        XCTAssertEqual(found, [], "[§3.2/§3.1] 削除対象メンバが残っている")
    }

    func testA27dRemovedEndpointsAreGone() throws {
        let pattern = "/api/personal-events|/events\\b|ics-imports|ics-title-rules|personal-calendar-share|eventkit-sync|eventkit-legacy-pushes"
        let found = try hits(pattern, options: [.caseInsensitive])
        XCTAssertEqual(found, [], "[§3.1 APIEndpoint] 削除した endpoint のパスが残っている")
    }

    func testA27eNoSyncTriggerCalendarScreen() throws {
        XCTAssertEqual(try hits("calendarScreen"), [], "[§3.1] SyncTrigger.calendarScreen を削除")
    }

    // MARK: - A1 / A4 / A5 / A6 / A7 / A8 / A9 / A10 (UI 文言・id の静的確認)

    func testA1HomeHasNoModePicker() throws {
        XCTAssertEqual(try hits("home-mode-picker"), [], "[A1]")
        XCTAssertEqual(try hits("\\bmode\\s*==\\s*\\.timetable"), [], "[§3.5] 歯車条件から mode が消える")
    }

    func testA3HomeRoomSettingsIdentifierRemains() throws {
        XCTAssertFalse(try hits("home-room-settings").isEmpty, "[A3]")
    }

    func testA4RoomSettingsHasNoShareOrIcsSection() throws {
        let s = try read("Features/Rooms/RoomSheets.swift")
        for w in ["personalCalendarShareSection", "icsSection", "importOpen", "ruleEditorOpen", "shareEnabled", "shareVisibility"] {
            XCTAssertFalse(s.contains(w), "[A4/§3.7] \(w) が残っている")
        }
    }

    func testA5A6DayDetailAndBulkEditHaveNoPersonalEventSection() throws {
        let d = try read("Features/SemesterOverview/DayDetailSheet.swift")
        for w in ["personalEventsSection", "iconButton", ".create", ".edit"] {
            XCTAssertFalse(d.contains(w), "[A5/§3.6] DayDetailSheet に \(w)")
        }
        let b = try read("Features/SemesterOverview/BulkEditSheet.swift")
        for w in ["eventSection", "eventTitle", "addPersonalEvents"] {
            XCTAssertFalse(b.contains(w), "[A6/§3.6] BulkEditSheet に \(w)")
        }
    }

    func testA7SettingsRowAndSection() throws {
        let s = try read("Features/Settings/SettingsView.swift")
        XCTAssertTrue(s.contains("settings-row-calendar"), "[A7] id 維持")
        XCTAssertTrue(s.contains("iPhone カレンダーに書き出す"), "[A7] 行ラベル")
        XCTAssertFalse(s.contains("カレンダー同期"), "[A7] 旧節名「カレンダー同期」は消える")
        XCTAssertFalse(s.contains("case google"), "[§3.4.1] SettingsSheet.google を削除")
    }

    func testA8A9A10ExportSheetStrings() throws {
        let s = try read("Features/Settings/CalendarSyncSettingsSheet.swift")
        for w in ["カレンダーに書き出し", "calendar-export-sheet", "iPhone カレンダーに書き出す", "時間割を書き出す",
                  "iPhone カレンダーから Atender の授業を削除します", "削除する", "iPhone カレンダーから削除しました"] {
            XCTAssertTrue(s.contains(w), "[A8-A10] 「\(w)」が無い")
        }
        for w in ["Atender の予定を書き出す", "iPhone のカレンダーと同期する", "importSection", "linkedBinding",
                  "exportCoursesBinding", "exportPersonalBinding", "reloadCalendars"] {
            XCTAssertFalse(s.contains(w), "[A8/§3.4.2] 「\(w)」が残っている")
        }
    }

    // MARK: - A7 trailingText (§3.4.1)

    func testA7TrailingText() {
        XCTAssertEqual(CalendarExportRowLogic.trailingText(access: .notDetermined, exportEnabled: true), "未設定")
        XCTAssertEqual(CalendarExportRowLogic.trailingText(access: .denied, exportEnabled: true), "未設定")
        XCTAssertEqual(CalendarExportRowLogic.trailingText(access: .restricted, exportEnabled: false), "未設定")
        XCTAssertEqual(CalendarExportRowLogic.trailingText(access: .writeOnly, exportEnabled: true), "未設定")
        XCTAssertEqual(CalendarExportRowLogic.trailingText(access: .fullAccess, exportEnabled: true), "オン")
        XCTAssertEqual(CalendarExportRowLogic.trailingText(access: .fullAccess, exportEnabled: false), "オフ")
    }

    // MARK: - A14 / §3.3 移行の純ロジック

    func testA14ExportEnabledAfterMigration() {
        XCTAssertTrue(CalendarSyncMigration.exportEnabledAfterMigration(current: true, exportCoursesRaw: nil))
        XCTAssertTrue(CalendarSyncMigration.exportEnabledAfterMigration(current: true, exportCoursesRaw: true))
        XCTAssertFalse(CalendarSyncMigration.exportEnabledAfterMigration(current: true, exportCoursesRaw: false))
        XCTAssertFalse(CalendarSyncMigration.exportEnabledAfterMigration(current: false, exportCoursesRaw: nil))
        XCTAssertFalse(CalendarSyncMigration.exportEnabledAfterMigration(current: false, exportCoursesRaw: false))
        XCTAssertFalse(CalendarSyncMigration.exportEnabledAfterMigration(current: false, exportCoursesRaw: true),
                       "current=false は exportCourses が true でも true に戻さない (式は false 以外は current)")
    }

    func testA15ObsoleteKeysAreExactlyTheFive() {
        XCTAssertEqual(CalendarSyncMigration.obsoleteKeys.count, 5, "重複なく 5 本")
        XCTAssertEqual(Set(CalendarSyncMigration.obsoleteKeys), [
            "atender.eventkit.exportCourses",
            "atender.eventkit.exportPersonal",
            "atender.eventkit.linkedCalendarIds",
            "atender.eventkit.promptDismissed",
            "atender.eventkit.legacyPushCleanupDone",
        ])
        XCTAssertFalse(CalendarSyncMigration.obsoleteKeys.contains("atender.eventkit.exportEnabled"), "exportEnabled は消さない")
        XCTAssertFalse(CalendarSyncMigration.obsoleteKeys.contains("atender.eventkit.b21Migrated"), "フラグ自身は消さない")
    }

    // MARK: - A13 旧個人予定の掃除 (planner)

    func testA13PlannerPrunesOnlyLegacyPersonal() {
        let t0 = jstDate("2026-07-23T09:00:00"), t1 = jstDate("2026-07-23T10:30:00")
        func ev(_ key: String?, _ id: String) -> ExportedEvent {
            ExportedEvent(key: key, eventIdentifier: id, title: "x", start: t0, end: t1, isAllDay: false, location: nil, notes: nil)
        }
        let p = ev(ExportKey.personal(seriesId: "s1", occurrenceDate: t0), "ev-p")
        let m = ev(ExportKey.meeting(meetingId: "mt1", date: "2026-07-23", firstPeriodOffset: 0), "ev-m")
        let foreign = ev(nil, "ev-foreign")
        let plan = CalendarExportPlanner.plan(desired: [], existing: [p, m, foreign], prunableKinds: [.personal])
        XCTAssertEqual(plan.deletes, ["ev-p"])
        XCTAssertEqual(plan.creates.count, 0)
        XCTAssertEqual(plan.updates.count, 0)
        XCTAssertEqual(plan.foreign, 1)
    }

    /// A12: hasActiveTimetable == false のときの prunableKinds = {.personal} でも meeting は触らない
    func testA12PersonalAlwaysPrunableMeetingOnlyWhenActive() {
        let t0 = jstDate("2026-07-23T09:00:00"), t1 = jstDate("2026-07-23T10:30:00")
        let mKey = ExportKey.meeting(meetingId: "mt1", date: "2026-07-23", firstPeriodOffset: 0)
        let pKey = ExportKey.personal(seriesId: "s1", occurrenceDate: t0)
        let existing = [mKey, pKey].enumerated().map { i, k in
            ExportedEvent(key: k, eventIdentifier: "ev-\(i)", title: "x", start: t0, end: t1, isAllDay: false, location: nil, notes: nil)
        }
        let inactive = CalendarExportPlanner.plan(desired: [], existing: existing, prunableKinds: [.personal])
        XCTAssertEqual(inactive.deletes, ["ev-1"])
        let active = CalendarExportPlanner.plan(desired: [], existing: existing, prunableKinds: [.meeting, .personal])
        XCTAssertEqual(Set(active.deletes), ["ev-0", "ev-1"])
    }

    // MARK: - A20 / A21

    func testA20WatchedPrefixes() {
        XCTAssertEqual(Set(CalendarSyncTrigger.watchedPrefixes.map { $0.parts }), [
            ["user-timetables"], ["timetable-suspensions"], ["semesters"], ["courses"],
        ])
        XCTAssertEqual(CalendarSyncTrigger.watchedPrefixes.count, 4)
        XCTAssertFalse(CalendarSyncTrigger.isDataChange([QueryKey(["personal-events"])]))
        XCTAssertTrue(CalendarSyncTrigger.isDataChange([QueryKey(["courses"])]))
    }

    func testA21NetworkErrorMessage() {
        XCTAssertEqual(CalendarSyncError.network("timeout").message, "時間割を取得できませんでした（timeout）")
    }

    // MARK: - A23 project.yml

    func testA23UsageDescription() throws {
        let yml = try String(contentsOf: iosRoot.appendingPathComponent("project.yml"), encoding: .utf8)
        let expected = "時間割の授業を「Atender」カレンダーに書き出し、休講や振替に合わせて書き出した予定を更新・削除するために、カレンダーへのアクセスを使用します。"
        XCTAssertTrue(yml.contains("NSCalendarsFullAccessUsageDescription: \"\(expected)\""))
        XCTAssertFalse(yml.contains("読み込"), "[A23] 読み込みの語が無い")
        XCTAssertFalse(yml.contains("NSCalendarsWriteOnlyAccessUsageDescription"))
        // 生成物 (xcodegen 後の Info.plist) も同じ文言
        let plistURL = appRoot.appendingPathComponent("Info.plist")
        if let data = try? Data(contentsOf: plistURL),
           let plist = try PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any] {
            XCTAssertEqual(plist["NSCalendarsFullAccessUsageDescription"] as? String, expected)
            XCTAssertNil(plist["NSCalendarsWriteOnlyAccessUsageDescription"])
        }
    }

    // MARK: - A25 / A26 / §3.8 DTO

    func testA25DayDetailIgnoresPersonalEventsKey() throws {
        let json = """
        {"date":"2026-06-09","occurrences":[],"courseSuspensions":[],"timetableSuspension":null,
         "personalEvents":[{"id":"x","title":"y","unknown":1}]}
        """
        let dto = try decoder().decode(DayDetailDto.self, from: Data(json.utf8))
        XCTAssertEqual(dto.date, "2026-06-09")
        XCTAssertFalse(Mirror(reflecting: dto).children.contains { $0.label == "personalEvents" }, "フィールド自体が無い")
    }

    func testA26RoomWeekIgnoresRoomEventsAndDefaultsRecurring() throws {
        let json = """
        {"weekStart":"2026-07-13","weekEnd":"2026-07-19","members":[],"meetings":[],"roomEvents":[{"id":"e1"}]}
        """
        let dto = try decoder().decode(RoomWeekDto.self, from: Data(json.utf8))
        XCTAssertEqual(dto.recurringMeetings.count, 0, "[A26] recurringMeetings 欠落は []")
        XCTAssertFalse(Mirror(reflecting: dto).children.contains { $0.label == "roomEvents" })
        // memberwise init も roomEvents 引数なし
        let built = RoomWeekDto(weekStart: "a", weekEnd: "b", members: [], meetings: [], recurringMeetings: [])
        XCTAssertEqual(built.weekStart, "a")
    }

    func testA26bRoomSummaryIgnoresUpcomingEvent() throws {
        let data = try loadFixtureData("roomSummary")
        let obj = try JSONSerialization.jsonObject(with: data)
        XCTAssertNotNil(obj)
        _ = try decoder().decode(RoomSummaryDto.self, from: data)
        let dto = try decoder().decode(RoomSummaryDto.self, from: data)
        XCTAssertFalse(Mirror(reflecting: dto).children.contains { $0.label == "upcomingEvent" })
    }

    private func loadFixtureData(_ name: String) throws -> Data {
        let bundle = Bundle(for: type(of: self))
        guard let url = bundle.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
            ?? bundle.url(forResource: name, withExtension: "json") else {
            throw XCTSkip("Fixture \(name).json が無い")
        }
        return try Data(contentsOf: url)
    }

    // MARK: - A28 / §3.4.1

    func testA28DeleteAccountMessage() {
        let m = SettingsLogic.deleteAccountMessage
        XCTAssertEqual(m, "時間割・出欠・友達などのデータはすべて直ちに削除され、元に戻せません。作成したルームは他のメンバーに引き継がれます。公開した時間割テンプレートは、作成者を伏せて残ります。")
        XCTAssertFalse(m.contains("予定"))
    }
}
