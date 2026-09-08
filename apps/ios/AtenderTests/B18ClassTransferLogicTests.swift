// build 18 設計 §4/§6/§7.3/§8.3(#T6 iOS 側)/§8.4 (#U1-#U14) — 授業変更 (振替) の純関数 + DTO decode。
// Reviewer 生成 (設計docのみを根拠、実装は未読)。
import XCTest
@testable import Atender

final class B18ClassTransferLogicTests: XCTestCase {

    // MARK: - fixtures

    private func daySlot(_ periodIndex: Int) -> DaySlotDto {
        let starts: [Int: (Int, Int)] = [
            1: (540, 630), 2: (640, 730), 3: (780, 870), 4: (880, 970), 5: (980, 1070), 6: (1080, 1125),
        ]
        let (s, e) = starts[periodIndex] ?? (540, 630)
        return DaySlotDto(periodIndex: periodIndex, label: "\(periodIndex)限", startMinute: s, endMinute: e, isBreak: false)
    }

    private func course(_ id: String, name: String) -> CourseDto {
        CourseDto(id: id, name: name, teacher: nil, color: nil, note: nil)
    }

    private func meeting(_ id: String, courseId: String, dow: Int, start: Int, count: Int = 1) -> MeetingDto {
        MeetingDto(id: id, courseId: courseId, dayOfWeek: dow, startPeriodIndex: start, periodCount: count, room: nil)
    }

    /// §8.3 標本: 金曜 M_F1=1限, M_F2=3-4限。月曜 M_M1=1限, M_M2=5限。
    private func timetableFixture() -> UserTimetableDto {
        UserTimetableDto(
            id: "tt1", userId: "u1", semesterId: "s1", title: "時間割",
            sourceTemplateId: nil, daysOfWeek: [1, 2, 3, 4, 5],
            daySlots: (1...6).map { daySlot($0) },
            courses: [course("cF1", name: "F1科目"), course("cF2", name: "F2科目"),
                      course("cM1", name: "M1科目"), course("cM2", name: "M2科目")],
            meetings: [meeting("mF1", courseId: "cF1", dow: 5, start: 1),
                       meeting("mF2", courseId: "cF2", dow: 5, start: 3, count: 2),
                       meeting("mM1", courseId: "cM1", dow: 1, start: 1),
                       meeting("mM2", courseId: "cM2", dow: 1, start: 5)],
            createdAt: "2026-04-01T00:00:00.000Z", updatedAt: "2026-04-01T00:00:00.000Z"
        )
    }

    private func occurrence(
        id: String, meetingId: String, courseId: String, courseName: String,
        date: String = "2026-09-14", periodIndex: Int, periodOffset: Int = 0,
        startMinute: Int = 540, endMinute: Int = 630,
        status: AttendanceStatus? = nil, transferId: String? = nil
    ) -> OccurrenceDto {
        OccurrenceDto(
            id: id, meetingId: meetingId, courseId: courseId, courseName: courseName,
            teacher: nil, room: nil, color: nil, date: date,
            periodIndex: periodIndex, periodOffset: periodOffset,
            startMinute: startMinute, endMinute: endMinute, status: status, transferId: transferId
        )
    }

    private func classTransferDto(
        id: String, date: String = "2026-09-14", kind: ClassTransferKind,
        sourceDayOfWeek: Int? = nil, sourceDate: String? = nil,
        occurrenceIds: [String] = [], displaced: [ClassTransferDisplacedDto] = []
    ) -> ClassTransferDto {
        ClassTransferDto(
            id: id, userTimetableId: "tt1", date: date, kind: kind,
            sourceDayOfWeek: sourceDayOfWeek, sourceDate: sourceDate, note: nil,
            occurrenceIds: occurrenceIds, displaced: displaced,
            createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z"
        )
    }

    // MARK: - #U1 defaultSourceDay

    func testU1DefaultSourceDay() {
        let m1 = meeting("mF1", courseId: "cF1", dow: 5, start: 1)
        let m2 = meeting("mM1", courseId: "cM1", dow: 1, start: 1)
        XCTAssertEqual(ClassTransferLogic.defaultSourceDay(targetDate: "2026-09-14", meetings: [m1, m2]), 5,
                        "[#U1] 表示順で最初の候補 (金) が選ばれない")

        XCTAssertNil(ClassTransferLogic.defaultSourceDay(targetDate: "2026-09-14", meetings: [m2]),
                      "[#U1] target と同じ曜日しか無いのに nil でない")

        let wed = meeting("mW", courseId: "cW", dow: 3, start: 1)
        let fri = meeting("mF", courseId: "cF", dow: 5, start: 1)
        XCTAssertEqual(ClassTransferLogic.defaultSourceDay(targetDate: "2026-09-14", meetings: [wed, fri]), 3,
                        "[#U1] 表示順 (月始まり) で水曜が金曜より先に来ない")
    }

    // MARK: - #U2 defaultSourceDate

    func testU2DefaultSourceDate() {
        XCTAssertEqual(
            ClassTransferLogic.defaultSourceDate(targetDate: "2026-09-14", sourceDayOfWeek: 5, semesterStart: "2026-04-06"),
            "2026-09-11", "[#U2] 直前の金曜が選ばれない"
        )
        XCTAssertEqual(
            ClassTransferLogic.defaultSourceDate(targetDate: "2026-04-07", sourceDayOfWeek: 5, semesterStart: "2026-04-06"),
            "2026-04-10", "[#U2] 学期開始前に落ちるケースで学期開始以後の最初の金曜に丸められない"
        )
    }

    // MARK: - #U3/#U4 previewMoveDay

    func testU3PreviewMoveDay() throws {
        let existing = [
            occurrence(id: "oM1", meetingId: "mM1", courseId: "cM1", courseName: "M1科目", periodIndex: 1),
            occurrence(id: "oM2", meetingId: "mM2", courseId: "cM2", courseName: "M2科目", periodIndex: 5, startMinute: 980, endMinute: 1070),
        ]
        let rows = ClassTransferLogic.previewMoveDay(targetDate: "2026-09-14", sourceDayOfWeek: 5, timetable: timetableFixture(), existing: existing)

        XCTAssertEqual(rows.count, 2, "[#U3] rows 件数")
        let f1Row = try XCTUnwrap(rows.first { $0.periodIndex == 1 })
        XCTAssertEqual(f1Row.periodCount, 1)
        XCTAssertEqual(f1Row.courseName, "F1科目")
        XCTAssertEqual(f1Row.replaces, "月曜 1限 M1科目 を置き換え", "[#U3] replaces の文言")
        XCTAssertNil(f1Row.blockedBy)

        let f2Row = try XCTUnwrap(rows.first { $0.periodIndex == 3 })
        XCTAssertEqual(f2Row.periodCount, 2, "[#U3] 3-4限が1行に連結されていない")
        XCTAssertEqual(f2Row.courseName, "F2科目")
        XCTAssertNil(f2Row.replaces, "[#U3] 5限のM2は1限と重ならないので置き換え対象でない")

        XCTAssertTrue(ClassTransferLogic.canSubmit(rows), "[#U3] canSubmit が true でない")
    }

    func testU4PreviewMoveDayBlockedByExistingTransfer() throws {
        let existing = [
            occurrence(id: "oT", meetingId: "mF1", courseId: "cF1", courseName: "F1科目", periodIndex: 1, transferId: "existing-t"),
            occurrence(id: "oM2", meetingId: "mM2", courseId: "cM2", courseName: "M2科目", periodIndex: 5, startMinute: 980, endMinute: 1070),
        ]
        let rows = ClassTransferLogic.previewMoveDay(targetDate: "2026-09-14", sourceDayOfWeek: 5, timetable: timetableFixture(), existing: existing)

        let f1Row = try XCTUnwrap(rows.first { $0.periodIndex == 1 })
        XCTAssertEqual(f1Row.blockedBy, "既に授業変更があります", "[#U4] blockedBy 文言")
        XCTAssertFalse(ClassTransferLogic.canSubmit(rows), "[#U4] blockedBy がある行があるのに canSubmit が true")
    }

    // MARK: - #U5 previewSingle

    func testU5PreviewSingle() {
        let existing = [occurrence(id: "oM2", meetingId: "mM2", courseId: "cM2", courseName: "M2科目", periodIndex: 5, startMinute: 980, endMinute: 1070)]
        let rows = ClassTransferLogic.previewSingle(periodIndexes: [3, 4, 6], courseId: "cF1", timetable: timetableFixture(), existing: existing)

        XCTAssertEqual(rows.count, 2, "[#U5] 3,4限が連結されて2行にならない")
        XCTAssertTrue(rows.allSatisfy { $0.replaces == nil }, "[#U5] 5限と重ならないのに replaces が付いている")

        let empty = ClassTransferLogic.previewSingle(periodIndexes: [], courseId: "cF1", timetable: timetableFixture(), existing: [])
        XCTAssertTrue(empty.isEmpty, "[#U5] periodIndexes 空で行が生成されている")
        XCTAssertFalse(ClassTransferLogic.canSubmit(empty), "[#U5] 空行で canSubmit が true")
    }

    // MARK: - #U6 summary

    func testU6Summary() {
        let moveDay = classTransferDto(id: "t1", kind: .moveDay, sourceDayOfWeek: 5, sourceDate: "2026-09-11")
        let moveDayOccs = (1...3).map {
            occurrence(id: "o\($0)", meetingId: "m\($0)", courseId: "c\($0)", courseName: "x", periodIndex: $0, transferId: "t1")
        }
        XCTAssertEqual(ClassTransferLogic.summary(moveDay, occurrences: moveDayOccs), "金曜日の時間割 (3コマ) · 9/11(金) を休講")

        let moveDayNoSuspend = classTransferDto(id: "t2", kind: .moveDay, sourceDayOfWeek: 5, sourceDate: nil)
        let moveDayOccs2 = moveDayOccs.map {
            occurrence(id: $0.id, meetingId: $0.meetingId, courseId: $0.courseId, courseName: $0.courseName, periodIndex: $0.periodIndex, transferId: "t2")
        }
        XCTAssertEqual(ClassTransferLogic.summary(moveDayNoSuspend, occurrences: moveDayOccs2), "金曜日の時間割 (3コマ)")

        let single = classTransferDto(id: "t3", kind: .single)
        let singleOccs = [
            occurrence(id: "o4", meetingId: "mF1", courseId: "cF1", courseName: "情報数学", periodIndex: 3, transferId: "t3"),
            occurrence(id: "o5", meetingId: "mF1", courseId: "cF1", courseName: "情報数学", periodIndex: 4, transferId: "t3"),
        ]
        XCTAssertEqual(ClassTransferLogic.summary(single, occurrences: singleOccs), "情報数学 3-4限")
    }

    // MARK: - #U7 needsDeleteConfirmation

    func testU7NeedsDeleteConfirmation() {
        let transfer = classTransferDto(id: "t1", kind: .moveDay, sourceDayOfWeek: 5)
        let occs = [
            occurrence(id: "o1", meetingId: "m1", courseId: "c1", courseName: "x", periodIndex: 1, status: .present, transferId: "t1"),
            occurrence(id: "o2", meetingId: "m2", courseId: "c2", courseName: "x", periodIndex: 3, status: nil, transferId: "t1"),
            occurrence(id: "o3", meetingId: "m3", courseId: "c3", courseName: "x", periodIndex: 1, status: .absent, transferId: "other"),
        ]
        XCTAssertEqual(ClassTransferLogic.needsDeleteConfirmation(transfer: transfer, occurrences: occs), 1, "[#U7] 記録件数")
    }

    // MARK: - #U8/#U9 TransferDisplay

    func testU8DisplacedKeys() {
        let displaced = ClassTransferDisplacedDto(meetingId: "M_M1", courseId: "cM1", courseName: "M1科目", startPeriodIndex: 1, periodCount: 1)
        let transfer = classTransferDto(id: "t1", date: "2026-09-14", kind: .moveDay, sourceDayOfWeek: 5, displaced: [displaced])
        XCTAssertEqual(TransferDisplay.displacedKeys([transfer]), ["M_M1|2026-09-14"])
    }

    func testU9CalendarEvents() throws {
        let f2p3 = occurrence(id: "o1", meetingId: "mF2", courseId: "cF2", courseName: "F2科目", periodIndex: 3, periodOffset: 1003, startMinute: 780, endMinute: 870, transferId: "t1")
        let f2p4 = occurrence(id: "o2", meetingId: "mF2", courseId: "cF2", courseName: "F2科目", periodIndex: 4, periodOffset: 1004, startMinute: 880, endMinute: 970, transferId: "t1")
        let f1p1 = occurrence(id: "o3", meetingId: "mF1", courseId: "cF1", courseName: "F1科目", periodIndex: 1, periodOffset: 1001, startMinute: 540, endMinute: 630, transferId: "t1")
        let normal = occurrence(id: "o4", meetingId: "mM2", courseId: "cM2", courseName: "M2科目", periodIndex: 5, periodOffset: 0, startMinute: 980, endMinute: 1070, transferId: nil)

        let events = TransferDisplay.calendarEvents(occurrences: [f2p3, f2p4, f1p1, normal], courses: timetableFixture().courses)

        XCTAssertEqual(events.count, 2, "[#U9] transferId==nil の occurrence が混ざっている、または F1/F2 が結合されていない")
        let f2Event = try XCTUnwrap(events.first { $0.courseId == "cF2" })
        XCTAssertEqual(f2Event.startMinute, 780)
        XCTAssertEqual(f2Event.endMinute, 970)
        XCTAssertEqual(f2Event.title, "振替 F2科目")
        XCTAssertEqual(f2Event.subtitle, "振替")
        XCTAssertEqual(f2Event.kind, .meeting)
    }

    // MARK: - #U10 MeetingExpansion.excluding

    func testU10ExpandUserTimetableExcluding() {
        let m = meeting("mM1", courseId: "cM1", dow: 1, start: 1)
        let events = MeetingExpansion.expandUserTimetable(
            meetings: [m], courses: [course("cM1", name: "M1科目")],
            daySlots: [daySlot(1)],
            rangeStart: "2026-09-07", rangeEnd: "2026-09-21",
            semesterStart: nil, semesterEnd: nil, statusByDate: [:],
            excluding: ["mM1|2026-09-14"]
        )
        let dates = Set(events.map(\.date))
        XCTAssertFalse(dates.contains("2026-09-14"), "[#U10] excluding が効いていない")
        XCTAssertTrue(dates.contains("2026-09-07"), "[#U10] excluding が他の日まで消している")
        XCTAssertTrue(dates.contains("2026-09-21"), "[#U10] excluding が他の日まで消している")

        // excluding 省略時は従来と同一件数 (default 引数)
        let withoutExcluding = MeetingExpansion.expandUserTimetable(
            meetings: [m], courses: [course("cM1", name: "M1科目")],
            daySlots: [daySlot(1)],
            rangeStart: "2026-09-07", rangeEnd: "2026-09-21",
            semesterStart: nil, semesterEnd: nil, statusByDate: [:]
        )
        XCTAssertEqual(withoutExcluding.count, events.count + 1, "[#U10] excluding 省略時に既存呼び出しの件数が変わっている")
    }

    // MARK: - #U11 DTO decode

    func testU11OccurrenceDtoTransferIdOptional() throws {
        let withoutKey = """
        {"id":"o1","meetingId":"mt1","courseId":"c1","courseName":"情報数学","teacher":"山田","room":"301",
         "color":null,"date":"2026-07-23","periodIndex":1,"periodOffset":0,"startMinute":540,"endMinute":630,"status":null}
        """
        let dto = try JSONDecoder().decode(OccurrenceDto.self, from: Data(withoutKey.utf8))
        XCTAssertNil(dto.transferId, "[#U11] transferId キー欠落で decode 失敗、または nil でない")

        let withKey = """
        {"id":"o1","meetingId":"mt1","courseId":"c1","courseName":"情報数学","teacher":"山田","room":"301",
         "color":null,"date":"2026-07-23","periodIndex":1,"periodOffset":0,"startMinute":540,"endMinute":630,"status":null,"transferId":"t1"}
        """
        let dto2 = try JSONDecoder().decode(OccurrenceDto.self, from: Data(withKey.utf8))
        XCTAssertEqual(dto2.transferId, "t1")
    }

    func testU11DayDetailDtoTransfersOptional() throws {
        let json = """
        {"date":"2026-09-14","occurrences":[],"courseSuspensions":[],"timetableSuspension":null,"personalEvents":[]}
        """
        let dto = try JSONDecoder().decode(DayDetailDto.self, from: Data(json.utf8))
        XCTAssertNil(dto.transfers, "[#U11] transfers キー欠落で decode 失敗、または nil でない")
    }

    func testU11AttendanceDaySummaryTransferCountOptional() throws {
        let json = #"{"date":"2026-06-03","status":"NO_CLASS","occurrenceCount":0,"counts":null}"#
        let dto = try JSONDecoder().decode(AttendanceDaySummary.self, from: Data(json.utf8))
        XCTAssertNil(dto.transferCount, "[#U11] transferCount キー欠落で decode 失敗、または nil でない")
    }

    func testU11ClassTransferKindUnknownFallback() throws {
        struct Wrapper: Decodable { let kind: ClassTransferKind }
        let wrapper = try JSONDecoder().decode(Wrapper.self, from: Data(#"{"kind":"FOO"}"#.utf8))
        XCTAssertEqual(wrapper.kind, .unknown, "[#U11] 未知の kind が .unknown にフォールバックしていない")
        let known = try JSONDecoder().decode(Wrapper.self, from: Data(#"{"kind":"SINGLE"}"#.utf8))
        XCTAssertEqual(known.kind, .single)
    }

    // MARK: - #U12 ClassTransferCreateInput encode

    func testU12CreateInputEncodesOnlyPresentKeys() throws {
        let input = ClassTransferCreateInput(
            kind: .moveDay, date: "2026-09-14",
            sourceDayOfWeek: 5, suspendSourceDate: true, sourceDate: "2026-09-11"
        )
        let data = try JSONEncoder().encode(input)
        let obj = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(Set(obj.keys), ["kind", "date", "sourceDayOfWeek", "suspendSourceDate", "sourceDate"],
                       "[#U12] nil のキーが省略されていない、または必要なキーが欠けている (実測 \(obj.keys.sorted()))")
    }

    // MARK: - #U13 InvalidationMatrix

    func testU13InvalidationTargetsForClassTransfer() {
        let targets = Set(invalidationTargets(for: .classTransfer(date: "2026-09-14")))
        XCTAssertTrue(targets.contains(.dayPrefix()), "[#U13] dayPrefix が含まれない")
        XCTAssertTrue(targets.contains(.semesters()), "[#U13] semesters が含まれない (EventKit 書き出しトリガの実体)")
        XCTAssertTrue(targets.contains(QueryKey(["stats"])), "[#U13] stats が含まれない")
        XCTAssertTrue(targets.contains(QueryKey(["today"])), "[#U13] today が含まれない")
        XCTAssertTrue(targets.contains(.timetableSuspensions()), "[#U13] timetableSuspensions が含まれない")
        XCTAssertTrue(targets.contains(.dayDetail("2026-09-14")), "[#U13] dayDetail(date) が含まれない")
        XCTAssertTrue(CalendarSyncTrigger.isDataChange(Array(targets)), "[#U13] isDataChange が true でない")
    }

    // MARK: - #U14 Endpoints

    func testU14Endpoints() {
        let create = Endpoints.createClassTransfer(ClassTransferCreateInput(kind: .single, date: "2026-09-14"))
        XCTAssertEqual(create.path, "/api/class-transfers", "[#U14] createClassTransfer の path")
        XCTAssertEqual(create.method, .post, "[#U14] createClassTransfer の method")

        let delete = Endpoints.deleteClassTransfer(id: "t1")
        XCTAssertEqual(delete.path, "/api/class-transfers/t1", "[#U14] deleteClassTransfer の path")
        XCTAssertEqual(delete.method, .delete, "[#U14] deleteClassTransfer の method")
    }

    /// [#T27] 表示中の学期を渡し、省略時は既定学期の書き出しとの互換性を保つ。
    func testT27OccurrenceRangeSemesterQuery() {
        let selected = Endpoints.occurrenceRange(from: "2026-09-14", to: "2026-09-20", semesterId: "s2")
        XCTAssertEqual(selected.path, "/api/occurrences")
        XCTAssertEqual(selected.method, .get)
        XCTAssertEqual(selected.query, ["from": "2026-09-14", "to": "2026-09-20", "semesterId": "s2"])

        let withoutSemester = Endpoints.occurrenceRange(from: "2026-09-14", to: "2026-09-20", semesterId: nil)
        let omitted = Endpoints.occurrenceRange(from: "2026-09-14", to: "2026-09-20")
        XCTAssertEqual(withoutSemester.query, ["from": "2026-09-14", "to": "2026-09-20"])
        XCTAssertEqual(omitted.query, withoutSemester.query)
    }

}
