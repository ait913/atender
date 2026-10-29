import XCTest
@testable import Atender

// Reviewer 生成: build 21 設計 §5.2.4 / §5.3 / §5.6 / §7.C (C20-C25, C27, C41, C42) のみを根拠。
// 実装 (Features/Templates, Features/Setup) は未読。シグネチャは grep で型名・引数を確認しただけ。

enum B21Fx {
    static func course(_ id: String, name: String = "科目", teacher: String? = nil) -> CourseDto {
        CourseDto(id: id, name: name, teacher: teacher, color: nil, note: nil)
    }

    static func meeting(_ id: String, courseId: String, dow: Int, start: Int = 1, count: Int = 1, room: String? = nil) -> MeetingDto {
        MeetingDto(id: id, courseId: courseId, dayOfWeek: dow, startPeriodIndex: start, periodCount: count, room: room)
    }

    static func template(
        id: String,
        author: String = "u1",
        title: String = "T",
        copyCount: Int = 0,
        updatedAt: String = "2026-10-03T00:30:00.000Z",
        courses: [CourseDto]? = nil,
        meetings: [MeetingDto]? = nil,
        daysOfWeek: [Int]? = nil
    ) -> TemplateDto {
        let cs = courses ?? [course("c-\(id)")]
        let ms = meetings ?? [meeting("m-\(id)", courseId: cs.first?.id ?? "c-\(id)", dow: 1)]
        return TemplateDto(
            id: id, authorUserId: author, schoolId: "s1", departmentId: "d1", title: title,
            description: nil, year: nil, term: nil, isPublic: true, copyCount: copyCount,
            daySlots: [], courses: cs, meetings: ms,
            createdAt: "2026-10-01T00:00:00.000Z", updatedAt: updatedAt,
            schoolName: "学校", departmentName: "学科", daysOfWeek: daysOfWeek
        )
    }

    static func timetable(
        id: String = "ut1",
        semesterId: String = "sem1",
        sourceTemplateId: String? = nil,
        courses: [CourseDto] = [],
        meetings: [MeetingDto] = [],
        published: PublishedTemplateRef? = nil
    ) -> UserTimetableDto {
        UserTimetableDto(
            id: id, userId: "me", semesterId: semesterId, title: "時間割", sourceTemplateId: sourceTemplateId,
            daysOfWeek: [1, 2, 3, 4, 5], daySlots: [], courses: courses, meetings: meetings,
            createdAt: "2026-04-01T00:00:00.000Z", updatedAt: "2026-04-01T00:00:00.000Z",
            publishedTemplate: published
        )
    }
}

final class B21TemplateSuggestionTests: XCTestCase {

    // MARK: C20 visible

    func testC20aEmptyMeetingsAreExcluded() {
        let empty = B21Fx.template(id: "empty", meetings: [])
        let ok = B21Fx.template(id: "ok", author: "u2", title: "OK")
        XCTAssertEqual(TemplateSuggestionLogic.visible([empty, ok]).map(\.id), ["ok"])
    }

    func testC20bSameAuthorSameTitleKeepsNewestUpdatedAtOnly() {
        let old = B21Fx.template(id: "a", author: "u1", title: "同名", copyCount: 9, updatedAt: "2026-10-01T00:00:00.000Z")
        let new = B21Fx.template(id: "b", author: "u1", title: "同名", copyCount: 0, updatedAt: "2026-10-05T00:00:00.000Z")
        let other = B21Fx.template(id: "c", author: "u2", title: "同名", updatedAt: "2026-09-01T00:00:00.000Z")
        let ids = TemplateSuggestionLogic.visible([old, new, other]).map(\.id)
        XCTAssertFalse(ids.contains("a"), "古い方は畳まれる (copyCount が大きくても)")
        XCTAssertTrue(ids.contains("b"))
        XCTAssertTrue(ids.contains("c"), "author が違えば同 title でも別")
    }

    func testC20bTieOnUpdatedAtKeepsLargerId() {
        let a = B21Fx.template(id: "aaa", author: "u1", title: "同名", updatedAt: "2026-10-05T00:00:00.000Z")
        let b = B21Fx.template(id: "bbb", author: "u1", title: "同名", updatedAt: "2026-10-05T00:00:00.000Z")
        XCTAssertEqual(TemplateSuggestionLogic.visible([a, b]).map(\.id), ["bbb"])
        XCTAssertEqual(TemplateSuggestionLogic.visible([b, a]).map(\.id), ["bbb"])
    }

    func testC20bSameAuthorDifferentTitleBothKept() {
        let a = B21Fx.template(id: "a", author: "u1", title: "前期")
        let b = B21Fx.template(id: "b", author: "u1", title: "後期")
        XCTAssertEqual(Set(TemplateSuggestionLogic.visible([a, b]).map(\.id)), ["a", "b"])
    }

    func testC20cAnonymisedAuthorIsNotMerged() {
        let a = B21Fx.template(id: "a", author: "", title: "同名", updatedAt: "2026-10-01T00:00:00.000Z")
        let b = B21Fx.template(id: "b", author: "", title: "同名", updatedAt: "2026-10-05T00:00:00.000Z")
        XCTAssertEqual(Set(TemplateSuggestionLogic.visible([a, b]).map(\.id)), ["a", "b"])
    }

    func testC20dOrderCopyCountDescThenUpdatedAtDescThenIdDesc() {
        let t1 = B21Fx.template(id: "t1", author: "a1", title: "1", copyCount: 1, updatedAt: "2026-10-09T00:00:00.000Z")
        let t5old = B21Fx.template(id: "t5old", author: "a2", title: "2", copyCount: 5, updatedAt: "2026-10-01T00:00:00.000Z")
        let t5new = B21Fx.template(id: "t5new", author: "a3", title: "3", copyCount: 5, updatedAt: "2026-10-02T00:00:00.000Z")
        let tieA = B21Fx.template(id: "tieA", author: "a4", title: "4", copyCount: 0, updatedAt: "2026-10-03T00:00:00.000Z")
        let tieB = B21Fx.template(id: "tieB", author: "a5", title: "5", copyCount: 0, updatedAt: "2026-10-03T00:00:00.000Z")
        let out = TemplateSuggestionLogic.visible([tieA, t1, t5old, tieB, t5new]).map(\.id)
        XCTAssertEqual(out, ["t5new", "t5old", "t1", "tieB", "tieA"])
    }

    func testC20EmptyInputIsEmpty() {
        XCTAssertEqual(TemplateSuggestionLogic.visible([]), [])
    }

    func testFoundTitleConstantIsRequirementsVerbatim() {
        XCTAssertEqual(TemplateSuggestionLogic.foundTitle, "同じ学科の時間割が見つかりました")
    }

    // MARK: C21 sizeText

    func testC21SizeTextCoursesAndPeriodCountSum() {
        let cs = (1...8).map { B21Fx.course("c\($0)") }
        let ms = [
            B21Fx.meeting("m1", courseId: "c1", dow: 1, count: 3),
            B21Fx.meeting("m2", courseId: "c2", dow: 2, count: 3),
            B21Fx.meeting("m3", courseId: "c3", dow: 3, count: 3),
            B21Fx.meeting("m4", courseId: "c4", dow: 4, count: 3),
        ]
        let t = B21Fx.template(id: "x", courses: cs, meetings: ms)
        XCTAssertEqual(TemplateSuggestionLogic.sizeText(t), "8科目・週12コマ")
    }

    // MARK: C22 metaText

    func testC22MetaWithCopyCount() {
        let t = B21Fx.template(id: "x", author: "u9", copyCount: 12, updatedAt: "2026-10-03T00:30:00.000Z")
        XCTAssertEqual(TemplateSuggestionLogic.metaText(t, meId: "other"), "12人が使用・2026/10/3 更新")
        XCTAssertEqual(TemplateSuggestionLogic.metaText(t, meId: nil), "12人が使用・2026/10/3 更新")
    }

    func testC22MetaWithoutCopyCount() {
        let t = B21Fx.template(id: "x", copyCount: 0, updatedAt: "2026-10-03T00:30:00.000Z")
        XCTAssertEqual(TemplateSuggestionLogic.metaText(t, meId: nil), "2026/10/3 更新")
    }

    func testC22MetaUsesJSTDate() {
        // 2026-10-02T15:30Z は JST 10/3 0:30
        let t = B21Fx.template(id: "x", copyCount: 0, updatedAt: "2026-10-02T15:30:00.000Z")
        XCTAssertEqual(TemplateSuggestionLogic.metaText(t, meId: nil), "2026/10/3 更新")
        // 境界の反対側: 2026-10-02T14:59Z は JST 10/2 23:59
        let t2 = B21Fx.template(id: "y", copyCount: 0, updatedAt: "2026-10-02T14:59:00.000Z")
        XCTAssertEqual(TemplateSuggestionLogic.metaText(t2, meId: nil), "2026/10/2 更新")
    }

    func testC22MetaOwnTemplatePrefix() {
        let t = B21Fx.template(id: "x", author: "me1", copyCount: 12, updatedAt: "2026-10-03T00:30:00.000Z")
        XCTAssertEqual(TemplateSuggestionLogic.metaText(t, meId: "me1"), "あなたが公開・12人が使用・2026/10/3 更新")
        let t0 = B21Fx.template(id: "y", author: "me1", copyCount: 0, updatedAt: "2026-10-03T00:30:00.000Z")
        XCTAssertEqual(TemplateSuggestionLogic.metaText(t0, meId: "me1"), "あなたが公開・2026/10/3 更新")
    }

    // MARK: C23 previewRows

    func testC23SundayLastAndPeriodText() {
        let cs = [B21Fx.course("c1", name: "OS", teacher: "山田"), B21Fx.course("c2", name: "DB")]
        let ms = [
            B21Fx.meeting("sun", courseId: "c2", dow: 0, start: 1, count: 1),
            B21Fx.meeting("mon3", courseId: "c1", dow: 1, start: 3, count: 2, room: nil),
            B21Fx.meeting("mon1", courseId: "c2", dow: 1, start: 1, count: 1),
            B21Fx.meeting("sat", courseId: "c1", dow: 6, start: 2, count: 1),
        ]
        let rows = TemplateSuggestionLogic.previewRows(B21Fx.template(id: "x", courses: cs, meetings: ms))
        XCTAssertEqual(rows.map(\.id), ["mon1", "mon3", "sat", "sun"])
        XCTAssertEqual(rows.map(\.weekday), ["月", "月", "土", "日"])
        XCTAssertEqual(rows.map(\.periodText), ["1限", "3–4限", "2限", "1限"])
        XCTAssertEqual(rows[1].courseName, "OS")
    }

    func testC23DetailJoinsTeacherAndRoom() {
        let cs = [B21Fx.course("c1", name: "OS", teacher: "山田"), B21Fx.course("c2", name: "DB", teacher: nil)]
        let ms = [
            B21Fx.meeting("a", courseId: "c1", dow: 1, start: 1, room: nil),
            B21Fx.meeting("b", courseId: "c1", dow: 2, start: 1, room: "301"),
            B21Fx.meeting("c", courseId: "c2", dow: 3, start: 1, room: nil),
            B21Fx.meeting("d", courseId: "c2", dow: 4, start: 1, room: "実験室"),
        ]
        let rows = TemplateSuggestionLogic.previewRows(B21Fx.template(id: "x", courses: cs, meetings: ms))
        let byId = Dictionary(uniqueKeysWithValues: rows.map { ($0.id, $0) })
        XCTAssertEqual(byId["a"]?.detail, "山田")
        XCTAssertEqual(byId["b"]?.detail, "山田 · 301")
        XCTAssertNil(byId["c"]?.detail)
        XCTAssertEqual(byId["d"]?.detail, "実験室")
    }

    func testC23UnknownCourseFallsBackToJugyo() {
        let ms = [B21Fx.meeting("a", courseId: "ghost", dow: 1)]
        let rows = TemplateSuggestionLogic.previewRows(B21Fx.template(id: "x", courses: [B21Fx.course("c1")], meetings: ms))
        XCTAssertEqual(rows.first?.courseName, "授業")
    }

    // MARK: C24 / C25 import decision

    func testC24Decide() {
        XCTAssertEqual(TemplateImportLogic.decide(existing: nil), .copy)
        XCTAssertEqual(TemplateImportLogic.decide(existing: B21Fx.timetable()), .replaceSilently)
        let c2 = [B21Fx.course("c1"), B21Fx.course("c2")]
        XCTAssertEqual(TemplateImportLogic.decide(existing: B21Fx.timetable(courses: c2)), .confirmReplace(courseCount: 2))
        let ms3 = (1...3).map { B21Fx.meeting("m\($0)", courseId: "c1", dow: $0) }
        XCTAssertEqual(TemplateImportLogic.decide(existing: B21Fx.timetable(courses: c2, meetings: ms3)), .confirmReplace(courseCount: 2))
    }

    func testC24MeetingsButNoCoursesIsStillNotEmpty() {
        let ms = [B21Fx.meeting("m1", courseId: "c1", dow: 1)]
        XCTAssertEqual(TemplateImportLogic.decide(existing: B21Fx.timetable(courses: [], meetings: ms)), .confirmReplace(courseCount: 0))
    }

    func testC25CopyInput() {
        let c = TemplateImportLogic.copyInput(semesterId: "s", decision: .copy)
        XCTAssertNil(c.replaceExisting)
        XCTAssertNil(c.title)
        XCTAssertEqual(c.semesterId, "s")
        let r1 = TemplateImportLogic.copyInput(semesterId: "s", decision: .replaceSilently)
        XCTAssertEqual(r1.replaceExisting, true)
        XCTAssertNil(r1.title)
        let r2 = TemplateImportLogic.copyInput(semesterId: "s", decision: .confirmReplace(courseCount: 4))
        XCTAssertEqual(r2.replaceExisting, true)
        XCTAssertNil(r2.title)
    }

    // MARK: C26 SemesterCreationPlan

    func testC26PlanSixCases() {
        typealias P = SemesterCreationPlan
        XCTAssertEqual(P.steps(context: .onboarding, createdSemesterId: nil, templateId: "T", templateCopied: false),
                       [.createSemester, .copyTemplate(templateId: "T"), .setDefaultSemester, .refreshMe])
        XCTAssertEqual(P.steps(context: .onboarding, createdSemesterId: "s", templateId: "T", templateCopied: false),
                       [.copyTemplate(templateId: "T"), .setDefaultSemester, .refreshMe])
        XCTAssertEqual(P.steps(context: .onboarding, createdSemesterId: "s", templateId: "T", templateCopied: true),
                       [.setDefaultSemester, .refreshMe])
        XCTAssertEqual(P.steps(context: .onboarding, createdSemesterId: nil, templateId: nil, templateCopied: false),
                       [.createSemester, .setDefaultSemester, .refreshMe])
        XCTAssertEqual(P.steps(context: .rollover, createdSemesterId: nil, templateId: "T", templateCopied: false),
                       [.createSemester, .copyTemplate(templateId: "T"), .setDefaultSemester])
        XCTAssertEqual(P.steps(context: .rollover, createdSemesterId: nil, templateId: nil, templateCopied: false),
                       [.createSemester, .setDefaultSemester])
    }

    func testC26PlanExtraCases() {
        typealias P = SemesterCreationPlan
        // 学期作成済み + テンプレ無し (「取り込まずに完了」)
        XCTAssertEqual(P.steps(context: .onboarding, createdSemesterId: "s", templateId: nil, templateCopied: false),
                       [.setDefaultSemester, .refreshMe])
        // rollover は refreshMe を含まない
        for t in [String?.none, "T"] {
            XCTAssertFalse(P.steps(context: .rollover, createdSemesterId: nil, templateId: t, templateCopied: false).contains(.refreshMe))
        }
        // templateCopied が true でも templateId が無ければ copy は出ない
        XCTAssertFalse(P.steps(context: .onboarding, createdSemesterId: nil, templateId: nil, templateCopied: true)
            .contains(where: { if case .copyTemplate = $0 { return true } else { return false } }))
    }

    // MARK: C27 SemesterRollover.initialProposal

    func testC27InitialProposal() {
        func p(_ today: String) -> [String] {
            let x = SemesterRollover.initialProposal(today: today)
            return [x.name, x.startDate, x.endDate]
        }
        XCTAssertEqual(p("2026-10-29"), ["2026 後期", "2026-10-01", "2027-03-31"])
        XCTAssertEqual(p("2026-04-01"), ["2026 前期", "2026-04-01", "2026-09-30"])
        XCTAssertEqual(p("2026-09-30"), ["2026 前期", "2026-04-01", "2026-09-30"])
        XCTAssertEqual(p("2026-03-31"), ["2025 後期", "2025-10-01", "2026-03-31"])
        XCTAssertEqual(p("2027-01-15"), ["2026 後期", "2026-10-01", "2027-03-31"])
    }

    func testC27InitialProposalBoundaries() {
        func p(_ today: String) -> [String] {
            let x = SemesterRollover.initialProposal(today: today)
            return [x.name, x.startDate, x.endDate]
        }
        XCTAssertEqual(p("2026-10-01"), ["2026 後期", "2026-10-01", "2027-03-31"])
        XCTAssertEqual(p("2026-12-31"), ["2026 後期", "2026-10-01", "2027-03-31"])
        XCTAssertEqual(p("2026-01-01"), ["2025 後期", "2025-10-01", "2026-03-31"])
        XCTAssertEqual(p("2026-06-15"), ["2026 前期", "2026-04-01", "2026-09-30"])
    }

    // MARK: C41 / C42 TimetablePublishLogic

    func testC41InitialToggle() {
        XCTAssertFalse(TimetablePublishLogic.initialToggle(nil))
        let pubOn = PublishedTemplateRef(id: "t", title: "x", isPublic: true, updatedAt: "2026-10-01T00:00:00.000Z")
        let pubOff = PublishedTemplateRef(id: "t", title: "x", isPublic: false, updatedAt: "2026-10-01T00:00:00.000Z")
        XCTAssertTrue(TimetablePublishLogic.initialToggle(B21Fx.timetable(published: pubOn)))
        XCTAssertFalse(TimetablePublishLogic.initialToggle(B21Fx.timetable(published: pubOff)))
        XCTAssertTrue(TimetablePublishLogic.initialToggle(B21Fx.timetable(sourceTemplateId: nil, published: nil)))
        XCTAssertFalse(TimetablePublishLogic.initialToggle(B21Fx.timetable(sourceTemplateId: "x", published: nil)))
        // publishedTemplate があれば sourceTemplateId より優先される
        XCTAssertTrue(TimetablePublishLogic.initialToggle(B21Fx.timetable(sourceTemplateId: "x", published: pubOn)))
        XCTAssertFalse(TimetablePublishLogic.initialToggle(B21Fx.timetable(sourceTemplateId: nil, published: pubOff)))
    }

    func testC42ActionTable() {
        let withMeeting = [B21Fx.meeting("m", courseId: "c", dow: 1)]
        let pubOn = PublishedTemplateRef(id: "tpl", title: "x", isPublic: true, updatedAt: "2026-10-01T00:00:00.000Z")
        let pubOff = PublishedTemplateRef(id: "tpl", title: "x", isPublic: false, updatedAt: "2026-10-01T00:00:00.000Z")
        // ON + 授業 0 → 何もしない (published の有無に依らず)
        XCTAssertEqual(TimetablePublishLogic.action(toggle: true, title: "T", timetable: B21Fx.timetable(meetings: [])), .none)
        XCTAssertEqual(TimetablePublishLogic.action(toggle: true, title: "T", timetable: B21Fx.timetable(meetings: [], published: pubOn)), .none)
        // ON + 授業あり → publish (published の有無に依らず)
        XCTAssertEqual(TimetablePublishLogic.action(toggle: true, title: "T", timetable: B21Fx.timetable(meetings: withMeeting)), .publish(title: "T"))
        XCTAssertEqual(TimetablePublishLogic.action(toggle: true, title: "T", timetable: B21Fx.timetable(meetings: withMeeting, published: pubOff)), .publish(title: "T"))
        // OFF + 公開中 → unpublish
        XCTAssertEqual(TimetablePublishLogic.action(toggle: false, title: "T", timetable: B21Fx.timetable(meetings: withMeeting, published: pubOn)), .unpublish(templateId: "tpl"))
        XCTAssertEqual(TimetablePublishLogic.action(toggle: false, title: "T", timetable: B21Fx.timetable(meetings: [], published: pubOn)), .unpublish(templateId: "tpl"))
        // OFF + nil / 非公開 → 何もしない
        XCTAssertEqual(TimetablePublishLogic.action(toggle: false, title: "T", timetable: B21Fx.timetable(meetings: withMeeting)), .none)
        XCTAssertEqual(TimetablePublishLogic.action(toggle: false, title: "T", timetable: B21Fx.timetable(meetings: withMeeting, published: pubOff)), .none)
    }

    // MARK: DTO decode / encode (§5.2.4)

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    func testDecodeMeResponseWithAndWithoutNames() throws {
        let base = """
        {"user":{"id":"u","email":"a@b.c","name":null,"image":null,"handle":null,"inviteCode":null,
        "defaultSemesterId":null,"schoolId":"s","departmentId":"d","requiredAttendanceRate":70 %@},
        "setupStatus":{"hasSchool":true,"hasDepartment":true,"hasSemester":false,"hasUserTimetable":false,"isComplete":false}}
        """
        let without = try decode(MeResponse.self, String(format: base, ""))
        XCTAssertNil(without.user.schoolName)
        XCTAssertNil(without.user.departmentName)
        let with = try decode(MeResponse.self, String(format: base, ",\"schoolName\":\"千葉大学\",\"departmentName\":\"情報科学科\""))
        XCTAssertEqual(with.user.schoolName, "千葉大学")
        XCTAssertEqual(with.user.departmentName, "情報科学科")
        let nulls = try decode(MeResponse.self, String(format: base, ",\"schoolName\":null,\"departmentName\":null"))
        XCTAssertNil(nulls.user.schoolName)
        XCTAssertNil(nulls.user.departmentName)
    }

    private func templateJSON(extra: String) -> String {
        """
        {"id":"t","authorUserId":"u","schoolId":"s","departmentId":"d","title":"T","description":null,"year":null,"term":null,
        "isPublic":true,"copyCount":0,"daySlots":[],"courses":[],"meetings":[],
        "createdAt":"2026-10-01T00:00:00.000Z","updatedAt":"2026-10-01T00:00:00.000Z","schoolName":"S","departmentName":"D"\(extra)}
        """
    }

    func testDecodeTemplateDaysOfWeekOptional() throws {
        XCTAssertNil(try decode(TemplateDto.self, templateJSON(extra: "")).daysOfWeek)
        XCTAssertNil(try decode(TemplateDto.self, templateJSON(extra: ",\"daysOfWeek\":null")).daysOfWeek)
        XCTAssertEqual(try decode(TemplateDto.self, templateJSON(extra: ",\"daysOfWeek\":[1,2,3,4,5,6]")).daysOfWeek, [1, 2, 3, 4, 5, 6])
    }

    private func utJSON(extra: String) -> String {
        """
        {"id":"u","userId":"x","semesterId":"s","title":"T","sourceTemplateId":null,"daysOfWeek":[1,2],
        "daySlots":[],"courses":[],"meetings":[],"createdAt":"2026-10-01T00:00:00.000Z","updatedAt":"2026-10-01T00:00:00.000Z"\(extra)}
        """
    }

    func testDecodeUserTimetablePublishedTemplateOptional() throws {
        XCTAssertNil(try decode(UserTimetableDto.self, utJSON(extra: "")).publishedTemplate)
        XCTAssertNil(try decode(UserTimetableDto.self, utJSON(extra: ",\"publishedTemplate\":null")).publishedTemplate)
        let ref = try decode(UserTimetableDto.self, utJSON(extra:
            ",\"publishedTemplate\":{\"id\":\"t1\",\"title\":\"公開\",\"isPublic\":false,\"updatedAt\":\"2026-10-03T00:30:00.000Z\"}")).publishedTemplate
        XCTAssertEqual(ref, PublishedTemplateRef(id: "t1", title: "公開", isPublic: false, updatedAt: "2026-10-03T00:30:00.000Z"))
    }

    private func jsonObject<T: Encodable>(_ value: T) throws -> [String: Any] {
        let data = try JSONEncoder().encode(value)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func testEncodeTemplateCopyInputReplaceExisting() throws {
        let plain = try jsonObject(TemplateCopyInput(semesterId: "s", title: nil))
        XCTAssertEqual(Set(plain.keys), ["semesterId"], "nil の replaceExisting / title はキー自体を送らない")
        let replace = try jsonObject(TemplateCopyInput(semesterId: "s", title: nil, replaceExisting: true))
        XCTAssertEqual(replace["replaceExisting"] as? Bool, true)
        XCTAssertEqual(replace["semesterId"] as? String, "s")
        let viaLogic = try jsonObject(TemplateImportLogic.copyInput(semesterId: "s", decision: .replaceSilently))
        XCTAssertEqual(Set(viaLogic.keys), ["semesterId", "replaceExisting"])
    }

    func testEncodeTemplatePatchInput() throws {
        let off = try jsonObject(TemplatePatchInput(isPublic: false))
        XCTAssertEqual(off["isPublic"] as? Bool, false)
        XCTAssertEqual(off.count, 1)
    }

    func testEndpointPatchTemplate() throws {
        let e = Endpoints.patchTemplate(id: "abc", TemplatePatchInput(isPublic: false))
        XCTAssertEqual(e.method, .patch)
        XCTAssertEqual(e.path, "/api/timetable-templates/abc")
        XCTAssertTrue(e.requiresAuth)
    }

    func testEndpointCopyTemplatePathAndMethod() {
        let e = Endpoints.copyTemplate(id: "abc", TemplateCopyInput(semesterId: "s", title: nil))
        XCTAssertEqual(e.method, .post)
        XCTAssertEqual(e.path, "/api/timetable-templates/abc/copy")
    }

    func testInvalidationTemplateCopyCoversImportedData() {
        let keys = invalidationTargets(for: .templateCopy)
        for k in [QueryKey.userTimetables(), .me(), QueryKey(["today"]), QueryKey(["stats"]), .semesters(), .dayPrefix()] {
            XCTAssertTrue(keys.contains(k), "templateCopy が \(k) を invalidate していない")
        }
    }
}
