import XCTest
@testable import Atender

// Reviewer 生成: 設計doc §4 (DTO/Enums) + Fixtures/*.json を根拠にデコード検証。
// 実装コードは未読。型名・フィールドは設計 §4 と Fixtures JSON を正典とする。

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
}
