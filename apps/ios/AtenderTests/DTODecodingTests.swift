import XCTest
@testable import Atender

// Reviewer 生成: 設計doc §4 (DTO/Enums) + Fixtures/*.json を根拠にデコード検証。
// 実装コードは未読。型名・フィールドは設計 §4 と Fixtures JSON を正典とする。

private struct EnumDecodingWrapper<Value: Decodable>: Decodable {
    let x: Value
}

final class DTODecodingTests: XCTestCase {

    // 設計 §2.3: keyDecodingStrategy = .useDefaultKeys (camelCase 直)、dateDecodingStrategy 不使用。
    private func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .useDefaultKeys
        return d
    }

    private func loadFixture(_ name: String) throws -> Data {
        let bundle = Bundle(for: type(of: self))
        guard let url = bundle.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
            ?? bundle.url(forResource: name, withExtension: "json") else {
            throw XCTSkip("Fixture \(name).json がテストバンドルに含まれていない (project.yml の resources 設定を確認)")
        }
        return try Data(contentsOf: url)
    }

    // MARK: - TodayResponse

    func testDecodeTodayResponse() throws {
        let data = try loadFixture("today")
        let res = try makeDecoder().decode(TodayResponse.self, from: data)

        // §4.3: date は YYYY-MM-DD 文字列のまま保持
        XCTAssertEqual(res.date, "2026-06-08")
        XCTAssertEqual(res.occurrences.count, 2)

        let occ1 = res.occurrences[0]
        XCTAssertEqual(occ1.id, "occ_01")
        XCTAssertEqual(occ1.courseName, "情報デザイン")
        XCTAssertEqual(occ1.teacher, "佐藤先生")
        XCTAssertEqual(occ1.room, "A-201")
        XCTAssertEqual(occ1.startMinute, 540)
        XCTAssertEqual(occ1.endMinute, 630)
        // §4.2: enum はミラー専用、PRESENT を正しくデコード
        XCTAssertEqual(occ1.status, .present)
    }

    // §4.2: null / optional の畳み込み (teacher: null, status: null)
    func testDecodeTodayResponseNullFields() throws {
        let data = try loadFixture("today")
        let res = try makeDecoder().decode(TodayResponse.self, from: data)

        let occ2 = res.occurrences[1]
        XCTAssertEqual(occ2.id, "occ_02")
        XCTAssertNil(occ2.teacher, "teacher: null は Optional の nil に畳まれる")
        XCTAssertNil(occ2.status, "status: null は Optional の nil に畳まれる")
        XCTAssertEqual(occ2.room, "B-102")
    }

    // MARK: - UserTimetableDto

    func testDecodeUserTimetable() throws {
        let data = try loadFixture("userTimetable")
        let dto = try makeDecoder().decode(UserTimetableDto.self, from: data)

        XCTAssertEqual(dto.id, "timetable_01")
        XCTAssertEqual(dto.semesterId, "sem_2026_spring")
        XCTAssertEqual(dto.daysOfWeek, [1, 2, 3, 4, 5])
        XCTAssertEqual(dto.daySlots.count, 4)
        XCTAssertEqual(dto.courses.count, 2)
        XCTAssertEqual(dto.meetings.count, 2)

        // daySlot
        let lunch = dto.daySlots[2]
        XCTAssertEqual(lunch.label, "昼")
        XCTAssertTrue(lunch.isBreak)

        // course: teacher null + note null/値
        XCTAssertNil(dto.courses[1].teacher)
        XCTAssertEqual(dto.courses[1].note, "小テストあり")
        XCTAssertNil(dto.courses[0].note)

        // meeting: 連続コマ periodCount
        XCTAssertEqual(dto.meetings[1].periodCount, 2)
        XCTAssertEqual(dto.meetings[1].dayOfWeek, 3)

        // §4.3: createdAt は ISO 文字列のまま String 保持
        XCTAssertEqual(dto.createdAt, "2026-04-01T00:00:00.000Z")

        // sourceTemplateId: null
        XCTAssertNil(dto.sourceTemplateId)
    }

    // MARK: - SemesterOverviewDto

    func testDecodeSemesterOverview() throws {
        let data = try loadFixture("semesterOverview")
        let dto = try makeDecoder().decode(SemesterOverviewDto.self, from: data)

        XCTAssertEqual(dto.semesterId, "sem_2026_spring")
        XCTAssertEqual(dto.today, "2026-06-04")
        XCTAssertEqual(dto.requiredAttendanceRate, 80)
        XCTAssertEqual(try XCTUnwrap(dto.overall.attendanceRate), 0.9, accuracy: 0.0001)
        XCTAssertEqual(dto.overall.effectiveNumerator, 18, accuracy: 0.0001)
        XCTAssertEqual(dto.overall.effectiveDenominator, 20, accuracy: 0.0001)
        XCTAssertEqual(try XCTUnwrap(dto.overall.toDate.attendanceRate), 0.8947368421, accuracy: 0.0001)
        XCTAssertEqual(dto.overall.toDate.effectiveNumerator, 17, accuracy: 0.0001)
        XCTAssertEqual(dto.overall.toDate.effectiveDenominator, 19, accuracy: 0.0001)
        XCTAssertEqual(dto.overall.unrecordedCount, 1)
        XCTAssertEqual(dto.overall.remainingCount, 10)
        XCTAssertEqual(try XCTUnwrap(dto.overall.allowedAbsences), 4)

        XCTAssertEqual(dto.days.count, 5)
        // days[].status は enum (AttendanceDayStatus) にミラーされている。rawValue で検証。
        XCTAssertEqual(dto.days[1].status.rawValue, "NO_CLASS")
        XCTAssertEqual(dto.days[1].occurrenceCount, 0)
        // T1: days[].counts (日単位の内訳) が fixture 経由で decode できる
        XCTAssertEqual(try XCTUnwrap(dto.days[0].counts).present, 2)
        XCTAssertEqual(try XCTUnwrap(dto.days[3].counts).unrecorded, 2)
        XCTAssertEqual(try XCTUnwrap(dto.days[4].counts).absent, 1)
        for day in dto.days {
            let counts = try XCTUnwrap(day.counts)
            let total = counts.present + counts.absent + counts.excused + counts.tardy
                + counts.earlyLeave + counts.suspended + counts.unrecorded
            XCTAssertEqual(total, day.occurrenceCount)
        }

        // T2: counts を持たない旧 API の JSON も decode できる (Optional の担保)
        let legacyDay = """
        { "date": "2026-06-06", "status": "ALL_PRESENT", "occurrenceCount": 1 }
        """.data(using: .utf8)!
        let decodedLegacy = try makeDecoder().decode(AttendanceDaySummary.self, from: legacyDay)
        XCTAssertNil(decodedLegacy.counts)

        XCTAssertEqual(dto.courses.count, 2)
        let c1 = dto.courses[0]
        XCTAssertEqual(c1.courseId, "course_01")
        XCTAssertEqual(try XCTUnwrap(c1.attendanceRate), 0.95, accuracy: 0.0001)
        XCTAssertEqual(c1.counts.present, 9)
        XCTAssertEqual(c1.counts.tardy, 1)
        XCTAssertEqual(try XCTUnwrap(c1.toDate.attendanceRate), 0.95, accuracy: 0.0001)
        XCTAssertEqual(c1.toDate.effectiveNumerator, 9.5, accuracy: 0.0001)
        XCTAssertEqual(c1.toDate.effectiveDenominator, 10, accuracy: 0.0001)
        XCTAssertEqual(c1.remainingCount, 5)
        XCTAssertEqual(try XCTUnwrap(c1.allowedAbsences), 2)
        XCTAssertEqual(c1.maxDayPeriods, 1)
        XCTAssertEqual(try XCTUnwrap(c1.allowedAbsenceDays), 2)

        // teacher null の course
        XCTAssertNil(dto.courses[1].teacher)
        XCTAssertNil(dto.courses[1].allowedAbsences)
        XCTAssertNil(dto.courses[1].allowedAbsenceDays)
        XCTAssertNil(dto.courses[1].toDate.attendanceRate)
        XCTAssertEqual(dto.courses[1].maxDayPeriods, 0)
        XCTAssertEqual(dto.courses[1].remainingCount, 0)

        // totalSessions キー無しでも SemesterOverviewDto の decode が成功することを担保する。
    }

    // MARK: - MeResponse / SetupStatus

    func testDecodeMeResponse() throws {
        let data = try loadFixture("me")
        let res = try makeDecoder().decode(MeResponse.self, from: data)

        XCTAssertEqual(res.user.id, "user_01")
        XCTAssertEqual(res.user.email, "touri@example.com")
        XCTAssertEqual(res.user.name, "Touri")
        XCTAssertNil(res.user.image, "image: null は Optional nil")
        XCTAssertEqual(res.user.defaultSemesterId, "sem_2026_spring")
        XCTAssertEqual(res.user.requiredAttendanceRate, 80)

        // §4.4: SetupStatus 5 フラグ
        XCTAssertTrue(res.setupStatus.hasSchool)
        XCTAssertTrue(res.setupStatus.hasDepartment)
        XCTAssertTrue(res.setupStatus.hasSemester)
        XCTAssertTrue(res.setupStatus.hasUserTimetable)
        XCTAssertTrue(res.setupStatus.isComplete)
    }

    // MARK: - AttendanceStatus enum マッピング (§4.2)

    func testAttendanceStatusRawValues() {
        XCTAssertEqual(AttendanceStatus(rawValue: "PRESENT"), .present)
        XCTAssertEqual(AttendanceStatus(rawValue: "ABSENT"), .absent)
        XCTAssertEqual(AttendanceStatus(rawValue: "EXCUSED"), .excused)
        XCTAssertEqual(AttendanceStatus(rawValue: "TARDY"), .tardy)
        XCTAssertEqual(AttendanceStatus(rawValue: "EARLY_LEAVE"), .earlyLeave)
        XCTAssertEqual(AttendanceStatus(rawValue: "CANCELLED"), .cancelled)
    }

    // §4.2: 未知値はデコード失敗にせず .unknown フォールバック
    func testAttendanceStatusUnknownFallback() throws {
        struct Wrapper: Decodable { let status: AttendanceStatus }
        let json = #"{ "status": "SOME_FUTURE_VALUE" }"#.data(using: .utf8)!
        let decoded = try makeDecoder().decode(Wrapper.self, from: json)
        XCTAssertEqual(decoded.status, .unknown,
                       "API 側 enum 追加で即クラッシュしないよう未知値は .unknown に畳む (§4.2)")
    }

    func testDecodeUserTimetableList() throws {
        let data = try loadFixture("userTimetables")
        let response = try makeDecoder().decode(UserTimetableListResponse.self, from: data)

        XCTAssertEqual(response.userTimetables.count, 1)
        XCTAssertEqual(response.userTimetables[0].id, "timetable_01")
        XCTAssertEqual(response.userTimetables[0].courses.count, 2)
    }

    // MARK: - Phase A DTO Decoding Coverage

    func testDecodeCourseStatsAndStatsResponsePhaseAFields() throws {
        let course = try makeDecoder().decode(CourseStatsDto.self, from: try loadFixture("courseStats"))

        XCTAssertEqual(course.courseId, "course_stats_01")
        XCTAssertEqual(course.generatedOccurrences, 18)
        XCTAssertEqual(course.counts.present, 12)
        XCTAssertEqual(course.counts.suspended, 1)
        XCTAssertEqual(course.effectiveNumerator, 13.5, accuracy: 0.0001)
        XCTAssertEqual(course.effectiveDenominator, 16, accuracy: 0.0001)
        XCTAssertEqual(try XCTUnwrap(course.attendanceRate), 0.84375, accuracy: 0.0001)
        XCTAssertEqual(course.separateCounts?["PRESENT"], 12)
        XCTAssertEqual(course.toDate.effectiveNumerator, 10.5, accuracy: 0.0001)
        XCTAssertEqual(course.toDate.effectiveDenominator, 13, accuracy: 0.0001)
        XCTAssertEqual(try XCTUnwrap(course.toDate.attendanceRate), 0.8076923077, accuracy: 0.0001)
        XCTAssertEqual(course.remainingCount, 7)
        XCTAssertNil(course.allowedAbsences)
        XCTAssertEqual(course.maxDayPeriods, 2)
        XCTAssertNil(course.allowedAbsenceDays)

        let response = try makeDecoder().decode(StatsResponse.self, from: try loadFixture("statsResponse"))
        XCTAssertEqual(response.semesterId, "sem_2026_spring")
        XCTAssertEqual(response.requiredAttendanceRate, 80)
        XCTAssertEqual(response.courses.count, 1)
        XCTAssertEqual(response.courses[0].courseId, "course_stats_01")
    }

    func testDecodeOccurrenceNullsKnownAndUnknownStatus() throws {
        let nullStatus = try makeDecoder().decode(OccurrenceDto.self, from: Data("""
        {
          "id": "occ_null",
          "meetingId": "meeting_01",
          "courseId": "course_01",
          "courseName": "情報デザイン",
          "teacher": null,
          "room": null,
          "color": null,
          "date": "2026-06-08",
          "periodIndex": 1,
          "periodOffset": 0,
          "startMinute": 540,
          "endMinute": 630,
          "status": null
        }
        """.utf8))
        XCTAssertNil(nullStatus.teacher)
        XCTAssertNil(nullStatus.room)
        XCTAssertNil(nullStatus.color)
        XCTAssertNil(nullStatus.status)

        let present = try makeDecoder().decode(OccurrenceDto.self, from: Data("""
        {
          "id": "occ_present",
          "meetingId": "meeting_01",
          "courseId": "course_01",
          "courseName": "情報デザイン",
          "teacher": "佐藤先生",
          "room": "A-201",
          "color": "#f97316",
          "date": "2026-06-08",
          "periodIndex": 1,
          "periodOffset": 0,
          "startMinute": 540,
          "endMinute": 630,
          "status": "PRESENT"
        }
        """.utf8))
        XCTAssertEqual(present.status, .present)

        let unknown = try makeDecoder().decode(OccurrenceDto.self, from: Data("""
        {
          "id": "occ_unknown",
          "meetingId": "meeting_01",
          "courseId": "course_01",
          "courseName": "情報デザイン",
          "teacher": null,
          "room": null,
          "color": null,
          "date": "2026-06-08",
          "periodIndex": 1,
          "periodOffset": 0,
          "startMinute": 540,
          "endMinute": 630,
          "status": "FOO"
        }
        """.utf8))
        XCTAssertEqual(unknown.status, .unknown)
    }

    func testDecodeDayDetailEmptyAndPopulated() throws {
        let empty = try makeDecoder().decode(DayDetailDto.self, from: try loadFixture("dayDetailEmpty"))
        XCTAssertEqual(empty.date, "2026-06-09")
        XCTAssertTrue(empty.occurrences.isEmpty)
        XCTAssertTrue(empty.courseSuspensions.isEmpty)
        XCTAssertNil(empty.timetableSuspension)
        XCTAssertTrue(empty.personalEvents.isEmpty)

        let populated = try makeDecoder().decode(DayDetailDto.self, from: try loadFixture("dayDetail"))
        XCTAssertEqual(populated.date, "2026-06-08")
        XCTAssertEqual(populated.occurrences.count, 1)
        XCTAssertEqual(populated.courseSuspensions.count, 1)
        XCTAssertNotNil(populated.timetableSuspension)
        XCTAssertEqual(populated.personalEvents.count, 1)
    }

    func testDecodePersonalEventOccurrenceAllDay() throws {
        let event = try makeDecoder().decode(PersonalEventOccurrenceDto.self, from: try loadFixture("personalEvent"))
        XCTAssertEqual(event.seriesId, "personal_01")
        XCTAssertEqual(event.id, "personal_01:2026-06-07T15:00:00.000Z")
        XCTAssertTrue(event.isAllDay)
        XCTAssertEqual(event.days.count, 1)
        XCTAssertEqual(event.days[0].date, "2026-06-08")
        XCTAssertEqual(event.days[0].startMinute, 0)
        XCTAssertEqual(event.days[0].endMinute, 1440)
    }

    func testDecodeRoomSummaryAndRoomNulls() throws {
        let summary = try makeDecoder().decode(RoomSummaryDto.self, from: try loadFixture("roomSummary"))
        XCTAssertEqual(summary.id, "room_01")
        XCTAssertNil(summary.description)
        XCTAssertNil(summary.upcomingEvent)
        XCTAssertEqual(summary.myRole, .owner)

        let room = try makeDecoder().decode(RoomDto.self, from: try loadFixture("room"))
        XCTAssertEqual(room.id, "room_01")
        XCTAssertNil(room.description)
        XCTAssertNil(room.upcomingEvent)
        XCTAssertEqual(room.inviteCode, "ROOMCODE")
        XCTAssertNil(room.inviteExpiresAt)
    }

    func testDecodeRoomWeekIntegerMinutesAsDouble() throws {
        let week = try makeDecoder().decode(RoomWeekDto.self, from: try loadFixture("roomWeek"))
        XCTAssertEqual(week.weekStart, "2026-06-08")
        XCTAssertEqual(week.members.count, 1)
        XCTAssertEqual(week.meetings.count, 1)
        XCTAssertEqual(week.meetings[0].startMinute, 540, accuracy: 0.0001)
        XCTAssertEqual(week.meetings[0].endMinute, 630, accuracy: 0.0001)
        XCTAssertEqual(week.roomEvents.count, 1)
        XCTAssertEqual(week.roomEvents[0].source, .manual)
        XCTAssertEqual(week.roomEvents[0].visibilityMode, .normal)
    }

    func testDecodeFriendshipStatusesAndUnknownFallback() throws {
        let friendship = try makeDecoder().decode(FriendshipDto.self, from: try loadFixture("friendship"))
        XCTAssertEqual(friendship.id, "friendship_01")
        XCTAssertEqual(friendship.status, .pending)
        XCTAssertNil(friendship.acceptedAt)
        XCTAssertNil(friendship.sender.name)

        for (raw, expected) in [
            ("PENDING", FriendshipStatus.pending),
            ("ACCEPTED", .accepted),
            ("DECLINED", .declined),
            ("BLOCKED", .blocked),
            ("UNKNOWN_XXX", .unknown),
        ] {
            struct Wrapper: Decodable { let x: FriendshipStatus }
            let decoded = try makeDecoder().decode(Wrapper.self, from: Data(#"{ "x": "\#(raw)" }"#.utf8))
            XCTAssertEqual(decoded.x, expected)
        }
    }

    func testDecodeRepresentativePhaseADtos() throws {
        let courseSuspension = try makeDecoder().decode(CourseSuspensionDto.self, from: try loadFixture("courseSuspension"))
        XCTAssertEqual(courseSuspension.id, "course_susp_01")
        XCTAssertNil(courseSuspension.reason)

        let timetableSuspension = try makeDecoder().decode(TimetableSuspensionDto.self, from: try loadFixture("timetableSuspension"))
        XCTAssertEqual(timetableSuspension.id, "tt_susp_01")
        XCTAssertEqual(timetableSuspension.reason, "創立記念日")

        let template = try makeDecoder().decode(TemplateDto.self, from: try loadFixture("template"))
        XCTAssertEqual(template.id, "template_01")
        XCTAssertNil(template.description)
        XCTAssertNil(template.year)
        XCTAssertEqual(template.daySlots.count, 2)
        XCTAssertEqual(template.courses.count, 1)
        XCTAssertEqual(template.meetings.count, 1)

        let school = try makeDecoder().decode(SchoolDto.self, from: try loadFixture("school"))
        XCTAssertEqual(school.id, "school_01")
        XCTAssertNil(school.mextCode)
        XCTAssertEqual(school.kind, .university)

        let department = try makeDecoder().decode(DepartmentDto.self, from: try loadFixture("department"))
        XCTAssertEqual(department.id, "department_01")
        XCTAssertNil(department.nameKana)

        let rule = try makeDecoder().decode(AttendanceRuleDto.self, from: try loadFixture("attendanceRule"))
        XCTAssertEqual(rule.id, "rule_01")
        XCTAssertNil(rule.userId)
        XCTAssertEqual(rule.excusedStrategy, .countAsPresent)

        let effective = try makeDecoder().decode(EffectiveRuleResponse.self, from: try loadFixture("effectiveRule"))
        XCTAssertNil(effective.userOverride)
        XCTAssertEqual(effective.effective.tardyStrategy, .halfPresent)
    }

    func testDecodePhaseAEnumsUnknownFallback() throws {
        func decode<T: Decodable>(_ type: T.Type, raw: String) throws -> T {
            try makeDecoder().decode(EnumDecodingWrapper<T>.self, from: Data(#"{ "x": "\#(raw)" }"#.utf8)).x
        }

        XCTAssertEqual(try decode(RoomRole.self, raw: "OWNER"), .owner)
        XCTAssertEqual(try decode(RoomRole.self, raw: "UNKNOWN_XXX"), .unknown)
        XCTAssertEqual(try decode(RuleStrategy.self, raw: "COUNT_AS_PRESENT"), .countAsPresent)
        XCTAssertEqual(try decode(RuleStrategy.self, raw: "UNKNOWN_XXX"), .unknown)
        XCTAssertEqual(try decode(SchoolKind.self, raw: "UNIVERSITY"), .university)
        XCTAssertEqual(try decode(SchoolKind.self, raw: "UNKNOWN_XXX"), .unknown)
        XCTAssertEqual(try decode(VisibilityMode.self, raw: "BUSY_ONLY"), .busyOnly)
        XCTAssertEqual(try decode(VisibilityMode.self, raw: "UNKNOWN_XXX"), .unknown)
        // GoogleSyncStatus は F5 (gcal 掃除) で削除済 — 対応 assert を撤去 (Reviewer)
        XCTAssertEqual(try decode(IcsImportStatus.self, raw: "PARTIAL_ERROR"), .partialError)
        XCTAssertEqual(try decode(IcsImportStatus.self, raw: "UNKNOWN_XXX"), .unknown)
        XCTAssertEqual(try decode(RoomEventSource.self, raw: "ICS_URL"), .icsUrl)
        XCTAssertEqual(try decode(RoomEventSource.self, raw: "UNKNOWN_XXX"), .unknown)
    }

    func testDecodeRequiredFieldMissingThrowsAndErrorResponse() throws {
        XCTAssertThrowsError(try makeDecoder().decode(OccurrenceDto.self, from: Data("""
        {
          "meetingId": "meeting_01",
          "courseId": "course_01",
          "courseName": "情報デザイン",
          "teacher": null,
          "room": null,
          "color": null,
          "date": "2026-06-08",
          "periodIndex": 1,
          "periodOffset": 0,
          "startMinute": 540,
          "endMinute": 630,
          "status": null
        }
        """.utf8)))

        let error = try makeDecoder().decode(ErrorResponse.self, from: try loadFixture("errorResponse"))
        XCTAssertEqual(error.error.code, "BAD_REQUEST")
        XCTAssertEqual(error.error.message, "入力内容を確認してください")
    }
}
